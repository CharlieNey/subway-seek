/**
 * M2: a single-player round against a bot hider. The bot has already hidden — it left
 * the hub at 10:00 and had 20 minutes — so seeking starts at 10:20 with no waiting.
 * You find the station by being there: on one of its platforms or at its street exit.
 * The two-player round with a real hiding phase and a spot endgame is M3.
 */

import type { Direction, LatLon } from "@stand-clear/data";
import {
  CARDS,
  type CardId,
  type CurseId,
  DRAWS,
  drawAndKeep,
  handBonusSeconds,
  playCard,
  shuffledDeck,
  TOURIST_WALK_M,
  WRONG_WAY_MAX_SECONDS,
} from "./cards.ts";
import { type DailyInfo, hashString, seededRandom } from "./daily.ts";
import { distanceMeters, localMeters } from "./geo.ts";
import { type Difficulty, pickHidingStation } from "./hardness.ts";
import {
  advanceHider,
  finishHider,
  type HumanHider,
  hideStatus,
  humanAnswer,
  queueHumanQuestion,
} from "./hider.ts";
import { type BotPlay, botCurse, botPowerup, botRedraw, nextStopIndex } from "./hiderBot.ts";
import {
  type Answer,
  type AskContext,
  type Asked,
  categoryOf,
  closedQuestions,
  evaluate,
  evaluateSpot,
  filterCandidates,
  isMapQuestion,
  isSpotQuestion,
  type Place,
  photoCamera,
  type Question,
  type QuestionCategory,
  questionError,
  questionKey,
  questionOrigin,
} from "./questions.ts";
import { earliestJourney } from "./reach.ts";
import type { TimetableIndex } from "./timetable.ts";
import { type TrailEntry, trailFromLegs } from "./trail.ts";
import {
  applyIntent,
  EXIT_SECONDS,
  type OnStreet,
  resolve,
  streetPoint,
  type Transit,
  type TransitIntent,
  walkSeconds,
} from "./transit.ts";

export const HIDE_SECONDS = 20 * 60;
export const SEEK_LIMIT_SECONDS = 2 * 3600;
/**
 * What each category of question costs: minutes added to the hider's score, and how
 * long before you can ask that category again. Tuned with `pnpm sim` (2026-10-05):
 * before, radar and "does the ___ stop there" were 91–94% of a strong seeker's
 * questions; with these, no category is more than ~29% at any pace, and pinning the
 * station still earns the hider ~64 min (it was ~68). Equal prices for the yes/no
 * categories matter: when matching and measuring were cheaper, a price-aware seeker
 * stopped using radar entirely; a cheaper thermometer took over a third of the questions.
 */
export const QUESTION_RULES: Record<
  QuestionCategory,
  { bonusSeconds: number; cooldownSeconds: number }
> = {
  matching: { bonusSeconds: 10 * 60, cooldownSeconds: 15 * 60 },
  measuring: { bonusSeconds: 10 * 60, cooldownSeconds: 15 * 60 },
  radar: { bonusSeconds: 10 * 60, cooldownSeconds: 15 * 60 },
  thermometer: { bonusSeconds: 10 * 60, cooldownSeconds: 10 * 60 },
  // Answers name a landmark, so it splits the map many ways: the dearest question.
  tentacles: { bonusSeconds: 20 * 60, cooldownSeconds: 40 * 60 },
  photo: { bonusSeconds: 15 * 60, cooldownSeconds: 15 * 60 },
  // On foot, about the exact spot: cheap and quick, so the street search is a string of
  // small deductions rather than a blind sweep. Tuned with `pnpm sim:endgame`: an
  // efficient seeker's endgame takes ~17 game-min (36–41% of seeking), against ~56 with
  // no questions at all. See docs/endgame-balance.md.
  onFoot: { bonusSeconds: 3 * 60, cooldownSeconds: 5 * 60 },
};
/** Least time between any two questions (the old single cooldown). */
export const QUESTION_GAP_SECONDS = 5 * 60;
/**
 * Every station question's answer lands this long after it's asked, card or no card, so
 * the wait can't tell the seeker whether the hider holds a Veto (DESIGN.md, Interaction:
 * the answer window). On-foot questions answer at once.
 */
export const ANSWER_WINDOW_SECONDS = 60;
/** Photos from the hiding spot open this long into the round. */
export const SPOT_PHOTOS_OPEN_SECONDS = 15 * 60;
/** You catch the hider by clicking their marker from within this distance. */
export const CATCH_METERS = 25;
/** Their marker shows up in your Street View within this distance. */
export const SPOT_REVEAL_METERS = 40;

/** Where the hider is hiding: a Street View panorama inside the zone. */
export interface HidingSpot {
  lat: number;
  lon: number;
  pano: string;
}

export interface AskedQuestion extends Asked {
  at: number;
  /** When the answer lands: the end of the answer window. */
  answerAt: number;
  /** Stations still possible once this answer lands. */
  remaining: number;
  /** The hider swapped the seeker's question for this one (Randomize). */
  randomizedFrom?: Question;
}

/** A curse on the seeker, while it lasts (public). */
export type ActiveCurse =
  | { card: "fog" | "signalLoss" | "shed"; at: number; until: number }
  /** Their next train must run in direction `dir`. */
  | { card: "wrongWay"; at: number; dir: Direction; until: number }
  /** Off at `station`, then walk TOURIST_WALK_M on the street before going back in. */
  | { card: "tourist"; at: number; station: number };

/**
 * A card the hider played. The seeker sees the ones that act on them (Veto, Randomize and
 * curses), each when it lands; the rest only once the round is over.
 */
export interface CardEvent {
  t: number;
  card: CardId;
}

export type RoundResult =
  | { kind: "found"; at: number }
  | { kind: "timeout"; at: number }
  | { kind: "gaveUp"; at: number };

export type RoundMode = "daily" | "practice" | "hide";

export interface SoloRound {
  /** Present only when the hider is controlled by a person. */
  human?: HumanHider;
  mode: RoundMode;
  /** Which band of stations the bot hid in, and how hard it plays its cards (DESIGN.md, S5). */
  difficulty: Difficulty;
  /** Set for the daily challenge. */
  daily: DailyInfo | null;
  /** Station the round starts from (e.g. Times Sq 1/2/3). */
  hub: number;
  hideStart: number;
  seekStart: number;
  seekEnd: number;
  /** The hider's complex. Secret until the round ends — never sent to the seeker before. */
  hider: number;
  /** Complexes the hider could have reached (public: computable from the timetable). */
  reachable: number[];
  seeker: Transit;
  asked: AskedQuestion[];
  thermometer: Place | null;
  /** The walking thermometer's start (on-foot hotter/colder about the spot). */
  footThermometer: Place | null;
  result: RoundResult | null;
  /** The bot's route to its hiding station (secret until the round ends). */
  hiderTrail: TrailEntry[];
  /** Every move the seeker made, for the replay. */
  seekerTrail: TrailEntry[];
  /**
   * The hider's exact spot (secret). Null = no Street View endgame this round (no
   * spot could be picked): finding the station ends the round, as in M2.
   */
  spot: HidingSpot | null;
  /**
   * When the seeker first stood in the hider's station: the endgame starts. Set at the
   * catch instead when they came up at a neighbouring station and never stood in it.
   */
  stationFoundAt: number | null;
  /** The panorama outside one exit of the hider's station, for "photo from your exit". */
  photoExit: string | null;
  /** The hider's draw pile and hand (secret; the hand is shown when the round ends). */
  deck: CardId[];
  hand: CardId[];
  /** Seeds the hider's random choices (Randomize). Secret. */
  rngSeed: number;
  curses: ActiveCurse[];
  cardEvents: CardEvent[];
  /** When the last curse was played, so they come spaced out. */
  lastCurseAt: number;
}

export type SoloIntent =
  | TransitIntent
  | { type: "ask"; question: Question }
  | { type: "startThermometer" }
  | { type: "startFootThermometer" }
  | { type: "giveUp" }
  | { type: "catch" };

export function createSoloRound(
  idx: TimetableIndex,
  {
    hub,
    hideStart,
    random = Math.random,
    daily = null,
    difficulty = "normal",
  }: {
    hub: number;
    hideStart: number;
    random?: () => number;
    daily?: DailyInfo | null;
    difficulty?: Difficulty;
  },
): SoloRound {
  const seekStart = hideStart + HIDE_SECONDS;
  // A seeded pick from the difficulty's band of stations (hardness.ts).
  const { hider, reachable } = pickHidingStation(idx, hub, hideStart, difficulty, random);
  // After the hider, so the daily's hider doesn't change with the deck.
  const deck = shuffledDeck(random);
  const rngSeed = Math.floor(random() * 2 ** 32);
  // The bot takes the fastest route there; the replay shows it once the round is over.
  const targets = idx.ds.complexes[hider]?.stations ?? [];
  const legs = earliestJourney(idx, hub, hideStart, seekStart, targets) ?? [];
  const hubPlatform = {
    kind: "platform" as const,
    station: hub,
    since: hideStart,
    arrivedDir: null,
  };
  return {
    mode: daily ? "daily" : "practice",
    difficulty,
    daily,
    hub,
    hideStart,
    seekStart,
    seekEnd: seekStart + SEEK_LIMIT_SECONDS,
    hider,
    reachable,
    seeker: { kind: "platform", station: hub, since: seekStart, arrivedDir: null },
    asked: [],
    thermometer: null,
    footThermometer: null,
    result: null,
    hiderTrail: trailFromLegs(idx, hub, hideStart, legs),
    // The seeker waits at the start while the bot hides.
    seekerTrail: [{ t: hideStart, state: hubPlatform }],
    spot: null,
    stationFoundAt: null,
    photoExit: null,
    deck,
    hand: [],
    rngSeed,
    curses: [],
    cardEvents: [],
    lastCurseAt: Number.NEGATIVE_INFINITY,
  };
}

/**
 * Put the hider at a spot near their station: they go up the exit closest to it and
 * walk there (that walk shows in the replay). The spot comes from Street View, so the
 * server picks it (see apps/server) and hands it in.
 */
export function placeHider(round: SoloRound, spot: HidingSpot, idx: TimetableIndex): SoloRound {
  const complex = idx.ds.complexes[round.hider];
  const last = round.hiderTrail.at(-1);
  if (!complex || !last) return { ...round, spot };
  const arrived = resolve(last.state, round.seekStart, idx);
  if (arrived.kind !== "platform") return { ...round, spot };
  const station = idx.ds.stations[arrived.station];
  let exit = 0;
  complex.exits.forEach(([lat, lon], i) => {
    const [bLat, bLon] = complex.exits[exit] ?? [lat, lon];
    if (distanceMeters({ lat, lon }, spot) < distanceMeters({ lat: bLat, lon: bLon }, spot)) {
      exit = i;
    }
  });
  const [exLat, exLon] = complex.exits[exit] ?? [complex.lat, complex.lon];
  const up = arrived.since;
  const out = up + EXIT_SECONDS;
  const there = out + walkSeconds({ lat: exLat, lon: exLon }, spot);
  return {
    ...round,
    spot,
    hiderTrail: [
      ...round.hiderTrail,
      {
        t: up,
        state: {
          kind: "walking",
          reason: "exit",
          start: up,
          end: out,
          fromPoint: [station?.lat ?? complex.lat, station?.lon ?? complex.lon],
          toPoint: [exLat, exLon],
          fromComplex: round.hider,
          dest: { kind: "street", complex: round.hider, exit, since: out },
        },
      },
      {
        t: out,
        state: {
          kind: "walking",
          reason: "street",
          start: out,
          end: there,
          fromPoint: [exLat, exLon],
          toPoint: [spot.lat, spot.lon],
          fromComplex: round.hider,
          dest: { kind: "street", complex: round.hider, exit, at: spot, since: there },
        },
      },
    ],
  };
}

/** The complex the seeker is standing in (platform or street), with the time they got there. */
function standingAt(round: SoloRound, t: number, idx: TimetableIndex) {
  const s = resolve(round.seeker, t, idx);
  if (s.kind === "platform")
    return { complex: idx.ds.stations[s.station]?.complex, since: s.since };
  if (s.kind === "street") return { complex: s.complex, since: s.since };
  return null;
}

/**
 * Settle the round at time t. Standing in the hider's station marks it found (and,
 * with no hiding spot, ends the round); running out of time ends it.
 */
export function advanceSolo(round: SoloRound, t: number, idx: TimetableIndex): SoloRound {
  if (round.result) return round;
  if (round.human) round = advanceHider(round, t, idx);
  if (round.result) return round;
  round = spotOnTheWay(round, t);
  round = settleCurses(round, t, idx);
  if (!round.human) round = hiderCurses(round, t, idx);
  const here = standingAt(round, t, idx);
  if (here && here.complex === round.hider && round.stationFoundAt === null) {
    const at = Math.min(here.since, round.seekEnd);
    if (!round.spot && !round.human)
      return { ...round, stationFoundAt: at, result: { kind: "found", at } };
    round = { ...round, stationFoundAt: at };
  }
  if (t >= round.seekEnd)
    return finishHider({ ...round, result: { kind: "timeout", at: round.seekEnd } });
  return round;
}

/**
 * Fast-forward from `from` to `to`. The round is settled each time the seeker's train
 * leaves a stop on the way, so the hider gets the chances to play a card it would have
 * had in real time (Tourist and Wrong way only fit while you're riding), and the skip
 * stops where a card lands. Returns the round and the time the skip reached.
 */
export function skipSolo(
  round: SoloRound,
  from: number,
  to: number,
  idx: TimetableIndex,
): { round: SoloRound; t: number } {
  const played = round.cardEvents.length;
  for (const t of departuresBetween(round.seeker, from, to, idx)) {
    round = advanceSolo(round, t, idx);
    if (round.result || round.cardEvents.length > played) return { round, t };
  }
  return { round: advanceSolo(round, to, idx), t: to };
}

/** When the seeker's train leaves each of its stops, strictly between `from` and `to`. */
function departuresBetween(s: Transit, from: number, to: number, idx: TimetableIndex): number[] {
  const trip = s.kind === "train" ? idx.ds.trips[s.trip] : undefined;
  if (s.kind !== "train" || !trip) return [];
  const out: number[] = [];
  for (let k = s.from; k < s.to; k++) {
    const dep = trip.dep[k] as number;
    if (dep > from && dep < to) out.push(dep);
  }
  return out;
}

/** Meters walked on the street since game time `since`, up to t (for Tourist). */
function walkedSince(round: SoloRound, since: number, t: number): number {
  return footpathOf(round.seekerTrail).reduce((sum, s) => {
    if (s.start < since || s.start > t) return sum;
    const f = s.end > s.start ? Math.min(1, (t - s.start) / (s.end - s.start)) : 1;
    const a = { lat: s.a[0], lon: s.a[1] };
    return sum + f * distanceMeters(a, { lat: s.b[0], lon: s.b[1] });
  }, 0);
}

/**
 * Curses run out: timed ones at their time, Tourist once you've walked far enough, Wrong
 * way once you've ridden a train the required way.
 */
function settleCurses(round: SoloRound, t: number, idx: TimetableIndex): SoloRound {
  const curses = round.curses.filter((c) => {
    if (c.card === "tourist") return !touristDone(round, c, t, idx);
    if (c.card === "wrongWay") return t < c.until && !wrongWayDone(round, c, t, idx);
    return t < c.until;
  });
  return curses.length === round.curses.length ? round : { ...round, curses };
}

/**
 * Wrong way is served once a train running the required way has left with you on it.
 * Boarding isn't enough: you could cancel before it leaves and board the other way.
 */
function wrongWayDone(
  round: SoloRound,
  c: Extract<ActiveCurse, { card: "wrongWay" }>,
  t: number,
  idx: TimetableIndex,
): boolean {
  return round.seekerTrail.some(({ t: boarded, state }, i) => {
    if (boarded < c.at || state.kind !== "train") return false;
    const trip = idx.ds.trips[state.trip];
    const leaves = trip?.dep[state.from];
    // Still on it when it left (a cancel comes before the train leaves).
    const until = round.seekerTrail[i + 1]?.t ?? Number.POSITIVE_INFINITY;
    return trip?.dir === c.dir && leaves !== undefined && leaves <= t && leaves <= until;
  });
}

function touristDone(
  round: SoloRound,
  c: Extract<ActiveCurse, { card: "tourist" }>,
  t: number,
  idx: TimetableIndex,
): boolean {
  // Still on the train to the stop you have to get off at: not yet.
  if (resolve(round.seeker, t, idx).kind === "train") return false;
  return walkedSince(round, c.at, t) >= TOURIST_WALK_M;
}

/** Least time between the hider's curses, so they come spaced out. */
export const CURSE_GAP_SECONDS = 10 * 60;

/** The hider plays a curse when one fits the moment (one at a time, spaced out). */
function hiderCurses(round: SoloRound, t: number, idx: TimetableIndex): SoloRound {
  if (round.curses.length > 0 || t < round.lastCurseAt + CURSE_GAP_SECONDS) return round;
  if (t < round.seekStart) return round;
  const seeker = resolve(round.seeker, t, idx);
  const card = botCurse({
    seeker,
    t,
    idx,
    hider: round.hider,
    spot: round.spot,
    candidates: candidates(round, idx, t).length,
    hand: round.hand,
    difficulty: round.difficulty,
  });
  if (!card) return round;
  const next = activateCurse(round, card, t, idx);
  if (!next) return round;
  return {
    ...next,
    hand: playCard(round.hand, round.hand.indexOf(card), CARDS[card].cost ?? 0),
    cardEvents: [...round.cardEvents, { t, card }],
  };
}

/** Shared effect only: human and bot controllers choose and pay for their own cards. */
export function activateCurse(
  round: SoloRound,
  card: CurseId,
  t: number,
  idx: TimetableIndex,
): SoloRound | null {
  const seeker = resolve(round.seeker, t, idx);
  let curse: ActiveCurse;
  let next = round;
  const duration = CARDS[card].durationSeconds ?? 0;
  if (card === "wrongWay" || card === "tourist") {
    if (seeker.kind !== "train") return null;
    const trip = idx.ds.trips[seeker.trip];
    const k = nextStopIndex(seeker, t, idx);
    if (!trip || k === null) return null;
    if (card === "wrongWay") {
      curse = {
        card,
        at: t,
        dir: trip.dir === 0 ? 1 : 0,
        until: t + WRONG_WAY_MAX_SECONDS,
      };
    } else {
      // Off at the next stop.
      const ride = { ...seeker, to: Math.min(seeker.to, k) };
      next = { ...round, seeker: ride, seekerTrail: [...round.seekerTrail, { t, state: ride }] };
      curse = { card, at: t, station: trip.stops[k] as number };
    }
  } else {
    curse = { card, at: t, until: t + duration };
  }
  return { ...next, curses: [...round.curses, curse], lastCurseAt: t };
}

/** Why a curse stops this move, or null. */
function curseBlocks(
  round: SoloRound,
  intent: TransitIntent,
  t: number,
  idx: TimetableIndex,
): string | null {
  const { ds } = idx;
  for (const c of round.curses) {
    if (c.card === "wrongWay" && intent.type === "board") {
      const trip = ds.trips[intent.trip];
      const here = trip && ds.stations[trip.stops[intent.stop] as number];
      if (trip && trip.dir !== c.dir) {
        const way = here ? (c.dir === 0 ? here.northLabel : here.southLabel) : "the other way";
        return `Wrong way: your next train has to run ${way}.`;
      }
    }
    if (c.card === "tourist") {
      const s = resolve(round.seeker, t, idx);
      if (intent.type === "alightAt" && s.kind === "train") {
        const stop = ds.trips[s.trip]?.stops[intent.stop];
        if (stop !== c.station) return "Tourist: you have to get off at the next stop.";
      }
      if (intent.type === "board" || intent.type === "transfer") {
        return `Tourist: go up to the street and walk ${TOURIST_WALK_M} m before going back in.`;
      }
      if (intent.type === "enter") {
        const left = Math.ceil(TOURIST_WALK_M - walkedSince(round, c.at, t));
        if (left > 0) return `Tourist: walk ${left} m more before going back in.`;
      }
    }
  }
  return null;
}

/** A move's knock-on effects from curses: Sidewalk shed slows walks. */
function underCurses(round: SoloRound, moved: Transit, t: number): Transit {
  const shed = round.curses.find((c) => c.card === "shed");
  if (shed && moved.kind === "walking" && moved.reason === "street" && moved.start === t) {
    const end = t + 2 * (moved.end - moved.start);
    return { ...moved, end, dest: { ...moved.dest, since: end } };
  }
  return moved;
}

/**
 * How far along a straight walk from `a` to `b` (0–1) you first come within `r` m of
 * `p`. Null if you never do, or if you start within it (walking away from a marker
 * you can already see shouldn't stop you).
 */
export function firstWithin(a: LatLon, b: LatLon, p: { lat: number; lon: number }, r: number) {
  const [ax, ay] = localMeters(p, { lat: a[0], lon: a[1] });
  const [bx, by] = localMeters(p, { lat: b[0], lon: b[1] });
  const [dx, dy] = [bx - ax, by - ay];
  const qa = dx * dx + dy * dy;
  const qb = 2 * (ax * dx + ay * dy);
  const qc = ax * ax + ay * ay - r * r;
  if (qc <= 0 || qa === 0) return null;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return null;
  const f = (-qb - Math.sqrt(disc)) / (2 * qa);
  return f >= 0 && f <= 1 ? f : null;
}

/**
 * Walking past the hider: a walk along the street stops where they come into view, so
 * clicking the map to cross the zone is a real way to search, and everywhere you've
 * walked is searched (see SoloView.footpath).
 */
function spotOnTheWay(round: SoloRound, t: number): SoloRound {
  let s = round.seeker;
  if (!round.spot || s.kind !== "walking" || s.reason !== "street") return round;
  // A human spot did not exist before its lock. Do not replay an earlier sighting.
  const lockedAt = round.human?.lock?.at;
  let appearedDuringWalk = false;
  if (lockedAt !== undefined && s.start < lockedAt) {
    if (s.end <= lockedAt) return round;
    const f = (lockedAt - s.start) / (s.end - s.start);
    s = {
      ...s,
      start: lockedAt,
      fromPoint: [
        s.fromPoint[0] + f * (s.toPoint[0] - s.fromPoint[0]),
        s.fromPoint[1] + f * (s.toPoint[1] - s.fromPoint[1]),
      ],
    };
    appearedDuringWalk = true;
  }
  // Already in sight where the walk began (usually because the last walk stopped when
  // they came into view): walking on, toward them or away, doesn't stop you again.
  // Checked at the reveal distance, not the stopping one, since the last stop can land a
  // rounding error outside 39.5 m and every walk toward them would stop on the spot.
  const from = { lat: s.fromPoint[0], lon: s.fromPoint[1] };
  const inSight = distanceMeters(from, round.spot) <= SPOT_REVEAL_METERS;
  if (inSight && !appearedDuringWalk) return round;
  // A hair inside the reveal distance, so the marker shows where you stop.
  const f = inSight ? 0 : firstWithin(s.fromPoint, s.toPoint, round.spot, SPOT_REVEAL_METERS - 0.5);
  if (f === null) return round;
  const at = s.start + f * (s.end - s.start);
  if (at > t || s.dest.kind !== "street") return round;
  const stop: OnStreet = {
    kind: "street",
    complex: s.dest.complex,
    exit: s.dest.exit,
    up: s.dest.up,
    at: {
      lat: s.fromPoint[0] + f * (s.toPoint[0] - s.fromPoint[0]),
      lon: s.fromPoint[1] + f * (s.toPoint[1] - s.fromPoint[1]),
    },
    since: at,
  };
  return { ...round, seeker: stop, seekerTrail: [...round.seekerTrail, { t: at, state: stop }] };
}

/** Meters from the seeker (standing on the street) to the hiding spot; null if not applicable. */
function metersToSpot(round: SoloRound, t: number, idx: TimetableIndex): number | null {
  if (!round.spot) return null;
  const s = resolve(round.seeker, t, idx);
  if (s.kind !== "street") return null;
  return distanceMeters(streetPoint(s, idx), round.spot);
}

/** Whether the seeker can see the hider's marker from where they stand at t. */
function spotInSight(round: SoloRound, t: number, idx: TimetableIndex): boolean {
  return (metersToSpot(round, t, idx) ?? Number.POSITIVE_INFINITY) <= SPOT_REVEAL_METERS;
}

/**
 * A hider in sight can be walked to even past STREET_RADIUS_M: a spot in a neighbouring
 * station's zone can be 600 m or more from the station you came up at, and "seen but too
 * far to walk" (the S4 sim, 2026-10-07) is no rule anyone would want. Only to within the
 * reveal distance of them; the rest of the street keeps its limit.
 */
function walkPastRadius(round: SoloRound, intent: SoloIntent, t: number, idx: TimetableIndex) {
  if (intent.type !== "walkTo" || !round.spot || !spotInSight(round, t, idx)) return false;
  return distanceMeters({ lat: intent.lat, lon: intent.lon }, round.spot) <= SPOT_REVEAL_METERS;
}

/**
 * When the hunt ended and the foot search began: the time you reached the hider's
 * station, or, caught from a neighbouring station's street (a quarter of catches in the
 * S4 sim), the time you came up there.
 */
function huntEndedAt(round: SoloRound, t: number, idx: TimetableIndex): number {
  if (round.stationFoundAt !== null) return round.stationFoundAt;
  const s = resolve(round.seeker, t, idx);
  return s.kind === "street" ? (s.up ?? s.since) : t;
}

/**
 * Record a question and the hider's response: the answer (or a Veto, or Randomize's
 * replacement question), then the hider's draw. A vetoed question draws nothing. Station
 * questions land at the end of the answer window, and so does any card played on them.
 */
function answerQuestion(
  round: SoloRound,
  asked: Asked,
  play: BotPlay,
  t: number,
  idx: TimetableIndex,
): SoloRound {
  const answerAt = categoryOf(asked.q) === "onFoot" ? t : t + ANSWER_WINDOW_SECONDS;
  let entry: Asked & { randomizedFrom?: Question } = asked;
  let hand = round.hand;
  let deck = round.deck;
  const events = [...round.cardEvents];
  if (play) {
    hand = playCard(hand, hand.indexOf(play.card));
    events.push({ t: answerAt, card: play.card });
    if (play.card === "veto") {
      entry = { ...asked, answer: { vetoed: true } };
    } else if (isMapQuestion(play.question)) {
      entry = {
        q: play.question,
        ctx: asked.ctx,
        answer: evaluate(idx.ds, play.question, round.hider, asked.ctx),
        randomizedFrom: asked.q,
      };
    }
  }
  if (play?.card !== "veto") {
    const { draw, keep } = DRAWS[categoryOf(entry.q)];
    ({ hand, deck } = drawAndKeep(hand, deck, draw, keep));
    if (botRedraw(hand)) {
      events.push({ t, card: "redraw" });
      hand = playCard(hand, hand.indexOf("redraw"), 2);
      ({ hand, deck } = drawAndKeep(hand, deck, 3, 3));
    }
  }
  // What's known once this answer lands (an earlier one may still be in its window).
  const known = [...answeredBy(round.asked, answerAt), entry];
  const remaining = filterCandidates(idx.ds, round.reachable, known).length;
  return {
    ...round,
    asked: [...round.asked, { ...entry, at: t, answerAt, remaining }],
    hand,
    deck,
    cardEvents: events,
    // A reading restarts the thermometer from here, so you can keep chaining. A vetoed
    // one too: it closes the thermometer for the round, and not moving it would show the
    // veto before the answer window ends.
    thermometer: asked.q.kind === "thermometer" ? asked.ctx.origin : round.thermometer,
    footThermometer: asked.q.kind === "spotThermometer" ? asked.ctx.origin : round.footThermometer,
  };
}

/** The questions whose answers have landed by t. */
function answeredBy<T extends { answerAt: number }>(asked: readonly T[], t: number): T[] {
  return asked.filter((a) => a.answerAt <= t);
}

/** When the next answer still in its window lands, or null if none is waiting. */
export function nextAnswerAt(round: SoloRound, t: number): number | null {
  const waiting = round.asked.filter((a) => a.answerAt > t).map((a) => a.answerAt);
  return waiting.length > 0 ? Math.min(...waiting) : null;
}

export type SoloResult = { ok: true; round: SoloRound } | { ok: false; error: string };

export function applySoloIntent(
  current: SoloRound,
  intent: SoloIntent,
  t: number,
  idx: TimetableIndex,
): SoloResult {
  const round = advanceSolo(current, t, idx);
  if (round.result) return { ok: false, error: "This round is over." };

  if (round.human && t < round.seekStart) return { ok: false, error: "Trains open at 10:20." };
  switch (intent.type) {
    case "ask": {
      const ready = askReadyAt(round.asked, categoryOf(intent.question));
      if (t < ready) {
        const min = Math.ceil((ready - t) / 60);
        return { ok: false, error: `You can ask that again in ${min} min.` };
      }
      const q = intent.question;
      if (closedQuestions(answeredBy(round.asked, t)).has(questionKey(q))) {
        return { ok: false, error: "The hider vetoed that question. It's closed for the round." };
      }
      const ctx: AskContext = {
        origin: questionOrigin(round.seeker, t, idx),
        baseline:
          q.kind === "thermometer"
            ? round.thermometer
            : q.kind === "spotThermometer"
              ? round.footThermometer
              : null,
      };
      let answer: Answer;
      if (isSpotQuestion(q)) {
        if (!round.spot && !round.human)
          return { ok: false, error: "There's no hiding spot this round." };
        if (resolve(round.seeker, t, idx).kind !== "street") {
          return { ok: false, error: "Ask on-foot questions standing on the street." };
        }
        const error = questionError(idx.ds, q, ctx);
        if (error) return { ok: false, error };
        answer = round.human
          ? humanAnswer(round, { q, ctx, answer: false }, t, idx)
          : evaluateSpot(q, round.spot as HidingSpot, ctx);
      } else if (q.kind === "photo") {
        const pano = q.from === "exit" ? round.photoExit : round.spot?.pano;
        if (!pano && !round.human)
          return { ok: false, error: "No photo available for this round." };
        if (q.from === "spot" && t < round.seekStart + SPOT_PHOTOS_OPEN_SECONDS) {
          return { ok: false, error: "Photos from the hiding spot open 15 min into the round." };
        }
        answer = { photo: photoCamera(pano ?? "", q.look) };
      } else {
        const error = questionError(idx.ds, q, ctx);
        if (error) return { ok: false, error };
        answer = evaluate(idx.ds, q, round.hider, ctx);
      }
      if (round.human)
        return { ok: true, round: queueHumanQuestion(round, { q, ctx, answer }, t, idx) };
      // The hider may answer a station question with Veto or Randomize.
      const play = botPowerup(
        idx.ds,
        q,
        ctx,
        candidates(round, idx, t),
        round.hand,
        closedQuestions(round.asked),
        seededRandom(hashString(`${round.rngSeed}|${round.asked.length}`)),
      );
      return { ok: true, round: answerQuestion(round, { q, ctx, answer }, play, t, idx) };
    }
    case "giveUp":
      return { ok: true, round: { ...round, result: { kind: "gaveUp", at: t } } };
    case "catch": {
      const d = metersToSpot(round, t, idx);
      if (d === null) return { ok: false, error: "There's no one to catch here." };
      if (d > CATCH_METERS) return { ok: false, error: "Not close enough. Get within 25 m." };
      const stationFoundAt = huntEndedAt(round, t, idx);
      return {
        ok: true,
        round: finishHider({ ...round, stationFoundAt, result: { kind: "found", at: t } }),
      };
    }
    case "startThermometer":
      return { ok: true, round: { ...round, thermometer: questionOrigin(round.seeker, t, idx) } };
    case "startFootThermometer": {
      if (resolve(round.seeker, t, idx).kind !== "street") {
        return { ok: false, error: "Start it standing on the street." };
      }
      return {
        ok: true,
        round: { ...round, footThermometer: questionOrigin(round.seeker, t, idx) },
      };
    }
    default: {
      const blocked = curseBlocks(round, intent, t, idx);
      if (blocked) return { ok: false, error: blocked };
      const moved = applyIntent(round.seeker, intent, t, idx, {
        pastRadius: walkPastRadius(round, intent, t, idx),
      });
      if (!moved.ok) return moved;
      const seeker = underCurses(round, moved.state, t);
      const seekerTrail = [...round.seekerTrail, { t, state: seeker }];
      return { ok: true, round: advanceSolo({ ...round, seeker, seekerTrail }, t, idx) };
    }
  }
}

/** The stations still possible from the answers that have landed by t. */
export function candidates(round: SoloRound, idx: TimetableIndex, t: number): number[] {
  return filterCandidates(idx.ds, round.reachable, answeredBy(round.asked, t));
}

/** Minutes the seeker's questions added to the hider's score (vetoed ones too). */
export function questionBonusSeconds(asked: readonly { q: Question }[]): number {
  return asked.reduce((sum, a) => sum + QUESTION_RULES[categoryOf(a.q)].bonusSeconds, 0);
}

/** The hider's bonus: every question, plus time bonuses still held once the round is over. */
export function bonusSeconds(round: SoloRound): number {
  return questionBonusSeconds(round.asked) + (round.result ? handBonusSeconds(round.hand) : 0);
}

/**
 * When a question of this category can next be asked: its own cooldown since the last
 * one of the category, and the short gap since any question. On-foot questions skip the
 * gap (it paces the station hunt; the street search wants quick questions). 0 = now.
 */
export function askReadyAt(
  asked: readonly { q: Question; at: number }[],
  category: QuestionCategory,
): number {
  let ready = 0;
  for (const a of asked) {
    const other = categoryOf(a.q);
    if (category !== "onFoot" && other !== "onFoot") {
      ready = Math.max(ready, a.at + QUESTION_GAP_SECONDS);
    }
    if (other === category) {
      ready = Math.max(ready, a.at + QUESTION_RULES[category].cooldownSeconds);
    }
  }
  return ready;
}

/**
 * A question as the seeker sees it. In its answer window it shows as asked (before any
 * Randomize), with no answer and no count yet.
 */
export interface SeenQuestion extends Omit<AskedQuestion, "answer" | "remaining"> {
  answer: Answer | null;
  remaining: number | null;
}

/** Whether a question's answer has landed (it's out of its answer window). */
export function isAnswered(a: SeenQuestion): a is AskedQuestion {
  return a.answer !== null;
}

/** What the seeker may see: everything except the hider, until the round ends. */
export interface SoloView {
  /** Public mode capability, never a signal of the actual hider lock. */
  mobileHider?: boolean;
  hideStatus?: "riding" | "changing" | "walking";
  mode: RoundMode;
  difficulty: Difficulty;
  daily: DailyInfo | null;
  hub: number;
  hideStart: number;
  seekStart: number;
  seekEnd: number;
  reachable: number[];
  candidates: number[];
  seeker: Transit;
  asked: SeenQuestion[];
  thermometer: Place | null;
  bonusSeconds: number;
  result: RoundResult | null;
  /** Only once the round is over (revealsHider). */
  hider: number | null;
  /** Both routes, for the end-of-round replay — only once the round is over. */
  replay: { hider: TrailEntry[]; seeker: TrailEntry[] } | null;
  /** Whether this round has a Street View endgame (a hiding spot to catch). */
  hasSpot: boolean;
  /**
   * When the hunt ended: you first reached the hider's station or, caught from a
   * neighbouring station's street, came up there. Only revealed with the hider.
   */
  stationFoundAt: number | null;
  /** The hider's spot once you're within SPOT_REVEAL_METERS on the street, or revealed with the hider. */
  spotNearby: { lat: number; lon: number } | null;
  footThermometer: Place | null;
  /** Everywhere you've walked or stood on the street, for the searched area. */
  footpath: FootSegment[];
  /** The hider's hand, once the round is over. How many they hold is secret till then. */
  hiderHand: CardId[] | null;
  /** Curses on you right now. */
  curses: ActiveCurse[];
  /** The cards the hider has played on you, in order (all of them once the round is over). */
  cardEvents: CardEvent[];
}

/**
 * A stretch you walked on the street (from `a` at `start` to `b` at `end`), or a place
 * you stood (a = b). Nobody is within SPOT_REVEAL_METERS of it, or you'd have seen them.
 */
export interface FootSegment {
  a: LatLon;
  b: LatLon;
  start: number;
  end: number;
}

/** The seeker's street walks from their trail, each cut short where the next move began. */
export function footpathOf(trail: readonly TrailEntry[]): FootSegment[] {
  const out: FootSegment[] = [];
  trail.forEach(({ state: s }, i) => {
    const next = trail[i + 1]?.t ?? Number.POSITIVE_INFINITY;
    if (s.kind === "walking" && s.reason === "street") {
      const end = Math.min(s.end, next);
      const f = s.end > s.start ? (end - s.start) / (s.end - s.start) : 1;
      const b: LatLon = [
        s.fromPoint[0] + f * (s.toPoint[0] - s.fromPoint[0]),
        s.fromPoint[1] + f * (s.toPoint[1] - s.fromPoint[1]),
      ];
      out.push({ a: s.fromPoint, b, start: s.start, end });
    } else if (s.kind === "walking" && s.reason === "exit" && s.dest.kind === "street") {
      out.push({ a: s.toPoint, b: s.toPoint, start: s.end, end: s.end });
    } else if (s.kind === "street" && s.at) {
      const p: LatLon = [s.at.lat, s.at.lon];
      out.push({ a: p, b: p, start: s.since, end: s.since });
    }
  });
  return out;
}

/** Cards the seeker sees played: the ones that act on them. Discard 2, draw 3 doesn't. */
function playedOnSeeker(e: CardEvent): boolean {
  return e.card === "veto" || e.card === "randomize" || CARDS[e.card].kind === "curse";
}

/**
 * Whether the round's end reveals where the hider was: once it's over, however it ended.
 * The reveal is the reward for trying, as Wordle shows the word after a miss. Everyone
 * plays the same daily hider, so giving up, learning the station and replaying in a fresh
 * browser is possible; it only ever fools that browser's own record and an honor-system
 * share line, so it's left to the honor system until there's a server-side record to
 * protect (then the server refuses a second daily per recorded result). Reversed
 * 2026-10-07 from "a daily that isn't found keeps its station secret until the next day".
 */
export function revealsHider(round: Pick<SoloRound, "mode" | "result">): boolean {
  return round.result !== null;
}

/**
 * The seeker's view of the round at time t: the engine's one visibility filter. The
 * hider's station, spot and route stay secret until the round ends (revealsHider); their
 * hand until it ends; answers wait for their window; the marker shows within
 * SPOT_REVEAL_METERS.
 */
export function soloView(round: SoloRound, t: number, idx: TimetableIndex): SoloView {
  if (round.human) round = advanceSolo(round, t, idx);
  const over = round.result !== null;
  const revealed = revealsHider(round);
  const near =
    round.spot !== null &&
    (revealed ||
      (!over && (metersToSpot(round, t, idx) ?? Number.POSITIVE_INFINITY) <= SPOT_REVEAL_METERS));
  return {
    mode: round.mode,
    difficulty: round.difficulty,
    daily: round.daily,
    hub: round.hub,
    hideStart: round.hideStart,
    seekStart: round.seekStart,
    seekEnd: round.seekEnd,
    reachable: round.reachable,
    candidates: over
      ? filterCandidates(idx.ds, round.reachable, round.asked)
      : candidates(round, idx, t),
    seeker: round.seeker,
    asked: round.asked.map((a): SeenQuestion => {
      if (over || a.answerAt <= t) return a;
      return {
        q: a.randomizedFrom ?? a.q,
        ctx: a.ctx,
        at: a.at,
        answerAt: a.answerAt,
        answer: null,
        remaining: null,
      };
    }),
    thermometer: round.thermometer,
    bonusSeconds: bonusSeconds(round),
    result: round.result,
    hider: revealed ? round.hider : null,
    replay: over ? { hider: revealed ? round.hiderTrail : [], seeker: round.seekerTrail } : null,
    hasSpot: round.human ? true : round.spot !== null,
    ...(round.human
      ? {
          mobileHider: true,
          ...(t < round.seekStart ? { hideStatus: hideStatus(round, t, idx) } : {}),
        }
      : {}),
    // Not shown mid-round: confirming "right station" would give the zone away.
    stationFoundAt: revealed ? round.stationFoundAt : null,
    spotNearby: near && round.spot ? { lat: round.spot.lat, lon: round.spot.lon } : null,
    footThermometer: round.footThermometer,
    footpath: footpathOf(round.seekerTrail),
    hiderHand: over ? round.hand : null,
    curses: round.curses,
    // Sorted: a card played on a question is stamped when its answer lands, which can be
    // after a curse played in the meantime.
    cardEvents: round.cardEvents
      .filter((e) => over || (e.t <= t && playedOnSeeker(e)))
      .sort((a, b) => a.t - b.t),
  };
}
