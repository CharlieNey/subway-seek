import { useEffect } from "react";
import { cn } from "./cn.ts";
import { startGame, useGame } from "./game.ts";
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
  const { view, world } = useGame();
  const t = useGameTime(4);
  // On the street, Street View takes the top of the screen and the map shrinks below it.
  const street = onStreet(view, t, world);

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-stone-100 text-stone-900">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Kept mounted once created: one Street View panorama per page keeps billing down. */}
        <div className={cn("relative min-h-0", street ? "flex-[3]" : "hidden")}>
          <StreetView visible={street} />
        </div>
        <div className={cn("relative min-h-0", street ? "flex-[2]" : "flex-1")}>
          <MapView />
          <ReplayControls />
        </div>
      </div>
      <Panel />
    </main>
  );
}
