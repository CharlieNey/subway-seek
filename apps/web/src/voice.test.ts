import { describe, expect, it } from "vitest";
import { lineFor, resetLines } from "./voice.ts";

describe("the conductor's lines", () => {
  it("keeps a line for the first moment that shows it, all round", () => {
    resetLines();
    expect(lineFor("r1", "veto", 100)).toBe(true);
    // The same moment keeps showing it (a re-render, a tab switch).
    expect(lineFor("r1", "veto", 100)).toBe(true);
    // A second veto in the round doesn't repeat it.
    expect(lineFor("r1", "veto", 400)).toBe(false);
    // Another line, or another round, is its own.
    expect(lineFor("r1", "lost", 400)).toBe(true);
    expect(lineFor("r2", "veto", 400)).toBe(true);
  });
});
