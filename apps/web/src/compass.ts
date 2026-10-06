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
