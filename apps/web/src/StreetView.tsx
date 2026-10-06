import { resolve, streetPoint } from "@stand-clear/engine";
import { useEffect, useRef, useState } from "react";
import { cn } from "./cn.ts";
import { useGame } from "./game.ts";
import { cursed } from "./HiderCards.tsx";
import { chooseProvider } from "./map/baseMap.ts";
import { loadGoogleMaps } from "./map/loadGoogle.ts";
import { compass, nearestPano, panoPoint } from "./street.ts";
import { Button, Plaque } from "./ui/vocab.tsx";
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
  useEffect(() => {
    markerRef.current?.setMap(null);
    markerRef.current = null;
    if (!ready || spotLat === null || spotLon === null || !panoRef.current) return;
    const m = new google.maps.Marker({
      position: { lat: spotLat, lng: spotLon },
      map: panoRef.current,
      title: "The hider — click to catch",
    });
    m.addListener("click", () => useGame.getState().send({ type: "catch" }));
    markerRef.current = m;
  }, [ready, spotLat, spotLon]);

  const step = async (pano: string) => {
    const pt = await panoPoint(pano);
    if (pt) send({ type: "walkTo", lat: pt.lat, lon: pt.lon, pano: pt.pano });
  };

  const walking = s?.kind === "walking";
  const status =
    s?.kind === "walking"
      ? s.reason === "exit"
        ? "Heading up to the street…"
        : `Walking… ${Math.max(0, Math.ceil(s.end - (t ?? 0)))} s`
      : null;

  if (!usesGoogle) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-200 p-6 text-center text-sm text-stone-600">
        Street View needs the Google map. Unset VITE_MAP_PROVIDER to use it.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-stone-300">
      {/* Its own stacking context, so Google's internal z-indexes stay below our overlays. */}
      <div ref={el} className="absolute inset-0 z-0" />
      {failed && visible && (
        <StreetViewFailed
          reason={failed}
          onRetry={() => {
            setFailed(null);
            setRetry((n) => n + 1);
          }}
        />
      )}
      {cursed(view, "fog", t) && (
        // Fog: blurred, but you can still walk (and the marker still shows when you're close).
        <div className="pointer-events-none absolute inset-0 z-[5] backdrop-blur-md" />
      )}
      {spot && (
        <div className="absolute inset-x-0 top-3 z-10 flex justify-center">
          <span className="rounded-full bg-red-600 px-3 py-1 text-sm font-semibold text-white shadow">
            Someone's here — click them to catch
          </span>
        </div>
      )}
      {status && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/25">
          <span className="rounded-md bg-white/95 px-3 py-1.5 text-sm font-semibold">{status}</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-9 z-10 flex flex-wrap justify-center gap-1.5 px-3">
        {[...links]
          .sort((a, b) => (a.heading ?? 0) - (b.heading ?? 0))
          .map((l) => (
            <button
              key={l.pano}
              type="button"
              disabled={busy || walking}
              onClick={() => l.pano && void step(l.pano)}
              className={cn(
                "rounded-md bg-white/95 px-2.5 py-1 text-xs font-semibold text-stone-800 shadow",
                "hover:bg-white disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              Walk {compass(l.heading ?? 0)}
            </button>
          ))}
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
