/**
 * Asking is select, see, confirm (DESIGN.md, Interaction): a chip arms a question, the map
 * draws its shape, a one-sentence hint says what it does, and the wainscot confirms with
 * the price. The logic behind the Ask tab, kept pure so it can be tested: arming, what
 * stops a question being asked, chip states, the hints, the onboarding hints and the score
 * tally. No outcome counts, ever: nothing here says how many stations an answer would leave.
 */
import {
  type Answer,
  type AskContext,
  askReadyAt,
  categoryOf,
  closedQuestions,
  describeAnswer,
  describeQuestion,
  isAnswered,
  LANDMARK_WORDS,
  landmarksWithin,
  milesText,
  nearestLandmark,
  QUESTION_GAP_SECONDS,
  QUESTION_RULES,
  type Question,
  type QuestionCategory,
  questionBonusSeconds,
  questionError,
  questionKey,
  questionOrigin,
  resolve,
  type SoloView,
  SPOT_PHOTOS_OPEN_SECONDS,
  TENTACLE_MILES,
  type TimetableIndex,
} from "@subway-seek/engine";
import { FAMILY_NAME, type Family, familyOf } from "./ui/family.ts";

export const radarLabel = (m: number) => (m === 0.25 ? "¼ mi" : m === 0.5 ? "½ mi" : `${m} mi`);
/** "1-mile", "¼-mile": a distance as an adjective. */
export const ringText = (m: number) => `${m === 0.25 ? "¼" : m === 0.5 ? "½" : m}-mile`;
export const LOOK_WORD = { N: "north", E: "east", S: "south", W: "west", up: "up" } as const;

/** "10:47" from game seconds. */
/** "1:32": hours and minutes, as the result's numbers read. */
export const hm = (seconds: number) => {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

export const hhmm = (t: number) => {
  const s = Math.floor(t);
  return `${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
};

/** The questions the hider vetoed, closed for the round, from the answers that have landed. */
export function closedKeys(view: SoloView): Set<string> {
  return closedQuestions(view.asked.filter(isAnswered));
}

// --- Arming --------------------------------------------------------------------------

/** A click on a chip arms it; a click on the armed chip disarms it. One armed at a time. */
export function toggleArm(armed: Question | null, q: Question): Question | null {
  return armed && questionKey(armed) === questionKey(q) ? null : q;
}

/**
 * A question stays armed across stops, so it can be set up on the ride and fired on
 * arrival. It's disarmed once it's asked, once it's closed by a veto, or when the round
 * (or a new one) changes under it.
 */
export function keepArmed(
  armed: Question | null,
  prev: SoloView | null,
  view: SoloView | null,
): Question | null {
  if (!armed || !view || view.result) return null;
  // A new round: nothing carries over.
  if (prev && (prev.seekStart !== view.seekStart || prev.hub !== view.hub)) return null;
  if (view.asked.length < (prev?.asked.length ?? 0)) return null;
  const key = questionKey(armed);
  const justAsked = view.asked.slice(prev?.asked.length ?? view.asked.length);
  if (justAsked.some((a) => questionKey(a.q) === key)) return null;
  if (closedKeys(view).has(key)) return null;
  return armed;
}

export interface AskWorld {
  idx: TimetableIndex;
}

/** The context a question would be asked in right now. */
export function askContext(
  q: Question,
  view: SoloView,
  t: number,
  idx: TimetableIndex,
): AskContext {
  return {
    origin: questionOrigin(view.seeker, t, idx),
    baseline:
      q.kind === "thermometer"
        ? view.thermometer
        : q.kind === "spotThermometer"
          ? view.footThermometer
          : null,
  };
}

/** When this question's category can next be asked (0 = now). */
export function readyAt(view: SoloView, category: QuestionCategory): number {
  return askReadyAt(view.asked, category);
}

/**
 * Why the question can't be asked right now, in words, or null when it can. The
 * wainscot shows this beside a dimmed Ask, never a silent grey button.
 */
export function askBlocker(
  q: Question,
  view: SoloView,
  t: number,
  idx: TimetableIndex,
): string | null {
  if (view.result) return "This round is over.";
  if (closedKeys(view).has(questionKey(q))) return "Vetoed · closed this round";
  if (q.kind === "photo" && q.from === "exit" && !view.hasExitPhoto)
    return "No exit photo this round.";
  const category = categoryOf(q);
  const ready = readyAt(view, category);
  if (t < ready) return `Ready at ${hhmm(ready)}`;
  if (q.kind === "photo") {
    if (q.from === "spot") {
      if (!view.hasSpot) return "No hiding spot this round.";
      const opens = view.seekStart + SPOT_PHOTOS_OPEN_SECONDS;
      if (t < opens) return `Spot photos open at ${hhmm(opens)}`;
    }
    return null;
  }
  if (category === "onFoot") {
    if (!view.hasSpot) return "No hiding spot this round.";
    if (resolve(view.seeker, t, idx).kind !== "street") return "Ask standing on the street.";
  }
  return questionError(idx.ds, q, askContext(q, view, t, idx));
}

export type ChipState = "ready" | "armed" | "cooling" | "closed";

/** Closed beats armed beats cooling: a vetoed question can't be chosen at all. */
export function chipState(
  q: Question,
  { armed, closed, cooling }: { armed: Question | null; closed: Set<string>; cooling: boolean },
): ChipState {
  const key = questionKey(q);
  if (closed.has(key)) return "closed";
  if (armed && questionKey(armed) === key) return "armed";
  return cooling ? "cooling" : "ready";
}

/** The wainscot's label: "Ask · Radar 1 mi". */
export function askLabel(q: Question): string {
  switch (q.kind) {
    case "radar":
      return `Ask · Radar ${radarLabel(q.miles)}`;
    case "thermometer":
      return "Ask · Thermometer";
    case "route":
      return `Ask · Does the ${q.letter} stop there?`;
    case "borough":
      return "Ask · Same borough?";
    case "express":
      return "Ask · Same kind of stop?";
    case "moreRoutes":
      return "Ask · More lines than mine?";
    case "matching":
    case "measuring":
    case "tentacles":
      return `Ask · ${FAMILY_NAME[familyOf(q)]} · ${capitalize(LANDMARK_WORDS[q.landmark][q.kind === "tentacles" ? "many" : "one"])}`;
    case "photo":
      return `Ask · ${q.from === "exit" ? "Exit" : "Spot"} photo · ${q.look === "up" ? "Up" : q.look}`;
    case "spotRadar":
      return `Ask · Street radar ${q.meters} m`;
    case "spotThermometer":
      return "Ask · Hotter or colder";
  }
}

/** "+10 min to their score". */
export function priceText(q: Question): string {
  return `+${QUESTION_RULES[categoryOf(q)].bonusSeconds / 60} min to their score`;
}

const capitalize = (s: string) => (s[0]?.toUpperCase() ?? "") + s.slice(1);

/** "800 ft" or "1.3 mi", for hints: the questions are asked in miles, so the hints are too. */
export function distanceText(meters: number): string {
  const mi = meters / 1609.344;
  return mi < 0.2 ? `${Math.round((meters * 3.28084) / 50) * 50} ft` : `${mi.toFixed(1)} mi`;
}

/** "220 m", for the on-foot rules, which are in metres (40 m, 25 m, 400 m). */
export function metersText(meters: number): string {
  return `${Math.round(meters / 10) * 10} m`;
}

/** When the 5-min gap after the last station question ends (every category shares it). */
export function gapEndsAt(view: Pick<SoloView, "asked">): number {
  const last = view.asked
    .filter((a) => categoryOf(a.q) !== "onFoot")
    .reduce((m, a) => Math.max(m, a.at), Number.NEGATIVE_INFINITY);
  return last + QUESTION_GAP_SECONDS;
}

export interface Hint {
  /** The first sentence, set bold. */
  lead: string;
  rest: string;
}

/**
 * What a question does, in one or two sentences, for hover and arm. It names the shape
 * the map draws and what each answer keeps. It never counts the stations either answer
 * would leave: reading the map is the game.
 */
export function questionHint(
  q: Question,
  view: SoloView,
  t: number,
  idx: TimetableIndex,
  places: { complexName: (c: number) => string; borough: (c: number) => string },
): Hint {
  const { ds } = idx;
  const ctx = askContext(q, view, t, idx);
  const here = places.complexName(ctx.origin.complex);
  switch (q.kind) {
    case "radar":
      return {
        lead: `A ${ringText(q.miles)} ring round ${here}, drawn on the map.`,
        rest: "Yes keeps the stations inside it, No clears them.",
      };
    case "thermometer": {
      if (!ctx.baseline) {
        return {
          lead: "Start it here, then ride to another station.",
          rest: "Am I closer? then draws the line halfway between the two.",
        };
      }
      const from = places.complexName(ctx.baseline.complex);
      return {
        lead: `The line halfway between ${from} and ${here}.`,
        rest: "Hotter keeps the stations on your side of it.",
      };
    }
    case "route":
      return {
        lead: `Yes keeps the stations the ${q.letter} stops at.`,
        rest: "No clears them. Only the lines here can be asked about.",
      };
    case "borough":
      return {
        lead: `Yes keeps the stations in ${places.borough(ctx.origin.complex)}.`,
        rest: "No keeps the other boroughs.",
      };
    case "express": {
      const express = ds.complexes[ctx.origin.complex]?.express;
      return {
        lead: `${here} is ${express ? "an express stop" : "a local-only stop"}.`,
        rest: `Yes keeps the ${express ? "express" : "local-only"} stops, No the others.`,
      };
    }
    case "moreRoutes": {
      const n = ds.complexes[ctx.origin.complex]?.routes.length ?? 0;
      return {
        lead: `${here} has ${n} ${n === 1 ? "line" : "lines"}.`,
        rest: "More keeps the stations with more, No the ones with as many or fewer.",
      };
    }
    case "matching": {
      const words = LANDMARK_WORDS[q.landmark];
      const mine = nearestLandmark(ds, q.landmark, ctx.origin);
      const name = ds.landmarks[q.landmark][mine.index]?.name ?? `a ${words.one}`;
      return {
        lead: `Your nearest ${words.one} is ${name}, ${distanceText(mine.meters)} away.`,
        rest: `Yes keeps every station whose nearest ${words.one} is the same one: its cell on the map.`,
      };
    }
    case "measuring": {
      const words = LANDMARK_WORDS[q.landmark];
      const mine = nearestLandmark(ds, q.landmark, ctx.origin);
      return {
        lead: `You're ${distanceText(mine.meters)} from the nearest ${words.one}.`,
        rest: `Closer keeps the stations nearer one than that: inside the rings on the map.`,
      };
    }
    case "tentacles": {
      const words = LANDMARK_WORDS[q.landmark];
      const miles = TENTACLE_MILES[q.landmark] ?? 0;
      const n = landmarksWithin(ds, q.landmark, ctx.origin, miles).length;
      return n === 0
        ? {
            lead: `No ${words.many} are within ${milesText(miles)} of you.`,
            rest: "Move closer to some before asking.",
          }
        : {
            lead: `${n} ${n === 1 ? words.one : words.many} ${n === 1 ? "is" : "are"} within ${milesText(miles)} of you, each with a line to it on the map.`,
            rest: `The answer names the one nearest their station, or says "Not within ${milesText(miles)}".`,
          };
    }
    case "photo":
      return {
        lead: `A Street View photo from ${q.from === "exit" ? "their station's exit" : "where they're hiding"}, facing ${LOOK_WORD[q.look]}.`,
        rest: "It clears nothing by itself: you read it.",
      };
    case "spotRadar":
      return {
        lead: `A ${q.meters} m ring round where you stand.`,
        rest: "Yes keeps the search tiles inside it, No clears them.",
      };
    case "spotThermometer":
      return ctx.baseline
        ? {
            lead: "The line halfway between where you started walking and here.",
            rest: "Hotter keeps the tiles on your side.",
          }
        : {
            lead: "Start it here, then walk at least 30 m.",
            rest: "Am I closer? then draws the halfway line.",
          };
  }
}

/** The question as the band and the log say it. */
export function questionText(q: Question, idx: TimetableIndex, ctx?: AskContext): string {
  return describeQuestion(q, idx.ds, ctx);
}

// --- The onboarding hints ------------------------------------------------------------

export type HintId = "hover" | "ride" | "three" | "counts";

/**
 * Three hints, eight words or fewer, shown once each and remembered in the browser; and
 * "What counts", three lines on the first arrival at the street (Interaction).
 */
export const HINTS: Record<HintId, string> = {
  hover: "Hover a question to see what it does.",
  ride: "Ride toward what's left. Get off anywhere.",
  three: "Three left. Go up and look.",
  counts:
    "If this is their station, the hider is inside your circle.\nYou see them once you pass within 40 m.\nYou catch them within 25 m, standing still.",
};

/**
 * A hint as this screen says it. The questions live on the Ask tab, so from Travel the
 * first hint sends you there; a touch screen taps instead of hovering; and where the round
 * ends at the station, the last one rides rather than going up.
 */
export function hintText(
  id: HintId,
  { touch = false, tab = "ask", stationOnly = false }: HintContext = {},
): string {
  if (id === "hover") {
    const verb = touch ? "tap" : "hover";
    return tab === "ask"
      ? `${touch ? "Tap" : "Hover"} a question to see what it does.`
      : `Open Ask and ${verb} a question to start.`;
  }
  if (id === "three" && stationOnly) return "Three left. Ride to each in turn.";
  return HINTS[id];
}

export interface HintContext {
  touch?: boolean;
  tab?: "travel" | "ask";
  stationOnly?: boolean;
}

/**
 * Which onboarding hint shows now, if any: before the first question, after the first
 * answer, and at three stations or fewer. Each shows once.
 */
export function currentHint(seen: ReadonlySet<HintId>, view: SoloView | null): HintId | null {
  if (!view || view.result) return null;
  const want: HintId | null =
    view.candidates.length <= 3 && view.asked.some(isAnswered)
      ? "three"
      : view.asked.some(isAnswered)
        ? "ride"
        : view.asked.length === 0
          ? "hover"
          : null;
  return want && !seen.has(want) ? want : null;
}

// --- The score tally -----------------------------------------------------------------

export type TallyTile = "ink" | "gold" | Family;

/**
 * The score as a bar of tiles, one per 5 game-min: ink for the time it took, each
 * question's bonus in its family color (+10 min = 2 tiles), gold for the time-bonus cards
 * the hider still held. Rounded at the boundaries so the bar's length is the score's.
 */
export function tallyTiles(view: SoloView): TallyTile[] {
  if (!view.result) return [];
  const elapsed = view.result.at - view.seekStart;
  const segments: [TallyTile, number][] = [["ink", elapsed]];
  for (const a of view.asked) {
    segments.push([familyOf(a.q), QUESTION_RULES[categoryOf(a.q)].bonusSeconds]);
  }
  const cards = view.bonusSeconds - questionBonusSeconds(view.asked);
  if (cards > 0) segments.push(["gold", cards]);
  const out: TallyTile[] = [];
  let sum = 0;
  for (const [tile, seconds] of segments) {
    const before = Math.round(sum / 300);
    sum += seconds;
    for (let i = before; i < Math.round(sum / 300); i++) out.push(tile);
  }
  return out;
}

// --- Words for the band and the log ---------------------------------------------------

/** A question as the log says it, short: "Within 1 mi of me?". */
export function shortQuestion(q: Question): string {
  switch (q.kind) {
    case "radar":
      return `Within ${radarLabel(q.miles)} of me?`;
    case "thermometer":
      return "Am I closer?";
    case "route":
      return `Does the ${q.letter} stop there?`;
    case "borough":
      return "Same borough?";
    case "express":
      return "Same kind of stop?";
    case "moreRoutes":
      return "More lines than mine?";
    case "matching":
      return `Nearest ${LANDMARK_WORDS[q.landmark].one} the same?`;
    case "measuring":
      return `Closer to ${LANDMARK_WORDS[q.landmark].a}?`;
    case "tentacles":
      return `Which ${LANDMARK_WORDS[q.landmark].one} is nearest?`;
    case "photo":
      return `${q.from === "exit" ? "Exit" : "Spot"} photo · facing ${q.look === "up" ? "up" : q.look}`;
    case "spotRadar":
      return `Within ${q.meters} m of me?`;
    case "spotThermometer":
      return "Hotter or colder?";
  }
}

/** The answer in one or two words: "Yes", "Colder", "Bellevue", "Vetoed". */
export function answerWord(a: Answer, q: Question, idx: TimetableIndex): string {
  if (q.kind === "moreRoutes" && typeof a === "boolean") return a ? "More" : "No";
  return describeAnswer(a, q, idx.ds);
}
