/**
 * The homepage's maps: the game's own lines, stations and trains, drawn flat on a canvas
 * from the timetable (no map tiles, so no map loads to pay for). A view is a box of
 * lon/lat that covers the canvas, like the mock's schematic.
 */
import type { LonLat } from "@stand-clear/engine";
import type { World } from "../game.ts";

export interface View {
  /** Center and meters per CSS pixel. */
  lon: number;
  lat: number;
  mpp: number;
}

const M_PER_DEG = 111_195;

/** A view that covers the box [sw, ne] with some margin, filling a w × h canvas. */
export function viewAround(sw: LonLat, ne: LonLat, w: number, h: number, margin = 1.15): View {
  const lat = (sw[1] + ne[1]) / 2;
  const lon = (sw[0] + ne[0]) / 2;
  const k = Math.cos((lat * Math.PI) / 180);
  const mw = (ne[0] - sw[0]) * M_PER_DEG * k;
  const mh = (ne[1] - sw[1]) * M_PER_DEG;
  // Cover, not contain: the box fills the canvas and its long side may run off.
  return { lon, lat, mpp: (Math.min(mw / w, mh / h) || 10) * margin };
}

/** A view of a circle `meters` round a point. */
export function viewOf(p: { lat: number; lon: number }, meters: number, w: number, h: number) {
  return { lon: p.lon, lat: p.lat, mpp: (2 * meters) / Math.min(w, h) };
}

export function project(v: View, w: number, h: number) {
  const k = Math.cos((v.lat * Math.PI) / 180);
  return ([lon, lat]: LonLat): [number, number] => [
    w / 2 + ((lon - v.lon) * M_PER_DEG * k) / v.mpp,
    h / 2 - ((lat - v.lat) * M_PER_DEG) / v.mpp,
  ];
}

/** Size a canvas to its box at the screen's pixel ratio; returns its CSS size. */
export function fit(canvas: HTMLCanvasElement) {
  const r = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * r);
  canvas.height = Math.round(h * r);
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(r, 0, 0, r, 0, 0);
  return { ctx, w, h };
}

const square = (x: CanvasRenderingContext2D, p: [number, number], s: number, color: string) => {
  x.fillStyle = color;
  x.fillRect(p[0] - s / 2, p[1] - s / 2, s, s);
};

/**
 * The base: the tile-field ground, every line in its route color, and the stations as
 * squares (ink when `ink` says so, outlined when cleared, none otherwise).
 */
export function drawBase(
  x: CanvasRenderingContext2D,
  world: World,
  v: View,
  w: number,
  h: number,
  station: (complex: number) => "ink" | "out" | null,
) {
  const at = project(v, w, h);
  x.fillStyle = "#ECE5D3";
  x.fillRect(0, 0, w, h);
  x.strokeStyle = "#E2D9C4";
  x.lineWidth = 1;
  x.beginPath();
  for (let g = 0.5; g < w; g += 30) {
    x.moveTo(g, 0);
    x.lineTo(g, h);
  }
  for (let g = 0.5; g < h; g += 30) {
    x.moveTo(0, g);
    x.lineTo(w, g);
  }
  x.stroke();
  x.lineWidth = 3.5;
  x.lineCap = "round";
  x.lineJoin = "round";
  x.globalAlpha = 0.85;
  for (const s of world.ds.shapes) {
    x.strokeStyle = `#${world.ds.routes[s.route]?.color ?? "808080"}`;
    x.beginPath();
    s.points.forEach((p, i) => {
      const [px, py] = at(p);
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    });
    x.stroke();
  }
  x.globalAlpha = 1;
  world.ds.complexes.forEach((c, i) => {
    const kind = station(i);
    if (!kind) return;
    const p = at([c.lon, c.lat]);
    if (p[0] < -10 || p[1] < -10 || p[0] > w + 10 || p[1] > h + 10) return;
    if (kind === "ink") {
      square(x, p, 11.6, "#FBF8F1");
      square(x, p, 9, "#24201B");
    } else {
      square(x, p, 7, "#B5AB97");
      square(x, p, 4.6, "#FBF8F1");
    }
  });
}

/** Trains running at game time t, as circles in their route colors. */
export function drawTrains(
  x: CanvasRenderingContext2D,
  world: World,
  v: View,
  w: number,
  h: number,
  t: number,
) {
  const at = project(v, w, h);
  for (const i of world.geo.runningTrips(t)) {
    const p = world.geo.trainPosition(i, t);
    if (!p) continue;
    const [px, py] = at(p);
    if (px < -6 || py < -6 || px > w + 6 || py > h + 6) continue;
    x.fillStyle = `#${world.ds.routes[world.ds.trips[i]?.route ?? -1]?.color ?? "808080"}`;
    x.beginPath();
    x.arc(px, py, 4.2, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = "#ECE5D3";
    x.lineWidth = 1.5;
    x.stroke();
  }
}

/** A player: a circle with a glaze ring (ink for you, terra cotta for the hider). */
export function drawDot(x: CanvasRenderingContext2D, p: [number, number], color = "#24201B") {
  x.fillStyle = "#FBF8F1";
  x.beginPath();
  x.arc(p[0], p[1], 8.5, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = color;
  x.beginPath();
  x.arc(p[0], p[1], 6, 0, Math.PI * 2);
  x.fill();
}
