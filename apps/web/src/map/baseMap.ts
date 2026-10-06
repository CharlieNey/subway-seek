/**
 * The base map behind the game's deck.gl layers, behind a small interface so it can
 * be swapped. Default: Google Maps (googleBase.ts), which Google's terms require once
 * Street View is on screen. Fallback: MapLibre + OpenFreeMap tiles — used when no
 * Google key is set, or with VITE_MAP_PROVIDER=maplibre (saves Google map loads in dev).
 */
import type { Layer } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { LonLat } from "@stand-clear/engine";
import * as maplibregl from "maplibre-gl";
// MapLibre runs tile parsing in an ES-module worker that imports a sibling chunk
// (see vite.config.ts for how the build keeps them together).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { zoomHold } from "./zoomHold.ts";

maplibregl.setWorkerUrl(workerUrl);

export interface BaseMap {
  /**
   * Resolves once the map can draw (it only paints while the page is visible). Rejects
   * if it can't load at all.
   */
  ready: Promise<void>;
  /** Called if the map fails after loading (Google can reject the key late). */
  onFailure(cb: (reason: string) => void): void;
  /** Replace the deck.gl layers drawn over the map. */
  setLayers(layers: Layer[]): void;
  setCenter(p: LonLat): void;
  flyTo(p: LonLat, zoom: number): void;
  fitBounds(sw: LonLat, ne: LonLat): void;
  getZoom(): number;
  /** Called when the player starts dragging the map (stop following them). */
  onUserDrag(cb: () => void): void;
  /** Called with [lon, lat] when the player clicks the map. */
  onClick(cb: (p: LonLat) => void): void;
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
  // Before the style loads, an error means no map; after, it's a tile here and there.
  let loaded = false;
  let fail: (reason: string) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    fail = (reason) => {
      if (!loaded) reject(new Error(reason));
    };
    map.on("load", () => {
      loaded = true;
      resolve();
    });
  });
  const timeout = setTimeout(() => fail("The map tiles didn't arrive in 20 s"), 20_000);
  map.on("load", () => clearTimeout(timeout));
  map.on("error", (e) => {
    const reason = e.error?.message ?? String(e.error);
    console.error(`map: ${reason}`);
    fail(reason);
  });
  const overlay = new MapboxOverlay({ interleaved: false, layers: [], getTooltip });
  map.addControl(overlay as unknown as maplibregl.IControl);
  if (import.meta.env.DEV) (window as unknown as { __map: maplibregl.Map }).__map = map;
  const zoom = zoomHold(container);
  map.on("moveend", zoom.release);

  return {
    ready,
    onFailure: () => {},
    setLayers: (layers) => overlay.setProps({ layers }),
    setCenter: (p) => {
      if (!zoom.held()) map.setCenter(p);
    },
    flyTo: (p, zoom) => map.flyTo({ center: p, zoom }),
    fitBounds: (sw, ne) => map.fitBounds([sw, ne], { padding: 80, maxZoom: 15, duration: 600 }),
    getZoom: () => map.getZoom(),
    onUserDrag: (cb) => map.on("dragstart", cb),
    onClick: (cb) => map.on("click", (e) => cb([e.lngLat.lng, e.lngLat.lat])),
    remove: () => {
      clearTimeout(timeout);
      zoom.remove();
      map.remove();
    },
  };
}

export type MapProvider = "google" | "maplibre";

export function chooseProvider(): MapProvider {
  // Dev only: ?map=maplibre (or google) picks the provider per tab, for headless checks.
  const asked = import.meta.env.DEV ? new URLSearchParams(location.search).get("map") : null;
  if (asked === "maplibre" || asked === "google") return asked;
  const forced = import.meta.env.VITE_MAP_PROVIDER as string | undefined;
  if (forced === "maplibre" || forced === "google") return forced;
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? "google" : "maplibre";
}
