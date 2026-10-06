/** The compass on the street: "Facing N", the walk tiles, "Walking north". */
import type { LatLon } from "@stand-clear/data";
import { localMeters } from "@stand-clear/engine";

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"] as const;
const WORDS = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
] as const;

/** Which of the eight compass points a heading (degrees, 0 = north) is nearest. */
export const octant = (heading: number) => Math.round((((heading % 360) + 360) % 360) / 45) % 8;
/** "N", "SW": for "Facing N" and the walk tiles. */
export const compassLetters = (heading: number) => COMPASS[octant(heading)] ?? "N";
export const compassArrow = (heading: number) => ARROWS[octant(heading)] ?? "↑";
/** "north", "southwest": for "Walking north". */
export const compassWord = (heading: number) => WORDS[octant(heading)] ?? "north";

/** The heading from one [lat, lon] to another, in degrees from north. */
export function bearing(a: LatLon, b: LatLon): number {
  const [dx, dy] = localMeters({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

/**
 * The arrows walk relative to where you're facing (DESIGN.md, Interaction: Keyboard):
 * ↑ the street ahead, ↓ behind, ← and → either side. Each arrow takes the link nearest its
 * way, within 60°, and no link takes two arrows.
 */
export function arrowLinks(facing: number, headings: readonly number[]): Record<string, number> {
  const ways: [string, number][] = [
    ["ArrowUp", 0],
    ["ArrowRight", 90],
    ["ArrowDown", 180],
    ["ArrowLeft", 270],
  ];
  const off = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  const out: Record<string, number> = {};
  const taken = new Set<number>();
  for (const [key, rel] of ways) {
    let best = -1;
    let bestOff = 60.001;
    headings.forEach((h, i) => {
      const d = off(h, facing + rel);
      // On a tie, the first street keeps it.
      if (!taken.has(i) && d < bestOff) {
        best = i;
        bestOff = d;
      }
    });
    if (best >= 0) {
      out[key] = best;
      taken.add(best);
    }
  }
  return out;
}

export const ARROW_GLYPH: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};
