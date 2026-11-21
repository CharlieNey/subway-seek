import type { LandmarkKind } from "@subway-seek/data";

/** The six landmark kinds as 9 × 9 tile pictograms (DESIGN.md, Questions: landmarks are plaques). */
const PICT: Record<LandmarkKind, string[]> = {
  park: [
    "....#....",
    "...###...",
    "..#####..",
    "...###...",
    "..#####..",
    ".#######.",
    "....#....",
    "....#....",
    "...###...",
  ],
  museum: [
    "....#....",
    "..#####..",
    ".#######.",
    ".........",
    ".#.#.#.#.",
    ".#.#.#.#.",
    ".#.#.#.#.",
    ".........",
    "#########",
  ],
  library: [
    ".........",
    ".###.###.",
    "#...#...#",
    "#.#.#.#.#",
    "#...#...#",
    "#.#.#.#.#",
    "#...#...#",
    ".###.###.",
    "....#....",
  ],
  hospital: [
    ".........",
    ".##...##.",
    ".##...##.",
    ".##...##.",
    ".#######.",
    ".##...##.",
    ".##...##.",
    ".##...##.",
    ".........",
  ],
  zoo: [
    "..##.##..",
    "..##.##..",
    "##.....##",
    "##.....##",
    "...###...",
    "..#####..",
    ".#######.",
    ".#######.",
    "..##.##..",
  ],
  airport: [
    "....#....",
    "...###...",
    "...###...",
    ".#######.",
    "#########",
    "...###...",
    "...###...",
    "..#####..",
    ".##.#.##.",
  ],
};

/** The cells of a landmark's pictogram, for drawing it elsewhere (the map). */
export function pictCells(kind: LandmarkKind): [number, number][] {
  const out: [number, number][] = [];
  PICT[kind].forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === "#") out.push([c, r]);
    });
  });
  return out;
}
