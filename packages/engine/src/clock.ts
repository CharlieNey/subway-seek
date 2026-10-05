/**
 * The shared game clock. Game time is seconds since service-day midnight (same unit
 * as the dataset's timetable) and runs at `speed`× real time. It pauses while a player
 * is disconnected. Immutable: every change returns a new clock, re-anchored.
 */
export interface GameClock {
  speed: number;
  /** Game time at the anchor. */
  anchorGame: number;
  /** Real time (ms since epoch) at the anchor. */
  anchorReal: number;
  /** Real time the clock was paused at, or null while running. */
  pausedAt: number | null;
}

export function startClock(gameStart: number, speed: number, nowMs: number): GameClock {
  if (!(speed > 0)) throw new Error(`speed must be positive, got ${speed}`);
  return { speed, anchorGame: gameStart, anchorReal: nowMs, pausedAt: null };
}

export function gameTime(clock: GameClock, nowMs: number): number {
  const realNow = clock.pausedAt ?? nowMs;
  return clock.anchorGame + ((realNow - clock.anchorReal) / 1000) * clock.speed;
}

export function pauseClock(clock: GameClock, nowMs: number): GameClock {
  if (clock.pausedAt !== null) return clock;
  return { ...clock, pausedAt: nowMs };
}

export function resumeClock(clock: GameClock, nowMs: number): GameClock {
  if (clock.pausedAt === null) return clock;
  return { ...clock, anchorGame: gameTime(clock, nowMs), anchorReal: nowMs, pausedAt: null };
}

/** Real milliseconds until the clock reaches `target` game time (0 if past, Infinity while paused). */
export function realMsUntil(clock: GameClock, target: number, nowMs: number): number {
  if (clock.pausedAt !== null) return Number.POSITIVE_INFINITY;
  return Math.max(0, ((target - gameTime(clock, nowMs)) / clock.speed) * 1000);
}

/** Jump the clock forward to game time `target` (solo fast-forward). Never goes back. */
export function jumpClock(clock: GameClock, target: number, nowMs: number): GameClock {
  const t = Math.max(target, gameTime(clock, nowMs));
  return {
    ...clock,
    anchorGame: t,
    anchorReal: nowMs,
    pausedAt: clock.pausedAt === null ? null : nowMs,
  };
}
