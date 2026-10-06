/**
 * Icon atlases for the map, drawn once to a canvas: station squares (squares are game
 * information; circles are trains) and the landmarks' buff-framed plaques with their 9 × 9
 * tile pictograms. deck.gl's ScatterplotLayer only draws circles, so squares are icons that
 * hold a pixel size (DESIGN.md, Motion › Implementation notes).
 */
import type { LandmarkKind } from "@stand-clear/data";
import { LANDMARK_KINDS } from "@stand-clear/engine";
import { pictCells } from "../ui/pict.ts";

export interface IconDef {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Drawn in the layer's color (getColor) rather than its own. */
  mask?: boolean;
}

export interface Atlas {
  url: string;
  mapping: Record<string, IconDef>;
}

/** Atlas pixels per CSS pixel, so icons stay crisp on a retina screen. */
const SCALE = 4;

const C = {
  ink: "#24201B",
  glazeHi: "#FBF8F1",
  outline: "#B5AB97",
  terra: "#B9532F",
  buffDeep: "#A9874F",
};

/** The station squares, each `size` CSS px: possible, ruled out, the start, the hider's. */
export const STATION_ICONS = ["possible", "out", "start", "hider", "tile"] as const;
export type StationIcon = (typeof STATION_ICONS)[number];

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  if (!x) throw new Error("2D canvas unavailable");
  return [c, x] as const;
}

let stations: Atlas | null = null;

export function stationAtlas(): Atlas {
  if (stations) return stations;
  const cell = 16 * SCALE;
  const [c, x] = canvas(cell * STATION_ICONS.length, cell);
  const mapping: Record<string, IconDef> = {};
  STATION_ICONS.forEach((key, i) => {
    const ox = i * cell;
    const u = SCALE;
    const square = (inset: number, color: string) => {
      x.fillStyle = color;
      x.fillRect(ox + inset * u, inset * u, cell - 2 * inset * u, cell - 2 * inset * u);
    };
    switch (key) {
      case "possible":
        // Ink, with a glaze edge so it reads on a route line.
        square(0, C.glazeHi);
        square(2, C.ink);
        break;
      case "out":
        square(1, C.outline);
        square(2.4, C.glazeHi);
        break;
      case "start":
        square(0, C.ink);
        square(3, C.glazeHi);
        break;
      case "hider":
        square(0, C.ink);
        square(2, C.terra);
        break;
      case "tile":
        square(0, "#ffffff");
        break;
    }
    mapping[key] = { x: ox, y: 0, width: cell, height: cell, mask: key === "tile" };
  });
  stations = { url: c.toDataURL(), mapping };
  return stations;
}

let plaques: Atlas | null = null;

/** A plaque per landmark kind, buff-framed, and the nearest one's ink-framed twin. */
export function plaqueAtlas(): Atlas {
  if (plaques) return plaques;
  const u = 4 * SCALE;
  const cell = 13 * u;
  const [c, x] = canvas(cell * LANDMARK_KINDS.length, cell * 2);
  const mapping: Record<string, IconDef> = {};
  LANDMARK_KINDS.forEach((kind, i) => {
    for (const [row, frame] of [
      [0, C.buffDeep],
      [1, C.ink],
    ] as const) {
      const ox = i * cell;
      const oy = row * cell;
      x.fillStyle = frame;
      x.fillRect(ox, oy, cell, cell);
      x.fillStyle = C.glazeHi;
      x.fillRect(ox + 1.1 * u, oy + 1.1 * u, cell - 2.2 * u, cell - 2.2 * u);
      x.fillStyle = C.ink;
      for (const [cx, cy] of pictCells(kind)) {
        x.fillRect(ox + (2 + cx) * u, oy + (2 + cy) * u, u * 1.02, u * 1.02);
      }
      mapping[plaqueKey(kind, row === 1)] = { x: ox, y: oy, width: cell, height: cell };
    }
  });
  plaques = { url: c.toDataURL(), mapping };
  return plaques;
}

export const plaqueKey = (kind: LandmarkKind, nearest: boolean) =>
  `${kind}${nearest ? ":near" : ""}`;
