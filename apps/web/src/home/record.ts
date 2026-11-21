/**
 * The homepage's numbers and states, worked out from this browser's daily results
 * (DESIGN.md, Homepage): the tile wall, the stats, the hero's one door, and the clock to
 * the next daily. Kept pure, so they're tested without a page.
 */
import { DAILY_EPOCH } from "@subway-seek/engine";
import { resumable, type StoredSession } from "../doors.ts";
import type { DailyResult } from "../history.ts";
import type { Family } from "../ui/family.ts";

/** A find under this many minutes gets a gold edge on the wall. */
export const FAST_MINUTES = 45;

export type DayKind = "pre" | "found" | "fast" | "miss" | "skip" | "future";

export interface DayTile {
  /** Day of the month; null for the padding before the 1st and after the last day. */
  day: number | null;
  date: string | null;
  kind: DayKind;
  today: boolean;
  /** Minutes to the find, on found days. */
  minutes: number | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The month around `today` (YYYY-MM-DD, New York), Monday first, one tile per day. */
export function monthTiles(results: Record<string, DailyResult>, today: string): DayTile[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // getUTCDay: 0 is Sunday. Monday-first: Monday is 0.
  const lead = (first.getUTCDay() + 6) % 7;
  const tiles: DayTile[] = [];
  for (let i = 0; i < lead; i++)
    tiles.push({ day: null, date: null, kind: "pre", today: false, minutes: null });
  for (let d = 1; d <= days; d++) {
    const date = `${y}-${pad(m)}-${pad(d)}`;
    const r = results[date];
    const minutes = r?.found ? Math.round(r.elapsedSeconds / 60) : null;
    const kind: DayKind =
      date < DAILY_EPOCH
        ? "pre"
        : r
          ? r.found
            ? (minutes ?? 0) < FAST_MINUTES
              ? "fast"
              : "found"
            : "miss"
          : date > today
            ? "future"
            : "skip";
    tiles.push({ day: d, date, kind, today: date === today, minutes });
  }
  while (tiles.length % 7)
    tiles.push({ day: null, date: null, kind: "pre", today: false, minutes: null });
  return tiles;
}

export interface RecordStats {
  played: number;
  found: number;
  streak: number;
  /** Fastest find, in seconds; null before the first. */
  fastest: number | null;
}

export function recordStats(results: Record<string, DailyResult>): RecordStats {
  const list = Object.values(results).sort((a, b) => a.number - b.number);
  let streak = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i] as DailyResult;
    const next = list[i + 1];
    if (!r.found || (next && next.number !== r.number + 1)) break;
    streak++;
  }
  const finds = list.filter((r) => r.found).map((r) => r.elapsedSeconds);
  return {
    played: list.length,
    found: finds.length,
    streak,
    fastest: finds.length ? Math.min(...finds) : null,
  };
}

/** The share line's emoji, back to families, for results saved before they kept them. */
const EMOJI_FAMILY: Record<string, Family | null> = {
  "📡": "radar",
  "🎯": "radar",
  "🌡️": "thermo",
  "🔥": "thermo",
  "🚇": "match",
  "🗽": "match",
  "⚡": "match",
  "➕": "measure",
  "🟰": "match",
  "📏": "measure",
  "🐙": "tent",
  "📸": "photo",
};

export function familiesOf(r: DailyResult): Family[] {
  if (r.families) return r.families;
  // Past the title line, whose 🚇 is the game's mark, not a route question.
  const line =
    r.share
      .split("\n")
      .slice(1)
      .find((l) => [...l].some((c) => c in EMOJI_FAMILY)) ?? "";
  const out: Family[] = [];
  for (const g of Array.from(new Intl.Segmenter().segment(line), (s) => s.segment)) {
    const f = EMOJI_FAMILY[g];
    if (f) out.push(f);
  }
  return out;
}

/** The hero's one door (Homepage › States). */
export type Hero = { kind: "play" } | { kind: "resume" } | { kind: "done"; result: DailyResult };

export function heroState(
  results: Record<string, DailyResult>,
  today: { date: string; number: number },
  stored: StoredSession | null,
  now: number,
  graceMs: number,
): Hero {
  const done = results[today.date];
  if (done) return { kind: "done", result: done };
  if (resumable(stored, today.number, now, graceMs)) return { kind: "resume" };
  return { kind: "play" };
}

/** Minutes to the next daily, which starts at midnight in New York. */
export function minutesToNextDaily(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return 24 * 60 - (hh * 60 + mm);
}

/** "14 h 19 min". */
export const hoursMinutes = (min: number) => `${Math.floor(min / 60)} h ${pad(min % 60)} min`;

/**
 * A friend's share link: "?d=23&t=41" is Daily #23 found in 41 min. Only for today's
 * daily, and it never names the station, so it can't spoil anything.
 */
export function friendLine(search: string, today: number): string | null {
  const p = new URLSearchParams(search);
  const d = Number(p.get("d"));
  const t = Number(p.get("t"));
  if (d !== today || !Number.isFinite(t) || t <= 0) return null;
  return `A friend found Daily #${d} in ${Math.round(t)} min. Your turn.`;
}
