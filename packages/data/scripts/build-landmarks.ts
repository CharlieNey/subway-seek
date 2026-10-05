/**
 * Landmarks for questions → packages/data/dataset/nyc-landmarks.json
 *
 *   pnpm --filter @stand-clear/data build-landmarks             # uses cached downloads in raw/
 *   pnpm --filter @stand-clear/data build-landmarks --refresh   # re-download sources first
 *
 * Each landmark is one pin, and distances are measured to it (the show's rule: "to the
 * map icon"). Kept to places a player would recognise and that the sources list well:
 *   - park:     NYC Parks properties of 20+ acres (flagship, community, neighborhood parks)
 *   - museum:   OpenStreetMap museums that have a Wikidata entry (notable ones)
 *   - library:  NYPL, Brooklyn and Queens Public Library branches (OSM)
 *   - hospital: hospitals with an emergency room (OSM)
 *   - zoo:      zoos and the aquarium that have a Wikidata entry (OSM)
 *   - airport:  JFK and LaGuardia (OSM)
 * Staten Island and anything outside the city (NJ, Nassau) is dropped: the game has no
 * subway there, so a landmark there could only ever be "nearest" across the water.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Landmark, LandmarkData, LandmarkKind } from "../src/types.ts";

const BBOX = "40.54,-74.06,40.92,-73.70";
const OVERPASS_QUERY = `[out:json][timeout:120][bbox:${BBOX}];
(
  nwr["tourism"="museum"];
  nwr["amenity"="library"];
  nwr["amenity"="hospital"];
  nwr["tourism"~"^(zoo|aquarium)$"];
  nwr["aeroway"="aerodrome"]["iata"];
);
out center tags;`;
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const SOURCES = {
  // Borough boundaries with water areas included, so pier museums and islands count.
  boroughs: "https://data.cityofnewyork.us/resource/wh2p-dxnf.geojson",
  parks: "https://data.cityofnewyork.us/resource/enfh-gkve.geojson?$where=acres%3E=20&$limit=5000",
} as const;
const PARK_TYPES = new Set(["Flagship Park", "Community Park", "Neighborhood Park"]);
const LIBRARY_OPERATORS = new Set([
  "New York Public Library",
  "Brooklyn Public Library",
  "Queens Public Library",
]);
const AIRPORTS = new Set(["JFK", "LGA"]);
/** Mis-tagged or unhelpful entries, checked by hand (2026-10-05). */
const DENY = new Set([
  "Manhattan Gastroenterology – Midtown Manhattan", // a clinic tagged as an ER
  "Bed-Stuy Aquarium", // a small shop, not the aquarium
  "Gagosian", // a gallery
  "Hayden Planetarium", // part of the Natural History museum
  "The Yankees Museum", // inside the stadium
  "Ellis Island Immigration Museum", // harbor islands: no subway
  "Statue of Liberty Museum",
  "Commanding Officer's Quarters", // inside Fort Hamilton (an army base)
  "Recreational Area", // no real name
  "Battery Park City", // a neighborhood's parks, not one park
]);

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const rawDir = join(pkgRoot, "raw");
const outPath = join(pkgRoot, "dataset", "nyc-landmarks.json");
const refresh = process.argv.includes("--refresh");

type Ring = [number, number][]; // [lon, lat]
type Polygon = Ring[]; // outer ring, then holes
interface Feature<P> {
  properties: P;
  geometry:
    | { type: "MultiPolygon"; coordinates: Polygon[] }
    | { type: "Polygon"; coordinates: Polygon };
}
interface OsmElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function cached(name: string, load: () => Promise<string>): Promise<string> {
  const path = join(rawDir, name);
  if (existsSync(path) && !refresh) return readFileSync(path, "utf8");
  const text = await load();
  mkdirSync(rawDir, { recursive: true });
  writeFileSync(path, text);
  return text;
}

async function get(url: string): Promise<string> {
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Overpass is often busy: try each mirror a few times. */
async function overpass(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of OVERPASS_MIRRORS) {
      console.log(`querying ${url}`);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": "stand-clear-dataset-build/0.1" },
          body: new URLSearchParams({ data: OVERPASS_QUERY }),
          signal: AbortSignal.timeout(150_000),
        });
        const text = await res.text();
        if (res.ok && text.startsWith("{")) return text;
        console.warn(`  busy (HTTP ${res.status})`);
      } catch (err) {
        console.warn(`  failed: ${String(err)}`);
      }
    }
    await new Promise((r) => setTimeout(r, 20_000));
  }
  throw new Error("Overpass didn't answer; try again later.");
}

function polygonsOf(f: Feature<unknown>): Polygon[] {
  return f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
}

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lon: number, lat: number, [outer, ...holes]: Polygon): boolean {
  return !!outer && inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h));
}

function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    a += xj * yi - xi * yj;
  }
  return Math.abs(a / 2);
}

/**
 * A pin inside the park: its centroid when that's inside (most parks), else the
 * inside grid point nearest the centroid (long thin parks like Riverside).
 */
function pinFor(polys: Polygon[]): [number, number] {
  const poly = polys.reduce((a, b) => (ringArea(b[0] ?? []) > ringArea(a[0] ?? []) ? b : a));
  const outer = poly[0] ?? [];
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const [xi, yi] = outer[i] as [number, number];
    const [xj, yj] = outer[j] as [number, number];
    const f = xj * yi - xi * yj;
    a += f;
    cx += (xi + xj) * f;
    cy += (yi + yj) * f;
  }
  cx /= 3 * a;
  cy /= 3 * a;
  if (inPolygon(cx, cy, poly)) return [cy, cx];
  const xs = outer.map((p) => p[0]);
  const ys = outer.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best: [number, number] = [outer[0]?.[1] ?? cy, outer[0]?.[0] ?? cx];
  let bestD = Number.POSITIVE_INFINITY;
  const N = 60;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = x0 + ((x1 - x0) * i) / N;
      const y = y0 + ((y1 - y0) * j) / N;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bestD && inPolygon(x, y, poly)) {
        bestD = d;
        best = [y, x];
      }
    }
  }
  return best;
}

const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

function meters(a: Landmark, b: Landmark): number {
  const dLat = (a.lat - b.lat) * 110_540;
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/**
 * Drop repeats: anything within `within` m of a kept one, or the same name within
 * `sameName` m (OSM often maps a campus and a building; NYC Parks splits some parks).
 * The first one wins, so callers list the biggest first.
 */
function dedupe(list: Landmark[], within: number, sameName = 1500): Landmark[] {
  const kept: Landmark[] = [];
  for (const l of list) {
    if (kept.some((k) => meters(k, l) < within || (k.name === l.name && meters(k, l) < sameName)))
      continue;
    kept.push(l);
  }
  return kept.sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const boroughs = JSON.parse(await cached("boroughs.geojson", () => get(SOURCES.boroughs))) as {
    features: Feature<{ boroname: string }>[];
  };
  const borough = (lat: number, lon: number): string | null => {
    for (const f of boroughs.features) {
      if (polygonsOf(f).some((p) => inPolygon(lon, lat, p))) return f.properties.boroname;
    }
    return null;
  };
  const inGame = (lat: number, lon: number) => {
    const b = borough(lat, lon);
    return b !== null && b !== "Staten Island";
  };

  const osm = JSON.parse(await cached("landmarks-osm.json", overpass)) as {
    elements: OsmElement[];
  };
  const kinds: Record<LandmarkKind, Landmark[]> = {
    park: [],
    museum: [],
    library: [],
    hospital: [],
    zoo: [],
    airport: [],
  };
  for (const e of osm.elements) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat === undefined || lon === undefined || !t.name || DENY.has(t.name)) continue;
    if (!inGame(lat, lon)) continue;
    const pin = { name: t.name, lat: round5(lat), lon: round5(lon) };
    if (t.tourism === "museum" && t.wikidata) kinds.museum.push(pin);
    else if (t.amenity === "library" && LIBRARY_OPERATORS.has(t.operator ?? ""))
      kinds.library.push(pin);
    else if (t.amenity === "hospital" && t.emergency === "yes") kinds.hospital.push(pin);
    else if ((t.tourism === "zoo" || t.tourism === "aquarium") && t.wikidata) kinds.zoo.push(pin);
    else if (t.aeroway === "aerodrome" && AIRPORTS.has(t.iata ?? "")) kinds.airport.push(pin);
  }

  const parks = JSON.parse(await cached("parks.geojson", () => get(SOURCES.parks))) as {
    features: Feature<{ signname: string; typecategory: string; acres: string; borough: string }>[];
  };
  const bigParks = parks.features
    .filter((f) => PARK_TYPES.has(f.properties.typecategory) && f.properties.borough !== "R")
    .sort((a, b) => Number(b.properties.acres) - Number(a.properties.acres));
  for (const f of bigParks) {
    if (DENY.has(f.properties.signname)) continue;
    const [lat, lon] = pinFor(polygonsOf(f));
    if (!inGame(lat, lon)) continue;
    kinds.park.push({ name: f.properties.signname, lat: round5(lat), lon: round5(lon) });
  }

  const out: LandmarkData = {
    meta: {
      generatedAt: new Date().toISOString(),
      sources: [...OVERPASS_MIRRORS.slice(0, 1), SOURCES.boroughs, SOURCES.parks],
      attribution: "Places © OpenStreetMap contributors · NYC Parks",
    },
    kinds: {
      park: dedupe(kinds.park, 0, Number.POSITIVE_INFINITY),
      museum: dedupe(kinds.museum, 40),
      library: dedupe(kinds.library, 40),
      hospital: dedupe(kinds.hospital, 150),
      // One pin per zoo: exhibits inside a zoo or aquarium are often tagged on their own.
      zoo: dedupe(kinds.zoo, 400),
      airport: dedupe(kinds.airport, 0),
    },
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(out)}\n`);
  for (const [k, list] of Object.entries(out.kinds)) console.log(`${k}: ${list.length}`);
  console.log(`wrote ${outPath}`);
}

await main();
