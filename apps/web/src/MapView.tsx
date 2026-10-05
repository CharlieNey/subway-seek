import type { SoloView } from "@stand-clear/engine";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import * as maplibregl from "maplibre-gl";
// MapLibre runs tile parsing in an ES-module worker that imports a sibling chunk
// (see vite.config.ts for how the build keeps them together).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef } from "react";
import { nowGameTime, useGame, type World } from "./game.ts";
import { pathUntil, stepReplay, useReplay } from "./replay.ts";

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

type StationStatus = "candidate" | "out" | "hider" | "start";

function stationsGeoJSON({ ds }: World, view: SoloView | null): FeatureCollection<Point> {
  const candidates = new Set(view?.candidates ?? []);
  const hubComplex = view ? ds.stations[view.hub]?.complex : undefined;
  const status = (i: number): StationStatus => {
    if (view?.hider === i) return "hider";
    if (i === hubComplex) return "start";
    if (!view || candidates.has(i)) return "candidate";
    return "out";
  };
  return {
    type: "FeatureCollection",
    features: ds.complexes.map((c, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      properties: { complex: i, name: c.name, status: status(i) },
    })),
  };
}

/** A circle as a polygon ring (fine at city scale). */
function circle(lat: number, lon: number, meters: number): [number, number][] {
  const dLat = meters / 110_540;
  const dLon = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
  });
}

/** Radar questions as circles around where they were asked from. */
function radarGeoJSON(view: SoloView | null): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: (view?.asked ?? []).flatMap((a) =>
      a.q.kind === "radar"
        ? [
            {
              type: "Feature" as const,
              geometry: {
                type: "Polygon" as const,
                coordinates: [circle(a.ctx.origin.lat, a.ctx.origin.lon, a.q.miles * 1609.344)],
              },
              properties: { yes: a.answer === true },
            },
          ]
        : [],
    ),
  };
}

function thermometerGeoJSON(view: SoloView | null): FeatureCollection<Point> {
  const b = view?.thermometer;
  return {
    type: "FeatureCollection",
    features: b
      ? [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [b.lon, b.lat] },
            properties: {},
          },
        ]
      : [],
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
    let unsubscribe = () => {};
    // You: a DOM marker, moved every frame without re-tiling any map data.
    const meEl = document.createElement("div");
    meEl.className =
      "h-4 w-4 rounded-full border-[3px] border-white bg-stone-900 shadow-[0_0_0_7px_rgba(17,24,39,0.18)]";
    const me = new maplibregl.Marker({ element: meEl }).setLngLat(TIMES_SQ).addTo(map);
    // The bot hider, shown only during the replay.
    const hiderEl = document.createElement("div");
    hiderEl.className = "h-4 w-4 rounded-full border-[3px] border-white bg-red-600 shadow";
    const hiderMarker = new maplibregl.Marker({ element: hiderEl }).setLngLat(TIMES_SQ);
    // Frame both routes when a replay opens.
    const unsubscribeReplay = useReplay.subscribe((r, prev) => {
      if (!r.active || prev.active) return;
      useGame.getState().setFollow(false);
      const pts = [...r.hider, ...r.seeker].map((s) => s.p);
      if (pts.length === 0) return;
      const lons = pts.map((p) => p[0]);
      const lats = pts.map((p) => p[1]);
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 80, maxZoom: 15, duration: 600 },
      );
    });

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
      const view0 = useGame.getState().view;
      map.addSource("radar", { type: "geojson", data: radarGeoJSON(view0) });
      map.addLayer({
        id: "radar-fill",
        type: "fill",
        source: "radar",
        filter: ["==", ["get", "yes"], true],
        paint: { "fill-color": "#f59e0b", "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: "radar-line",
        type: "line",
        source: "radar",
        paint: {
          "line-color": ["case", ["get", "yes"], "#d97706", "#78716c"],
          "line-width": 1.5,
          "line-dasharray": [3, 2],
        },
      });
      map.addSource("stations", { type: "geojson", data: stationsGeoJSON(world, view0) });
      map.addLayer({
        id: "stations",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            ["match", ["get", "status"], "out", 1.2, "hider", 5, 2.5],
            15,
            ["match", ["get", "status"], "out", 3, "hider", 10, 6.5],
          ],
          "circle-color": [
            "match",
            ["get", "status"],
            "candidate",
            "#fbbf24",
            "hider",
            "#dc2626",
            "start",
            "#ffffff",
            "#e7e5e4",
          ],
          "circle-stroke-color": [
            "match",
            ["get", "status"],
            "candidate",
            "#92400e",
            "hider",
            "#7f1d1d",
            "start",
            "#1f2937",
            "#a8a29e",
          ],
          "circle-stroke-width": ["match", ["get", "status"], "out", 0.8, 1.5],
        },
      });
      map.addSource("thermometer", { type: "geojson", data: thermometerGeoJSON(view0) });
      map.addLayer({
        id: "thermometer",
        type: "circle",
        source: "thermometer",
        paint: {
          "circle-radius": 7,
          "circle-color": "#7c3aed",
          "circle-opacity": 0.25,
          "circle-stroke-color": "#7c3aed",
          "circle-stroke-width": 2,
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
      // Replay: both routes drawn up to replay time, plus where each question was asked.
      map.addSource("replay-paths", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "replay-paths",
        type: "line",
        source: "replay-paths",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["match", ["get", "who"], "hider", "#dc2626", "#111827"],
          "line-width": 4,
          "line-opacity": 0.85,
        },
      });
      map.addSource("replay-events", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "replay-events",
        type: "symbol",
        source: "replay-events",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-offset": [0, -1.4],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#111827", "text-halo-color": "#ffffff", "text-halo-width": 2 },
      });
      const trainsSource = map.getSource("trains") as maplibregl.GeoJSONSource;
      const pathsSource = map.getSource("replay-paths") as maplibregl.GeoJSONSource;
      const eventsSource = map.getSource("replay-events") as maplibregl.GeoJSONSource;
      let lastFrame = performance.now();
      let lastPaths = 0;
      let shownEvents = -1;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const now = performance.now();
        stepReplay(now - lastFrame);
        lastFrame = now;
        const replay = useReplay.getState();
        // While replaying, the whole map (trains included) shows replay time.
        const t = replay.active ? replay.t : nowGameTime();
        if (t === null) return;
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
        if (replay.active) {
          const seekerPath = pathUntil(replay.seeker, t);
          const hiderPath = pathUntil(replay.hider, t);
          const seekerHead = seekerPath.at(-1);
          const hiderHead = hiderPath.at(-1);
          if (seekerHead) me.setLngLat(seekerHead);
          if (hiderHead) hiderMarker.setLngLat(hiderHead).addTo(map);
          if (now - lastPaths > 50) {
            lastPaths = now;
            pathsSource.setData({
              type: "FeatureCollection",
              features: (
                [
                  ["hider", hiderPath],
                  ["seeker", seekerPath],
                ] as const
              )
                .filter(([, path]) => path.length > 1)
                .map(([who, path]) => ({
                  type: "Feature",
                  geometry: { type: "LineString", coordinates: path },
                  properties: { who },
                })),
            });
          }
          const asked = replay.events.filter((e) => e.t <= t);
          if (asked.length !== shownEvents) {
            shownEvents = asked.length;
            eventsSource.setData({
              type: "FeatureCollection",
              features: asked.map((e) => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: e.p },
                properties: { label: e.label },
              })),
            });
          }
          return;
        }
        if (shownEvents !== -1) {
          // Replay just closed: clear its layers.
          shownEvents = -1;
          hiderMarker.remove();
          pathsSource.setData(EMPTY);
          eventsSource.setData(EMPTY);
        }
        const { view, follow } = useGame.getState();
        if (view) {
          const p = world.geo.playerPosition(view.seeker, t);
          me.setLngLat(p);
          if (follow) map.setCenter(p);
        }
      };
      tick();

      // Re-shade stations and redraw question overlays when the round changes.
      unsubscribe = useGame.subscribe((st, prev) => {
        if (st.view === prev.view) return;
        (map.getSource("stations") as maplibregl.GeoJSONSource).setData(
          stationsGeoJSON(world, st.view),
        );
        (map.getSource("radar") as maplibregl.GeoJSONSource).setData(radarGeoJSON(st.view));
        (map.getSource("thermometer") as maplibregl.GeoJSONSource).setData(
          thermometerGeoJSON(st.view),
        );
        const hider = st.view?.hider;
        const c = hider !== null && hider !== undefined ? world.ds.complexes[hider] : undefined;
        if (c && prev.view?.hider == null) {
          useGame.getState().setFollow(false);
          map.flyTo({ center: [c.lon, c.lat], zoom: 14 });
        }
      });
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
      unsubscribe();
      unsubscribeReplay();
      me.remove();
      hiderMarker.remove();
      popup.remove();
      map.remove();
    };
  }, [world]);

  return <div ref={container} className="h-full w-full" />;
}
