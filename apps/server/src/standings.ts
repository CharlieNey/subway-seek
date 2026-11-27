/**
 * Today's finished dailies, for the percentile on the daily's result (DESIGN.md, Coming
 * back; proposed 2026-11-27). A finished daily is one found or timed out: give-ups and
 * rounds left unfinished are out. Kept in memory as hider-score minutes per New York date,
 * and rebuilt from the match logs at boot, so a restart keeps the day's count.
 *
 * What it serves is a histogram of minutes and nothing else: no station, no route, no
 * player. A daily the browser says it already played (DailyInfo.replay) doesn't count;
 * one played again in a fresh browser does, since there are no accounts to tell.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Dates kept: today and yesterday in New York, so midnight doesn't empty the list. */
const KEEP_DATES = 2;
/** A score past this many minutes goes in the last bucket (2 h cap plus bonuses). */
const MAX_MINUTE = 400;

export class DailyScores {
  private readonly byDate = new Map<string, number[]>();
  /**
   * Match logs already counted, by date: a round's end can be logged again by a later
   * intent. Dropped with their date, so this doesn't grow for the life of the process.
   */
  private readonly seen = new Map<string, Set<string>>();

  /** Count a finished daily once per round (`id`: its match log's). */
  add(date: string, minutes: number, id: string) {
    if (!Number.isFinite(minutes) || minutes < 0) return;
    const seen = this.seen.get(date) ?? new Set<string>();
    if (seen.has(id)) return;
    seen.add(id);
    this.seen.set(date, seen);
    const list = this.byDate.get(date) ?? [];
    list.push(Math.min(MAX_MINUTE, Math.round(minutes)));
    this.byDate.set(date, list);
    // Oldest dates out first.
    while (this.byDate.size > KEEP_DATES) {
      const oldest = [...this.byDate.keys()].sort()[0];
      if (oldest === undefined) break;
      this.byDate.delete(oldest);
      this.seen.delete(oldest);
    }
  }

  /** How many finished dailies scored each minute, from 0 to the highest seen. */
  histogram(date: string): { n: number; counts: number[] } {
    const list = this.byDate.get(date) ?? [];
    const counts: number[] = [];
    for (const m of list) {
      while (counts.length <= m) counts.push(0);
      counts[m] = (counts[m] ?? 0) + 1;
    }
    return { n: list.length, counts };
  }
}

/** One round's log, read back: its daily date and finished score, or null. */
export function finishedDaily(lines: string[]): { date: string; minutes: number } | null {
  let date: string | null = null;
  let minutes: number | null = null;
  for (const line of lines) {
    if (!line) continue;
    let e: {
      event?: string;
      mode?: string;
      daily?: { date?: unknown; replay?: unknown } | null;
    } & Record<string, unknown>;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      e.event === "round_start" &&
      e.mode === "daily" &&
      typeof e.daily?.date === "string" &&
      e.daily.replay !== true
    )
      date = e.daily.date;
    if (
      e.event === "round_end" &&
      (e.result === "found" || e.result === "timeout") &&
      typeof e.hiderScoreMin === "number"
    )
      minutes = e.hiderScoreMin;
  }
  return date !== null && minutes !== null ? { date, minutes } : null;
}

/**
 * Rebuild from the logs of the last two days. Log files are named by their UTC start,
 * so a New York evening's rounds are under the next UTC date: read both.
 */
export function scoresFromLogs(dir: string, now: Date, into = new DailyScores()): DailyScores {
  const days = [0, 1].map((d) =>
    new Date(now.getTime() - d * 86_400_000).toISOString().slice(0, 10),
  );
  let files: string[];
  try {
    files = readdirSync(dir).filter(
      (f) => f.endsWith(".jsonl") && days.some((d) => f.startsWith(d)),
    );
  } catch {
    return into;
  }
  for (const f of files.sort()) {
    try {
      const done = finishedDaily(readFileSync(join(dir, f), "utf8").split("\n"));
      if (done) into.add(done.date, done.minutes, f.replace(/\.jsonl$/, ""));
    } catch {
      // An unreadable log is skipped; the count is a little low until tomorrow.
    }
  }
  return into;
}
