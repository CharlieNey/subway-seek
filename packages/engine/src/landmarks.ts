/**
 * Landmarks that questions can be about: "Is your nearest museum the same as mine?",
 * "Are you closer to a hospital than me?", "Of the libraries within a mile of me, which
 * is nearest you?". Each landmark is one pin, and distances are measured to it.
 */
import type { Dataset, LandmarkKind } from "@stand-clear/data";
import { distanceMeters, METERS_PER_MILE } from "./geo.ts";

export const LANDMARK_KINDS: readonly LandmarkKind[] = [
  "park",
  "museum",
  "library",
  "hospital",
  "zoo",
  "airport",
];

export const LANDMARK_WORDS: Record<LandmarkKind, { one: string; many: string }> = {
  park: { one: "big park", many: "big parks" },
  museum: { one: "museum", many: "museums" },
  library: { one: "library", many: "libraries" },
  hospital: { one: "hospital", many: "hospitals" },
  zoo: { one: "zoo or aquarium", many: "zoos and aquariums" },
  airport: { one: "airport", many: "airports" },
};

/** Tentacles: "Of the ___ within this many miles of me…". Only kinds with enough pins. */
export const TENTACLE_MILES: Partial<Record<LandmarkKind, number>> = {
  museum: 1,
  library: 1,
  hospital: 2,
  park: 2,
};

export interface Nearest {
  /** Index into `ds.landmarks[kind]`. */
  index: number;
  meters: number;
}

type Point = { lat: number; lon: number };

export function nearestLandmark(ds: Dataset, kind: LandmarkKind, p: Point): Nearest {
  let best: Nearest = { index: -1, meters: Number.POSITIVE_INFINITY };
  ds.landmarks[kind].forEach((l, index) => {
    const meters = distanceMeters(p, l);
    if (meters < best.meters) best = { index, meters };
  });
  return best;
}

const byComplex = new WeakMap<Dataset, Map<LandmarkKind, Nearest[]>>();

/** The landmark nearest a complex's center (cached: questions ask this for every candidate). */
export function complexNearest(ds: Dataset, kind: LandmarkKind, complex: number): Nearest {
  let tables = byComplex.get(ds);
  if (!tables) {
    tables = new Map();
    byComplex.set(ds, tables);
  }
  let table = tables.get(kind);
  if (!table) {
    table = ds.complexes.map((c) => nearestLandmark(ds, kind, c));
    tables.set(kind, table);
  }
  return table[complex] ?? { index: -1, meters: Number.POSITIVE_INFINITY };
}

/** Landmarks of a kind within `miles` of a point, as indices. */
export function landmarksWithin(ds: Dataset, kind: LandmarkKind, p: Point, miles: number) {
  const out: number[] = [];
  ds.landmarks[kind].forEach((l, i) => {
    if (distanceMeters(p, l) <= miles * METERS_PER_MILE) out.push(i);
  });
  return out;
}
