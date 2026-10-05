import type { LonLat } from "@stand-clear/engine";
import { useEffect, useRef } from "react";
import { nowGameTime, useGame, type World } from "./game.ts";
import { type BaseMap, chooseProvider, createMapLibreBase } from "./map/baseMap.ts";
import { createGoogleBase } from "./map/googleBase.ts";
import {
  buildLayers,
  buildRound,
  buildStatic,
  type ReplayScene,
  type RoundData,
  type Train,
} from "./map/layers.ts";
import { pathUntil, stepReplay, useReplay } from "./replay.ts";
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
        const { view, follow } = useGame.getState();
        if (view) {
          me = world.geo.playerPosition(view.seeker, t);
          if (follow) base.setCenter(me);
        }
      }
      base.setLayers(
        buildLayers({ data, round, zoom: base.getZoom(), trains, me, replay: replayScene }),
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
