import { describe, expect, it } from "vitest";
import { gameTime, jumpClock, pauseClock, realMsUntil, resumeClock, startClock } from "./clock.ts";
import { receivedSync, syncedGameTime } from "./protocol.ts";

const TEN_AM = 10 * 3600;

describe("game clock", () => {
  it("runs at 6× real time", () => {
    const c = startClock(TEN_AM, 6, 1_000);
    expect(gameTime(c, 1_000)).toBe(TEN_AM);
    expect(gameTime(c, 11_000)).toBe(TEN_AM + 60); // 10 real s = 1 game min
  });

  it("freezes while paused and continues from the same game time", () => {
    let c = startClock(TEN_AM, 6, 0);
    c = pauseClock(c, 10_000); // paused at 10:01:00
    expect(gameTime(c, 500_000)).toBe(TEN_AM + 60);
    c = resumeClock(c, 500_000);
    expect(gameTime(c, 510_000)).toBe(TEN_AM + 120);
  });

  it("pause and resume are idempotent", () => {
    const c = pauseClock(startClock(TEN_AM, 6, 0), 1_000);
    expect(pauseClock(c, 9_000)).toBe(c);
    const r = resumeClock(c, 2_000);
    expect(resumeClock(r, 3_000)).toBe(r);
  });

  it("computes real time until a game time", () => {
    const c = startClock(TEN_AM, 6, 0);
    expect(realMsUntil(c, TEN_AM + 60, 0)).toBe(10_000);
    expect(realMsUntil(c, TEN_AM, 5_000)).toBe(0);
    expect(realMsUntil(pauseClock(c, 0), TEN_AM + 60, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("rejects a non-positive speed", () => {
    expect(() => startClock(TEN_AM, 0, 0)).toThrow();
  });
});

describe("fast-forward", () => {
  it("jumps forward and keeps running from there", () => {
    const c = jumpClock(startClock(TEN_AM, 6, 0), TEN_AM + 600, 1_000);
    expect(gameTime(c, 1_000)).toBe(TEN_AM + 600);
    expect(gameTime(c, 11_000)).toBe(TEN_AM + 660);
  });

  it("never goes back", () => {
    const c = startClock(TEN_AM, 6, 0);
    expect(gameTime(jumpClock(c, TEN_AM - 100, 10_000), 10_000)).toBe(TEN_AM + 60);
  });
});

describe("the client's copy of the clock", () => {
  it("keeps time with the server even when the computer's clock is off", () => {
    // The server sends 10:00 at its 1_000 ms; this computer reads 301_000 ms (5 min fast).
    const sent = { gameTime: TEN_AM, speed: 6, serverNow: 1_000, paused: false };
    const fast = 300_000;
    // Read against the server's timestamp, the game would be 30 game-min ahead.
    expect(syncedGameTime(sent, 1_000 + fast) - TEN_AM).toBe(1800);
    const local = receivedSync(sent, 1_000 + fast);
    expect(syncedGameTime(local, 1_000 + fast)).toBe(TEN_AM);
    expect(syncedGameTime(local, 11_000 + fast)).toBe(TEN_AM + 60);
  });
});
