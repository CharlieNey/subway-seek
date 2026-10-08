/**
 * The map: route lines, stations as squares, every running train, the question you're
 * choosing or reading in its family's shape, the elimination when an answer lands, your
 * search area on foot, you, and the replay. All deck.gl layers over a swappable base map,
 * each part rebuilt only when what it draws changes.
 *
 * The base map comes first, because Google loads it on its own; the game's lines and
 * stations set onto it once the timetable is in (DESIGN.md, Loading).
 */
import {
  type Answer,
  distanceMeters,
  isAnswered,
  type LonLat,
  type Question,
  questionKey,
  resolve,
  type SoloView,
  SPOT_REVEAL_METERS,
  STREET_RADIUS_M,
  streetPoint,
  walkSeconds,
  ZONE_RADIUS_M,
} from "@stand-clear/engine";
import { useEffect, useRef, useState } from "react";
import { liveQuestion } from "./AskPanel.tsx";
import { askContext } from "./ask.ts";
import { reducedMotion, useMotion, watchClearings } from "./clearings.ts";
import { nowGameTime, useGame, type World } from "./game.ts";
import { isHider, ownTransit } from "./hide.ts";
import { MapLegend } from "./MapLegend.tsx";
import { type BaseMap, chooseProvider, createMapLibreBase } from "./map/baseMap.ts";
import { createGoogleBase } from "./map/googleBase.ts";
import { hideLayers } from "./map/hideLayers.ts";
import {
  buildRound,
  buildStatic,
  circle,
  createLayerBuilder,
  frameAround,
  type ReplayScene,
  type RoundData,
  type SearchScene,
  type Train,
} from "./map/layers.ts";
import { answeredShape, questionShape, type Shape } from "./map/shapes.ts";
import { displayName } from "./names.ts";
import { pathUntil, REPLAY_REAL_SECONDS, stepReplay, useReplay } from "./replay.ts";
import { searchScene } from "./searchArea.ts";
import { walkToward } from "./street.ts";
import { paintAt, tablet } from "./ui/tablet.ts";
import { Button, Caption, FollowToggle, Plaque } from "./ui/vocab.tsx";

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

/** Real ms since the replay reached its end, for the tablet's set; 0 while it hasn't. */
let replayEndedAt = 0;
/** A trail's whole path, the same array for as long as the replay has the same samples. */
const fullPaths = new WeakMap<{ t: number; p: LonLat }[], LonLat[]>();
function fullPath(samples: { t: number; p: LonLat }[]): LonLat[] {
  let path = fullPaths.get(samples);
  if (!path) {
    path = samples.map((x) => x.p);
    fullPaths.set(samples, path);
  }
  return path;
}
const tablets = new Map<string, { url: string; width: number; height: number }>();

/** The hider's station tablet as an image for the map, drawn once per name. */
function tabletImage(name: string) {
  let img = tablets.get(name);
  if (!img) {
    const c = document.createElement("canvas");
    // 3 px tiles, like the panel's tablets, so a long name stays readable.
    const model = tablet(name, "irt");
    paintAt(c, model, Math.min(320, model.W * 3));
    img = { url: c.toDataURL(), width: c.width, height: c.height };
    tablets.set(name, img);
  }
  return img;
}

/**
 * The replay at game time t (DESIGN.md, Motion › Replay): game time runs linearly, each
 * question sets as its family square where it was asked (stacking from one place), the
 * zone ring draws out once the hider settles, and the station tablet sets at the end.
 */
function replaySceneAt(
  world: World,
  replay: ReturnType<typeof useReplay.getState>,
  t: number,
  now: number,
): ReplayScene {
  const reduced = reducedMotion();
  const decel = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
  // Game seconds per real second at replay speed; paused or scrubbed, everything is set.
  const rate = (replay.end - replay.start) / REPLAY_REAL_SECONDS;
  const since = (gt: number) => (replay.playing ? ((t - gt) / rate) * 1000 : 1e9);
  const set = (gt: number, ms: number) => (reduced ? 1 : decel(since(gt) / ms));
  const stacks = new Map<string, number>();
  const questions: ReplayScene["questions"] = [];
  for (const e of replay.log) {
    if (e.mark.kind !== "question" || !e.p || e.t > t) continue;
    const key = `${e.p[0].toFixed(4)},${e.p[1].toFixed(4)}`;
    const stack = stacks.get(key) ?? 0;
    stacks.set(key, stack + 1);
    questions.push({
      position: e.p,
      icon: `${e.mark.vetoed ? "veto" : "fam"}-${e.mark.family}`,
      label: e.text.replace(": ", " · "),
      stack,
      set: set(e.t, 160),
    });
  }
  const view = useGame.getState().view;
  const hider = view?.hider == null ? undefined : world.ds.complexes[view.hider];
  const zone =
    hider && replay.settled !== null && t >= replay.settled
      ? circle(hider.lat, hider.lon, ZONE_RADIUS_M * set(replay.settled, 400))
      : null;
  if (t >= replay.end) replayEndedAt ||= now;
  else replayEndedAt = 0;
  const tabletSet = reduced ? 1 : decel((now - replayEndedAt) / 900);
  return {
    hiderPath: pathUntil(replay.hider, t),
    seekerPath: pathUntil(replay.seeker, t),
    hiderFull: fullPath(replay.hider),
    seekerFull: fullPath(replay.seeker),
    questions,
    zone,
    tablet:
      hider && replayEndedAt > 0
        ? {
            position: [hider.lon, hider.lat],
            ...tabletImage(displayName(hider.name)),
            set: tabletSet,
          }
        : null,
  };
}

/** "You", or "You · on the Q" while you ride. */
function meLabel(world: World, view: SoloView, t: number): string {
  const s = resolve(ownTransit(view), t, world.idx);
  if (s.kind !== "train") return "You";
  const trip = world.ds.trips[s.trip];
  const route = trip ? world.ds.routes[trip.route] : undefined;
  return route ? `You · on the ${route.display}` : "You";
}

/** `credits`: how far up the map's own attribution reaches (map/attribution.ts). */
export function MapView({ credits = 0 }: { credits?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const world = useGame((s) => s.world);
  const mapFailed = useGame((s) => s.mapFailed);
  const follow = useGame((s) => s.follow);
  const setFollow = useGame((s) => s.setFollow);
  const hasView = useGame((s) => s.view !== null);
  const hiding = useGame((s) => isHider(s.view));
  const watching = useGame((s) => isHider(s.view) && !!s.view.lock);
  const [base, setBase] = useState<BaseMap | null>(null);
  /** The pointer over the map: on the street, where a click would walk to. */
  const [pointer, setPointer] = useState<{ at: LonLat; x: number; y: number } | null>(null);
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
    b.onPointer((p) => setPointer(p));
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
    const build = createLayerBuilder();
    let version = 0;
    let round: RoundData = buildRound(world, useGame.getState().view, version);
    let trains: Train[] = [];
    let lastTrains = 0;
    let lastFrame = performance.now();
    let raf = 0;
    /** The search circle the map last framed. */
    let framed: number | null = null;
    let veiled: number | null = null;
    let enteredAt: number | null = null;
    // Motion clocks (real ms): when the game's layers came in, when the search circle
    // started drawing, when the preview shape changed, when the round was found.
    const shownAt = performance.now();
    let searchSince = 0;
    let shapeSince = 0;
    let lastShape: Shape | null = null;
    let foundSince = 0;
    const decel = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
    const reduced = reducedMotion();

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
      // The hider's zone too, which draws once they settle.
      const hider = useGame.getState().view?.hider;
      const c = hider == null ? undefined : world.ds.complexes[hider];
      if (c) pts.push(...frameAround(c, ZONE_RADIUS_M));
      if (pts.length === 0) return;
      const lons = pts.map((p) => p[0]);
      const lats = pts.map((p) => p[1]);
      // Clear of the legend at the top left and the replay's bar at the bottom.
      base.fitBounds(
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
        { top: 60, right: 70, bottom: 130, left: 40 },
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
        replayScene = replaySceneAt(world, replay, t, now);
        const head = replayScene.seekerPath.at(-1);
        me = head ? { position: head, label: "You" } : null;
      } else {
        const { view, follow: following } = useGame.getState();
        if (view) {
          const position = world.geo.playerPosition(ownTransit(view), t);
          me = { position, label: meLabel(world, view, t) };
          if (following)
            base.setCenter(
              isHider(view) && view.lock ? world.geo.playerPosition(view.seeker, t) : position,
            );
          search = isHider(view)
            ? view.zone && !view.lock && view.station !== null
              ? {
                  complex: world.ds.stations[view.station]?.complex ?? 0,
                  ring: [],
                  possible: [],
                }
              : null
            : searchScene(world, view, t);
          shape = shapeFor(world, view, t, search);
          if (isHider(view) && view.entered && view.zone && view.entered.at !== enteredAt) {
            enteredAt = view.entered.at;
            base.frameCircle(view.zone, view.zone.radius);
          }
          // Coming up to the street: frame the search circle (the design's "Search area"),
          // so it nearly fills the strip. Again whenever the strip resizes (below).
          if (search && search.complex !== framed) {
            const c = world.ds.complexes[search.complex];
            if (c) base.frameCircle(c, ZONE_RADIUS_M);
          }
          framed = search?.complex ?? null;
        }
      }
      // The search area blurs and veils the map outside its circle.
      const veilAt = search?.complex ?? null;
      if (veilAt !== veiled) {
        const c = veilAt === null ? undefined : world.ds.complexes[veilAt];
        base.setVeil(c ? { lat: c.lat, lon: c.lon, meters: ZONE_RADIUS_M } : null);
        if (veilAt !== null) searchSince = now;
        veiled = veilAt;
      }
      if (shape !== lastShape) {
        shapeSince = now;
        lastShape = shape;
      }
      const { view: v } = useGame.getState();
      // In the replay the find is at the end, so the spot waits for it.
      const spot =
        v?.result?.kind === "found" && (!replay.active || replay.t >= replay.end)
          ? v.spotNearby
          : null;
      if (spot && foundSince === 0) foundSince = now;
      if (!spot) foundSince = 0;
      const motion = useMotion.getState();
      const layers = build({
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
        shapeGrow: reduced ? 1 : decel((now - shapeSince) / 300),
        searchGrow: reduced ? 1 : decel((now - searchSince) / 400),
        fadeIn: reduced ? 1 : Math.min(1, (now - shownAt) / 400),
        found: spot
          ? { position: [spot.lon, spot.lat], set: reduced ? 1 : decel((now - foundSince) / 160) }
          : null,
      });
      // Null: nothing on the map has changed since the last frame.
      if (layers)
        base.setLayers(
          isHider(v) && !replay.active ? [...layers, ...hideLayers(world, v, t)] : layers,
        );
    };
    tick();
    // The map shrinks to a strip under Street View: frame the search area again once it has.
    const resized = new ResizeObserver(() => {
      const c = framed === null ? undefined : world.ds.complexes[framed];
      if (c) base.frameCircle(c, ZONE_RADIUS_M);
    });
    if (container.current) resized.observe(container.current);

    return () => {
      resized.disconnect();
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
      {world && hasView && !mapFailed && !hiding && <MapLegend world={world} />}
      {world && pointer && <WalkHere world={world} pointer={pointer} />}
      {hasView && (
        // "Following you" is a map state, so it's a toggle on the map, beside the zoom buttons.
        <div className="absolute right-[58px] z-10" style={{ bottom: Math.max(28, credits + 8) }}>
          <FollowToggle
            on={follow && !mapFailed}
            disabled={!!mapFailed}
            label={mapFailed ? "No map" : watching ? "Following the seeker" : "Following you"}
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
export function MapFailed({ reason, onReload }: { reason: string; onReload: () => void }) {
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

/**
 * On the street, hovering the map shows a square target and how long the walk takes, so a
 * click is never a surprise (DESIGN.md, Street endgame: the map strip).
 */
function WalkHere({
  world,
  pointer,
}: {
  world: World;
  pointer: { at: LonLat; x: number; y: number };
}) {
  const view = useGame((s) => s.view);
  const speed = useGame((s) => s.sync?.speed ?? 6);
  const t = nowGameTime();
  if (!view || t === null || view.result || (isHider(view) && view.lock)) return null;
  const s = resolve(ownTransit(view), t, world.idx);
  if (s.kind !== "street") return null;
  const here = streetPoint(s, world.idx);
  const to = { lat: pointer.at[1], lon: pointer.at[0] };
  const station = world.ds.complexes[s.complex];
  // A hider in sight can be walked to past the radius (the engine allows the same).
  const toward = view.spotNearby && distanceMeters(view.spotNearby, to) <= SPOT_REVEAL_METERS;
  const tooFar =
    station &&
    !toward &&
    distanceMeters(station, to) > (isHider(view) ? ZONE_RADIUS_M : STREET_RADIUS_M);
  const seconds = Math.max(1, Math.round(walkSeconds(here, to) / speed));
  return (
    <div className="pointer-events-none absolute z-10" style={{ left: pointer.x, top: pointer.y }}>
      <i className="absolute -top-[9px] -left-[9px] block h-[18px] w-[18px] shadow-[inset_0_0_0_2px_var(--color-ink),0_0_0_2px_var(--color-glaze-hi)]" />
      <span className="absolute -top-3 left-4">
        <Caption tone="light">
          {tooFar ? "Too far from your station" : `Walk here · ${seconds} s`}
        </Caption>
      </span>
    </div>
  );
}
