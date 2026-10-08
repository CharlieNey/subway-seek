/** Real-clock pacing around the view-only seeker policy. No timers or round access. */
import type { Difficulty } from "./hardness.ts";
import {
  newSeekerMemory,
  SEEKER_DEFAULTS,
  type SeekerMemory,
  type SeekerOptions,
  seekerRejected,
  seekerStep,
} from "./seekerBot.ts";
import type { SoloIntent, SoloView } from "./solo.ts";
import type { TimetableIndex } from "./timetable.ts";
import { resolve } from "./transit.ts";

export const SEEKER_ACTION_REAL_SECONDS = 3;
export const SEEKER_LEVELS: Record<Difficulty, SeekerOptions> = {
  easy: { ...SEEKER_DEFAULTS, endgameAt: 4, minBits: 0.25 },
  normal: { ...SEEKER_DEFAULTS, endgameAt: 3, minBits: 0.25 },
  hard: { ...SEEKER_DEFAULTS, endgameAt: 2, minBits: 0.25 },
};
export interface SeekerDriver {
  memory: SeekerMemory;
  lastActionAt: number;
  waitUntil: number;
  /** Only the remainder of an issued plan; never serialized or sent to the hider. */
  pending: { intents: SoloIntent[]; trip: number | null } | null;
  knowledge: string;
}
export type DrivenSeeker = { driver: SeekerDriver; intent: SoloIntent | null; waitUntil: number };

export function createSeekerDriver(lastActionAt = Number.NEGATIVE_INFINITY): SeekerDriver {
  return {
    memory: newSeekerMemory(),
    lastActionAt,
    waitUntil: Number.NEGATIVE_INFINITY,
    pending: null,
    knowledge: "",
  };
}

/** Clone policy memory so running a decision never mutates the caller's state. */
function copyMemory(memory: SeekerMemory): SeekerMemory {
  return {
    ...memory,
    beliefs: new Map(
      [...memory.beliefs].map(([key, b]) => [key, { ...b, alive: b.alive.slice() }]),
    ),
  };
}
function knowledgeOf(view: SoloView): string {
  return JSON.stringify([view.candidates, view.asked.map((a) => [a.at, a.answer]), view.curses]);
}

/** Returns one action at most. The server calls at/after waitUntil, and on new public events. */
export function driveSeeker(
  view: SoloView,
  previous: SeekerDriver,
  t: number,
  idx: TimetableIndex,
  speed = 6,
  options: SeekerOptions = SEEKER_LEVELS[view.difficulty],
): DrivenSeeker {
  if (view.result) return { driver: previous, intent: null, waitUntil: Infinity };
  const knowledge = knowledgeOf(view);
  const changed = knowledge !== previous.knowledge;
  const floor = previous.lastActionAt + SEEKER_ACTION_REAL_SECONDS * speed;
  const due = Math.max(view.seekStart, floor, changed ? -Infinity : previous.waitUntil);
  if (t < due) return { driver: previous, intent: null, waitUntil: due };
  const driver: SeekerDriver = { ...previous, memory: copyMemory(previous.memory), knowledge };
  if (changed) driver.pending = null;
  let intent: SoloIntent | null = null;
  const pending = driver.pending;
  if (pending) {
    const s = resolve(view.seeker, t, idx);
    const next = pending.intents[0];
    // A curse, missed stop or changed train invalidates the second half of a board plan.
    const valid =
      next?.type === "alightAt" &&
      s.kind === "train" &&
      s.trip === pending.trip &&
      (idx.ds.trips[s.trip]?.dep[next.stop] ?? -Infinity) > t;
    if (valid) {
      intent = next;
      driver.pending =
        pending.intents.length > 1 ? { ...pending, intents: pending.intents.slice(1) } : null;
    } else driver.pending = null;
  }
  if (!intent) {
    const step = seekerStep(view, driver.memory, t, idx, options);
    if ("waitUntil" in step) {
      driver.waitUntil = step.waitUntil;
      return { driver, intent: null, waitUntil: step.waitUntil };
    }
    intent = step.intents[0] ?? null;
    driver.pending =
      intent && step.intents.length > 1
        ? {
            intents: step.intents.slice(1),
            trip: intent.type === "board" ? intent.trip : null,
          }
        : null;
  }
  if (intent) driver.lastActionAt = t;
  driver.waitUntil = t + SEEKER_ACTION_REAL_SECONDS * speed;
  return { driver, intent, waitUntil: driver.waitUntil };
}

export function rejectSeekerAction(
  driver: SeekerDriver,
  view: SoloView,
  intent: SoloIntent,
  error: string,
  t: number,
  idx: TimetableIndex,
): SeekerDriver {
  const memory = copyMemory(driver.memory);
  seekerRejected(memory, view, intent, error, t, idx);
  return {
    ...driver,
    memory,
    pending: null,
    waitUntil: Math.max(driver.waitUntil, memory.backoffUntil),
  };
}
