import { lazy, Suspense } from "react";
import { GAME_NAME } from "./brand.ts";
import "./playLayout.css";

const Game = lazy(() => import("./App.tsx").then(({ App }) => ({ default: App })));

/**
 * The game. Any screen plays: a computer beside the map, a phone stacked under it, its
 * rounds ending at the station (layout.ts; DESIGN.md, Phones). `?tryAnyway`, from older
 * links, is ignored.
 */
export function PlayPage() {
  return (
    <Suspense fallback={<p className="p-6">Opening {GAME_NAME}…</p>}>
      <Game />
    </Suspense>
  );
}
