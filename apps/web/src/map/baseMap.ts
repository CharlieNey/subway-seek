/**
 * The base map behind the game's deck.gl layers, behind a small interface so it can
 * be swapped. Today: MapLibre + OpenFreeMap tiles. Next (needs Google billing on):
 * Google Maps JS, which Google's terms require once Street View is on screen.
 */
import type { Layer } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { LonLat } from "@stand-clear/engine";
import * as maplibregl from "maplibre-gl";
// MapLibre runs tile parsing in an ES-module worker that imports a sibling chunk
// (see vite.config.ts for how the build keeps them together).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

maplibregl.setWorkerUrl(workerUrl);

export interface BaseMap {
  /** Resolves once the map can draw (it only paints while the page is visible). */
  ready: Promise<void>;
  /** Replace the deck.gl layers drawn over the map. */
  setLayers(layers: Layer[]): void;
  setCenter(p: LonLat): void;
  flyTo(p: LonLat, zoom: number): void;
  fitBounds(sw: LonLat, ne: LonLat): void;
  getZoom(): number;
  /** Called when the player starts dragging the map (stop following them). */
  onUserDrag(cb: () => void): void;
  remove(): void;
}

const STYLE = "https://tiles.openfreemap.org/styles/positron";

export function createMapLibreBase(
  container: HTMLElement,
  center: LonLat,
  getTooltip: (info: { object?: unknown }) => { html: string } | null,
): BaseMap {
  const map = new maplibregl.Map({
    container,
    style: STYLE,
    center,
    zoom: 13.5,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  map.on("error", (e) => console.error(`map: ${e.error?.message ?? String(e.error)}`));
  const overlay = new MapboxOverlay({ interleaved: false, layers: [], getTooltip });
  map.addControl(overlay as unknown as maplibregl.IControl);
  if (import.meta.env.DEV) (window as unknown as { __map: maplibregl.Map }).__map = map;

  return {
    ready: new Promise((resolve) => map.on("load", () => resolve())),
    setLayers: (layers) => overlay.setProps({ layers }),
    setCenter: (p) => map.setCenter(p),
    flyTo: (p, zoom) => map.flyTo({ center: p, zoom }),
    fitBounds: (sw, ne) => map.fitBounds([sw, ne], { padding: 80, maxZoom: 15, duration: 600 }),
    getZoom: () => map.getZoom(),
    onUserDrag: (cb) => map.on("dragstart", cb),
    remove: () => map.remove(),
  };
}
