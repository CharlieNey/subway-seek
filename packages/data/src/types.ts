/**
 * The game's subway dataset: one pinned weekday of the MTA subway timetable,
 * plus station metadata (borough, complex, exits) the question engine needs.
 *
 * Indices are positions in the top-level arrays (`stations[i]`, `routes[i]`, ...).
 * Times are seconds since midnight of the service day and can exceed 86 400
 * (GTFS writes trips that run past midnight as e.g. 25:10:00).
 */

export type Borough = "M" | "Bk" | "Q" | "Bx";

/** Direction of travel: 0 = northbound ("N" platforms), 1 = southbound ("S"). */
export type Direction = 0 | 1;

/** [lat, lon] */
export type LatLon = readonly [number, number];

export interface DatasetMeta {
  version: 1;
  /** Pinned service date, ISO (YYYY-MM-DD). */
  serviceDate: string;
  serviceIds: string[];
  feedVersion: string;
  generatedAt: string;
  sources: string[];
  /** Window (seconds since midnight) used for per-station `routes` and `express`. */
  playWindow: readonly [number, number];
}

export interface Route {
  /** GTFS route_id, e.g. "A", "6X", "GS". */
  id: string;
  /** Identity for questions ("does the 6 stop at your station?"): express variants fold in, 6X → 6. */
  letter: string;
  /** Bullet text: the three shuttles all show "S"; 6X shows "6". */
  display: string;
  /** Diamond bullet (6X, 7X, FX express variants). */
  diamond: boolean;
  /** Hex without '#'. */
  color: string;
  textColor: string;
  name: string;
}

export interface Station {
  /** GTFS parent stop_id, e.g. "127". */
  id: string;
  name: string;
  lat: number;
  lon: number;
  borough: Borough;
  /** Index into `complexes`. */
  complex: number;
  /** MTA structure: Subway, Elevated, Open Cut, Viaduct, At Grade, Embankment. */
  structure: string;
  northLabel: string;
  southLabel: string;
  /** Route letters with at least one stop here inside the play window, sorted. */
  routes: string[];
  /** Express trains regularly stop here inside the play window (see findExpressStations). */
  express: boolean;
}

/** What players see as "a station": one or more GTFS stations joined by in-system transfers. */
export interface Complex {
  /** MTA complex id. */
  id: string;
  name: string;
  /** Zone center: the busiest constituent station's coordinate. */
  lat: number;
  lon: number;
  borough: Borough;
  /** Indices into `stations`. */
  stations: number[];
  /** Union of constituent stations' route letters, sorted. */
  routes: string[];
  express: boolean;
  /**
   * Street exits for the whole complex — MTA files each entrance under one constituent
   * station, so exits only make sense at this level. Never empty: falls back to the center.
   */
  exits: LatLon[];
}

export interface Transfer {
  from: number;
  to: number;
  /** Minimum transfer time in seconds (GTFS min_transfer_time). from === to is a same-station transfer. */
  seconds: number;
}

export interface Trip {
  /** Index into `routes`. */
  route: number;
  dir: Direction;
  headsign: string;
  /** Index into `shapes`. */
  shape: number;
  /** Station indices in calling order. */
  stops: number[];
  /** Arrival / departure seconds, parallel to `stops`. */
  arr: number[];
  dep: number[];
}

export interface Shape {
  /** Index into `routes` (first route seen using this shape). */
  route: number;
  /** Simplified polyline as [lon, lat] (GeoJSON order, for the map). */
  points: [number, number][];
}

export interface Dataset {
  meta: DatasetMeta;
  routes: Route[];
  stations: Station[];
  complexes: Complex[];
  transfers: Transfer[];
  trips: Trip[];
  shapes: Shape[];
}
