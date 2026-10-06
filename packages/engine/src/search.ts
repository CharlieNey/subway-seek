/**
 * The seeker's search on foot. The map frames a ZONE_RADIUS_M circle around the station
 * they came up at — their own guess, never the hider's real zone — and shades the parts
 * of it that could still hold the hider: inside some possible station's zone, true to
 * every on-foot answer, and out of sight of everywhere they've walked.
 */
import type { Dataset } from "@stand-clear/data";
import {
  type Asked,
  evaluateSpot,
  isSpotQuestion,
  isVetoed,
  sameAnswer,
  ZONE_RADIUS_M,
} from "./questions.ts";
import { type FootSegment, SPOT_REVEAL_METERS } from "./solo.ts";

/** Grid spacing for the search area. Fine next to the 40 m you can see. */
export const SEARCH_GRID_M = 8;

type Point = { lat: number; lon: number };

const grids = new Map<string, Point[]>();

/** Points every SEARCH_GRID_M across the circle of `radius` around `center`. */
export function searchGrid(center: Point, radius = ZONE_RADIUS_M): Point[] {
  const key = `${center.lat},${center.lon},${radius}`;
  let grid = grids.get(key);
  if (grid) return grid;
  const kx = 111_320 * Math.cos((center.lat * Math.PI) / 180);
  const ky = 110_540;
  grid = [];
  for (let y = -radius; y <= radius; y += SEARCH_GRID_M) {
    for (let x = -radius; x <= radius; x += SEARCH_GRID_M) {
      if (x * x + y * y <= radius * radius) {
        grid.push({ lat: center.lat + y / ky, lon: center.lon + x / kx });
      }
    }
  }
  grids.set(key, grid);
  return grid;
}

/** Flat-earth meters from p to the segment a–b. */
function toSegment(p: Point, a: readonly [number, number], b: readonly [number, number]) {
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110_540;
  const ax = (a[1] - p.lon) * kx;
  const ay = (a[0] - p.lat) * ky;
  const dx = (b[1] - a[1]) * kx;
  const dy = (b[0] - a[0]) * ky;
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

/** Points of the search area around `center` that could still hold the hider's spot. */
export function possibleSpots(
  ds: Dataset,
  center: Point,
  asked: readonly Asked[],
  candidates: readonly number[],
  footpath: readonly FootSegment[],
  t: number,
): Point[] {
  const onFoot = asked.filter((a) => isSpotQuestion(a.q) && !isVetoed(a.answer));
  const kx = 111_320 * Math.cos((center.lat * Math.PI) / 180);
  const near = (a: Point, b: Point) => Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 110_540);
  // Only zones that reach into the circle matter. (+2 m: the server checks the zone flat.)
  const zones = candidates
    .map((c) => ds.complexes[c])
    .filter((z) => z !== undefined && near(z, center) <= 2 * ZONE_RADIUS_M + 2) as Point[];
  const walked = walkedBy(footpath, t);
  return searchGrid(center).filter(
    (p) =>
      zones.some((z) => near(z, p) <= ZONE_RADIUS_M + 2) &&
      onFoot.every(
        (a) => isSpotQuestion(a.q) && sameAnswer(evaluateSpot(a.q, p, a.ctx), a.answer),
      ) &&
      // You'd have seen them from anywhere within SPOT_REVEAL_METERS (a little less
      // along a walk, which stops a hair inside it).
      !walked.some((s) => toSegment(p, s.a, s.b) < SPOT_REVEAL_METERS - 1),
  );
}
