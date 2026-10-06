import { useEffect } from "react";
import { useLinkScreen } from "./Connection.tsx";
import { cn } from "./cn.ts";
import { startGame, useGame } from "./game.ts";
import { cursed } from "./HiderCards.tsx";
import { MapView } from "./MapView.tsx";
import { Panel } from "./Panel.tsx";
import { ReplayControls } from "./ReplayControls.tsx";
import { StreetView } from "./StreetView.tsx";
import { onStreet } from "./street.ts";
import { Caption } from "./ui/vocab.tsx";
import { useGameTime } from "./useGameTime.ts";

export function App() {
  useEffect(() => {
    void startGame();
  }, []);
  const { view, world, everOpen } = useGame();
  const t = useGameTime(4);
  const link = useLinkScreen();
  // Can't reach the server before the round: the map waits under a glaze veil.
  const veiled = !everOpen && (link.kind === "unreachable" || link.kind === "takenOver");
  // On the street, Street View takes the top of the screen and the map shrinks below it.
  const street = onStreet(view, t, world);

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-glaze text-ink">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Kept mounted once created: one Street View panorama per page keeps billing down. */}
        <div className={cn("relative min-h-0", street ? "flex-[3]" : "hidden")}>
          <StreetView visible={street} />
        </div>
        {/* The trim band between street and map, like the trim line on a platform wall. */}
        {street && <div className="sc-trim h-2.5 flex-none" />}
        <div className={cn("relative min-h-0", street ? "flex-[2]" : "flex-1")}>
          <MapView />
          {veiled && <span className="sc-veil strong z-20" />}
          <ReplayControls />
          {cursed(view, "signalLoss", t) && (
            <SignalLoss until={cursed(view, "signalLoss", t)?.until} t={t} />
          )}
        </div>
      </div>
      <Panel />
    </main>
  );
}

/**
 * The Signal loss curse: glazed tiles over the map, leaving the departure boards. A curse
 * is terra cotta's job; the boards in the panel still work.
 */
function SignalLoss({ until, t }: { until: number | undefined; t: number | null }) {
  const left = until !== undefined && t !== null ? Math.max(1, Math.ceil((until - t) / 60)) : null;
  return (
    <div className="sc-tilefield absolute inset-0 z-20 flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-center">
        <Caption tone="terra">Signal loss{left ? ` · ${left} min` : ""}</Caption>
        <p className="max-w-xs text-[13px] text-ink-2">
          Your map is hidden. The departure boards still work.
        </p>
      </div>
    </div>
  );
}
