import { describe, expect, it } from "vitest";
import { type DailyResult, dailyStats } from "./history.ts";

const r = (number: number, found: boolean): [string, DailyResult] => [
  `d${number}`,
  {
    date: `d${number}`,
    number,
    found,
    elapsedSeconds: 0,
    questions: 0,
    scoreSeconds: 0,
    share: "",
  },
];

describe("dailyStats", () => {
  it("counts played, found and the current streak of consecutive finds", () => {
    const results = Object.fromEntries([r(1, true), r(2, false), r(3, true), r(4, true)]);
    expect(dailyStats(results)).toEqual({ played: 4, found: 3, streak: 2 });
  });

  it("breaks the streak on a skipped day", () => {
    const results = Object.fromEntries([r(1, true), r(2, true), r(4, true)]);
    expect(dailyStats(results).streak).toBe(1);
  });

  it("is zero when nothing's been played", () => {
    expect(dailyStats({})).toEqual({ played: 0, found: 0, streak: 0 });
  });
});
