/**
 * Everything the game draws on the map, as deck.gl layers built from a snapshot of the
 * game ("scene"). deck.gl diffs layers by id, so rebuilding the list every frame is cheap;
 * static data keeps stable references so it's uploaded to the GPU once. Works the same
 * over MapLibre or Google Maps.
 *
 * The language (DESIGN.md, Look: Mosaic): squares are game information, circles are
 * trains. Stations still possible are ink squares, the rest outlines. A question draws its
 * shape in its family color while it's chosen or read; answered boundaries stay, faint.
 */
import type { Layer } from "@deck.gl/core";
import { PathStyleExtension, type PathStyleExtensionProps } from "@deck.gl/extensions";
import { IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import {
  type Answer,
  isAnswered,
  type LonLat,
  milesToMeters,
  offsetMeters,
  type SoloView,
} from "@stand-clear/engine";
import type { World } from "../game.ts";
import { displayName } from "../names.ts";
import { FAMILY_COLORS, type Family, familyOf } from "../ui/family.ts";
import { boundaryProgress, type Clearing, liftOf } from "./eliminate.ts";
import { plaqueAtlas, plaqueKey, type StationIcon, stationAtlas } from "./icons.ts";
import { bisector, type Path, type Plaque, questionShape, ring, type Shape } from "./shapes.ts";

export type RGBA = [number, number, number, number];

export const rgb = (hex: string, a = 255): RGBA => {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
    a,
  ];
};

const INK = rgb("24201B");
const INK_2 = rgb("5E554A");
const GLAZE_HI = rgb("FBF8F1");
const TERRA = rgb("B9532F");
const FONT = '"Libre Franklin", "Helvetica Neue", Arial, sans-serif';

const family = (f: Family, a = 255): RGBA => rgb(FAMILY_COLORS[f].fill, a);

/** Per-world data, built once. */
export interface StaticData {
  lines: { path: [number, number][]; color: RGBA; letter: string }[];
  stations: { complex: number; position: LonLat; name: string }[];
  routeColors: RGBA[];
}

export function buildStatic({ ds }: World): StaticData {
  const routeColors = ds.routes.map((r) => rgb(r.color));
  return {
    routeColors,
    lines: ds.shapes.map((s) => ({
      path: s.points,
      color: routeColors[s.route] ?? INK,
      letter: ds.routes[s.route]?.letter ?? "",
    })),
    stations: ds.complexes.map((c, i) => ({
      complex: i,
      position: [c.lon, c.lat] as LonLat,
      name: displayName(c.name),
    })),
  };
}

export type StationStatus = "possible" | "out" | "hider" | "start";

/** Per-round data, rebuilt when the round's view changes. */
export interface RoundData {
  /** Bumped on every view change, to re-run color/size accessors. */
  version: number;
  status: StationStatus[];
  /** Answered questions' boundaries, kept faint on the map. */
  past: { family: Family; rings: Path[]; lines: Path[] }[];
  /** Where the thermometer was started, if it's running. */
  thermometer: LonLat | null;
}

/** A ring of `meters` around (lat, lon), measured as the engine measures. */
export function circle(lat: number, lon: number, meters: number): [number, number][] {
  return ring({ lat, lon }, meters);
}

/** The boundary an answered question leaves on the map, faint. */
function pastBoundary(
  world: World,
  q: SoloView["asked"][number],
): RoundData["past"][number] | null {
  const answer = q.answer as Answer | null;
  if (!answer || (typeof answer === "object" && "vetoed" in answer)) return null;
  const f = familyOf(q.q);
  switch (q.q.kind) {
    case "radar":
      return { family: f, rings: [ring(q.ctx.origin, milesToMeters(q.q.miles))], lines: [] };
    case "thermometer":
      return q.ctx.baseline
        ? { family: f, rings: [], lines: [bisector(q.ctx.baseline, q.ctx.origin)] }
        : null;
    case "matching": {
      const s = questionShape(world.ds, q.q, q.ctx);
      return s.yourCell ? { family: f, rings: [s.yourCell], lines: [] } : null;
    }
    default:
      return null;
  }
}

export function buildRound(world: World, view: SoloView | null, version: number): RoundData {
  const candidates = new Set(view?.candidates ?? []);
  const hubComplex = view ? world.ds.stations[view.hub]?.complex : undefined;
  return {
    version,
    status: world.ds.complexes.map((_, i): StationStatus => {
      if (view?.hider === i) return "hider";
      if (!view || candidates.has(i)) return "possible";
      if (i === hubComplex) return "start";
      return "out";
    }),
    past: (view?.asked ?? [])
      .filter(isAnswered)
      .map((a) => pastBoundary(world, a))
      .filter((p) => p !== null),
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

/** On foot: your search circle, and where in it the hider could still be. */
export interface SearchScene {
  complex: number;
  ring: [number, number][];
  possible: LonLat[];
}

export interface Scene {
  data: StaticData;
  /** The hovered or armed question's shape, or the one just answered while it's read. */
  shape: Shape | null;
  search: SearchScene | null;
  round: RoundData;
  zoom: number;
  trains: Train[];
  /** You (the seeker), or the seeker's replay head, with a label. */
  me: { position: LonLat; label: string } | null;
  replay: ReplayScene | null;
  /** The elimination in flight, and real time now (performance.now()). */
  clearing: Clearing | null;
  tiles: { clearing: Clearing; tiles: [number, number][] } | null;
  now: number;
}

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

/** A station square's size in px: a tile that grows with the zoom, within bounds. */
function squarePx(zoom: number, status: StationStatus): number {
  const base = Math.min(12, Math.max(4, 5 * 2 ** (zoom - 12)));
  return status === "possible" || status === "hider" || status === "start" ? base : base * 0.8;
}

/**
 * A boundary growing as it draws: rings scale out from their centers, lines from their
 * midpoints (DESIGN.md, Motion: the ring grows from where you asked; the halfway line
 * draws out from its midpoint).
 */
function grow(path: Path, f: number): Path {
  if (f >= 1) return path;
  const n = path.length;
  const cx = path.reduce((s, p) => s + p[0], 0) / n;
  const cy = path.reduce((s, p) => s + p[1], 0) / n;
  return path.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f] as LonLat);
}

export function buildLayers(scene: Scene): Layer[] {
  const { data, round, replay, shape, clearing, now } = scene;
  const atlas = stationAtlas();
  const lift = (c: number) => (clearing ? liftOf(clearing, c, now) : 1);
  const inFlight = clearing && now - clearing.start < clearing.end + 50;
  const frame = inFlight ? Math.floor(now / 16) : 0;
  const pickedRoute = shape?.route ?? null;
  // The boundary of the answer being read grows in before the squares lift.
  const growth = clearing ? boundaryProgress(clearing, now) : 1;
  const answering = clearing && shape && growth < 1;

  const layers: Layer[] = [];

  // Answered boundaries, faint.
  type Past = RoundData["past"][number];
  layers.push(
    new PathLayer<{ path: Path; family: Family }>({
      id: "past-boundaries",
      data: round.past.flatMap((p: Past) =>
        [...p.rings, ...p.lines].map((path) => ({ path, family: p.family })),
      ),
      getPath: (d) => d.path,
      getColor: (d) => family(d.family, 90),
      getWidth: 1.5,
      widthUnits: "pixels",
      updateTriggers: { getPath: round.version },
    }),
  );

  // The question's shape, in its family color.
  if (shape) {
    const f = shape.family;
    const g = answering ? growth : 1;
    layers.push(
      new PathLayer<Path>({
        id: "shape-cells",
        data: shape.cells,
        getPath: (p) => p,
        getColor: family(f, Math.round(120 * g)),
        getWidth: 1,
        widthUnits: "pixels",
        updateTriggers: { getColor: g },
      }),
      new PolygonLayer<Path>({
        id: "shape-your-cell",
        data: shape.yourCell ? [shape.yourCell] : [],
        getPolygon: (p) => p,
        getFillColor: family(f, 26),
        getLineColor: family(f),
        getLineWidth: 3,
        lineWidthUnits: "pixels",
        stroked: true,
      }),
      new PolygonLayer<Path>({
        id: "shape-ring-fill",
        // Radar's inside, softly: the ring is the answer's boundary.
        data: shape.rings.length === 1 ? [grow(shape.rings[0] as Path, g)] : [],
        getPolygon: (p) => p,
        getFillColor: family(f, 18),
        stroked: false,
        updateTriggers: { getPolygon: g },
      }),
      new PathLayer<Path>({
        id: "shape-rings",
        data: shape.rings.map((r) => grow(r, g)),
        getPath: (p) => p,
        getColor: family(f, shape.rings.length > 1 ? 170 : 255),
        getWidth: shape.rings.length > 1 ? 1.5 : 2.5,
        widthUnits: "pixels",
        updateTriggers: { getPath: g },
      }),
      new PathLayer<Path, PathStyleExtensionProps<Path>>({
        id: "shape-lines",
        data: shape.lines.map((l) => (shape.plaques.length > 0 ? l : grow(l, g))),
        getPath: (p) => p,
        getColor: family(f),
        getWidth: shape.plaques.length > 0 ? 1.5 : 2.5,
        widthUnits: "pixels",
        getDashArray: shape.plaques.length > 0 ? [0, 0] : [10, 5],
        dashUnits: "pixels",
        extensions: [dashes],
        updateTriggers: { getPath: g },
      }),
    );
  }

  layers.push(
    new PathLayer<StaticData["lines"][number]>({
      id: "lines",
      data: data.lines,
      getPath: (l) => l.path,
      // A route question picks its line out; the others step back.
      getColor: (l) =>
        pickedRoute === null || l.letter === pickedRoute
          ? [l.color[0], l.color[1], l.color[2], 215]
          : [l.color[0], l.color[1], l.color[2], 55],
      getWidth: (l) => (pickedRoute !== null && l.letter === pickedRoute ? 60 : 25),
      widthUnits: "meters",
      widthMinPixels: 1.5,
      widthMaxPixels: 6,
      capRounded: true,
      jointRounded: true,
      updateTriggers: { getColor: pickedRoute, getWidth: pickedRoute },
    }),
  );

  // On foot: where the hider could still be, as ink tesserae on the engine's 8 m grid.
  if (scene.search) {
    const tiles = scene.tiles;
    layers.push(
      new IconLayer<LonLat>({
        id: "search-tiles",
        data: scene.search.possible,
        iconAtlas: atlas.url,
        iconMapping: atlas.mapping,
        getIcon: () => "tile",
        getPosition: (p) => p,
        getSize: 7,
        sizeUnits: "meters",
        getColor: [36, 32, 27, 120],
      }),
      new IconLayer<{ p: [number, number]; id: number }>({
        id: "search-tiles-clearing",
        data: tiles ? tiles.tiles.map((p, id) => ({ p, id })) : [],
        iconAtlas: atlas.url,
        iconMapping: atlas.mapping,
        getIcon: () => "tile",
        getPosition: (d) => d.p,
        getSize: 7,
        sizeUnits: "meters",
        getColor: (d) => [
          36,
          32,
          27,
          tiles ? Math.round(120 * (1 - liftOf(tiles.clearing, d.id, now))) : 0,
        ],
        updateTriggers: { getColor: tiles ? Math.floor(now / 16) : 0 },
      }),
      new PathLayer<[number, number][]>({
        id: "search-ring",
        data: [scene.search.ring],
        getPath: (p) => p,
        getColor: INK,
        getWidth: 2,
        widthUnits: "pixels",
      }),
    );
  }

  // Stations: an outline under every square; ink on top for those still possible, lifting
  // to the outline as an answer clears them.
  const sizeTrigger = Math.round(scene.zoom * 4);
  layers.push(
    new IconLayer<StationDatum>({
      id: "stations-out",
      data: data.stations,
      pickable: true,
      iconAtlas: atlas.url,
      iconMapping: atlas.mapping,
      getIcon: (s): StationIcon => {
        const st = round.status[s.complex] ?? "out";
        return st === "possible" ? "out" : st;
      },
      getPosition: (s) => s.position,
      getSize: (s) => squarePx(scene.zoom, round.status[s.complex] ?? "out"),
      sizeUnits: "pixels",
      updateTriggers: { getIcon: round.version, getSize: [round.version, sizeTrigger] },
    }),
    new IconLayer<StationDatum>({
      id: "stations-possible",
      data: data.stations,
      iconAtlas: atlas.url,
      iconMapping: atlas.mapping,
      getIcon: () => "possible",
      getPosition: (s) => s.position,
      getSize: () => squarePx(scene.zoom, "possible"),
      sizeUnits: "pixels",
      getColor: (s) => {
        const st = round.status[s.complex];
        if (st === "possible") return [255, 255, 255, 255];
        const l = clearing?.delays.has(s.complex) ? lift(s.complex) : 1;
        return [255, 255, 255, Math.round(255 * (1 - l))];
      },
      updateTriggers: {
        getColor: [round.version, frame],
        getSize: sizeTrigger,
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
      getColor: INK_2,
      getPixelOffset: [0, 11],
      getTextAnchor: "middle",
      getAlignmentBaseline: "top",
      fontFamily: FONT,
      fontWeight: 600,
      characterSet: "auto",
      fontSettings: { sdf: true },
      outlineWidth: 3,
      outlineColor: GLAZE_HI,
    }),
    new IconLayer<LonLat>({
      id: "thermometer-start",
      data: round.thermometer ? [round.thermometer] : [],
      iconAtlas: atlas.url,
      iconMapping: atlas.mapping,
      getIcon: () => "tile",
      getPosition: (p) => p,
      getSize: 10,
      sizeUnits: "pixels",
      getColor: family("thermo"),
    }),
    // Trains are circles, in their route's color.
    new ScatterplotLayer<Train>({
      id: "trains",
      data: scene.trains,
      getPosition: (t) => t.position,
      getFillColor: (t) => t.color,
      getRadius: 32,
      radiusUnits: "meters",
      radiusMinPixels: 2.2,
      radiusMaxPixels: 5,
      stroked: true,
      getLineColor: GLAZE_HI,
      getLineWidth: 1,
      lineWidthUnits: "pixels",
    }),
  );

  // Landmarks, as plaques, only while their question is chosen or read.
  if (shape && shape.plaques.length > 0) {
    const plaques = plaqueAtlas();
    layers.push(
      new IconLayer<Plaque>({
        id: "plaques",
        data: shape.plaques,
        iconAtlas: plaques.url,
        iconMapping: plaques.mapping,
        getIcon: (p) => plaqueKey(p.kind, p.nearest),
        getPosition: (p) => p.position,
        getSize: (p) => (p.nearest ? 22 : 17),
        sizeUnits: "pixels",
        updateTriggers: { getIcon: shape.plaques, getSize: shape.plaques },
      }),
      new TextLayer<Plaque>({
        id: "plaque-labels",
        // The nearest is named; the rest once you're close enough to read them.
        data:
          scene.zoom >= 14 || shape.plaques.length <= 10
            ? shape.plaques
            : shape.plaques.filter((p) => p.nearest),
        getPosition: (p) => p.position,
        getText: (p) => p.name,
        getSize: 11.5,
        getColor: INK,
        getPixelOffset: [14, 0],
        getTextAnchor: "start",
        getAlignmentBaseline: "center",
        fontFamily: FONT,
        fontWeight: 700,
        characterSet: "auto",
        fontSettings: { sdf: true },
        outlineWidth: 3,
        outlineColor: GLAZE_HI,
      }),
    );
  }

  if (replay) {
    layers.push(
      new PathLayer<{ path: LonLat[]; color: RGBA }>({
        id: "replay-paths",
        data: [
          { path: replay.hiderPath, color: TERRA },
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
        fontFamily: FONT,
        fontWeight: 700,
        characterSet: "auto",
        fontSettings: { sdf: true },
        outlineWidth: 4,
        outlineColor: GLAZE_HI,
      }),
    );
    const hiderHead = replay.hiderPath.at(-1);
    if (hiderHead) layers.push(dot("replay-hider", hiderHead, TERRA));
  }
  if (scene.me) layers.push(...meDot(scene.me.position, scene.me.label));
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
    getLineColor: GLAZE_HI,
    getLineWidth: 2.5,
    lineWidthUnits: "pixels",
  });
}

/** You: an ink dot (your own dot and trail are always ink) with your label beside it. */
function meDot(p: LonLat, label: string): Layer[] {
  return [
    dot("me", p, INK),
    new TextLayer<LonLat>({
      id: "me-label",
      data: [p],
      getPosition: (x) => x,
      getText: () => label,
      getSize: 12,
      getColor: INK,
      getPixelOffset: [12, -10],
      getTextAnchor: "start",
      getAlignmentBaseline: "center",
      fontFamily: FONT,
      fontWeight: 700,
      characterSet: "auto",
      fontSettings: { sdf: true },
      outlineWidth: 3,
      outlineColor: GLAZE_HI,
      updateTriggers: { getText: label },
    }),
  ];
}

/** The square corners of a 400 m frame round a point, for framing the search area. */
export function frameAround(c: { lat: number; lon: number }, meters: number): [LonLat, LonLat] {
  const sw = offsetMeters(c, -meters, -meters);
  const ne = offsetMeters(c, meters, meters);
  return [
    [sw.lon, sw.lat],
    [ne.lon, ne.lat],
  ];
}
