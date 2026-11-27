/**
 * Match logs older than 90 days are deleted (DESIGN.md, decision log 2026-11-27; Charlie
 * approved it with the friend-challenges proposal). At about 30 KB a round the 1 GB volume
 * holds some 30,000 rounds, so without a sweep the disk fills in a busy season. The sweep
 * runs at boot and once a day.
 *
 * A log's age is the later of the time its name was given (the round's start, an ISO
 * timestamp) and its last write, so a round restored and still running is never touched.
 * Only `.jsonl` files in the log folder go; nothing else there is ours to delete.
 */
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

export const LOG_MAX_AGE_DAYS = 90;
const DAY_MS = 86_400_000;

/** When a log was started, from its name ("2026-11-27T15-47-45-426Z-hlfgf.jsonl"). */
export function startedAt(name: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(name);
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  return Number.isNaN(t) ? null : t;
}

/** Delete the logs last touched more than `maxAgeDays` ago. Returns how many went. */
export function sweepLogs(dir: string, now: number, maxAgeDays = LOG_MAX_AGE_DAYS): number {
  const cutoff = now - maxAgeDays * DAY_MS;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  let deleted = 0;
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    const path = join(dir, name);
    try {
      const st = statSync(path);
      if (!st.isFile()) continue;
      const age = Math.max(st.mtimeMs, startedAt(name) ?? 0);
      if (age >= cutoff) continue;
      rmSync(path);
      deleted++;
    } catch {
      // Gone already, or unreadable: the next sweep tries again.
    }
  }
  return deleted;
}

/** Sweep now and every day after; the timer doesn't keep the process alive. */
export function scheduleLogSweep(dir: string): void {
  const run = () => {
    const n = sweepLogs(dir, Date.now());
    if (n > 0)
      console.log(`log sweep: deleted ${n} match logs older than ${LOG_MAX_AGE_DAYS} days`);
  };
  run();
  setInterval(run, DAY_MS).unref();
}
