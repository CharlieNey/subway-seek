/**
 * The daily challenge: everyone gets the same bot-hidden station each day, from the
 * same start and timetable, so results compare like Wordle. The day follows New York
 * time (the game is set there).
 *
 * The seed mixes in a server-side secret: this engine also ships to the browser, so a
 * date-only seed would let anyone compute today's answer from the page's code.
 */

/** Daily #1. */
export const DAILY_EPOCH = "2026-10-05";

/** Today's date in New York as YYYY-MM-DD. */
export function nyDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Days since the epoch, counting from 1. */
export function dailyNumber(date: string): number {
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  return Math.round(day(date) - day(DAILY_EPOCH)) + 1;
}

/** 32-bit FNV-1a string hash. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32): same seed, same sequence. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface DailyInfo {
  date: string;
  number: number;
  /** A themed day's rule (themes.ts); absent on an ordinary day. */
  theme?: "outerBoroughs";
  /**
   * Played again in a browser that already has today's result: it doesn't count toward
   * today's standings (apps/server/src/standings.ts). The browser says so; there are no
   * accounts to check it against.
   */
  replay?: true;
}

/** The random source for a day's challenge. */
export function dailyRandom(date: string, secret: string): () => number {
  return seededRandom(hashString(`stand-clear-daily|${secret}|${date}`));
}
