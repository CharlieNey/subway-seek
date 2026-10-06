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

/** The Signal loss curse: the map is covered; the departure boards in the panel still work. */
function SignalLoss({ until, t }: { until: number | undefined; t: number | null }) {
  const left = until !== undefined && t !== null ? Math.max(1, Math.ceil((until - t) / 60)) : null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-300">
      <div className="max-w-xs text-center text-sm text-stone-700">
        <div className="text-base font-semibold">Signal loss</div>
        <p className="mt-1">
          The hider cursed your map{left ? ` for ${left} more min` : ""}. Departure boards still
          work: "Please listen for announcements."
        </p>
      </div>
    </div>
  );
}
