/**
 * The bot hider's card play.
 *
 * Powerups (Veto, Randomize) are decided from public information only: how much the
 * question would narrow the stations the seeker can already see, never the real answer.
 * Otherwise a veto would tell the seeker "that answer would have helped you".
 *
 * Curses use what a real hider sees: where the seeker is and which way they're heading.
 */
import type { Dataset } from "@stand-clear/data";
import { CARD_VALUE, CARDS, type CardId, type CurseId } from "./cards.ts";
import { distanceMeters } from "./geo.ts";
import type { Difficulty } from "./hardness.ts";
import {
  type AskContext,
  categoryOf,
  isMapQuestion,
  type MapQuestion,
  partition,
  type Question,
  questionKey,
  questionPool,
} from "./questions.ts";
import type { TimetableIndex } from "./timetable.ts";
import { lastStation, type OnTrain, streetPoint, type Transit } from "./transit.ts";

/** A question is "strong" when it should leave at most this share of the stations. */
export const STRONG_QUESTION_LEFT = 0.55;
/** Veto only late in the hunt, when a strong question would really hurt... */
export const VETO_MAX_CANDIDATES = 30;
/**
 * ...or earlier, when the question is a kill shot: expected to leave this few stations.
 * Measured along the sim's thrifty runs (2026-10-06): with more than 30 stations left, the
 * best question available never leaves fewer than ~10 in expectation, and one that leaves
 * 10 (a Tentacles that cuts the map to a tenth) exists at about 3% of steps.
 */
export const VETO_KILL_SHOT_LEFT = 10;
/** On Normal, Tourist and Wrong way wait until the seeker has narrowed to this many. */
export const NORMAL_MOVEMENT_CURSE_MAX_CANDIDATES = 20;
/** Curses only within this distance of the hider (further away they barely matter). */
const CURSE_RANGE_M = 8000;

/** The expected share of `candidates` left after asking `q` (1 = it tells you nothing). */
export function expectedLeft(
  ds: Dataset,
  q: MapQuestion,
  candidates: readonly number[],
  ctx: AskContext,
): number {
  let left = 0;
  for (const k of partition(ds, q, candidates, ctx).values()) left += (k / candidates.length) ** 2;
  return left;
}

/**
 * Every other map question of `q`'s category the seeker could ask from here. Not a
 * closed one: a vetoed question is out of the game for the round, Randomize included.
 */
function sameCategory(
  ds: Dataset,
  q: MapQuestion,
  ctx: AskContext,
  closed: ReadonlySet<string>,
): MapQuestion[] {
  const category = categoryOf(q);
  return questionPool(ds, ctx.origin, null)
    .map((x) => x.q)
    .filter(
      (o) =>
        categoryOf(o) === category &&
        questionKey(o) !== questionKey(q) &&
        !closed.has(questionKey(o)),
    );
}

export type BotPlay = { card: "veto" } | { card: "randomize"; question: MapQuestion } | null;

/**
 * Whether the bot answers a station question with Veto or Randomize. `closed` holds the
 * questionKeys already vetoed this round.
 */
export function botPowerup(
  ds: Dataset,
  q: Question,
  ctx: AskContext,
  candidates: readonly number[],
  hand: readonly CardId[],
  closed: ReadonlySet<string>,
  random: () => number,
): BotPlay {
  if (!isMapQuestion(q) || candidates.length < 2) return null;
  const left = expectedLeft(ds, q, candidates, ctx);
  if (left > STRONG_QUESTION_LEFT) return null;
  // Late in the hunt any strong question is worth a veto; earlier, only a kill shot.
  const killShot = left * candidates.length <= VETO_KILL_SHOT_LEFT;
  if (hand.includes("veto") && (candidates.length <= VETO_MAX_CANDIDATES || killShot)) {
    return { card: "veto" };
  }
  // A thermometer has nothing of its own type to swap to.
  if (hand.includes("randomize") && q.kind !== "thermometer") {
    const options = sameCategory(ds, q, ctx, closed);
    const pick = options[Math.floor(random() * options.length)];
    if (pick) return { card: "randomize", question: pick };
  }
  return null;
}

/** Play Discard 2, draw 3 when it would swap two weak cards. */
export function botRedraw(hand: readonly CardId[]): boolean {
  if (!hand.includes("redraw")) return false;
  return hand.filter((c) => c !== "redraw" && CARD_VALUE[c] <= 5).length >= 2;
}

/** The next stop a riding seeker's train will reach (index into the trip), or null. */
export function nextStopIndex(s: OnTrain, t: number, idx: TimetableIndex): number | null {
  const trip = idx.ds.trips[s.trip];
  if (!trip || t < (trip.dep[s.from] as number)) return null;
  for (let j = s.from + 1; j <= s.to; j++) {
    if ((trip.arr[j] as number) > t) return j;
  }
  return null;
}

export interface CurseSituation {
  /** The seeker, resolved at t. */
  seeker: Transit;
  t: number;
  idx: TimetableIndex;
  hider: number;
  spot: { lat: number; lon: number } | null;
  candidates: number;
  hand: readonly CardId[];
  difficulty: Difficulty;
}

/** Riding toward the hider's station, close enough to matter: the next stop is nearer. */
function ridingToward({ seeker, t, idx, hider }: CurseSituation): number | null {
  if (seeker.kind !== "train") return null;
  const k = nextStopIndex(seeker, t, idx);
  const trip = idx.ds.trips[seeker.trip];
  const target = idx.ds.complexes[hider];
  const last = lastStation(seeker, t, idx);
  if (k === null || !trip || !target || last === null) return null;
  const next = idx.ds.stations[trip.stops[k] as number];
  const now = idx.ds.stations[last];
  if (!next || !now || next.complex === hider) return null;
  const dNow = distanceMeters(now, target);
  if (dNow > CURSE_RANGE_M || distanceMeters(next, target) >= dNow - 50) return null;
  return k;
}

/** Meters from the seeker (on the street, standing or walking) to the hider's spot. */
function streetDistance({ seeker, t, idx, spot }: CurseSituation): number | null {
  if (!spot) return null;
  if (seeker.kind === "street") return distanceMeters(streetPoint(seeker, idx), spot);
  if (seeker.kind === "walking" && seeker.reason === "street") {
    const f = Math.min(1, Math.max(0, (t - seeker.start) / (seeker.end - seeker.start || 1)));
    const lat = seeker.fromPoint[0] + f * (seeker.toPoint[0] - seeker.fromPoint[0]);
    const lon = seeker.fromPoint[1] + f * (seeker.toPoint[1] - seeker.fromPoint[1]);
    return distanceMeters({ lat, lon }, spot);
  }
  return null;
}

/**
 * Movement curses while riding toward the hider. On Normal, not until the seeker has
 * narrowed the map: early exploration is never punished, so a Tourist lands when they're
 * closing in and reads as the hider fighting back. Hard plays them from the first ride.
 */
function movementFits(s: CurseSituation): boolean {
  if (s.difficulty === "normal" && s.candidates > NORMAL_MOVEMENT_CURSE_MAX_CANDIDATES) {
    return false;
  }
  return ridingToward(s) !== null;
}

/** When each curse is worth playing, in the order the bot considers them. */
const WHEN: [CurseId, (s: CurseSituation) => boolean][] = [
  ["tourist", movementFits],
  ["wrongWay", movementFits],
  [
    "signalLoss",
    (s) =>
      s.candidates > 1 &&
      s.candidates <= 15 &&
      s.seeker.kind !== "street" &&
      !(s.seeker.kind === "walking" && s.seeker.reason === "street"),
  ],
  ["shed", (s) => (streetDistance(s) ?? Number.POSITIVE_INFINITY) <= 600],
  ["fog", (s) => (streetDistance(s) ?? Number.POSITIVE_INFINITY) <= 300],
];

/** The curse the bot plays now, if any: one it holds, can pay for, and that fits the moment. */
export function botCurse(s: CurseSituation): CurseId | null {
  // Easy is the tutorial round: no curses at all.
  if (s.difficulty === "easy") return null;
  for (const [card, fits] of WHEN) {
    const i = s.hand.indexOf(card);
    if (i < 0) continue;
    const cost = CARDS[card].cost ?? 0;
    const others = s.hand
      .filter((_, j) => j !== i)
      .map((c) => CARD_VALUE[c])
      .sort((a, b) => a - b);
    if (others.length < cost) continue;
    // Don't throw away more than the curse is worth.
    const paid = others.slice(0, cost).reduce((a, b) => a + b, 0);
    if (paid > CARD_VALUE[card] * 1.5) continue;
    if (fits(s)) return card;
  }
  return null;
}
