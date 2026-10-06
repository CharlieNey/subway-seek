/**
 * One Earth for the whole game: questions, walking, the zone, the reveal and the street
 * search all measure on the same sphere, so their answers can't disagree at the edges.
 */
export const EARTH_RADIUS_M = 6_371_000;
/** Meters per degree of latitude (and of longitude at the equator) on that sphere. */
export const METERS_PER_DEGREE = (EARTH_RADIUS_M * Math.PI) / 180;

type Point = { lat: number; lon: number };

/** Great-circle distance in meters. */
export function distanceMeters(a: Point, b: Point) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Meters east and north of `origin`, flat at their mean latitude. Within a few km it
 * agrees with distanceMeters to well under a millimeter, so flat geometry (where a walk
 * first comes within sight, the search grid) measures the same as everything else.
 */
export function localMeters(origin: Point, p: Point): [number, number] {
  const kx = METERS_PER_DEGREE * Math.cos((((origin.lat + p.lat) / 2) * Math.PI) / 180);
  return [(p.lon - origin.lon) * kx, (p.lat - origin.lat) * METERS_PER_DEGREE];
}

/** The point `east` and `north` meters from `origin` (the inverse of localMeters). */
export function offsetMeters(origin: Point, east: number, north: number): Point {
  const lat = origin.lat + north / METERS_PER_DEGREE;
  const kx = METERS_PER_DEGREE * Math.cos((((origin.lat + lat) / 2) * Math.PI) / 180);
  return { lat, lon: origin.lon + east / kx };
}

export const METERS_PER_MILE = 1609.344;

export const milesToMeters = (miles: number) => miles * METERS_PER_MILE;
