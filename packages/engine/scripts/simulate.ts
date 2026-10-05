/**
 * Question balance check.
 *
 *   pnpm sim                 # a question every 5 game minutes
 *   pnpm sim --pace 8        # ...or every 8
 *   SIM_RULES='{"radar":{"bonusSeconds":480,"cooldownSeconds":900}}' pnpm sim   # try other rules
 *
 * For every start station (hub) and every complex the hider could reach from it in 20
 * minutes, a simulated seeker asks questions until only the hider's station is left.
 * It asks one question every `pace` game minutes, obeying each category's cooldown.
 * Three seekers:
 *   - greedy:  always the question that tells it the most (expected bits), whatever the price
 *   - thrifty: the most bits per minute, counting the hider's bonus plus the time slot
 *   - static:  thrifty, but asks everything from the start station (a pessimistic bound)
 * Greedy and thrifty move after each answer: they jump to the remaining candidate nearest
 * the middle (free travel, so optimistic), which also changes what they can ask.
 *
 * Balance goals: no category is more than ~35% of either moving seeker's questions,
 * every category gets used, and pinning a station costs the hider ~60–80 bonus minutes.
 */
import type { LandmarkKind } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import {
  type AskContext,
  askReadyAt,
  buildIndex,
  categoryOf,
  distanceMeters,
  evaluate,
  HIDE_SECONDS,
  HUB_STATION_IDS,
  LANDMARK_KINDS,
  type MapQuestion,
  type Place,
  QUESTION_CATEGORIES,
  QUESTION_GAP_SECONDS,
  QUESTION_RULES,
  type Question,
  type QuestionCategory,
  questionError,
  RADAR_MILES,
  reachableComplexes,
  TENTACLE_MILES,
} from "../src/index.ts";

const paceArg = process.argv.indexOf("--pace");
const PACE = Math.max(
  QUESTION_GAP_SECONDS,
  (paceArg >= 0 ? Number(process.argv[paceArg + 1]) : 5) * 60,
);
const PACE_MIN = PACE / 60;
const MAX_SLOTS = 40;

// Try other prices/cooldowns without editing the game's rules.
if (process.env.SIM_RULES) Object.assign(QUESTION_RULES, JSON.parse(process.env.SIM_RULES));

const ds = loadDataset();
const idx = buildIndex(ds);
const TEN = 10 * 3600;
const placeOf = (complex: number): Place => {
  const c = ds.complexes[complex];
  if (!c) throw new Error("complex");
  return { lat: c.lat, lon: c.lon, complex };
};
const tentacleKinds = LANDMARK_KINDS.filter((k) => TENTACLE_MILES[k] !== undefined);

function pool(origin: Place, baseline: Place | null): { q: MapQuestion; ctx: AskContext }[] {
  const qs: MapQuestion[] = [
    ...RADAR_MILES.map((miles) => ({ kind: "radar" as const, miles })),
    ...(ds.complexes[origin.complex]?.routes ?? []).map((letter) => ({
      kind: "route" as const,
      letter,
    })),
    { kind: "borough" },
    { kind: "express" },
    { kind: "moreRoutes" },
    ...LANDMARK_KINDS.flatMap((landmark: LandmarkKind) => [
      { kind: "matching" as const, landmark },
      { kind: "measuring" as const, landmark },
    ]),
    ...tentacleKinds.map((landmark) => ({ kind: "tentacles" as const, landmark })),
    { kind: "thermometer" },
  ];
  return qs.flatMap((q) => {
    const ctx = { origin, baseline: q.kind === "thermometer" ? baseline : null };
    return questionError(ds, q, ctx) ? [] : [{ q, ctx }];
  });
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

type Policy = "greedy" | "thrifty" | "static";

interface Run {
  /** Questions until only one station is left (null if it never got there). */
  toOne: number | null;
  /** Questions until three or fewer are left. */
  toThree: number | null;
  /** Bonus minutes the hider earned by the time the station was pinned (or the end). */
  bonus: number;
  /** Game minutes until pinned. */
  minutes: number | null;
  categories: QuestionCategory[];
  kinds: string[];
}

function play(hub: number, hider: number, reach: number[], policy: Policy): Run {
  let cands = [...reach];
  let origin = placeOf(ds.stations[hub]?.complex as number);
  let baseline: Place | null = policy === "static" ? null : origin;
  const asked: { q: Question; at: number }[] = [];
  const run: Run = {
    toOne: null,
    toThree: null,
    bonus: 0,
    minutes: null,
    categories: [],
    kinds: [],
  };
  for (let slot = 0; slot < MAX_SLOTS && cands.length > 1; slot++) {
    const t = slot * PACE;
    let best: { q: MapQuestion; ctx: AskContext; score: number } | null = null;
    for (const { q, ctx } of pool(origin, baseline)) {
      const category = categoryOf(q);
      if (t < askReadyAt(asked, category)) continue;
      const parts = new Map<string, number>();
      for (const c of cands) {
        const key = JSON.stringify(evaluate(ds, q, c, ctx));
        parts.set(key, (parts.get(key) ?? 0) + 1);
      }
      if (parts.size < 2) continue;
      let bits = 0;
      for (const k of parts.values()) bits += (k / cands.length) * Math.log2(cands.length / k);
      const price = QUESTION_RULES[category].bonusSeconds / 60;
      const score = policy === "greedy" ? bits : bits / (price + PACE_MIN);
      if (!best || score > best.score) best = { q, ctx, score };
    }
    if (!best) continue; // nothing useful is off cooldown: wait for the next slot
    const { q, ctx } = best;
    const answer = JSON.stringify(evaluate(ds, q, hider, ctx));
    cands = cands.filter((c) => JSON.stringify(evaluate(ds, q, c, ctx)) === answer);
    asked.push({ q, at: t });
    run.categories.push(categoryOf(q));
    run.kinds.push(
      q.kind === "matching" || q.kind === "measuring" || q.kind === "tentacles"
        ? `${q.kind}:${q.landmark}`
        : q.kind,
    );
    run.bonus += QUESTION_RULES[categoryOf(q)].bonusSeconds / 60;
    if (run.toThree === null && cands.length <= 3) run.toThree = asked.length;
    if (cands.length === 1) {
      run.toOne = asked.length;
      run.minutes = t / 60;
    }
    if (policy !== "static") {
      baseline = origin;
      origin = nearestToCentre(cands);
    }
  }
  return run;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN);
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? Number.NaN;
};
const share = (items: string[]) => {
  const m = new Map<string, number>();
  for (const k of items) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n / items.length] as const);
};

const games: { hub: number; hider: number; reach: number[] }[] = [];
for (const id of HUB_STATION_IDS) {
  const hub = ds.stations.findIndex((s) => s.id === id);
  const reach = reachableComplexes(idx, hub, TEN, TEN + HIDE_SECONDS);
  for (const hider of reach) games.push({ hub, hider, reach });
}
const avgReach = mean(
  HUB_STATION_IDS.map(
    (id) => games.filter((g) => ds.stations[g.hub]?.id === id)[0]?.reach.length ?? 0,
  ),
);
console.log(
  `${HUB_STATION_IDS.length} start stations, ~${Math.round(avgReach)} possible hiding stations each ` +
    `(${games.length} games per seeker). A question every ${PACE_MIN} min.\n`,
);
const rules = QUESTION_CATEGORIES.map(
  (c) => `${c} +${QUESTION_RULES[c].bonusSeconds / 60}/${QUESTION_RULES[c].cooldownSeconds / 60}m`,
).join(", ");
console.log(`Rules (bonus/cooldown): ${rules}\n`);

for (const policy of ["greedy", "thrifty", "static"] as Policy[]) {
  const runs = games.map((g) => play(g.hub, g.hider, g.reach, policy));
  const pinned = runs.filter((r) => r.toOne !== null);
  console.log(`${policy.toUpperCase()} seeker`);
  console.log(
    `  pins the station in ${pinned.length}/${runs.length} games: ` +
      `mean ${mean(pinned.map((r) => r.toOne as number)).toFixed(1)} questions ` +
      `(p90 ${pct(
        pinned.map((r) => r.toOne as number),
        0.9,
      )}), ` +
      `${Math.round(mean(pinned.map((r) => r.minutes as number)))} game min, ` +
      `hider bonus ~${Math.round(mean(pinned.map((r) => r.bonus)))} min`,
  );
  console.log(
    `  narrows to ≤ 3 in mean ${mean(runs.flatMap((r) => (r.toThree === null ? [] : [r.toThree]))).toFixed(1)} questions`,
  );
  const cats = share(runs.flatMap((r) => r.categories));
  console.log(`  categories: ${cats.map(([k, f]) => `${k} ${Math.round(f * 100)}%`).join(", ")}`);
  const top = share(runs.flatMap((r) => r.kinds)).slice(0, 6);
  console.log(
    `  top questions: ${top.map(([k, f]) => `${k} ${Math.round(f * 100)}%`).join(", ")}\n`,
  );
}
