/**
 * Google Maps as the base map, with the game's deck.gl layers drawn by
 * GoogleMapsOverlay on its own canvas above the map. Google's terms require a Google
 * map whenever Street View is on screen, so this is the default.
 *
 * - Not interleaved: interleaved rendering into Google's vector map drew nothing on
 *   WebKit/Safari.
 * - Raster map + JSON styles: hides POIs and Google's own transit icons (which clash
 *   with our stations) without needing a cloud map style. A cloud style + map ID can
 *   replace this later.
 *
 * Billing: one "map load" per Map created — we create one per page and reuse it.
 */
import type { Layer } from "@deck.gl/core";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import type { LonLat } from "@stand-clear/engine";
import type { BaseMap } from "./baseMap.ts";
import { loadGoogleMaps } from "./loadGoogle.ts";

/** Quiet base map: no POIs or transit icons, muted colors, so the game's layers read. */
const STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "geometry", stylers: [{ saturation: -85 }, { lightness: 8 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d6dde0" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b6b6b" }] },
];

export function createGoogleBase(
  container: HTMLElement,
  center: LonLat,
  getTooltip: (info: { object?: unknown }) => { html: string } | null,
): BaseMap {
  let map: google.maps.Map | null = null;
  const overlay = new GoogleMapsOverlay({ interleaved: false, layers: [], getTooltip });
  const pending: (() => void)[] = [];
  const listeners: google.maps.MapsEventListener[] = [];
  let removed = false;
  const whenMap = (fn: (m: google.maps.Map) => void) => {
    if (map) fn(map);
    else pending.push(() => map && fn(map));
  };

  const ready = loadGoogleMaps()
    .then(() => google.maps.importLibrary("maps"))
    .then(() => {
      if (removed) return;
      map = new google.maps.Map(container, {
        center: { lat: center[1], lng: center[0] },
        zoom: 14,
        styles: STYLES,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: "greedy",
      });
      overlay.setMap(map);
      if (import.meta.env.DEV) {
        const w = window as unknown as Record<string, unknown>;
        w.__gmap = map;
        w.__overlay = overlay;
      }
      for (const fn of pending.splice(0)) fn();
      return new Promise<void>((resolve) => {
        google.maps.event.addListenerOnce(map as google.maps.Map, "idle", () => resolve());
      });
    });

  return {
    ready,
    setLayers: (layers: Layer[]) => overlay.setProps({ layers }),
    setCenter: (p) => whenMap((m) => m.setCenter({ lat: p[1], lng: p[0] })),
    flyTo: (p, zoom) =>
      whenMap((m) => {
        m.setZoom(zoom);
        m.panTo({ lat: p[1], lng: p[0] });
      }),
    fitBounds: (sw, ne) =>
      whenMap((m) => m.fitBounds({ south: sw[1], west: sw[0], north: ne[1], east: ne[0] }, 80)),
    getZoom: () => map?.getZoom() ?? 13.5,
    onUserDrag: (cb) => whenMap((m) => listeners.push(m.addListener("dragstart", cb))),
    remove: () => {
      removed = true;
      for (const l of listeners) l.remove();
      overlay.finalize();
      container.replaceChildren();
    },
  };
}
