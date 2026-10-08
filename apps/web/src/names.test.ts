import { describe, expect, it } from "vitest";
import { directionPhrase } from "./names.ts";

describe("directionPhrase", () => {
  it("lowercases bearings and keeps places' capitals", () => {
    expect(directionPhrase("Uptown")).toBe("uptown");
    expect(directionPhrase("Uptown & Queens")).toBe("uptown & Queens");
    expect(directionPhrase("Manhattan")).toBe("toward Manhattan");
    expect(directionPhrase("The Bronx")).toBe("toward The Bronx");
    expect(directionPhrase("Last Stop")).toBe("toward the last stop");
  });
});
