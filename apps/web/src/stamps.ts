/**
 * The station stamp book (DESIGN.md, Coming back; proposed 2026-11-27): every station
 * complex you've found as the seeker and hidden in as the hider, kept in this browser.
 *
 * Keyed by the complex's GTFS id, not its index in the dataset, so a stamp survives a
 * re-pinned timetable. Versioned like the other keys (`stamps:v1`), read through a parser
 * that drops anything not shaped like a stamp, and moved by `migrateStorage` with the rest
 * when the game's name changes.
 */
import { storageKey } from "./storage.ts";

const KEY = storageKey("stamps:v1");

export type StampKind = "found" | "hidden";

/** Complex id → the date of its first stamp, "YYYY-MM-DD". */
export interface Stamps {
  found: Record<string, string>;
  hidden: Record<string, string>;
}

/** One complex as the book lists it: id, name, borough, routes (virtual:complexes). */
export type BookComplex = [id: string, name: string, borough: string, routes: string[]];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanSide(v: unknown): Record<string, string> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  return Object.fromEntries(
    Object.entries(v).filter(([k, d]) => k.length > 0 && typeof d === "string" && DATE.test(d)),
  );
}

/** Stored stamps, keeping only entries shaped like one (storage outlives the code). */
export function parseStamps(raw: string | null): Stamps {
  let o: unknown;
  try {
    o = JSON.parse(raw ?? "{}");
  } catch {
    return { found: {}, hidden: {} };
  }
  const p = (typeof o === "object" && o !== null ? o : {}) as Partial<Record<StampKind, unknown>>;
  return { found: cleanSide(p.found), hidden: cleanSide(p.hidden) };
}

export function loadStamps(): Stamps {
  try {
    return parseStamps(localStorage.getItem(KEY));
  } catch {
    return { found: {}, hidden: {} };
  }
}

/** The book with one more stamp; a complex keeps the date it was first stamped. */
export function withStamp(stamps: Stamps, kind: StampKind, id: string, date: string): Stamps {
  if (!DATE.test(date) || stamps[kind][id]) return stamps;
  return { ...stamps, [kind]: { ...stamps[kind], [id]: date } };
}

/** Stamp a complex in this browser. Returns whether it was new. */
export function saveStamp(kind: StampKind, id: string, date: string): boolean {
  const before = loadStamps();
  const after = withStamp(before, kind, id, date);
  if (after === before) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(after));
  } catch {
    // Storage refused: the stamp isn't kept.
    return false;
  }
  return true;
}

export interface Tally {
  found: number;
  hidden: number;
  total: number;
}

export interface BookTotals extends Tally {
  byBorough: { borough: string; tally: Tally }[];
  byRoute: { route: string; tally: Tally }[];
}

/** Totals for the whole book, each borough and each line (a complex counts for every line). */
export function bookTotals(book: readonly BookComplex[], stamps: Stamps): BookTotals {
  const empty = (): Tally => ({ found: 0, hidden: 0, total: 0 });
  const all = empty();
  const boroughs = new Map<string, Tally>();
  const routes = new Map<string, Tally>();
  const count = (t: Tally, id: string) => {
    t.total++;
    if (stamps.found[id]) t.found++;
    if (stamps.hidden[id]) t.hidden++;
  };
  for (const [id, , borough, rs] of book) {
    count(all, id);
    if (!boroughs.has(borough)) boroughs.set(borough, empty());
    count(boroughs.get(borough) as Tally, id);
    for (const r of rs) {
      if (!routes.has(r)) routes.set(r, empty());
      count(routes.get(r) as Tally, id);
    }
  }
  return {
    ...all,
    byBorough: [...boroughs].map(([borough, tally]) => ({ borough, tally })),
    byRoute: [...routes].map(([route, tally]) => ({ route, tally })),
  };
}

/** Today in New York, for a stamp's date: the daily's day, whatever the clock says here. */
export function nyToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}
