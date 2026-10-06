/**
 * Where things are on the map at a given game time. Trains follow their route's
 * track shape between stops, so a dot slides along the real line instead of cutting
 * corners. Positions are [lon, lat] (GeoJSON order) for the map.
 */
import type { Dataset, Trip } from "@stand-clear/data";
import { METERS_PER_DEGREE } from "./geo.ts";
import type { TimetableIndex } from "./timetable.ts";
import { resolve, streetPoint, type Transit } from "./transit.ts";

export type LonLat = [number, number];

interface Track {
  /** Shape points as [lon, lat]. */
  points: [number, number][];
  /** Cumulative distance (meters) at each shape point. */
  cum: number[];
  /** Distance along the shape of each stop of the trip pattern. */
  stopDist: number[];
}

function metersPerDegLon(lat: number): number {
  return METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
}

/**
 * Project each stop onto the shape, searching only forward from the previous stop so
 * patterns that pass near the same spot twice stay in order.
 */
function buildTrack(ds: Dataset, trip: Trip): Track {
  const points = ds.shapes[trip.shape]?.points ?? [];
  const lat0 = points[0]?.[1] ?? 40.7;
  const kx = metersPerDegLon(lat0);
  const ky = METERS_PER_DEGREE;
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1] as [number, number];
    const [bx, by] = points[i] as [number, number];
    cum.push((cum[i - 1] as number) + Math.hypot((bx - ax) * kx, (by - ay) * ky));
  }
  const stopDist: number[] = [];
  let seg = 0;
  for (const s of trip.stops) {
    const st = ds.stations[s];
    if (!st || points.length < 2) {
      stopDist.push(stopDist.at(-1) ?? 0);
      continue;
    }
    const px = st.lon * kx;
    const py = st.lat * ky;
    let best = Number.POSITIVE_INFINITY;
    let bestDist = stopDist.at(-1) ?? 0;
    let bestSeg = seg;
    for (let i = seg; i < points.length - 1; i++) {
      const [ax, ay] = points[i] as [number, number];
      const [bx, by] = points[i + 1] as [number, number];
      const x1 = ax * kx;
      const y1 = ay * ky;
      const dx = bx * kx - x1;
      const dy = by * ky - y1;
      const len2 = dx * dx + dy * dy;
      const f = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
      const d = Math.hypot(px - (x1 + f * dx), py - (y1 + f * dy));
      if (d < best) {
        best = d;
        bestSeg = i;
        bestDist = (cum[i] as number) + f * Math.sqrt(len2);
      }
    }
    seg = bestSeg;
    stopDist.push(Math.max(bestDist, stopDist.at(-1) ?? 0));
  }
  return { points, cum, stopDist };
}

function pointAtDistance(track: Track, d: number): LonLat {
  const { points, cum } = track;
  if (points.length === 0) return [0, 0];
  if (d <= 0) return [...(points[0] as [number, number])];
  let lo = 0;
  let hi = cum.length - 1;
  if (d >= (cum[hi] as number)) return [...(points[hi] as [number, number])];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((cum[mid] as number) <= d) lo = mid;
    else hi = mid;
  }
  const span = (cum[hi] as number) - (cum[lo] as number);
  const f = span === 0 ? 0 : (d - (cum[lo] as number)) / span;
  const [ax, ay] = points[lo] as [number, number];
  const [bx, by] = points[hi] as [number, number];
  return [ax + f * (bx - ax), ay + f * (by - ay)];
}

export class Geometry {
  private tracks = new Map<string, Track>();

  constructor(private readonly idx: TimetableIndex) {}

  private track(tripIndex: number): Track | null {
    const trip = this.idx.ds.trips[tripIndex];
    if (!trip) return null;
    const key = `${trip.shape}|${trip.stops.join(",")}`;
    let track = this.tracks.get(key);
    if (!track) {
      track = buildTrack(this.idx.ds, trip);
      this.tracks.set(key, track);
    }
    return track;
  }

  /** A running train's position, or null if it isn't running at t. */
  trainPosition(tripIndex: number, t: number): LonLat | null {
    const trip = this.idx.ds.trips[tripIndex];
    const track = this.track(tripIndex);
    if (!trip || !track) return null;
    const last = trip.stops.length - 1;
    if (t < (trip.dep[0] as number) || t > (trip.arr[last] as number)) return null;
    // Last stop k the train has reached (arr[k] <= t).
    let lo = 0;
    let hi = last;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((trip.arr[mid] as number) <= t) lo = mid;
      else hi = mid - 1;
    }
    const k = lo;
    const d0 = track.stopDist[k] as number;
    if (k === last || t < (trip.dep[k] as number)) return pointAtDistance(track, d0);
    const d1 = track.stopDist[k + 1] as number;
    const leg = (trip.arr[k + 1] as number) - (trip.dep[k] as number);
    const f = leg <= 0 ? 1 : (t - (trip.dep[k] as number)) / leg;
    return pointAtDistance(track, d0 + f * (d1 - d0));
  }

  /** Trips running at t (for the "all trains" layer). */
  runningTrips(t: number): number[] {
    const out: number[] = [];
    this.idx.ds.trips.forEach((trip, i) => {
      if ((trip.dep[0] as number) <= t && t <= (trip.arr.at(-1) as number)) out.push(i);
    });
    return out;
  }

  /** Where a player is on the map. */
  playerPosition(state: Transit, t: number): LonLat {
    const s = resolve(state, t, this.idx);
    const { ds } = this.idx;
    switch (s.kind) {
      case "platform": {
        const st = ds.stations[s.station];
        return st ? [st.lon, st.lat] : [0, 0];
      }
      case "street": {
        const p = streetPoint(s, this.idx);
        return [p.lon, p.lat];
      }
      case "walking": {
        const f = Math.max(0, Math.min(1, (t - s.start) / Math.max(1, s.end - s.start)));
        const [aLat, aLon] = s.fromPoint;
        const [bLat, bLon] = s.toPoint;
        return [aLon + f * (bLon - aLon), aLat + f * (bLat - aLat)];
      }
      case "train": {
        const trip = ds.trips[s.trip];
        if (trip && t < (trip.dep[s.from] as number)) {
          const st = ds.stations[trip.stops[s.from] as number];
          return st ? [st.lon, st.lat] : [0, 0];
        }
        return this.trainPosition(s.trip, t) ?? [0, 0];
      }
    }
  }
}
