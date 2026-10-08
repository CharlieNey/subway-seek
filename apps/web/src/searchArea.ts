/**
 * Your search on foot, shared by the map (circle + shading) and the Ask tab (what's
 * left). Recomputed when the round changes, and every few game-seconds while walking.
 */
import {
  type LonLat,
  possibleSpots,
  resolve,
  type SoloView,
  ZONE_RADIUS_M,
} from "@stand-clear/engine";
import type { World } from "./game.ts";
// Only the type from the layers module: importing its code would pull deck.gl into the
// homepage, which shares this module through the live map.
import type { SearchScene } from "./map/layers.ts";
import { ring } from "./map/shapes.ts";

/** The station you're on foot around (standing, walking, or coming up), if any. */
function searchComplex(world: World, view: SoloView, t: number): number | null {
  if (view.result || !view.hasSpot) return null;
  const s = resolve(view.seeker, t, world.idx);
  if (s.kind === "street") return s.complex;
  if (s.kind === "walking" && s.dest.kind === "street") return s.dest.complex;
  return null;
}

let cache: { view: SoloView; complex: number; tick: number; scene: SearchScene } | null = null;

/** Your search circle and the places in it the hider could still be. */
export function searchScene(world: World, view: SoloView, t: number): SearchScene | null {
  const complex = searchComplex(world, view, t);
  const c = complex === null ? undefined : world.ds.complexes[complex];
  if (complex === null || !c) return null;
  const tick = Math.floor(t / 3);
  if (cache && cache.view === view && cache.complex === complex && cache.tick === tick) {
    return cache.scene;
  }
  const possible = possibleSpots(world.ds, c, view.asked, view.candidates, view.footpath, t);
  // Standing still, nothing clears: keep the same scene, so the map has nothing to redraw.
  if (cache && cache.complex === complex && samePlaces(cache.scene.possible, possible)) {
    cache = { view, complex, tick, scene: cache.scene };
    return cache.scene;
  }
  const scene: SearchScene = {
    complex,
    ring: ring({ lat: c.lat, lon: c.lon }, ZONE_RADIUS_M),
    possible: possible.map((p) => [p.lon, p.lat] as LonLat),
  };
  cache = { view, complex, tick, scene };
  return scene;
}

function samePlaces(a: LonLat[], b: { lat: number; lon: number }[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i] as LonLat;
    const q = b[i] as { lat: number; lon: number };
    if (p[0] !== q.lon || p[1] !== q.lat) return false;
  }
  return true;
}
