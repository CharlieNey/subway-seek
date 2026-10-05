/**
 * Endgame balance check: how long the street search takes once you're at the right
 * station.
 *
 *   pnpm sim:endgame
 *   pnpm sim:endgame --reveal 30          # try another reveal distance
 *   SIM_RULES='{"onFoot":{"bonusSeconds":300,"cooldownSeconds":180}}' pnpm sim:endgame
 *
 * For a sample of the stations a hider can reach from the 13 start stations, the bot
 * hides at random points 60–360 m from the station (as the server picks spots), and the
 * seeker comes up at a random exit. It walks in 10 m steps toward the nearest place the
 * hider could still be, seeing everything within the reveal distance. Two seekers:
 *   - walker: never asks, just sweeps
 *   - asker:  asks an on-foot question whenever the search time it should save beats
 *             its price (a free walking thermometer is started at the exit)
 * Flat-earth meters (x east, y north) and straight-line walking at the game's pace, so
 * it's optimistic: real streets go around blocks. Spot photos aren't modelled (they're
 * for a person to read).
 *
 * Target: the endgame is a third to half of the seeking time. Finding the station takes
 * ~25–30 game-min, so that's roughly 13–30 game-min here.
 */
import { loadDataset } from "@stand-clear/data/node";
import {
  buildIndex,
  CATCH_METERS,
  FOOT_THERMOMETER_MIN_METERS,
  HIDE_SECONDS,
  HUB_STATION_IDS,
  ON_FOOT_RANGE_M,
  QUESTION_RULES,
  reachableComplexes,
  SEARCH_GRID_M,
  SPOT_RADAR_METERS,
  SPOT_REVEAL_METERS,
  WALK_DETOUR,
  WALK_MPS,
  ZONE_RADIUS_M,
} from "../src/index.ts";

if (process.env.SIM_RULES) Object.assign(QUESTION_RULES, JSON.parse(process.env.SIM_RULES));
const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const REVEAL = arg("--reveal", SPOT_REVEAL_METERS);
const STATIONS = arg("--stations", 120);
const SPOTS_PER_STATION = 4;
const STEP_M = 10;
const SECONDS_PER_M = WALK_DETOUR / WALK_MPS;
const CAP_SECONDS = 2 * 3600;
const PRICE_MIN = () => QUESTION_RULES.onFoot.bonusSeconds / 60;
const COOLDOWN = () => QUESTION_RULES.onFoot.cooldownSeconds;

const ds = loadDataset();
const idx = buildIndex(ds);

/** Deterministic PRNG, so runs are comparable. */
function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The grid: the zone circle around the station, as in search.ts.
const G = SEARCH_GRID_M;
const SIDE = Math.floor((2 * ZONE_RADIUS_M) / G) + 1;
const cellX = new Float64Array(SIDE * SIDE);
const cellY = new Float64Array(SIDE * SIDE);
const inZone = new Uint8Array(SIDE * SIDE);
for (let iy = 0; iy < SIDE; iy++) {
  for (let ix = 0; ix < SIDE; ix++) {
    const i = iy * SIDE + ix;
    cellX[i] = -ZONE_RADIUS_M + ix * G;
    cellY[i] = -ZONE_RADIUS_M + iy * G;
    inZone[i] = (cellX[i] as number) ** 2 + (cellY[i] as number) ** 2 <= ZONE_RADIUS_M ** 2 ? 1 : 0;
  }
}

type Q = { kind: "radar"; m: number } | { kind: "thermo" };
type P = [number, number];
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Same rules as evaluateSpot, in flat meters. */
function answer(q: Q, p: P, me: P, base: P | null): string {
  const d = dist(p, me);
  if (d > ON_FOOT_RANGE_M) return "far";
  if (q.kind === "radar") return String(d <= q.m);
  return d < dist(p, base as P) ? "hotter" : "colder";
}

interface Run {
  minutes: number;
  bonus: number;
  asked: string[];
  stuck: boolean;
}

function play(spot: P, start: P, asks: boolean): Run {
  const alive = inZone.slice();
  let me: P = [...start];
  let base: P | null = asks ? [...start] : null;
  let t = 0;
  let ready = 0;
  let lastLook = Number.NEGATIVE_INFINITY;
  const run: Run = { minutes: 0, bonus: 0, asked: [], stuck: false };
  const sweepSecondsPerCell = (G * G * SECONDS_PER_M) / (2 * REVEAL);
  const kill = () => {
    const r = REVEAL - 1;
    const ix0 = Math.max(0, Math.floor((me[0] - r + ZONE_RADIUS_M) / G));
    const ix1 = Math.min(SIDE - 1, Math.ceil((me[0] + r + ZONE_RADIUS_M) / G));
    const iy0 = Math.max(0, Math.floor((me[1] - r + ZONE_RADIUS_M) / G));
    const iy1 = Math.min(SIDE - 1, Math.ceil((me[1] + r + ZONE_RADIUS_M) / G));
    for (let iy = iy0; iy <= iy1; iy++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const i = iy * SIDE + ix;
        if (alive[i] && Math.hypot((cellX[i] as number) - me[0], (cellY[i] as number) - me[1]) < r)
          alive[i] = 0;
      }
    }
  };
  const finish = () => {
    t += Math.max(0, dist(me, spot) - CATCH_METERS) * SECONDS_PER_M;
    run.minutes = t / 60;
    return run;
  };
  if (dist(me, spot) <= REVEAL) return finish();
  kill();

  while (t < CAP_SECONDS) {
    // Ask, when a question is off cooldown and worth its price (looked at every 30 s).
    if (asks && t >= ready && t - lastLook >= 30) {
      lastLook = t;
      const options: Q[] = [...SPOT_RADAR_METERS.map((m) => ({ kind: "radar" as const, m }))];
      if (base && dist(base, me) >= FOOT_THERMOMETER_MIN_METERS) options.push({ kind: "thermo" });
      let n = 0;
      for (let i = 0; i < alive.length; i++) n += alive[i] as number;
      let best: { q: Q; saved: number } | null = null;
      for (const q of options) {
        const parts = new Map<string, number>();
        for (let i = 0; i < alive.length; i++) {
          if (!alive[i]) continue;
          const k = answer(q, [cellX[i] as number, cellY[i] as number], me, base);
          parts.set(k, (parts.get(k) ?? 0) + 1);
        }
        let expected = 0;
        for (const k of parts.values()) expected += (k * k) / n;
        const saved = ((n - expected) * sweepSecondsPerCell) / 60;
        if (!best || saved > best.saved) best = { q, saved };
      }
      if (best && best.saved > PRICE_MIN()) {
        const truth = answer(best.q, spot, me, base);
        for (let i = 0; i < alive.length; i++) {
          if (
            alive[i] &&
            answer(best.q, [cellX[i] as number, cellY[i] as number], me, base) !== truth
          )
            alive[i] = 0;
        }
        run.bonus += PRICE_MIN();
        run.asked.push(best.q.kind);
        ready = t + COOLDOWN();
        if (best.q.kind === "thermo") base = [...me];
        continue;
      }
    }
    // Walk a step toward the nearest place they could be.
    let target = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < alive.length; i++) {
      if (!alive[i]) continue;
      const d = Math.hypot((cellX[i] as number) - me[0], (cellY[i] as number) - me[1]);
      if (d < bestD) {
        bestD = d;
        target = i;
      }
    }
    if (target < 0) {
      // Everything looks searched but they weren't seen (a spot between grid points
      // at the edge of sight): count it and stop.
      run.stuck = true;
      run.minutes = t / 60;
      return run;
    }
    const step = Math.min(STEP_M, bestD);
    const f = bestD === 0 ? 0 : step / bestD;
    me = [
      me[0] + f * ((cellX[target] as number) - me[0]),
      me[1] + f * ((cellY[target] as number) - me[1]),
    ];
    t += Math.max(step, 1) * SECONDS_PER_M;
    if (dist(me, spot) <= REVEAL - 0.5) return finish();
    kill();
  }
  run.minutes = t / 60;
  return run;
}

// Hiding stations: the ones a hider can reach from the start stations, sampled.
const TEN = 10 * 3600;
const reachable = new Set<number>();
for (const id of HUB_STATION_IDS) {
  const hub = ds.stations.findIndex((s) => s.id === id);
  for (const c of reachableComplexes(idx, hub, TEN, TEN + HIDE_SECONDS)) reachable.add(c);
}
const random = mulberry(7);
const pool = [...reachable];
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [pool[i], pool[j]] = [pool[j] as number, pool[i] as number];
}
const games: { spot: P; start: P }[] = [];
for (const c of pool.slice(0, STATIONS)) {
  const complex = ds.complexes[c];
  if (!complex) continue;
  const kx = 111_320 * Math.cos((complex.lat * Math.PI) / 180);
  for (let k = 0; k < SPOTS_PER_STATION; k++) {
    const angle = random() * 2 * Math.PI;
    const r = Math.sqrt(60 ** 2 + random() * (360 ** 2 - 60 ** 2));
    const [elat, elon] = complex.exits[Math.floor(random() * complex.exits.length)] ?? [
      complex.lat,
      complex.lon,
    ];
    games.push({
      spot: [r * Math.cos(angle), r * Math.sin(angle)],
      start: [(elon - complex.lon) * kx, (elat - complex.lat) * 110_540],
    });
  }
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? Number.NaN;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const r1 = (x: number) => Math.round(x * 10) / 10;

const onFoot = QUESTION_RULES.onFoot;
console.log(
  `${games.length} endgames (${STATIONS} stations × ${SPOTS_PER_STATION} spots). Reveal ${REVEAL} m, ` +
    `on-foot questions +${onFoot.bonusSeconds / 60} min, ${onFoot.cooldownSeconds / 60} min cooldown.\n`,
);
for (const asks of [false, true]) {
  const runs = games.map((g) => play(g.spot, g.start, asks));
  const mins = runs.map((r) => r.minutes);
  const med = pct(mins, 0.5);
  console.log(asks ? "ASKER (questions when worth it)" : "WALKER (no questions)");
  console.log(
    `  endgame: median ${r1(med)} game min (p25 ${r1(pct(mins, 0.25))}, p75 ${r1(pct(mins, 0.75))}, ` +
      `p90 ${r1(pct(mins, 0.9))})${runs.some((r) => r.stuck) ? `, stuck ${runs.filter((r) => r.stuck).length}` : ""}`,
  );
  if (asks) {
    const kinds = runs.flatMap((r) => r.asked);
    const mix = ["radar", "thermo"]
      .map(
        (k) =>
          `${k} ${Math.round((kinds.filter((x) => x === k).length / Math.max(1, kinds.length)) * 100)}%`,
      )
      .join(", ");
    console.log(
      `  questions: mean ${r1(mean(runs.map((r) => r.asked.length)))} (${mix}), ` +
        `hider bonus ~${Math.round(mean(runs.map((r) => r.bonus)))} min`,
    );
  }
  const share = (station: number) => Math.round((med / (station + med)) * 100);
  console.log(
    `  endgame share of seeking (median): ${share(25)}% if the station took 25 min, ${share(30)}% if 30\n`,
  );
}
