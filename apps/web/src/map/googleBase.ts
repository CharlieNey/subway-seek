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
import { createVeil, eastOf } from "./baseMap.ts";
import { loadGoogleMaps, onGoogleAuthFailure } from "./loadGoogle.ts";
import mosaicStyle from "./mosaicStyle.json";
import { zoomHold } from "./zoomHold.ts";

/**
 * The Mosaic base map as a legacy style array (mosaicStyle.json, the same design as the
 * cloud style), for this raster map with no Map ID. Switching to the vector Map ID waits on
 * a Safari check (DESIGN.md, Look: base map).
 */
const STYLES = mosaicStyle as google.maps.MapTypeStyle[];

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
  const zoom = zoomHold(container);
  const failures: ((reason: string) => void)[] = [];
  let rejectReady: (err: Error) => void = () => {};
  const stopAuth = onGoogleAuthFailure(() => {
    const reason = "Google Maps rejected the API key";
    rejectReady(new Error(reason));
    for (const cb of failures) cb(reason);
  });

  // The search area's blur, in the map pane: under deck.gl's canvas (in the overlay layer)
  // and moving with the map as it pans.
  let veilCircle: { lat: number; lon: number; meters: number } | null = null;
  let veil: ReturnType<typeof createVeil> | null = null;
  let veilView: google.maps.OverlayView = null as unknown as google.maps.OverlayView;
  const makeVeilView = () => {
    const v = new google.maps.OverlayView();
    const holder = document.createElement("div");
    Object.assign(holder.style, {
      position: "absolute",
      left: "-4000px",
      top: "-4000px",
      width: "8000px",
      height: "8000px",
    });
    v.onAdd = () => {
      v.getPanes()?.mapPane.appendChild(holder);
      veil = createVeil(holder, (c) => {
        const proj = v.getProjection();
        const center = proj.fromLatLngToDivPixel(new google.maps.LatLng(c.lat, c.lon));
        const [elon, elat] = eastOf(c);
        const edge = proj.fromLatLngToDivPixel(new google.maps.LatLng(elat, elon));
        if (!center || !edge) return { x: 0, y: 0, r: 0 };
        return { x: center.x + 4000, y: center.y + 4000, r: Math.abs(edge.x - center.x) };
      });
      veil.set(veilCircle);
    };
    v.draw = () => veil?.update();
    v.onRemove = () => holder.remove();
    return v;
  };

  const loaded = loadGoogleMaps()
    .then(() => google.maps.importLibrary("maps"))
    .then(() => {
      if (removed) return;
      veilView = makeVeilView();
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
      listeners.push(map.addListener("idle", zoom.release));
      veilView.setMap(map);
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
  const ready = new Promise<void>((resolve, reject) => {
    rejectReady = reject;
    loaded.then(resolve, reject);
  });

  return {
    ready,
    onFailure: (cb) => failures.push(cb),
    setVeil: (c) => {
      veilCircle = c;
      veil?.set(c);
    },
    setLayers: (layers: Layer[]) => overlay.setProps({ layers }),
    setCenter: (p) =>
      whenMap((m) => {
        if (!zoom.held()) m.setCenter({ lat: p[1], lng: p[0] });
      }),
    flyTo: (p, zoom) =>
      whenMap((m) => {
        m.setZoom(zoom);
        m.panTo({ lat: p[1], lng: p[0] });
      }),
    fitBounds: (sw, ne) =>
      whenMap((m) => m.fitBounds({ south: sw[1], west: sw[0], north: ne[1], east: ne[0] }, 80)),
    getZoom: () => map?.getZoom() ?? 13.5,
    onUserDrag: (cb) => whenMap((m) => listeners.push(m.addListener("dragstart", cb))),
    onClick: (cb) =>
      whenMap((m) =>
        listeners.push(
          m.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (e.latLng) cb([e.latLng.lng(), e.latLng.lat()]);
          }),
        ),
      ),
    remove: () => {
      removed = true;
      stopAuth();
      veilView?.setMap?.(null);
      for (const l of listeners) l.remove();
      zoom.remove();
      overlay.finalize();
      container.replaceChildren();
    },
  };
}
