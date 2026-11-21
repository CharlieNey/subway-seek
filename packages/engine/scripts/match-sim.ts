/**
 * S4 balance check: a bot seeker plays whole solo rounds against the bot hider, on the
 * real timetable with real travel time, so the deck mix, curse prices and the bot's
 * thresholds can be set from data.
 *
 *   pnpm sim:match                          # 13 hubs × 20 rounds × 3 difficulties
 *   pnpm sim:match --rounds 5 --hub 127 --difficulty hard --seed 7
 *   pnpm sim:match --endgame-at 2 --min-bits 0.5
 *   SIM_RULES='{"radar":{"bonusSeconds":480}}' pnpm sim:match       # question prices, as pnpm sim
 *   SIM_DECK='{"veto":2,"tourist":3}' pnpm sim:match                 # deck counts
 *   SIM_COST='{"tourist":1}' pnpm sim:match                          # curse costs (cards)
 *
 * The seeker (src/seekerBot.ts) sees only its SoloView: it asks the thrifty question when
 * one is ready, rides toward the candidates between answers, and with 3 or fewer left goes
 * to the nearest one, comes up, and sweeps the street with on-foot questions when they pay.
 * The hider is the engine's bot. The spot is a point 60–360 m from the station (no Street
 * View here), so the street is straight-line, as in `pnpm sim:endgame`. Fog and Signal loss
 * cost a bot nothing, and nobody asks for photos (a bot can't read one).
 *
 * Each round with a curse is replayed from the same seed with curses off (the round's
 * difficulty set to Easy after the hider is placed, which is the only thing Easy changes
 * at play time), and the difference in the seeker's time is the curse's measured cost.
 */
import { loadDataset } from "@subway-seek/data/node";
import {
  bonusSeconds,
  buildIndex,
  CARDS,
  type CardId,
  type CurseId,
  categoryOf,
  createSoloRound,
  DECK_COUNTS,
  DIFFICULTIES,
  type Difficulty,
  evaluate,
  filterCandidates,
  HUB_STATION_IDS,
  handBonusSeconds,
  hashString,
  isMapQuestion,
  isVetoed,
  offsetMeters,
  placeHider,
  QUESTION_CATEGORIES,
  QUESTION_RULES,
  type QuestionCategory,
  questionBonusSeconds,
  resolve,
  runSeeker,
  SEEKER_DEFAULTS,
  type SeekerOptions,
  type SeekerStep,
  type SoloRound,
  type SoloView,
  sameAnswer,
  seededRandom,
} from "../src/index.ts";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const num = (name: string, fallback: number) => {
  const v = arg(name);
  return v === undefined ? fallback : Number(v);
};
const ROUNDS = num("--rounds", 20);
const SEED = num("--seed", 1);
const HUBS = arg("--hub") ? [arg("--hub") as string] : [...HUB_STATION_IDS];
const LEVELS: Difficulty[] = arg("--difficulty")
  ? [arg("--difficulty") as Difficulty]
  : [...DIFFICULTIES];
const OPTS: SeekerOptions = {
  ...SEEKER_DEFAULTS,
  endgameAt: num("--endgame-at", SEEKER_DEFAULTS.endgameAt),
  minBits: num("--min-bits", SEEKER_DEFAULTS.minBits),
};
const MAX_STEPS = 20_000;
/** --trace HUB:LEVEL:N (e.g. 127:normal:0): print every step of that round. */
const TRACE = arg("--trace");

// Try other rules without editing the game.
if (process.env.SIM_RULES) Object.assign(QUESTION_RULES, JSON.parse(process.env.SIM_RULES));
if (process.env.SIM_DECK) Object.assign(DECK_COUNTS, JSON.parse(process.env.SIM_DECK));
if (process.env.SIM_COST) {
  for (const [id, cost] of Object.entries(
    JSON.parse(process.env.SIM_COST) as Record<string, number>,
  )) {
    CARDS[id as CardId].cost = cost;
  }
}

const ds = loadDataset();
const idx = buildIndex(ds);
const TEN = 10 * 3600;
const CURSES = (Object.keys(CARDS) as CardId[]).filter(
  (c) => CARDS[c].kind === "curse",
) as CurseId[];
const CARD_IDS = Object.keys(CARDS) as CardId[];

interface Run {
  hub: string;
  difficulty: Difficulty;
  /** This round, for --trace. */
  key: string;
  found: boolean;
  /** Game minutes from the start of seeking. */
  stationMin: number | null;
  totalMin: number;
  endgameMin: number | null;
  scoreMin: number;
  questionBonusMin: number;
  handBonusMin: number;
  /** Every question asked (vetoed ones too), by category. */
  categories: QuestionCategory[];
  /** Stations each veto kept in play: how many the answer would have ruled out. */
  vetoSaved: number[];
  randomized: number;
  drawn: Partial<Record<CardId, number>>;
  played: Partial<Record<CardId, number>>;
  curses: CurseId[];
  /** Exits taken before the hider's station was reached. */
  wrongStations: number;
  /** Caught from a neighbouring station's street, never having stood in the hider's station. */
  fromNeighbour: boolean;
  rejections: Map<string, number>;
  steps: number;
  stalled: boolean;
  /** Wall-clock ms. */
  ms: number;
  /** Set when a curse was played: the same round with curses off. */
  noCurse?: { stationMin: number | null; totalMin: number };
}

/** One line per decision, for --trace. */
function traceStep(view: SoloView, step: SeekerStep, t: number) {
  const s = resolve(view.seeker, t, idx);
  const where =
    s.kind === "train"
      ? `train ${ds.routes[ds.trips[s.trip]?.route ?? 0]?.letter} ${s.trip}→${s.to}`
      : s.kind === "platform"
        ? `platform ${ds.stations[s.station]?.name}`
        : s.kind === "street"
          ? `street ${ds.complexes[s.complex]?.name}`
          : `walking (${s.reason})`;
  const curses = view.curses.map((c) => c.card).join(",");
  console.log(
    `${((t - view.seekStart) / 60).toFixed(1)}m ${where} cands ${view.candidates.length}${curses ? ` [${curses}]` : ""} ` +
      ("intents" in step
        ? JSON.stringify(step.intents)
        : `wait ${Math.round(step.waitUntil - t)}s`),
  );
}

/** Play `round` to the end with the bot seeker. */
function play(start: SoloRound, trace = false): Run {
  const clock = performance.now();
  const { round, steps, rejections, exitsAt } = runSeeker(
    start,
    idx,
    OPTS,
    MAX_STEPS,
    trace ? traceStep : undefined,
  );
  const ms = performance.now() - clock;
  const result = round.result ?? { kind: "timeout" as const, at: round.seekEnd };
  const seek = (x: number) => (x - round.seekStart) / 60;
  const found = result.kind === "found";
  // The engine dates the endgame from standing in the hider's station or, caught from a
  // neighbouring station's street, from coming up there (stationFoundAt, 2026-10-07).
  const endgameFrom = round.stationFoundAt;
  const at = resolve(round.seeker, result.at, idx);
  const fromNeighbour = found && at.kind === "street" && at.complex !== round.hider;
  // Exits taken before the endgame began; the neighbour's own exit isn't a wrong station.
  const wrongStations =
    exitsAt.filter((x) => x < (endgameFrom ?? Number.POSITIVE_INFINITY)).length -
    (fromNeighbour ? 1 : 0);
  const drawn: Partial<Record<CardId, number>> = {};
  for (const c of CARD_IDS) {
    const left = round.deck.filter((x) => x === c).length;
    if (DECK_COUNTS[c] - left > 0) drawn[c] = DECK_COUNTS[c] - left;
  }
  const played: Partial<Record<CardId, number>> = {};
  for (const e of round.cardEvents) played[e.card] = (played[e.card] ?? 0) + 1;
  const vetoSaved: number[] = [];
  for (const a of round.asked) {
    if (!isVetoed(a.answer) || !isMapQuestion(a.q)) continue;
    const landed = round.asked.filter((o) => o.answerAt <= a.at);
    const before = filterCandidates(ds, round.reachable, landed);
    const truth = evaluate(ds, a.q, round.hider, a.ctx);
    const after = before.filter((c) => sameAnswer(evaluate(ds, a.q as never, c, a.ctx), truth));
    vetoSaved.push(before.length - after.length);
  }
  return {
    hub: ds.stations[round.hub]?.id ?? "?",
    difficulty: round.difficulty,
    key: "",
    found,
    stationMin: endgameFrom === null ? null : seek(endgameFrom),
    totalMin: seek(result.at),
    endgameMin: endgameFrom === null ? null : (result.at - endgameFrom) / 60,
    scoreMin: seek(result.at) + bonusSeconds(round) / 60,
    questionBonusMin: questionBonusSeconds(round.asked) / 60,
    handBonusMin: handBonusSeconds(round.hand) / 60,
    categories: round.asked.map((a) => categoryOf(a.q)),
    vetoSaved,
    randomized: round.asked.filter((a) => a.randomizedFrom).length,
    drawn,
    played,
    curses: round.cardEvents
      .map((e) => e.card)
      .filter((c): c is CurseId => CURSES.includes(c as CurseId)),
    wrongStations,
    fromNeighbour,
    rejections,
    steps,
    stalled: steps >= MAX_STEPS,
    ms,
  };
}

/** A round from `hub` at `difficulty`, the hider placed at a seeded spot 60–360 m out. */
function setUp(hubId: string, difficulty: Difficulty, i: number): SoloRound {
  const hub = ds.stations.findIndex((s) => s.id === hubId);
  const random = seededRandom(hashString(`match|${SEED}|${hubId}|${difficulty}|${i}`));
  const round = createSoloRound(idx, { hub, hideStart: TEN, random, difficulty });
  const spotRandom = seededRandom(hashString(`spot|${SEED}|${hubId}|${difficulty}|${i}`));
  const angle = spotRandom() * 2 * Math.PI;
  const r = Math.sqrt(60 ** 2 + spotRandom() * (360 ** 2 - 60 ** 2));
  const c = ds.complexes[round.hider];
  if (!c) throw new Error("no hider complex");
  const spot = offsetMeters(c, r * Math.cos(angle), r * Math.sin(angle));
  return placeHider(round, { ...spot, pano: "sim" }, idx);
}

const started = Date.now();
const runs: Run[] = [];
for (const level of LEVELS) {
  for (const hubId of HUBS) {
    for (let i = 0; i < ROUNDS; i++) {
      const start = setUp(hubId, level, i);
      const run = play(start, TRACE === `${hubId}:${level}:${i}`);
      run.key = `${hubId}:${level}:${i}`;
      if (run.curses.length > 0) {
        const quiet = play({ ...start, difficulty: "easy" });
        run.noCurse = { stationMin: quiet.stationMin, totalMin: quiet.totalMin };
      }
      runs.push(run);
    }
  }
}

// ---- Report ---------------------------------------------------------------------------

const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] as number;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN);
const r0 = (x: number) => (Number.isNaN(x) ? "–" : String(Math.round(x)));
const r1 = (x: number) => (Number.isNaN(x) ? "–" : String(Math.round(x * 10) / 10));
const r2 = (x: number) => (Number.isNaN(x) ? "–" : String(Math.round(x * 100) / 100));
const spread = (xs: number[]) =>
  `median ${r0(pct(xs, 0.5))} (p25 ${r0(pct(xs, 0.25))}, p90 ${r0(pct(xs, 0.9))})`;
const share = (n: number, of: number) => `${Math.round((100 * n) / Math.max(1, of))}%`;

console.log(
  `${runs.length} rounds: ${HUBS.length} hubs × ${ROUNDS} × ${LEVELS.join("/")}, seed ${SEED}, ` +
    `endgame at ≤ ${OPTS.endgameAt} stations, min ${OPTS.minBits} bits a question. ` +
    `${Math.round((Date.now() - started) / 1000)} s.\n`,
);
if (arg("--timing") !== undefined) {
  console.log(
    `timing: ${r1(mean(runs.map((r) => r.ms)))} ms a round (max ${r0(Math.max(...runs.map((r) => r.ms)))}); ` +
      `${Math.round(mean(runs.map((r) => r.steps)))} steps a round, max ${Math.max(...runs.map((r) => r.steps))}\n`,
  );
}
if (arg("--failures") !== undefined) {
  const bad = runs.filter((r) => !r.found);
  console.log(`not found: ${bad.map((r) => `${r.key}${r.stalled ? "!" : ""}`).join(" ")}\n`);
}
const costs = CURSES.map((c) => `${c} ${CARDS[c].cost}`).join(", ");
console.log(
  `Deck ${Object.values(DECK_COUNTS).reduce((a, b) => a + b, 0)}: curse costs ${costs}.\n`,
);

for (const level of LEVELS) {
  const rs = runs.filter((r) => r.difficulty === level);
  const n = rs.length;
  const found = rs.filter((r) => r.found);
  const stationMins = rs.flatMap((r) => (r.stationMin === null ? [] : [r.stationMin]));
  const endgameMins = found.flatMap((r) => (r.endgameMin === null ? [] : [r.endgameMin]));
  const shares = found.flatMap((r) =>
    r.endgameMin === null ? [] : [(100 * r.endgameMin) / Math.max(1, r.totalMin)],
  );
  console.log(`${level.toUpperCase()} — ${n} rounds`);
  console.log(
    `  found ${share(found.length, n)}, timed out ${share(n - found.length, n)}` +
      `${rs.some((r) => r.stalled) ? `, stalled ${rs.filter((r) => r.stalled).length}` : ""}; ` +
      `station reached in ${share(stationMins.length, n)}`,
  );
  console.log(`  station found: ${spread(stationMins)} game-min`);
  console.log(
    `  endgame: ${spread(endgameMins)} game-min, ${r0(pct(shares, 0.5))}% of seeking (median share; p25 ${r0(pct(shares, 0.25))}, p90 ${r0(pct(shares, 0.9))})`,
  );
  console.log(
    `  seeking total: ${spread(rs.map((r) => r.totalMin))}; hider score: ${spread(rs.map((r) => r.scoreMin))} ` +
      `(questions ~${r0(mean(rs.map((r) => r.questionBonusMin)))} min, held cards ~${r0(mean(rs.map((r) => r.handBonusMin)))} min)`,
  );
  const cats = rs.flatMap((r) => r.categories);
  const station = cats.filter((c) => c !== "onFoot");
  const mix = QUESTION_CATEGORIES.filter((c) => c !== "onFoot" && c !== "photo")
    .map((c) => `${c} ${share(station.filter((x) => x === c).length, station.length)}`)
    .join(", ");
  console.log(
    `  questions: ${r1(station.length / n)} station questions a round (${mix}); ` +
      `${r1(cats.filter((c) => c === "onFoot").length / n)} on foot`,
  );
  const drawn = CARD_IDS.map((c) => [c, mean(rs.map((r) => r.drawn[c] ?? 0))] as const).filter(
    ([, v]) => v > 0,
  );
  const played = CARD_IDS.map((c) => [c, mean(rs.map((r) => r.played[c] ?? 0))] as const).filter(
    ([, v]) => v > 0,
  );
  console.log(
    `  cards a round: drawn ${r1(drawn.reduce((a, [, v]) => a + v, 0))} (${drawn.map(([c, v]) => `${c} ${r1(v)}`).join(", ")})`,
  );
  console.log(
    `    played ${r2(played.reduce((a, [, v]) => a + v, 0))} (${played.map(([c, v]) => `${c} ${r2(v)}`).join(", ")})`,
  );
  const saved = rs.flatMap((r) => r.vetoSaved);
  console.log(
    `  vetoes: ${r2(saved.length / n)} a round, each keeping ${r1(mean(saved))} stations in play (median ${r0(pct(saved, 0.5))}); ` +
      `randomized ${r2(mean(rs.map((r) => r.randomized)))} a round`,
  );
  for (const c of CURSES) {
    const withIt = rs.filter((r) => r.curses.includes(c));
    if (withIt.length === 0) continue;
    const alone = withIt.filter((r) => r.curses.length === 1 && r.noCurse);
    const delta = alone.map((r) => r.totalMin - (r.noCurse as { totalMin: number }).totalMin);
    const dStation = alone.flatMap((r) =>
      r.stationMin !== null && r.noCurse?.stationMin != null
        ? [r.stationMin - r.noCurse.stationMin]
        : [],
    );
    console.log(
      `  ${c}: played in ${share(withIt.length, n)} of rounds` +
        (alone.length > 0
          ? `; as the only curse (n=${alone.length}) it cost the seeker ${r1(mean(delta))} min (median ${r1(pct(delta, 0.5))}), ${r1(mean(dStation))} of it before the station`
          : ""),
    );
  }
  const mixed = rs.filter((r) => r.curses.length > 1 && r.noCurse);
  if (mixed.length > 0) {
    const delta = mixed.map((r) => r.totalMin - (r.noCurse as { totalMin: number }).totalMin);
    console.log(`  several curses (n=${mixed.length}): ${r1(mean(delta))} min together`);
  }
  console.log(
    `  wrong stations visited: ${r2(mean(rs.map((r) => r.wrongStations)))} a round; ` +
      `caught from a neighbouring station's street in ${share(rs.filter((r) => r.fromNeighbour).length, n)}`,
  );
  const rej = new Map<string, number>();
  for (const r of rs) for (const [k, v] of r.rejections) rej.set(k, (rej.get(k) ?? 0) + v);
  if (rej.size > 0) {
    console.log(`  rejections: ${[...rej].map(([k, v]) => `${v}× ${k}`).join("; ")}`);
  }
  console.log();
}
