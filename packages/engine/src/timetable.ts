import type { Dataset, Direction, Route } from "@subway-seek/data";

/** A train you could board: trip `trip` leaving its stop index `stop` at `dep`. */
export interface Call {
  trip: number;
  stop: number;
  dep: number;
}

export interface TimetableIndex {
  ds: Dataset;
  /** Boardable calls per station (excludes a trip's last stop), sorted by departure. */
  callsByStation: Call[][];
  /** Walking transfers out of each station to other stations. */
  transfersFrom: { to: number; seconds: number }[][];
  /** Seconds to change platforms within a station (e.g. uptown ↔ downtown). */
  selfTransfer: number[];
}

const DEFAULT_SELF_TRANSFER = 180;
/**
 * MTA lists 0 s for changing platforms at 57 big stations (Times Sq, Grand Central…).
 * Taken literally you could reverse direction instantly, so the game floors it.
 */
export const MIN_PLATFORM_CHANGE = 90;

export function buildIndex(ds: Dataset): TimetableIndex {
  const callsByStation: Call[][] = ds.stations.map(() => []);
  ds.trips.forEach((trip, t) => {
    for (let i = 0; i < trip.stops.length - 1; i++) {
      callsByStation[trip.stops[i] as number]?.push({
        trip: t,
        stop: i,
        dep: trip.dep[i] as number,
      });
    }
  });
  for (const calls of callsByStation) calls.sort((a, b) => a.dep - b.dep || a.trip - b.trip);

  const transfersFrom: { to: number; seconds: number }[][] = ds.stations.map(() => []);
  const selfTransfer = ds.stations.map(() => DEFAULT_SELF_TRANSFER);
  for (const { from, to, seconds } of ds.transfers) {
    if (from === to) selfTransfer[from] = Math.max(seconds, MIN_PLATFORM_CHANGE);
    else transfersFrom[from]?.push({ to, seconds });
  }
  return { ds, callsByStation, transfersFrom, selfTransfer };
}

export interface Departure extends Call {
  route: Route;
  dir: Direction;
  headsign: string;
}

/** First index in `calls` departing at or after `t` (binary search). */
function firstAtOrAfter(calls: readonly Call[], t: number): number {
  let lo = 0;
  let hi = calls.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((calls[mid] as Call).dep < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Upcoming departures from a station, soonest first. */
export function departures(
  idx: TimetableIndex,
  station: number,
  from: number,
  { horizon = 30 * 60, limit = 40 }: { horizon?: number; limit?: number } = {},
): Departure[] {
  const calls = idx.callsByStation[station] ?? [];
  const out: Departure[] = [];
  for (let i = firstAtOrAfter(calls, from); i < calls.length && out.length < limit; i++) {
    const call = calls[i] as Call;
    if (call.dep > from + horizon) break;
    const trip = idx.ds.trips[call.trip];
    const route = trip && idx.ds.routes[trip.route];
    if (!trip || !route) continue;
    out.push({ ...call, route, dir: trip.dir, headsign: trip.headsign });
  }
  return out;
}

/** One row of a countdown-clock board: a route and direction, and its next trains. */
export interface BoardRow {
  route: Route;
  dir: Direction;
  /** Soonest first. The row reads as the first train's headsign. */
  trains: Departure[];
}

/**
 * A station's departures as the platform countdown clocks show them (DESIGN.md, Sidebar):
 * a row per route and direction with its next `perRow` trains ("2 min, then 9 min"),
 * rows in order of their first train. Express variants (6X) keep their own row.
 */
export function departureBoard(
  idx: TimetableIndex,
  station: number,
  from: number,
  { horizon = 30 * 60, perRow = 2 }: { horizon?: number; perRow?: number } = {},
): BoardRow[] {
  const rows = new Map<string, BoardRow>();
  for (const d of departures(idx, station, from, { horizon, limit: Number.POSITIVE_INFINITY })) {
    const key = `${d.route.id}|${d.dir}`;
    const row = rows.get(key);
    if (!row) rows.set(key, { route: d.route, dir: d.dir, trains: [d] });
    else if (row.trains.length < perRow) row.trains.push(d);
  }
  return [...rows.values()];
}
