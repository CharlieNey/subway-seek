/**
 * Picks the bot hider's exact spot: a Google Street View panorama inside the zone
 * around its station. Uses the Street View metadata endpoint, which is free and uses
 * no quota (developers.google.com/maps/documentation/streetview/metadata).
 *
 * Google's terms: we keep the spot for the round only (no long-term caching of
 * Google's coordinates); panorama IDs may be stored.
 */
import type { Dataset } from "@stand-clear/data";
import { type HidingSpot, metersBetween, ZONE_RADIUS_M } from "@stand-clear/engine";

const KEY = process.env.GOOGLE_STREETVIEW_SERVER_KEY;
const ATTEMPTS = 8;

interface Metadata {
  status: string;
  pano_id?: string;
  location?: { lat: number; lng: number };
}

export async function nearestPano(lat: number, lon: number): Promise<HidingSpot | null> {
  const url =
    `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lon}` +
    `&radius=40&source=outdoor&key=${KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const d = (await res.json()) as Metadata;
  if (d.status !== "OK" || !d.pano_id || !d.location) return null;
  return { lat: d.location.lat, lon: d.location.lng, pano: d.pano_id };
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
    const lat = c.lat + (r * Math.sin(angle)) / 110_540;
    const lon = c.lon + (r * Math.cos(angle)) / (111_320 * Math.cos((c.lat * Math.PI) / 180));
    try {
      const spot = await nearestPano(lat, lon);
      if (spot && metersBetween(c, spot) <= ZONE_RADIUS_M) return spot;
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
