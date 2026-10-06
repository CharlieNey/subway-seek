/**
 * Everything the game draws on the map, as deck.gl layers built from a snapshot of
 * the game ("scene"). deck.gl diffs layers by id, so rebuilding the list every frame is
 * cheap; static data keeps stable references so it's uploaded to the GPU once.
 * Works the same over MapLibre or Google Maps.
 */
import type { Layer } from "@deck.gl/core";
import { PathStyleExtension, type PathStyleExtensionProps } from "@deck.gl/extensions";
import { PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { type LonLat, offsetMeters, type SoloView } from "@stand-clear/engine";
import type { World } from "../game.ts";

export type RGBA = [number, number, number, number];

export const rgb = (hex: string, a = 255): RGBA => [
  Number.parseInt(hex.slice(0, 2), 16),
  Number.parseInt(hex.slice(2, 4), 16),
  Number.parseInt(hex.slice(4, 6), 16),
  a,
];

const INK = rgb("111827");
const WHITE = rgb("ffffff");
const HIDER_RED = rgb("dc2626");

export type StationStatus = "candidate" | "out" | "hider" | "start";

const STATION_STYLE: Record<StationStatus, { fill: RGBA; line: RGBA; radius: number }> = {
  candidate: { fill: rgb("fbbf24"), line: rgb("92400e"), radius: 30 },
  out: { fill: rgb("e7e5e4"), line: rgb("a8a29e"), radius: 18 },
  hider: { fill: HIDER_RED, line: rgb("7f1d1d"), radius: 60 },
  start: { fill: WHITE, line: rgb("1f2937"), radius: 30 },
};

/** Per-world data, built once. */
export interface StaticData {
  lines: { path: [number, number][]; color: RGBA }[];
  stations: { complex: number; position: LonLat; name: string }[];
  routeColors: RGBA[];
}

export function buildStatic({ ds }: World): StaticData {
  const routeColors = ds.routes.map((r) => rgb(r.color));
  return {
    routeColors,
    lines: ds.shapes.map((s) => ({ path: s.points, color: routeColors[s.route] ?? INK })),
    stations: ds.complexes.map((c, i) => ({
      complex: i,
      position: [c.lon, c.lat] as LonLat,
      name: c.name,
    })),
  };
}

/** Per-round data, rebuilt when the round's view changes. */
export interface RoundData {
  /** Bumped on every view change, to re-run color/size accessors. */
  version: number;
  status: StationStatus[];
  radar: { ring: [number, number][]; yes: boolean }[];
  thermometer: LonLat | null;
}

/** A ring of `meters` around (lat, lon), measured as the engine measures. */
export function circle(lat: number, lon: number, meters: number): [number, number][] {
  return Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    const p = offsetMeters({ lat, lon }, meters * Math.cos(a), meters * Math.sin(a));
    return [p.lon, p.lat];
  });
}

export function buildRound(world: World, view: SoloView | null, version: number): RoundData {
  const candidates = new Set(view?.candidates ?? []);
  const hubComplex = view ? world.ds.stations[view.hub]?.complex : undefined;
  return {
    version,
    status: world.ds.complexes.map((_, i): StationStatus => {
      if (view?.hider === i) return "hider";
      if (i === hubComplex) return "start";
      if (!view || candidates.has(i)) return "candidate";
      return "out";
    }),
    radar: (view?.asked ?? []).flatMap((a) =>
      a.q.kind === "radar"
        ? [
            {
              ring: circle(a.ctx.origin.lat, a.ctx.origin.lon, a.q.miles * 1609.344),
              yes: a.answer === true,
            },
          ]
        : [],
    ),
    thermometer: view?.thermometer ? [view.thermometer.lon, view.thermometer.lat] : null,
  };
}

export interface Train {
  position: LonLat;
  color: RGBA;
}

export interface ReplayScene {
  hiderPath: LonLat[];
  seekerPath: LonLat[];
  events: { position: LonLat; label: string }[];
}

/** Landmarks pinned while choosing a question about them; `nearest` is yours. */
export interface LandmarkScene {
  pins: { position: LonLat; name: string; nearest: boolean }[];
  /** Tentacles: the range around you. */
  range: [number, number][] | null;
}

/** On foot: your search circle, and where in it the hider could still be. */
export interface SearchScene {
  complex: number;
  ring: [number, number][];
  possible: LonLat[];
}

export interface Scene {
  data: StaticData;
  landmarks: LandmarkScene | null;
  search: SearchScene | null;
  round: RoundData;
  zoom: number;
  trains: Train[];
  /** You (the seeker), or the seeker's replay head. */
  me: LonLat | null;
  replay: ReplayScene | null;
}

type RadarRing = RoundData["radar"][number];
type StationDatum = StaticData["stations"][number];

/** Stations worth labelling at mid zoom; memoised per round so the layer's data is stable. */
const labelCache = new WeakMap<RoundData, StationDatum[]>();
function labelled(stations: StationDatum[], round: RoundData): StationDatum[] {
  let out = labelCache.get(round);
  if (!out) {
    out = stations.filter((s) => round.status[s.complex] !== "out");
    labelCache.set(round, out);
  }
  return out;
}

const dashes = new PathStyleExtension({ dash: true });

export function buildLayers(scene: Scene): Layer[] {
  const { data, round, replay } = scene;
  const layers: Layer[] = [
    new PolygonLayer<RadarRing>({
      id: "radar-fill",
      data: round.radar.filter((r) => r.yes),
      getPolygon: (r) => r.ring,
      getFillColor: rgb("f59e0b", 16),
      stroked: false,
      updateTriggers: { getPolygon: round.version },
    }),
    new PathLayer<RadarRing, PathStyleExtensionProps<RadarRing>>({
      id: "radar-line",
      data: round.radar,
      getPath: (r) => r.ring,
      getColor: (r) => (r.yes ? rgb("d97706") : rgb("78716c")),
      getWidth: 1.5,
      widthUnits: "pixels",
      getDashArray: [6, 4],
      dashUnits: "pixels",
      extensions: [dashes],
      updateTriggers: { getPath: round.version, getColor: round.version },
    }),
    new ScatterplotLayer<LonLat>({
      id: "search-possible",
      data: scene.search?.possible ?? [],
      getPosition: (p) => p,
      // A touch over half the 8 m grid, so the cells join up into an area.
      getRadius: 5,
      radiusUnits: "meters",
      getFillColor: rgb("f59e0b", 70),
      stroked: false,
    }),
    new PathLayer<[number, number][]>({
      id: "search-ring",
      data: scene.search ? [scene.search.ring] : [],
      getPath: (p) => p,
      getColor: INK,
      getWidth: 1.5,
      widthUnits: "pixels",
    }),
    new PathLayer<StaticData["lines"][number]>({
      id: "lines",
      data: data.lines,
      getPath: (l) => l.path,
      getColor: (l) => [l.color[0], l.color[1], l.color[2], 205],
      getWidth: 25,
      widthUnits: "meters",
      widthMinPixels: 1.5,
      widthMaxPixels: 5,
      capRounded: true,
      jointRounded: true,
    }),
    new ScatterplotLayer<StaticData["stations"][number]>({
      id: "stations",
      data: data.stations,
      pickable: true,
      getPosition: (s) => s.position,
      getRadius: (s) => STATION_STYLE[round.status[s.complex] ?? "out"].radius,
      radiusUnits: "meters",
      radiusMinPixels: 1.5,
      radiusMaxPixels: 8,
      stroked: true,
      getFillColor: (s) => STATION_STYLE[round.status[s.complex] ?? "out"].fill,
      getLineColor: (s) => STATION_STYLE[round.status[s.complex] ?? "out"].line,
      getLineWidth: 1.3,
      lineWidthUnits: "pixels",
      updateTriggers: {
        getRadius: round.version,
        getFillColor: round.version,
        getLineColor: round.version,
      },
    }),
    // Labels: no collision filtering (its shader fails on WebKit/Safari), so keep them
    // sparse: stations still in play from z13.5, every station from z15.
    new TextLayer<StationDatum>({
      id: "station-labels",
      data: scene.zoom >= 15 ? data.stations : labelled(data.stations, round),
      visible: scene.zoom >= 13.5,
      getPosition: (s) => s.position,
      getText: (s) => s.name,
      getSize: 11,
      getColor: rgb("374151"),
      getPixelOffset: [0, 12],
      getTextAnchor: "middle",
      getAlignmentBaseline: "top",
      fontFamily: "system-ui, -apple-system, sans-serif",
      characterSet: "auto",
      fontSettings: { sdf: true },
      outlineWidth: 3,
      outlineColor: WHITE,
    }),
    new ScatterplotLayer<LonLat>({
      id: "thermometer",
      data: round.thermometer ? [round.thermometer] : [],
      getPosition: (p) => p,
      getRadius: 7,
      radiusUnits: "pixels",
      getFillColor: rgb("7c3aed", 64),
      stroked: true,
      getLineColor: rgb("7c3aed"),
      getLineWidth: 2,
      lineWidthUnits: "pixels",
    }),
    new ScatterplotLayer<Train>({
      id: "trains",
      data: scene.trains,
      getPosition: (t) => t.position,
      getFillColor: (t) => t.color,
      getRadius: 30,
      radiusUnits: "meters",
      radiusMinPixels: 2,
      radiusMaxPixels: 4.5,
      stroked: true,
      getLineColor: WHITE,
      getLineWidth: 1,
      lineWidthUnits: "pixels",
    }),
  ];

  if (scene.landmarks) {
    const { pins, range } = scene.landmarks;
    type Pin = LandmarkScene["pins"][number];
    layers.push(
      new PathLayer<[number, number][]>({
        id: "landmark-range",
        data: range ? [range] : [],
        getPath: (p) => p,
        getColor: rgb("0f766e"),
        getWidth: 1.5,
        widthUnits: "pixels",
      }),
      new ScatterplotLayer<Pin>({
        id: "landmarks",
        data: pins,
        getPosition: (p) => p.position,
        getRadius: (p) => (p.nearest ? 7 : 5),
        radiusUnits: "pixels",
        getFillColor: (p) => (p.nearest ? rgb("0f766e") : rgb("14b8a6", 200)),
        stroked: true,
        getLineColor: WHITE,
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        updateTriggers: { getRadius: pins, getFillColor: pins },
      }),
      new TextLayer<Pin>({
        id: "landmark-labels",
        // Few kinds have many pins: name them all only when zoomed in.
        data: scene.zoom >= 13 || pins.length <= 12 ? pins : pins.filter((p) => p.nearest),
        getPosition: (p) => p.position,
        getText: (p) => p.name,
        getSize: 11,
        getColor: rgb("134e4a"),
        getPixelOffset: [0, -14],
        fontFamily: "system-ui, -apple-system, sans-serif",
        characterSet: "auto",
        fontSettings: { sdf: true },
        outlineWidth: 3,
        outlineColor: WHITE,
      }),
    );
  }

  if (replay) {
    layers.push(
      new PathLayer<{ path: LonLat[]; color: RGBA }>({
        id: "replay-paths",
        data: [
          { path: replay.hiderPath, color: HIDER_RED },
          { path: replay.seekerPath, color: INK },
        ].filter((p) => p.path.length > 1),
        getPath: (p) => p.path,
        getColor: (p) => [p.color[0], p.color[1], p.color[2], 217],
        getWidth: 4,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
      }),
      new TextLayer<ReplayScene["events"][number]>({
        id: "replay-events",
        data: replay.events,
        getPosition: (e) => e.position,
        getText: (e) => e.label,
        getSize: 12,
        getColor: INK,
        getPixelOffset: [0, -18],
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontWeight: 700,
        characterSet: "auto",
        fontSettings: { sdf: true },
        outlineWidth: 4,
        outlineColor: WHITE,
      }),
    );
    const hiderHead = replay.hiderPath.at(-1);
    if (hiderHead) layers.push(dot("replay-hider", hiderHead, HIDER_RED));
  }
  if (scene.me) layers.push(...meDot(scene.me));
  return layers;
}

function dot(id: string, p: LonLat, color: RGBA): Layer {
  return new ScatterplotLayer<LonLat>({
    id,
    data: [p],
    getPosition: (x) => x,
    getRadius: 7,
    radiusUnits: "pixels",
    getFillColor: color,
    stroked: true,
    getLineColor: WHITE,
    getLineWidth: 2.5,
    lineWidthUnits: "pixels",
  });
}

function meDot(p: LonLat): Layer[] {
  return [
    new ScatterplotLayer<LonLat>({
      id: "me-halo",
      data: [p],
      getPosition: (x) => x,
      getRadius: 16,
      radiusUnits: "pixels",
      getFillColor: [17, 24, 39, 40],
    }),
    dot("me", p, INK),
  ];
}
