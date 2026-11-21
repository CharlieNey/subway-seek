import { syncedGameTime } from "@subway-seek/engine";
import { useEffect, useReducer, useRef, useState } from "react";
import { useGame } from "./game.ts";

/** Game time, re-rendering `hz` times a second. Null until the server has synced the clock. */
export function useGameTime(hz = 4): number | null {
  const sync = useGame((s) => s.sync);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return sync ? syncedGameTime(sync, Math.max(now, sync.serverNow)) : null;
}

/**
 * Something worked out from game time, checked `hz` times a second; the component
 * re-renders only when it changes (Object.is), not on every tick. For what flips now and
 * then, like being on the street, near the top of the tree where a re-render reaches
 * everything below.
 */
export function useClockValue<T>(derive: (t: number | null) => T, hz = 4): T {
  const sync = useGame((s) => s.sync);
  const [, recheck] = useReducer((n: number) => n + 1, 0);
  const value = derive(sync ? syncedGameTime(sync, Date.now()) : null);
  const latest = useRef({ derive, value, sync });
  latest.current = { derive, value, sync };
  useEffect(() => {
    const id = setInterval(() => {
      const { derive: d, value: v, sync: s } = latest.current;
      if (!Object.is(d(s ? syncedGameTime(s, Date.now()) : null), v)) recheck();
    }, 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return value;
}

export function formatClock(seconds: number): string {
  const s = Math.floor(seconds);
  const hh = String(Math.floor(s / 3600) % 24).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** "now", "1 min", "12 min" — game minutes until t. */
export function formatIn(t: number, now: number): string {
  const min = Math.floor((t - now) / 60);
  return min <= 0 ? "now" : `${min} min`;
}
