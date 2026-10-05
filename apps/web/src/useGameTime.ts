import { syncedGameTime } from "@stand-clear/engine";
import { useEffect, useState } from "react";
import { useGame } from "./game.ts";

/** Game time, re-rendering `hz` times a second. Null until the server has synced the clock. */
export function useGameTime(hz = 4): number | null {
  const sync = useGame((s) => s.sync);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return sync ? syncedGameTime(sync, now) : null;
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
