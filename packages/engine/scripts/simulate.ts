/**
 * Question balance check.
 *
 *   pnpm sim                 # a question every 5 game minutes
 *   pnpm sim --pace 8        # ...or every 8
 *   SIM_RULES='{"radar":{"bonusSeconds":480,"cooldownSeconds":900}}' pnpm sim   # try other rules
 *   pnpm sim --theme outerBoroughs   # a themed Saturday: its hubs and its search space (themes.ts)
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
import { loadDataset } from "@subway-seek/data/node";
import {
  type AskContext,
  buildIndex,
  categoryOf,
  chooseQuestion,
  type DailyTheme,
  evaluate,
  HIDE_SECONDS,
  HUB_STATION_IDS,
  hardnessTable,
  type MapQuestion,
  nearestToCentre,
  OUTER_HUB_STATION_IDS,
  type Place,
  placeOf,
  QUESTION_CATEGORIES,
  QUESTION_GAP_SECONDS,
  QUESTION_RULES,
  type Question,
  type QuestionCategory,
  questionPool,
  reachableComplexes,
  stationsForDifficulty,
  themeKeep,
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

// A themed day: its own hubs, and only the stations the theme lets the bot hide at.
const themeArg = process.argv.indexOf("--theme");
const THEME = themeArg >= 0 ? (process.argv[themeArg + 1] as DailyTheme) : null;
if (THEME && THEME !== "outerBoroughs") throw new Error(`unknown theme ${THEME}`);
const HUBS: readonly string[] = THEME === "outerBoroughs" ? OUTER_HUB_STATION_IDS : HUB_STATION_IDS;
const keep = themeKeep(idx, THEME);

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

/**
 * One game. The question choice and the move toward the candidates are the engine's
 * (`hardness.ts`), so what the bot's difficulty bands measure is what this reports;
 * "static" is the thrifty policy without moving (a pessimistic bound).
 */
function play(hub: number, hider: number, reach: number[], policy: Policy): Run {
  let cands = [...reach];
  let origin = placeOf(ds, ds.stations[hub]?.complex as number);
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
    const pool: { q: MapQuestion; ctx: AskContext }[] = questionPool(ds, origin, baseline);
    const best = chooseQuestion(
      ds,
      cands,
      pool,
      asked,
      t,
      policy === "greedy" ? "greedy" : "thrifty",
      PACE,
    );
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
      origin = nearestToCentre(ds, cands);
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
for (const id of HUBS) {
  const hub = ds.stations.findIndex((s) => s.id === id);
  const all = reachableComplexes(idx, hub, TEN, TEN + HIDE_SECONDS);
  const reach = keep ? all.filter(keep) : all;
  for (const hider of reach) games.push({ hub, hider, reach });
}
const avgReach = mean(
  HUBS.map((id) => games.filter((g) => ds.stations[g.hub]?.id === id)[0]?.reach.length ?? 0),
);
if (THEME) console.log(`Theme: ${THEME}\n`);
console.log(
  `${HUBS.length} start stations, ~${Math.round(avgReach)} possible hiding stations each ` +
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

/*
 * A themed day's daily: what the bot's Normal band (5–6 questions from a strong seeker,
 * hardness.ts) has to choose from at each of its hubs, beside an ordinary day from the
 * same hub. The daily is always Normal.
 */
if (THEME) {
  console.log("THE DAILY'S NORMAL BAND, themed vs an ordinary day from the same hub");
  for (const id of HUBS) {
    const hub = ds.stations.findIndex((s) => s.id === id);
    const all = reachableComplexes(idx, hub, TEN, TEN + HIDE_SECONDS);
    const kept = keep ? all.filter(keep) : all;
    const describe = (reach: number[]) => {
      const table = hardnessTable(idx, hub, TEN, reach);
      const band = stationsForDifficulty(table, reach, "normal");
      const qs = band.map((c) => table.get(c)?.questions ?? Number.NaN);
      const pinned = reach.filter((c) => table.get(c)?.questions != null).length;
      return `${reach.length} reachable, ${pinned} pinnable, Normal band ${band.length} stations (${Math.min(...qs)}–${Math.max(...qs)} questions, mean ${mean(qs).toFixed(1)})`;
    };
    const name = ds.complexes[ds.stations[hub]?.complex ?? -1]?.name ?? id;
    console.log(`  ${name}`);
    console.log(`    themed:   ${describe(kept)}`);
    console.log(`    ordinary: ${describe(all)}`);
  }
}
