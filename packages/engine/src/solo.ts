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
  DRAWS,
  drawAndKeep,
  handBonusSeconds,
  playCard,
  shuffledDeck,
  TOURIST_WALK_M,
  WRONG_WAY_MAX_SECONDS,
} from "./cards.ts";
import { type DailyInfo, hashString, seededRandom } from "./daily.ts";
import { type BotPlay, botCurse, botPowerup, botRedraw, nextStopIndex } from "./hiderBot.ts";
import {
  type Answer,
  type AskContext,
  type Asked,
  categoryOf,
  evaluate,
  evaluateSpot,
  filterCandidates,
  isMapQuestion,
  isSpotQuestion,
  isVetoed,
  type Place,
  photoCamera,
  type Question,
  type QuestionCategory,
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
  /** Stations still possible after this answer. */
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

/** A card the hider played (public, for the seeker's log and notices). */
export interface CardEvent {
  t: number;
  card: CardId;
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
  /** When the seeker first stood in the hider's station: the endgame starts. */
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
  }: { hub: number; hideStart: number; random?: () => number; daily?: DailyInfo | null },
): SoloRound {
  const seekStart = hideStart + HIDE_SECONDS;
  const reachable = reachableComplexes(idx, hub, hideStart, seekStart);
  if (reachable.length === 0) throw new Error("hider can't reach anywhere");
  const hider = reachable[Math.floor(random() * reachable.length)] as number;
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
  round = spotOnTheWay(round, t);
  round = settleCurses(round, t, idx);
  round = hiderCurses(round, t, idx);
  const here = standingAt(round, t, idx);
  if (here && here.complex === round.hider && round.stationFoundAt === null) {
    const at = Math.min(here.since, round.seekEnd);
    if (!round.spot) return { ...round, stationFoundAt: at, result: { kind: "found", at } };
    round = { ...round, stationFoundAt: at };
  }
  if (t >= round.seekEnd) return { ...round, result: { kind: "timeout", at: round.seekEnd } };
  return round;
}

/** Meters walked on the street since game time `since`, up to t (for Tourist). */
function walkedSince(round: SoloRound, since: number, t: number): number {
  return footpathOf(round.seekerTrail).reduce((sum, s) => {
    if (s.start < since || s.start > t) return sum;
    const f = s.end > s.start ? Math.min(1, (t - s.start) / (s.end - s.start)) : 1;
    const a = { lat: s.a[0], lon: s.a[1] };
    return sum + f * metersBetween(a, { lat: s.b[0], lon: s.b[1] });
  }, 0);
}

/** Curses run out: timed ones at their time, Tourist once you've walked far enough. */
function settleCurses(round: SoloRound, t: number, idx: TimetableIndex): SoloRound {
  const curses = round.curses.filter((c) =>
    c.card === "tourist" ? !touristDone(round, c, t, idx) : t < c.until,
  );
  return curses.length === round.curses.length ? round : { ...round, curses };
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
    candidates: candidates(round, idx).length,
    hand: round.hand,
  });
  if (!card) return round;
  let curse: ActiveCurse;
  let next = round;
  const duration = CARDS[card].durationSeconds ?? 0;
  if (card === "wrongWay" || card === "tourist") {
    if (seeker.kind !== "train") return round;
    const trip = idx.ds.trips[seeker.trip];
    const k = nextStopIndex(seeker, t, idx);
    if (!trip || k === null) return round;
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
  return {
    ...next,
    hand: playCard(round.hand, round.hand.indexOf(card), CARDS[card].cost ?? 0),
    curses: [...round.curses, curse],
    cardEvents: [...round.cardEvents, { t, card }],
    lastCurseAt: t,
  };
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

/** A move's knock-on effects from curses: Sidewalk shed slows walks, boarding ends Wrong way. */
function underCurses(
  round: SoloRound,
  intent: TransitIntent,
  moved: Transit,
  t: number,
): {
  seeker: Transit;
  curses: ActiveCurse[];
} {
  let seeker = moved;
  const shed = round.curses.find((c) => c.card === "shed");
  if (shed && moved.kind === "walking" && moved.reason === "street" && moved.start === t) {
    const end = t + 2 * (moved.end - moved.start);
    seeker = { ...moved, end, dest: { ...moved.dest, since: end } };
  }
  const curses =
    intent.type === "board" ? round.curses.filter((c) => c.card !== "wrongWay") : round.curses;
  return { seeker, curses };
}

/** Flat-earth meters east/north of `o` (the same metric as metersBetween). */
function local(o: { lat: number; lon: number }, lat: number, lon: number): [number, number] {
  const kx = 111_320 * Math.cos((((o.lat + lat) / 2) * Math.PI) / 180);
  return [(lon - o.lon) * kx, (lat - o.lat) * 110_540];
}

/**
 * How far along a straight walk from `a` to `b` (0–1) you first come within `r` m of
 * `p`. Null if you never do, or if you start within it (walking away from a marker
 * you can already see shouldn't stop you).
 */
export function firstWithin(a: LatLon, b: LatLon, p: { lat: number; lon: number }, r: number) {
  const [ax, ay] = local(p, a[0], a[1]);
  const [bx, by] = local(p, b[0], b[1]);
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
  const s = round.seeker;
  if (!round.spot || s.kind !== "walking" || s.reason !== "street") return round;
  // A hair inside the reveal distance, so the marker shows where you stop.
  const f = firstWithin(s.fromPoint, s.toPoint, round.spot, SPOT_REVEAL_METERS - 0.5);
  if (f === null) return round;
  const at = s.start + f * (s.end - s.start);
  if (at > t || s.dest.kind !== "street") return round;
  const stop: OnStreet = {
    kind: "street",
    complex: s.dest.complex,
    exit: s.dest.exit,
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
  return metersBetween(streetPoint(s, idx), round.spot);
}

/**
 * Record a question and the hider's response: the answer (or a Veto, or Randomize's
 * replacement question), then the hider's draw. A vetoed question draws nothing.
 */
function answerQuestion(
  round: SoloRound,
  asked: Asked,
  play: BotPlay,
  t: number,
  idx: TimetableIndex,
): SoloRound {
  let entry: Asked & { randomizedFrom?: Question } = asked;
  let hand = round.hand;
  let deck = round.deck;
  const events = [...round.cardEvents];
  if (play) {
    hand = playCard(hand, hand.indexOf(play.card));
    events.push({ t, card: play.card });
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
  const remaining = filterCandidates(idx.ds, round.reachable, [...round.asked, entry]).length;
  const answered = !isVetoed(entry.answer);
  return {
    ...round,
    asked: [...round.asked, { ...entry, at: t, remaining }],
    hand,
    deck,
    cardEvents: events,
    // A thermometer reading restarts it from here, so you can keep chaining.
    thermometer: entry.q.kind === "thermometer" && answered ? entry.ctx.origin : round.thermometer,
    footThermometer:
      entry.q.kind === "spotThermometer" && answered ? entry.ctx.origin : round.footThermometer,
  };
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
      const ready = askReadyAt(round.asked, categoryOf(intent.question));
      if (t < ready) {
        const min = Math.ceil((ready - t) / 60);
        return { ok: false, error: `You can ask that again in ${min} min.` };
      }
      const q = intent.question;
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
        if (!round.spot) return { ok: false, error: "There's no hiding spot this round." };
        if (resolve(round.seeker, t, idx).kind !== "street") {
          return { ok: false, error: "Ask on-foot questions standing on the street." };
        }
        const error = questionError(idx.ds, q, ctx);
        if (error) return { ok: false, error };
        answer = evaluateSpot(q, round.spot, ctx);
      } else if (q.kind === "photo") {
        const pano = q.from === "exit" ? round.photoExit : round.spot?.pano;
        if (!pano) return { ok: false, error: "No photo available for this round." };
        if (q.from === "spot" && t < round.seekStart + SPOT_PHOTOS_OPEN_SECONDS) {
          return { ok: false, error: "Photos from the hiding spot open 15 min into the round." };
        }
        answer = { photo: photoCamera(pano, q.look) };
      } else {
        const error = questionError(idx.ds, q, ctx);
        if (error) return { ok: false, error };
        answer = evaluate(idx.ds, q, round.hider, ctx);
      }
      // The hider may answer a station question with Veto or Randomize.
      const play = botPowerup(
        idx.ds,
        q,
        ctx,
        candidates(round, idx),
        round.hand,
        seededRandom(hashString(`${round.rngSeed}|${round.asked.length}`)),
      );
      return { ok: true, round: answerQuestion(round, { q, ctx, answer }, play, t, idx) };
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
      const moved = applyIntent(round.seeker, intent, t, idx);
      if (!moved.ok) return moved;
      const { seeker, curses } = underCurses(round, intent, moved.state, t);
      const seekerTrail = [...round.seekerTrail, { t, state: seeker }];
      return {
        ok: true,
        round: advanceSolo({ ...round, seeker, curses, seekerTrail }, t, idx),
      };
    }
  }
}

export function candidates(round: SoloRound, idx: TimetableIndex): number[] {
  return filterCandidates(idx.ds, round.reachable, round.asked);
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
  footThermometer: Place | null;
  /** Everywhere you've walked or stood on the street, for the searched area. */
  footpath: FootSegment[];
  /** How many cards the hider holds (what they are is secret until the end). */
  hiderHandSize: number;
  /** The hider's hand, once the round is over. */
  hiderHand: CardId[] | null;
  /** Curses on you right now. */
  curses: ActiveCurse[];
  /** Every card the hider has played. */
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
    bonusSeconds: bonusSeconds(round),
    result: round.result,
    hider: round.result ? round.hider : null,
    replay: round.result ? { hider: round.hiderTrail, seeker: round.seekerTrail } : null,
    hasSpot: round.spot !== null,
    // Not shown mid-round: confirming "right station" would give the zone away.
    stationFoundAt: round.result ? round.stationFoundAt : null,
    spotNearby: null,
    footThermometer: round.footThermometer,
    footpath: footpathOf(round.seekerTrail),
    hiderHandSize: round.hand.length,
    hiderHand: round.result ? round.hand : null,
    curses: round.curses,
    cardEvents: round.cardEvents,
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
