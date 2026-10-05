import {
  type LonLat,
  milesToMeters,
  nearestLandmark,
  questionOrigin,
  ZONE_RADIUS_M,
} from "@stand-clear/engine";
import { useEffect, useRef } from "react";
import { type LandmarkPreview, nowGameTime, useGame, type World } from "./game.ts";
import { type BaseMap, chooseProvider, createMapLibreBase } from "./map/baseMap.ts";
import { createGoogleBase } from "./map/googleBase.ts";
import {
  buildLayers,
  buildRound,
  buildStatic,
  circle,
  type LandmarkScene,
  type ReplayScene,
  type RoundData,
  type SearchScene,
  type Train,
} from "./map/layers.ts";
import { pathUntil, stepReplay, useReplay } from "./replay.ts";
import { searchScene } from "./searchArea.ts";
import { walkToward } from "./street.ts";

const TIMES_SQ: LonLat = [-73.9873, 40.7553];

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function stationTooltip({ ds }: World, complex: number): string {
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

/** Pins for the landmarks being previewed, built once per kind and origin. */
let landmarkCache: { key: string; scene: LandmarkScene } | null = null;
function landmarkScene(
  { ds }: World,
  preview: LandmarkPreview,
  origin: { lat: number; lon: number },
): LandmarkScene {
  const key = `${preview.kind}|${preview.rangeMiles ?? ""}|${origin.lat},${origin.lon}`;
  if (landmarkCache?.key === key) return landmarkCache.scene;
  const mine = nearestLandmark(ds, preview.kind, origin).index;
  const scene: LandmarkScene = {
    pins: ds.landmarks[preview.kind].map((l, i) => ({
      position: [l.lon, l.lat] as LonLat,
      name: l.name,
      nearest: i === mine,
    })),
    range: preview.rangeMiles
      ? circle(origin.lat, origin.lon, milesToMeters(preview.rangeMiles))
      : null,
  };
  landmarkCache = { key, scene };
  return scene;
}

/**
 * The map: route lines, stations, every running train, question overlays, you, and
 * the replay — all deck.gl layers over a swappable base map, rebuilt every frame.
 */
export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const world = useGame((s) => s.world);

  useEffect(() => {
    if (!container.current || !world) return;
    const data = buildStatic(world);
    let version = 0;
    let round: RoundData = buildRound(world, useGame.getState().view, version);
    let trains: Train[] = [];
    let lastTrains = 0;
    let lastFrame = performance.now();
    let raf = 0;
    /** The search circle the map last framed. */
    let framed: number | null = null;

    const tooltip = ({ object }: { object?: unknown }) => {
      const s = object as { complex?: number } | undefined;
      return s?.complex === undefined ? null : { html: stationTooltip(world, s.complex) };
    };
    const base: BaseMap =
      chooseProvider() === "google"
        ? createGoogleBase(container.current, TIMES_SQ, tooltip)
        : createMapLibreBase(container.current, TIMES_SQ, tooltip);
    base.onUserDrag(() => useGame.getState().setFollow(false));
    // On the street, clicking the map means "walk there".
    base.onClick(([lon, lat]) => void walkToward(lat, lon));

    // Re-shade stations and question overlays when the round changes; reveal the hider.
    const unsubscribeGame = useGame.subscribe((st, prev) => {
      if (st.view === prev.view) return;
      version += 1;
      round = buildRound(world, st.view, version);
      const hider = st.view?.hider;
      const c = hider !== null && hider !== undefined ? world.ds.complexes[hider] : undefined;
      if (c && prev.view?.hider == null) {
        useGame.getState().setFollow(false);
        base.flyTo([c.lon, c.lat], 14);
      }
    });
    // Frame both routes when a replay opens.
    const unsubscribeReplay = useReplay.subscribe((r, prev) => {
      if (!r.active || prev.active) return;
      useGame.getState().setFollow(false);
      const pts = [...r.hider, ...r.seeker].map((s) => s.p);
      if (pts.length === 0) return;
      const lons = pts.map((p) => p[0]);
      const lats = pts.map((p) => p[1]);
      base.fitBounds(
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      );
    });

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
        trains = [];
        for (const i of world.geo.runningTrips(t)) {
          const p = world.geo.trainPosition(i, t);
          const color = data.routeColors[world.ds.trips[i]?.route ?? -1];
          if (p && color) trains.push({ position: p, color });
        }
      }

      let me: LonLat | null = null;
      let replayScene: ReplayScene | null = null;
      let landmarks: LandmarkScene | null = null;
      let search: SearchScene | null = null;
      if (replay.active) {
        const seekerPath = pathUntil(replay.seeker, t);
        replayScene = {
          seekerPath,
          hiderPath: pathUntil(replay.hider, t),
          events: replay.events
            .filter((e) => e.t <= t)
            .map((e) => ({ position: e.p, label: e.label })),
        };
        me = seekerPath.at(-1) ?? null;
      } else {
        const { view, follow, preview } = useGame.getState();
        if (view) {
          me = world.geo.playerPosition(view.seeker, t);
          if (follow) base.setCenter(me);
          if (preview)
            landmarks = landmarkScene(world, preview, questionOrigin(view.seeker, t, world.idx));
          search = searchScene(world, view, t);
          // Coming up to the street: frame the search circle (the design's "Search area").
          if (search && search.complex !== framed) {
            const c = world.ds.complexes[search.complex];
            if (c) {
              const dLat = ZONE_RADIUS_M / 110_540;
              const dLon = ZONE_RADIUS_M / (111_320 * Math.cos((c.lat * Math.PI) / 180));
              base.fitBounds([c.lon - dLon, c.lat - dLat], [c.lon + dLon, c.lat + dLat]);
            }
          }
          framed = search?.complex ?? null;
        }
      }
      base.setLayers(
        buildLayers({
          data,
          landmarks,
          search,
          round,
          zoom: base.getZoom(),
          trains,
          me,
          replay: replayScene,
        }),
      );
    };
    let disposed = false;
    void base.ready.then(() => {
      if (!disposed) tick();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      unsubscribeGame();
      unsubscribeReplay();
      base.remove();
    };
  }, [world]);

  return <div ref={container} className="h-full w-full" />;
}
