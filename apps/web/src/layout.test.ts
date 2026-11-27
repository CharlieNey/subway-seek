import { describe, expect, it } from "vitest";
import { playLayout, sheetToggle, streetFits, tapTab } from "./layout.ts";

describe("the round's layout", () => {
  it("puts the panel beside the map on a computer", () => {
    expect(playLayout(1440, 900)).toBe("wide");
    expect(playLayout(1280, 720)).toBe("wide");
    // The narrowest computer layout: 380 px of board and 480 px of map.
    expect(playLayout(860, 700)).toBe("wide");
  });

  it("stacks the map over the panel on a phone or a narrow window", () => {
    expect(playLayout(390, 844)).toBe("stack");
    expect(playLayout(375, 667)).toBe("stack");
    expect(playLayout(320, 568)).toBe("stack");
    // A tablet upright, and a computer window dragged narrow.
    expect(playLayout(768, 1024)).toBe("stack");
    expect(playLayout(859, 900)).toBe("stack");
  });

  it("keeps the map beside the panel on a phone on its side", () => {
    expect(playLayout(844, 390)).toBe("wide");
    expect(playLayout(667, 375)).toBe("wide");
    // Short but not sideways (a split screen): still a stack.
    expect(playLayout(500, 520)).toBe("stack");
  });

  it("plays the street endgame only where Street View, the map and the board fit", () => {
    expect(streetFits(1440)).toBe(true);
    expect(streetFits(860)).toBe(true);
    expect(streetFits(859)).toBe(false);
    expect(streetFits(390)).toBe(false);
  });
});

describe("the stack's sheet", () => {
  it("folds or opens when you tap the tab you're on", () => {
    expect(tapTab({ tab: "travel", sheet: "open" }, "travel")).toEqual({
      tab: "travel",
      sheet: "folded",
    });
    expect(tapTab({ tab: "travel", sheet: "folded" }, "travel")).toEqual({
      tab: "travel",
      sheet: "open",
    });
  });

  it("opens on the other tab when you tap it, folded or not", () => {
    expect(tapTab({ tab: "travel", sheet: "folded" }, "ask")).toEqual({
      tab: "ask",
      sheet: "open",
    });
    expect(tapTab({ tab: "ask", sheet: "open" }, "travel")).toEqual({
      tab: "travel",
      sheet: "open",
    });
  });

  it("labels its toggle with what a tap shows", () => {
    expect(sheetToggle("open")).toEqual({ label: "Map ▴", next: "folded" });
    expect(sheetToggle("folded")).toEqual({ label: "Board ▾", next: "open" });
  });
});
