import { describe, expect, it } from "vitest";
import {
  HOLD_MS,
  LAND_MS,
  landingPhase,
  RISE_MS,
  SHRINK_MS,
  schedule,
  tileSet,
} from "./curseMotion.ts";

describe("card landings", () => {
  it("rises, holds 1.6 s and shrinks in 400 ms", () => {
    expect(LAND_MS).toBe(RISE_MS + HOLD_MS + SHRINK_MS);
    const [l] = schedule([], [{ t: 100, card: "fog" }], 1000);
    if (!l) throw new Error("no landing");
    expect(landingPhase(l, 999).phase).toBe("waiting");
    expect(landingPhase(l, 1000 + RISE_MS / 2)).toEqual({ phase: "rise", p: 0.5 });
    expect(landingPhase(l, 1000 + RISE_MS + 800).phase).toBe("hold");
    expect(landingPhase(l, 1000 + RISE_MS + HOLD_MS + 200)).toEqual({ phase: "shrink", p: 0.5 });
    expect(landingPhase(l, 1000 + LAND_MS).phase).toBe("done");
  });

  it("plays one at a time: a second play queues behind the first", () => {
    const first = schedule([], [{ t: 100, card: "veto" }], 1000);
    const both = schedule(first, [{ t: 102, card: "signalLoss" }], 1500);
    expect(both.map((l) => [l.key, l.start])).toEqual([
      ["veto@100", 1000],
      ["signalLoss@102", 1000 + LAND_MS],
    ]);
    // Two in one update keep their order.
    const two = schedule(
      [],
      [
        { t: 1, card: "veto" },
        { t: 2, card: "fog" },
      ],
      0,
    );
    expect(two.map((l) => l.start)).toEqual([0, LAND_MS]);
  });

  it("drops landings that are done", () => {
    const first = schedule([], [{ t: 100, card: "veto" }], 1000);
    const later = schedule(first, [{ t: 200, card: "fog" }], 1000 + LAND_MS + 5);
    expect(later.map((l) => [l.key, l.start])).toEqual([["fog@200", 1000 + LAND_MS + 5]]);
  });
});

describe("Signal loss sweep", () => {
  it("sets from the top left to the bottom right over 900 ms", () => {
    expect(tileSet(0, 0, false)).toBe(0);
    expect(tileSet(0, 160, false)).toBe(1);
    expect(tileSet(1, 160, false)).toBe(0);
    expect(tileSet(1, 900, false)).toBe(1);
  });

  it("lifts in reverse, bottom right first", () => {
    expect(tileSet(1, 160, true)).toBe(0);
    expect(tileSet(0, 160, true)).toBe(1);
    expect(tileSet(0, 900, true)).toBe(0);
  });
});
