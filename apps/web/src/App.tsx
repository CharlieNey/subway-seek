import { useEffect } from "react";
import { startGame } from "./game.ts";
import { MapView } from "./MapView.tsx";
import { Panel } from "./Panel.tsx";
import { ReplayControls } from "./ReplayControls.tsx";

export function App() {
  useEffect(() => {
    void startGame();
  }, []);

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-stone-100 text-stone-900">
      <div className="relative min-w-0 flex-1">
        <MapView />
        <ReplayControls />
      </div>
      <Panel />
    </main>
  );
}
