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
import { reachableComplexes } from "./reach.ts";
import type { TimetableIndex } from "./timetable.ts";
import { applyIntent, resolve, type Transit, type TransitIntent } from "./transit.ts";

export const HIDE_SECONDS = 20 * 60;
export const SEEK_LIMIT_SECONDS = 2 * 3600;
export const QUESTION_COOLDOWN_SECONDS = 5 * 60;
export const QUESTION_BONUS_SECONDS = 10 * 60;

export interface AskedQuestion extends Asked {
  at: number;
  /** Stations still possible after this answer. */
  remaining: number;
}

export type RoundResult = { kind: "found"; at: number } | { kind: "timeout"; at: number };

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
}

export type SoloIntent =
  | TransitIntent
  | { type: "ask"; question: Question }
  | { type: "startThermometer" };

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

/** Settle the round at time t: found the station, or ran out of time. */
export function advanceSolo(round: SoloRound, t: number, idx: TimetableIndex): SoloRound {
  if (round.result) return round;
  const here = standingAt(round, t, idx);
  if (here && here.complex === round.hider) {
    return { ...round, result: { kind: "found", at: Math.min(here.since, round.seekEnd) } };
  }
  if (t >= round.seekEnd) return { ...round, result: { kind: "timeout", at: round.seekEnd } };
  return round;
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
    case "startThermometer":
      return { ok: true, round: { ...round, thermometer: questionOrigin(round.seeker, t, idx) } };
    default: {
      const moved = applyIntent(round.seeker, intent, t, idx);
      if (!moved.ok) return moved;
      return { ok: true, round: advanceSolo({ ...round, seeker: moved.state }, t, idx) };
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
  };
}
