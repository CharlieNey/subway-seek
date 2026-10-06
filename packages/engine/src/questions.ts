/**
 * Map questions. Each question is one function, `evaluate(q, candidate, ctx)`, that says
 * what the answer would be if the hider were at `candidate` (a complex). The real answer
 * is `evaluate` at the hider's complex; a candidate stays possible iff it gives the same
 * answer. So shading can never rule out the hider, by construction.
 *
 * Questions are about the hider's station (the zone center), asked from the seeker's
 * origin — the last station their train called at, or where they stand on the street.
 *
 * They come in six categories, after Jet Lag's Hide + Seek (Japan): matching ("same as
 * mine?"), measuring ("closer than me?"), radar, thermometer, tentacles ("which of
 * these is nearest you?") and photos. Each category has its own price and cooldown
 * (see QUESTION_RULES in solo.ts), so no single kind of question can carry a round.
 */
import type { Dataset, LandmarkKind } from "@stand-clear/data";
import { distanceMeters, METERS_PER_MILE } from "./geo.ts";
import {
  complexNearest,
  LANDMARK_KINDS,
  LANDMARK_WORDS,
  landmarksWithin,
  nearestLandmark,
  TENTACLE_MILES,
} from "./landmarks.ts";
import type { TimetableIndex } from "./timetable.ts";
import { lastStation, resolve, streetPoint, type Transit } from "./transit.ts";

export const RADAR_MILES = [0.25, 0.5, 1, 2, 5] as const;
/** Zone radius around the hider's station; their hiding spot is inside it. */
export const ZONE_RADIUS_M = 400;
/**
 * On-foot questions are about the hider's exact spot, and only work near it: from
 * further than this, every one of them answers "Not near you". (So a walking
 * thermometer can't be fired from across the city to find the station.)
 */
export const ON_FOOT_RANGE_M = 600;
export const SPOT_RADAR_METERS = [50, 100, 200] as const;
/** A walking hotter/colder needs you to have moved at least this far since you started it. */
export const FOOT_THERMOMETER_MIN_METERS = 30;
/** A thermometer needs you to have moved at least this far since you started it. */
export const THERMOMETER_MIN_METERS = 400;

export type PhotoLook = "N" | "E" | "S" | "W" | "up";
export const PHOTO_LOOKS: readonly PhotoLook[] = ["N", "E", "S", "W", "up"];

export type Question =
  | { kind: "radar"; miles: number }
  | { kind: "thermometer" }
  /** Does this line stop at your station? Only lines that stop where you are. */
  | { kind: "route"; letter: string }
  | { kind: "borough" }
  /** Is your station the same kind of stop (express or local) as mine? */
  | { kind: "express" }
  | { kind: "moreRoutes" }
  /** Is the ___ nearest your station the same one that's nearest me? */
  | { kind: "matching"; landmark: LandmarkKind }
  /** Is your station closer to a ___ than I am? */
  | { kind: "measuring"; landmark: LandmarkKind }
  /** Of the ___ within TENTACLE_MILES of me, which is nearest your station? */
  | { kind: "tentacles"; landmark: LandmarkKind }
  /** A Street View view from the hider's station exit or their hiding spot. */
  | { kind: "photo"; from: "exit" | "spot"; look: PhotoLook }
  | SpotQuestion;

/** On foot, about the hider's exact spot (asked standing on the street). */
export type SpotQuestion =
  /** Is your spot within this many meters of me? */
  | { kind: "spotRadar"; meters: number }
  /** Am I closer to your spot than where I started the walking thermometer? */
  | { kind: "spotThermometer" };

const SPOT_KINDS = new Set(["spotRadar", "spotThermometer"]);

export function isSpotQuestion(q: Question): q is SpotQuestion {
  return SPOT_KINDS.has(q.kind);
}

export type QuestionCategory =
  | "matching"
  | "measuring"
  | "radar"
  | "thermometer"
  | "tentacles"
  | "photo"
  | "onFoot";

export const QUESTION_CATEGORIES: readonly QuestionCategory[] = [
  "matching",
  "measuring",
  "radar",
  "thermometer",
  "tentacles",
  "photo",
  "onFoot",
];

export function categoryOf(q: Question): QuestionCategory {
  switch (q.kind) {
    case "route":
    case "borough":
    case "express":
    case "matching":
      return "matching";
    case "moreRoutes":
    case "measuring":
      return "measuring";
    case "spotRadar":
    case "spotThermometer":
      return "onFoot";
    default:
      return q.kind;
  }
}

/** A Street View view: which panorama, and where the camera points. */
export interface Photo {
  pano: string;
  heading: number;
  pitch: number;
  fov: number;
}

/** Tentacles: the landmark nearest the hider, or null when they're out of range. */
export type TentacleAnswer = { landmark: number | null };
export type MapAnswer = boolean | "hotter" | "colder" | TentacleAnswer;
/** "far": the hider's spot is more than ON_FOOT_RANGE_M from you. */
export type SpotAnswer = boolean | "hotter" | "colder" | "far";
/** The hider played Veto: no answer, though the seeker has still spent the question. */
export type Vetoed = { vetoed: true };
export type Answer = MapAnswer | SpotAnswer | { photo: Photo } | Vetoed;

export function isVetoed(a: Answer): a is Vetoed {
  return typeof a === "object" && "vetoed" in a;
}

/** Map questions narrow the candidate stations; photos are for you to read. */
export type MapQuestion = Exclude<Question, { kind: "photo" } | SpotQuestion>;

export function isMapQuestion(q: Question): q is MapQuestion {
  return q.kind !== "photo" && !isSpotQuestion(q);
}

export function sameAnswer(a: Answer, b: Answer): boolean {
  if (typeof a === "object" && typeof b === "object" && "landmark" in a && "landmark" in b) {
    return a.landmark === b.landmark;
  }
  return a === b;
}

/** The camera for a photo: a compass direction at eye level, or straight up-ish. */
export function photoCamera(pano: string, look: PhotoLook): Photo {
  const heading = { N: 0, E: 90, S: 180, W: 270, up: 0 }[look];
  return { pano, heading, pitch: look === "up" ? 55 : 5, fov: 90 };
}

export interface Place {
  lat: number;
  lon: number;
  /** The complex you're at or last called at. */
  complex: number;
}

export interface AskContext {
  origin: Place;
  /** Thermometer only: where it was started. */
  baseline: Place | null;
}

/** Per-origin lookups, cached: `evaluate` runs once per candidate with the same context. */
const fromOrigin = new WeakMap<Place, Map<string, unknown>>();
function cachedFor<T>(origin: Place, key: string, make: () => T): T {
  let m = fromOrigin.get(origin);
  if (!m) {
    m = new Map();
    fromOrigin.set(origin, m);
  }
  if (!m.has(key)) m.set(key, make());
  return m.get(key) as T;
}
const nearestTo = (ds: Dataset, kind: LandmarkKind, origin: Place) =>
  cachedFor(origin, `nearest:${kind}`, () => nearestLandmark(ds, kind, origin));

/** The answer if the hider were at complex `candidate`. */
export function evaluate(
  ds: Dataset,
  q: MapQuestion,
  candidate: number,
  ctx: AskContext,
): MapAnswer {
  const c = ds.complexes[candidate];
  const mine = ds.complexes[ctx.origin.complex];
  if (!c || !mine) throw new Error("unknown complex");
  switch (q.kind) {
    case "radar":
      return distanceMeters(c, ctx.origin) <= q.miles * METERS_PER_MILE;
    case "thermometer": {
      if (!ctx.baseline) throw new Error("thermometer without a baseline");
      return distanceMeters(c, ctx.origin) < distanceMeters(c, ctx.baseline) ? "hotter" : "colder";
    }
    case "route":
      return c.routes.includes(q.letter);
    case "borough":
      return c.borough === mine.borough;
    case "express":
      return c.express === mine.express;
    case "moreRoutes":
      return c.routes.length > mine.routes.length;
    case "matching":
      return (
        complexNearest(ds, q.landmark, candidate).index ===
        nearestTo(ds, q.landmark, ctx.origin).index
      );
    case "measuring":
      return (
        complexNearest(ds, q.landmark, candidate).meters <
        nearestTo(ds, q.landmark, ctx.origin).meters
      );
    case "tentacles": {
      const miles = TENTACLE_MILES[q.landmark] ?? 0;
      if (distanceMeters(c, ctx.origin) > miles * METERS_PER_MILE) return { landmark: null };
      const options = cachedFor(ctx.origin, `within:${q.landmark}`, () =>
        landmarksWithin(ds, q.landmark, ctx.origin, miles),
      );
      let best: number | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const i of options) {
        const l = ds.landmarks[q.landmark][i];
        const d = l ? distanceMeters(c, l) : Number.POSITIVE_INFINITY;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return { landmark: best };
    }
  }
}

type Point = { lat: number; lon: number };

/** The answer if the hider's spot were at `p`. Asked from where the seeker stands. */
export function evaluateSpot(q: SpotQuestion, p: Point, ctx: AskContext): SpotAnswer {
  const d = distanceMeters(p, ctx.origin);
  if (d > ON_FOOT_RANGE_M) return "far";
  switch (q.kind) {
    case "spotRadar":
      return d <= q.meters;
    case "spotThermometer": {
      if (!ctx.baseline) throw new Error("thermometer without a baseline");
      return d < distanceMeters(p, ctx.baseline) ? "hotter" : "colder";
    }
  }
}

/**
 * Whether the hider's station could be complex `c` given an on-foot answer. The spot is
 * within ZONE_RADIUS_M of the station, so "Not near you" rules out stations close to
 * where you asked, and any other answer rules out those far from it.
 */
function stationFitsSpotAnswer(ds: Dataset, c: number, ctx: AskContext, answer: Answer) {
  const station = ds.complexes[c];
  if (!station) return false;
  const d = distanceMeters(station, ctx.origin);
  const slack = 5; // the server checks the zone with a flat-earth distance
  return answer === "far"
    ? d > ON_FOOT_RANGE_M - ZONE_RADIUS_M - slack
    : d <= ON_FOOT_RANGE_M + ZONE_RADIUS_M + slack;
}

/** Why a question can't be asked right now, or null if it can. */
export function questionError(ds: Dataset, q: Question, ctx: AskContext): string | null {
  switch (q.kind) {
    case "radar":
      return (RADAR_MILES as readonly number[]).includes(q.miles) ? null : "Pick a radar distance.";
    case "route": {
      if (!ds.routes.some((r) => r.letter === q.letter)) return "No such route.";
      const here = ds.complexes[ctx.origin.complex];
      return here?.routes.includes(q.letter)
        ? null
        : "You can only ask about a line that stops where you are.";
    }
    case "thermometer":
      if (!ctx.baseline) return "Start a thermometer first, then move.";
      if (
        ctx.baseline.complex === ctx.origin.complex ||
        distanceMeters(ctx.baseline, ctx.origin) < THERMOMETER_MIN_METERS
      ) {
        return "Move to another station before reading the thermometer.";
      }
      return null;
    case "matching":
    case "measuring":
      return LANDMARK_KINDS.includes(q.landmark) && ds.landmarks[q.landmark].length > 0
        ? null
        : "No such landmark.";
    case "spotRadar":
      return (SPOT_RADAR_METERS as readonly number[]).includes(q.meters)
        ? null
        : "Pick a distance.";
    case "spotThermometer":
      if (!ctx.baseline) return "Start the walking thermometer first, then walk.";
      if (distanceMeters(ctx.baseline, ctx.origin) < FOOT_THERMOMETER_MIN_METERS) {
        return `Walk at least ${FOOT_THERMOMETER_MIN_METERS} m before reading it.`;
      }
      return null;
    case "tentacles": {
      const miles = TENTACLE_MILES[q.landmark];
      if (miles === undefined) return "No such landmark.";
      return landmarksWithin(ds, q.landmark, ctx.origin, miles).length > 0
        ? null
        : `There are no ${LANDMARK_WORDS[q.landmark].many} within ${milesText(miles)} of you.`;
    }
    default:
      return null;
  }
}

export interface Asked {
  q: Question;
  ctx: AskContext;
  answer: Answer;
}

/** Candidates that give the same answer as the hider to every question asked. */
export function filterCandidates(
  ds: Dataset,
  candidates: readonly number[],
  asked: readonly Asked[],
) {
  // Photos don't narrow anything automatically: they're for you to read. On-foot
  // answers only say roughly how far the station is (see stationFitsSpotAnswer).
  return candidates.filter((c) =>
    asked.every((a) => {
      if (isVetoed(a.answer)) return true;
      if (isMapQuestion(a.q)) return sameAnswer(evaluate(ds, a.q, c, a.ctx), a.answer);
      if (isSpotQuestion(a.q)) return stationFitsSpotAnswer(ds, c, a.ctx, a.answer);
      return true;
    }),
  );
}

/** Where questions are asked from, given the seeker's movement state at time t. */
export function questionOrigin(state: Transit, t: number, idx: TimetableIndex): Place {
  const { ds } = idx;
  const s = resolve(state, t, idx);
  const atStation = (i: number): Place => {
    const st = ds.stations[i];
    if (!st) throw new Error(`unknown station ${i}`);
    return { lat: st.lat, lon: st.lon, complex: st.complex };
  };
  switch (s.kind) {
    case "platform":
      return atStation(s.station);
    case "train":
      return atStation(lastStation(s, t, idx) as number);
    case "street": {
      const p = streetPoint(s, idx);
      return { lat: p.lat, lon: p.lon, complex: s.complex };
    }
    case "walking": {
      const dest = s.dest;
      const complex =
        dest.kind === "street" ? dest.complex : (ds.stations[dest.station]?.complex ?? 0);
      return { lat: s.fromPoint[0], lon: s.fromPoint[1], complex };
    }
  }
}

export function milesText(m: number) {
  return m === 0.25 ? "¼ mile" : m === 0.5 ? "½ mile" : m === 1 ? "1 mile" : `${m} miles`;
}

/** Short distance for question text: "0.3 mi", "800 ft". */
function shortDistance(meters: number) {
  const mi = meters / METERS_PER_MILE;
  return mi < 0.2 ? `${Math.round((meters * 3.28084) / 50) * 50} ft` : `${mi.toFixed(1)} mi`;
}

/**
 * The question as the seeker asked it. With the dataset and the context it was asked
 * in, it names the landmark that's nearest the seeker ("…the Met, like mine?").
 */
export function describeQuestion(q: Question, ds?: Dataset, ctx?: AskContext): string {
  switch (q.kind) {
    case "radar":
      return `Is your station within ${milesText(q.miles)} of me?`;
    case "thermometer":
      return "Am I closer than where I started the thermometer?";
    case "route": {
      const r = ds?.routes.find((x) => x.letter === q.letter);
      return `Does the ${r?.display === "S" ? r.name : (r?.display ?? q.letter)} stop at your station?`;
    }
    case "borough":
      return "Is your station in the same borough as me?";
    case "express": {
      const mine = ctx && ds?.complexes[ctx.origin.complex];
      if (!mine) return "Is your station the same kind of stop (express or local) as mine?";
      return mine.express
        ? "Is your station an express stop, like mine?"
        : "Is your station a local-only stop, like mine?";
    }
    case "moreRoutes":
      return "Do more lines stop at your station than at mine?";
    case "matching": {
      const words = LANDMARK_WORDS[q.landmark];
      const mine = ds && ctx ? nearestLandmark(ds, q.landmark, ctx.origin) : null;
      const name = mine && ds?.landmarks[q.landmark][mine.index]?.name;
      return name
        ? `Is your nearest ${words.one} ${name}, like mine?`
        : `Is your nearest ${words.one} the same as mine?`;
    }
    case "measuring": {
      const words = LANDMARK_WORDS[q.landmark];
      const mine = ds && ctx ? nearestLandmark(ds, q.landmark, ctx.origin) : null;
      const article = /^[aeiou]/.test(words.one) ? "an" : "a";
      const base = `Are you closer to ${article} ${words.one} than me?`;
      return mine ? `${base} I'm ${shortDistance(mine.meters)} from one.` : base;
    }
    case "tentacles": {
      const words = LANDMARK_WORDS[q.landmark];
      const miles = TENTACLE_MILES[q.landmark] ?? 0;
      const n = ds && ctx ? landmarksWithin(ds, q.landmark, ctx.origin, miles).length : null;
      return `Of the ${n ?? ""}${n === null ? "" : " "}${words.many} within ${milesText(miles)} of me, which is nearest you?`;
    }
    case "spotRadar":
      return `Is your spot within ${q.meters} m of me?`;
    case "spotThermometer":
      return "Am I closer to your spot than where I started walking?";
    case "photo": {
      const where = q.from === "exit" ? "your station's exit" : "where you're hiding";
      const dir = { N: "north", E: "east", S: "south", W: "west", up: "up" }[q.look];
      return `Photo from ${where}, looking ${dir}`;
    }
  }
}

export function describeAnswer(a: Answer, q?: Question, ds?: Dataset): string {
  if (typeof a === "object") {
    if ("vetoed" in a) return "Vetoed";
    if ("photo" in a) return "Photo";
    if (a.landmark === null) {
      const miles = q?.kind === "tentacles" ? TENTACLE_MILES[q.landmark] : undefined;
      return miles === undefined ? "Out of range" : `Not within ${milesText(miles)}`;
    }
    const name = q?.kind === "tentacles" ? ds?.landmarks[q.landmark][a.landmark]?.name : null;
    return name ?? "Answered";
  }
  if (a === "far") return "Not near you";
  if (a === "hotter") return "Hotter";
  if (a === "colder") return "Colder";
  if (q?.kind === "measuring" || q?.kind === "moreRoutes") return a ? "Closer" : "No";
  return a ? "Yes" : "No";
}
