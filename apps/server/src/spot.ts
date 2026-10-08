/**
 * Picks the bot hider's exact spot: a Google Street View panorama inside the zone
 * around its station. Uses the Street View metadata endpoint, which is free and uses
 * no quota (developers.google.com/maps/documentation/streetview/metadata).
 *
 * Google's terms: we keep the spot's coordinates for the round only (no caching of
 * Google's coordinates); panorama IDs may be stored, so the daily keeps those and looks
 * the coordinates up again for each round (spotFromPano).
 */
import type { Dataset } from "@stand-clear/data";
import { distanceMeters, type HidingSpot, offsetMeters, ZONE_RADIUS_M } from "@stand-clear/engine";

const KEY = process.env.GOOGLE_STREETVIEW_SERVER_KEY;
const ATTEMPTS = 8;

interface Metadata {
  status: string;
  pano_id?: string;
  location?: { lat: number; lng: number };
  /** "© Google" for Google's own imagery; a contributor's name for a user photosphere. */
  copyright?: string;
}

/**
 * Whether a panorama is Google's own street imagery. The client only ever walks to
 * Google's panoramas (StreetViewSource.GOOGLE), and the metadata endpoint has no such
 * filter (`source=outdoor` still returns user photospheres), so a user photosphere picked
 * as the hiding spot can never be reached: the 2026-10-07 daily's hider stood on one, with
 * the nearest Google panorama 25.4 m away, just outside the catch distance.
 */
export function officialImagery(d: Pick<Metadata, "copyright">): boolean {
  return /\bGoogle\b/.test(d.copyright ?? "");
}

async function metadata(query: string, officialOnly = false): Promise<HidingSpot | null> {
  const url = `https://maps.googleapis.com/maps/api/streetview/metadata?${query}&key=${KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const d = (await res.json()) as Metadata;
  if (d.status !== "OK" || !d.pano_id || !d.location) return null;
  if (officialOnly && !officialImagery(d)) return null;
  return { lat: d.location.lat, lon: d.location.lng, pano: d.pano_id };
}

/** The nearest of Google's own outdoor panoramas within 40 m, as the client would find it. */
export function nearestPano(lat: number, lon: number): Promise<HidingSpot | null> {
  return metadata(`location=${lat},${lon}&radius=40&source=outdoor`, true);
}

/** How far a walk's target may sit from the panorama Google has there. */
export const STREET_SNAP_M = 5;

/**
 * Whether a walk's target is a real street panorama (DESIGN.md, Hidden information and
 * validation; solo today checks the target, not the path): the panorama it names, within
 * STREET_SNAP_M of the point it gives, or with no name, an outdoor panorama that close.
 * The client walks to panoramas Google's own viewer reports, so an honest walk always
 * passes; a point inside a building doesn't. Null when it can't be checked (no key, or
 * the lookup failed), and the caller lets the walk through rather than strand the player.
 */
export async function isStreetPoint(
  lat: number,
  lon: number,
  pano?: string,
): Promise<boolean | null> {
  if (!KEY) return null;
  try {
    const p = pano
      ? await metadata(`pano=${encodeURIComponent(pano)}`)
      : await metadata(`location=${lat},${lon}&radius=${STREET_SNAP_M}&source=outdoor`);
    return p !== null && distanceMeters(p, { lat, lon }) <= STREET_SNAP_M;
  } catch (err) {
    console.warn(`street check failed: ${String(err)}`);
    return null;
  }
}

/** A panorama's spot, by its ID. Null when there's no key, or the lookup fails. */
export async function spotFromPano(pano: string): Promise<HidingSpot | null> {
  if (!KEY) return null;
  try {
    return await metadata(`pano=${encodeURIComponent(pano)}`);
  } catch (err) {
    console.warn(`panorama lookup failed: ${String(err)}`);
    return null;
  }
}

/**
 * A random outdoor panorama 60–360 m from the complex's center (uniform over the
 * ring), kept only if it's inside the zone. Null when there's no key or no luck —
 * the round then falls back to "find the station".
 */
export async function pickSpot(
  ds: Dataset,
  complex: number,
  random: () => number,
): Promise<HidingSpot | null> {
  const c = ds.complexes[complex];
  if (!KEY || !c) return null;
  for (let i = 0; i < ATTEMPTS; i++) {
    const angle = random() * 2 * Math.PI;
    const r = Math.sqrt(60 ** 2 + random() * (360 ** 2 - 60 ** 2));
    const { lat, lon } = offsetMeters(c, r * Math.cos(angle), r * Math.sin(angle));
    try {
      const spot = await nearestPano(lat, lon);
      if (spot && distanceMeters(c, spot) <= ZONE_RADIUS_M) return spot;
    } catch (err) {
      console.warn(`spot lookup failed: ${String(err)}`);
    }
  }
  return null;
}

/**
 * The panorama just outside one exit of the complex (picked with `random`), used to
 * answer "photo from your station's exit". Null when there's no key or no imagery.
 */
export async function pickExitPano(
  ds: Dataset,
  complex: number,
  random: () => number,
): Promise<string | null> {
  const c = ds.complexes[complex];
  if (!KEY || !c || c.exits.length === 0) return null;
  // Fisher–Yates with the round's random source (deterministic for the daily).
  const order = [...c.exits.keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  for (const i of order.slice(0, 4)) {
    const [lat, lon] = c.exits[i] ?? [c.lat, c.lon];
    try {
      const p = await nearestPano(lat, lon);
      if (p) return p.pano;
    } catch (err) {
      console.warn(`exit panorama lookup failed: ${String(err)}`);
    }
  }
  return null;
}

/** A hider lock is never accepted on a failed lookup or contributor imagery. Retry errors once. */
export async function officialSpot(pano: string): Promise<HidingSpot | null> {
  if (!KEY) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await metadata(`pano=${encodeURIComponent(pano)}`, true);
    } catch (err) {
      if (attempt === 1) console.warn(`hider panorama lookup failed: ${String(err)}`);
    }
  }
  return null;
}
