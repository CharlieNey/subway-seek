/**
 * A client can't take the server down by breaking the protocol: an oversized message or a
 * malformed frame closes that connection, and everyone else's rounds carry on. A page on
 * another site can't open rounds, and a flood of messages closes its connection.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request } from "node:http";
import { connect as tcp } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLOSE_TOO_MANY_MESSAGES, clientProtocols } from "@stand-clear/engine";
import { expect, it } from "vitest";
import WebSocket from "ws";

function health(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path: "/health" }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    })
      .on("error", reject)
      .end();
  });
}

it("survives an oversized message, a malformed frame, a foreign page and a flood", async () => {
  const dir = mkdtempSync(join(tmpdir(), "stand-clear-socket-"));
  const listener = createServer().listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  let child: ChildProcess | undefined;
  try {
    child = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        SESSION_DB: join(dir, "sessions.sqlite"),
        MATCH_LOG_DIR: dir,
        GOOGLE_STREETVIEW_SERVER_KEY: "",
        GOOGLE_MAPS_BROWSER_KEY: "",
        STREETVIEW_SIGNING_SECRET: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise<void>((resolve, reject) => {
      let output = "";
      child?.stdout?.on("data", (b) => {
        output += String(b);
        if (output.includes("listening on")) resolve();
      });
      child?.once("exit", (code) => reject(new Error(`server exited ${code}: ${output}`)));
    });

    // Too big: closed with 1009 (message too big).
    const big = new WebSocket(`ws://127.0.0.1:${port}/?mode=practice`);
    await once(big, "message");
    big.send(JSON.stringify({ type: "intent", seq: 0, pad: "x".repeat(64 * 1024) }));
    const [code] = await once(big, "close");
    expect(code).toBe(1009);

    // Malformed: a WebSocket upgrade, then an unmasked frame with a reserved opcode.
    const raw = tcp(port, "127.0.0.1");
    await once(raw, "connect");
    raw.write(
      "GET /?mode=practice HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\n" +
        "Connection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
        "Sec-WebSocket-Version: 13\r\n\r\n",
    );
    await once(raw, "data");
    raw.write(Buffer.from([0x83, 0x00]));
    await once(raw, "close");

    // Another site's page: refused at the handshake. A local page is let in (no ALLOWED_ORIGINS).
    const foreign = new WebSocket(`ws://127.0.0.1:${port}/?mode=practice`, clientProtocols(null), {
      origin: "https://evil.example",
    });
    const [, refusal] = await once(foreign, "unexpected-response");
    expect((refusal as { statusCode: number }).statusCode).toBe(401);
    foreign.on("error", () => {});
    foreign.terminate();
    const local = new WebSocket(`ws://127.0.0.1:${port}/?mode=practice`, clientProtocols(null), {
      origin: "http://localhost:5173",
    });
    await once(local, "message");
    expect(local.protocol).toBe("game.v1");

    // A flood: closed with CLOSE_TOO_MANY_MESSAGES, before the server queues it all.
    for (let seq = 0; seq < 60; seq++)
      local.send(JSON.stringify({ type: "intent", seq, intent: { type: "giveUp" } }));
    const [floodCode] = await once(local, "close");
    expect(floodCode).toBe(CLOSE_TOO_MANY_MESSAGES);

    await new Promise((r) => setTimeout(r, 200));
    expect(child.exitCode).toBeNull();
    expect(await health(port)).toBe(200);
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);
