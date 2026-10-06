/**
 * Elimination (DESIGN.md, Motion › Elimination): a question draws its boundary, then the
 * boundary clears the stations, in an order that shows the question's geometry. Radar
 * clears from the ring, inward for No and outward for Yes; Thermometer away from its line;
 * the questions with no geometry outward from where you asked; landmark questions from
 * their landmark. Each square lifts from ink to outline (160 ms); the stagger spreads
 * 600–900 ms by count, so the whole thing is under 2 s. Motion is presentation: the view
 * has already changed, this only catches the screen up.
 */
import type { Dataset } from "@stand-clear/data";
import {
  type Answer,
  type AskContext,
  complexNearest,
  distanceMeters,
  isVetoed,
  milesToMeters,
  nearestLandmark,
  type Question,
  TENTACLE_MILES,
} from "@stand-clear/engine";
import { sideOfBisector } from "./shapes.ts";

/** A square lifting from ink to outline. */
export const LIFT_MS = 160;

/** How long each question's boundary takes to draw before stations clear. */
export function boundaryMs(q: Question): number {
  switch (q.kind) {
    case "radar":
    case "spotRadar":
    case "matching":
    case "measuring":
      return 400;
    case "thermometer":
    case "spotThermometer":
    case "tentacles":
      return 300;
    default:
      return 0;
  }
}

/** The stagger's spread: 600 ms for ten stations or fewer, growing to 900 ms at 110. */
export function spreadMs(count: number): number {
  return 600 + Math.min(300, Math.max(0, (count - 10) * 3));
}

export interface Clearing {
  /** Real ms the answer landed: the choreography starts here. */
  start: number;
  q: Question;
  ctx: AskContext;
  answer: Answer;
  /** The boundary draws over this long first. */
  boundary: number;
  /** Per cleared station (complex) or search tile (index), when its lift starts, from `start`. */
  delays: Map<number, number>;
  /** When the last square has lifted, from `start`. */
  end: number;
}

type Point = { lat: number; lon: number };

/**
 * The order stations clear in, as a number per station (lower clears first). The scale
 * doesn't matter: the stagger normalizes it.
 */
function orderMetric(
  ds: Dataset,
  q: Question,
  answer: Answer,
  ctx: AskContext,
): (p: Point, complex: number) => number {
  const o = ctx.origin;
  switch (q.kind) {
    case "radar":
    case "spotRadar": {
      const r = q.kind === "radar" ? milesToMeters(q.miles) : q.meters;
      // From the ring: inward for No (the inside clears), outward for Yes.
      return answer === true ? (p) => distanceMeters(o, p) - r : (p) => r - distanceMeters(o, p);
    }
    case "thermometer":
    case "spotThermometer":
      // Away from the halfway line, on the colder side.
      return ctx.baseline
        ? (p) => Math.abs(sideOfBisector(ctx.baseline as Point, o, p))
        : (p) => distanceMeters(o, p);
    case "matching": {
      const mine = ds.landmarks[q.landmark][nearestLandmark(ds, q.landmark, o).index];
      return mine ? (p) => distanceMeters(mine, p) : (p) => distanceMeters(o, p);
    }
    case "measuring": {
      const d0 = nearestLandmark(ds, q.landmark, o).meters;
      // From the rings: outward when Closer (the farther ones clear), inward for No.
      return answer === true
        ? (_p, c) => complexNearest(ds, q.landmark, c).meters - d0
        : (_p, c) => d0 - complexNearest(ds, q.landmark, c).meters;
    }
    case "tentacles": {
      const named =
        typeof answer === "object" &&
        answer !== null &&
        "landmark" in answer &&
        answer.landmark !== null
          ? ds.landmarks[q.landmark][answer.landmark]
          : null;
      return named ? (p) => distanceMeters(named, p) : (p) => distanceMeters(o, p);
    }
    default:
      // Route, borough, express, more routes: no geometry, so outward from where you asked.
      return (p) => distanceMeters(o, p);
  }
}

/**
 * When each cleared station lifts. `cleared` pairs each station (or tile) id with where
 * it is. Reduced motion clears everything at once, with the boundary drawn.
 */
export function clearingFor(
  ds: Dataset,
  q: Question,
  answer: Answer,
  ctx: AskContext,
  cleared: { id: number; at: Point; complex?: number }[],
  start: number,
  reduced = false,
): Clearing {
  const delays = new Map<number, number>();
  if (isVetoed(answer) || cleared.length === 0) {
    return { start, q, ctx, answer, boundary: 0, delays, end: 0 };
  }
  if (reduced) {
    for (const c of cleared) delays.set(c.id, 0);
    return { start, q, ctx, answer, boundary: 0, delays, end: 0 };
  }
  const boundary = boundaryMs(q);
  const metric = orderMetric(ds, q, answer, ctx);
  const values = cleared.map((c) => metric(c.at, c.complex ?? c.id));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const spread = spreadMs(cleared.length);
  cleared.forEach((c, i) => {
    const v = values[i] as number;
    const f = hi > lo ? (v - lo) / (hi - lo) : 0;
    delays.set(c.id, boundary + f * spread);
  });
  return { start, q, ctx, answer, boundary, delays, end: boundary + spread + LIFT_MS };
}

/** How far a square has lifted (0 still ink, 1 gone to outline) at real time `now`. */
export function liftOf(c: Clearing, id: number, now: number): number {
  const d = c.delays.get(id);
  if (d === undefined) return 0;
  const t = now - c.start - d;
  return t <= 1e-6 ? 0 : t >= LIFT_MS - 1e-6 ? 1 : t / LIFT_MS;
}

/** How many cleared squares are still standing: the count steps down one per lift. */
export function stillStanding(c: Clearing | null, now: number): number {
  if (!c) return 0;
  let n = 0;
  for (const id of c.delays.keys()) if (liftOf(c, id, now) < 1) n++;
  return n;
}

/** The boundary's progress, 0–1, decelerating (the set token's curve). */
export function boundaryProgress(c: Clearing, now: number): number {
  if (c.boundary <= 0) return 1;
  const t = Math.min(1, Math.max(0, (now - c.start) / c.boundary));
  return 1 - (1 - t) ** 3;
}

/** Tentacles' range, in meters, for the boundary. */
export const tentacleRange = (q: Question) =>
  q.kind === "tentacles" ? milesToMeters(TENTACLE_MILES[q.landmark] ?? 0) : 0;
