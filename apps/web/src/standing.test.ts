import { loadDataset } from "@subway-seek/data/node";
import { describe, expect, it } from "vitest";
import type { DailyResult } from "./history.ts";
import data from "./home/hardness.json";
import { daysRunning, PERCENTILE_MIN, parFor, parLine, percentileOf } from "./standing.ts";

describe("par", () => {
  const ds = loadDataset();
  it("finds every station the hardest table lists, from its hub", () => {
    let checked = 0;
    for (const hub of data.hubs) {
      const st = ds.stations.findIndex((s) => s.id === hub.id);
      for (const s of hub.stations) {
        const c = ds.complexes.findIndex(
          (x) => x.name === s.name && x.routes.join(",") === s.routes.join(","),
        );
        expect(parFor(data, ds, st, c)).toBe(s.questions);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(900);
  });
  it("says nothing for a station off the table", () => {
    expect(parFor(data, ds, -1, 0)).toBeNull();
  });
  it("reads over, level and under", () => {
    expect(parLine(6, 9)).toBe("Par 6 · 3 over");
    expect(parLine(6, 6)).toBe("Par 6 · level");
    expect(parLine(6, 4)).toBe("Par 6 · 2 under");
    expect(parLine(6, 0, false)).toBe("Par 6");
  });
});

describe("the percentile", () => {
  /** n rounds at minutes 0..n-1, plus yours at `mine`. */
  const spread = (n: number, mine: number) => {
    const counts: number[] = [];
    const add = (m: number) => {
      while (counts.length <= m) counts.push(0);
      counts[m] = (counts[m] ?? 0) + 1;
    };
    for (let i = 0; i < n; i++) add(i * 5);
    add(mine);
    return { counts, n: n + 1 };
  };
  it(`waits for ${PERCENTILE_MIN} others`, () => {
    const few = spread(PERCENTILE_MIN - 1, 40);
    expect(percentileOf(few.counts, few.n, 40)).toBeNull();
    const enough = spread(PERCENTILE_MIN, 40);
    expect(percentileOf(enough.counts, enough.n, 40)?.others).toBe(PERCENTILE_MIN);
  });
  it("counts the rounds that scored worse than yours", () => {
    // Others at 0, 5, …, 95; yours at 42: the 11 from 45 up are worse.
    const { counts, n } = spread(20, 42);
    expect(percentileOf(counts, n, 42)).toEqual({ beat: 55, others: 20 });
  });
  it("beats nobody at the bottom and everybody at the top", () => {
    const top = spread(20, 0);
    expect(percentileOf(top.counts, top.n, 0)?.beat).toBe(95);
    const bottom = spread(20, 300);
    expect(percentileOf(bottom.counts, bottom.n, 300)?.beat).toBe(0);
  });
});

describe("days running", () => {
  const r = (number: number, found = true) =>
    ({
      number,
      found,
      date: "",
      elapsedSeconds: 0,
      questions: 0,
      scoreSeconds: 0,
      share: "",
    }) as DailyResult;
  const of = (...rs: DailyResult[]) => Object.fromEntries(rs.map((x) => [String(x.number), x]));
  it("counts days in a row ending at the latest, found or not", () => {
    expect(daysRunning(of(r(50), r(51, false), r(52), r(53)))).toBe(4);
    expect(daysRunning(of(r(50), r(52), r(53)))).toBe(2);
    expect(daysRunning({})).toBe(0);
  });
  it("ends once a day is missed: yesterday still counts, the day before doesn't", () => {
    const rs = of(r(50), r(51), r(52));
    expect(daysRunning(rs, 52)).toBe(3);
    expect(daysRunning(rs, 53)).toBe(3);
    expect(daysRunning(rs, 54)).toBe(0);
  });
});
