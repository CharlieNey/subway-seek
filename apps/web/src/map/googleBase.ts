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
import type { LonLat } from "@subway-seek/engine";
import type { BaseMap } from "./baseMap.ts";
import { createVeil, eastOf, fitZoom } from "./baseMap.ts";
import { loadGoogleMaps, onGoogleAuthFailure } from "./loadGoogle.ts";
import mosaicStyle from "./mosaicStyle.json";
import { untabOverlay } from "./untabOverlay.ts";
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
  let stopUntab = () => {};
  const whenMap = (fn: (m: google.maps.Map) => void) => {
    if (map) fn(map);
    else pending.push(() => map && fn(map));
  };
  const zoom = zoomHold(container);
  const failures: ((reason: string) => void)[] = [];
  let rejectReady: (err: Error) => void = () => {};
  const fail = (reason: string) => {
    rejectReady(new Error(reason));
    for (const cb of failures) cb(reason);
  };
  const stopAuth = onGoogleAuthFailure(() => fail("Google Maps rejected the API key"));
  // A refused map (a daily quota spent, say) draws Google's own error box in the
  // container rather than calling gm_authFailure: watch for it.
  const errorBox = new MutationObserver(() => {
    if (!container.querySelector(".gm-err-container, .gm-err-content")) return;
    errorBox.disconnect();
    fail("Google Maps refused to draw (a daily quota or the key)");
  });
  errorBox.observe(container, { childList: true, subtree: true });

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
      stopUntab = untabOverlay(container);
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
    flyTo: (p, z) =>
      whenMap((m) => {
        zoom.hold();
        m.setZoom(z);
        m.panTo({ lat: p[1], lng: p[0] });
      }),
    // Following you recenters every frame, which would cancel Google's animated fit.
    fitBounds: (sw, ne, padding = 80) =>
      whenMap((m) => {
        zoom.hold();
        m.fitBounds({ south: sw[1], west: sw[0], north: ne[1], east: ne[0] }, padding);
      }),
    getZoom: () => map?.getZoom() ?? 13.5,
    // Instant, so following you can't cancel it; raster maps take whole zoom levels.
    frameCircle: (c, meters, padding = 12) =>
      whenMap((m) => {
        const d = m.getDiv();
        const z = Math.floor(
          fitZoom(c.lat, meters, Math.min(d.clientWidth, d.clientHeight) - 2 * padding),
        );
        // moveCamera jumps: setZoom animates, and following you (recentering every frame)
        // cuts that animation short, leaving the picture at the old scale while getZoom()
        // reports the new one.
        zoom.hold();
        m.moveCamera({ center: { lat: c.lat, lng: c.lon }, zoom: z });
      }),
    onUserDrag: (cb) => whenMap((m) => listeners.push(m.addListener("dragstart", cb))),
    onClick: (cb) =>
      whenMap((m) =>
        listeners.push(
          m.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (e.latLng) cb([e.latLng.lng(), e.latLng.lat()]);
          }),
        ),
      ),
    onPointer: (cb) =>
      whenMap((m) => {
        listeners.push(
          m.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
            const dom = e.domEvent as MouseEvent | undefined;
            if (!e.latLng || !dom) return;
            const r = container.getBoundingClientRect();
            cb({
              at: [e.latLng.lng(), e.latLng.lat()],
              x: dom.clientX - r.left,
              y: dom.clientY - r.top,
            });
          }),
          m.addListener("mouseout", () => cb(null)),
        );
      }),
    remove: () => {
      stopUntab();
      removed = true;
      stopAuth();
      errorBox.disconnect();
      veilView?.setMap?.(null);
      for (const l of listeners) l.remove();
      zoom.remove();
      overlay.finalize();
      container.replaceChildren();
    },
  };
}
