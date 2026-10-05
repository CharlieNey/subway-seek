/**
 * Map questions. Each question is one function, `evaluate(q, candidate, ctx)`, that says
 * what the answer would be if the hider were at `candidate` (a complex). The real answer
 * is `evaluate` at the hider's complex; a candidate stays possible iff it gives the same
 * answer. So shading can never rule out the hider, by construction.
 *
 * Questions are about the hider's station (the zone center), asked from the seeker's
 * origin — the last station their train called at, or where they stand on the street.
 */
import type { Dataset } from "@stand-clear/data";
import type { TimetableIndex } from "./timetable.ts";
import { lastStation, resolve, type Transit } from "./transit.ts";

export const RADAR_MILES = [0.25, 0.5, 1, 2, 5] as const;
/** A thermometer needs you to have moved at least this far since you started it. */
export const THERMOMETER_MIN_METERS = 400;
const METERS_PER_MILE = 1609.344;

export type Question =
  | { kind: "radar"; miles: number }
  | { kind: "thermometer" }
  | { kind: "route"; letter: string }
  | { kind: "borough" }
  | { kind: "express" }
  | { kind: "moreRoutes" };

export type Answer = boolean | "hotter" | "colder";

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

export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The answer if the hider were at complex `candidate`. */
export function evaluate(ds: Dataset, q: Question, candidate: number, ctx: AskContext): Answer {
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
      return c.express;
    case "moreRoutes":
      return c.routes.length > mine.routes.length;
  }
}

/** Why a question can't be asked right now, or null if it can. */
export function questionError(ds: Dataset, q: Question, ctx: AskContext): string | null {
  switch (q.kind) {
    case "radar":
      return (RADAR_MILES as readonly number[]).includes(q.miles) ? null : "Pick a radar distance.";
    case "route":
      return ds.routes.some((r) => r.letter === q.letter) ? null : "No such route.";
    case "thermometer":
      if (!ctx.baseline) return "Start a thermometer first, then move.";
      if (
        ctx.baseline.complex === ctx.origin.complex ||
        distanceMeters(ctx.baseline, ctx.origin) < THERMOMETER_MIN_METERS
      ) {
        return "Move to another station before reading the thermometer.";
      }
      return null;
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
  return candidates.filter((c) => asked.every((a) => evaluate(ds, a.q, c, a.ctx) === a.answer));
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
      const c = ds.complexes[s.complex];
      const [lat, lon] = c?.exits[s.exit] ?? [c?.lat ?? 0, c?.lon ?? 0];
      return { lat, lon, complex: s.complex };
    }
    case "walking": {
      const dest = s.dest;
      const complex =
        dest.kind === "street" ? dest.complex : (ds.stations[dest.station]?.complex ?? 0);
      return { lat: s.fromPoint[0], lon: s.fromPoint[1], complex };
    }
  }
}

const miles = (m: number) =>
  m === 0.25 ? "¼ mile" : m === 0.5 ? "½ mile" : m === 1 ? "1 mile" : `${m} miles`;

export function describeQuestion(q: Question, ds?: Dataset): string {
  switch (q.kind) {
    case "radar":
      return `Is your station within ${miles(q.miles)} of me?`;
    case "thermometer":
      return "Am I closer than where I started the thermometer?";
    case "route": {
      const r = ds?.routes.find((x) => x.letter === q.letter);
      return `Does the ${r?.display === "S" ? r.name : (r?.display ?? q.letter)} stop at your station?`;
    }
    case "borough":
      return "Is your station in the same borough as me?";
    case "express":
      return "Do express trains stop at your station?";
    case "moreRoutes":
      return "Do more routes stop at your station than at mine?";
  }
}

export function describeAnswer(a: Answer): string {
  if (a === "hotter") return "Hotter";
  if (a === "colder") return "Colder";
  return a ? "Yes" : "No";
}
