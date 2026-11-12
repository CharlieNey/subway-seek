import type { Dataset } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import { seededRandom } from "./daily.ts";
import { distanceMeters, offsetMeters } from "./geo.ts";
import { earliestJourney, type Leg } from "./reach.ts";
import { possibleSpots, searchGrid } from "./search.ts";
import {
  aliveCount,
  arrivalOf,
  bestFootQuestion,
  newBelief,
  newSeekerMemory,
  planFromPlatform,
  planOnTrain,
  planWrongWay,
  runSeeker,
  SEEKER_DEFAULTS,
  seekerRejected,
  seekerStep,
  shouldLeave,
  syncBelief,
  walkedOnStreet,
} from "./seekerBot.ts";
import {
  advanceSolo,
  applySoloIntent,
  CATCH_METERS,
  createSoloRound,
  placeHider,
  type SoloRound,
  soloView,
} from "./solo.ts";
import { buildIndex, type TimetableIndex } from "./timetable.ts";
import { applyIntent, type OnPlatform, resolve } from "./transit.ts";

const TEN = 10 * 3600;
let ds: Dataset;
let idx: TimetableIndex;
let hub: number;
const station = (id: string) => {
  const i = ds.stations.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`no station ${id}`);
  return i;
};
const stationsOf = (complex: number) => ds.complexes[complex]?.stations ?? [];
const platform = (st: number, since: number, arrivedDir: 0 | 1 | null = null): OnPlatform => ({
  kind: "platform",
  station: st,
  since,
  arrivedDir,
});

beforeAll(() => {
  ds = loadDataset();
  idx = buildIndex(ds);
  hub = station("127");
});

/** A round at Times Sq whose seeker is placed by hand. */
function roundWith(seeker: SoloRound["seeker"], seed = 1): SoloRound {
  const round = createSoloRound(idx, { hub, hideStart: TEN, random: seededRandom(seed) });
  return { ...round, seeker, seekerTrail: [{ t: round.seekStart, state: seeker }] };
}

describe("planning a journey from intents", () => {
  it("leaves time to change platforms when asked to", () => {
    const t = TEN + 20 * 60;
    /** Platform changes (ride to ride at one station) that are tighter than the station allows. */
    const tightChanges = (legs: Leg[]) => {
      let tight = 0;
      for (let i = 1; i < legs.length; i++) {
        const prev = legs[i - 1];
        const next = legs[i];
        if (prev?.kind !== "ride" || next?.kind !== "ride") continue;
        const at = ds.trips[prev.trip]?.stops[prev.to] as number;
        if (next.dep < prev.arr + (idx.selfTransfer[at] ?? 0)) tight++;
      }
      return tight;
    };
    let optimistic = 0;
    for (const target of ["A09", "F27", "A41", "R31", "G22", "L29"]) {
      const targets = stationsOf(ds.stations[station(target)]?.complex as number);
      const loose = earliestJourney(idx, hub, t, t + 7200, targets) ?? [];
      const strict = earliestJourney(idx, hub, t, t + 7200, targets, true) ?? [];
      optimistic += tightChanges(loose);
      expect(tightChanges(strict)).toBe(0);
      expect(arrivalOf(strict, t)).toBeGreaterThanOrEqual(arrivalOf(loose, t));
    }
    // The plain planner really does plan changes the engine would refuse (96 St, Jay St).
    expect(optimistic).toBeGreaterThan(0);
  });

  it("boards the fastest train and gets there when the timetable says", () => {
    const t = TEN + 20 * 60;
    const targets = stationsOf(ds.stations[station("635")]?.complex as number); // Union Sq
    const plan = planFromPlatform(idx, hub, t, t + 3600, targets);
    expect(plan).not.toBeNull();
    const legs = earliestJourney(idx, hub, t, t + 3600, targets) ?? [];
    expect(plan?.arrive).toBe(arrivalOf(legs, t));
    expect(plan?.arrive).toBeLessThan(t + 15 * 60);
    // Every intent of the first leg is one the engine accepts, in order.
    let state: SoloRound["seeker"] = platform(hub, t);
    for (const intent of plan?.intents ?? []) {
      const r = applyIntent(state, intent, t, idx);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(state.kind === "train" || state.kind === "walking").toBe(true);
  });

  it("on the train, stays the course for the same targets and gets off early for one behind", () => {
    const south = stationsOf(ds.stations[station("137")]?.complex as number); // Chambers St
    // From 14 St (1/2/3). Which train comes first depends on the pinned timetable, and an
    // express runs 14 St to Chambers St with no stop between, so find a start time whose
    // planned ride has at least one intermediate stop to get off at.
    let t = TEN + 20 * 60;
    let plan = planFromPlatform(idx, station("132"), t, t + 3600, south);
    const rideOf = (p: typeof plan) => {
      const b = p?.intents.find((i) => i.type === "board");
      const a = p?.intents.find((i) => i.type === "alightAt");
      return b?.type === "board" && a?.type === "alightAt" ? { board: b, alight: a } : null;
    };
    while (
      (rideOf(plan)?.alight.stop ?? 0) - (rideOf(plan)?.board.stop ?? 0) < 2 &&
      t < TEN + 80 * 60
    ) {
      t += 60;
      plan = planFromPlatform(idx, station("132"), t, t + 3600, south);
    }
    const ride = rideOf(plan);
    if (!ride) throw new Error("expected a ride");
    const { board, alight } = ride;
    if (alight.stop - board.stop < 2)
      throw new Error("expected a local ride with a stop in between");
    const trip = ds.trips[board.trip];
    if (!trip) throw new Error("no trip");
    const riding = {
      kind: "train" as const,
      trip: board.trip,
      from: board.stop,
      to: alight.stop,
      boardedFrom: platform(station("132"), t),
    };
    const dep = trip.dep[board.stop] as number;
    // Same targets, just after leaving: nothing to change.
    expect(planOnTrain(idx, riding, dep + 1, dep + 3600, south)).toEqual([]);
    // Now the hunt points back where we came from: get off before the planned stop (at
    // the next one, or one more along if the way back is quicker from there).
    const back = planOnTrain(idx, riding, dep + 1, dep + 3600, [station("132")]);
    const off = back[0];
    if (off?.type !== "alightAt") throw new Error("expected to get off");
    expect(off.stop).toBeGreaterThan(board.stop);
    expect(off.stop).toBeLessThan(alight.stop);
  });
});

describe("re-planning after a rejection", () => {
  it("a refused platform change holds the plan's start past the change, then boards", () => {
    // Find an arrival (station, direction) where the fastest train back to Times Sq
    // leaves the other way too soon to change platforms: the planner is optimistic.
    const t = TEN + 30 * 60;
    const targets = stationsOf(ds.stations[hub]?.complex as number);
    let found: { st: number; dir: 0 | 1 } | null = null;
    for (const st of ds.stations.keys()) {
      for (const dir of [0, 1] as const) {
        const plan = planFromPlatform(idx, st, t, t + 3600, targets);
        const board = plan?.intents[0];
        if (board?.type !== "board") continue;
        const trip = ds.trips[board.trip];
        if (!trip || trip.dir === dir) continue;
        if ((trip.dep[board.stop] as number) < t + (idx.selfTransfer[st] ?? 0)) {
          found = { st, dir };
          break;
        }
      }
      if (found) break;
    }
    if (!found) throw new Error("no refused change in the timetable");
    const arrived = platform(found.st, t, found.dir);
    const round = roundWith(arrived);
    const first = planFromPlatform(idx, found.st, t, t + 3600, targets)?.intents[0];
    if (!first) throw new Error("no plan");
    const refused = applySoloIntent(round, first, t, idx);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toMatch(/change platforms/);
    const mem = newSeekerMemory();
    seekerRejected(mem, soloView(round, t, idx), first, refused.error, t, idx);
    expect(mem.notBefore?.t).toBe(t + (idx.selfTransfer[found.st] ?? 0));
    const again = planFromPlatform(idx, found.st, mem.notBefore?.t ?? t, t + 3600, targets);
    const board = again?.intents[0];
    if (!board) throw new Error("no second plan");
    expect(applySoloIntent(round, board, t, idx).ok).toBe(true);
  });

  it("under Wrong way, boards a train the required way and the engine lets it", () => {
    const t = TEN + 20 * 60;
    const north = stationsOf(ds.stations[station("120")]?.complex as number); // 96 St
    const round: SoloRound = {
      ...roundWith(platform(hub, t)),
      curses: [{ card: "wrongWay", at: t, dir: 1, until: t + 1800 }],
    };
    const plan = planWrongWay(idx, platform(hub, t), t, t + 3600, north, 1);
    const board = plan?.intents[0];
    if (board?.type !== "board") throw new Error("expected a board");
    expect(ds.trips[board.trip]?.dir).toBe(1);
    expect(applySoloIntent(round, board, t, idx).ok).toBe(true);
    // The unconstrained plan would have gone north, and the engine would refuse it.
    const straight = planFromPlatform(idx, hub, t, t + 3600, north)?.intents[0];
    if (straight?.type !== "board") throw new Error("expected a board");
    expect(ds.trips[straight.trip]?.dir).toBe(0);
    expect(applySoloIntent(round, straight, t, idx).ok).toBe(false);
  });

  it("Tourist: up, 200 m on the street, then back down toward the hunt", () => {
    const t = TEN + 20 * 60;
    const st = station("D17"); // 34 St-Herald Sq
    let round: SoloRound = {
      ...roundWith(platform(st, t)),
      curses: [{ card: "tourist", at: t, station: st }],
    };
    const mem = newSeekerMemory();
    let now = t;
    const intents: string[] = [];
    for (let i = 0; i < 40 && !intents.includes("enter"); i++) {
      const step = seekerStep(soloView(round, now, idx), mem, now, idx);
      if ("waitUntil" in step) {
        now = step.waitUntil;
        round = advanceSolo(round, now, idx);
        continue;
      }
      for (const intent of step.intents) {
        const r = applySoloIntent(round, intent, now, idx);
        if (!r.ok) throw new Error(`${intent.type}: ${r.error}`);
        round = r.round;
        intents.push(intent.type);
      }
    }
    expect(intents.slice(0, 2)).toEqual(["exit", "walkTo"]);
    expect(intents).toContain("enter");
    const view = soloView(round, now, idx);
    expect(walkedOnStreet(view.footpath, t, now)).toBeGreaterThanOrEqual(200);
    expect(view.curses).toEqual([]);
  });
});

describe("the street search", () => {
  /** A round with one candidate (the hider), the seeker on its platform at the start. */
  function endgameRound(seed: number, east: number, north: number) {
    let round = createSoloRound(idx, {
      hub,
      hideStart: TEN,
      random: seededRandom(seed),
      difficulty: "normal",
    });
    const c = ds.complexes[round.hider];
    if (!c) throw new Error("no complex");
    round = placeHider(round, { ...offsetMeters(c, east, north), pano: "p" }, idx);
    const seeker = platform(c.stations[0] as number, round.seekStart);
    return {
      ...round,
      reachable: [round.hider],
      seeker,
      seekerTrail: [{ t: round.seekStart, state: seeker }],
    };
  }

  it("keeps the same cells as the engine's search area", () => {
    const start = endgameRound(5, 140, -60);
    // A partial search: a few walks and an on-foot answer, then compare.
    const { round } = runSeeker(start, idx, SEEKER_DEFAULTS, 30);
    const t = round.seekerTrail.at(-1)?.t ?? round.seekStart;
    const view = soloView(round, t, idx);
    expect(view.footpath.length).toBeGreaterThan(3);
    expect(view.asked.some((a) => a.q.kind === "spotRadar")).toBe(true);
    const belief = newBelief(ds, round.hider);
    syncBelief(belief, ds, view, t);
    const c = ds.complexes[round.hider] as { lat: number; lon: number };
    const engine = new Set(
      possibleSpots(ds, c, view.asked, view.candidates, view.footpath, t).map(
        (p) => `${p.lat},${p.lon}`,
      ),
    );
    // The belief reaches further (600 m, as far as you may walk); on the engine's own
    // grid the two agree cell for cell.
    const circle = new Set(searchGrid(c).map((p) => `${p.lat},${p.lon}`));
    const mine = new Set<string>();
    belief.points.forEach((p, i) => {
      const key = `${p.lat},${p.lon}`;
      if (belief.alive[i] && circle.has(key)) mine.add(key);
    });
    expect(mine.size).toBeGreaterThan(0);
    expect(mine.size).toBeLessThan(belief.points.length / 2);
    // Two flat frames (the engine's around each cell, the belief's around the station)
    // can disagree by a hair at the 39 m boundary: allow a cell or two.
    const differ =
      [...mine].filter((k) => !engine.has(k)).length +
      [...engine].filter((k) => !mine.has(k)).length;
    expect(differ).toBeLessThanOrEqual(2);
  });

  it("prices an on-foot question by the sweeping it saves", () => {
    const start = endgameRound(5, 140, -60);
    const belief = newBelief(ds, start.hider);
    syncBelief(belief, ds, soloView(start, start.seekStart, idx), start.seekStart);
    const c = ds.complexes[start.hider] as { lat: number; lon: number };
    const best = bestFootQuestion(belief, c, null);
    // From the middle of a fresh zone, a radar halves the area: worth well over +3 min.
    expect(best?.q.kind).toBe("spotRadar");
    expect(best?.savedMinutes).toBeGreaterThan(3);
    // Nothing left to rule out: nothing worth asking.
    belief.alive.fill(0);
    expect(bestFootQuestion(belief, c, null)).toBeNull();
  });

  it("stays while most of the zone is left, leaves for a far sliver", () => {
    const start = endgameRound(5, 140, -60);
    const belief = newBelief(ds, start.hider);
    syncBelief(belief, ds, soloView(start, start.seekStart, idx), start.seekStart);
    const c = ds.complexes[start.hider] as { lat: number; lon: number };
    const whole = aliveCount(belief);
    expect(shouldLeave(belief, c, whole)).toBe(false);
    // Only a thin far edge of the zone left (as after "Not near you"): the others are
    // the better bet.
    belief.points.forEach((p, i) => {
      if (distanceMeters(p, c) < 385) belief.alive[i] = 0;
    });
    expect(aliveCount(belief)).toBeLessThan(whole / 10);
    expect(shouldLeave(belief, c, whole)).toBe(true);
    expect(shouldLeave(belief, c, 0)).toBe(false);
  });

  it("sweeps the street to the catch, asking on foot when it pays", () => {
    const { round } = runSeeker(endgameRound(5, 140, -60), idx);
    expect(round.result?.kind).toBe("found");
    const minutes = ((round.result?.at ?? 0) - round.seekStart) / 60;
    expect(minutes).toBeLessThan(45);
    expect(round.asked.length).toBeGreaterThan(0);
    expect(
      round.asked.every((a) => a.q.kind === "spotRadar" || a.q.kind === "spotThermometer"),
    ).toBe(true);
    const last = resolve(round.seeker, round.result?.at ?? 0, idx);
    if (last.kind !== "street" || !round.spot) throw new Error("not on the street");
    expect(distanceMeters(last.at ?? { lat: 0, lon: 0 }, round.spot)).toBeLessThanOrEqual(
      CATCH_METERS,
    );
  });
});

describe("the hunt", () => {
  it("starts a thermometer, asks, then lets the answer land before moving", () => {
    const round = createSoloRound(idx, { hub, hideStart: TEN, random: seededRandom(2) });
    const mem = newSeekerMemory();
    const t = round.seekStart;
    const first = seekerStep(soloView(round, t, idx), mem, t, idx);
    expect(first).toEqual({ intents: [{ type: "startThermometer" }] });
    let r = applySoloIntent(round, { type: "startThermometer" }, t, idx);
    if (!r.ok) throw new Error(r.error);
    const second = seekerStep(soloView(r.round, t, idx), mem, t, idx);
    if (!("intents" in second) || second.intents[0]?.type !== "ask")
      throw new Error("expected an ask");
    r = applySoloIntent(r.round, second.intents[0], t, idx);
    if (!r.ok) throw new Error(r.error);
    const third = seekerStep(soloView(r.round, t, idx), mem, t, idx);
    expect("waitUntil" in third && third.waitUntil).toBe(t + 60);
    // Once the answer is in, it rides toward what's left.
    const t2 = t + 60;
    const fourth = seekerStep(soloView(r.round, t2, idx), mem, t2, idx);
    expect(
      "intents" in fourth && ["board", "transfer"].includes(fourth.intents[0]?.type ?? ""),
    ).toBe(true);
  });
});
