/**
 * Pure helpers for scripts/build-dataset.ts — kept here so they're unit-tested.
 */

/** "25:10:30" → 90630. GTFS service times can exceed 24:00:00. */
export function parseGtfsTime(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  if (h === undefined || m === undefined || s === undefined || [h, m, s].some(Number.isNaN)) {
    throw new Error(`Bad GTFS time: ${t}`);
  }
  return h * 3600 + m * 60 + s;
}

export interface CalendarRow {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
}

export interface CalendarDateRow {
  service_id: string;
  date: string;
  /** "1" = service added on this date, "2" = removed. */
  exception_type: string;
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/** Service ids active on an ISO date, per GTFS calendar + calendar_dates rules. */
export function resolveServiceIds(
  isoDate: string,
  calendar: CalendarRow[],
  calendarDates: CalendarDateRow[],
): string[] {
  const ymd = isoDate.replaceAll("-", "");
  const weekday = WEEKDAYS[new Date(`${isoDate}T12:00:00Z`).getUTCDay()];
  if (!weekday) throw new Error(`Bad date: ${isoDate}`);
  const active = new Set(
    calendar
      .filter((c) => c[weekday] === "1" && c.start_date <= ymd && ymd <= c.end_date)
      .map((c) => c.service_id),
  );
  for (const d of calendarDates) {
    if (d.date !== ymd) continue;
    if (d.exception_type === "1") active.add(d.service_id);
    if (d.exception_type === "2") active.delete(d.service_id);
  }
  return [...active].sort();
}

/**
 * Stations where express trains regularly stop during the play window.
 *
 * A hop a→b (consecutive stops of one trip) is "express" when some other trip runs
 * from a to b with at least one stop in between — i.e. this train skipped a station
 * that a local serves. GTFS stop ids are per line, so a and b are on the same line.
 * Both ends of an express hop count as an express call: 96 St (2/3) yes, 86 St (1) no.
 *
 * Only calls inside the window count, and a station needs `minCalls` of them, so a
 * one-off reroute or the tail of rush-hour service doesn't make a station "express".
 */
export function findExpressStations(
  trips: readonly { stops: readonly number[]; dep: readonly number[] }[],
  window: readonly [number, number],
  minCalls: number,
): Set<number> {
  const MAX_GAP = 30;
  const inWindow = (t: number | undefined) => t !== undefined && t >= window[0] && t <= window[1];
  const active = trips.filter((t) => t.dep.some(inWindow));
  const skippable = new Set<string>();
  for (const { stops } of active) {
    for (let i = 0; i < stops.length; i++) {
      for (let j = i + 2; j < Math.min(stops.length, i + MAX_GAP); j++) {
        skippable.add(`${stops[i]}>${stops[j]}`);
      }
    }
  }
  // Express trains calling at each station — a train counts once per station even when
  // it skips stops on both sides of it.
  const calls = new Map<number, number>();
  for (const { stops, dep } of active) {
    const here = new Set<number>();
    for (let i = 0; i + 1 < stops.length; i++) {
      if (!skippable.has(`${stops[i]}>${stops[i + 1]}`)) continue;
      if (inWindow(dep[i])) here.add(stops[i] as number);
      if (inWindow(dep[i + 1])) here.add(stops[i + 1] as number);
    }
    for (const s of here) calls.set(s, (calls.get(s) ?? 0) + 1);
  }
  return new Set([...calls].filter(([, n]) => n >= minCalls).map(([s]) => s));
}

/**
 * Ramer–Douglas–Peucker on [lon, lat] points, with the tolerance in meters
 * (local equirectangular projection — fine at city scale).
 */
export function simplifyLine(
  points: readonly (readonly [number, number])[],
  toleranceMeters: number,
): [number, number][] {
  if (points.length <= 2) return points.map(([x, y]) => [x, y]);
  const lat0 = ((points[0]?.[1] ?? 0) * Math.PI) / 180;
  const kx = 111_320 * Math.cos(lat0);
  const ky = 110_540;
  const xy = points.map(([lon, lat]) => [lon * kx, lat * ky] as const);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number];
    const [ax, ay] = xy[s] as readonly [number, number];
    const [bx, by] = xy[e] as readonly [number, number];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let maxI = -1;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = xy[i] as readonly [number, number];
      let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > toleranceMeters) {
      keep[maxI] = 1;
      stack.push([s, maxI], [maxI, e]);
    }
  }
  return points.filter((_, i) => keep[i]).map(([x, y]) => [x, y]);
}

/** Route id → question identity: express variants (6X, 7X, FX) fold into their base route. */
export function routeLetter(routeId: string, knownIds: ReadonlySet<string>): string {
  if (routeId.length > 1 && routeId.endsWith("X") && knownIds.has(routeId.slice(0, -1))) {
    return routeId.slice(0, -1);
  }
  return routeId;
}

export function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
