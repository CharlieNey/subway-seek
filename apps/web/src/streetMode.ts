/**
 * Whether this page plays the street endgame (Google's map and Street View) or ends its
 * rounds at the station on the free map (DESIGN.md, Playable without Google; decided
 * 2026-11-21). Off when the build has no Google key or VITE_STREET=off, when Google
 * refused this browser earlier today, or once Google refuses the map or Street View on
 * this page. Google's daily quotas reset at midnight Pacific time, so a refusal is
 * remembered until then: the next visit doesn't spend a map load finding out again.
 *
 * Google's terms keep Street View off any screen with a non-Google map, so off means
 * both: the free map, and no panorama or photo.
 */
import { create } from "zustand";
import { streetFits } from "./layout.ts";
import { storageKey } from "./storage.ts";

export type StreetOff =
  /** The build has no Google key, or VITE_STREET=off: the demo. */
  | "demo"
  /** Google refused this browser earlier today (a quota or the key). */
  | "refusedToday"
  /** Google refused the map or Street View on this page. */
  | "refused"
  /** A replay: the map alone, no round, so the free map saves a billed map load. */
  | "replay"
  /** A phone: Street View, the map and the board don't fit side by side (layout.ts). */
  | "phone";

const REFUSED_KEY = storageKey("google-refused-until");

/** The next midnight in Los Angeles after `now` (ms), when Google's daily quotas reset. */
export function nextPacificMidnight(now: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hourCycle: "h23",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(now));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const sinceMidnight = (n("hour") * 3600 + n("minute") * 60 + n("second")) * 1000;
  // Whole seconds: the formatter drops milliseconds. A DST change shifts this by an hour
  // twice a year, which only moves when the next visit tries Google again.
  return now - (now % 1000) - sinceMidnight + 24 * 3600 * 1000;
}

function googleBuilt(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY) && import.meta.env.VITE_STREET !== "off";
}

function refusedUntil(): number {
  try {
    return Number(localStorage.getItem(REFUSED_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function initial(): StreetOff | null {
  if (!googleBuilt()) return "demo";
  // Replays draw only the map (no Street View positions are kept), on any screen.
  if (typeof location !== "undefined" && new URLSearchParams(location.search).has("replay"))
    return "replay";
  // Dev only: ?map=maplibre forces the free map for a headless check.
  if (
    import.meta.env.DEV &&
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).get("map") === "maplibre"
  )
    return "demo";
  if (import.meta.env.VITE_MAP_PROVIDER === "maplibre") return "demo";
  // Too narrow for the street endgame when the page opened: a station round, free map.
  if (typeof innerWidth === "number" && !streetFits(innerWidth)) return "phone";
  return refusedUntil() > Date.now() ? "refusedToday" : null;
}

interface StreetStore {
  /** Why the street endgame is off on this page, or null while it's on. */
  off: StreetOff | null;
}

export const useStreet = create<StreetStore>(() => ({ off: initial() }));

/** Whether this page shows Google's map and Street View. */
export function streetOn(): boolean {
  return useStreet.getState().off === null;
}

/**
 * Google refused the map or Street View: switch this page to the free map, and remember
 * it until Google's quotas reset. The game store tells the server (game.ts).
 */
export function refuseGoogle(reason: string): void {
  if (useStreet.getState().off !== null) return;
  console.warn(`Google refused (${reason}): this page goes on the free map`);
  try {
    localStorage.setItem(REFUSED_KEY, String(nextPacificMidnight(Date.now())));
  } catch {
    // Private windows can refuse storage: the next visit just tries Google again.
  }
  useStreet.setState({ off: "refused" });
}

/** The one line the page shows about it, or null while the street endgame is on. */
export function streetOffLine(off: StreetOff | null): string | null {
  if (off === null) return null;
  if (off === "phone") return "On a phone, the round ends when you reach the hider's station.";
  return off === "demo" || off === "replay"
    ? "The round ends when you reach the hider's station."
    : "Street View isn't available right now, so the round ends when you reach the hider's station.";
}
