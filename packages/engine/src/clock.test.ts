import { describe, expect, it } from "vitest";
import { gameTime, pauseClock, realMsUntil, resumeClock, startClock } from "./clock.ts";

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
