/**
 * The elimination in flight (DESIGN.md, Motion › Elimination), shared by the map, which
 * draws the boundary and lifts the squares, and the panel, whose count steps down one per
 * lift. Computed when an answer lands while you watch; a refresh shows the end state.
 */
import {
  type Answer,
  type AskedQuestion,
  isAnswered,
  type SeenQuestion,
  type SoloView,
} from "@stand-clear/engine";
import { create } from "zustand";
import { useGame, type World } from "./game.ts";
import { type Clearing, clearingFor } from "./map/eliminate.ts";
import { searchScene } from "./searchArea.ts";

interface MotionStore {
  /** Stations clearing after the latest answer. */
  clearing: Clearing | null;
  /** Search tiles clearing after an on-foot answer; ids are tile keys' indices in `tiles`. */
  tiles: { clearing: Clearing; tiles: [number, number][] } | null;
  /** When the round ended while you watched (real ms), so the result sets; null after a refresh. */
  ended: number | null;
}

export const useMotion = create<MotionStore>(() => ({ clearing: null, tiles: null, ended: null }));

export const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The answers that landed between two views, in the order they landed. */
function landed(prev: SoloView, next: SoloView): AskedQuestion[] {
  const before = new Set(prev.asked.filter(isAnswered).map((a) => a.at));
  return next.asked
    .filter((a: SeenQuestion): a is AskedQuestion => isAnswered(a) && !before.has(a.at))
    .sort((a, b) => a.answerAt - b.answerAt);
}

const tileKey = ([lon, lat]: [number, number]) => `${lon.toFixed(7)},${lat.toFixed(7)}`;

/** Watch the round: when an answer lands, schedule what it clears. */
export function watchClearings(getWorld: () => World | null) {
  return useGame.subscribe((st, prevSt) => {
    const world = getWorld();
    const prev = prevSt.view;
    const next = st.view;
    if (!world || !prev || !next || prev === next) return;
    if (prev.seekStart !== next.seekStart || prev.hub !== next.hub) {
      useMotion.setState({ ended: null });
      return;
    }
    // The end of the round: the result sets (Found, Score tally); nothing clears.
    if (next.result) {
      if (!prev.result) useMotion.setState({ ended: performance.now() });
      return;
    }
    const answers = landed(prev, next);
    const a = answers.at(-1);
    if (!a) return;
    const now = performance.now();
    const reduced = reducedMotion();
    const kept = new Set(next.candidates);
    const cleared = prev.candidates
      .filter((c) => !kept.has(c))
      .flatMap((c) => {
        const cx = world.ds.complexes[c];
        return cx ? [{ id: c, at: { lat: cx.lat, lon: cx.lon }, complex: c }] : [];
      });
    if (cleared.length > 0) {
      useMotion.setState({
        clearing: clearingFor(world.ds, a.q, a.answer as Answer, a.ctx, cleared, now, reduced),
      });
    }
    if (a.q.kind === "spotRadar" || a.q.kind === "spotThermometer") {
      const t = a.answerAt;
      const before = searchScene(world, prev, t);
      const after = searchScene(world, next, t + 0.001);
      if (!before || !after) return;
      const still = new Set(after.possible.map(tileKey));
      const gone = before.possible.filter((p) => !still.has(tileKey(p)));
      const clearing = clearingFor(
        world.ds,
        a.q,
        a.answer as Answer,
        a.ctx,
        gone.map(([lon, lat], i) => ({ id: i, at: { lat, lon } })),
        now,
        reduced,
      );
      useMotion.setState({ tiles: { clearing, tiles: gone } });
    }
  });
}
