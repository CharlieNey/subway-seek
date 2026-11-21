import type { Dataset } from "@subway-seek/data";
import { loadDataset } from "@subway-seek/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import {
  DIFFICULTY_BANDS,
  type Difficulty,
  type Hardness,
  hardnessTable,
  pickHidingStation,
  seekByQuestions,
  stationsForDifficulty,
} from "./hardness.ts";
import {
  botCurse,
  botPowerup,
  type CurseSituation,
  expectedLeft,
  STRONG_QUESTION_LEFT,
  VETO_KILL_SHOT_LEFT,
  VETO_MAX_CANDIDATES,
} from "./hiderBot.ts";
import { HUB_STATION_IDS } from "./hubs.ts";
import { type AskContext, evaluate, type MapQuestion, questionPool } from "./questions.ts";
import { reachableComplexes } from "./reach.ts";
import { createSoloRound, HIDE_SECONDS } from "./solo.ts";
import { buildIndex, type TimetableIndex } from "./timetable.ts";

const TEN = 10 * 3600;
let ds: Dataset;
let idx: TimetableIndex;
const station = (id: string) => {
  const i = ds.stations.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`no station ${id}`);
  return i;
};
const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

beforeAll(() => {
  ds = loadDataset();
  idx = buildIndex(ds);
});

describe("hardness", () => {
  it("the thrifty seeker pins every station reachable from Times Sq, in 1–8 questions", () => {
    const hub = station("127");
    const reach = reachableComplexes(idx, hub, TEN, TEN + HIDE_SECONDS);
    const table = hardnessTable(idx, hub, TEN, reach);
    expect(table.size).toBe(reach.length);
    const qs = [...table.values()].map((h) => h.questions);
    expect(qs.every((q) => q !== null && q >= 1 && q <= 8)).toBe(true);
    // Every band has something to pick from here, and the bands don't overlap.
    for (const [lo, hi] of Object.values(DIFFICULTY_BANDS)) {
      expect(qs.some((q) => (q as number) >= lo && (q as number) <= hi)).toBe(true);
    }
    expect(DIFFICULTY_BANDS.easy[1]).toBeLessThan(DIFFICULTY_BANDS.normal[0]);
    expect(DIFFICULTY_BANDS.normal[1]).toBeLessThan(DIFFICULTY_BANDS.hard[0]);
  });

  it("measures what it says: the seeker's run ends with one station, the hider", () => {
    const hub = station("127");
    const reach = reachableComplexes(idx, hub, TEN, TEN + HIDE_SECONDS);
    const hider = reach[7] as number;
    const run = seekByQuestions(ds, hub, hider, reach);
    expect(run.left).toEqual([hider]);
    expect(hardnessTable(idx, hub, TEN, reach).get(hider)?.questions).toBe(run.asked.length);
  });

  it("picks from the band, widens an empty one, and prefers twins on Hard", () => {
    const table = new Map<number, Hardness>([
      [1, { questions: 3, twins: 0 }],
      [2, { questions: 5, twins: 0 }],
      [3, { questions: 6, twins: 2 }],
      [4, { questions: 7, twins: 0 }],
      [5, { questions: 7, twins: 1 }],
      [6, { questions: null, twins: 0 }],
    ]);
    const reach = [1, 2, 3, 4, 5, 6];
    expect(stationsForDifficulty(table, reach, "easy")).toEqual([1]);
    expect(stationsForDifficulty(table, reach, "normal")).toEqual([2, 3]);
    expect(stationsForDifficulty(table, reach, "hard")).toEqual([5]);
    // No 7–8 at all: Hard widens to 6–9, then takes the twinned station.
    const easier = new Map(table);
    easier.delete(4);
    easier.delete(5);
    expect(stationsForDifficulty(easier, [1, 2, 3, 6], "hard")).toEqual([3]);
    // Nothing measurable: anywhere.
    expect(stationsForDifficulty(new Map(), [9, 8], "normal")).toEqual([9, 8]);
  });

  it("the round's hider is in its difficulty's band, and the same for the same seed", () => {
    const hub = station("127");
    const reach = reachableComplexes(idx, hub, TEN, TEN + HIDE_SECONDS);
    const table = hardnessTable(idx, hub, TEN, reach);
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const [lo, hi] = DIFFICULTY_BANDS[difficulty];
      for (const seed of [1, 2, 3]) {
        const a = createSoloRound(idx, { hub, hideStart: TEN, random: mulberry(seed), difficulty });
        const b = pickHidingStation(idx, hub, TEN, difficulty, mulberry(seed));
        expect(a.hider).toBe(b.hider);
        expect(a.difficulty).toBe(difficulty);
        const q = table.get(a.hider)?.questions as number;
        expect(q).toBeGreaterThanOrEqual(lo);
        expect(q).toBeLessThanOrEqual(hi);
      }
    }
    // The default is Normal.
    expect(createSoloRound(idx, { hub, hideStart: TEN, random: mulberry(1) }).difficulty).toBe(
      "normal",
    );
  });
});

describe("the bot's card play by difficulty", () => {
  it("vetoes a kill shot with many stations left, but not a merely strong question", () => {
    // Walk the thrifty seeker's runs until a moment with > 30 stations left where some
    // question would cut the map to VETO_KILL_SHOT_LEFT stations, and one that is strong
    // (≤ 55%) but not that sharp.
    let kill: { q: MapQuestion; ctx: AskContext; cands: number[] } | null = null;
    let strong: { q: MapQuestion; ctx: AskContext; cands: number[] } | null = null;
    for (const id of HUB_STATION_IDS) {
      const hub = station(id);
      const reach = reachableComplexes(idx, hub, TEN, TEN + HIDE_SECONDS);
      for (const hider of reach.filter((_, i) => i % 5 === 0)) {
        let cands = [...reach];
        for (const a of seekByQuestions(ds, hub, hider, reach).asked) {
          if (cands.length > VETO_MAX_CANDIDATES) {
            for (const { q, ctx } of questionPool(ds, a.ctx.origin, a.ctx.baseline)) {
              const left = expectedLeft(ds, q, cands, ctx);
              if (!kill && left * cands.length <= VETO_KILL_SHOT_LEFT) kill = { q, ctx, cands };
              if (
                !strong &&
                left <= STRONG_QUESTION_LEFT &&
                left * cands.length > VETO_KILL_SHOT_LEFT
              ) {
                strong = { q, ctx, cands };
              }
            }
          }
          if (kill && strong) break;
          const ans = JSON.stringify(evaluate(ds, a.q, hider, a.ctx));
          cands = cands.filter((c) => JSON.stringify(evaluate(ds, a.q, c, a.ctx)) === ans);
        }
        if (kill && strong) break;
      }
      if (kill && strong) break;
    }
    if (!kill || !strong) throw new Error("expected both a kill shot and a strong question");
    expect(botPowerup(ds, kill.q, kill.ctx, kill.cands, ["veto"], new Set(), () => 0)).toEqual({
      card: "veto",
    });
    expect(
      botPowerup(ds, strong.q, strong.ctx, strong.cands, ["veto"], new Set(), () => 0),
    ).toBeNull();
  });

  it("Easy never curses; Normal and Hard do", () => {
    const hub = station("127");
    const r = createSoloRound(idx, { hub, hideStart: TEN, random: mulberry(4) });
    const situation = (difficulty: Difficulty): CurseSituation => ({
      // On a platform with 10 stations left: Signal loss fits.
      seeker: { kind: "platform", station: hub, since: r.seekStart, arrivedDir: null },
      t: r.seekStart,
      idx,
      hider: r.hider,
      spot: null,
      candidates: 10,
      hand: ["signalLoss", "late5", "late5"],
      difficulty,
    });
    expect(botCurse(situation("easy"))).toBeNull();
    expect(botCurse(situation("normal"))).toBe("signalLoss");
    expect(botCurse(situation("hard"))).toBe("signalLoss");
  });
});
