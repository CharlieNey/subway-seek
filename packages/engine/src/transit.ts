/**
 * A player's movement through the subway, as a pure state machine.
 *
 * State is stored lazily: a train ride is just (trip, board stop, alight stop), and
 * `resolve(state, t)` works out where that leaves you at game time t — still waiting,
 * riding, or arrived. No timers; the server and every client derive the same answer
 * from the shared clock and the public timetable.
 */
import type { Direction, LatLon } from "@subway-seek/data";
import { distanceMeters } from "./geo.ts";
import type { TimetableIndex } from "./timetable.ts";

/** Going up to the street or back down to the platform takes 2 game-minutes. */
export const EXIT_SECONDS = 120;
export const ENTER_SECONDS = 120;
/** Walking pace on the street (game time). */
export const WALK_MPS = 1.4;
/** Street distance ≈ straight-line × this (Manhattan-grid-ish detour). */
export const WALK_DETOUR = 1.3;
/** How far from your station's center you can wander on foot before you have to ride. */
export const STREET_RADIUS_M = 600;

export interface OnPlatform {
  kind: "platform";
  station: number;
  /** Game time you reached this platform. */
  since: number;
  /** Direction of the train you arrived on, or null if you walked here. */
  arrivedDir: Direction | null;
}

export interface StreetPoint {
  lat: number;
  lon: number;
  /** Street View panorama at this point, when known. */
  pano?: string;
}

export interface OnStreet {
  kind: "street";
  complex: number;
  /** The exit you came up at. */
  exit: number;
  /** Where you're standing, once you've walked away from the exit. */
  at?: StreetPoint;
  since: number;
  /** Game time you came up at this exit (kept across walks). Older states may lack it. */
  up?: number;
}

export interface OnTrain {
  kind: "train";
  trip: number;
  /** Stop index (in the trip) you board at. Until the train departs, you're waiting on the platform. */
  from: number;
  /** Stop index you'll get off at. Defaults to the trip's last stop. */
  to: number;
  /** Where you were before boarding — restored if you cancel before the train leaves. */
  boardedFrom: OnPlatform;
}

export interface Walking {
  kind: "walking";
  reason: "transfer" | "exit" | "enter" | "street";
  start: number;
  end: number;
  fromPoint: LatLon;
  toPoint: LatLon;
  /** The complex you set off from: questions are asked from it until you arrive. */
  fromComplex: number;
  /** Where you'll be once you arrive. */
  dest: OnPlatform | OnStreet;
}

export type Transit = OnPlatform | OnStreet | OnTrain | Walking;

export type TransitIntent =
  | { type: "board"; trip: number; stop: number }
  | { type: "cancelBoard" }
  | { type: "alightAt"; stop: number }
  | { type: "transfer"; to: number }
  | { type: "exit"; exit: number }
  | { type: "enter"; station: number }
  | { type: "walkTo"; lat: number; lon: number; pano?: string };

export type ApplyResult = { ok: true; state: Transit } | { ok: false; error: string };

const fail = (error: string): ApplyResult => ({ ok: false, error });

/** Where the state leaves you at game time t: finished rides and walks collapse to their destination. */
export function resolve(state: Transit, t: number, idx: TimetableIndex): Transit {
  if (state.kind === "train") {
    const trip = idx.ds.trips[state.trip];
    const arrival = trip?.arr[state.to];
    if (trip && arrival !== undefined && t >= arrival) {
      return {
        kind: "platform",
        station: trip.stops[state.to] as number,
        since: arrival,
        arrivedDir: trip.dir,
      };
    }
    return state;
  }
  if (state.kind === "walking" && t >= state.end) return state.dest;
  return state;
}

/** What the rules of the round allow beyond the plain transit rules. */
export interface MoveOptions {
  /** A street walk may go past STREET_RADIUS_M (toward a hider in sight). */
  pastRadius?: boolean;
}

/** Apply a player's intent at game time t. The state is resolved to t first. */
export function applyIntent(
  current: Transit,
  intent: TransitIntent,
  t: number,
  idx: TimetableIndex,
  options: MoveOptions = {},
): ApplyResult {
  const state = resolve(current, t, idx);
  const { ds } = idx;

  switch (intent.type) {
    case "board": {
      if (state.kind !== "platform") return fail("You need to be on a platform to board.");
      const trip = ds.trips[intent.trip];
      if (!trip) return fail("No such train.");
      if (trip.stops[intent.stop] !== state.station) return fail("That train doesn't stop here.");
      if (intent.stop >= trip.stops.length - 1) return fail("That train terminates here.");
      const dep = trip.dep[intent.stop] as number;
      if (dep < t) return fail("That train has already left.");
      const changing = state.arrivedDir !== null && state.arrivedDir !== trip.dir;
      if (changing && dep < state.since + (idx.selfTransfer[state.station] ?? 0)) {
        return fail("Not enough time to change platforms for that train.");
      }
      return {
        ok: true,
        state: {
          kind: "train",
          trip: intent.trip,
          from: intent.stop,
          to: trip.stops.length - 1,
          boardedFrom: state,
        },
      };
    }

    case "cancelBoard": {
      if (state.kind !== "train") return fail("You're not waiting for a train.");
      const dep = ds.trips[state.trip]?.dep[state.from] as number;
      if (t >= dep) return fail("The train has already left.");
      return { ok: true, state: state.boardedFrom };
    }

    case "alightAt": {
      if (state.kind !== "train") return fail("You're not on a train.");
      const trip = ds.trips[state.trip];
      if (!trip) return fail("No such train.");
      const last = trip.stops.length - 1;
      const j = intent.stop;
      if (!Number.isInteger(j) || j <= state.from || j > last)
        return fail("That's not a stop ahead.");
      const arr = trip.arr[j] as number;
      const leaves = j === last ? Number.POSITIVE_INFINITY : (trip.dep[j] as number);
      if (t >= leaves) return fail("The train has already left that stop.");
      if (t >= arr) {
        // Doors are open at this stop right now: step off.
        return {
          ok: true,
          state: {
            kind: "platform",
            station: trip.stops[j] as number,
            since: t,
            arrivedDir: trip.dir,
          },
        };
      }
      return { ok: true, state: { ...state, to: j } };
    }

    case "transfer": {
      if (state.kind !== "platform") return fail("You need to be on a platform to transfer.");
      const link = idx.transfersFrom[state.station]?.find((x) => x.to === intent.to);
      if (!link) return fail("No transfer to that station from here.");
      const from = ds.stations[state.station];
      const to = ds.stations[intent.to];
      if (!from || !to) return fail("No such station.");
      return {
        ok: true,
        state: {
          kind: "walking",
          reason: "transfer",
          start: t,
          end: t + link.seconds,
          fromPoint: [from.lat, from.lon],
          toPoint: [to.lat, to.lon],
          fromComplex: from.complex,
          dest: { kind: "platform", station: intent.to, since: t + link.seconds, arrivedDir: null },
        },
      };
    }

    case "exit": {
      if (state.kind !== "platform")
        return fail("You need to be in a station to go up to the street.");
      const station = ds.stations[state.station];
      const complex = station && ds.complexes[station.complex];
      const exitPoint = complex?.exits[intent.exit];
      if (!station || !complex || !exitPoint) return fail("No such exit.");
      return {
        ok: true,
        state: {
          kind: "walking",
          reason: "exit",
          start: t,
          end: t + EXIT_SECONDS,
          fromPoint: [station.lat, station.lon],
          toPoint: exitPoint,
          fromComplex: station.complex,
          dest: {
            kind: "street",
            complex: station.complex,
            exit: intent.exit,
            since: t + EXIT_SECONDS,
            up: t + EXIT_SECONDS,
          },
        },
      };
    }

    case "enter": {
      if (state.kind !== "street") return fail("You need to be on the street to enter a station.");
      const complex = ds.complexes[state.complex];
      const station = ds.stations[intent.station];
      if (!complex || !station || !complex.stations.includes(intent.station)) {
        return fail("That station isn't part of this complex.");
      }
      // From wherever you're standing: walk to the nearest exit, then down.
      const here = streetPoint(state, idx);
      const walkBack = Math.min(
        ...complex.exits.map(([lat, lon]) => walkSeconds(here, { lat, lon })),
      );
      const duration = walkBack + ENTER_SECONDS;
      return {
        ok: true,
        state: {
          kind: "walking",
          reason: "enter",
          start: t,
          end: t + duration,
          fromPoint: [here.lat, here.lon],
          toPoint: [station.lat, station.lon],
          fromComplex: state.complex,
          dest: {
            kind: "platform",
            station: intent.station,
            since: t + duration,
            arrivedDir: null,
          },
        },
      };
    }

    case "walkTo": {
      if (state.kind !== "street") return fail("You need to be on the street to walk around.");
      const complex = ds.complexes[state.complex];
      if (!complex) return fail("No such station.");
      const target: StreetPoint = { lat: intent.lat, lon: intent.lon, pano: intent.pano };
      if (!options.pastRadius && distanceMeters(complex, target) > STREET_RADIUS_M) {
        return fail("That's too far to walk. Take the subway.");
      }
      const here = streetPoint(state, idx);
      const end = t + walkSeconds(here, target);
      return {
        ok: true,
        state: {
          kind: "walking",
          reason: "street",
          start: t,
          end,
          fromPoint: [here.lat, here.lon],
          toPoint: [target.lat, target.lon],
          fromComplex: state.complex,
          dest: {
            kind: "street",
            complex: state.complex,
            exit: state.exit,
            at: target,
            since: end,
            up: state.up,
          },
        },
      };
    }
  }
}

/** Game seconds to walk between two points along the streets. */
export function walkSeconds(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  return (distanceMeters(a, b) * WALK_DETOUR) / WALK_MPS;
}

/** Where someone on the street is standing: where they walked to, or their exit. */
export function streetPoint(state: OnStreet, idx: TimetableIndex): StreetPoint {
  if (state.at) return state.at;
  const c = idx.ds.complexes[state.complex];
  const [lat, lon] = c?.exits[state.exit] ?? [c?.lat ?? 0, c?.lon ?? 0];
  return { lat, lon };
}

/** The station index a state is "at" for questions and UI: your platform, or your train's last stop. */
export function lastStation(state: Transit, t: number, idx: TimetableIndex): number | null {
  const s = resolve(state, t, idx);
  if (s.kind === "platform") return s.station;
  if (s.kind === "train") {
    const trip = idx.ds.trips[s.trip];
    if (!trip) return null;
    let k = s.from;
    while (k + 1 <= s.to && (trip.arr[k + 1] as number) <= t) k++;
    return trip.stops[k] as number;
  }
  return null;
}

/**
 * "Next stop" fast-forward pulls up this long before the train reaches the stop.
 * Most stops in the timetable have no dwell (arrival = departure), so landing on the
 * arrival itself would be too late to get off there.
 */
export const SKIP_LEAD_SECONDS = 30;

/**
 * The next moment something happens for this player, for fast-forward:
 * - "next": the train leaving, approaching its next stop (SKIP_LEAD_SECONDS out, while
 *   you can still get off) or reaching your stop, or the end of a walk
 * - "end": arriving where you're headed (your stop, or the end of a walk)
 * Null when nothing is pending (standing on a platform or the street).
 */
export function nextEventTime(
  state: Transit,
  t: number,
  idx: TimetableIndex,
  scope: "next" | "end",
): number | null {
  const s = resolve(state, t, idx);
  if (s.kind === "walking") return s.end;
  if (s.kind !== "train") return null;
  const trip = idx.ds.trips[s.trip];
  if (!trip) return null;
  if (scope === "end") return trip.arr[s.to] ?? null;
  const dep = trip.dep[s.from] as number;
  if (t < dep) return dep;
  for (let j = s.from + 1; j <= s.to; j++) {
    const a = trip.arr[j] as number;
    const target = j === s.to ? a : a - SKIP_LEAD_SECONDS;
    if (target > t) return target;
  }
  return null;
}
