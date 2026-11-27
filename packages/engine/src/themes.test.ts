import type { Dataset } from "@subway-seek/data";
import { loadDataset } from "@subway-seek/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import { dailyNumber, dailyRandom } from "./daily.ts";
import { HUB_STATION_IDS, OUTER_HUB_STATION_IDS, pickHubId } from "./hubs.ts";
import { createSoloRound } from "./solo.ts";
import { createDailyRound, dailyTheme, OUTER_BOROUGHS_FROM } from "./themes.ts";
import { buildIndex, type TimetableIndex } from "./timetable.ts";

let ds: Dataset;
let idx: TimetableIndex;
beforeAll(() => {
  ds = loadDataset();
  idx = buildIndex(ds);
});

const SECRET = "test-secret";
const TEN = 10 * 3600;

describe("themed days", () => {
  it("are Saturdays from the start date, and nothing else", () => {
    expect(new Date(`${OUTER_BOROUGHS_FROM}T12:00:00Z`).getUTCDay()).toBe(6);
    expect(dailyTheme(OUTER_BOROUGHS_FROM)).toBe("outerBoroughs");
    expect(dailyTheme("2026-12-12")).toBe("outerBoroughs");
    expect(dailyTheme("2026-11-28")).toBeNull(); // a Saturday before the start
    expect(dailyTheme("2026-12-04")).toBeNull(); // Friday
    expect(dailyTheme("2026-12-06")).toBeNull(); // Sunday
  });

  it("leave an ordinary day's daily exactly as it was drawn before themes", () => {
    for (const date of ["2026-11-27", "2026-12-04", "2026-12-07", "2026-11-28"]) {
      // The construction the server used before createDailyRound.
      const hubId = pickHubId(dailyRandom(`${date}|hub`, SECRET));
      const before = createSoloRound(idx, {
        hub: ds.stations.findIndex((s) => s.id === hubId),
        hideStart: TEN,
        random: dailyRandom(date, SECRET),
        daily: { date, number: dailyNumber(date) },
      });
      const now = createDailyRound(idx, date, SECRET, TEN);
      expect(now.hub).toBe(before.hub);
      expect(now.hider).toBe(before.hider);
      expect(now.reachable).toEqual(before.reachable);
      expect(now.daily).toEqual(before.daily);
      expect(now.deck).toEqual(before.deck);
    }
  });

  it("start an Outer boroughs Saturday outside Manhattan and keep its hider and search there", () => {
    for (const date of ["2026-12-05", "2026-12-12", "2026-12-19", "2026-12-26"]) {
      const r = createDailyRound(idx, date, SECRET, TEN);
      expect(r.daily?.theme).toBe("outerBoroughs");
      expect(OUTER_HUB_STATION_IDS).toContain(ds.stations[r.hub]?.id);
      expect(ds.complexes[r.hider]?.borough).not.toBe("M");
      expect(r.reachable.length).toBeGreaterThan(5);
      expect(r.reachable.every((c) => ds.complexes[c]?.borough !== "M")).toBe(true);
      expect(r.reachable).toContain(r.hider);
      // Same day, same secret: the same round for everyone.
      expect(createDailyRound(idx, date, SECRET, TEN).hider).toBe(r.hider);
    }
  });

  it("names four outer hubs, all on the main hub list and none in Manhattan", () => {
    expect(OUTER_HUB_STATION_IDS).toHaveLength(4);
    for (const id of OUTER_HUB_STATION_IDS) {
      expect(HUB_STATION_IDS).toContain(id);
      expect(ds.stations.find((s) => s.id === id)?.borough).not.toBe("M");
    }
    // 161 St–Yankee Stadium is outside Manhattan but left out: its themed band is too thin.
    expect(OUTER_HUB_STATION_IDS).not.toContain("414");
  });
});
