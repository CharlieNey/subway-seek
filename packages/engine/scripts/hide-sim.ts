/**
 * Paced S3 scenarios. Same human inputs/seeds at every seeker level, one-second
 * virtual server ticks at 6×, and the production three-real-second action floor.
 * Synthetic panoramas and straight streets: no Google calls or imagery perception.
 * This is an automated playcheck, not thirty real-time manual browser playtests.
 *
 * --station-only plays the round without Street View (SoloRound.stationOnly): the hider
 * stays below at their station and the seeker's street walks are refused, as on a server
 * with no key (DESIGN.md, Playable without Google).
 */
import { writeFileSync } from "node:fs";
import { loadDataset } from "@subway-seek/data/node";
import {
  advanceSolo,
  applyHiderIntent,
  applySoloIntent,
  buildIndex,
  CARD_VALUE,
  CARDS,
  type CardId,
  createHideRound,
  createSeekerDriver,
  DIFFICULTIES,
  type Difficulty,
  defaultHiderExit,
  departures,
  driveSeeker,
  Geometry,
  type HiderIntent,
  HUB_STATION_IDS,
  hashString,
  hiderExits,
  hiderView,
  offsetMeters,
  rejectSeekerAction,
  resolve,
  SEEKER_LEVELS,
  seededRandom,
  setHiderExit,
  soloView,
  stationOnly,
} from "../src/index.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const COUNT = Number(arg("--rounds") ?? 10);
const SEED = Number(arg("--seed") ?? 1);
const CROSSOVER = arg("--endgame-at");
const STATION_ONLY = process.argv.includes("--station-only");
const ds = loadDataset();
const idx = buildIndex(ds);
const geo = new Geometry(idx);
const TEN = 36000;
const STEP = 6;
const names = ["platform-wait", "latest-exit", "never-lock", "lock-far", "lock-near"] as const;
type Run = {
  n: number;
  hub: string;
  strategy: string;
  difficulty: Difficulty;
  crossover: number;
  station: string;
  found: boolean;
  incomplete: boolean;
  minutes: number;
  score: number | null;
  stationMinutes: number | null;
  lock: string | null;
  questions: number;
  cards: string[];
  actions: number;
  minActionRealSeconds: number;
  longestRideIdleRealSeconds: number;
  rejections: Record<string, number>;
};

function play(n: number, difficulty: Difficulty): Run {
  const hubId = HUB_STATION_IDS[n % HUB_STATION_IDS.length] as string;
  const hub = ds.stations.findIndex((s) => s.id === hubId);
  const random = seededRandom(hashString(`human-hide|${SEED}|${n}`));
  let round = createHideRound(idx, {
    hub,
    hideStart: TEN,
    difficulty,
    random,
    roundId: `sim-${n}-${difficulty}`,
  });
  if (STATION_ONLY) round = stationOnly(round);
  let driver = createSeekerDriver();
  const scenario = n % names.length;
  const angle = random() * 2 * Math.PI;
  const opts = {
    ...SEEKER_LEVELS[difficulty],
    ...(CROSSOVER ? { endgameAt: Number(CROSSOVER) } : {}),
  };
  let hiderActAt = -Infinity;
  let lastBotAt = -Infinity;
  let minGap = Infinity;
  let rideIdle = 0;
  let longestRideIdle = 0;
  let actions = 0;
  let exited = false;
  let walked = false;
  const rejections: Record<string, number> = {};
  const human = (intent: HiderIntent, t: number) => {
    const out = applyHiderIntent(round, intent, t, idx);
    if (!out.ok) throw new Error(`Human ${n} ${intent.type} at ${t}: ${out.error}`);
    round = out.round;
    hiderActAt = t;
  };
  // Ride an actual departure; alternate directions without selecting a hidden target.
  const trains = departures(idx, hub, TEN, { horizon: 600 }).filter((d) => {
    const trip = ds.trips[d.trip];
    return trip?.stops.some(
      (s, i) =>
        i > d.stop &&
        (trip.arr[i] ?? Infinity) < round.seekStart &&
        ds.stations[s]?.complex !== ds.stations[hub]?.complex,
    );
  });
  const train = trains[Math.floor(random() * trains.length)];
  if (!train) throw new Error(`No hide train from ${hubId}`);
  human({ type: "board", trip: train.trip, stop: train.stop }, TEN);
  if (scenario === 0) human({ type: "alightAt", stop: train.stop + 1 }, TEN + 18);
  round = advanceSolo(round, round.seekStart, idx);
  if (round.human?.incomplete) throw new Error(`Scenario stayed at start: ${hubId}`);
  for (const exit of hiderExits(round, idx))
    round = setHiderExit(round, exit.exit, {
      lat: exit.lat,
      lon: exit.lon,
      pano: `sim-exit-${exit.exit}`,
    });

  for (let t = round.seekStart; t <= round.seekEnd && !round.result; t += STEP) {
    round = advanceSolo(round, t, idx);
    if (round.result) break;
    // Each human choice is made from the hider's public view, not the bot's memory.
    const h = hiderView(round, t, idx);
    if (t >= hiderActAt + 18 && !h.draw) {
      const own = resolve(h.self, t, idx);
      if (!exited && scenario !== 1 && !STATION_ONLY && own.kind === "platform") {
        human({ type: "exit", exit: defaultHiderExit(round, idx) }, t);
        exited = true;
      } else if (own.kind === "street" && !h.lock && h.zone && !walked) {
        const r = scenario === 4 ? 100 : 320;
        const p = offsetMeters(h.zone, r * Math.cos(angle), r * Math.sin(angle));
        human({ type: "walkTo", ...p, pano: `sim-spot-${n}` }, t);
        walked = true;
      } else if (own.kind === "street" && !h.lock && walked && scenario !== 2) {
        if (!h.spot) throw new Error("Missing hider spot");
        human({ type: "hideHere", ...h.spot }, t);
      } else if (own.kind === "street" && !h.lock && h.zone && scenario === 2) {
        // Move away from the publicly visible seeker until entry freezes the point.
        const seeker = geo.playerPosition(h.seeker, t);
        const a = Math.atan2(
          h.zone.lat - seeker[1],
          (h.zone.lon - seeker[0]) * Math.cos((h.zone.lat * Math.PI) / 180),
        );
        const p = offsetMeters(h.zone, 320 * Math.cos(a), 320 * Math.sin(a));
        if (!h.spot || Math.abs(p.lat - h.spot.lat) + Math.abs(p.lon - h.spot.lon) > 0.00005)
          human({ type: "walkTo", ...p, pano: `sim-mobile-${n}-${t}` }, t);
      } else {
        const incoming = h.incoming.find((a) => a.decision === null);
        if (
          incoming &&
          h.hand.includes("veto") &&
          incoming.remaining <= Math.max(2, h.candidates.length * 0.5)
        ) {
          human({ type: "answer", question: incoming.index, decision: "veto" }, t);
        } else if (
          incoming &&
          h.hand.includes("randomize") &&
          incoming.randomizable &&
          incoming.remaining < h.candidates.length * 0.4
        ) {
          human({ type: "answer", question: incoming.index, decision: "randomize" }, t);
        } else if (!incoming && h.curses.length === 0) {
          const riding = resolve(h.seeker, t, idx).kind === "train";
          const preference: CardId[] = riding ? ["wrongWay", "tourist"] : ["shed"];
          for (const id of preference) {
            const card = h.hand.indexOf(id);
            if (card < 0) continue;
            const payment = h.hand
              .map((c, i) => ({ c, i }))
              .filter((x) => x.i !== card)
              .sort((a, b) => CARD_VALUE[a.c] - CARD_VALUE[b.c])
              .slice(0, CARDS[id].cost ?? 0)
              .map((x) => x.i);
            if (payment.length !== (CARDS[id].cost ?? 0)) continue;
            const out = applyHiderIntent(
              round,
              { type: "playCard", revision: h.handRevision, card, payment },
              t,
              idx,
            );
            if (out.ok) {
              round = out.round;
              hiderActAt = t;
              break;
            }
          }
        }
      }
    }
    const view = soloView(round, t, idx);
    const step = driveSeeker(view, driver, t, idx, 6, opts);
    driver = step.driver;
    if (step.intent) {
      if (Number.isFinite(lastBotAt)) minGap = Math.min(minGap, (t - lastBotAt) / 6);
      lastBotAt = t;
      actions++;
      // Without Street View the server finds no panorama for a street walk.
      const out =
        STATION_ONLY && step.intent.type === "walkTo"
          ? ({ ok: false, error: "No street panorama" } as const)
          : applySoloIntent(round, step.intent, t, idx);
      if (out.ok) round = out.round;
      else {
        rejections[out.error] = (rejections[out.error] ?? 0) + 1;
        driver = rejectSeekerAction(driver, view, step.intent, out.error, t, idx);
      }
    }
    if (!step.intent && resolve(round.seeker, t, idx).kind === "train") rideIdle += STEP / 6;
    else rideIdle = 0;
    longestRideIdle = Math.max(longestRideIdle, rideIdle);
  }
  round = advanceSolo(round, round.seekEnd, idx);
  if (!round.result) throw new Error("Unfinished scenario");
  if (minGap < 3) throw new Error("Pacing violated");
  const view = hiderView(round, round.result.at, idx);
  return {
    n,
    hub: hubId,
    strategy: STATION_ONLY ? "station-only" : (names[scenario] as string),
    difficulty,
    crossover: opts.endgameAt,
    station: ds.complexes[round.hider]?.name ?? "?",
    found: round.result.kind === "found",
    incomplete: !!round.human?.incomplete,
    minutes: (round.result.at - round.seekStart) / 60,
    score: view.scoreSeconds === null ? null : view.scoreSeconds / 60,
    stationMinutes:
      round.stationFoundAt === null ? null : (round.stationFoundAt - round.seekStart) / 60,
    lock: view.lock?.cause ?? null,
    questions: view.asked.length,
    cards: round.cardEvents.map((e) => e.card),
    actions,
    minActionRealSeconds: minGap,
    longestRideIdleRealSeconds: longestRideIdle,
    rejections,
  };
}
const runs: Run[] = [];
const levels = arg("--difficulty") ? [arg("--difficulty") as Difficulty] : DIFFICULTIES;
for (const d of levels)
  for (let n = 0; n < COUNT; n++) {
    runs.push(play(n, d));
    if ((n + 1) % 10 === 0) console.error(`${d}: ${n + 1}/${COUNT} complete`);
  }
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
console.log(
  `Paced human-hide scenarios: ${COUNT} per level; seed ${SEED}; virtual 6× clock; ${STATION_ONLY ? "station only (no Street View)" : "synthetic panoramas"}.`,
);
for (const d of levels) {
  const rs = runs.filter((r) => r.difficulty === d);
  console.log(
    `${d}: crossover ${rs[0]?.crossover}; caught ${rs.filter((r) => r.found).length}/${rs.length}; median seeking ${median(rs.map((r) => r.minutes)).toFixed(1)} min; score ${median(rs.flatMap((r) => (r.score === null ? [] : [r.score]))).toFixed(1)}; min action gap ${Math.min(...rs.map((r) => r.minActionRealSeconds))} real s; longest ride silence ${Math.max(...rs.map((r) => r.longestRideIdleRealSeconds))} real s`,
  );
  for (const r of rs)
    console.log(
      `  ${r.n} ${r.hub} ${r.strategy}: ${r.found ? "found" : "timeout"} ${r.minutes.toFixed(1)} min; ${r.station}; lock ${r.lock}; ${r.actions} actions; rejected ${JSON.stringify(r.rejections)}`,
    );
}
if (arg("--json")) writeFileSync(arg("--json") as string, `${JSON.stringify(runs, null, 2)}\n`);
