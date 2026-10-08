/** Verified panorama boundaries for human hides and the view-only seeker's walk targets. */
import type { Dataset } from "@stand-clear/data";
import {
  distanceMeters,
  type HidingSpot,
  offsetMeters,
  resolve,
  type SoloView,
  streetPoint,
  type TimetableIndex,
} from "@stand-clear/engine";
import { nearestPano, officialSpot } from "./spot.ts";

export async function verifyHideSpot(
  lat: number,
  lon: number,
  pano: string,
): Promise<HidingSpot | null> {
  const spot = await officialSpot(pano);
  return spot && distanceMeters(spot, { lat, lon }) <= 5 ? spot : null;
}
export async function exitSpot(
  ds: Dataset,
  complex: number,
  exit: number,
): Promise<HidingSpot | null> {
  if (!process.env.GOOGLE_STREETVIEW_SERVER_KEY) return null;
  const point = ds.complexes[complex]?.exits[exit];
  if (!point) return null;
  const origin = { lat: point[0], lon: point[1] };
  // The metadata API can return a contributor photosphere in front of Google's
  // connected street imagery. Probe around that answer, retaining only official
  // panoramas inside the original 40 m exit search and the allowed zone.
  const targets = [
    origin,
    ...[0, 1, 2, 3].map((i) =>
      offsetMeters(origin, 25 * Math.cos((i * Math.PI) / 2), 25 * Math.sin((i * Math.PI) / 2)),
    ),
  ];
  for (const target of targets) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const spot = await nearestPano(target.lat, target.lon);
        if (spot && distanceMeters(origin, spot) <= 40) return spot;
        break;
      } catch {
        if (attempt === 1) return null;
      }
    }
  }
  return null;
}
/** Uses no hider information: snap the bot's intended walk to an official panorama. */
export async function seekerStreetTarget(
  view: SoloView,
  lat: number,
  lon: number,
  t: number,
  idx: TimetableIndex,
): Promise<HidingSpot | null> {
  if (!process.env.GOOGLE_STREETVIEW_SERVER_KEY) return null;
  const state = resolve(view.seeker, t, idx);
  if (state.kind !== "street") return null;
  const from = streetPoint(state, idx);
  for (const factor of [1, 1.5, 2]) {
    try {
      const p = await nearestPano(
        from.lat + (lat - from.lat) * factor,
        from.lon + (lon - from.lon) * factor,
      );
      if (p && distanceMeters(from, p) > 3) return p;
    } catch {
      /* retry another point along the same public bearing */
    }
  }
  return null;
}
