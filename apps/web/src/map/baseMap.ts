/**
 * The base map behind the game's deck.gl layers, behind a small interface so it can
 * be swapped. Default: Google Maps (googleBase.ts), which Google's terms require once
 * Street View is on screen. The free map: MapLibre + OpenFreeMap tiles, used whenever the
 * street endgame is off (streetMode.ts): no Google key, VITE_MAP_PROVIDER=maplibre (saves
 * Google map loads in dev), or Google refused the map.
 */
import type { Layer } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { LonLat } from "@stand-clear/engine";
import * as maplibregl from "maplibre-gl";
// MapLibre runs tile parsing in an ES-module worker that imports a sibling chunk
// (see vite.config.ts for how the build keeps them together).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { streetOn } from "../streetMode.ts";
import { fitZoom } from "./shapes.ts";
import { zoomHold } from "./zoomHold.ts";

maplibregl.setWorkerUrl(workerUrl);

/** Pixels to keep clear on each side, or one number for all four. */
export type Padding = number | { top: number; right: number; bottom: number; left: number };

export interface BaseMap {
  /**
   * Resolves once the map can draw (it only paints while the page is visible). Rejects
   * if it can't load at all.
   */
  ready: Promise<void>;
  /** Called if the map fails after loading (Google can reject the key late). */
  onFailure(cb: (reason: string) => void): void;
  /**
   * Blur and veil the map outside a circle, under the game's own layers (DESIGN.md, Street
   * endgame: the search area). Null lifts it.
   */
  setVeil(circle: { lat: number; lon: number; meters: number } | null): void;
  /** Replace the deck.gl layers drawn over the map. */
  setLayers(layers: Layer[]): void;
  setCenter(p: LonLat): void;
  flyTo(p: LonLat, zoom: number): void;
  /** Frame a box; `padding` in px (default 80). */
  fitBounds(sw: LonLat, ne: LonLat, padding?: Padding): void;
  /** Frame a circle so it nearly fills the map, at once (the search area on foot). */
  frameCircle(center: { lat: number; lon: number }, meters: number, padding?: number): void;
  getZoom(): number;
  /** Called when the player starts dragging the map (stop following them). */
  onUserDrag(cb: () => void): void;
  /** Called with [lon, lat] when the player clicks the map. */
  onClick(cb: (p: LonLat) => void): void;
  /** The pointer over the map, as [lon, lat] and container pixels; null when it leaves. */
  onPointer(cb: (p: { at: LonLat; x: number; y: number } | null) => void): void;
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
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  // The dev map in the Mosaic's colors, so it reads like the Google one.
  map.on("style.load", () => mosaicPositron(map));
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
  // A background tab draws nothing, so "load" can't fire there: the 20 s count on screen.
  let timeout: ReturnType<typeof setTimeout>;
  const arm = () => {
    timeout = setTimeout(() => {
      if (document.hidden) document.addEventListener("visibilitychange", arm, { once: true });
      else fail("The map tiles didn't arrive in 20 s");
    }, 20_000);
  };
  arm();
  map.on("load", () => {
    clearTimeout(timeout);
    document.removeEventListener("visibilitychange", arm);
  });
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

  const veil = createVeil(map.getCanvasContainer(), (c) => {
    const center = map.project([c.lon, c.lat]);
    const edge = map.project(eastOf(c));
    return { x: center.x, y: center.y, r: Math.hypot(edge.x - center.x, edge.y - center.y) };
  });
  map.on("move", veil.update);
  map.on("resize", veil.update);

  return {
    ready,
    onFailure: () => {},
    setVeil: veil.set,
    setLayers: (layers) => overlay.setProps({ layers }),
    setCenter: (p) => {
      if (!zoom.held()) map.setCenter(p);
    },
    flyTo: (p, zoom) => map.flyTo({ center: p, zoom }),
    fitBounds: (sw, ne, padding = 80) => {
      zoom.hold();
      map.fitBounds([sw, ne], { padding, maxZoom: 17, duration: 600 });
    },
    getZoom: () => map.getZoom(),
    frameCircle: (c, meters, padding = 12) => {
      const el = map.getContainer();
      // MapLibre's zoom counts 512 px tiles: one level below Google's.
      const z = fitZoom(c.lat, meters, Math.min(el.clientWidth, el.clientHeight) - 2 * padding) - 1;
      zoom.hold();
      map.jumpTo({ center: [c.lon, c.lat], zoom: z });
    },
    onUserDrag: (cb) => map.on("dragstart", cb),
    onClick: (cb) => map.on("click", (e) => cb([e.lngLat.lng, e.lngLat.lat])),
    onPointer: (cb) => {
      map.on("mousemove", (e) =>
        cb({ at: [e.lngLat.lng, e.lngLat.lat], x: e.point.x, y: e.point.y }),
      );
      map.on("mouseout", () => cb(null));
    },
    remove: () => {
      clearTimeout(timeout);
      zoom.remove();
      map.remove();
    },
  };
}

export type MapProvider = "google" | "maplibre";

/**
 * Google's map while the street endgame is on, the free map otherwise (streetMode.ts:
 * no key, VITE_MAP_PROVIDER=maplibre or dev's ?map=maplibre, or Google refused today).
 */
export function chooseProvider(): MapProvider {
  return streetOn() ? "google" : "maplibre";
}

/** The point `meters` east of a circle's center, to measure its radius in pixels. */
export function eastOf(c: { lat: number; lon: number; meters: number }): [number, number] {
  const kx = 111_195 * Math.cos((c.lat * Math.PI) / 180);
  return [c.lon + c.meters / kx, c.lat];
}

/**
 * A blur with a circular hole, laid over the base map and under the game's layers:
 * `backdrop-filter` blurs what's behind it, a radial mask keeps the circle sharp, and a
 * light glaze veils the rest. `place` says where the circle is, in the element's pixels.
 */
export function createVeil(
  parent: HTMLElement,
  place: (c: { lat: number; lon: number; meters: number }) => { x: number; y: number; r: number },
) {
  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    background: "rgb(244 239 227 / 0.42)",
    backdropFilter: "blur(3px)",
    webkitBackdropFilter: "blur(3px)",
    display: "none",
    zIndex: "1",
  });
  parent.appendChild(el);
  let circle: { lat: number; lon: number; meters: number } | null = null;
  let hide: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    if (!circle) return;
    const { x, y, r } = place(circle);
    const mask = `radial-gradient(circle at ${x}px ${y}px, transparent ${r - 0.5}px, #000 ${r + 0.5}px)`;
    el.style.maskImage = mask;
    el.style.webkitMaskImage = mask;
  };
  const reduced = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    el,
    update,
    /**
     * The circle draws first (400 ms), then the outside blurs and takes its veil (600 ms,
     * decelerating). Going back down reverses it (DESIGN.md, Motion: Search area).
     */
    set(c: { lat: number; lon: number; meters: number } | null) {
      clearTimeout(hide);
      if (c) {
        circle = c;
        update();
        el.style.display = "block";
        el.style.transition = reduced()
          ? "none"
          : "opacity 600ms cubic-bezier(0.2, 0.7, 0.2, 1) 400ms";
        el.style.opacity = "0";
        requestAnimationFrame(() => {
          el.style.opacity = "1";
        });
      } else {
        el.style.transition = reduced() ? "none" : "opacity 600ms cubic-bezier(0.2, 0.7, 0.2, 1)";
        el.style.opacity = "0";
        hide = setTimeout(
          () => {
            circle = null;
            el.style.display = "none";
          },
          reduced() ? 0 : 600,
        );
      }
    },
  };
}

/** Positron's layers recolored to the Mosaic base map (DESIGN.md, Look: base map). */
function mosaicPositron(map: maplibregl.Map) {
  const set = (id: string, prop: string, value: string) => {
    try {
      map.setPaintProperty(id, prop as never, value as never);
    } catch {
      // A layer this style doesn't have.
    }
  };
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id;
    if (layer.type === "background") set(id, "background-color", "#efeadf");
    else if (layer.type === "fill") {
      if (/water/.test(id)) set(id, "fill-color", "#cbd6d6");
      else if (/park|grass|wood|landcover|landuse_park/.test(id)) set(id, "fill-color", "#dce1cc");
      else if (/building/.test(id)) set(id, "fill-color", "#e6dfcf");
      else set(id, "fill-color", "#efeadf");
    } else if (layer.type === "line") {
      if (/water|river|waterway/.test(id)) set(id, "line-color", "#cbd6d6");
      else if (/rail|transit/.test(id)) map.setLayoutProperty(id, "visibility", "none");
      else if (/boundary|admin/.test(id)) map.setLayoutProperty(id, "visibility", "none");
      else if (/casing/.test(id)) set(id, "line-color", "#e2d9c4");
      else if (/motorway|highway|trunk/.test(id)) set(id, "line-color", "#f1e7d2");
      else set(id, "line-color", "#fbf8f1");
    } else if (layer.type === "symbol") {
      if (/poi|transit|rail|station|airport|aeroway/.test(id)) {
        map.setLayoutProperty(id, "visibility", "none");
      } else {
        set(id, "text-color", "#8a8072");
        set(id, "text-halo-color", "#f4efe3");
      }
    }
  }
}

export { fitZoom } from "./shapes.ts";
