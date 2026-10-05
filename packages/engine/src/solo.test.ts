import type { Dataset } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type AskContext,
  evaluate,
  filterCandidates,
  type Place,
  type Question,
  questionError,
  RADAR_MILES,
} from "./questions.ts";
import { earliestArrivals, reachableComplexes } from "./reach.ts";
import {
  advanceSolo,
  applySoloIntent,
  createSoloRound,
  HIDE_SECONDS,
  QUESTION_COOLDOWN_SECONDS,
  type SoloRound,
  soloView,
} from "./solo.ts";
import { buildIndex, departures, type TimetableIndex } from "./timetable.ts";

const TEN = 10 * 3600;
let ds: Dataset;
let idx: TimetableIndex;
const station = (id: string) => {
  const i = ds.stations.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`no station ${id}`);
  return i;
};
const complexOf = (id: string) => ds.stations[station(id)]?.complex as number;
const place = (id: string): Place => {
  const s = ds.stations[station(id)];
  if (!s) throw new Error(id);
  return { lat: s.lat, lon: s.lon, complex: s.complex };
};
/** Deterministic PRNG for repeatable rounds. */
const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const round = (seed = 1): SoloRound =>
  createSoloRound(idx, { hub: station("127"), hideStart: TEN, random: mulberry(seed) });

beforeAll(() => {
  ds = loadDataset();
  idx = buildIndex(ds);
});

describe("reachability", () => {
  it("gets from Times Sq to 14 St in under 20 minutes but not to Far Rockaway", () => {
    const arrival = earliestArrivals(idx, station("127"), TEN, TEN + HIDE_SECONDS);
    expect(arrival[station("132")]).toBeLessThan(TEN + 15 * 60); // 14 St (1/2/3)
    expect(arrival[station("H11")]).toBe(Number.POSITIVE_INFINITY); // Far Rockaway-Mott Av
  });

  it("reaches a plausible slice of the city and excludes the hub itself", () => {
    const reach = reachableComplexes(idx, station("127"), TEN, TEN + HIDE_SECONDS);
    expect(reach.length).toBeGreaterThan(40);
    expect(reach.length).toBeLessThan(250);
    expect(reach).not.toContain(complexOf("127"));
    expect(reach).toContain(complexOf("132"));
  });
});

describe("questions", () => {
  const at = (id: string, baseline: string | null = null): AskContext => ({
    origin: place(id),
    baseline: baseline ? place(baseline) : null,
  });

  it("answers radar by straight-line distance", () => {
    // 14 St (1/2/3) is ~1.4 mi from Times Sq.
    expect(evaluate(ds, { kind: "radar", miles: 2 }, complexOf("132"), at("127"))).toBe(true);
    expect(evaluate(ds, { kind: "radar", miles: 1 }, complexOf("132"), at("127"))).toBe(false);
  });

  it("answers route, borough, express and more-routes from station data", () => {
    const fourteen = complexOf("132");
    expect(evaluate(ds, { kind: "route", letter: "2" }, fourteen, at("127"))).toBe(true);
    expect(evaluate(ds, { kind: "route", letter: "G" }, fourteen, at("127"))).toBe(false);
    expect(evaluate(ds, { kind: "borough" }, fourteen, at("127"))).toBe(true);
    expect(evaluate(ds, { kind: "express" }, fourteen, at("127"))).toBe(true);
    // Times Sq has 12 routes; nothing near has more.
    expect(evaluate(ds, { kind: "moreRoutes" }, fourteen, at("127"))).toBe(false);
  });

  it("reads the thermometer against where it was started", () => {
    // Started at Times Sq, now at 14 St: a station further downtown is hotter.
    const ctx = at("132", "127");
    expect(evaluate(ds, { kind: "thermometer" }, complexOf("137"), ctx)).toBe("hotter"); // Chambers St
    expect(evaluate(ds, { kind: "thermometer" }, complexOf("120"), ctx)).toBe("colder"); // 96 St
  });

  it("refuses a thermometer without a start or without moving", () => {
    expect(questionError(ds, { kind: "thermometer" }, at("127"))).not.toBeNull();
    expect(questionError(ds, { kind: "thermometer" }, at("127", "127"))).not.toBeNull();
    expect(questionError(ds, { kind: "thermometer" }, at("132", "127"))).toBeNull();
  });

  it("never rules out the hider, whatever is asked", () => {
    const reach = reachableComplexes(idx, station("127"), TEN, TEN + HIDE_SECONDS);
    const pool: Question[] = [
      ...RADAR_MILES.map((miles) => ({ kind: "radar" as const, miles })),
      ...["1", "A", "L", "7", "Q", "4"].map((letter) => ({ kind: "route" as const, letter })),
      { kind: "borough" },
      { kind: "express" },
      { kind: "moreRoutes" },
    ];
    const origins = ["127", "132", "A24", "631", "R20"];
    for (const hider of reach.slice(0, 40)) {
      const asked = pool.map((q, i) => {
        const ctx = at(origins[i % origins.length] as string);
        return { q, ctx, answer: evaluate(ds, q, hider, ctx) };
      });
      expect(filterCandidates(ds, reach, asked)).toContain(hider);
    }
  });
});

describe("solo round", () => {
  it("starts seeking at 10:20 from the hub with the hider somewhere reachable", () => {
    const r = round();
    expect(r.seekStart).toBe(TEN + HIDE_SECONDS);
    expect(r.reachable).toContain(r.hider);
    expect(soloView(r, idx).hider).toBeNull(); // secret while playing
  });

  it("answers questions, adds the cooldown, and narrows the candidates", () => {
    const r = round();
    const t = r.seekStart;
    const res = applySoloIntent(r, { type: "ask", question: { kind: "radar", miles: 1 } }, t, idx);
    if (!res.ok) throw new Error(res.error);
    const view = soloView(res.round, idx);
    expect(view.asked).toHaveLength(1);
    expect(view.candidates).toContain(r.hider);
    expect(view.candidates.length).toBeLessThan(r.reachable.length);
    expect(view.bonusSeconds).toBe(600);
    const again = applySoloIntent(
      res.round,
      { type: "ask", question: { kind: "express" } },
      t + 60,
      idx,
    );
    expect(again.ok).toBe(false);
    const later = applySoloIntent(
      res.round,
      { type: "ask", question: { kind: "express" } },
      t + QUESTION_COOLDOWN_SECONDS,
      idx,
    );
    expect(later.ok).toBe(true);
  });

  it("is found by getting off at the hider's station", () => {
    // Pick a seed whose hider is on the downtown 1 within reach, then ride there.
    const r0 = round();
    const dep = departures(idx, r0.hub, r0.seekStart, { horizon: 1800 }).find(
      (d) => d.route.id === "1" && d.dir === 1,
    );
    if (!dep) throw new Error("no downtown 1");
    const trip = ds.trips[dep.trip];
    if (!trip) throw new Error("trip");
    const j = trip.stops.findIndex(
      (s, k) => k > dep.stop && r0.reachable.includes(ds.stations[s]?.complex ?? -1),
    );
    const target = ds.stations[trip.stops[j] as number]?.complex as number;
    const r: SoloRound = { ...r0, hider: target };

    let res = applySoloIntent(
      r,
      { type: "board", trip: dep.trip, stop: dep.stop },
      r.seekStart,
      idx,
    );
    if (!res.ok) throw new Error(res.error);
    res = applySoloIntent(res.round, { type: "alightAt", stop: j }, r.seekStart, idx);
    if (!res.ok) throw new Error(res.error);
    const arrival = trip.arr[j] as number;
    expect(advanceSolo(res.round, arrival - 1, idx).result).toBeNull();
    const done = advanceSolo(res.round, arrival + 30, idx);
    expect(done.result).toEqual({ kind: "found", at: arrival });
    expect(soloView(done, idx).hider).toBe(target); // revealed once over
  });

  it("times out after two hours", () => {
    const r = round();
    expect(advanceSolo(r, r.seekEnd, idx).result).toEqual({ kind: "timeout", at: r.seekEnd });
  });
});
