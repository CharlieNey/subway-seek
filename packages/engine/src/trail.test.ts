import type { Dataset } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import { seededRandom } from "./daily.ts";
import { Geometry } from "./geometry.ts";
import { earliestArrivals, earliestJourney, reachableComplexes } from "./reach.ts";
import { advanceSolo, applySoloIntent, createSoloRound, HIDE_SECONDS, soloView } from "./solo.ts";
import { buildIndex, departures, type TimetableIndex } from "./timetable.ts";
import { sampleTrail, trailFromLegs, trailStateAt } from "./trail.ts";
import { resolve } from "./transit.ts";

const TEN = 10 * 3600;
let ds: Dataset;
let idx: TimetableIndex;
let hub: number;
const meters = ([a, b]: [number, number], [c, d]: [number, number]) =>
  Math.hypot((a - c) * 84_000, (b - d) * 110_540);

beforeAll(() => {
  ds = loadDataset();
  idx = buildIndex(ds);
  hub = ds.stations.findIndex((s) => s.id === "127");
});

describe("bot hider's route", () => {
  it("reaches every reachable complex by the end of hiding, matching the earliest arrival", () => {
    const end = TEN + HIDE_SECONDS;
    const arrival = earliestArrivals(idx, hub, TEN, end);
    for (const complex of reachableComplexes(idx, hub, TEN, end)) {
      const targets = ds.complexes[complex]?.stations ?? [];
      const legs = earliestJourney(idx, hub, TEN, end, targets);
      expect(legs, `complex ${complex}`).not.toBeNull();
      const trail = trailFromLegs(idx, hub, TEN, legs ?? []);
      const there = resolve(trailStateAt(trail, end) ?? trail[0]?.state ?? never(), end, idx);
      expect(there.kind).toBe("platform");
      if (there.kind !== "platform") continue;
      expect(ds.stations[there.station]?.complex).toBe(complex);
      const best = Math.min(...targets.map((s) => arrival[s] as number));
      expect(there.since).toBe(best);
    }
  });

  it("moves continuously along its route", () => {
    const geo = new Geometry(idx);
    const round = createSoloRound(idx, { hub, hideStart: TEN, random: seededRandom(7) });
    const samples = sampleTrail(geo, round.hiderTrail, TEN, TEN + HIDE_SECONDS, 10);
    for (let i = 1; i < samples.length; i++) {
      // 10 game-seconds can't cover more than a fast express or an in-complex walk.
      expect(meters(samples[i - 1]?.p ?? [0, 0], samples[i]?.p ?? [0, 0])).toBeLessThan(800);
    }
  });
});

describe("seeker's trail and the replay", () => {
  it("records every move and only reveals both routes once the round is over", () => {
    let round = createSoloRound(idx, { hub, hideStart: TEN, random: seededRandom(3) });
    expect(round.seekerTrail).toHaveLength(1);
    const d = departures(idx, hub, round.seekStart, { horizon: 1800 })[0];
    if (!d) throw new Error("no departure");
    const res = applySoloIntent(
      round,
      { type: "board", trip: d.trip, stop: d.stop },
      round.seekStart,
      idx,
    );
    if (!res.ok) throw new Error(res.error);
    round = res.round;
    expect(round.seekerTrail).toHaveLength(2);
    expect(soloView(round, round.seekStart, idx).replay).toBeNull();
    const over = advanceSolo(round, round.seekEnd, idx);
    const replay = soloView(over, round.seekEnd, idx).replay;
    expect(replay?.seeker).toHaveLength(2);
    expect(replay?.hider.length).toBeGreaterThan(1);
  });
});

describe("giving up", () => {
  it("ends the round at that moment and reveals the replay", () => {
    const round = createSoloRound(idx, { hub, hideStart: TEN, random: seededRandom(5) });
    const res = applySoloIntent(round, { type: "giveUp" }, round.seekStart + 600, idx);
    if (!res.ok) throw new Error(res.error);
    expect(res.round.result).toEqual({ kind: "gaveUp", at: round.seekStart + 600 });
    expect(soloView(res.round, round.seekStart + 600, idx).hider).toBe(round.hider);
    expect(soloView(res.round, round.seekStart + 600, idx).replay).not.toBeNull();
    expect(applySoloIntent(res.round, { type: "giveUp" }, round.seekStart + 700, idx).ok).toBe(
      false,
    );
  });
});

function never(): never {
  throw new Error("unreachable");
}
