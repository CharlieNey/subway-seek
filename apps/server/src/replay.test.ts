/** Yesterday's daily, played by the bot, served for anyone to watch (phones included). */
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SoloView } from "@stand-clear/engine";
import { expect, it } from "vitest";

function getJson(port: number, path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    get({ host: "127.0.0.1", port, path }, (res) => {
      let data = "";
      res.on("data", (c) => {
        data += String(c);
      });
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null }),
      );
    }).on("error", reject);
  });
}

it("serves yesterday's daily as the bot played it, at the station only", async () => {
  const dir = mkdtempSync(join(tmpdir(), "stand-clear-replay-"));
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
    const daily = (await getJson(port, "/daily")).body as {
      yesterday: { date: string; number: number; hider: number } | null;
    };
    const replay = await getJson(port, "/replay/yesterday");
    if (!daily.yesterday) {
      expect(replay.status).toBe(404);
      return;
    }
    expect(replay.status).toBe(200);
    const { date, number, view } = replay.body as { date: string; number: number; view: SoloView };
    expect(date).toBe(daily.yesterday.date);
    expect(number).toBe(daily.yesterday.number);
    // The same hidden station the homepage already names as yesterday's hider.
    expect(view.hider).toBe(daily.yesterday.hider);
    expect(view.result).not.toBeNull();
    expect(view.stationOnly).toBe(true);
    expect(view.hasSpot).toBe(false);
    expect(view.replay?.hider.length).toBeGreaterThan(0);
    expect(view.replay?.seeker.length).toBeGreaterThan(0);
    // No street positions: nothing from Google to keep.
    expect(JSON.stringify(view)).not.toMatch(/"pano"/);
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);
