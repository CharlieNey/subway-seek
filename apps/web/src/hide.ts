/** Role-aware presentation helpers. The hider's actual seeker view stays intact. */
import {
  CARDS,
  CURSE_GAP_SECONDS,
  type HiderView,
  nextStopIndex,
  resolve,
  type SoloView,
} from "@stand-clear/engine";
import type { World } from "./game.ts";

export function isHider(view: SoloView | null | undefined): view is HiderView {
  return !!view && "role" in view && view.role === "hider";
}
export const ownTransit = (view: SoloView) => (isHider(view) ? view.self : view.seeker);
export function cardBlocker(view: HiderView, card: number, t: number, world: World): string | null {
  const id = view.hand[card];
  if (!id) return "That card is no longer in your hand.";
  const def = CARDS[id];
  if (view.draw) return "Keep your drawn cards first.";
  if (def.kind === "bonus") return "Time bonuses count if you're still holding them";
  if (id === "veto" || id === "randomize") return "Played when a question arrives";
  const cost = id === "redraw" ? 2 : (def.cost ?? 0);
  if (view.hand.length <= cost) return `Choose ${cost} cards to discard`;
  if (id === "redraw") return null;
  const last = Math.max(
    -Infinity,
    ...view.cardEvents.filter((e) => CARDS[e.card].kind === "curse").map((e) => e.t),
  );
  if (t < view.seekStart || view.curses.length || t < last + CURSE_GAP_SECONDS)
    return "Wait until another curse is ready.";
  if (id === "tourist" || id === "wrongWay") {
    const s = resolve(view.seeker, t, world.idx);
    if (s.kind !== "train" || nextStopIndex(s, t, world.idx) === null)
      return "Play this while the seeker is riding.";
  }
  return null;
}
