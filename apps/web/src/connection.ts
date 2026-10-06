/**
 * The link to the game server, as the loading board and the error screens need it
 * (DESIGN.md, Loading, connecting and errors). Pure: the WebSocket driver in game.ts
 * feeds it events and real times; the screens read what to show from it.
 */

/** An attempt slower than this says so on the board ("Still connecting"). */
export const SLOW_MS = 8000;
/** An attempt that hasn't opened by now is given up and retried. */
export const ATTEMPT_TIMEOUT_MS = 15_000;
/** Mid-round, this many tries show in the reconnecting band ("Try 2 of 5"). */
export const LOST_TRIES = 5;
/** Waits are shown as a ten-tile timer, one tile a second, so none is longer. */
export const MAX_WAIT_MS = 10_000;

export type Link =
  /** Not tried yet: the timetable is still loading. */
  | { kind: "idle" }
  | {
      kind: "connecting";
      /** Real ms this attempt began. */
      since: number;
      /** Failed attempts in this streak. */
      tries: number;
      /** Real ms the streak's first attempt began. */
      firstTryAt: number;
      lastClose: CloseInfo | null;
    }
  | {
      kind: "waiting";
      /** Real ms of the next attempt. */
      until: number;
      wait: number;
      tries: number;
      firstTryAt: number;
      lastClose: CloseInfo | null;
    }
  | { kind: "open" }
  /** The session was opened in another tab; this one stops until asked. */
  | { kind: "takenOver" };

export interface CloseInfo {
  code: number;
  /** Whether it ever opened. */
  opened: boolean;
}

/**
 * How long to wait before the next attempt, after `tries` failures. Mid-round the first
 * retries come quickly (most drops are a blip); before the round, a few seconds apart.
 */
export function retryDelayMs(tries: number, midRound: boolean): number {
  const steps = midRound ? [1000, 2000, 4000, 6000, 8000] : [2000, 4000, 6000, 8000];
  return steps[tries - 1] ?? MAX_WAIT_MS;
}

export function startAttempt(link: Link, now: number): Link {
  if (link.kind === "connecting" || link.kind === "waiting") {
    return {
      kind: "connecting",
      since: now,
      tries: link.tries,
      firstTryAt: link.firstTryAt,
      lastClose: link.lastClose,
    };
  }
  return { kind: "connecting", since: now, tries: 0, firstTryAt: now, lastClose: null };
}

/** An attempt failed, or an open link dropped: wait, then try again. */
export function attemptFailed(link: Link, close: CloseInfo, now: number, midRound: boolean): Link {
  if (link.kind === "open" || link.kind === "idle" || link.kind === "takenOver") {
    // A drop: the streak starts now, and the first try goes straight away.
    return { kind: "waiting", until: now, wait: 0, tries: 0, firstTryAt: now, lastClose: close };
  }
  const tries = link.tries + 1;
  const wait = retryDelayMs(tries, midRound);
  return {
    kind: "waiting",
    until: now + wait,
    wait,
    tries,
    firstTryAt: link.firstTryAt,
    lastClose: close,
  };
}

/** What the screen shows for the link. */
export type LinkScreen =
  | { kind: "none" }
  /** The boot board's server row. */
  | { kind: "board"; status: "waiting" | "connecting" | "slow"; seconds: number }
  /** Can't reach the server: the plaque, with the next try. */
  | {
      kind: "unreachable";
      midRound: boolean;
      /** The attempt that's coming (or under way), counting from 1. */
      attempt: number;
      /** Seconds until it, while waiting; null while it's under way. */
      inSeconds: number | null;
      /** Ten tiles, one a second: how many are left. */
      tilesLeft: number;
      tries: number;
      firstTryAt: number;
      lastClose: CloseInfo | null;
    }
  /** Mid-round, reconnecting: the express band, "Try 2 of 5". */
  | { kind: "lost"; attempt: number; tilesLeft: number }
  | { kind: "takenOver" };

/** `everOpen`: this page had a round going. */
export function linkScreen(link: Link, everOpen: boolean, now: number): LinkScreen {
  switch (link.kind) {
    case "idle":
      return everOpen ? { kind: "none" } : { kind: "board", status: "waiting", seconds: 0 };
    case "open":
      return { kind: "none" };
    case "takenOver":
      return { kind: "takenOver" };
  }
  const attempt = link.tries + 1;
  const waitingMs = link.kind === "waiting" ? Math.max(0, link.until - now) : 0;
  const tilesLeft = Math.min(10, Math.ceil(waitingMs / 1000));
  if (everOpen && link.tries < LOST_TRIES) return { kind: "lost", attempt, tilesLeft };
  if (!everOpen && link.tries === 0 && link.kind === "connecting") {
    const ms = now - link.since;
    return {
      kind: "board",
      status: ms >= SLOW_MS ? "slow" : "connecting",
      seconds: Math.floor(ms / 1000),
    };
  }
  return {
    kind: "unreachable",
    midRound: everOpen,
    attempt,
    inSeconds: link.kind === "waiting" ? Math.ceil(waitingMs / 1000) : null,
    tilesLeft,
    tries: link.tries,
    firstTryAt: link.firstTryAt,
    lastClose: link.lastClose,
  };
}
