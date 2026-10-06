import { resolve, streetPoint, type Walking } from "@stand-clear/engine";
import { useEffect, useRef, useState } from "react";
import { cn } from "./cn.ts";
import {
  ARROW_GLYPH,
  arrowLinks,
  bearing,
  compassArrow,
  compassLetters,
  compassWord,
} from "./compass.ts";
import { useGame } from "./game.ts";
import { cursed } from "./HiderCards.tsx";
import { ARROWS, type Arrow } from "./keys.ts";
import { useLanded } from "./landing.ts";
import { chooseProvider } from "./map/baseMap.ts";
import { loadGoogleMaps } from "./map/loadGoogle.ts";
import { play } from "./sound.ts";
import { nearestPano, panoPoint } from "./street.ts";
import { Button, Caption, Kbd, Num, Plaque, TileTimer } from "./ui/vocab.tsx";
import { useGameTime } from "./useGameTime.ts";

/**
 * The street endgame: Google Street View where you're standing. Google's own
 * click-to-move is off — you move with the direction buttons (or by clicking the map),
 * so the server can time every step at walking speed.
 */
const PANORAMA_OPTIONS: google.maps.StreetViewPanoramaOptions = {
  addressControl: false, // street names and addresses would give the location away
  showRoadLabels: false,
  clickToGo: false,
  linksControl: false,
  fullscreenControl: false,
  motionTracking: false,
  motionTrackingControl: false,
  enableCloseButton: false,
  imageDateControl: false,
  zoomControl: true,
  panControl: true,
};

export function StreetView({ visible }: { visible: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  /** The panorama the game put you in; anything else (e.g. arrow keys) snaps back. */
  const expectedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [links, setLinks] = useState<google.maps.StreetViewLink[]>([]);
  /** Which way you're looking, for the "Facing N" caption. */
  const [heading, setHeading] = useState(0);
  /** Why the imagery didn't arrive, while it hasn't. */
  const [failed, setFailed] = useState<string | null>(null);
  /** Bumped by "Try again". */
  const [retry, setRetry] = useState(0);
  const { world, view, send, busy } = useGame();
  const t = useGameTime(4);
  const usesGoogle = chooseProvider() === "google";

  // One panorama, created the first time you're on the street and reused after.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `retry` is the try-again trigger
  useEffect(() => {
    if (!visible || panoRef.current || !el.current || !usesGoogle) return;
    let cancelled = false;
    void loadGoogleMaps()
      .then(() => google.maps.importLibrary("streetView"))
      .then(() => {
        if (cancelled || !el.current) return;
        const p = new google.maps.StreetViewPanorama(el.current, {
          ...PANORAMA_OPTIONS,
          visible: true,
        });
        p.addListener("status_changed", () => {
          const status = p.getStatus();
          setFailed(status === google.maps.StreetViewStatus.OK ? null : `Status ${status}`);
        });
        p.addListener("pov_changed", () => setHeading(p.getPov().heading ?? 0));
        p.addListener("links_changed", () =>
          setLinks((p.getLinks() ?? []).filter((l): l is google.maps.StreetViewLink => !!l?.pano)),
        );
        // Moving is the server's job (it times every step), so undo any move Street
        // View makes on its own, like arrow-key navigation.
        p.addListener("pano_changed", () => {
          const expected = expectedRef.current;
          if (expected && p.getPano() !== expected) p.setPano(expected);
        });
        panoRef.current = p;
        if (import.meta.env.DEV) (window as unknown as { __pano: typeof p }).__pano = p;
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailed(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [visible, usesGoogle, retry]);

  // Re-measure when the pane reappears.
  useEffect(() => {
    if (visible && panoRef.current) google.maps.event.trigger(panoRef.current, "resize");
  }, [visible]);

  const s = world && view && t !== null ? resolve(view.seeker, t, world.idx) : null;
  const standing = s?.kind === "street" ? s : null;
  const standingKey = standing
    ? (standing.at?.pano ?? `exit:${standing.complex}:${standing.exit}`)
    : null;

  // Show where you're standing: the panorama you walked to, or the one nearest your exit.
  const standingPano = standing?.at?.pano ?? null;
  const standingPoint = standing && world ? streetPoint(standing, world.idx) : null;
  // standingKey captures everything that matters about where you stand; `retry` shows
  // it again after a failure.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on standingKey on purpose
  useEffect(() => {
    const p = panoRef.current;
    if (!ready || !p || !standingKey) return;
    const show = (pano: string) => {
      expectedRef.current = pano;
      if (p.getPano() !== pano) p.setPano(pano);
      else setFailed(null);
    };
    if (standingPano) return show(standingPano);
    if (!standingPoint) return;
    void nearestPano(standingPoint.lat, standingPoint.lon, 60).then((found) => {
      if (found) show(found.pano);
      else setFailed("No panorama within 60 m of the exit");
    });
  }, [ready, standingKey, retry]);

  // The hider's marker, once you're close enough to see them.
  const spot = view?.spotNearby ?? null;
  const spotLat = spot?.lat ?? null;
  const spotLon = spot?.lon ?? null;
  // "Someone's here" sounds as they come into sight, not when a refresh finds them there.
  const seen = useRef(spotLat !== null);
  useEffect(() => {
    if (spotLat === null) seen.current = false;
    else if (!seen.current) {
      seen.current = true;
      if (!useGame.getState().view?.result) play("someone");
    }
  }, [spotLat]);
  useEffect(() => {
    markerRef.current?.setMap(null);
    markerRef.current = null;
    if (!ready || spotLat === null || spotLon === null || !panoRef.current) return;
    // A gold square tile with a deep-gold border: squares are game information, so it
    // replaces Google's red pin.
    const m = new google.maps.Marker({
      position: { lat: spotLat, lng: spotLon },
      map: panoRef.current,
      title: "The hider: click to catch",
      icon: {
        url: GOLD_SQUARE,
        scaledSize: new google.maps.Size(30, 30),
        anchor: new google.maps.Point(15, 15),
      },
    });
    m.addListener("click", () => useGame.getState().send({ type: "catch" }));
    markerRef.current = m;
  }, [ready, spotLat, spotLon]);

  const step = async (pano: string) => {
    const pt = await panoPoint(pano);
    if (pt) send({ type: "walkTo", lat: pt.lat, lon: pt.lon, pano: pt.pano });
  };

  const walking = s?.kind === "walking" ? s : null;
  const speed = useGame.getState().sync?.speed ?? 6;
  // Real ms since you came up the stairs (the daylight): standing at the exit, not walked off.
  const sinceArrival =
    standing && !standing.at && t !== null ? ((t - standing.since) * 1000) / speed : 9e9;
  const shed = view?.curses.some(
    (c) => c.card === "shed" && t !== null && "until" in c && t < c.until,
  );
  // The arrows walk relative to where you face: ↑ is the street ahead.
  const sortedLinks = [...links].sort((a, b) => (a.heading ?? 0) - (b.heading ?? 0));
  const arrowOf: Record<number, string> = {};
  for (const [key, i] of Object.entries(
    arrowLinks(
      heading,
      sortedLinks.map((l) => l.heading ?? 0),
    ),
  ))
    arrowOf[i] = key;
  // Fog ramps in once its card is in its chip (Motion: Curse lands).
  const fog = cursed(view, "fog", t);
  const fogLanded = useLanded(fog ? `fog@${fog.at}` : null);

  if (!usesGoogle) {
    return (
      <div className="sc-tilefield-dark flex h-full items-center justify-center p-6 text-center text-[13px] text-glaze-hi">
        Street View needs the Google map. Unset VITE_MAP_PROVIDER to use it.
      </div>
    );
  }

  return (
    // The arrow keys walk through our tiles, timed by the server: caught on the way in, so
    // a focused panorama never takes a step of its own.
    <div
      className="relative h-full w-full bg-[#3a3732]"
      onKeyDownCapture={(e) => {
        if (!ARROWS.includes(e.key as Arrow) || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        e.stopPropagation();
        const tile = e.currentTarget.querySelector<HTMLButtonElement>(`[data-key="${e.key}"]`);
        if (tile && !tile.disabled) tile.click();
      }}
    >
      {/* Its own stacking context, so Google's internal z-indexes stay below our overlays. */}
      <div ref={el} className="absolute inset-0 z-0" />
      {/* Fog: the panorama blurs, ramping in and out (Motion: Curse lands). */}
      <div
        className="pointer-events-none absolute inset-0 z-[5] backdrop-blur-[6px] transition-opacity duration-[600ms] ease-[var(--ease-decel)] motion-reduce:transition-none"
        style={{ opacity: fog && fogLanded ? 1 : 0 }}
      />
      {standing && (
        // The only text on the photo: addresses and road labels stay off.
        <div className="absolute top-3 left-3 z-10">
          <Caption>Facing {compassLetters(heading)}</Caption>
        </div>
      )}
      {spot && <CatchBand />}
      {standing && sinceArrival < 900 && (
        // Daylight at the top of the stairs: the pane brightens from the top down.
        <div className="pointer-events-none absolute inset-0 z-[6] overflow-hidden">
          <div
            className="sc-anim-daylight h-full w-full bg-[#1E1B17]"
            style={{ animationDelay: `-${Math.round(sinceArrival)}ms` }}
          />
        </div>
      )}
      {walking && walking.reason !== "street" && (
        <Stairs state={walking} t={t ?? 0} speed={speed} />
      )}
      {walking && walking.reason === "street" && (
        <WalkingBand state={walking} t={t ?? 0} speed={speed} halfSpeed={!!shed} />
      )}
      <div className="absolute inset-x-0 bottom-[30px] z-10 flex flex-wrap justify-center gap-1.5 px-3">
        {sortedLinks.map((l, i) => (
          <WalkTile
            key={l.pano}
            heading={l.heading ?? 0}
            arrow={arrowOf[i]}
            disabled={busy || !!walking}
            onClick={() => l.pano && void step(l.pano)}
          />
        ))}
      </div>
      {failed && visible && (
        <StreetViewFailed
          reason={failed}
          onRetry={() => {
            setFailed(null);
            setRetry((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

/** The hider's marker: a gold square tile with a deep-gold border and a glaze edge. */
const GOLD_SQUARE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect x="0" y="0" width="30" height="30" fill="#FBF8F1"/><rect x="2" y="2" width="26" height="26" fill="#8E6A14"/><rect x="5" y="5" width="20" height="20" fill="#C99A3A"/></svg>',
)}`;

/** One square tile per street you can take, with its arrow and compass point. */
function WalkTile({
  heading,
  arrow,
  disabled,
  onClick,
}: {
  heading: number;
  /** The arrow key that takes it ("ArrowUp"), printed small in its corner. */
  arrow?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-key={arrow}
      aria-label={`Walk ${compassWord(heading)}`}
      className="sc-focus relative flex h-[50px] w-[56px] flex-col items-center justify-center gap-0.5 bg-glaze-hi text-[18px] leading-none text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)] transition-opacity duration-[var(--dur-step)] ease-[var(--ease-decel)] active:translate-y-[2px] disabled:opacity-40"
    >
      {compassArrow(heading)}
      <b className="font-display text-[12px] font-bold tracking-[0.08em]">
        {compassLetters(heading)}
      </b>
      {arrow && (
        <span className="absolute top-[3px] right-[3px] scale-90">
          <Kbd>{ARROW_GLYPH[arrow]}</Kbd>
        </span>
      )}
    </button>
  );
}

/**
 * Walking: a band fills along the bottom at walking speed, linear (Motion rule 1), under
 * a caption with the way and the time left. Under Sidewalk shed it's hatched like
 * scaffold planks and fills at half speed: slower walking is drawn slower.
 */
function WalkingBand({
  state,
  t,
  speed,
  halfSpeed,
}: {
  state: Walking;
  t: number;
  speed: number;
  halfSpeed: boolean;
}) {
  const f = Math.min(1, Math.max(0, (t - state.start) / Math.max(1, state.end - state.start)));
  const left = Math.max(0, Math.ceil((state.end - t) / speed));
  const way = compassWord(bearing(state.fromPoint, state.toPoint));
  return (
    <div className="absolute right-3.5 bottom-[96px] left-3.5 z-10 flex flex-col items-start gap-1.5">
      <Caption>
        Walking {way} · <Num>{left} s</Num>
        {halfSpeed && " · half speed"}
      </Caption>
      <div className="h-3.5 w-full bg-[rgb(36_32_27/0.45)] shadow-[inset_0_0_0_1px_rgb(251_248_241/0.4)]">
        <i
          className="block h-full bg-glaze-hi"
          style={{
            width: `round(down, ${(f * 100).toFixed(3)}%, 14px)`,
            backgroundImage: halfSpeed
              ? "repeating-linear-gradient(135deg, transparent 0 6px, rgb(47 91 69 / 0.55) 6px 9px)"
              : "repeating-linear-gradient(90deg, transparent 0 13px, rgb(36 32 27 / 0.18) 13px 14px)",
          }}
        />
      </div>
    </div>
  );
}

/** Going up or down: stair treads fill, one per 10 game-s, on the dark pane. */
function Stairs({ state, t, speed }: { state: Walking; t: number; speed: number }) {
  const total = Math.max(1, Math.round((state.end - state.start) / 10));
  const done = Math.min(total, Math.floor((t - state.start) / 10));
  const left = Math.max(0, Math.ceil((state.end - t) / speed));
  // Going back down: the dark comes in from the top, the daylight in reverse.
  const since = ((t - state.start) * 1000) / speed;
  return (
    <div
      className={cn(
        "sc-tilefield-dark absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5",
        state.reason === "enter" && since < 900 && "sc-anim-dusk",
      )}
      style={
        state.reason === "enter" && since < 900
          ? { animationDelay: `-${Math.round(since)}ms` }
          : undefined
      }
    >
      <Caption>
        {state.reason === "exit"
          ? "Up to the street"
          : state.reason === "enter"
            ? "Back down"
            : "Changing on foot"}{" "}
        · <Num>{left} s</Num>
      </Caption>
      <TileTimer total={total} left={done} size={11} onDark />
    </div>
  );
}

/**
 * Someone's here: the screen's one express band, ink with gold trim, at the top center.
 * The seeker gets it only within 40 m; the hider's gold marker sets beside it.
 */
function CatchBand() {
  return (
    // It unrolls from the top of Street View after a two-frame hold (33 ms), the beat the
    // sound lands on.
    <div role="status" className="absolute top-0 left-1/2 z-10 -translate-x-1/2">
      <div
        className="sc-grid-lines sc-anim-unroll flex flex-col items-center gap-0.5 bg-ink px-[22px] pt-3 pb-2.5 text-glaze-hi [--grid:0.1] shadow-[inset_0_-5px_0_var(--color-gold),inset_0_5px_0_var(--color-gold)]"
        style={{ animationDelay: "33ms" }}
      >
        <b className="font-display text-[15px] font-bold tracking-[0.12em] uppercase">
          Someone's here
        </b>
        <span className="text-[12px] opacity-[0.82]">Click them to catch</span>
      </div>
    </div>
  );
}

/**
 * Street View didn't load: the pane keeps its place, with a dark tile field and the
 * plaque. The walk still counted; the map and the questions work.
 */
function StreetViewFailed({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  return (
    <div className="sc-tilefield-dark absolute inset-0 z-30 flex items-center justify-center p-4">
      <Plaque
        className="w-[360px] max-w-full"
        title="Street View didn't load"
        safe="You're still here, and the walk counted. The map and your questions work."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button kind="ink" onClick={onRetry}>
              Try again
            </Button>
          </div>
        }
        details={reason}
      >
        <p>Google's imagery for this corner didn't arrive.</p>
      </Plaque>
    </div>
  );
}
