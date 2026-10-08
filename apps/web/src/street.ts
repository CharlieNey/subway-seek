/**
 * Street View helpers for the endgame. Panorama lookups (StreetViewService) are free;
 * displaying a panorama is billed per StreetViewPanorama created, so the game creates
 * one and reuses it (StreetView.tsx).
 */
import { type Photo, resolve, type SoloView } from "@stand-clear/engine";
import { nowGameTime, useGame, type World } from "./game.ts";
import { isHider, ownTransit } from "./hide.ts";
import { GOOGLE_MAPS_KEY, loadGoogleMaps } from "./map/loadGoogle.ts";

export interface PanoPoint {
  pano: string;
  lat: number;
  lon: number;
}

let service: google.maps.StreetViewService | null = null;

async function sv(): Promise<google.maps.StreetViewService> {
  await loadGoogleMaps();
  await google.maps.importLibrary("streetView");
  service ??= new google.maps.StreetViewService();
  return service;
}

const OFFICIAL = () => [google.maps.StreetViewSource.GOOGLE, google.maps.StreetViewSource.OUTDOOR];

/** Google's own outdoor panorama nearest a point (within `radius` m), if any. */
export async function nearestPano(
  lat: number,
  lon: number,
  radius = 50,
): Promise<PanoPoint | null> {
  try {
    const { data } = await (await sv()).getPanorama({
      location: { lat, lng: lon },
      radius,
      sources: OFFICIAL(),
    });
    const ll = data.location?.latLng;
    return data.location?.pano && ll
      ? { pano: data.location.pano, lat: ll.lat(), lon: ll.lng() }
      : null;
  } catch {
    return null;
  }
}

/** Where a panorama is. */
export async function panoPoint(pano: string): Promise<PanoPoint | null> {
  try {
    const { data } = await (await sv()).getPanorama({ pano });
    const ll = data.location?.latLng;
    return ll ? { pano, lat: ll.lat(), lon: ll.lng() } : null;
  } catch {
    return null;
  }
}

/** You're on the street (standing, or walking up/along it): Street View takes over. */
export function onStreet(view: SoloView | null, t: number | null, world: World | null): boolean {
  if (!view || t === null || !world || view.result) return false;
  if (isHider(view) && view.lock) return false;
  const s = resolve(ownTransit(view), t, world.idx);
  return (
    s.kind === "street" || (s.kind === "walking" && (s.reason === "street" || s.reason === "exit"))
  );
}

/** Walk to the panorama nearest a point on the map (only while on the street). */
export async function walkToward(lat: number, lon: number): Promise<void> {
  const { view, world, send } = useGame.getState();
  if (!onStreet(view, nowGameTime(), world)) return;
  const p = await nearestPano(lat, lon, 40);
  if (!p) {
    useGame.setState({ notice: "No street to walk to there — click closer to a street." });
    return;
  }
  send({ type: "walkTo", lat: p.lat, lon: p.lon, pano: p.pano });
}

if (import.meta.env.DEV)
  (window as unknown as { __walkToward: typeof walkToward }).__walkToward = walkToward;

/**
 * A photo answer as a Street View Static image, loaded straight from Google with the
 * browser key (billed per image; capped at 300/day). 640×400 is the free-tier max width;
 * the same URL serves the thumbnail and the full view, so the browser fetches it once.
 */
export function photoUrl(p: Photo): string {
  // The server signs the URL when it has the secret; that one is good for exactly this photo.
  if (p.url) return p.url;
  const q = new URLSearchParams({
    size: "640x400",
    pano: p.pano,
    heading: String(p.heading),
    pitch: String(p.pitch),
    fov: String(p.fov),
    source: "outdoor",
    key: GOOGLE_MAPS_KEY ?? "",
  });
  return `https://maps.googleapis.com/maps/api/streetview?${q}`;
}
