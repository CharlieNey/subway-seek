import { describe, expect, it } from "vitest";
import { arrowLinks, bearing, compassArrow, compassLetters, compassWord } from "./compass.ts";
import { fitZoom } from "./map/shapes.ts";

describe("the compass on the street", () => {
  it("names the nearest of eight points", () => {
    expect(compassLetters(0)).toBe("N");
    expect(compassLetters(359)).toBe("N");
    expect(compassLetters(44)).toBe("NE");
    expect(compassLetters(-90)).toBe("W");
    expect(compassLetters(181)).toBe("S");
    expect(compassArrow(90)).toBe("→");
    expect(compassWord(225)).toBe("southwest");
  });

  it("finds the way a walk goes", () => {
    const at: [number, number] = [40.735, -73.99];
    expect(compassWord(bearing(at, [40.736, -73.99]))).toBe("north");
    expect(compassWord(bearing(at, [40.735, -73.989]))).toBe("east");
    expect(compassWord(bearing(at, [40.734, -73.991]))).toBe("southwest");
  });
});

describe("framing the search area", () => {
  it("picks the zoom at which the circle spans the strip", () => {
    // 800 m across in 332 px at 40.75° N: a bit past Google zoom 15.5.
    const z = fitZoom(40.75, 400, 332);
    expect(z).toBeGreaterThan(15.5);
    expect(z).toBeLessThan(16);
    // Twice the room, one more level.
    expect(fitZoom(40.75, 400, 664) - z).toBeCloseTo(1);
  });
});

describe("arrowLinks", () => {
  it("maps the arrows to the streets ahead, behind and to each side of where you face", () => {
    // Facing east (90): a street east, one north, one south.
    expect(arrowLinks(90, [0, 95, 180])).toEqual({ ArrowUp: 1, ArrowLeft: 0, ArrowRight: 2 });
  });

  it("leaves an arrow out when no street is within 60° of its way", () => {
    expect(arrowLinks(0, [130])).toEqual({ ArrowRight: 0 });
    // Two streets either side of ahead: the first is ahead, the other is to its side.
    expect(arrowLinks(0, [45, 315])).toEqual({ ArrowUp: 0, ArrowLeft: 1 });
  });
});
