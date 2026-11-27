import { useEffect, useRef } from "react";
import { CardLanding } from "./CardLanding.tsx";
import { cn } from "./cn.ts";
import { linkScreen } from "./connection.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { startGame, useGame } from "./game.ts";
import { cursed } from "./HiderCards.tsx";
import { HiderMapBand } from "./HiderMapBand.tsx";
import { isHider } from "./hide.ts";
import { watchLandings } from "./landing.ts";
import { usePlayLayout, useSheet } from "./layout.ts";
import { MapFailed, MapView } from "./MapView.tsx";
import { useAttributionClearance } from "./map/attribution.ts";
import { Panel } from "./Panel.tsx";
import { ReplayControls } from "./ReplayControls.tsx";
import { SignalLoss } from "./SignalLoss.tsx";
import { StreetView, StreetViewFailed } from "./StreetView.tsx";
import { onStreet } from "./street.ts";
import { useClockValue } from "./useGameTime.ts";

/**
 * Can't reach the server before the round: the map waits under a glaze veil. Read from
 * the link itself, not the 4 Hz link screen, so its countdown doesn't re-render the page.
 */
function useVeiled(everOpen: boolean): boolean {
  const link = useGame((s) => s.link);
  return (
    !everOpen &&
    (link.kind === "takenOver" || linkScreen(link, everOpen, Date.now()).kind === "unreachable")
  );
}

export function App() {
  useEffect(() => {
    void startGame();
  }, []);
  useEffect(() => watchLandings(), []);
  const view = useGame((s) => s.view);
  const world = useGame((s) => s.world);
  const everOpen = useGame((s) => s.everOpen);
  // On a phone the map stacks over the panel, which folds like a sheet (playLayout.css);
  // a replay with no round keeps a fixed split of map and log.
  const replayOnly = useGame((s) => s.replayOnly);
  const stack = usePlayLayout() === "stack";
  const sheet = useSheet((s) => s.sheet);
  const veiled = useVeiled(everOpen);
  // On the street, Street View takes the top of the screen and the map shrinks below it.
  // The top of the tree re-renders only when these change, not with the clock.
  const street = useClockValue((t) => onStreet(view, t, world));
  const signalLoss = useClockValue((t) => (isHider(view) ? null : cursed(view, "signalLoss", t)));
  // Overlays on the map keep clear of its own credits (Google's logo and Terms).
  const mapBox = useRef<HTMLDivElement>(null);
  const credits = useAttributionClearance(mapBox);

  return (
    <main
      className={cn(
        "flex h-screen w-screen overflow-hidden bg-glaze text-ink",
        stack && "sc-play-stack",
        stack && replayOnly && "sc-play-replay",
      )}
      data-sheet={stack && !replayOnly ? sheet : undefined}
    >
      <div className="sc-play-map flex min-w-0 flex-1 flex-col">
        {/* Kept mounted once created: one Street View panorama per page keeps billing down. */}
        <div className={cn("relative min-h-0", street ? "flex-[3]" : "hidden")}>
          <ErrorBoundary
            fallback={(error, reset) => <StreetViewFailed reason={error.message} onRetry={reset} />}
          >
            <StreetView visible={street} />
          </ErrorBoundary>
        </div>
        {/* The trim band between street and map, like the trim line on a platform wall. */}
        {street && <div className="sc-trim h-2.5 flex-none" />}
        <div ref={mapBox} className={cn("relative min-h-0", street ? "flex-[2]" : "flex-1")}>
          <ErrorBoundary
            fallback={(error, reset) => <MapFailed reason={error.message} onReload={reset} />}
          >
            <MapView credits={credits} />
          </ErrorBoundary>
          {veiled && <span className="sc-veil strong z-20" />}
          <ReplayControls credits={credits} />
          <HiderMapBand />
          <SignalLoss curse={signalLoss} />
        </div>
      </div>
      <Panel />
      <CardLanding />
    </main>
  );
}
