/**
 * How the game page was opened (DESIGN.md, Homepage): the homepage's doors are links to
 * /play, and the server starts a round the moment a page connects, so the link says which.
 * Once the round is up the page drops the door from its address, so a refresh carries on.
 */
import type { Difficulty } from "@stand-clear/engine";

export type Door =
  | { kind: "daily" }
  | { kind: "practice"; difficulty?: Difficulty }
  /** The last daily's replay, kept in this browser: no round, no server. */
  | { kind: "replay" }
  /** No door: carry on with this browser's round, or start the daily. */
  | { kind: "resume" };

const DOOR_PARAMS = ["daily", "practice", "difficulty", "replay"];

export function doorOf(search: string): Door {
  const p = new URLSearchParams(search);
  if (p.has("replay")) return { kind: "replay" };
  if (p.has("practice")) {
    const d = p.get("difficulty");
    return d === "easy" || d === "normal" || d === "hard"
      ? { kind: "practice", difficulty: d }
      : { kind: "practice" };
  }
  if (p.has("daily")) return { kind: "daily" };
  return { kind: "resume" };
}

/** The address without its door, keeping anything else (the dev overrides). */
export function withoutDoor(search: string): string {
  const p = new URLSearchParams(search);
  for (const k of DOOR_PARAMS) p.delete(k);
  const rest = p.toString();
  return rest ? `?${rest}` : "";
}

/** The session this browser last played, as the homepage needs to know it. */
export interface StoredSession {
  token: string;
  /** Its round was still going. */
  live: boolean;
  mode: "daily" | "practice" | "hide" | null;
  /** The daily's number, for "Resume daily #23". */
  daily: number | null;
  /** When this page last had it (ms): the server keeps it for the grace period after. */
  at: number;
}

/** Which stored session a new connection should pick up, if any. */
export function tokenFor(door: Door, stored: StoredSession | null): string | null {
  if (!stored) return null;
  if (door.kind === "resume") return stored.token;
  // Today's daily picks up a daily still going; anything else starts it fresh.
  if (door.kind === "daily" && stored.live && stored.mode === "daily") return stored.token;
  return null;
}

/** "Resume daily #23": a daily still going here, left less than the grace period ago. */
export function resumable(
  stored: StoredSession | null,
  today: number,
  now: number,
  graceMs: number,
): boolean {
  return (
    !!stored &&
    stored.live &&
    stored.mode === "daily" &&
    stored.daily === today &&
    now - stored.at < graceMs
  );
}
