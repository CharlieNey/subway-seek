/**
 * M0: MTA open data → packages/data/dataset/nyc-subway.json
 *
 *   pnpm data:build              # uses cached downloads in packages/data/raw/
 *   pnpm data:build --refresh    # re-download sources first
 *
 * Sources: MTA subway static GTFS (regular feed, not the "supplemented" one, which
 * layers in this week's planned work), plus MTA's station and entrance datasets
 * on data.ny.gov for borough, complex and exit locations.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { strFromU8, unzipSync } from "fflate";
import {
  type CalendarDateRow,
  type CalendarRow,
  findExpressStations,
  parseGtfsTime,
  resolveServiceIds,
  round,
  routeLetter,
  simplifyLine,
} from "../src/build.ts";
import type {
  Borough,
  Complex,
  LatLon,
  Route,
  Shape,
  Station,
  SubwayData,
  Transfer,
  Trip,
} from "../src/types.ts";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const rawDir = join(pkgRoot, "raw");
const outPath = join(pkgRoot, "dataset", "nyc-subway.json");

/** The service day of the dataset already on disk, so a plain rebuild keeps the pin. */
function currentPin(): string | undefined {
  if (!existsSync(outPath)) return undefined;
  const { meta } = JSON.parse(readFileSync(outPath, "utf8")) as { meta?: { serviceDate?: string } };
  return meta?.serviceDate;
}

/**
 * The pinned service day: a plain Wednesday inside the feed's validity range. Re-pin with
 * `pnpm data:build --refresh --date=YYYY-MM-DD` (see docs/DEPLOY.md, "Re-pinning the
 * timetable"); without `--date` the rebuild keeps the current pin. `pnpm data:check` says
 * how far away the current pin is.
 */
const SERVICE_DATE: string = (() => {
  const date =
    process.argv.find((a) => a.startsWith("--date="))?.slice("--date=".length) ??
    process.env.SERVICE_DATE ??
    currentPin();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error(`--date must be YYYY-MM-DD, got ${date ?? "nothing"}`);
  return date;
})();
const PLAY_WINDOW = [10 * 3600, 13 * 3600] as const;
const EXCLUDED_ROUTES = new Set(["SI"]); // Staten Island Railway: unreachable without the ferry
const SHAPE_TOLERANCE_M = 4;
const EXPRESS_MIN_CALLS = 6; // ≈ 2 express trains an hour across the 3-hour window

const SOURCES = {
  gtfs: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip",
  stations: "https://data.ny.gov/api/views/39hk-dx4f/rows.csv?accessType=DOWNLOAD",
  entrances: "https://data.ny.gov/api/views/i9wp-a4ja/rows.csv?accessType=DOWNLOAD",
} as const;

const refresh = process.argv.includes("--refresh");
const warnings: string[] = [];
const notes: string[] = [];

type Row = Record<string, string>;

async function fetchCached(name: string, url: string): Promise<Uint8Array> {
  const path = join(rawDir, name);
  if (existsSync(path) && !refresh) return readFileSync(path);
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  mkdirSync(rawDir, { recursive: true });
  writeFileSync(path, buf);
  return buf;
}

function csv<T = Row>(text: string): T[] {
  return parse(text, { columns: true, skip_empty_lines: true, bom: true }) as T[];
}

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Missing ${what}`);
  return value;
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
}

const BOROUGHS = new Set<string>(["M", "Bk", "Q", "Bx"]);

async function main() {
  const zip = unzipSync(await fetchCached("gtfs_subway.zip", SOURCES.gtfs));
  const gtfs = (name: string) => strFromU8(must(zip[name], `${name} in GTFS zip`));
  const stationRows = csv(strFromU8(await fetchCached("stations.csv", SOURCES.stations)));
  const entranceRows = csv(strFromU8(await fetchCached("entrances.csv", SOURCES.entrances)));

  // --- Service day -----------------------------------------------------------
  const feedInfo = must(csv(gtfs("feed_info.txt"))[0], "feed_info row");
  const serviceIds = resolveServiceIds(
    SERVICE_DATE,
    csv<CalendarRow>(gtfs("calendar.txt")),
    csv<CalendarDateRow>(gtfs("calendar_dates.txt")),
  );
  if (serviceIds.length === 0) throw new Error(`No service on ${SERVICE_DATE}`);

  // --- Routes ----------------------------------------------------------------
  const gtfsRoutes = csv(gtfs("routes.txt")).filter(
    (r) => !EXCLUDED_ROUTES.has(must(r.route_id, "route_id")),
  );
  const routeIds = new Set(gtfsRoutes.map((r) => r.route_id as string));
  const routes: Route[] = gtfsRoutes.map((r) => {
    const id = r.route_id as string;
    const letter = routeLetter(id, routeIds);
    const diamond = letter !== id;
    return {
      id,
      letter,
      display: diamond ? letter : (r.route_short_name ?? id),
      diamond,
      color: r.route_color || "808183",
      textColor: r.route_text_color || "FFFFFF",
      name: r.route_long_name ?? "",
    };
  });
  const routeIndex = new Map(routes.map((r, i) => [r.id, i]));

  // --- Trips + stop times ----------------------------------------------------
  const gtfsTrips = csv(gtfs("trips.txt")).filter(
    (t) => serviceIds.includes(t.service_id as string) && routeIndex.has(t.route_id as string),
  );
  const tripById = new Map(gtfsTrips.map((t) => [t.trip_id as string, t]));

  const parentOf = new Map<string, string>();
  const stopRows = new Map<string, Row>();
  for (const s of csv(gtfs("stops.txt"))) {
    const id = s.stop_id as string;
    parentOf.set(id, s.parent_station || id);
    stopRows.set(id, s);
  }

  interface StopTime {
    seq: number;
    station: string;
    arr: number;
    dep: number;
  }
  const byTrip = new Map<string, StopTime[]>();
  for (const r of csv(gtfs("stop_times.txt"))) {
    const tripId = r.trip_id as string;
    if (!tripById.has(tripId)) continue;
    getOrCreate(byTrip, tripId, () => []).push({
      seq: Number(r.stop_sequence),
      station: must(parentOf.get(r.stop_id as string), `parent of ${r.stop_id}`),
      arr: parseGtfsTime(r.arrival_time as string),
      dep: parseGtfsTime(r.departure_time as string),
    });
  }
  for (const list of byTrip.values()) list.sort((a, b) => a.seq - b.seq);

  // --- Stations (only those served on the service day) -----------------------
  const meta = new Map(stationRows.map((r) => [r["GTFS Stop ID"] as string, r]));
  const servedIds = [
    ...new Set([...byTrip.values()].flatMap((l) => l.map((s) => s.station))),
  ].sort();
  const stationIndex = new Map(servedIds.map((id, i) => [id, i]));

  const exitsById = new Map<string, Set<string>>();
  for (const e of entranceRows) {
    if (e["Exit Allowed"] !== "YES") continue;
    const key = `${round(Number(e["Entrance Latitude"]), 6)},${round(Number(e["Entrance Longitude"]), 6)}`;
    // Shared entrances list several stations: "A12; D13".
    for (const id of (e["GTFS Stop ID"] as string).split(";").map((s) => s.trim())) {
      getOrCreate(exitsById, id, () => new Set<string>()).add(key);
    }
  }

  const stations: Station[] = servedIds.map((id) => {
    const m = must(meta.get(id), `station metadata for ${id}`);
    const stop = must(stopRows.get(id), `stop ${id}`);
    const lat = round(Number(stop.stop_lat), 6);
    const lon = round(Number(stop.stop_lon), 6);
    const borough = m.Borough as string;
    if (!BOROUGHS.has(borough)) throw new Error(`Unexpected borough ${borough} for ${id}`);
    return {
      id,
      name: (m["Stop Name"] as string) || (stop.stop_name as string),
      lat,
      lon,
      borough: borough as Borough,
      complex: -1, // filled below
      structure: m.Structure as string,
      northLabel: (m["North Direction Label"] as string) || "Northbound",
      southLabel: (m["South Direction Label"] as string) || "Southbound",
      routes: [],
      express: false,
    };
  });

  // --- Trips → compact form ---------------------------------------------------
  const sortedTrips = gtfsTrips
    .filter((t) => byTrip.get(t.trip_id as string)?.length)
    .sort((a, b) => {
      const da = must(byTrip.get(a.trip_id as string), "trip")[0]?.dep ?? 0;
      const db = must(byTrip.get(b.trip_id as string), "trip")[0]?.dep ?? 0;
      return da - db || (a.trip_id as string).localeCompare(b.trip_id as string);
    });
  const shapeIndex = new Map<string, number>();
  const shapeRoute: number[] = [];
  const trips: Trip[] = sortedTrips.map((t) => {
    const list = must(byTrip.get(t.trip_id as string), "trip stops");
    const route = must(routeIndex.get(t.route_id as string), "route");
    const shapeId = t.shape_id as string;
    if (!shapeIndex.has(shapeId)) {
      shapeIndex.set(shapeId, shapeIndex.size);
      shapeRoute.push(route);
    }
    return {
      route,
      dir: t.direction_id === "1" ? 1 : 0,
      headsign: (t.trip_headsign as string) ?? "",
      shape: must(shapeIndex.get(shapeId), "shape"),
      stops: list.map((s) => must(stationIndex.get(s.station), `station ${s.station}`)),
      arr: list.map((s) => s.arr),
      dep: list.map((s) => s.dep),
    };
  });

  // --- Play-window attributes: routes per station, express stops ---------------
  const inWindow = (s: number) => s >= PLAY_WINDOW[0] && s <= PLAY_WINDOW[1];
  const stationRoutes = stations.map(() => new Set<string>());
  const busyness = stations.map(() => 0);
  for (const trip of trips) {
    const letter = must(routes[trip.route], "route").letter;
    trip.stops.forEach((s, k) => {
      if (!inWindow(trip.dep[k] as number)) return;
      stationRoutes[s]?.add(letter);
      busyness[s] = (busyness[s] ?? 0) + 1;
    });
  }
  const express = findExpressStations(trips, PLAY_WINDOW, EXPRESS_MIN_CALLS);
  stations.forEach((st, i) => {
    st.routes = [...(stationRoutes[i] ?? [])].sort();
    st.express = express.has(i);
  });

  // --- Complexes ---------------------------------------------------------------
  const byComplex = new Map<string, number[]>();
  stations.forEach((st, i) => {
    const cid = must(meta.get(st.id), "meta")["Complex ID"] as string;
    getOrCreate(byComplex, cid, () => []).push(i);
  });
  const complexes: Complex[] = [...byComplex.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([id, members]) => {
      const busiest = [...members].sort(
        (a, b) => (busyness[b] ?? 0) - (busyness[a] ?? 0),
      )[0] as number;
      const hub = must(stations[busiest], "hub station");
      // Most common constituent name; ties → the busiest station's name.
      const counts = new Map<string, number>();
      for (const i of members) {
        const n = must(stations[i], "station").name;
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
      const top = Math.max(...counts.values());
      const name =
        counts.get(hub.name) === top ? hub.name : [...counts].find(([, c]) => c === top)?.[0];
      const exitKeys = new Set(
        members.flatMap((i) => [...(exitsById.get(must(stations[i], "station").id) ?? [])]),
      );
      if (exitKeys.size === 0)
        warnings.push(`no exits listed for complex ${id} ${hub.name}; using its center`);
      const exits: LatLon[] = exitKeys.size
        ? [...exitKeys].map((k) => k.split(",").map(Number) as unknown as LatLon)
        : [[hub.lat, hub.lon]];
      return {
        id,
        name: name ?? hub.name,
        lat: hub.lat,
        lon: hub.lon,
        borough: hub.borough,
        stations: members,
        routes: [...new Set(members.flatMap((i) => must(stations[i], "station").routes))].sort(),
        express: members.some((i) => stations[i]?.express),
        exits,
      };
    });
  complexes.forEach((c, ci) => {
    for (const i of c.stations) must(stations[i], "station").complex = ci;
  });

  // --- Transfers ----------------------------------------------------------------
  const seen = new Set<string>();
  const transfers: Transfer[] = [];
  for (const r of csv(gtfs("transfers.txt"))) {
    const from = stationIndex.get(r.from_stop_id as string);
    const to = stationIndex.get(r.to_stop_id as string);
    if (from === undefined || to === undefined) continue;
    const key = `${from}>${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    transfers.push({ from, to, seconds: Number(r.min_transfer_time) || 0 });
    const cf = stations[from]?.complex;
    const ct = stations[to]?.complex;
    if (cf !== ct) {
      notes.push(
        `in-system transfer between complexes: ${stations[from]?.name} (${stations[from]?.id}) → ${stations[to]?.name} (${stations[to]?.id})`,
      );
    }
  }

  // --- Shapes ---------------------------------------------------------------------
  const rawShapes = new Map<string, { seq: number; pt: [number, number] }[]>();
  for (const r of csv(gtfs("shapes.txt"))) {
    const id = r.shape_id as string;
    if (!shapeIndex.has(id)) continue;
    getOrCreate(rawShapes, id, () => []).push({
      seq: Number(r.shape_pt_sequence),
      pt: [Number(r.shape_pt_lon), Number(r.shape_pt_lat)],
    });
  }
  const shapes: Shape[] = [...shapeIndex.entries()].map(([id, i]) => {
    const pts = (rawShapes.get(id) ?? []).sort((a, b) => a.seq - b.seq).map((p) => p.pt);
    if (pts.length < 2) warnings.push(`shape ${id} has ${pts.length} points`);
    return {
      route: must(shapeRoute[i], "shape route"),
      points: simplifyLine(pts, SHAPE_TOLERANCE_M).map(([x, y]) => [round(x, 5), round(y, 5)]),
    };
  });

  // --- Write -----------------------------------------------------------------------
  const dataset: SubwayData = {
    meta: {
      version: 1,
      serviceDate: SERVICE_DATE,
      serviceIds,
      feedVersion: feedInfo.feed_version ?? "",
      generatedAt: new Date().toISOString(),
      sources: Object.values(SOURCES),
      playWindow: PLAY_WINDOW,
    },
    routes,
    stations,
    complexes,
    transfers,
    trips,
    shapes,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(dataset)}\n`);

  const stopTimes = trips.reduce((n, t) => n + t.stops.length, 0);
  const shapePts = shapes.reduce((n, s) => n + s.points.length, 0);
  console.log(`service ${SERVICE_DATE} (${serviceIds.join(", ")}), feed ${feedInfo.feed_version}`);
  console.log(
    `routes ${routes.length} · stations ${stations.length} · complexes ${complexes.length} · ` +
      `trips ${trips.length} · stop times ${stopTimes} · transfers ${transfers.length} · ` +
      `shapes ${shapes.length} (${shapePts} pts)`,
  );
  console.log(
    `in play window: ${stations.filter((s) => s.routes.length).length} stations served, ` +
      `${stations.filter((s) => s.express).length} express stations, ` +
      `${complexes.filter((c) => c.express).length} express complexes`,
  );
  console.log(`wrote ${outPath} (${(statSync(outPath).size / 1e6).toFixed(1)} MB)`);
  if (notes.length) {
    console.log(`\n${notes.length} note(s):`);
    for (const n of notes) console.log(`  - ${n}`);
  }
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
