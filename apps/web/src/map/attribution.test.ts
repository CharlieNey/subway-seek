import { describe, expect, it } from "vitest";
import { mergeRects } from "./attribution.ts";

describe("mergeRects", () => {
  it("joins a credit that matched twice, and neighbours that touch, into one hole", () => {
    // Google's credit row: "Terms" beside "Report a map error", whose link matched too.
    const row = [
      { x: 762, y: 784, w: 44, h: 18 },
      { x: 803, y: 784, w: 99, h: 18 },
      { x: 810, y: 786, w: 80, h: 14 },
    ];
    expect(mergeRects(row)).toEqual([{ x: 762, y: 784, w: 140, h: 18 }]);
  });

  it("keeps apart what doesn't meet, and joins a chain in any order", () => {
    const logo = { x: 3, y: 772, w: 70, h: 30 };
    const chain = [
      { x: 300, y: 0, w: 10, h: 10 },
      { x: 100, y: 0, w: 10, h: 10 },
      { x: 105, y: 0, w: 200, h: 10 },
    ];
    expect(mergeRects([logo, ...chain])).toEqual([logo, { x: 100, y: 0, w: 210, h: 10 }]);
    // One that grows into a rectangle the merge has already passed.
    const late = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 50, y: 0, w: 10, h: 10 },
      { x: 8, y: 0, w: 44, h: 10 },
    ];
    expect(mergeRects(late)).toEqual([{ x: 0, y: 0, w: 60, h: 10 }]);
  });
});
