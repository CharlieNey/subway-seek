/**
 * Throwaway Street View spike (not part of the game). Answers, for one hiding zone:
 *  - does the Maps JS key work, and what does a round cost in panorama loads?
 *  - what does the zone's panorama graph look like (size, connectivity, imagery dates)?
 *  - can we draw a hider marker inside Street View?
 *  - "walk to" by jumping straight to the arrival panorama vs stepping through each one.
 *
 * Open http://localhost:5173/spike/streetview.html (?zone=<complex name>).
 *
 * Dev-only and throwaway: its MapLibre minimap beside Street View predates decision B
 * (Google's terms forbid that pairing in a real app; the game itself uses Google Maps).
 */
import type { Dataset } from "@stand-clear/data";
import datasetUrl from "@stand-clear/data/dataset.json?url";
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

maplibregl.setWorkerUrl(workerUrl);

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const ZONE_RADIUS_M = 400;
const MAX_NODES = 1200; // safety cap on lookups
const SPEED = 6;
const WALK_MPS = 1.4;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $("log");
const log = (msg: string) => {
  logEl.textContent = `${new Date().toLocaleTimeString()}  ${msg}\n${logEl.textContent}`;
};

const metrics = {
  "Maps JS auth": "pending",
  "Panorama loads (pano_changed)": 0,
  "StreetViewService lookups": 0,
  "Zone panoramas": 0,
  "Zone links": 0,
  "Connected components": 0,
  "Largest component": 0,
  "Crawl time (s)": 0,
  "Imagery dates": "",
  "Last walk: distance (m)": 0,
  "Last walk: real seconds at 6×": 0,
  "Last walk: panorama loads": 0,
};
function render() {
  $("metrics").innerHTML = Object.entries(metrics)
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join("");
}

function meters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const kx = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 110_540);
}

function loadGoogle(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!KEY) return reject(new Error("VITE_GOOGLE_MAPS_API_KEY missing (apps/web/.env.local)"));
    const w = window as unknown as Record<string, unknown>;
    w.__gmReady = () => resolve();
    w.gm_authFailure = () => {
      metrics["Maps JS auth"] = "FAILED (gm_authFailure)";
      render();
      log("Maps JavaScript API rejected the key — is the API enabled / the referrer allowed?");
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&v=weekly&loading=async&callback=__gmReady`;
    s.onerror = () => reject(new Error("failed to load the Maps JS script"));
    document.head.append(s);
  });
}

interface Node {
  id: string;
  lat: number;
  lon: number;
  links: string[];
  date: string;
  inZone: boolean;
}

async function main() {
  render();
  const ds = (await (await fetch(datasetUrl)).json()) as Dataset;
  const zoneName = new URLSearchParams(location.search).get("zone") ?? "14 St-Union Sq";
  const complex = ds.complexes.find((c) => c.name === zoneName);
  if (!complex) throw new Error(`no complex ${zoneName}`);
  const center = { lat: complex.lat, lon: complex.lon };
  $("zone").textContent =
    `${complex.name} · ${ZONE_RADIUS_M} m zone · ${complex.exits.length} exits`;

  // Mini map: the zone, the crawled graph, where you are.
  const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [center.lon, center.lat],
    zoom: 15.3,
  });
  const ring = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [
      center.lon +
        (ZONE_RADIUS_M / (111_320 * Math.cos((center.lat * Math.PI) / 180))) * Math.cos(a),
      center.lat + (ZONE_RADIUS_M / 110_540) * Math.sin(a),
    ];
  });
  // The mini map only paints while the page is visible; don't block the Street View work on it.
  const mapReady = new Promise<void>((r) => map.on("load", () => r()));
  const onMap = (fn: () => void) => void mapReady.then(fn);
  onMap(() => setupLayers());
  function setupLayers() {
    map.addSource("zone", {
      type: "geojson",
      data: { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} },
    });
    map.addLayer({
      id: "zone",
      type: "line",
      source: "zone",
      paint: { "line-color": "#d97706", "line-dasharray": [3, 2] },
    });
    map.addSource("graph", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "edges",
      type: "line",
      source: "graph",
      filter: ["==", "$type", "LineString"],
      paint: { "line-color": "#57534e", "line-width": 1 },
    });
    map.addLayer({
      id: "nodes",
      type: "circle",
      source: "graph",
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-radius": 2.5,
        "circle-color": ["case", ["get", "main"], "#2563eb", "#dc2626"],
      },
    });
    map.addSource("me", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "me",
      type: "circle",
      source: "me",
      paint: {
        "circle-radius": 6,
        "circle-color": "#111827",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
      },
    });
  }

  await loadGoogle();
  if (metrics["Maps JS auth"] === "pending") metrics["Maps JS auth"] = "loaded";
  render();
  const g = google.maps;
  const sv = new g.StreetViewService();
  // Google's own imagery only (no user-uploaded photospheres or indoor panoramas).
  const sources = { sources: [g.StreetViewSource.GOOGLE] };

  const lookup = async (
    req: google.maps.StreetViewLocationRequest | google.maps.StreetViewPanoRequest,
  ) => {
    metrics["StreetViewService lookups"]++;
    render();
    return (await sv.getPanorama(req)).data;
  };

  // Start at the complex's first exit.
  const [exLat, exLon] = complex.exits[0] ?? [center.lat, center.lon];
  const start = await lookup({ location: { lat: exLat, lng: exLon }, radius: 50, ...sources });
  const startId = start.location?.pano;
  if (!startId) throw new Error("no outdoor panorama at the exit");
  log(`start panorama ${startId} (${start.imageDate ?? "?"})`);

  const pano = new g.StreetViewPanorama($("pano"), {
    pano: startId,
    addressControl: false,
    showRoadLabels: false, // street-name overlays would give the location away
    fullscreenControl: false,
    motionTracking: false,
  });
  let current = startId;
  const showMe = () => {
    const p = pano.getPosition();
    if (!p) return;
    onMap(() =>
      (map.getSource("me") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lng(), p.lat()] },
            properties: {},
          },
        ],
      }),
    );
  };
  pano.addListener("pano_changed", () => {
    metrics["Panorama loads (pano_changed)"]++;
    current = pano.getPano();
    showMe();
    render();
  });

  // --- Crawl the zone's panorama graph ---------------------------------------------
  const nodes = new Map<string, Node>();
  $("crawl").removeAttribute("disabled");
  const crawl = async () => {
    $("crawl").setAttribute("disabled", "");
    const t0 = performance.now();
    const queue = [startId];
    const seen = new Set(queue);
    const worker = async () => {
      while (queue.length && nodes.size < MAX_NODES) {
        const id = queue.shift() as string;
        let data: google.maps.StreetViewPanoramaData;
        try {
          data = await lookup({ pano: id });
        } catch {
          continue;
        }
        const ll = data.location?.latLng;
        if (!ll) continue;
        const node: Node = {
          id,
          lat: ll.lat(),
          lon: ll.lng(),
          links: (data.links ?? []).map((l) => l.pano ?? "").filter(Boolean),
          date: data.imageDate ?? "?",
          inZone: meters(center, { lat: ll.lat(), lon: ll.lng() }) <= ZONE_RADIUS_M,
        };
        nodes.set(id, node);
        if (!node.inZone) continue; // don't expand past the zone edge
        for (const next of node.links) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    metrics["Crawl time (s)"] = Math.round((performance.now() - t0) / 100) / 10;

    // Connected components among in-zone panoramas.
    const inZone = [...nodes.values()].filter((n) => n.inZone);
    const comp = new Map<string, number>();
    const sizes: number[] = [];
    for (const n of inZone) {
      if (comp.has(n.id)) continue;
      const k = sizes.length;
      let size = 0;
      const stack = [n.id];
      comp.set(n.id, k);
      while (stack.length) {
        const id = stack.pop() as string;
        size++;
        for (const l of nodes.get(id)?.links ?? []) {
          if (nodes.get(l)?.inZone && !comp.has(l)) {
            comp.set(l, k);
            stack.push(l);
          }
        }
      }
      sizes.push(size);
    }
    const main = sizes.indexOf(Math.max(...sizes));
    const edges = new Set<string>();
    for (const n of inZone)
      for (const l of n.links) if (nodes.get(l)?.inZone) edges.add([n.id, l].sort().join("|"));
    const dates = [...new Set(inZone.map((n) => n.date))].sort();
    Object.assign(metrics, {
      "Zone panoramas": inZone.length,
      "Zone links": edges.size,
      "Connected components": sizes.length,
      "Largest component": Math.max(...sizes),
      "Imagery dates": `${dates[0]} → ${dates.at(-1)} (${dates.length} distinct)`,
    });
    render();
    onMap(() =>
      (map.getSource("graph") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [
          ...inZone.map((n) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [n.lon, n.lat] },
            properties: { main: comp.get(n.id) === main },
          })),
          ...[...edges].map((e) => {
            const [a, b] = e.split("|").map((id) => nodes.get(id) as Node);
            return {
              type: "Feature" as const,
              geometry: {
                type: "LineString" as const,
                coordinates: [
                  [a?.lon ?? 0, a?.lat ?? 0],
                  [b?.lon ?? 0, b?.lat ?? 0],
                ],
              },
              properties: {},
            };
          }),
        ],
      }),
    );
    log(
      `mapped ${inZone.length} panoramas in the zone (${nodes.size} looked up incl. edge), ${sizes.length} components`,
    );
    $("marker").removeAttribute("disabled");
  };
  $("crawl").onclick = crawl;

  // --- Hider marker inside Street View ----------------------------------------------
  const placeMarker = () => {
    // A panorama ~4 hops from where you stand.
    let id = current;
    for (let i = 0; i < 4; i++) id = nodes.get(id)?.links.find((l) => nodes.get(l)?.inZone) ?? id;
    const n = nodes.get(id);
    if (!n) return log("no node to place a marker on");
    const marker = new g.Marker({
      position: { lat: n.lat, lng: n.lon },
      map: pano,
      title: "Hider",
    });
    log(
      `placed a Marker on the panorama ${Math.round(meters(n, nodesPos(current)))} m away — look for it in Street View`,
    );
    void marker;
  };
  $("marker").onclick = placeMarker;
  const nodesPos = (id: string) => nodes.get(id) ?? { lat: center.lat, lon: center.lon };

  // --- Walk to a clicked point ---------------------------------------------------------
  let mode: "jump" | "step" = "jump";
  $("mode").onclick = () => {
    mode = mode === "jump" ? "step" : "jump";
    $("mode").textContent = `Walk: ${mode}`;
  };
  const walkTo = async (lat: number, lon: number) => {
    if (nodes.size === 0) return log("map the zone first");
    const target = [...nodes.values()]
      .filter((n) => n.inZone)
      .reduce((best, n) => (meters(n, { lat, lon }) < meters(best, { lat, lon }) ? n : best));
    // BFS path over the graph.
    const prev = new Map<string, string>([[current, current]]);
    const queue = [current];
    while (queue.length && !prev.has(target.id)) {
      const id = queue.shift() as string;
      for (const l of nodes.get(id)?.links ?? []) {
        if (nodes.get(l)?.inZone && !prev.has(l)) {
          prev.set(l, id);
          queue.push(l);
        }
      }
    }
    if (!prev.has(target.id)) return log("no path along the street graph (different component?)");
    const path: string[] = [];
    for (let id = target.id; id !== current; id = prev.get(id) as string) path.unshift(id);
    let dist = 0;
    let at = current;
    for (const id of path) {
      dist += meters(nodesPos(at), nodesPos(id));
      at = id;
    }
    const realSeconds = dist / (WALK_MPS * SPEED);
    const loadsBefore = metrics["Panorama loads (pano_changed)"];
    log(
      `walking ${Math.round(dist)} m (${path.length} hops, ${realSeconds.toFixed(1)} s real) by ${mode}`,
    );
    if (mode === "jump") {
      await new Promise((r) => setTimeout(r, realSeconds * 1000));
      pano.setPano(target.id);
    } else {
      let from = current;
      for (const id of path) {
        await new Promise((r) =>
          setTimeout(r, (meters(nodesPos(from), nodesPos(id)) / (WALK_MPS * SPEED)) * 1000),
        );
        pano.setPano(id);
        from = id;
      }
    }
    await new Promise((r) => setTimeout(r, 300));
    Object.assign(metrics, {
      "Last walk: distance (m)": Math.round(dist),
      "Last walk: real seconds at 6×": Math.round(realSeconds * 10) / 10,
      "Last walk: panorama loads": metrics["Panorama loads (pano_changed)"] - loadsBefore,
    });
    render();
  };
  map.on("click", (e) => void walkTo(e.lngLat.lat, e.lngLat.lng));

  // ?auto=1: map the zone, place the marker, walk ~250 m by jumping, then walk back stepping.
  if (new URLSearchParams(location.search).get("auto")) {
    await crawl();
    placeMarker();
    const origin = nodesPos(current);
    const far = [...nodes.values()]
      .filter((n) => n.inZone)
      .reduce((best, n) =>
        Math.abs(meters(n, origin) - 250) < Math.abs(meters(best, origin) - 250) ? n : best,
      );
    mode = "jump";
    await walkTo(far.lat, far.lon);
    const jump = { ...metrics };
    mode = "step";
    await walkTo(origin.lat, origin.lon);
    (window as unknown as Record<string, unknown>).__spike = { jump, step: { ...metrics } };
    log("auto run done");
  }
  showMe();
}

main().catch((err) => {
  log(`error: ${err instanceof Error ? err.message : String(err)}`);
  console.error(err);
});
