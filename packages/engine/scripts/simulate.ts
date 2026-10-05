/**
 * How many questions does it take to find the station? (M2 balance check)
 *
 *   pnpm sim
 *
 * For every complex the hider could reach from Times Sq in 20 minutes, a greedy seeker
 * asks whichever question best splits the remaining candidates (lowest expected number
 * left, assuming the hider is equally likely to be at any of them). Two seekers:
 *   - static: asks everything from Times Sq (pessimistic: no movement)
 *   - moving: after each answer, jumps to the candidate nearest the centre of the
 *     remaining ones (optimistic: travel is free), which also unlocks the thermometer
 * Real play sits between the two, and costs travel time the simulation ignores.
 */
import { loadDataset } from "@stand-clear/data/node";
import {
  type Asked,
  buildIndex,
  distanceMeters,
  evaluate,
  HIDE_SECONDS,
  type MapQuestion,
  type Place,
  QUESTION_BONUS_SECONDS,
  questionError,
  RADAR_MILES,
  reachableComplexes,
} from "../src/index.ts";

const ds = loadDataset();
const idx = buildIndex(ds);
const hub = ds.stations.findIndex((s) => s.id === "127");
const TEN = 10 * 3600;
const reach = reachableComplexes(idx, hub, TEN, TEN + HIDE_SECONDS);
const placeOf = (complex: number): Place => {
  const c = ds.complexes[complex];
  if (!c) throw new Error("complex");
  return { lat: c.lat, lon: c.lon, complex };
};
const hubPlace = placeOf(ds.stations[hub]?.complex as number);
const letters = [...new Set(reach.flatMap((c) => ds.complexes[c]?.routes ?? []))].sort();
const MAX_QUESTIONS = 15;

function pool(origin: Place, baseline: Place | null): { q: MapQuestion; ctx: Asked["ctx"] }[] {
  const plain: MapQuestion[] = [
    ...RADAR_MILES.map((miles) => ({ kind: "radar" as const, miles })),
    ...letters.map((letter) => ({ kind: "route" as const, letter })),
    { kind: "borough" },
    { kind: "express" },
    { kind: "moreRoutes" },
  ];
  const out: { q: MapQuestion; ctx: Asked["ctx"] }[] = plain.map((q) => ({
    q,
    ctx: { origin, baseline: null },
  }));
  const thermo = { origin, baseline };
  if (!questionError(ds, { kind: "thermometer" }, thermo))
    out.push({ q: { kind: "thermometer" }, ctx: thermo });
  return out;
}

function nearestToCentre(cands: number[]): Place {
  const lat = cands.reduce((s, c) => s + (ds.complexes[c]?.lat ?? 0), 0) / cands.length;
  const lon = cands.reduce((s, c) => s + (ds.complexes[c]?.lon ?? 0), 0) / cands.length;
  let best = cands[0] as number;
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of cands) {
    const d = distanceMeters(placeOf(c), { lat, lon });
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return placeOf(best);
}

interface Run {
  /** Questions until only one station is left (null if questions ran dry first). */
  toOne: number | null;
  /** Questions until three or fewer are left. */
  toThree: number | null;
  /** Candidates left after each question. */
  curve: number[];
  /** Kind of each question asked, to spot one kind crowding out the rest. */
  kinds: string[];
}

function play(hider: number, moving: boolean): Run {
  let cands = [...reach];
  let origin = hubPlace;
  let baseline: Place | null = null;
  const curve: number[] = [];
  const kinds: string[] = [];
  let toThree: number | null = cands.length <= 3 ? 0 : null;
  for (let n = 1; n <= MAX_QUESTIONS && cands.length > 1; n++) {
    let best: { q: MapQuestion; ctx: Asked["ctx"]; score: number } | null = null;
    for (const { q, ctx } of pool(origin, baseline)) {
      const parts = new Map<string, number>();
      for (const c of cands) {
        const key = String(evaluate(ds, q, c, ctx));
        parts.set(key, (parts.get(key) ?? 0) + 1);
      }
      if (parts.size < 2) continue;
      const score = [...parts.values()].reduce((s, k) => s + k * k, 0) / cands.length;
      if (!best || score < best.score) best = { q, ctx, score };
    }
    if (!best) break;
    const answer = evaluate(ds, best.q, hider, best.ctx);
    cands = cands.filter((c) => evaluate(ds, best.q, c, best.ctx) === answer);
    curve.push(cands.length);
    kinds.push(best.q.kind);
    if (toThree === null && cands.length <= 3) toThree = n;
    if (moving) {
      baseline = best.q.kind === "thermometer" || baseline === null ? origin : baseline;
      origin = nearestToCentre(cands);
    }
  }
  return { toOne: cands.length === 1 ? curve.length : null, toThree, curve, kinds };
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const pick = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? Number.NaN;
  const mean = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  return { mean: mean.toFixed(1), median: pick(0.5), p90: pick(0.9), max: s.at(-1) ?? Number.NaN };
};

console.log(
  `Hider leaves Times Sq at 10:00 with ${HIDE_SECONDS / 60} min: ${reach.length} possible stations ` +
    `(log2 = ${Math.log2(reach.length).toFixed(1)} perfect yes/no questions).\n`,
);
for (const moving of [false, true]) {
  const runs = reach.map((h) => play(h, moving));
  const one = runs.flatMap((r) => (r.toOne === null ? [] : [r.toOne]));
  const three = runs.flatMap((r) => (r.toThree === null ? [] : [r.toThree]));
  const left = (k: number) =>
    (
      runs.reduce((s, r) => s + (r.curve[k - 1] ?? r.curve.at(-1) ?? reach.length), 0) / runs.length
    ).toFixed(1);
  const s1 = stats(one);
  const s3 = stats(three);
  console.log(
    moving
      ? "MOVING seeker (free travel toward the candidates)"
      : "STATIC seeker (asks everything from Times Sq)",
  );
  console.log(
    `  to pin the station:  mean ${s1.mean}, median ${s1.median}, p90 ${s1.p90}, max ${s1.max} questions ` +
      `(${one.length}/${runs.length} solvable)`,
  );
  console.log(
    `  to narrow to ≤ 3:   mean ${s3.mean}, median ${s3.median}, p90 ${s3.p90}, max ${s3.max} questions`,
  );
  console.log(
    `  stations left after 1–8 questions: ${[1, 2, 3, 4, 5, 6, 7, 8].map(left).join(" → ")}`,
  );
  const asked = runs.flatMap((r) => r.kinds);
  const mix = new Map<string, number>();
  for (const k of asked) mix.set(k, (mix.get(k) ?? 0) + 1);
  console.log(
    `  question mix: ${[...mix]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${Math.round((n / asked.length) * 100)}%`)
      .join(", ")}`,
  );
  console.log(
    `  bonus to pin it at +${QUESTION_BONUS_SECONDS / 60} min each: ~${Math.round(Number(s1.mean) * (QUESTION_BONUS_SECONDS / 60))} min\n`,
  );
}
