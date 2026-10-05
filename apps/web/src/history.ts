/**
 * Daily challenge results, kept in this browser only (per-viewer convenience; nothing
 * else depends on it). Every access is guarded: storage can be blocked or cleared.
 */
import type { SoloView } from "@stand-clear/engine";

const KEY = "stand-clear:daily-results:v1";

export interface DailyResult {
  date: string;
  number: number;
  found: boolean;
  elapsedSeconds: number;
  questions: number;
  scoreSeconds: number;
  share: string;
}

export function loadResults(): Record<string, DailyResult> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, DailyResult>;
  } catch {
    return {};
  }
}

export function saveResult(view: SoloView, share: string): void {
  if (!view.daily || !view.result) return;
  const results = loadResults();
  if (results[view.daily.date]) return; // first finish of the day is the one that counts
  const elapsed = view.result.at - view.seekStart;
  results[view.daily.date] = {
    date: view.daily.date,
    number: view.daily.number,
    found: view.result.kind === "found",
    elapsedSeconds: elapsed,
    questions: view.asked.length,
    scoreSeconds: elapsed + view.bonusSeconds,
    share,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(results));
  } catch {
    // Storage unavailable: the result just isn't remembered.
  }
}

export interface DailyStats {
  played: number;
  found: number;
  /** Consecutive days found, ending at the latest result. */
  streak: number;
}

export function dailyStats(results: Record<string, DailyResult>): DailyStats {
  const list = Object.values(results).sort((a, b) => a.number - b.number);
  let streak = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i] as DailyResult;
    const next = list[i + 1];
    if (!r.found || (next && next.number !== r.number + 1)) break;
    streak++;
  }
  return { played: list.length, found: list.filter((r) => r.found).length, streak };
}
