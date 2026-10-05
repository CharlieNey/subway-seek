/**
 * Where can you get to by a deadline? A connection scan (CSA) over the day's timetable:
 * every hop between consecutive stops is a "connection", scanned in departure order.
 * Optimistic by design (no platform-change time), so the hider's reachable set is an
 * honest superset — the seeker's starting shading never wrongly rules a station out.
 */
import type { TimetableIndex } from "./timetable.ts";

interface Connections {
  from: Int32Array;
  to: Int32Array;
  dep: Int32Array;
  arr: Int32Array;
  trip: Int32Array;
}

const cache = new WeakMap<TimetableIndex, Connections>();

function connections(idx: TimetableIndex): Connections {
  let c = cache.get(idx);
  if (c) return c;
  const rows: [number, number, number, number, number][] = [];
  idx.ds.trips.forEach((trip, t) => {
    for (let i = 0; i + 1 < trip.stops.length; i++) {
      rows.push([
        trip.stops[i] as number,
        trip.stops[i + 1] as number,
        trip.dep[i] as number,
        trip.arr[i + 1] as number,
        t,
      ]);
    }
  });
  rows.sort((a, b) => a[2] - b[2]);
  c = {
    from: Int32Array.from(rows, (r) => r[0]),
    to: Int32Array.from(rows, (r) => r[1]),
    dep: Int32Array.from(rows, (r) => r[2]),
    arr: Int32Array.from(rows, (r) => r[3]),
    trip: Int32Array.from(rows, (r) => r[4]),
  };
  cache.set(idx, c);
  return c;
}

/** Earliest arrival (game seconds) at every station, starting from `start` at `t0`; Infinity if not by `tMax`. */
export function earliestArrivals(
  idx: TimetableIndex,
  start: number,
  t0: number,
  tMax: number,
): Float64Array {
  const c = connections(idx);
  const arrival = new Float64Array(idx.ds.stations.length).fill(Number.POSITIVE_INFINITY);
  const relax = (s: number, t: number) => {
    for (const f of idx.transfersFrom[s] ?? []) {
      if (t + f.seconds < (arrival[f.to] as number)) arrival[f.to] = t + f.seconds;
    }
  };
  arrival[start] = t0;
  relax(start, t0);

  const onTrip = new Uint8Array(idx.ds.trips.length);
  // First connection departing at or after t0.
  let lo = 0;
  let hi = c.dep.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((c.dep[mid] as number) < t0) lo = mid + 1;
    else hi = mid;
  }
  for (let k = lo; k < c.dep.length; k++) {
    const dep = c.dep[k] as number;
    if (dep > tMax) break;
    const trip = c.trip[k] as number;
    if (onTrip[trip] || (arrival[c.from[k] as number] as number) <= dep) {
      onTrip[trip] = 1;
      const to = c.to[k] as number;
      const arr = c.arr[k] as number;
      if (arr <= tMax && arr < (arrival[to] as number)) {
        arrival[to] = arr;
        relax(to, arr);
      }
    }
  }
  return arrival;
}

/**
 * Complexes a hider starting at `hub` (a station) could be at when hiding ends.
 * The hub's own complex is excluded: the hider has to leave the start.
 */
export function reachableComplexes(
  idx: TimetableIndex,
  hub: number,
  t0: number,
  tMax: number,
): number[] {
  const arrival = earliestArrivals(idx, hub, t0, tMax);
  const hubComplex = idx.ds.stations[hub]?.complex;
  const out = new Set<number>();
  arrival.forEach((t, s) => {
    const complex = idx.ds.stations[s]?.complex;
    if (t <= tMax && complex !== undefined && complex !== hubComplex) out.add(complex);
  });
  return [...out].sort((a, b) => a - b);
}
