import type { Dataset } from "@subway-seek/data";
import { loadDataset } from "@subway-seek/data/node";
import type { SoloView, TimetableIndex, TrailEntry } from "@subway-seek/engine";
import { beforeAll, describe, expect, it } from "vitest";
import { endingOf, miles } from "./ending.ts";
import { displayName } from "./names.ts";

let ds: Dataset;
let idx: TimetableIndex;
beforeAll(() => {
  ds = loadDataset();
  idx = { ds } as TimetableIndex;
});

const complexOf = (station: number) => ds.stations[station]?.complex as number;

/** A trip of 8+ stops whose stops are all in different complexes. */
function plainTrip() {
  const trip = ds.trips.findIndex(
    (t) => t.stops.length >= 8 && new Set(t.stops.map(complexOf)).size === t.stops.length,
  );
  const tr = ds.trips[trip];
  if (!tr) throw new Error("no trip");
  return { trip, tr };
}

/** The seeker waits at the trip's first stop from 10:20, then rides from 0 to `to`. */
function rideTrail(trip: number, from: number, to: number, seekStart: number): TrailEntry[] {
  const tr = ds.trips[trip];
  if (!tr) throw new Error("no trip");
  const platform = {
    kind: "platform" as const,
    station: tr.stops[from] as number,
    since: seekStart,
    arrivedDir: null,
  };
  return [
    { t: seekStart, state: platform },
    {
      t: (tr.dep[from] as number) - 30,
      state: { kind: "train", trip, from, to, boardedFrom: platform },
    },
  ];
}

function view(over: Partial<SoloView> & { seekStart: number }): SoloView {
  return {
    reachable: Array.from({ length: 99 }, (_, i) => i),
    asked: [],
    cardEvents: [],
    stationFoundAt: null,
    ...over,
  } as SoloView;
}

describe("the ending", () => {
  it("says nothing while the round is on", () => {
    const { trip, tr } = plainTrip();
    const seekStart = (tr.dep[0] as number) - 300;
    const v = view({
      seekStart,
      hider: complexOf(tr.stops[3] as number),
      result: null,
      replay: { hider: [], seeker: rideTrail(trip, 0, 6, seekStart) },
    });
    expect(endingOf(ds, idx, v)).toEqual({ verdict: null, callouts: [] });
  });

  it("catches a ride straight through their station, and the verdict says so", () => {
    const { trip, tr } = plainTrip();
    const seekStart = (tr.dep[0] as number) - 300;
    const end = (tr.arr[6] as number) + 1800;
    const v = view({
      seekStart,
      hider: complexOf(tr.stops[3] as number),
      result: { kind: "found", at: end },
      stationFoundAt: end,
      replay: { hider: [], seeker: rideTrail(trip, 0, 6, seekStart) },
    });
    const e = endingOf(ds, idx, v);
    expect(e.callouts.find((c) => c.kind === "rodeThrough")).toEqual({
      kind: "rodeThrough",
      t: tr.arr[3],
      text: "You rode straight through their station.",
    });
    expect(e.verdict).toBe("You rode right past them, and came back.");
  });

  it("finds the closest call, and an unfound round ends so many miles short", () => {
    const { trip, tr } = plainTrip();
    const seekStart = (tr.dep[0] as number) - 300;
    const hider = complexOf(tr.stops[7] as number);
    const off = ds.complexes[complexOf(tr.stops[6] as number)];
    const home = ds.complexes[hider];
    if (!off || !home) throw new Error("no complex");
    const v = view({
      seekStart,
      hider,
      result: { kind: "timeout", at: (tr.arr[6] as number) + 3600 },
      replay: { hider: [], seeker: rideTrail(trip, 0, 6, seekStart) },
    });
    const e = endingOf(ds, idx, v);
    expect(e.callouts.some((c) => c.kind === "rodeThrough")).toBe(false);
    const close = e.callouts.find((c) => c.kind === "closest");
    expect(close?.t).toBe(tr.arr[6]);
    expect(close?.text).toMatch(new RegExp(`^\\d\\.\\d mi from them, at ${displayName(off.name)}`));
    expect(e.verdict).toMatch(/^Service ended \d\.\d mi short\.$/);
  });

  it("doesn't count the start as a close call", () => {
    const { tr } = plainTrip();
    const seekStart = (tr.dep[0] as number) - 300;
    // They hid one stop from the start; the seeker never left.
    const v = view({
      seekStart,
      hider: complexOf(tr.stops[1] as number),
      result: { kind: "gaveUp", at: seekStart + 1200 },
      replay: {
        hider: [],
        seeker: [
          {
            t: seekStart,
            state: {
              kind: "platform",
              station: tr.stops[0] as number,
              since: seekStart,
              arrivedDir: null,
            },
          },
        ],
      },
    });
    const e = endingOf(ds, idx, v);
    expect(e.callouts).toEqual([]);
    expect(e.verdict).toMatch(/^You stopped \d\.\d mi short\.$/);
  });

  it("catches an express that ran past their station", () => {
    // An express pair (a, b) with a local pattern running a, h, b.
    let hit: { trip: number; k: number; h: number } | null = null;
    const patterns = new Map<string, number[]>();
    for (const t of ds.trips) patterns.set(t.stops.join(","), t.stops);
    search: for (let trip = 0; trip < ds.trips.length; trip++) {
      const tr = ds.trips[trip];
      if (!tr || tr.stops.length < 3) continue;
      for (let k = 0; k + 1 < tr.stops.length; k++) {
        const a = tr.stops[k] as number;
        const b = tr.stops[k + 1] as number;
        for (const stops of patterns.values()) {
          const ia = stops.indexOf(a);
          const ib = ia < 0 ? -1 : stops.indexOf(b, ia + 1);
          const h = stops[ia + 1] as number;
          if (ib === ia + 2 && !tr.stops.some((s) => complexOf(s) === complexOf(h))) {
            hit = { trip, k, h };
            break search;
          }
        }
      }
    }
    if (!hit) throw new Error("no express pair in the dataset");
    const tr = ds.trips[hit.trip];
    if (!tr) throw new Error("no trip");
    const seekStart = (tr.dep[hit.k] as number) - 300;
    const end = (tr.arr[hit.k + 1] as number) + 3600;
    const v = view({
      seekStart,
      hider: complexOf(hit.h),
      result: { kind: "found", at: end },
      stationFoundAt: end,
      replay: { hider: [], seeker: rideTrail(hit.trip, hit.k, hit.k + 1, seekStart) },
    });
    const route = ds.routes[tr.route]?.display;
    expect(endingOf(ds, idx, v).callouts.find((c) => c.kind === "expressPast")).toEqual({
      kind: "expressPast",
      t: tr.dep[hit.k],
      text: `Your ${route} ran express past their station.`,
    });
  });

  it("names the turning point: the answer that cut the most, if it cut half", () => {
    const { tr } = plainTrip();
    const seekStart = (tr.dep[0] as number) - 300;
    const origin = { complex: 0, lat: 40.73, lon: -74 };
    const asked = [
      [{ kind: "borough" }, true, 72, 60],
      [{ kind: "radar", miles: 2 }, false, 22, 600],
      [{ kind: "radar", miles: 1 }, { vetoed: true }, 22, 900],
      [{ kind: "route", letter: "C" }, false, 19, 1200],
    ].map(([q, answer, remaining, dt]) => ({
      q,
      answer,
      remaining,
      at: seekStart + (dt as number) - 10,
      answerAt: seekStart + (dt as number),
      ctx: { origin },
    }));
    const v = view({
      seekStart,
      hider: complexOf(tr.stops[3] as number),
      result: { kind: "gaveUp", at: seekStart + 1800 },
      asked: asked as unknown as SoloView["asked"],
      replay: { hider: [], seeker: [] },
    });
    const turning = endingOf(ds, idx, v).callouts.find((c) => c.kind === "turningPoint");
    expect(turning?.t).toBe(seekStart + 600);
    expect(turning?.text).toMatch(/^Radar 2 mi, \S+: 72 → 22\.$/);
  });

  it("tells You hide the same facts about the bot's hunt", () => {
    const { trip, tr } = plainTrip();
    const seekStart = (tr.dep[0] as number) - 300;
    const end = (tr.arr[6] as number) + 1800;
    const v = {
      ...view({
        seekStart,
        hider: complexOf(tr.stops[3] as number),
        result: { kind: "found", at: end },
        stationFoundAt: end,
        replay: { hider: [], seeker: rideTrail(trip, 0, 6, seekStart) },
      }),
      role: "hider",
      incomplete: null,
    } as unknown as SoloView;
    const e = endingOf(ds, idx, v);
    expect(e.callouts.find((c) => c.kind === "rodeThrough")?.text).toBe(
      "The seeker rode straight through your station.",
    );
    expect(e.verdict).toBe("They rode right past you once.");
  });

  it("keeps at most three callouts, in time order", () => {
    const { trip, tr } = plainTrip();
    const seekStart = (tr.dep[0] as number) - 300;
    const end = (tr.arr[6] as number) + 1800;
    const v = view({
      seekStart,
      hider: complexOf(tr.stops[3] as number),
      result: { kind: "found", at: end },
      stationFoundAt: end,
      replay: { hider: [], seeker: rideTrail(trip, 0, 6, seekStart) },
    });
    const { callouts } = endingOf(ds, idx, v);
    expect(callouts.length).toBeLessThanOrEqual(3);
    expect(callouts.map((c) => c.t)).toEqual([...callouts.map((c) => c.t)].sort((a, b) => a - b));
  });

  it("writes miles with one decimal, never zero", () => {
    expect(miles(0)).toBe("0.1 mi");
    expect(miles(483)).toBe("0.3 mi");
    expect(miles(3380)).toBe("2.1 mi");
  });
});
