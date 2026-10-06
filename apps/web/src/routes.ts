import type { Route } from "@stand-clear/data";
import type { World } from "./game.ts";

/** The routes behind a station's letters, in the dataset's order, for its bullets. */
export const routesFor = ({ ds }: World, letters: string[]): Route[] =>
  letters.map((l) => ds.routes.find((r) => r.letter === l)).filter((r) => r !== undefined);
