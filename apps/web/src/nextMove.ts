/**
 * The next move (DESIGN.md, Interaction: the playable round, 2026-11-27). One plain line
 * that always says what to do now, and the one control it points at.
 *
 * Pure, and blind to the hider: it reads only what the seeker's screen already shows (the
 * stations still possible, the questions asked and when, where you are, the armed question)
 * and the public timetable. The suggested question and the train it points at come from
 * the same chooser and planner the bots and the difficulty bands use, run on the
 * candidates alone, so two rounds with the same view get the same advice.
 */
import {
  type AskContext,
  anyReady,
  categoryOf,
  chooseQuestion,
  closedQuestions,
  isAnswered,
  type MapQuestion,
  nearestToCentre,
  nextReadyAt,
  planFromPlatform,
  planOnTrain,
  QUESTION_GAP_SECONDS,
  type Question,
  questionKey,
  questionOrigin,
  questionPool,
  resolve,
  type SoloView,
  type TimetableIndex,
  thriftyQuestion,
} from "@subway-seek/engine";
import { hhmm as clockText } from "./ask.ts";
import { displayName } from "./names.ts";
import { stillPossible } from "./notHere.ts";

export type NextTarget =
  | { kind: "none" }
  /** The Ask tab, when the move is a question and you're on Travel. */
  | { kind: "askTab" }
  /** The suggested question's chip. */
  | { kind: "question"; q: Question }
  /** The confirm at the foot of the panel, once a question is chosen. */
  | { kind: "askButton" }
  /** The Travel tab, when the move is a train and you're on Ask. */
  | { kind: "travelTab" }
  /** A departure row on the platform board: this route, this way. */
  | { kind: "board"; route: number; dir: number }
  /** A stop on the train's stop list: get off there. */
  | { kind: "stop"; stop: number }
  /** A platform change on foot: the Walk button for that platform. */
  | { kind: "transfer"; to: number };

export interface NextMove {
  line: string;
  target: NextTarget;
  /** The train or platform change it named, to hold on to next time (see Hold). */
  hold?: Hold;
}

/**
 * The train or platform change the line named, held while it's still on offer: the same
 * platform, the train not yet gone, and no new answer since. Without it the planner's
 * choice flips as departures come and go, and the line reads as changing its mind.
 */
export interface Hold {
  station: number;
  answers: number;
  trip?: number;
  transfer?: number;
}

export interface NextMoveInput {
  idx: TimetableIndex;
  view: SoloView;
  t: number;
  tab: "travel" | "ask";
  armed: Question | null;
  /** Whether the armed question can be asked now (no blocker). */
  armedReady: boolean;
  /** Offer a good next question (practice rounds). */
  suggest: boolean;
  /** A first round: suggest only from the questions it shows (SIMPLE_KINDS). */
  firstRound?: boolean;
  /** Stations you've stood in this round, so not theirs (notHere.ts). */
  notHere?: readonly number[];
  /** What the line named last time (NextMove.hold). */
  hold?: Hold | null;
}

/** The questions a first round shows before "More questions" (AskPanel.tsx). */
export const SIMPLE_KINDS: readonly Question["kind"][] = [
  "radar",
  "route",
  "borough",
  "express",
  "moreRoutes",
];

/** An answer on its way: asked, its window still running. */
export function answerPending(view: SoloView, t: number): boolean {
  return view.asked.some((a) => !isAnswered(a) && a.answerAt > t && categoryOf(a.q) !== "onFoot");
}

/** The question a strong, thrifty seeker would ask now, from the view alone. */
export function suggestedQuestion(
  idx: TimetableIndex,
  view: SoloView,
  t: number,
  kinds?: readonly Question["kind"][],
  cands: readonly number[] = view.candidates,
): { q: MapQuestion; ctx: AskContext } | null {
  if (cands.length < 2) return null;
  const origin = questionOrigin(view.seeker, t, idx);
  if (!kinds) {
    const pick = thriftyQuestion(idx.ds, cands, origin, view.thermometer, view.asked, t, 0);
    return pick ? { q: pick.q, ctx: pick.ctx } : null;
  }
  // The same thrifty chooser, over the questions this round shows.
  const closed = closedQuestions(view.asked);
  const pool = questionPool(idx.ds, origin, view.thermometer).filter(
    (x) => kinds.includes(x.q.kind) && !closed.has(questionKey(x.q)),
  );
  return chooseQuestion(idx.ds, cands, pool, view.asked, t, "thrifty", QUESTION_GAP_SECONDS);
}

const stationName = (idx: TimetableIndex, station: number) =>
  displayName(idx.ds.stations[station]?.name ?? "");

/** "the 6 to Pelham Bay Park": a trip as the board says it. */
function tripText(idx: TimetableIndex, trip: number): string {
  const tr = idx.ds.trips[trip];
  const route = tr ? idx.ds.routes[tr.route] : undefined;
  if (!tr || !route) return "a train";
  const last = tr.stops[tr.stops.length - 1] as number;
  return `the ${route.display ?? route.letter} to ${stationName(idx, last)}`;
}

/** Where to ride: the station nearest the middle of what's left, not where you stand. */
function rideTarget(
  idx: TimetableIndex,
  possible: readonly number[],
  here: number | null,
): number | null {
  const others = possible.filter((c) => c !== here);
  if (others.length === 0) return null;
  return nearestToCentre(idx.ds, others).complex;
}

/**
 * The travel half of a move: which train, or which stop, toward the stations still
 * possible. Null when there's nothing useful to do but wait.
 */
function rideMove(
  input: NextMoveInput,
  possible: readonly number[],
  lead: string,
): NextMove | null {
  const { idx, view, t, tab } = input;
  const { ds } = idx;
  const s = resolve(view.seeker, t, idx);
  const here = s.kind === "platform" ? (ds.stations[s.station]?.complex ?? null) : null;
  const goal = rideTarget(idx, possible, here);
  if (goal === null) return null;
  const targets = ds.complexes[goal]?.stations ?? [];
  const goalName = displayName(ds.complexes[goal]?.name ?? "");
  const one = possible.length === 1;
  const toward = one ? goalName : "the stations still possible";
  if (s.kind === "platform") {
    const answers = view.asked.filter(isAnswered).length;
    const held =
      input.hold && input.hold.station === s.station && input.hold.answers === answers
        ? input.hold
        : null;
    const heldTrip = held?.trip !== undefined ? ds.trips[held.trip] : undefined;
    const heldAt = heldTrip ? heldTrip.stops.indexOf(s.station) : -1;
    const keepTrip = heldTrip && heldAt >= 0 && (heldTrip.dep[heldAt] as number) >= t;
    const keepTransfer =
      held?.transfer !== undefined &&
      (idx.transfersFrom[s.station] ?? []).some((x) => x.to === held.transfer);
    const plan =
      keepTrip || keepTransfer ? null : planFromPlatform(idx, s.station, t, view.seekEnd, targets);
    const first = keepTrip
      ? { type: "board" as const, trip: held?.trip as number, stop: heldAt }
      : keepTransfer
        ? { type: "transfer" as const, to: held?.transfer as number }
        : plan?.intents[0];
    if (!first) return null;
    if (first.type === "transfer") {
      // Most platforms in a complex share its name, so name the lines, as the board does.
      const to = ds.stations[first.to];
      const from = ds.stations[s.station];
      const named = to && from && displayName(to.name) !== displayName(from.name);
      const where = named ? stationName(idx, first.to) : `${to?.routes.join(" ") ?? ""} platform`;
      return {
        line: `${lead}Change to the ${where}, toward ${toward}.`,
        target: tab === "ask" ? { kind: "travelTab" } : { kind: "transfer", to: first.to },
        hold: { station: s.station, answers, transfer: first.to },
      };
    }
    if (first.type !== "board") return null;
    const trip = ds.trips[first.trip];
    if (!trip) return null;
    return {
      line: `${lead}Ride toward ${toward}: ${tripText(idx, first.trip)}.`,
      target:
        tab === "ask" ? { kind: "travelTab" } : { kind: "board", route: trip.route, dir: trip.dir },
      hold: { station: s.station, answers, trip: first.trip },
    };
  }
  if (s.kind === "train") {
    const intents = planOnTrain(idx, s, t, view.seekEnd, targets);
    const off = intents.find((i) => i.type === "alightAt");
    const trip = ds.trips[s.trip];
    if (off && off.type === "alightAt" && trip) {
      const stop = stationName(idx, trip.stops[off.stop] as number);
      return {
        line: `${lead}Get off at ${stop}${one ? `, for ${goalName}` : ", nearer the stations still possible"}.`,
        target: tab === "ask" ? { kind: "travelTab" } : { kind: "stop", stop: off.stop },
      };
    }
    if (trip && intents.length === 0) {
      const stop = stationName(idx, trip.stops[s.to] as number);
      return { line: `${lead}Stay on to ${stop}.`, target: { kind: "none" } };
    }
  }
  return null;
}

/** The move for this moment. Null on the street and once the round is over. */
export function nextMove(input: NextMoveInput): NextMove | null {
  const { idx, view, t, tab, armed, armedReady, suggest } = input;
  if (view.result) return null;
  const s = resolve(view.seeker, t, idx);
  if (s.kind === "street") return null;
  const possible = stillPossible(view, input.notHere ?? []);
  const n = possible.length;
  // Just stood in a station that could have been theirs: say so first (notHere.ts).
  const hereComplex = s.kind === "platform" ? idx.ds.stations[s.station]?.complex : undefined;
  // Only until you ask from there: after that it's old news.
  const askedSince = s.kind === "platform" && view.asked.some((a) => a.at >= s.since);
  const notHere =
    hereComplex !== undefined && (input.notHere ?? []).includes(hereComplex) && !askedSince
      ? `Not here. ${n} ${n === 1 ? "station" : "stations"} left. `
      : "";

  if (answerPending(view, t)) {
    return { line: "Your answer lands in a few seconds. Watch the map.", target: { kind: "none" } };
  }
  if (s.kind === "walking") {
    const dest = s.dest.kind === "platform" ? idx.ds.stations[s.dest.station] : undefined;
    const fromName = displayName(idx.ds.complexes[s.fromComplex]?.name ?? "");
    const to = !dest
      ? ""
      : displayName(dest.name) === fromName
        ? `${dest.routes.join(" ")} platform`
        : `${displayName(dest.name)} platform`;
    return { line: to ? `Walking to the ${to}.` : "Walking.", target: { kind: "none" } };
  }
  if (n === 1) {
    const lead = notHere ? "Not here. One station left. " : "One station left. ";
    const ride = rideMove(input, possible, lead);
    return ride ?? { line: `${lead}Go there.`, target: { kind: "none" } };
  }
  if (armed && armedReady) {
    return {
      line: `${notHere}Press Ask at the foot of the panel to send it.`,
      target: tab === "ask" ? { kind: "askButton" } : { kind: "askTab" },
    };
  }
  if (anyReady(view.asked, t)) {
    const line =
      view.asked.length === 0
        ? `${notHere}Ask a question to rule stations out.`
        : `${notHere || `${n} stations left. `}Ask another question to rule more out.`;
    if (tab === "travel") return { line, target: { kind: "askTab" } };
    const pick = suggest
      ? suggestedQuestion(idx, view, t, input.firstRound ? SIMPLE_KINDS : undefined, possible)
      : null;
    return { line, target: pick ? { kind: "question", q: pick.q } : { kind: "none" } };
  }
  const next = `${notHere}Next question at ${clockText(nextReadyAt(view.asked, t))}. `;
  return (
    rideMove(input, possible, next) ?? {
      line: `${next}Wait here, or ride on.`,
      target: { kind: "none" },
    }
  );
}
