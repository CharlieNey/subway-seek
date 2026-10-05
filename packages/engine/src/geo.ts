/** Great-circle distance in meters. */
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

export const METERS_PER_MILE = 1609.344;

export const milesToMeters = (miles: number) => miles * METERS_PER_MILE;
