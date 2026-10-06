/**
 * The map: route lines, stations as squares, every running train, the question you're
 * choosing or reading in its family's shape, the elimination when an answer lands, your
 * search area on foot, you, and the replay. All deck.gl layers over a swappable base map,
 * rebuilt every frame.
 *
 * The base map comes first, because Google loads it on its own; the game's lines and
 * stations set onto it once the timetable is in (DESIGN.md, Loading).
 */
import {
  type Answer,
  isAnswered,
  type LonLat,
  type Question,
  questionKey,
  resolve,
  type SoloView,
  ZONE_RADIUS_M,
} from "@stand-clear/engine";
import { useEffect, useRef, useState } from "react";
import { liveQuestion } from "./AskPanel.tsx";
import { askContext } from "./ask.ts";
import { useMotion, watchClearings } from "./clearings.ts";
import { nowGameTime, useGame, type World } from "./game.ts";
import { MapLegend } from "./MapLegend.tsx";
import { type BaseMap, chooseProvider, createMapLibreBase } from "./map/baseMap.ts";
import { createGoogleBase } from "./map/googleBase.ts";
import {
  buildLayers,
  buildRound,
  buildStatic,
  frameAround,
  type ReplayScene,
  type RoundData,
  type SearchScene,
  type Train,
} from "./map/layers.ts";
import { answeredShape, questionShape, type Shape } from "./map/shapes.ts";
import { displayName } from "./names.ts";
import { pathUntil, stepReplay, useReplay } from "./replay.ts";
import { searchScene } from "./searchArea.ts";
import { walkToward } from "./street.ts";
import { Button, FollowToggle, Plaque } from "./ui/vocab.tsx";

const TIMES_SQ: LonLat = [-73.9873, 40.7553];

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** A station's name and bullets, on hover. Bullets are circles: trains. */
function stationTooltip({ ds }: World, complex: number): string {
  const c = ds.complexes[complex];
  if (!c) return "";
  const bullets = c.routes
    .map((letter) => ds.routes.find((r) => r.letter === letter))
    .filter((r) => r !== undefined)
    .map(
      (r) =>
        `<span style="display:inline-flex;width:18px;height:18px;border-radius:9px;align-items:center;justify-content:center;font:700 10px 'Helvetica Neue',Arial,sans-serif;background:#${r.color};color:#${r.textColor};margin-right:2px">${escapeHtml(r.display)}</span>`,
    )
    .join("");
  return `<div style="font:600 12.5px 'Libre Franklin',sans-serif;margin-bottom:5px;color:#24201B">${escapeHtml(displayName(c.name))}</div><div>${bullets}</div>`;
}

const TOOLTIP_STYLE = {
  background: "#FBF8F1",
  color: "#24201B",
  boxShadow: "inset 0 0 0 1.5px #24201B",
  borderRadius: "0",
  padding: "8px 10px",
};

/** The question the map draws now: the one under the pointer, the armed one, or the one being read. */
export function shapeQuestion(
  view: SoloView,
  t: number,
  world: World,
): { q: Question; answer: Answer | null; ctx: ReturnType<typeof askContext> } | null {
  const { hovered, armed } = useGame.getState();
  const q = hovered ?? armed;
  if (q && !view.result) return { q, answer: null, ctx: askContext(q, view, t, world.idx) };
  const live = liveQuestion(view, Date.now());
  if (live) return { q: live.q, answer: isAnswered(live) ? live.answer : null, ctx: live.ctx };
  return null;
}

let shapeCache: { key: string; shape: Shape } | null = null;

function shapeFor(
  world: World,
  view: SoloView,
  t: number,
  search: SearchScene | null,
): Shape | null {
  const sq = shapeQuestion(view, t, world);
  if (!sq) return null;
  const { q, answer, ctx } = sq;
  const key = `${questionKey(q)}|${ctx.origin.lat},${ctx.origin.lon}|${ctx.baseline?.lat},${ctx.baseline?.lon}|${JSON.stringify(answer)}|${search?.complex}`;
  if (shapeCache?.key === key) return shapeCache.shape;
  const c = search ? world.ds.complexes[search.complex] : undefined;
  const circle = c ? { center: c, radius: ZONE_RADIUS_M } : null;
  const shape = answer
    ? answeredShape(world.ds, q, ctx, answer, circle)
    : questionShape(world.ds, q, ctx, circle);
  shapeCache = { key, shape };
  return shape;
}

/** "You", or "You · on the Q" while you ride. */
function meLabel(world: World, view: SoloView, t: number): string {
  const s = resolve(view.seeker, t, world.idx);
  if (s.kind !== "train") return "You";
  const trip = world.ds.trips[s.trip];
  const route = trip ? world.ds.routes[trip.route] : undefined;
  return route ? `You · on the ${route.display}` : "You";
}

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const world = useGame((s) => s.world);
  const mapFailed = useGame((s) => s.mapFailed);
  const follow = useGame((s) => s.follow);
  const setFollow = useGame((s) => s.setFollow);
  const hasView = useGame((s) => s.view !== null);
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
      return s?.complex === undefined || !w
        ? null
        : { html: stationTooltip(w, s.complex), style: TOOLTIP_STYLE };
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
    if (!world) return;
    return watchClearings(() => worldRef.current);
  }, [world]);

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
    let veiled: number | null = null;

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

      let me: { position: LonLat; label: string } | null = null;
      let replayScene: ReplayScene | null = null;
      let shape: Shape | null = null;
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
        const head = seekerPath.at(-1);
        me = head ? { position: head, label: "Seeker" } : null;
      } else {
        const { view, follow: following } = useGame.getState();
        if (view) {
          const position = world.geo.playerPosition(view.seeker, t);
          me = { position, label: meLabel(world, view, t) };
          if (following) base.setCenter(position);
          search = searchScene(world, view, t);
          shape = shapeFor(world, view, t, search);
          // Coming up to the street: frame the search circle (the design's "Search area").
          if (search && search.complex !== framed) {
            const c = world.ds.complexes[search.complex];
            if (c) base.fitBounds(...frameAround(c, ZONE_RADIUS_M));
          }
          framed = search?.complex ?? null;
        }
      }
      // The search area blurs and veils the map outside its circle.
      const veilAt = search?.complex ?? null;
      if (veilAt !== veiled) {
        const c = veilAt === null ? undefined : world.ds.complexes[veilAt];
        base.setVeil(c ? { lat: c.lat, lon: c.lon, meters: ZONE_RADIUS_M } : null);
        veiled = veilAt;
      }
      const motion = useMotion.getState();
      base.setLayers(
        buildLayers({
          data,
          shape,
          search,
          round,
          zoom: base.getZoom(),
          trains,
          me,
          replay: replayScene,
          clearing: motion.clearing,
          tiles: motion.tiles,
          now,
        }),
      );
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      unsubscribeGame();
      unsubscribeReplay();
      base.setLayers([]);
      base.setVeil(null);
    };
  }, [base, world]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" />
      {world && hasView && !mapFailed && <MapLegend world={world} />}
      {hasView && (
        // "Following you" is a map state, so it's a toggle on the map, beside the zoom buttons.
        <div className="absolute right-[58px] bottom-[28px] z-10">
          <FollowToggle
            on={follow && !mapFailed}
            disabled={!!mapFailed}
            label={mapFailed ? "No map" : "Following you"}
            onToggle={() => setFollow(!follow)}
          />
        </div>
      )}
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
