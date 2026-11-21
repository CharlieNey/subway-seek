/** Persist S3 by panorama IDs and interpolation recipes, never Google coordinates. */
import type { Dataset } from "@subway-seek/data";
import type { HidingSpot, SoloRound } from "@subway-seek/engine";

type Point = { lat: number; lon: number };
type End = { pano: string } | Point;
type Ref = { pano: string } | { a: End; b: End; f: number };
export interface StoredHideRound {
  storage: "hide-panorama-ids-v1";
  value: unknown;
}
const key = (p: Point) => `${p.lat},${p.lon}`;
const point = (v: unknown): v is Point =>
  !!v &&
  typeof v === "object" &&
  "lat" in v &&
  "lon" in v &&
  typeof v.lat === "number" &&
  typeof v.lon === "number";
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function storeHideRound(round: SoloRound, ds: Dataset): StoredHideRound {
  const panos = new Map<string, string>();
  const walks: { a: Point; b: Point }[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (point(v) && "pano" in v && typeof v.pano === "string") panos.set(key(v), v.pano);
    if (record(v) && v.kind === "walking" && Array.isArray(v.fromPoint) && Array.isArray(v.toPoint))
      walks.push({
        a: { lat: v.fromPoint[0], lon: v.fromPoint[1] },
        b: { lat: v.toPoint[0], lon: v.toPoint[1] },
      });
    for (const x of Object.values(v)) visit(x);
  };
  visit(round);
  const publicPoints = new Set<string>();
  for (const s of ds.stations) publicPoints.add(key(s));
  for (const c of ds.complexes) {
    publicPoints.add(key(c));
    for (const [lat, lon] of c.exits) publicPoints.add(key({ lat, lon }));
  }
  const end = (p: Point): End | null =>
    panos.has(key(p)) ? { pano: panos.get(key(p)) as string } : publicPoints.has(key(p)) ? p : null;
  const reference = (p: Point): Ref | null => {
    const id = panos.get(key(p));
    if (id) return { pano: id };
    if (publicPoints.has(key(p))) return null;
    for (const w of walks) {
      const a = end(w.a),
        b = end(w.b);
      if (!a || !b) continue;
      const dx = w.b.lat - w.a.lat,
        dy = w.b.lon - w.a.lon;
      const n = dx * dx + dy * dy;
      if (n === 0) continue;
      const f = ((p.lat - w.a.lat) * dx + (p.lon - w.a.lon) * dy) / n;
      if (
        f >= 0 &&
        f <= 1 &&
        Math.abs(w.a.lat + f * dx - p.lat) < 1e-9 &&
        Math.abs(w.a.lon + f * dy - p.lon) < 1e-9
      )
        return { a, b, f };
    }
    throw new Error("Street point has no panorama reference");
  };
  const encode = (v: unknown, field = ""): unknown => {
    if (Array.isArray(v)) {
      if ((field === "fromPoint" || field === "toPoint") && v.length === 2) {
        const ref = reference({ lat: v[0], lon: v[1] });
        if (ref) return { __streetPair: ref };
      }
      return v.map((x) => encode(x));
    }
    if (!record(v)) return v;
    const out: Record<string, unknown> = {};
    const ref = point(v) ? reference(v) : null;
    for (const [k, x] of Object.entries(v))
      if (!ref || (k !== "lat" && k !== "lon")) out[k] = encode(x, k);
    if (ref) out.__streetPoint = ref;
    return out;
  };
  return { storage: "hide-panorama-ids-v1", value: encode(round) };
}

export async function restoreHideRound(
  saved: StoredHideRound,
  lookup: (pano: string) => Promise<HidingSpot | null>,
): Promise<SoloRound> {
  const cache = new Map<string, Promise<HidingSpot>>();
  const pano = (id: string) => {
    let pending = cache.get(id);
    if (!pending) {
      pending = lookup(id).then((p) => {
        if (!p) throw new Error("Saved panorama could not be restored");
        return p;
      });
      cache.set(id, pending);
    }
    return pending;
  };
  const end = async (p: End): Promise<Point> => ("pano" in p ? pano(p.pano) : p);
  const ref = async (r: Ref): Promise<Point> => {
    if ("pano" in r) return pano(r.pano);
    const [a, b] = await Promise.all([end(r.a), end(r.b)]);
    return { lat: a.lat + r.f * (b.lat - a.lat), lon: a.lon + r.f * (b.lon - a.lon) };
  };
  const decode = async (v: unknown): Promise<unknown> => {
    if (Array.isArray(v)) return Promise.all(v.map(decode));
    if (!record(v)) return v;
    if (v.__streetPair) {
      const p = await ref(v.__streetPair as Ref);
      return [p.lat, p.lon];
    }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (k !== "__streetPoint") out[k] = await decode(x);
    if (v.__streetPoint) {
      const p = await ref(v.__streetPoint as Ref);
      out.lat = p.lat;
      out.lon = p.lon;
    }
    return out;
  };
  return (await decode(saved.value)) as SoloRound;
}
