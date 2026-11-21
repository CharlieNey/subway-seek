import { loadDataset } from "@subway-seek/data/node";
import { describe, expect, it } from "vitest";
import { dailyNumber, dailyRandom, hashString, nyDate, seededRandom } from "./daily.ts";
import { createSoloRound } from "./solo.ts";
import { buildIndex } from "./timetable.ts";

describe("daily challenge", () => {
  it("numbers days from the epoch", () => {
    expect(dailyNumber("2026-10-05")).toBe(1);
    expect(dailyNumber("2026-10-06")).toBe(2);
    expect(dailyNumber("2026-11-05")).toBe(32);
  });

  it("follows New York time, not UTC", () => {
    // 02:00 UTC on Oct 6 is still the evening of Oct 5 in New York.
    expect(nyDate(new Date("2026-10-06T02:00:00Z"))).toBe("2026-10-05");
    expect(nyDate(new Date("2026-10-06T12:00:00Z"))).toBe("2026-10-06");
  });

  it("is deterministic per seed", () => {
    const a = seededRandom(hashString("x"));
    const b = seededRandom(hashString("x"));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("gives everyone the same hider on a day, and a different one with a different secret", () => {
    const idx = buildIndex(loadDataset());
    const hub = idx.ds.stations.findIndex((s) => s.id === "127");
    const make = (date: string, secret: string) =>
      createSoloRound(idx, {
        hub,
        hideStart: 36_000,
        random: dailyRandom(date, secret),
        daily: { date, number: dailyNumber(date) },
      }).hider;
    expect(make("2026-10-05", "s1")).toBe(make("2026-10-05", "s1"));
    // Across a handful of days and secrets, the hider isn't stuck on one station.
    const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
    expect(new Set(days.map((d) => make(d, "s1"))).size).toBeGreaterThan(2);
    expect(
      new Set(["a", "b", "c", "d", "e"].map((s) => make("2026-10-05", s))).size,
    ).toBeGreaterThan(2);
  });
});
