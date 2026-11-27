/**
 * The next move on screen (nextMove.ts): the panel works it out once per moment, and the
 * control it points at reads it from context to draw its outline.
 */
import { type Question, questionKey, type SoloView } from "@subway-seek/engine";
import { createContext, useContext, useMemo, useRef } from "react";
import type { World } from "./game.ts";
import { useFirstRound } from "./learn.ts";
import { type Hold, type NextMove, type NextTarget, nextMove } from "./nextMove.ts";
import { useNotHereList } from "./notHere.ts";

const NONE: NextTarget = { kind: "none" };

export const NextTargetContext = createContext<NextTarget>(NONE);

export function useNextTarget(): NextTarget {
  return useContext(NextTargetContext);
}

/** Whether `q` is the question the line suggests. */
export function useIsNextQuestion(q: Question): boolean {
  const target = useNextTarget();
  return target.kind === "question" && questionKey(target.q) === questionKey(q);
}

/**
 * The move for this moment. Worked out again when the view, the tab or the armed question
 * changes, and every 15 game-seconds (2.5 s real) as departures come and go.
 */
export function useNextMove(
  world: World | null,
  view: SoloView | null,
  t: number | null,
  tab: "travel" | "ask",
  armed: Question | null,
  armedReady: boolean,
): NextMove | null {
  const firstRound = useFirstRound();
  const notHere = useNotHereList(view);
  const hold = useRef<Hold | null>(null);
  const bucket = t === null ? null : Math.floor(t / 15);
  const armedKey = armed ? questionKey(armed) : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: t moves in 15 s steps; armed by key
  return useMemo(() => {
    if (!world || !view || t === null) return null;
    const move = nextMove({
      idx: world.idx,
      view,
      t,
      tab,
      armed,
      armedReady,
      // A suggested question helps you learn; the daily stays a puzzle (DESIGN.md).
      suggest: !view.daily,
      firstRound,
      notHere,
      hold: hold.current,
    });
    hold.current = move?.hold ?? null;
    return move;
  }, [world, view, bucket, tab, armedKey, armedReady, firstRound, notHere]);
}

export { NONE as NO_TARGET };
