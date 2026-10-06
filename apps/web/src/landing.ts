/**
 * Card plays landing on the seeker (DESIGN.md, Motion › Curse lands): the card rises 24 px
 * into place at center (band), holds 1.6 s, then shrinks into its status chip (400 ms).
 * The curse's effect starts once it's in the chip. One choreography at a time (Motion
 * rule 7): a second play queues behind the first. Only plays seen as they happen land; a
 * refresh shows the chip and the effect in place.
 */
import { CARDS, type CardEvent, type SoloView, syncedGameTime } from "@stand-clear/engine";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { reducedMotion } from "./clearings.ts";
import { eventKey, FRESH_MS, type Landing, schedule } from "./curseMotion.ts";
import { useGame } from "./game.ts";

export type { Landing };

interface LandingStore {
  queue: Landing[];
  /** When each play seen this session reached its chip (real ms); refreshes start empty. */
  landedAt: Record<string, number>;
}

export const useLandings = create<LandingStore>(() => ({ queue: [], landedAt: {} }));

/**
 * Whether a play is in its chip yet, so its chip and its effect can show. A play that
 * landed before this page loaded is in at once. `key` is `card@at`.
 */
export function useLanded(key: string | null): boolean {
  const end = useLandings((s) => (key ? (s.landedAt[key] ?? 0) : 0));
  const [, wake] = useState(0);
  useEffect(() => {
    const wait = end - performance.now();
    if (wait <= 0) return;
    const id = setTimeout(() => wake((n) => n + 1), wait);
    return () => clearTimeout(id);
  }, [end]);
  return end <= performance.now();
}

/** Watch the round for plays that land on you. */
export function watchLandings() {
  const seen = new Set<string>();
  const sync = (view: SoloView | null, gameNow: number | null, speed: number) => {
    if (!view) return;
    const fresh: CardEvent[] = [];
    for (const e of view.cardEvents) {
      const k = eventKey(e);
      if (seen.has(k)) continue;
      seen.add(k);
      const realSince =
        gameNow === null ? Number.POSITIVE_INFINITY : ((gameNow - e.t) * 1000) / speed;
      if (!view.result && realSince < FRESH_MS && CARDS[e.card].kind !== "bonus") fresh.push(e);
    }
    if (fresh.length === 0) return;
    const now = performance.now();
    if (reducedMotion()) {
      // No flight: the chip and the effect appear at once.
      const landedAt = { ...useLandings.getState().landedAt };
      for (const e of fresh) landedAt[eventKey(e)] = now;
      useLandings.setState({ landedAt });
      return;
    }
    const queue = schedule(useLandings.getState().queue, fresh, now);
    const landedAt = { ...useLandings.getState().landedAt };
    for (const l of queue) landedAt[l.key] = l.end;
    useLandings.setState({ queue, landedAt });
  };
  return useGame.subscribe((st, prev) => {
    if (st.view === prev.view) return;
    // A new round: everything in it is new to this page.
    if (prev.view && st.view && prev.view.seekStart !== st.view.seekStart) seen.clear();
    sync(st.view, st.sync ? syncedGameTime(st.sync, Date.now()) : null, st.sync?.speed ?? 6);
  });
}
