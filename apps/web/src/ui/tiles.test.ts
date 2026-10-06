import { describe, expect, it } from "vitest";
import { tileStates } from "./tiles.ts";

describe("tile timers", () => {
  it("lifts tiles from the right as time runs out", () => {
    expect(tileStates(5, 3)).toEqual(["lit", "lit", "lit", "gone", "gone"]);
    expect(tileStates(5, 0)).toEqual(["gone", "gone", "gone", "gone", "gone"]);
    expect(tileStates(5, 9)).toEqual(["lit", "lit", "lit", "lit", "lit"]);
  });

  it("counts a part-spent unit as standing", () => {
    // 2.1 s left of a ten-second window still shows three tiles.
    expect(tileStates(10, 2.1).filter((s) => s === "lit")).toHaveLength(3);
  });

  it("turns the last tile terra cotta only when asked, and only when it's the last", () => {
    expect(tileStates(3, 1, true)).toEqual(["last", "gone", "gone"]);
    expect(tileStates(3, 2, true)).toEqual(["lit", "lit", "gone"]);
    expect(tileStates(3, 1)).toEqual(["lit", "gone", "gone"]);
  });
});
