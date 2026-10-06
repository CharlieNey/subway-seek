import {
  type LonLat,
  milesToMeters,
  nearestLandmark,
  offsetMeters,
  questionOrigin,
  ZONE_RADIUS_M,
} from "@stand-clear/engine";
import { useEffect, useRef, useState } from "react";
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
import { Button, Plaque } from "./ui/vocab.tsx";

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
 *
 * The base map comes first, because Google loads it on its own; the game's lines and
 * stations set onto it once the timetable is in (DESIGN.md, Loading).
 */
export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const world = useGame((s) => s.world);
  const mapFailed = useGame((s) => s.mapFailed);
  const [base, setBase] = useState<BaseMap | null>(null);
  /** Bumped by "Reload the map". */
  const [attempt, setAttempt] = useState(0);
  const worldRef = useRef(world);
  worldRef.current = world;

  // The base map, as soon as the page opens. A reload is one more billed map load.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the reload trigger
  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    const tooltip = ({ object }: { object?: unknown }) => {
      const s = object as { complex?: number } | undefined;
      const w = worldRef.current;
      return s?.complex === undefined || !w ? null : { html: stationTooltip(w, s.complex) };
    };
    const b: BaseMap =
      chooseProvider() === "google"
        ? createGoogleBase(container.current, TIMES_SQ, tooltip)
        : createMapLibreBase(container.current, TIMES_SQ, tooltip);
    useGame.setState({ mapFailed: null });
    const failed = (reason: string) => {
      if (!disposed) useGame.setState({ mapFailed: reason });
    };
    b.onFailure(failed);
    b.ready.then(
      () => {
        if (!disposed) setBase(b);
      },
      (err: unknown) => failed(err instanceof Error ? err.message : String(err)),
    );
    b.onUserDrag(() => useGame.getState().setFollow(false));
    // On the street, clicking the map means "walk there".
    b.onClick(([lon, lat]) => void walkToward(lat, lon));
    return () => {
      disposed = true;
      setBase(null);
      b.remove();
    };
  }, [attempt]);

  useEffect(() => {
    if (!base || !world) return;
    const data = buildStatic(world);
    let version = 0;
    let round: RoundData = buildRound(world, useGame.getState().view, version);
    let trains: Train[] = [];
    let lastTrains = 0;
    let lastFrame = performance.now();
    let raf = 0;
    /** The search circle the map last framed. */
    let framed: number | null = null;

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
              const sw = offsetMeters(c, -ZONE_RADIUS_M, -ZONE_RADIUS_M);
              const ne = offsetMeters(c, ZONE_RADIUS_M, ZONE_RADIUS_M);
              base.fitBounds([sw.lon, sw.lat], [ne.lon, ne.lat]);
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
    tick();

    return () => {
      cancelAnimationFrame(raf);
      unsubscribeGame();
      unsubscribeReplay();
      base.setLayers([]);
    };
  }, [base, world]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" />
      {mapFailed && <MapFailed reason={mapFailed} onReload={() => setAttempt((n) => n + 1)} />}
    </div>
  );
}

/**
 * The map didn't load: a plain tile field with the plaque. The round carries on, because
 * the departure boards and questions don't need the map.
 */
function MapFailed({ reason, onReload }: { reason: string; onReload: () => void }) {
  const google = chooseProvider() === "google";
  return (
    <div className="sc-tilefield absolute inset-0 z-30 flex items-center justify-center p-4">
      <Plaque
        className="w-[380px] max-w-full"
        title="The map didn't load"
        safe="Your round carries on. The departure boards and every question still work."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button kind="ink" onClick={onReload}>
              Reload the map
            </Button>
          </div>
        }
        details={`${google ? "Google Maps" : "MapLibre"} · ${reason}`}
      >
        <p>
          {google
            ? "Google Maps didn't answer, or this browser can't draw it."
            : "The map tiles didn't answer, or this browser can't draw them."}
        </p>
      </Plaque>
    </div>
  );
}
