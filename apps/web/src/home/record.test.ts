import { describe, expect, it } from "vitest";
import { GAME_NAME } from "../brand.ts";
import type { DailyResult } from "../history.ts";
import {
  familiesOf,
  friendLine,
  heroState,
  hoursMinutes,
  minutesToNextDaily,
  monthTiles,
  recordStats,
} from "./record.ts";

const result = (date: string, number: number, found: boolean, min: number): DailyResult => ({
  date,
  number,
  found,
  elapsedSeconds: min * 60,
  questions: 3,
  scoreSeconds: min * 60 + 600,
  share: `${GAME_NAME} #1\nFound it in 41 min · 3 questions\n📡🗽📏\nHider score: 51 min`,
});

describe("the record", () => {
  const results = {
    "2026-10-05": result("2026-10-05", 1, true, 52),
    "2026-10-06": result("2026-10-06", 2, true, 38),
    "2026-10-08": result("2026-10-08", 4, false, 120),
  };

  it("lays the month out Monday first, with each day's tile", () => {
    const tiles = monthTiles(results, "2026-10-09");
    // October 1, 2026 is a Thursday: three blanks before it.
    expect(tiles.slice(0, 3).every((t) => t.day === null)).toBe(true);
    expect(tiles[3]).toMatchObject({ day: 1, kind: "pre" });
    const by = (d: number) => tiles.find((t) => t.day === d);
    expect(by(5)).toMatchObject({ kind: "found", minutes: 52 });
    expect(by(6)).toMatchObject({ kind: "fast", minutes: 38 });
    expect(by(7)).toMatchObject({ kind: "skip" });
    expect(by(8)).toMatchObject({ kind: "miss" });
    expect(by(9)).toMatchObject({ kind: "skip", today: true });
    expect(by(10)).toMatchObject({ kind: "future" });
    expect(tiles.length % 7).toBe(0);
  });

  it("counts played, found, the streak and the fastest find", () => {
    expect(recordStats(results)).toEqual({ played: 3, found: 2, streak: 0, fastest: 38 * 60 });
    const two = { "2026-10-05": results["2026-10-05"], "2026-10-06": results["2026-10-06"] };
    expect(recordStats(two as Record<string, DailyResult>).streak).toBe(2);
    expect(recordStats({}).fastest).toBeNull();
  });

  it("reads the question trail back from an old share line", () => {
    expect(familiesOf(result("2026-10-05", 1, true, 41))).toEqual(["radar", "match", "measure"]);
    expect(familiesOf({ ...result("2026-10-05", 1, true, 41), families: ["tent"] })).toEqual([
      "tent",
    ]);
  });

  it("doesn't read the title's 🚇 as a question", () => {
    const share = `${GAME_NAME} #2 · from Jackson Hts-Roosevelt Av 🚇\nDidn't find it in 2 h 00 min · 3 questions\n🟰🎯🔥\nHider score: 2 h 30 min`;
    expect(familiesOf({ ...result("2026-10-06", 2, false, 120), share })).toEqual([
      "match",
      "radar",
      "thermo",
    ]);
  });
});

describe("the hero's door", () => {
  const today = { date: "2026-10-09", number: 5 };
  const live = { token: "x", live: true, mode: "daily" as const, daily: 5, at: 1000 };
  it("plays, resumes within the grace period, or says today's done", () => {
    expect(heroState({}, today, null, 0, 180_000)).toEqual({ kind: "play" });
    expect(heroState({}, today, live, 2000, 180_000)).toEqual({ kind: "resume" });
    expect(heroState({}, today, live, 999_999, 180_000)).toEqual({ kind: "play" });
    const done = { "2026-10-09": result("2026-10-09", 5, true, 41) };
    expect(heroState(done, today, live, 2000, 180_000).kind).toBe("done");
  });
});

describe("the clock and the share band", () => {
  it("counts down to midnight in New York", () => {
    // 2026-10-06 18:00 in New York (EDT, UTC−4) is 22:00 UTC.
    expect(minutesToNextDaily(new Date("2026-10-06T22:00:00Z"))).toBe(360);
    expect(hoursMinutes(859)).toBe("14 h 19 min");
  });

  it("only greets a share of today's daily", () => {
    expect(friendLine("?d=5&t=41", 5)).toBe("A friend found Daily #5 in 41 min. Your turn.");
    expect(friendLine("?d=4&t=41", 5)).toBeNull();
    expect(friendLine("", 5)).toBeNull();
  });
});
