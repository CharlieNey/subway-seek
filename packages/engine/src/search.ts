/**
 * The seeker's search on foot. The map frames a ZONE_RADIUS_M circle around the station
 * they came up at — their own guess, never the hider's real zone — and shades the parts
 * of it that could still hold the hider: inside some possible station's zone, true to
 * every on-foot answer, and out of sight of everywhere they've walked.
 */
import type { Dataset } from "@subway-seek/data";
import { distanceMeters, localMeters, offsetMeters } from "./geo.ts";
import {
  type Answer,
  type AskContext,
  evaluateSpot,
  isSpotQuestion,
  isVetoed,
  type Question,
  sameAnswer,
  ZONE_RADIUS_M,
} from "./questions.ts";
import { type FootSegment, firstWithin, SPOT_REVEAL_METERS } from "./solo.ts";

/** Grid spacing for the search area. Fine next to the 40 m you can see. */
export const SEARCH_GRID_M = 8;

type Point = { lat: number; lon: number };

const grids = new Map<string, Point[]>();

/** Points every SEARCH_GRID_M across the circle of `radius` around `center`. */
export function searchGrid(center: Point, radius = ZONE_RADIUS_M): Point[] {
  const key = `${center.lat},${center.lon},${radius}`;
  let grid = grids.get(key);
  if (grid) return grid;
  grid = [];
  for (let y = -radius; y <= radius; y += SEARCH_GRID_M) {
    for (let x = -radius; x <= radius; x += SEARCH_GRID_M) {
      if (x * x + y * y <= radius * radius) grid.push(offsetMeters(center, x, y));
    }
  }
  grids.set(key, grid);
  return grid;
}

/** Meters from p to the segment a–b. */
function toSegment(p: Point, a: readonly [number, number], b: readonly [number, number]) {
  const [ax, ay] = localMeters(p, { lat: a[0], lon: a[1] });
  const [bx, by] = localMeters(p, { lat: b[0], lon: b[1] });
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const f = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
  return Math.hypot(ax + f * dx, ay + f * dy);
}

/** The part of each footpath segment walked by game time t. */
export function walkedBy(footpath: readonly FootSegment[], t: number): FootSegment[] {
  return footpath.flatMap((s) => {
    if (s.start > t) return [];
    if (s.end <= t) return [s];
    const f = (t - s.start) / (s.end - s.start);
    const b: [number, number] = [s.a[0] + f * (s.b[0] - s.a[0]), s.a[1] + f * (s.b[1] - s.a[1])];
    return [{ ...s, b, end: t }];
  });
}

/** First circle entry derived only from the seeker's public walked path. */
export function publicZoneEntryAt(
  center: Point,
  footpath: readonly FootSegment[],
  t: number,
): number {
  let first = Number.POSITIVE_INFINITY;
  for (const s of walkedBy(footpath, t)) {
    const a = { lat: s.a[0], lon: s.a[1] };
    const f =
      distanceMeters(center, a) <= ZONE_RADIUS_M ? 0 : firstWithin(s.a, s.b, center, ZONE_RADIUS_M);
    if (f !== null) first = Math.min(first, s.start + f * (s.end - s.start));
  }
  return first;
}

function afterEntry(path: readonly FootSegment[], since: number): FootSegment[] {
  return path.flatMap((s) => {
    if (s.end < since) return [];
    if (s.start >= since) return [s];
    const f = (since - s.start) / (s.end - s.start);
    return [
      {
        ...s,
        start: since,
        a: [s.a[0] + f * (s.b[0] - s.a[0]), s.a[1] + f * (s.b[1] - s.a[1])] as [number, number],
      },
    ];
  });
}

/** Human hides use only evidence after each candidate's public freeze time. */
export function possibleSpots(
  ds: Dataset,
  center: Point,
  asked: readonly { q: Question; ctx: AskContext; answer: Answer | null; at?: number }[],
  candidates: readonly number[],
  footpath: readonly FootSegment[],
  t: number,
  mobileHider = false,
  radius = ZONE_RADIUS_M,
): Point[] {
  const onFoot = asked.filter(
    (a): a is typeof a & { answer: Answer } =>
      isSpotQuestion(a.q) && a.answer !== null && !isVetoed(a.answer),
  );
  const walked = walkedBy(footpath, t);
  const zones = candidates
    .map((c) => ds.complexes[c])
    .filter(
      (z): z is NonNullable<typeof z> => !!z && distanceMeters(z, center) <= radius + ZONE_RADIUS_M,
    )
    .map((z) => {
      const since = mobileHider ? publicZoneEntryAt(z, footpath, t) : Number.NEGATIVE_INFINITY;
      return {
        center: z,
        asked: mobileHider ? onFoot.filter((a) => (a.at ?? -Infinity) >= since) : onFoot,
        walked: mobileHider ? afterEntry(walked, since) : walked,
      };
    });
  return searchGrid(center, radius).filter((p) =>
    zones.some(
      (z) =>
        distanceMeters(z.center, p) <= ZONE_RADIUS_M &&
        z.asked.every(
          (a) => isSpotQuestion(a.q) && sameAnswer(evaluateSpot(a.q, p, a.ctx), a.answer),
        ) &&
        !z.walked.some((s) => toSegment(p, s.a, s.b) < SPOT_REVEAL_METERS - 1),
    ),
  );
}
