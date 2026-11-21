/**
 * What a question draws on the map (DESIGN.md, Questions: each family's color stands for
 * the shape its answer draws). Radar is a ring round you; Thermometer the line halfway
 * between two readings; Matching the city divided by nearest landmark, your cell outlined;
 * Measuring a ring of your distance round every landmark; Tentacles the range ring and a
 * line to each landmark inside it. The shapes say what a question does, never how many
 * stations either answer would leave.
 */
import type { Dataset, LandmarkKind } from "@subway-seek/data";
import {
  type Answer,
  type AskContext,
  type LonLat,
  landmarksWithin,
  localMeters,
  milesToMeters,
  nearestLandmark,
  offsetMeters,
  type Question,
  TENTACLE_MILES,
} from "@subway-seek/engine";
import { Delaunay } from "d3-delaunay";
import { type Family, familyOf } from "../ui/family.ts";

type Point = { lat: number; lon: number };
export type Path = LonLat[];

/** A ring of `meters` round a point, as the engine measures. */
export function ring(center: Point, meters: number, steps = 64): Path {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    const p = offsetMeters(center, meters * Math.cos(a), meters * Math.sin(a));
    return [p.lon, p.lat] as LonLat;
  });
}

/**
 * The perpendicular bisector of a and b: the line of points as far from each, through
 * their midpoint, `half` meters each way. Hotter keeps the side b is on.
 */
export function bisector(a: Point, b: Point, half = 30_000): Path {
  const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
  const [dx, dy] = localMeters(a, b);
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular to a→b.
  const [ux, uy] = [-dy / len, dx / len];
  const p1 = offsetMeters(mid, ux * half, uy * half);
  const p2 = offsetMeters(mid, -ux * half, -uy * half);
  return [
    [p1.lon, p1.lat],
    [p2.lon, p2.lat],
  ];
}

/** Signed distance (m) of p from the bisector of a and b: positive on b's side. */
export function sideOfBisector(a: Point, b: Point, p: Point): number {
  const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
  const [dx, dy] = localMeters(a, b);
  const len = Math.hypot(dx, dy) || 1;
  const [px, py] = localMeters(mid, p);
  return (px * dx + py * dy) / len;
}

/** The bisector clipped to a circle (on foot: the halfway line inside the search area). */
export function bisectorInCircle(a: Point, b: Point, center: Point, radius: number): Path | null {
  const [ax, ay] = localMeters(center, a);
  const [bx, by] = localMeters(center, b);
  const [mx, my] = [(ax + bx) / 2, (ay + by) / 2];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const [ux, uy] = [-(by - ay) / len, (bx - ax) / len];
  // |m + s·u| = r  →  s² + 2(m·u)s + |m|² − r² = 0
  const bq = mx * ux + my * uy;
  const cq = mx * mx + my * my - radius * radius;
  const disc = bq * bq - cq;
  if (disc <= 0) return null;
  const s1 = -bq - Math.sqrt(disc);
  const s2 = -bq + Math.sqrt(disc);
  const at = (s: number) => {
    const p = offsetMeters(center, mx + ux * s, my + uy * s);
    return [p.lon, p.lat] as LonLat;
  };
  return [at(s1), at(s2)];
}

/** New York, padded: where Matching's cells are clipped. */
const NYC_BOUNDS = { south: 40.45, north: 40.95, west: -74.3, east: -73.65 };
const CELL_ORIGIN = { lat: 40.7, lon: -73.97 };

const cellCache = new Map<string, Path[]>();

/**
 * The city divided by nearest landmark of a kind: one cell per landmark, clipped to New
 * York. Computed flat, in meters round the city's middle, which agrees with the engine's
 * great-circle "nearest" everywhere a station is.
 */
export function landmarkCells(ds: Dataset, kind: LandmarkKind): Path[] {
  const hit = cellCache.get(kind);
  if (hit) return hit;
  const pts = ds.landmarks[kind].map((l) => localMeters(CELL_ORIGIN, l));
  const [x0, y0] = localMeters(CELL_ORIGIN, { lat: NYC_BOUNDS.south, lon: NYC_BOUNDS.west });
  const [x1, y1] = localMeters(CELL_ORIGIN, { lat: NYC_BOUNDS.north, lon: NYC_BOUNDS.east });
  const voronoi = Delaunay.from(pts).voronoi([x0, y0, x1, y1]);
  const cells = pts.map((_, i) => {
    const poly = voronoi.cellPolygon(i) ?? [];
    return poly.map(([x, y]) => {
      const p = offsetMeters(CELL_ORIGIN, x as number, y as number);
      return [p.lon, p.lat] as LonLat;
    });
  });
  cellCache.set(kind, cells);
  return cells;
}

/** A landmark pinned while a question about its kind is chosen or read. */
export interface Plaque {
  kind: LandmarkKind;
  position: LonLat;
  name: string;
  /** The one nearest you: framed in ink and named. */
  nearest: boolean;
}

/** What a question draws: its rings and lines, its cells, and the landmarks it's about. */
export interface Shape {
  family: Family;
  /** Closed rings: radar, the tentacles' range, measuring's rings. */
  rings: Path[];
  /** Open lines: the thermometer's halfway line, tentacles. */
  lines: Path[];
  /** Matching's cells, and the one that's yours. */
  cells: Path[];
  yourCell: Path | null;
  plaques: Plaque[];
  /** The route a "Does the Q stop there?" is about: its line is picked out. */
  route: string | null;
}

const empty = (family: Family): Shape => ({
  family,
  rings: [],
  lines: [],
  cells: [],
  yourCell: null,
  plaques: [],
  route: null,
});

function plaquesFor(ds: Dataset, kind: LandmarkKind, origin: Point, only?: number[]): Plaque[] {
  const mine = nearestLandmark(ds, kind, origin).index;
  const list = ds.landmarks[kind];
  return (only ?? list.map((_, i) => i)).flatMap((i) => {
    const l = list[i];
    return l
      ? [{ kind, position: [l.lon, l.lat] as LonLat, name: l.name, nearest: i === mine }]
      : [];
  });
}

/**
 * The shape of a question asked from `ctx`. On foot, `search` is the circle round the
 * station you came up at: the walking hotter-or-colder's line is clipped to it.
 */
export function questionShape(
  ds: Dataset,
  q: Question,
  ctx: AskContext,
  search?: { center: Point; radius: number } | null,
): Shape {
  const family = familyOf(q);
  const origin = ctx.origin;
  const s = empty(family);
  switch (q.kind) {
    case "radar":
      s.rings.push(ring(origin, milesToMeters(q.miles)));
      return s;
    case "spotRadar":
      s.rings.push(ring(origin, q.meters));
      return s;
    case "thermometer":
      if (ctx.baseline) s.lines.push(bisector(ctx.baseline, origin));
      return s;
    case "spotThermometer": {
      if (!ctx.baseline) return s;
      const line = search
        ? bisectorInCircle(ctx.baseline, origin, search.center, search.radius)
        : bisector(ctx.baseline, origin, 600);
      if (line) s.lines.push(line);
      return s;
    }
    case "route":
      s.route = q.letter;
      return s;
    case "matching": {
      s.cells = landmarkCells(ds, q.landmark);
      s.yourCell = s.cells[nearestLandmark(ds, q.landmark, origin).index] ?? null;
      s.plaques = plaquesFor(ds, q.landmark, origin);
      return s;
    }
    case "measuring": {
      const mine = nearestLandmark(ds, q.landmark, origin);
      s.rings = ds.landmarks[q.landmark].map((l) => ring(l, mine.meters, 40));
      s.plaques = plaquesFor(ds, q.landmark, origin);
      return s;
    }
    case "tentacles": {
      const miles = TENTACLE_MILES[q.landmark] ?? 0;
      const inRange = landmarksWithin(ds, q.landmark, origin, miles);
      s.rings.push(ring(origin, milesToMeters(miles)));
      s.lines = inRange.flatMap((i) => {
        const l = ds.landmarks[q.landmark][i];
        return l
          ? [
              [
                [origin.lon, origin.lat],
                [l.lon, l.lat],
              ] as Path,
            ]
          : [];
      });
      s.plaques = plaquesFor(ds, q.landmark, origin, inRange);
      return s;
    }
    default:
      return s;
  }
}

/** Clip a polygon to a convex one (Sutherland–Hodgman), both in flat meters. */
function clipConvex(subject: [number, number][], clip: [number, number][]): [number, number][] {
  let out = subject;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i] as [number, number];
    const b = clip[(i + 1) % clip.length] as [number, number];
    const inside = (p: [number, number]) =>
      (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
    const cross = (p: [number, number], q: [number, number]): [number, number] => {
      const [x1, y1, x2, y2] = [p[0], p[1], q[0], q[1]];
      const [x3, y3, x4, y4] = [a[0], a[1], b[0], b[1]];
      const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4) || 1e-12;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    const input = out;
    out = [];
    input.forEach((p, j) => {
      const prev = input[(j + input.length - 1) % input.length] as [number, number];
      if (inside(p)) {
        if (!inside(prev)) out.push(cross(prev, p));
        out.push(p);
      } else if (inside(prev)) out.push(cross(prev, p));
    });
    if (out.length === 0) break;
  }
  return out;
}

/**
 * What an answer leaves drawn while it's read. A Tentacles answer keeps the named
 * landmark's cell among those in range, clipped to the range; the other tentacles go. A
 * veto draws nothing.
 */
export function answeredShape(
  ds: Dataset,
  q: Question,
  ctx: AskContext,
  answer: Answer,
  search?: { center: Point; radius: number } | null,
): Shape {
  if (typeof answer === "object" && answer !== null && "vetoed" in answer)
    return empty(familyOf(q));
  if (q.kind !== "tentacles") return questionShape(ds, q, ctx, search);
  const s = empty("tent");
  const miles = TENTACLE_MILES[q.landmark] ?? 0;
  const range = milesToMeters(miles);
  s.rings.push(ring(ctx.origin, range));
  const named =
    typeof answer === "object" && answer !== null && "landmark" in answer ? answer.landmark : null;
  const inRange = landmarksWithin(ds, q.landmark, ctx.origin, miles);
  s.plaques = inRange.flatMap((i) => {
    const l = ds.landmarks[q.landmark][i];
    return l
      ? [
          {
            kind: q.landmark,
            position: [l.lon, l.lat] as LonLat,
            name: l.name,
            nearest: i === named,
          },
        ]
      : [];
  });
  if (named === null) return s;
  // The named landmark's cell among those in range, clipped to the range.
  const pts = inRange.map((i) => localMeters(ctx.origin, ds.landmarks[q.landmark][i] as Point));
  const k = inRange.indexOf(named);
  if (k < 0) return s;
  const pad = range * 1.2;
  const voronoi = Delaunay.from(pts).voronoi([-pad, -pad, pad, pad]);
  const cell = (voronoi.cellPolygon(k) ?? []).map(([x, y]) => [x, y] as [number, number]);
  const circle = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [range * Math.cos(a), range * Math.sin(a)] as [number, number];
  });
  const clipped = clipConvex(cell.slice(0, -1), circle);
  s.yourCell = clipped.map(([x, y]) => {
    const p = offsetMeters(ctx.origin, x, y);
    return [p.lon, p.lat] as LonLat;
  });
  if (s.yourCell.length > 0) s.yourCell.push(s.yourCell[0] as LonLat);
  return s;
}

/** The Google-style zoom (256 px tiles) at which a circle of `meters` spans `px` pixels. */
export function fitZoom(lat: number, meters: number, px: number): number {
  const metersPerPixelAtZ0 = 156_543.033_92 * Math.cos((lat * Math.PI) / 180);
  return Math.log2((Math.max(1, px) * metersPerPixelAtZ0) / (2 * meters));
}
