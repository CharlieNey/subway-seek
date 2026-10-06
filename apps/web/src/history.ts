/**
 * Daily challenge results, kept in this browser only (per-viewer convenience; nothing
 * else depends on it). Every access is guarded: storage can be blocked or cleared.
 */
import type { SoloView } from "@stand-clear/engine";
import { type Family, familyOf } from "./ui/family.ts";

const KEY = "stand-clear:daily-results:v1";

export interface DailyResult {
  date: string;
  number: number;
  found: boolean;
  elapsedSeconds: number;
  questions: number;
  /** Each question's family, in order (results saved before 2026-10-06 lack them). */
  families?: Family[];
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

const REPLAY_KEY = "stand-clear:daily-replay:v1";

/** The last daily's finished view, for the homepage's Watch replay. */
export function loadReplay(): { date: string; view: SoloView } | null {
  try {
    const kept = JSON.parse(localStorage.getItem(REPLAY_KEY) ?? "null") as {
      date: string;
      view: SoloView;
    } | null;
    return kept?.view?.replay ? kept : null;
  } catch {
    return null;
  }
}

export function saveResult(view: SoloView, share: string): void {
  if (!view.daily || !view.result) return;
  const results = loadResults();
  if (results[view.daily.date]) return; // first finish of the day is the one that counts
  try {
    // Only the latest daily: the round is over, so the view holds the whole replay.
    localStorage.setItem(REPLAY_KEY, JSON.stringify({ date: view.daily.date, view }));
  } catch {
    // Too big or refused: the homepage just doesn't offer the replay.
  }
  const elapsed = view.result.at - view.seekStart;
  results[view.daily.date] = {
    date: view.daily.date,
    number: view.daily.number,
    found: view.result.kind === "found",
    elapsedSeconds: elapsed,
    questions: view.asked.length,
    families: view.asked.map((a) => familyOf(a.q)),
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
