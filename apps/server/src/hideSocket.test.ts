import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDataset } from "@stand-clear/data/node";
import {
  buildIndex,
  type ClientIntent,
  clientProtocols,
  departures,
  type HiderView,
  type ServerMessage,
} from "@stand-clear/engine";
import { expect, it } from "vitest";
import { WebSocket } from "ws";

it("plays a hide through the socket, deduplicates intents and restores its role, clock and seq", async () => {
  const dir = mkdtempSync(join(tmpdir(), "stand-clear-hide-socket-"));
  const listener = createServer().listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  let child: ChildProcess | undefined;
  let socket: WebSocket | undefined;
  async function boot() {
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
  }
  async function connect(query: string, token: string | null = null) {
    // The token goes in the subprotocol header, never the URL (protocol.ts).
    socket = new WebSocket(`ws://127.0.0.1:${port}/?${query}`, clientProtocols(token));
    return JSON.parse(String((await once(socket, "message"))[0])) as Extract<
      ServerMessage,
      { type: "hello" }
    >;
  }
  async function send(seq: number, intent: ClientIntent) {
    const s = socket as WebSocket;
    const response = new Promise<ServerMessage>((resolve) => {
      const onMessage = (raw: unknown) => {
        const m = JSON.parse(String(raw)) as ServerMessage;
        if (m.seq === seq) {
          s.off("message", onMessage);
          resolve(m);
        }
      };
      s.on("message", onMessage);
    });
    s.send(JSON.stringify({ type: "intent", seq, intent }));
    return response;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  try {
    await boot();
    const hello = await connect("mode=hide&difficulty=hard");
    const view = hello.view as HiderView;
    expect(view.role).toBe("hider");
    expect(view.roundId).toMatch(/^[0-9a-f-]{36}$/);
    expect(view.difficulty).toBe("hard");
    expect(JSON.stringify(view)).not.toMatch(/beliefs|waitUntil|pending/);
    const paused = await send(0, { type: "pause" });
    expect(paused.clock.paused).toBe(true);
    expect((await send(0, { type: "resume" })).clock.gameTime).toEqual(paused.clock.gameTime);
    await send(1, { type: "resume" });
    expect((await send(2, { type: "ask", question: { kind: "radar", miles: 1 } })).type).toBe(
      "rejected",
    );
    const ds = loadDataset(),
      idx = buildIndex(ds);
    const train = departures(idx, view.hub, hello.clock.gameTime + 30)[0];
    if (!train) throw new Error("No departure");
    expect((await send(3, { type: "board", trip: train.trip, stop: train.stop })).type).toBe(
      "state",
    );
    const skipped = await send(4, { type: "skip", to: "end" });
    expect(skipped.clock.gameTime).toBeLessThanOrEqual(view.seekStart);
    // No Street View key here: a street step says so instead of "try again".
    const exit = await send(5, { type: "exit", exit: 0 });
    expect(exit.type === "rejected" && exit.error).toMatch(/no Street View key/);
    const last = await send(6, { type: "pause" });
    socket?.close();
    await stop();
    await boot();
    const back = await connect("", hello.session);
    expect(socket?.protocol).toBe("game.v1");
    expect(back.resumed).toBe(true);
    expect(back.seq).toBe(6);
    expect((back.view as HiderView).roundId).toBe(view.roundId);
    expect(back.clock.gameTime).toBe(last.clock.gameTime);
    expect((back.view as HiderView).self).toEqual((last.view as HiderView).self);
    const left = await send(7, { type: "leaveHide" });
    expect((left.view as HiderView).incomplete).toBe("left");
    expect((left.view as HiderView).scoreSeconds).toBeNull();
    const again = await send(8, { type: "newRound", mode: "hide", difficulty: "easy" });
    expect((again.view as HiderView).roundId).not.toBe(view.roundId);
    expect((again.view as HiderView).difficulty).toBe("easy");
  } finally {
    socket?.close();
    await stop();
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);
