/**
 * Departure boards as the platform's countdown clocks (DESIGN.md, Interaction and
 * Sidebar): a row per route and direction with its next two trains, the minutes largest.
 * A row you can't make is dimmed with its reason. On a train, the same board shows the
 * connections at the stop you're getting off at, around your arrival.
 */
import type { Direction, Route } from "@stand-clear/data";
import {
  type ActiveCurse,
  type BoardRow,
  type Departure,
  departureBoard,
  type OnPlatform,
  type TimetableIndex,
} from "@stand-clear/engine";
import { displayName } from "./names.ts";

export interface CountdownLine {
  route: Route;
  dir: Direction;
  /** The first train's headsign. */
  dest: string;
  first: Departure;
  then: Departure | null;
  /** Whole minutes from `from` (now, or your arrival) to each train. */
  minutes: number;
  thenMinutes: number | null;
  /** Why you can't board the first train, in words. Dims the row. */
  reason: string | null;
  /** Ruled out by a curse rather than by the clock: struck through as well. */
  struck: boolean;
  /** For connections: which way it runs, and which station of the complex it leaves from. */
  note?: string;
}

export interface DirectionGroup {
  dir: Direction;
  /** "Uptown & Queens". */
  label: string;
  lines: CountdownLine[];
}

const minutesUntil = (dep: number, from: number) => Math.max(0, Math.floor((dep - from) / 60));

/**
 * The platform board: the next two trains per route and direction, grouped by direction,
 * rows in order of their first train. Rows are dimmed when the first train leaves too soon
 * to change platforms, or a curse rules them out.
 */
export function platformBoard(
  idx: TimetableIndex,
  state: OnPlatform,
  t: number,
  curses: readonly ActiveCurse[],
  { horizon = 30 * 60 }: { horizon?: number } = {},
): DirectionGroup[] {
  const st = idx.ds.stations[state.station];
  if (!st) return [];
  const changeBy = state.since + (idx.selfTransfer[state.station] ?? 0);
  const wrongWay = curses.find((c) => c.card === "wrongWay");
  const tourist = curses.some((c) => c.card === "tourist");
  const rows = departureBoard(idx, state.station, t, { horizon });
  const groups: DirectionGroup[] = [];
  for (const dir of [0, 1] as const) {
    const lines = rows
      .filter((r) => r.dir === dir)
      .map((r): CountdownLine => {
        const first = r.trains[0] as Departure;
        let reason: string | null = null;
        let struck = false;
        if (tourist) {
          reason = "Tourist: walk 200 m first";
          struck = true;
        } else if (wrongWay?.card === "wrongWay" && wrongWay.dir !== dir) {
          const way = wrongWay.dir === 0 ? st.northLabel : st.southLabel;
          reason = `Wrong way: ${way.toLowerCase()} only`;
          struck = true;
        } else if (state.arrivedDir !== null && state.arrivedDir !== dir && first.dep < changeBy) {
          reason = "too soon to change platforms";
        }
        return line(r, t, reason, struck);
      });
    if (lines.length > 0)
      groups.push({ dir, label: dir === 0 ? st.northLabel : st.southLabel, lines });
  }
  return groups;
}

function line(r: BoardRow, from: number, reason: string | null, struck: boolean): CountdownLine {
  const first = r.trains[0] as Departure;
  const then = r.trains[1] ?? null;
  return {
    route: r.route,
    dir: r.dir,
    dest: displayName(first.headsign),
    first,
    then,
    minutes: minutesUntil(first.dep, from),
    thenMinutes: then ? minutesUntil(then.dep, from) : null,
    reason,
    struck,
  };
}

/** "↑ uptown & the Bronx" from a station's direction label. */
function wayNote(label: string, dir: Direction): string {
  const words = label
    .toLowerCase()
    .replace(/\b(the )?(bronx|brooklyn|queens|manhattan)\b/g, (m) =>
      m.replace(/\b(bronx|brooklyn|queens|manhattan)\b/, (b) => b[0]?.toUpperCase() + b.slice(1)),
    );
  return `${dir === 0 ? "↑" : "↓"} ${words}`;
}

/**
 * Connections at the stop you're getting off at, around your arrival: trains from that
 * platform, and from the stations you can walk to from it (the rest of the complex),
 * that you can still make once you're off: platform changes and walks take their GTFS
 * times. The train you're on is left out (staying on is always an option). Minutes count
 * from your arrival.
 */
export function connectionsBoard(
  idx: TimetableIndex,
  ride: { trip: number; to: number },
  { horizon = 20 * 60, limit = 5 }: { horizon?: number; limit?: number } = {},
): { station: number; arrival: number; lines: CountdownLine[] } | null {
  const trip = idx.ds.trips[ride.trip];
  const station = trip?.stops[ride.to];
  const arrival = trip?.arr[ride.to];
  if (!trip || station === undefined || arrival === undefined) return null;
  const options: { station: number; ready: (d: Departure) => number }[] = [
    {
      station,
      // Same direction: across the platform. The other way: a platform change.
      ready: (d) => (d.dir === trip.dir ? arrival : arrival + (idx.selfTransfer[station] ?? 0)),
    },
    ...(idx.transfersFrom[station] ?? []).map((x) => ({
      station: x.to,
      ready: () => arrival + Math.max(x.seconds, 0),
    })),
  ];
  const lines: CountdownLine[] = [];
  for (const o of options) {
    const st = idx.ds.stations[o.station];
    if (!st) continue;
    const rows = departureBoard(idx, o.station, arrival, { horizon, perRow: 6 });
    for (const r of rows) {
      if (
        o.station === station &&
        r.route.id === idx.ds.routes[trip.route]?.id &&
        r.dir === trip.dir
      ) {
        continue;
      }
      const makeable = r.trains.filter((d) => d.trip !== ride.trip && d.dep >= o.ready(d));
      if (makeable.length === 0) continue;
      const l = line({ ...r, trains: makeable.slice(0, 2) }, arrival, null, false);
      l.note = wayNote(r.dir === 0 ? st.northLabel : st.southLabel, r.dir);
      lines.push(l);
    }
  }
  lines.sort((a, b) => a.first.dep - b.first.dep);
  return { station, arrival, lines: lines.slice(0, limit) };
}
