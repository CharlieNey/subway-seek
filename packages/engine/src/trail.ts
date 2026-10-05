/**
 * A player's movement over a round, for the end-of-round replay. A trail is the list of
 * transit states a player chose, each with the time they chose it; because states
 * resolve lazily against the clock, that's enough to place them at any moment.
 */
import type { Geometry, LonLat } from "./geometry.ts";
import type { Leg } from "./reach.ts";
import type { TimetableIndex } from "./timetable.ts";
import type { OnPlatform, Transit } from "./transit.ts";

export interface TrailEntry {
  t: number;
  state: Transit;
}

/** Turn a journey's legs into a trail starting on `start`'s platform at `t0`. */
export function trailFromLegs(
  idx: TimetableIndex,
  start: number,
  t0: number,
  legs: readonly Leg[],
): TrailEntry[] {
  const { ds } = idx;
  let here: OnPlatform = { kind: "platform", station: start, since: t0, arrivedDir: null };
  let now = t0;
  const out: TrailEntry[] = [{ t: t0, state: here }];
  for (const leg of legs) {
    if (leg.kind === "ride") {
      const trip = ds.trips[leg.trip];
      if (!trip) break;
      out.push({
        t: now,
        state: { kind: "train", trip: leg.trip, from: leg.from, to: leg.to, boardedFrom: here },
      });
      now = leg.arr;
      here = {
        kind: "platform",
        station: trip.stops[leg.to] as number,
        since: leg.arr,
        arrivedDir: trip.dir,
      };
    } else {
      const a = ds.stations[leg.from];
      const b = ds.stations[leg.to];
      if (!a || !b) break;
      const dest: OnPlatform = {
        kind: "platform",
        station: leg.to,
        since: now + leg.seconds,
        arrivedDir: null,
      };
      out.push({
        t: now,
        state: {
          kind: "walking",
          reason: "transfer",
          start: now,
          end: now + leg.seconds,
          fromPoint: [a.lat, a.lon],
          toPoint: [b.lat, b.lon],
          dest,
        },
      });
      now += leg.seconds;
      here = dest;
    }
  }
  return out;
}

/** The state in force at time t: the last entry chosen at or before t. */
export function trailStateAt(trail: readonly TrailEntry[], t: number): Transit | null {
  let found: Transit | null = null;
  for (const e of trail) {
    if (e.t > t) break;
    found = e.state;
  }
  return found;
}

export function trailPosition(
  geo: Geometry,
  trail: readonly TrailEntry[],
  t: number,
): LonLat | null {
  const state = trailStateAt(trail, t);
  return state ? geo.playerPosition(state, t) : null;
}

/** Positions every `step` game-seconds from `from` to `to` (inclusive), for drawing a path. */
export function sampleTrail(
  geo: Geometry,
  trail: readonly TrailEntry[],
  from: number,
  to: number,
  step = 15,
): { t: number; p: LonLat }[] {
  const out: { t: number; p: LonLat }[] = [];
  for (let t = from; ; t = Math.min(t + step, to)) {
    const p = trailPosition(geo, trail, t);
    if (p) out.push({ t, p });
    if (t >= to) break;
  }
  return out;
}
