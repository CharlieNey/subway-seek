/**
 * A tile timer's tiles: one per unit in its label, lifting from the right as time runs
 * out. With `lastTerra`, the last tile standing turns terra cotta (DESIGN.md, Motion:
 * Timers).
 */
export type TileState = "lit" | "gone" | "last";

export function tileStates(total: number, left: number, lastTerra = false): TileState[] {
  const lit = Math.max(0, Math.min(total, Math.ceil(left)));
  return Array.from({ length: total }, (_, i) =>
    i >= lit ? "gone" : lastTerra && lit === 1 ? "last" : "lit",
  );
}
