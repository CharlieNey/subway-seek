/**
 * The timing of a card landing on the seeker and of its effect (DESIGN.md, Motion › Curse
 * lands), as pure functions: the landing store and the components use them.
 */
import type { CardEvent, CardId } from "@subway-seek/engine";

export const RISE_MS = 280;
export const HOLD_MS = 1600;
export const SHRINK_MS = 400;
export const LAND_MS = RISE_MS + HOLD_MS + SHRINK_MS;
/** A play is fresh if it was seen within this much real time of being played. */
export const FRESH_MS = 1500;

export interface Landing {
  key: string;
  card: CardId;
  /** Real ms (performance.now) when it starts to rise, and when it's in its chip. */
  start: number;
  end: number;
}

export const eventKey = (e: CardEvent) => `${e.card}@${e.t}`;

/** Queue fresh plays behind whatever is still landing, in the order they were played. */
export function schedule(queue: readonly Landing[], fresh: readonly CardEvent[], now: number) {
  const out = queue.filter((l) => l.end > now);
  let free = Math.max(now, out.at(-1)?.end ?? now);
  for (const e of fresh) {
    out.push({ key: eventKey(e), card: e.card, start: free, end: free + LAND_MS });
    free += LAND_MS;
  }
  return out;
}

/** Where a landing is at `now`: rising, holding, shrinking, or done. */
export function landingPhase(l: Landing, now: number) {
  const u = now - l.start;
  if (u < 0) return { phase: "waiting" as const, p: 0 };
  if (u < RISE_MS) return { phase: "rise" as const, p: u / RISE_MS };
  if (u < RISE_MS + HOLD_MS) return { phase: "hold" as const, p: (u - RISE_MS) / HOLD_MS };
  if (u < LAND_MS) return { phase: "shrink" as const, p: (u - RISE_MS - HOLD_MS) / SHRINK_MS };
  return { phase: "done" as const, p: 1 };
}

export const SWEEP_MS = 900;
export const SET_MS = 160;
const decel = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/** How set the tile at a diagonal position k (0 top left, 1 bottom right) is, `ms` in. */
export function tileSet(k: number, ms: number, leaving: boolean): number {
  const delay = (leaving ? 1 - k : k) * (SWEEP_MS - SET_MS);
  const u = decel((ms - delay) / SET_MS);
  return leaving ? 1 - u : u;
}
