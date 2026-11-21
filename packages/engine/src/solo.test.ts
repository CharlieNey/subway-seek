import type { Dataset } from "@subway-seek/data";
import { loadDataset } from "@subway-seek/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type AskContext,
  evaluate,
  filterCandidates,
  type MapQuestion,
  type Place,
  type Question,
  questionError,
  questionOrigin,
  RADAR_MILES,
} from "./questions.ts";
import { earliestArrivals, reachableComplexes } from "./reach.ts";
import {
  ANSWER_WINDOW_SECONDS,
  advanceSolo,
  applySoloIntent,
  askReadyAt,
  createSoloRound,
  HIDE_SECONDS,
  nextAnswerAt,
  QUESTION_GAP_SECONDS,
  QUESTION_RULES,
  type SoloRound,
  soloView,
} from "./solo.ts";
import { buildIndex, departures, type TimetableIndex } from "./timetable.ts";
import { applyIntent } from "./transit.ts";

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

  it("asks from where a walk set off until it arrives, even between complexes", () => {
    // Junius St (2 3) to Livonia Av (L) is a walking transfer between two complexes.
    const from = {
      kind: "platform" as const,
      station: station("254"),
      since: TEN,
      arrivedDir: null,
    };
    const walk = applyIntent(from, { type: "transfer", to: station("L26") }, TEN, idx);
    if (!walk.ok) throw new Error(walk.error);
    const origin = questionOrigin(walk.state, TEN + 60, idx);
    expect(origin).toEqual(place("254"));
    const ctx = { origin, baseline: null };
    expect(questionError(ds, { kind: "route", letter: "3" }, ctx)).toBeNull();
    expect(questionError(ds, { kind: "route", letter: "L" }, ctx)).not.toBeNull();
    expect(questionOrigin(walk.state, TEN + 300, idx)).toEqual(place("L26"));
  });

  it("never rules out the hider, whatever is asked", () => {
    const reach = reachableComplexes(idx, station("127"), TEN, TEN + HIDE_SECONDS);
    const pool: MapQuestion[] = [
      ...RADAR_MILES.map((miles) => ({ kind: "radar" as const, miles })),
      ...["1", "A", "L", "7", "Q", "4"].map((letter) => ({ kind: "route" as const, letter })),
      { kind: "borough" },
      { kind: "express" },
      { kind: "moreRoutes" },
      ...(["park", "museum", "library", "hospital", "zoo", "airport"] as const).flatMap(
        (landmark) => [
          { kind: "matching" as const, landmark },
          { kind: "measuring" as const, landmark },
        ],
      ),
      ...(["museum", "library", "hospital", "park"] as const).map((landmark) => ({
        kind: "tentacles" as const,
        landmark,
      })),
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

describe("the answer window", () => {
  const ask = (r: SoloRound, question: Question, t: number) => {
    const res = applySoloIntent(r, { type: "ask", question }, t, idx);
    if (!res.ok) throw new Error(res.error);
    return res.round;
  };

  it("lands a station answer a minute after it's asked, and shows nothing before", () => {
    const r = round();
    const t = r.seekStart;
    const asked = ask(r, { kind: "radar", miles: 1 }, t);
    const entry = asked.asked[0];
    expect(entry?.answerAt).toBe(t + ANSWER_WINDOW_SECONDS);
    const during = soloView(asked, t + ANSWER_WINDOW_SECONDS - 1, idx);
    expect(during.asked[0]).toMatchObject({
      q: { kind: "radar", miles: 1 },
      answer: null,
      remaining: null,
    });
    expect(during.candidates).toEqual(r.reachable);
    expect(during.bonusSeconds).toBe(600); // the price is paid on asking
    const landed = soloView(asked, t + ANSWER_WINDOW_SECONDS, idx);
    expect(landed.asked[0]?.answer).toBe(entry?.answer);
    expect(landed.candidates).toHaveLength(entry?.remaining ?? -1);
    expect(landed.candidates.length).toBeLessThan(r.reachable.length);
    expect(nextAnswerAt(asked, t)).toBe(t + ANSWER_WINDOW_SECONDS);
    expect(nextAnswerAt(asked, t + ANSWER_WINDOW_SECONDS)).toBeNull();
  });

  it("reveals every answer once the round is over, even one still in its window", () => {
    const r = round();
    const t = r.seekStart;
    const asked = ask(r, { kind: "radar", miles: 1 }, t);
    const res = applySoloIntent(asked, { type: "giveUp" }, t + 10, idx);
    if (!res.ok) throw new Error(res.error);
    expect(soloView(res.round, t + 10, idx).asked[0]?.answer).toBe(asked.asked[0]?.answer);
  });
});

describe("solo round", () => {
  it("starts seeking at 10:20 from the hub with the hider somewhere reachable", () => {
    const r = round();
    expect(r.seekStart).toBe(TEN + HIDE_SECONDS);
    expect(r.reachable).toContain(r.hider);
    expect(soloView(r, r.seekStart, idx).hider).toBeNull(); // secret while playing
  });

  it("answers questions, adds the cooldowns, and narrows the candidates", () => {
    const r = round();
    const t = r.seekStart;
    const res = applySoloIntent(r, { type: "ask", question: { kind: "radar", miles: 1 } }, t, idx);
    if (!res.ok) throw new Error(res.error);
    const view = soloView(res.round, t + ANSWER_WINDOW_SECONDS, idx);
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
    // Another category is open after the short gap; radar again only after its cooldown.
    const later = applySoloIntent(
      res.round,
      { type: "ask", question: { kind: "express" } },
      t + QUESTION_GAP_SECONDS,
      idx,
    );
    expect(later.ok).toBe(true);
    const radarAgain = { type: "ask" as const, question: { kind: "radar" as const, miles: 2 } };
    expect(applySoloIntent(res.round, radarAgain, t + QUESTION_GAP_SECONDS, idx).ok).toBe(false);
    const cooled = t + QUESTION_RULES.radar.cooldownSeconds;
    expect(askReadyAt(res.round.asked, "radar")).toBe(cooled);
    expect(applySoloIntent(res.round, radarAgain, cooled, idx).ok).toBe(true);
  });

  it("only lets you ask about a line that stops where you are", () => {
    const r = round();
    const ask = (letter: string) =>
      applySoloIntent(r, { type: "ask", question: { kind: "route", letter } }, r.seekStart, idx);
    expect(ask("7").ok).toBe(true); // Times Sq
    expect(ask("G")).toEqual({
      ok: false,
      error: "You can only ask about a line that stops where you are.",
    });
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
    expect(soloView(done, arrival, idx).hider).toBe(target); // revealed once over
  });

  it("times out after two hours", () => {
    const r = round();
    expect(advanceSolo(r, r.seekEnd, idx).result).toEqual({ kind: "timeout", at: r.seekEnd });
  });
});
