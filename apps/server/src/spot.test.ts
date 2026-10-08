import { describe, expect, it } from "vitest";
import { officialImagery } from "./spot.ts";

describe("hiding spots are Google's own imagery", () => {
  it("accepts Google's panoramas and refuses user photospheres", () => {
    expect(officialImagery({ copyright: "© Google" })).toBe(true);
    expect(officialImagery({ copyright: "© 2024 Google" })).toBe(true);
    // The 2026-10-07 daily: a contributor's photosphere the client can't walk to.
    expect(officialImagery({ copyright: "© PierDamiano Airoldi" })).toBe(false);
    expect(officialImagery({ copyright: "© Googleplex Tours Inc" })).toBe(false);
    expect(officialImagery({})).toBe(false);
  });
});
