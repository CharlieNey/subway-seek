import { QUESTION_CATEGORIES, type Question } from "@stand-clear/engine";
import { describe, expect, it } from "vitest";
import { FAMILIES, FAMILY_COLORS, familyOf, familyOfCategory } from "./family.ts";

describe("family colors", () => {
  it("gives each station category its own family", () => {
    const station = QUESTION_CATEGORIES.filter((c) => c !== "onFoot");
    const families = station.map((c) => familyOfCategory(c as Exclude<typeof c, "onFoot">));
    expect(new Set(families).size).toBe(station.length);
    expect(new Set(families)).toEqual(new Set(FAMILIES));
  });

  it("colors questions by the shape their answer draws", () => {
    const cases: [Question, string][] = [
      [{ kind: "radar", miles: 1 }, "radar"],
      [{ kind: "thermometer" }, "thermo"],
      [{ kind: "route", letter: "Q" }, "match"],
      [{ kind: "borough" }, "match"],
      [{ kind: "express" }, "match"],
      [{ kind: "moreRoutes" }, "measure"],
      [{ kind: "measuring", landmark: "park" }, "measure"],
      [{ kind: "tentacles", landmark: "hospital" }, "tent"],
      [{ kind: "photo", from: "exit", look: "N" }, "photo"],
      // On foot: Radar's ring and Thermometer's line, at street scale.
      [{ kind: "spotRadar", meters: 100 }, "radar"],
      [{ kind: "spotThermometer" }, "thermo"],
    ];
    for (const [q, family] of cases) expect(familyOf(q)).toBe(family);
  });

  it("keeps the colors the design names", () => {
    expect(FAMILY_COLORS.tent).toEqual({ fill: "#1F6E6B", trim: "#0E3A38" });
    expect(FAMILY_COLORS.radar.fill).toBe("#25396B");
  });
});
