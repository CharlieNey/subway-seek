/**
 * M2: a single-player round against a bot hider. The bot has already hidden — it left
 * the hub at 10:00 and had 20 minutes — so seeking starts at 10:20 with no waiting.
 * You find the station by being there: on one of its platforms or at its street exit.
 * The two-player round with a real hiding phase and a spot endgame is M3.
 */
import type { DailyInfo } from "./daily.ts";
import {
  type Answer,
  type AskContext,
  type Asked,
  evaluate,
  filterCandidates,
  type Place,
  type Question,
  questionError,
  questionOrigin,
} from "./questions.ts";
import { earliestJourney, reachableComplexes } from "./reach.ts";
import type { TimetableIndex } from "./timetable.ts";
import { type TrailEntry, trailFromLegs } from "./trail.ts";
import {
  applyIntent,
  EXIT_SECONDS,
  metersBetween,
  resolve,
  streetPoint,
  type Transit,
  type TransitIntent,
  walkSeconds,
} from "./transit.ts";

export const HIDE_SECONDS = 20 * 60;
export const SEEK_LIMIT_SECONDS = 2 * 3600;
export const QUESTION_COOLDOWN_SECONDS = 5 * 60;
export const QUESTION_BONUS_SECONDS = 10 * 60;
/** Zone radius around the hider's station; the hiding spot is inside it. */
export const ZONE_RADIUS_M = 400;
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
  /** Stations still possible after this answer. */
  remaining: number;
}

export type RoundResult =
  | { kind: "found"; at: number }
  | { kind: "timeout"; at: number }
  | { kind: "gaveUp"; at: number };

export type RoundMode = "daily" | "practice";

export interface SoloRound {
  mode: RoundMode;
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
  cooldownUntil: number;
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
  /** When the seeker first stood in the hider's station: the endgame starts. */
  stationFoundAt: number | null;
}

export type SoloIntent =
  | TransitIntent
  | { type: "ask"; question: Question }
  | { type: "startThermometer" }
  | { type: "giveUp" }
  | { type: "catch" };

export function createSoloRound(
  idx: TimetableIndex,
  {
    hub,
    hideStart,
    random = Math.random,
    daily = null,
  }: { hub: number; hideStart: number; random?: () => number; daily?: DailyInfo | null },
): SoloRound {
  const seekStart = hideStart + HIDE_SECONDS;
  const reachable = reachableComplexes(idx, hub, hideStart, seekStart);
  if (reachable.length === 0) throw new Error("hider can't reach anywhere");
  const hider = reachable[Math.floor(random() * reachable.length)] as number;
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
    cooldownUntil: seekStart,
    result: null,
    hiderTrail: trailFromLegs(idx, hub, hideStart, legs),
    // The seeker waits at the start while the bot hides.
    seekerTrail: [{ t: hideStart, state: hubPlatform }],
    spot: null,
    stationFoundAt: null,
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
    if (metersBetween({ lat, lon }, spot) < metersBetween({ lat: bLat, lon: bLon }, spot)) exit = i;
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
  const here = standingAt(round, t, idx);
  if (here && here.complex === round.hider && round.stationFoundAt === null) {
    const at = Math.min(here.since, round.seekEnd);
    if (!round.spot) return { ...round, stationFoundAt: at, result: { kind: "found", at } };
    round = { ...round, stationFoundAt: at };
  }
  if (t >= round.seekEnd) return { ...round, result: { kind: "timeout", at: round.seekEnd } };
  return round;
}

/** Meters from the seeker (standing on the street) to the hiding spot; null if not applicable. */
function metersToSpot(round: SoloRound, t: number, idx: TimetableIndex): number | null {
  if (!round.spot) return null;
  const s = resolve(round.seeker, t, idx);
  if (s.kind !== "street") return null;
  return metersBetween(streetPoint(s, idx), round.spot);
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

  switch (intent.type) {
    case "ask": {
      if (t < round.cooldownUntil) {
        const min = Math.ceil((round.cooldownUntil - t) / 60);
        return { ok: false, error: `You can ask again in ${min} min.` };
      }
      const ctx: AskContext = {
        origin: questionOrigin(round.seeker, t, idx),
        baseline: intent.question.kind === "thermometer" ? round.thermometer : null,
      };
      const error = questionError(idx.ds, intent.question, ctx);
      if (error) return { ok: false, error };
      const answer: Answer = evaluate(idx.ds, intent.question, round.hider, ctx);
      const entry: Asked = { q: intent.question, ctx, answer };
      const remaining = filterCandidates(idx.ds, round.reachable, [...round.asked, entry]).length;
      return {
        ok: true,
        round: {
          ...round,
          asked: [...round.asked, { ...entry, at: t, remaining }],
          cooldownUntil: t + QUESTION_COOLDOWN_SECONDS,
          // A thermometer reading restarts it from here, so you can keep chaining.
          thermometer: intent.question.kind === "thermometer" ? ctx.origin : round.thermometer,
        },
      };
    }
    case "giveUp":
      return { ok: true, round: { ...round, result: { kind: "gaveUp", at: t } } };
    case "catch": {
      const d = metersToSpot(round, t, idx);
      if (d === null) return { ok: false, error: "There's no one to catch here." };
      if (d > CATCH_METERS) return { ok: false, error: "Not close enough — get within 25 m." };
      return { ok: true, round: { ...round, result: { kind: "found", at: t } } };
    }
    case "startThermometer":
      return { ok: true, round: { ...round, thermometer: questionOrigin(round.seeker, t, idx) } };
    default: {
      const moved = applyIntent(round.seeker, intent, t, idx);
      if (!moved.ok) return moved;
      const seekerTrail = [...round.seekerTrail, { t, state: moved.state }];
      return {
        ok: true,
        round: advanceSolo({ ...round, seeker: moved.state, seekerTrail }, t, idx),
      };
    }
  }
}

export function candidates(round: SoloRound, idx: TimetableIndex): number[] {
  return filterCandidates(idx.ds, round.reachable, round.asked);
}

export function bonusSeconds(round: SoloRound): number {
  return round.asked.length * QUESTION_BONUS_SECONDS;
}

/** What the seeker may see: everything except the hider, until the round ends. */
export interface SoloView {
  mode: RoundMode;
  daily: DailyInfo | null;
  hub: number;
  hideStart: number;
  seekStart: number;
  seekEnd: number;
  reachable: number[];
  candidates: number[];
  seeker: Transit;
  asked: AskedQuestion[];
  thermometer: Place | null;
  cooldownUntil: number;
  bonusSeconds: number;
  result: RoundResult | null;
  /** Only once the round is over. */
  hider: number | null;
  /** Both routes, for the end-of-round replay — only once the round is over. */
  replay: { hider: TrailEntry[]; seeker: TrailEntry[] } | null;
  /** Whether this round has a Street View endgame (a hiding spot to catch). */
  hasSpot: boolean;
  /** When you first reached the hider's station — only revealed once the round is over. */
  stationFoundAt: number | null;
  /** The hider's spot once you're within SPOT_REVEAL_METERS on the street (or after the round). */
  spotNearby: { lat: number; lon: number } | null;
}

export function soloView(round: SoloRound, idx: TimetableIndex): SoloView {
  return {
    mode: round.mode,
    daily: round.daily,
    hub: round.hub,
    hideStart: round.hideStart,
    seekStart: round.seekStart,
    seekEnd: round.seekEnd,
    reachable: round.reachable,
    candidates: candidates(round, idx),
    seeker: round.seeker,
    asked: round.asked,
    thermometer: round.thermometer,
    cooldownUntil: round.cooldownUntil,
    bonusSeconds: bonusSeconds(round),
    result: round.result,
    hider: round.result ? round.hider : null,
    replay: round.result ? { hider: round.hiderTrail, seeker: round.seekerTrail } : null,
    hasSpot: round.spot !== null,
    // Not shown mid-round: confirming "right station" would give the zone away.
    stationFoundAt: round.result ? round.stationFoundAt : null,
    spotNearby: null,
  };
}

/** soloView plus the time-dependent reveal of the hider's marker. */
export function soloViewAt(round: SoloRound, t: number, idx: TimetableIndex): SoloView {
  const view = soloView(round, idx);
  if (!round.spot) return view;
  const near =
    round.result !== null || (metersToSpot(round, t, idx) ?? Infinity) <= SPOT_REVEAL_METERS;
  return near ? { ...view, spotNearby: { lat: round.spot.lat, lon: round.spot.lon } } : view;
}
