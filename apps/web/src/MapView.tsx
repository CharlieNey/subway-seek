import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import * as maplibregl from "maplibre-gl";
// MapLibre runs tile parsing in an ES-module worker that imports a sibling chunk
// (see vite.config.ts for how the build keeps them together).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef } from "react";
import { nowGameTime, useGame, type World } from "./game.ts";

maplibregl.setWorkerUrl(workerUrl);

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const TIMES_SQ: [number, number] = [-73.9873, 40.7553];
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

function linesGeoJSON({ ds }: World): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: ds.shapes.map((shape) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: shape.points },
      properties: { color: `#${ds.routes[shape.route]?.color ?? "808183"}` },
    })),
  };
}

function stationsGeoJSON({ ds }: World): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: ds.complexes.map((c, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      properties: { complex: i, name: c.name },
    })),
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function stationPopupHtml({ ds }: World, complex: number): string {
  const c = ds.complexes[complex];
  if (!c) return "";
  const bullets = c.routes
    .map((letter) => ds.routes.find((r) => r.letter === letter))
    .filter((r) => r !== undefined)
    .map(
      (r) =>
        `<span style="display:inline-flex;width:18px;height:18px;border-radius:9px;align-items:center;justify-content:center;font:700 10px system-ui;background:#${r.color};color:#${r.textColor};margin-right:2px">${escapeHtml(r.display)}</span>`,
    )
    .join("");
  return `<div style="font:600 12px system-ui;margin-bottom:4px">${escapeHtml(c.name)}</div><div>${bullets}</div>`;
}

/** The map: route lines, stations, every running train (10×/s), and you (every frame). */
export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const world = useGame((s) => s.world);

  useEffect(() => {
    if (!container.current || !world) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: TIMES_SQ,
      zoom: 13.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.on("error", (e) => console.error(`map: ${e.error?.message ?? String(e.error)}`));
    if (import.meta.env.DEV) (window as unknown as { __map: maplibregl.Map }).__map = map;
    let raf = 0;
    let lastTrains = 0;
    // You: a DOM marker, moved every frame without re-tiling any map data.
    const meEl = document.createElement("div");
    meEl.className =
      "h-4 w-4 rounded-full border-[3px] border-white bg-stone-900 shadow-[0_0_0_7px_rgba(17,24,39,0.18)]";
    const me = new maplibregl.Marker({ element: meEl }).setLngLat(TIMES_SQ).addTo(map);

    map.on("load", () => {
      map.addSource("lines", { type: "geojson", data: linesGeoJSON(world) });
      map.addLayer({
        id: "lines",
        type: "line",
        source: "lines",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 15, 4],
          "line-opacity": 0.8,
        },
      });
      map.addSource("stations", { type: "geojson", data: stationsGeoJSON(world) });
      map.addLayer({
        id: "stations",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 15, 5],
          "circle-color": "#ffffff",
          "circle-stroke-color": "#1f2937",
          "circle-stroke-width": 1.2,
        },
      });
      map.addLayer({
        id: "station-labels",
        type: "symbol",
        source: "stations",
        minzoom: 13.5,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: { "text-color": "#374151", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
      });
      map.addSource("trains", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "trains",
        type: "circle",
        source: "trains",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2, 15, 4.5],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });
      const trainsSource = map.getSource("trains") as maplibregl.GeoJSONSource;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const t = nowGameTime();
        if (t === null) return;
        const now = performance.now();
        if (now - lastTrains > 100) {
          lastTrains = now;
          const features: Feature<Point>[] = [];
          for (const i of world.geo.runningTrips(t)) {
            const p = world.geo.trainPosition(i, t);
            const route = world.ds.routes[world.ds.trips[i]?.route ?? -1];
            if (p && route) {
              features.push({
                type: "Feature",
                geometry: { type: "Point", coordinates: p },
                properties: { color: `#${route.color}` },
              });
            }
          }
          trainsSource.setData({ type: "FeatureCollection", features });
        }
        const { state, follow } = useGame.getState();
        if (state) {
          const p = world.geo.playerPosition(state, t);
          me.setLngLat(p);
          if (follow) map.setCenter(p);
        }
      };
      tick();
    });

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    map.on("mouseenter", "stations", (e) => {
      const f = e.features?.[0];
      if (f?.geometry.type !== "Point") return;
      map.getCanvas().style.cursor = "pointer";
      popup
        .setLngLat(f.geometry.coordinates as [number, number])
        .setHTML(stationPopupHtml(world, Number(f.properties?.complex)))
        .addTo(map);
    });
    map.on("mouseleave", "stations", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("dragstart", () => useGame.getState().setFollow(false));

    return () => {
      cancelAnimationFrame(raf);
      me.remove();
      popup.remove();
      map.remove();
    };
  }, [world]);

  return <div ref={container} className="h-full w-full" />;
}
