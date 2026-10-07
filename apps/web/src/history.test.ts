import type { Dataset, LatLon } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import type { SoloView } from "@stand-clear/engine";
import { beforeAll, describe, expect, it } from "vitest";
import { type DailyResult, dailyStats, keptView } from "./history.ts";

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

describe("keptView", () => {
  let ds: Dataset;
  beforeAll(() => {
    ds = loadDataset();
  });

  it("keeps the trails' times and the station, but no coordinate from Google", () => {
    const complex = 0;
    const c = ds.complexes[complex];
    if (!c) throw new Error("complex");
    const exit = c.exits[0] ?? [c.lat, c.lon];
    // Google's places: a hiding spot and a panorama the seeker walked to.
    const spot = { lat: 40.123456, lon: -73.987654, pano: "spot-pano" };
    const pano = { lat: 40.654321, lon: -73.456789, pano: "walk-pano" };
    const walk = (start: number, from: LatLon, to: { lat: number; lon: number; pano: string }) => ({
      kind: "walking" as const,
      reason: "street" as const,
      start,
      end: start + 60,
      fromPoint: from,
      toPoint: [to.lat, to.lon] as LatLon,
      fromComplex: complex,
      dest: { kind: "street" as const, complex, exit: 0, at: to, since: start + 60 },
    });
    const view = {
      daily: { date: "2026-10-06", number: 2 },
      seeker: { kind: "street", complex, exit: 0, at: pano, since: 37_500 },
      asked: [
        {
          q: { kind: "spotRadar", meters: 100 },
          ctx: { origin: { lat: pano.lat, lon: pano.lon, complex }, baseline: null },
          answer: false,
          at: 37_400,
          answerAt: 37_400,
          remaining: null,
        },
        {
          q: { kind: "photo", from: "exit", look: "N" },
          ctx: { origin: { lat: c.lat, lon: c.lon, complex }, baseline: null },
          answer: {
            photo: { pano: "exit-pano", heading: 0, pitch: 5, fov: 90, url: "https://x/signed" },
          },
          at: 37_300,
          answerAt: 37_360,
          remaining: 3,
        },
      ],
      spotNearby: { lat: spot.lat, lon: spot.lon },
      footThermometer: { lat: pano.lat, lon: pano.lon, complex },
      footpath: [{ a: exit, b: [pano.lat, pano.lon], start: 37_300, end: 37_360 }],
      result: { kind: "found", at: 37_600 },
      replay: {
        hider: [{ t: 36_900, state: walk(36_900, exit, spot) }],
        seeker: [
          { t: 37_300, state: walk(37_300, exit, pano) },
          { t: 37_500, state: { kind: "street", complex, exit: 0, at: pano, since: 37_500 } },
        ],
      },
    } as unknown as SoloView;
    const kept = keptView(ds, view);
    const json = JSON.stringify(kept);
    for (const n of [spot.lat, spot.lon, pano.lat, pano.lon]) expect(json).not.toContain(String(n));
    expect(json).not.toContain("walk-pano");
    expect(json).not.toContain("signed");
    // The walks keep their times, standing at the exit; the photo keeps its panorama ID.
    const hiderWalk = kept.replay?.hider[0]?.state;
    expect(hiderWalk?.kind === "walking" && [hiderWalk.start, hiderWalk.end]).toEqual([
      36_900, 36_960,
    ]);
    expect(hiderWalk?.kind === "walking" && hiderWalk.toPoint).toEqual(exit);
    expect(json).toContain("exit-pano");
    expect(kept.spotNearby).toBeNull();
    expect(kept.footpath).toEqual([]);
    expect(kept.asked[0]?.ctx.origin).toEqual({ lat: c.lat, lon: c.lon, complex });
  });
});
