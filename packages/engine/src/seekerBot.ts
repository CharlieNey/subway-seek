/**
 * The bot seeker (S3/S4). It plays a solo round from the seeker's view alone: `seekerStep`
 * takes a SoloView, never the round, so by type it can't read the hider's station, spot
 * or hand. It asks the thrifty question whenever one is ready (hardness.ts, the policy the
 * difficulty bands are measured with), rides toward the candidates between answers
 * (reach.ts), and with few stations left goes to look: up at an exit, then a sweep toward
 * the nearest place the hider could still be, asking on foot when a question's expected
 * saving beats its price, as `pnpm sim:endgame` walks. Curses it handles by re-planning:
 * Wrong way by riding a stop the required way, Tourist by the walk the card demands.
 */
import type { Dataset, Direction } from "@stand-clear/data";
import { TOURIST_WALK_M } from "./cards.ts";
import { distanceMeters, localMeters, offsetMeters } from "./geo.ts";
import { chooseQuestion, nearestToCentre } from "./hardness.ts";
import {
  type Answer,
  type AskContext,
  closedQuestions,
  FOOT_THERMOMETER_MIN_METERS,
  isSpotQuestion,
  isVetoed,
  type MapQuestion,
  ON_FOOT_RANGE_M,
  type Place,
  partition,
  QUESTION_CATEGORIES,
  type Question,
  questionKey,
  questionOrigin,
  questionPool,
  SPOT_RADAR_METERS,
  type SpotQuestion,
  ZONE_RADIUS_M,
} from "./questions.ts";
import { earliestJourney, type Leg } from "./reach.ts";
import { SEARCH_GRID_M, searchGrid } from "./search.ts";
import {
  type ActiveCurse,
  advanceSolo,
  applySoloIntent,
  askReadyAt,
  CATCH_METERS,
  type FootSegment,
  QUESTION_GAP_SECONDS,
  QUESTION_RULES,
  type SoloIntent,
  type SoloRound,
  type SoloView,
  SPOT_REVEAL_METERS,
  skipSolo,
  soloView,
} from "./solo.ts";
import { departures, type TimetableIndex } from "./timetable.ts";
import {
  ENTER_SECONDS,
  nextEventTime,
  type OnPlatform,
  type OnStreet,
  type OnTrain,
  resolve,
  STREET_RADIUS_M,
  streetPoint,
  type TransitIntent,
  WALK_DETOUR,
  WALK_MPS,
  walkSeconds,
} from "./transit.ts";

export interface SeekerOptions {
  /** Go and look once this many stations or fewer are left. */
  endgameAt: number;
  /** Don't ask a station question expected to tell less than this many bits. */
  minBits: number;
  /** Plan journeys at most this far ahead (game seconds); the round's end if nothing fits. */
  horizonSeconds: number;
}

export const SEEKER_DEFAULTS: SeekerOptions = {
  endgameAt: 3,
  minBits: 0.25,
  horizonSeconds: 45 * 60,
};

/** The seeker never sleeps longer than this: the hider gets its chances to play a card. */
export const SEEKER_MAX_WAIT_SECONDS = 60;
/** Wrong way: how far ahead to look for a train the required way, and how many to weigh. */
const WRONG_WAY_HORIZON_SECONDS = 20 * 60;
const WRONG_WAY_TRIPS = 8;
const WRONG_WAY_STOPS = 3;

type Point = { lat: number; lon: number };

/** The intents to issue now (in order, at the same moment), or nothing to do until then. */
export type SeekerStep = { intents: SoloIntent[] } | { waitUntil: number };

/** What the seeker carries between steps. Everything in it comes from its own view. */
export interface SeekerMemory {
  /** What's left to search around each candidate station; nothing left = swept. */
  beliefs: Map<number, SearchBelief>;
  /** After a refused platform change: don't plan a board from this platform before `t`. */
  notBefore: { station: number; since: number; t: number } | null;
  /** A station nothing useful can be asked from: head somewhere else to ask. */
  avoid: number | null;
  /** Back off until then after a rejection it didn't expect. */
  backoffUntil: number;
  /** Swept everything once without a sighting: the next sweep looks closer. */
  closer: boolean;
  /** The station being left for the others, so a re-plan on the way doesn't turn back. */
  leaving: number | null;
}

export function newSeekerMemory(): SeekerMemory {
  return {
    beliefs: new Map(),
    notBefore: null,
    avoid: null,
    backoffUntil: Number.NEGATIVE_INFINITY,
    closer: false,
    leaving: null,
  };
}

// ---- Journeys -----------------------------------------------------------------------

export interface Plan {
  /** The intents to issue now. Empty: already there. */
  intents: TransitIntent[];
  /** When the journey reaches a target. */
  arrive: number;
}

/** When legs starting at `t0` arrive. */
export function arrivalOf(legs: readonly Leg[], t0: number): number {
  let now = t0;
  for (const leg of legs) now = leg.kind === "ride" ? leg.arr : now + leg.seconds;
  return now;
}

/** The intents that start a leg from the platform. */
function legIntents(leg: Leg): TransitIntent[] {
  if (leg.kind === "walk") return [{ type: "transfer", to: leg.to }];
  return [
    { type: "board", trip: leg.trip, stop: leg.from },
    { type: "alightAt", stop: leg.to },
  ];
}

/** The fastest journey from a platform at `t0` to any of `targets`, as its first intents. */
export function planFromPlatform(
  idx: TimetableIndex,
  station: number,
  t0: number,
  tMax: number,
  targets: readonly number[],
): Plan | null {
  const legs = earliestJourney(idx, station, t0, tMax, targets, true);
  if (!legs) return null;
  const first = legs[0];
  return { intents: first ? legIntents(first) : [], arrive: arrivalOf(legs, t0) };
}

/** From the street: walk back down into whichever station of the complex gets there first. */
export function planFromStreet(
  idx: TimetableIndex,
  s: OnStreet,
  t: number,
  tMax: number,
  targets: readonly number[],
): Plan | null {
  const complex = idx.ds.complexes[s.complex];
  if (!complex) return null;
  const here = streetPoint(s, idx);
  const walkBack = Math.min(...complex.exits.map(([lat, lon]) => walkSeconds(here, { lat, lon })));
  let best: Plan | null = null;
  for (const station of complex.stations) {
    const t0 = t + walkBack + ENTER_SECONDS;
    const legs = earliestJourney(idx, station, t0, tMax, targets, true);
    if (!legs) continue;
    const arrive = arrivalOf(legs, t0);
    if (!best || arrive < best.arrive) {
      best = { intents: [{ type: "enter", station }], arrive };
    }
  }
  return best;
}

/** The next stop ahead of a moving train at t (any stop, not only up to where you'd alight). */
function stopAhead(s: OnTrain, t: number, idx: TimetableIndex): number | null {
  const trip = idx.ds.trips[s.trip];
  if (!trip || t < (trip.dep[s.from] as number)) return null;
  for (let j = s.from + 1; j < trip.stops.length; j++) {
    if ((trip.arr[j] as number) > t) return j;
  }
  return null;
}

/**
 * On a train: stay on, get off sooner, or ride further? Planned from the next stop, so
 * staying on competes with every change there. Before the train leaves, the plan is from
 * the platform at `t0` (held back after a refused platform change, like planFromPlatform),
 * and a better train means cancelling. Empty: stay the course.
 */
export function planOnTrain(
  idx: TimetableIndex,
  s: OnTrain,
  t: number,
  tMax: number,
  targets: readonly number[],
  t0 = t,
): TransitIntent[] {
  const trip = idx.ds.trips[s.trip];
  if (!trip) return [];
  if (t < (trip.dep[s.from] as number)) {
    const legs = earliestJourney(idx, trip.stops[s.from] as number, t0, tMax, targets, true);
    const first = legs?.[0];
    if (!legs || !first) return [];
    if (first.kind === "ride" && first.trip === s.trip) {
      return s.to === first.to ? [] : [{ type: "alightAt", stop: first.to }];
    }
    return [{ type: "cancelBoard" }];
  }
  const k = stopAhead(s, t, idx);
  if (k === null) return [];
  const legs = earliestJourney(
    idx,
    trip.stops[k] as number,
    trip.arr[k] as number,
    tMax,
    targets,
    true,
  );
  if (!legs) return [];
  const first = legs[0];
  const alight = first && first.kind === "ride" && first.trip === s.trip ? first.to : k;
  return s.to === alight ? [] : [{ type: "alightAt", stop: alight }];
}

/**
 * Under Wrong way: the best train the required way within the next few minutes, got off
 * at one of its next stops, judged by when the journey from there reaches a target.
 */
export function planWrongWay(
  idx: TimetableIndex,
  s: OnPlatform,
  t: number,
  tMax: number,
  targets: readonly number[],
  dir: Direction,
): Plan | null {
  const { ds } = idx;
  let best: Plan | null = null;
  let trips = 0;
  for (const d of departures(idx, s.station, t, {
    horizon: WRONG_WAY_HORIZON_SECONDS,
    limit: 80,
  })) {
    if (d.dir !== dir) continue;
    const changing = s.arrivedDir !== null && s.arrivedDir !== d.dir;
    if (changing && d.dep < s.since + (idx.selfTransfer[s.station] ?? 0)) continue;
    const trip = ds.trips[d.trip];
    if (!trip) continue;
    if (++trips > WRONG_WAY_TRIPS) break;
    const last = Math.min(d.stop + WRONG_WAY_STOPS, trip.stops.length - 1);
    for (let j = d.stop + 1; j <= last; j++) {
      const stop = trip.stops[j] as number;
      const arr = trip.arr[j] as number;
      let arrive = arr;
      if (!targets.includes(stop)) {
        const legs = earliestJourney(idx, stop, arr, tMax, targets, true);
        if (!legs) continue;
        arrive = arrivalOf(legs, arr);
      }
      if (!best || arrive < best.arrive) {
        best = {
          intents: [
            { type: "board", trip: d.trip, stop: d.stop },
            { type: "alightAt", stop: j },
          ],
          arrive,
        };
      }
    }
  }
  return best;
}

/** Meters walked on the street since `since`, by t (the Tourist's walk). */
export function walkedOnStreet(footpath: readonly FootSegment[], since: number, t: number): number {
  let sum = 0;
  for (const s of footpath) {
    if (s.start < since || s.start > t) continue;
    const f = s.end > s.start ? Math.min(1, (t - s.start) / (s.end - s.start)) : 1;
    sum += f * distanceMeters({ lat: s.a[0], lon: s.a[1] }, { lat: s.b[0], lon: s.b[1] });
  }
  return sum;
}

/** The exit of `complex` nearest `p`. */
export function nearestExit(ds: Dataset, complex: number, p: Point): number {
  const c = ds.complexes[complex];
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  c?.exits.forEach(([lat, lon], i) => {
    const d = distanceMeters({ lat, lon }, p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** The point `meters` from `here` toward (and past) `centre`, so it stays within reach. */
export function pointToward(here: Point, centre: Point, meters: number): Point {
  const [dx, dy] = localMeters(here, centre);
  const len = Math.hypot(dx, dy);
  const [ux, uy] = len < 1 ? [0, 1] : [dx / len, dy / len];
  return offsetMeters(here, ux * meters, uy * meters);
}

// ---- Questions ----------------------------------------------------------------------

/** Expected bits from `q` over `cands`. */
export function expectedBits(
  ds: Dataset,
  q: MapQuestion,
  cands: readonly number[],
  ctx: AskContext,
): number {
  let bits = 0;
  for (const k of partition(ds, q, cands, ctx).values()) {
    bits += (k / cands.length) * Math.log2(cands.length / k);
  }
  return bits;
}

/**
 * The thrifty question to ask now from `origin`, if one is ready, open (not vetoed) and
 * worth at least `minBits`. The same chooser the difficulty bands are measured with.
 */
export function thriftyQuestion(
  ds: Dataset,
  cands: readonly number[],
  origin: Place,
  thermometer: Place | null,
  asked: readonly { q: Question; at: number; answer: Answer | null }[],
  t: number,
  minBits: number,
): { q: MapQuestion; ctx: AskContext; bits: number } | null {
  const closed = closedQuestions(asked);
  const pool = questionPool(ds, origin, thermometer).filter((x) => !closed.has(questionKey(x.q)));
  const pick = chooseQuestion(ds, cands, pool, asked, t, "thrifty", QUESTION_GAP_SECONDS);
  if (!pick) return null;
  const bits = expectedBits(ds, pick.q, cands, pick.ctx);
  return bits >= minBits ? { ...pick, bits } : null;
}

/** When the next station-question category comes off cooldown after t (t + 60 if all are ready). */
export function nextReadyAt(asked: readonly { q: Question; at: number }[], t: number): number {
  let next = Number.POSITIVE_INFINITY;
  for (const c of QUESTION_CATEGORIES) {
    if (c === "onFoot" || c === "photo") continue;
    const ready = askReadyAt(asked, c);
    if (ready > t && ready < next) next = ready;
  }
  return Number.isFinite(next) ? next : t + SEEKER_MAX_WAIT_SECONDS;
}

/** Whether any station-question category is off cooldown at t. */
export function anyReady(asked: readonly { q: Question; at: number }[], t: number): boolean {
  return QUESTION_CATEGORIES.some(
    (c) => c !== "onFoot" && c !== "photo" && t >= askReadyAt(asked, c),
  );
}

// ---- The street search ----------------------------------------------------------------

/**
 * Where the hider could still be, as the seeker's map shades it (search.ts): the 8 m grid
 * around the station they came up at, less what's outside every candidate's zone, what
 * disagrees with an on-foot answer, and what they've walked past. The grid reaches
 * STREET_RADIUS_M, as far as you may walk, so a neighbouring candidate's zone can be
 * swept from here. Kept in flat meters and updated as the footpath grows, since
 * recomputing it from scratch at every step is slow.
 */
export interface SearchBelief {
  complex: number;
  centre: Point;
  points: Point[];
  x: Float64Array;
  y: Float64Array;
  alive: Uint8Array;
  /** You'd have seen them this close to anywhere you walked. */
  killRadius: number;
  /** Footpath segments and asked questions already taken in. */
  walked: number;
  answered: number;
  candidatesKey: string;
}

/**
 * Leaving a station for another costs about this: two minutes down and two up, the walk
 * back to an exit, and a short ride.
 */
export const LEAVE_COST_SECONDS = 8 * 60;

/** Game seconds a walk takes to sweep one grid cell, seeing `killRadius` either side. */
function sweepSecondsPerCell(b: SearchBelief): number {
  return (SEARCH_GRID_M * SEARCH_GRID_M * (WALK_DETOUR / WALK_MPS)) / (2 * b.killRadius);
}

export function newBelief(ds: Dataset, complex: number, killRadius = SPOT_REVEAL_METERS - 1) {
  const c = ds.complexes[complex];
  if (!c) throw new Error(`no complex ${complex}`);
  const centre = { lat: c.lat, lon: c.lon };
  const points = searchGrid(centre, STREET_RADIUS_M);
  const x = new Float64Array(points.length);
  const y = new Float64Array(points.length);
  points.forEach((p, i) => {
    [x[i], y[i]] = localMeters(centre, p);
  });
  const belief: SearchBelief = {
    complex,
    centre,
    points,
    x,
    y,
    alive: new Uint8Array(points.length).fill(1),
    killRadius,
    walked: 0,
    answered: 0,
    candidatesKey: "",
  };
  return belief;
}

/** Everything out of sight of a walk from a to b (flat meters) dies. */
function killSegment(b: SearchBelief, a: [number, number], c: [number, number]) {
  const [ax, ay] = a;
  const dx = c[0] - ax;
  const dy = c[1] - ay;
  const len = dx * dx + dy * dy;
  const r = b.killRadius;
  const minX = Math.min(ax, c[0]) - r;
  const maxX = Math.max(ax, c[0]) + r;
  const minY = Math.min(ay, c[1]) - r;
  const maxY = Math.max(ay, c[1]) + r;
  for (let i = 0; i < b.alive.length; i++) {
    if (!b.alive[i]) continue;
    const px = b.x[i] as number;
    const py = b.y[i] as number;
    if (px < minX || px > maxX || py < minY || py > maxY) continue;
    const f = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
    if (Math.hypot(px - ax - f * dx, py - ay - f * dy) < r) b.alive[i] = 0;
  }
}

/** The on-foot answer at flat point (px, py), asked from `me` with the walk started at `base`. */
function footAnswer(
  q: SpotQuestion,
  px: number,
  py: number,
  me: [number, number],
  base: [number, number] | null,
): string {
  const d = Math.hypot(px - me[0], py - me[1]);
  if (d > ON_FOOT_RANGE_M) return "far";
  if (q.kind === "spotRadar") return String(d <= q.meters);
  if (!base) return "?";
  return d < Math.hypot(px - base[0], py - base[1]) ? "hotter" : "colder";
}

/**
 * Bring the belief up to date with the view at t: zones, walks (a walk still under way
 * counts as far as it has got, like the engine's walkedBy), new on-foot answers.
 */
export function syncBelief(b: SearchBelief, ds: Dataset, view: SoloView, t: number): void {
  const key = view.candidates.join(",");
  if (key !== b.candidatesKey) {
    b.candidatesKey = key;
    const zones = view.candidates
      .map((c) => ds.complexes[c])
      .filter(
        (z) => z !== undefined && distanceMeters(z, b.centre) <= STREET_RADIUS_M + ZONE_RADIUS_M,
      )
      .map((z) => localMeters(b.centre, z as Point));
    for (let i = 0; i < b.alive.length; i++) {
      if (!b.alive[i]) continue;
      const px = b.x[i] as number;
      const py = b.y[i] as number;
      if (!zones.some(([zx, zy]) => Math.hypot(px - zx, py - zy) <= ZONE_RADIUS_M)) b.alive[i] = 0;
    }
  }
  for (; b.walked < view.footpath.length; b.walked++) {
    const s = view.footpath[b.walked] as FootSegment;
    if (s.start > t) break;
    const a = localMeters(b.centre, { lat: s.a[0], lon: s.a[1] });
    const c = localMeters(b.centre, { lat: s.b[0], lon: s.b[1] });
    if (s.end <= t) {
      killSegment(b, a, c);
      continue;
    }
    // Under way: kill the part walked so far, and finish the segment another time.
    const f = (t - s.start) / (s.end - s.start);
    killSegment(b, a, [a[0] + f * (c[0] - a[0]), a[1] + f * (c[1] - a[1])]);
    break;
  }
  for (; b.answered < view.asked.length; b.answered++) {
    const a = view.asked[b.answered];
    if (!a || !isSpotQuestion(a.q) || a.answer === null || isVetoed(a.answer)) continue;
    const me = localMeters(b.centre, a.ctx.origin);
    const base = a.ctx.baseline ? localMeters(b.centre, a.ctx.baseline) : null;
    const truth = String(a.answer);
    for (let i = 0; i < b.alive.length; i++) {
      if (b.alive[i] && footAnswer(a.q, b.x[i] as number, b.y[i] as number, me, base) !== truth) {
        b.alive[i] = 0;
      }
    }
  }
}

export function aliveCount(b: SearchBelief): number {
  let n = 0;
  for (let i = 0; i < b.alive.length; i++) n += b.alive[i] as number;
  return n;
}

/** The nearest place they could still be and how far it is, or null when all is swept. */
export function nearestAlive(b: SearchBelief, me: Point): { p: Point; meters: number } | null {
  const [mx, my] = localMeters(b.centre, me);
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < b.alive.length; i++) {
    if (!b.alive[i]) continue;
    const d = Math.hypot((b.x[i] as number) - mx, (b.y[i] as number) - my);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best < 0 ? null : { p: b.points[best] as Point, meters: bestD };
}

/**
 * Whether to give this station up for the others: compare the expected cost of sweeping
 * what's left here first (and moving on if they're not here) with going to the others
 * first (and coming back). The chance they're here is this station's remaining area
 * against the others' (`othersCells`). After "Not near you" only a far sliver is left
 * here, so this says leave; with half the zone left, it says stay.
 */
export function shouldLeave(b: SearchBelief, me: Point, othersCells: number): boolean {
  const next = nearestAlive(b, me);
  if (!next) return true;
  if (othersCells <= 0) return false;
  const k = sweepSecondsPerCell(b);
  const here = aliveCount(b);
  const pHere = here / (here + othersCells);
  const costHere = next.meters * (WALK_DETOUR / WALK_MPS) + 0.5 * here * k;
  const costOthers = 0.5 * othersCells * k;
  return costHere * (1 - pHere) >= pHere * (2 * LEAVE_COST_SECONDS + costOthers);
}

/**
 * The on-foot question that saves the most sweeping, with the minutes it should save:
 * the expected cells it rules out, at the pace a walk sweeps them (`pnpm sim:endgame`).
 */
export function bestFootQuestion(
  b: SearchBelief,
  me: Point,
  baseline: Point | null,
): { q: SpotQuestion; savedMinutes: number } | null {
  const m = localMeters(b.centre, me);
  const base = baseline ? localMeters(b.centre, baseline) : null;
  const options: SpotQuestion[] = SPOT_RADAR_METERS.map((meters) => ({
    kind: "spotRadar",
    meters,
  }));
  if (base && Math.hypot(m[0] - base[0], m[1] - base[1]) >= FOOT_THERMOMETER_MIN_METERS) {
    options.push({ kind: "spotThermometer" });
  }
  const n = aliveCount(b);
  if (n === 0) return null;
  const perCell = sweepSecondsPerCell(b);
  let best: { q: SpotQuestion; savedMinutes: number } | null = null;
  for (const q of options) {
    const parts = new Map<string, number>();
    for (let i = 0; i < b.alive.length; i++) {
      if (!b.alive[i]) continue;
      const k = footAnswer(q, b.x[i] as number, b.y[i] as number, m, base);
      parts.set(k, (parts.get(k) ?? 0) + 1);
    }
    let expected = 0;
    for (const k of parts.values()) expected += (k * k) / n;
    const savedMinutes = ((n - expected) * perCell) / 60;
    if (!best || savedMinutes > best.savedMinutes) best = { q, savedMinutes };
  }
  return best;
}

// ---- The policy -----------------------------------------------------------------------

function centroid(ds: Dataset, complexes: readonly number[]): Point {
  let lat = 0;
  let lon = 0;
  for (const c of complexes) {
    lat += ds.complexes[c]?.lat ?? 0;
    lon += ds.complexes[c]?.lon ?? 0;
  }
  return { lat: lat / complexes.length, lon: lon / complexes.length };
}

function stationsOf(ds: Dataset, complexes: readonly number[]): number[] {
  return complexes.flatMap((c) => ds.complexes[c]?.stations ?? []);
}

/** The complex the seeker is standing in; null on a train. */
function complexOf(ds: Dataset, s: OnPlatform | OnStreet | OnTrain): number | null {
  if (s.kind === "platform") return ds.stations[s.station]?.complex ?? null;
  if (s.kind === "street") return s.complex;
  return null;
}

/** The seeker's next move at t, from its view of the round. */
export function seekerStep(
  view: SoloView,
  mem: SeekerMemory,
  t: number,
  idx: TimetableIndex,
  opts: SeekerOptions = SEEKER_DEFAULTS,
): SeekerStep {
  const { ds } = idx;
  const wait = (...untils: (number | null)[]): SeekerStep => {
    const soonest = Math.min(...untils.map((u) => u ?? Number.POSITIVE_INFINITY));
    return { waitUntil: Math.min(Math.max(soonest, t + 1), t + SEEKER_MAX_WAIT_SECONDS) };
  };
  if (t < mem.backoffUntil) return wait(mem.backoffUntil);
  const s = resolve(view.seeker, t, idx);
  const tMax = Math.min(view.seekEnd, t + opts.horizonSeconds);
  const pending = view.asked.filter((a) => a.answer === null).map((a) => a.answerAt);
  const answerAt = pending.length > 0 ? Math.min(...pending) : null;
  const moveEnd = () => nextEventTime(s, t, idx, "end");
  /** Where a board from this platform may start: held back after a refused platform change. */
  const startFrom = (p: OnPlatform) => {
    const held = mem.notBefore;
    return held && held.station === p.station && held.since === p.since ? Math.max(t, held.t) : t;
  };

  /** Ride (or walk back down and ride) toward `targets`, re-planning under Wrong way. */
  const travel = (targets: readonly number[]): SeekerStep => {
    if (targets.length === 0 || s.kind === "walking") return wait(answerAt, moveEnd());
    const wrongWay = view.curses.find(
      (c): c is Extract<ActiveCurse, { card: "wrongWay" }> => c.card === "wrongWay",
    );
    const plan = (max: number): TransitIntent[] | null => {
      if (s.kind === "train") {
        // Under Wrong way the train was chosen for its direction: don't second-guess it.
        if (wrongWay && t < (ds.trips[s.trip]?.dep[s.from] as number)) return [];
        return planOnTrain(idx, s, t, max, targets, startFrom(s.boardedFrom));
      }
      if (s.kind === "street") return planFromStreet(idx, s, t, max, targets)?.intents ?? null;
      if (wrongWay) return planWrongWay(idx, s, t, max, targets, wrongWay.dir)?.intents ?? null;
      return planFromPlatform(idx, s.station, startFrom(s), max, targets)?.intents ?? null;
    };
    const intents = plan(tMax) ?? (tMax < view.seekEnd ? plan(view.seekEnd) : null);
    if (intents && intents.length > 0) return { intents };
    return wait(answerAt, moveEnd());
  };

  // A Tourist dictates the next moves: off at the next stop (the engine saw to that), up
  // to the street, 200 m, then back down toward wherever the hunt points.
  const tourist = view.curses.find((c) => c.card === "tourist");
  if (tourist) {
    if (s.kind === "train" || s.kind === "walking") return wait(answerAt, moveEnd());
    const complex = complexOf(ds, s) as number;
    if (s.kind === "platform") {
      const exit = nearestExit(ds, complex, centroid(ds, view.candidates));
      return { intents: [{ type: "exit", exit }] };
    }
    const walked = walkedOnStreet(view.footpath, tourist.at, t);
    if (walked < TOURIST_WALK_M) {
      const c = ds.complexes[complex] as Point;
      const target = pointToward(streetPoint(s, idx), c, TOURIST_WALK_M + 10 - walked);
      return { intents: [{ type: "walkTo", lat: target.lat, lon: target.lon }] };
    }
  }

  const cands = view.candidates;
  const here = s.kind === "walking" ? null : complexOf(ds, s);
  if (cands.length > opts.endgameAt) {
    // The hunt: ask whenever something is ready (a walk doesn't stop you: questions are
    // asked from where it set off), ride toward the candidates between answers.
    mem.beliefs.clear();
    if (view.thermometer === null) return { intents: [{ type: "startThermometer" }] };
    if (here !== null && here !== mem.avoid) mem.avoid = null;
    if (answerAt === null) {
      const origin = questionOrigin(view.seeker, t, idx);
      const pick = thriftyQuestion(
        ds,
        cands,
        origin,
        view.thermometer,
        view.asked,
        t,
        opts.minBits,
      );
      if (pick) return { intents: [{ type: "ask", question: pick.q }] };
      // Something is ready but nothing from here is worth asking: go and ask elsewhere.
      if (here !== null && anyReady(view.asked, t)) mem.avoid = here;
    } else if (s.kind === "platform" || s.kind === "street") {
      // Standing still with an answer on its way: let it land before choosing a train.
      return wait(answerAt);
    }
    const options = cands.filter((c) => c !== mem.avoid);
    const target = nearestToCentre(ds, options.length > 0 ? options : cands).complex;
    if (here === target) return wait(answerAt, nextReadyAt(view.asked, t));
    const step = travel(ds.complexes[target]?.stations ?? []);
    return "waitUntil" in step ? wait(step.waitUntil, answerAt) : step;
  }

  // The endgame: what's left to search around each candidate, from the seeker's map.
  const radius = SPOT_REVEAL_METERS - (mem.closer ? 10 : 1);
  const beliefFor = (c: number): SearchBelief => {
    let b = mem.beliefs.get(c);
    if (!b) {
      b = newBelief(ds, c, radius);
      mem.beliefs.set(c, b);
    }
    syncBelief(b, ds, view, t);
    return b;
  };
  let open = cands.filter((c) => aliveCount(beliefFor(c)) > 0);
  if (open.length === 0) {
    // Swept everything and saw no one (a spot between grid points): look again, closer.
    mem.beliefs.clear();
    mem.closer = true;
    open = cands.filter((c) => aliveCount(beliefFor(c)) > 0);
    if (open.length === 0) return wait(null);
  }
  if (s.kind === "walking") return wait(answerAt, moveEnd());
  if (here !== null && here !== mem.leaving) mem.leaving = null;
  const elsewhere = (from: number) => open.filter((c) => c !== from && c !== mem.leaving);
  const leave = (from: number): SeekerStep => {
    mem.leaving = from;
    const others = elsewhere(from);
    return travel(stationsOf(ds, others.length > 0 ? others : open.filter((c) => c !== from)));
  };
  if (s.kind === "street") {
    const me = streetPoint(s, idx);
    if (view.spotNearby) {
      const spot = view.spotNearby;
      if (distanceMeters(me, spot) <= CATCH_METERS) return { intents: [{ type: "catch" }] };
      // In sight, but a walk can't go past STREET_RADIUS_M from the station you came up
      // at: get as near as allowed, and if that isn't near enough, go round by theirs.
      const centre = ds.complexes[s.complex] as Point;
      const target =
        distanceMeters(centre, spot) <= STREET_RADIUS_M - 1
          ? spot
          : pointToward(centre, spot, STREET_RADIUS_M - 1);
      if (distanceMeters(target, spot) <= CATCH_METERS) {
        return { intents: [{ type: "walkTo", lat: target.lat, lon: target.lon }] };
      }
      const theirs = [...cands].sort(
        (a, b) =>
          distanceMeters(ds.complexes[a] as Point, spot) -
          distanceMeters(ds.complexes[b] as Point, spot),
      )[0] as number;
      mem.leaving = s.complex;
      return travel(stationsOf(ds, [theirs]));
    }
    if (!open.includes(s.complex)) return leave(s.complex);
    const belief = beliefFor(s.complex);
    const othersCells = elsewhere(s.complex).reduce((sum, c) => sum + aliveCount(beliefFor(c)), 0);
    if (shouldLeave(belief, me, othersCells)) return leave(s.complex);
    if (view.footThermometer === null) return { intents: [{ type: "startFootThermometer" }] };
    if (t >= askReadyAt(view.asked, "onFoot")) {
      const best = bestFootQuestion(belief, me, view.footThermometer);
      if (best && best.savedMinutes > QUESTION_RULES.onFoot.bonusSeconds / 60) {
        return { intents: [{ type: "ask", question: best.q }] };
      }
    }
    const next = nearestAlive(belief, me) as { p: Point };
    return { intents: [{ type: "walkTo", lat: next.p.lat, lon: next.p.lon }] };
  }
  if (s.kind === "platform" && here !== null && open.includes(here) && here !== mem.leaving) {
    // Come up here, unless what's left here isn't worth the others' wait (judged from the
    // exit you'd come up at, so the street agrees and you don't yo-yo on the stairs).
    const exit = nearestExit(ds, here, centroid(ds, open));
    const [lat, lon] = ds.complexes[here]?.exits[exit] ?? [0, 0];
    const othersCells = elsewhere(here).reduce((sum, c) => sum + aliveCount(beliefFor(c)), 0);
    if (!shouldLeave(beliefFor(here), { lat, lon }, othersCells)) {
      return { intents: [{ type: "exit", exit }] };
    }
    return leave(here);
  }
  const ahead = open.filter((c) => c !== mem.leaving);
  return travel(stationsOf(ds, ahead.length > 0 ? ahead : open));
}

/**
 * Learn from a rejected intent: a refused platform change moves the plan's start past
 * the change time; anything else, back off a minute and re-plan.
 */
export function seekerRejected(
  mem: SeekerMemory,
  view: SoloView,
  intent: SoloIntent,
  error: string,
  t: number,
  idx: TimetableIndex,
): void {
  const s = resolve(view.seeker, t, idx);
  if (intent.type === "board" && s.kind === "platform" && /change platforms/.test(error)) {
    mem.notBefore = {
      station: s.station,
      since: s.since,
      t: s.since + (idx.selfTransfer[s.station] ?? 0),
    };
    return;
  }
  mem.backoffUntil = t + SEEKER_MAX_WAIT_SECONDS;
}

export interface SeekerPlay {
  round: SoloRound;
  steps: number;
  /** Rejected intents, by intent type and the engine's reason. */
  rejections: Map<string, number>;
  /** When each walk up to the street began. */
  exitsAt: number[];
}

/**
 * Play `start` to its end with the bot seeker, the way the server drives a round: the
 * seeker acts on its view, and waits fast-forward through `skipSolo`, which settles the
 * round at every departure so the hider gets its chances to play a card. A round that
 * isn't over after `maxSteps` decisions is returned as it stands.
 */
export function runSeeker(
  start: SoloRound,
  idx: TimetableIndex,
  opts: SeekerOptions = SEEKER_DEFAULTS,
  maxSteps = 20_000,
  onStep?: (view: SoloView, step: SeekerStep, t: number) => void,
): SeekerPlay {
  let round = advanceSolo(start, start.seekStart, idx);
  const mem = newSeekerMemory();
  const rejections = new Map<string, number>();
  const exitsAt: number[] = [];
  let t = round.seekStart;
  let steps = 0;
  while (!round.result && steps < maxSteps) {
    steps++;
    const view = soloView(round, t, idx);
    const step = seekerStep(view, mem, t, idx, opts);
    onStep?.(view, step, t);
    if ("waitUntil" in step) {
      ({ round, t } = skipSolo(round, t, Math.min(step.waitUntil, round.seekEnd), idx));
      continue;
    }
    for (const intent of step.intents) {
      const r = applySoloIntent(round, intent, t, idx);
      if (!r.ok) {
        const key = `${intent.type}: ${r.error}`;
        rejections.set(key, (rejections.get(key) ?? 0) + 1);
        seekerRejected(mem, view, intent, r.error, t, idx);
        break;
      }
      if (intent.type === "exit") exitsAt.push(t);
      round = r.round;
      if (round.result) break;
    }
  }
  return { round, steps, rejections, exitsAt };
}
