import type { SoloView } from "@subway-seek/engine";
import { describe, expect, it } from "vitest";
import type { World } from "../game.ts";
import { buildRound } from "./layers.ts";

describe("answered boundaries", () => {
  it("keeps a No's ring on the map, as a Yes's", () => {
    const asked = (answer: boolean) => ({
      q: { kind: "radar", miles: 1 },
      ctx: { origin: { lat: 40.75, lon: -73.99, complex: 0 }, baseline: null },
      answer,
    });
    const world = { ds: { complexes: [], stations: [] } } as unknown as World;
    const view = (answer: boolean) =>
      ({
        candidates: [],
        hub: 0,
        hider: null,
        asked: [asked(answer)],
        thermometer: null,
      }) as unknown as SoloView;
    expect(buildRound(world, view(true), 1).past).toHaveLength(1);
    expect(buildRound(world, view(false), 1).past).toHaveLength(1);
  });
});
