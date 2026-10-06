/**
 * How hard a station is to find, and the bot's choice of one (S5, DESIGN.md "Bot hider
 * difficulty").
 *
 * A station's hardness is the number of questions a strong seeker needs to pin it: the
 * `pnpm sim` thrifty policy (the most bits per minute, counting the hider's bonus and the
 * time slot; moves toward the candidates after each answer; honours the cooldowns), run
 * from the hub. The simulation and the bot share this code, so what the sim measures is
 * what the bot plays. The bot then picks uniformly from a band of that number: Easy 3–4,
 * Normal 5–6, Hard 7–8 (ties toward stations with a twin).
 */
import type { Dataset } from "@stand-clear/data";
import { distanceMeters } from "./geo.ts";
import {
  type AskContext,
  categoryOf,
  evaluate,
  type MapQuestion,
  type Place,
  partition,
  type Question,
  questionPool,
} from "./questions.ts";
import { reachableComplexes } from "./reach.ts";
import { askReadyAt, HIDE_SECONDS, QUESTION_RULES } from "./solo.ts";
import type { TimetableIndex } from "./timetable.ts";

export type Difficulty = "easy" | "normal" | "hard";
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "hard"];

/** Questions a strong seeker needs to pin the station, inclusive, per level. */
export const DIFFICULTY_BANDS: Record<Difficulty, readonly [number, number]> = {
  easy: [3, 4],
  normal: [5, 6],
  hard: [7, 8],
};

/** The simulated seeker asks this often (game seconds): the gap between any two questions. */
export const SEEKER_PACE_SECONDS = 5 * 60;
/** Give up measuring after this many question slots. */
const MAX_SLOTS = 40;

export type SeekerPolicy = "greedy" | "thrifty";

export function placeOf(ds: Dataset, complex: number): Place {
  const c = ds.complexes[complex];
  if (!c) throw new Error(`no complex ${complex}`);
  return { lat: c.lat, lon: c.lon, complex };
}

/**
 * The question the seeker asks next at `t`, or null if nothing useful is off cooldown.
 * Greedy takes the most expected bits; thrifty the most bits per minute of hider bonus
 * plus the time slot.
 */
export function chooseQuestion(
  ds: Dataset,
  cands: readonly number[],
  pool: readonly { q: MapQuestion; ctx: AskContext }[],
  asked: readonly { q: Question; at: number }[],
  t: number,
  policy: SeekerPolicy,
  paceSeconds = SEEKER_PACE_SECONDS,
): { q: MapQuestion; ctx: AskContext } | null {
  let best: { q: MapQuestion; ctx: AskContext; score: number } | null = null;
  for (const { q, ctx } of pool) {
    const category = categoryOf(q);
    if (t < askReadyAt(asked, category)) continue;
    const parts = partition(ds, q, cands, ctx);
    if (parts.size < 2) continue;
    let bits = 0;
    for (const k of parts.values()) bits += (k / cands.length) * Math.log2(cands.length / k);
    const price = QUESTION_RULES[category].bonusSeconds / 60;
    const score = policy === "greedy" ? bits : bits / (price + paceSeconds / 60);
    if (!best || score > best.score) best = { q, ctx, score };
  }
  return best;
}

/** The candidate nearest the middle of the rest: where a moving seeker goes next. */
export function nearestToCentre(ds: Dataset, cands: readonly number[]): Place {
  const lat = cands.reduce((s, c) => s + (ds.complexes[c]?.lat ?? 0), 0) / cands.length;
  const lon = cands.reduce((s, c) => s + (ds.complexes[c]?.lon ?? 0), 0) / cands.length;
  let best = cands[0] as number;
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of cands) {
    const d = distanceMeters(placeOf(ds, c), { lat, lon });
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return placeOf(ds, best);
}

export interface SeekerRun {
  /** Every question asked, in order, with the time slot it was asked at. */
  asked: { q: MapQuestion; ctx: AskContext; at: number }[];
  /** Candidates left at the end (one if the station was pinned). */
  left: number[];
}

/**
 * A simulated seeker hunts `hider` from `hub` among `reach` by questions alone, moving
 * toward the candidates after each answer (free travel, so optimistic), until one
 * station is left or it runs out of slots.
 */
export function seekByQuestions(
  ds: Dataset,
  hub: number,
  hider: number,
  reach: readonly number[],
  policy: SeekerPolicy = "thrifty",
  paceSeconds = SEEKER_PACE_SECONDS,
): SeekerRun {
  let cands = [...reach];
  let origin = placeOf(ds, ds.stations[hub]?.complex as number);
  let baseline: Place | null = origin;
  const asked: SeekerRun["asked"] = [];
  for (let slot = 0; slot < MAX_SLOTS && cands.length > 1; slot++) {
    const t = slot * paceSeconds;
    const pick = chooseQuestion(
      ds,
      cands,
      questionPool(ds, origin, baseline),
      asked,
      t,
      policy,
      paceSeconds,
    );
    if (!pick) continue;
    const answer = JSON.stringify(evaluate(ds, pick.q, hider, pick.ctx));
    cands = cands.filter((c) => JSON.stringify(evaluate(ds, pick.q, c, pick.ctx)) === answer);
    asked.push({ ...pick, at: t });
    baseline = origin;
    origin = nearestToCentre(ds, cands);
  }
  return { asked, left: cands };
}

export interface Hardness {
  /** Questions the thrifty seeker needs to pin it; null if it never did. */
  questions: number | null;
  /** Other candidates that answer every question asked from the hub the same way. */
  twins: number;
}

const cache = new WeakMap<TimetableIndex, Map<string, Map<number, Hardness>>>();

/** Hardness of every station in `reach` from `hub` (cached per index, hub and start). */
export function hardnessTable(
  idx: TimetableIndex,
  hub: number,
  hideStart: number,
  reach: readonly number[],
): Map<number, Hardness> {
  let byHub = cache.get(idx);
  if (!byHub) {
    byHub = new Map();
    cache.set(idx, byHub);
  }
  const key = `${hub}|${hideStart}|${reach.length}`;
  const hit = byHub.get(key);
  if (hit) return hit;
  const ds = idx.ds;
  const origin = placeOf(ds, ds.stations[hub]?.complex as number);
  const pool = questionPool(ds, origin, null).filter((x) => x.q.kind !== "thermometer");
  const signature = new Map<number, string>();
  for (const c of reach) {
    signature.set(c, pool.map(({ q, ctx }) => JSON.stringify(evaluate(ds, q, c, ctx))).join("|"));
  }
  const table = new Map<number, Hardness>();
  for (const c of reach) {
    const run = seekByQuestions(ds, hub, c, reach);
    const mine = signature.get(c);
    const twins = reach.filter((o) => o !== c && signature.get(o) === mine).length;
    table.set(c, { questions: run.left.length === 1 ? run.asked.length : null, twins });
  }
  byHub.set(key, table);
  return table;
}

/**
 * The stations the bot may hide at for `difficulty`: those in its band, widened a
 * question each side while the band is empty, and on Hard narrowed to the stations with
 * a twin when there are any. Never empty while `reach` isn't.
 */
export function stationsForDifficulty(
  table: ReadonlyMap<number, Hardness>,
  reach: readonly number[],
  difficulty: Difficulty,
): number[] {
  const [lo0, hi0] = DIFFICULTY_BANDS[difficulty];
  for (let widen = 0; widen < 10; widen++) {
    const lo = lo0 - widen;
    const hi = hi0 + widen;
    const band = reach.filter((c) => {
      const q = table.get(c)?.questions;
      return q !== null && q !== undefined && q >= lo && q <= hi;
    });
    if (band.length === 0) continue;
    if (difficulty !== "hard") return band;
    const twinned = band.filter((c) => (table.get(c)?.twins ?? 0) > 0);
    return twinned.length > 0 ? twinned : band;
  }
  return [...reach];
}

/** Where the bot hides: a uniform, seeded pick from the difficulty's stations. */
export function pickHidingStation(
  idx: TimetableIndex,
  hub: number,
  hideStart: number,
  difficulty: Difficulty,
  random: () => number,
): { hider: number; reachable: number[] } {
  const reachable = reachableComplexes(idx, hub, hideStart, hideStart + HIDE_SECONDS);
  if (reachable.length === 0) throw new Error("hider can't reach anywhere");
  const options = stationsForDifficulty(
    hardnessTable(idx, hub, hideStart, reachable),
    reachable,
    difficulty,
  );
  return { hider: options[Math.floor(random() * options.length)] as number, reachable };
}
