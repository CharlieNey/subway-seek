import { describe, expect, it } from "vitest";
import { nextPacificMidnight, streetOffLine } from "./streetMode.ts";

describe("the street endgame's off switch", () => {
  it("remembers a refusal until Google's quotas reset, at midnight in Los Angeles", () => {
    // 2026-11-21 02:30 in New York is 23:30 on the 20th in Los Angeles (PST, UTC-8).
    const now = Date.parse("2026-11-21T07:30:00Z");
    expect(new Date(nextPacificMidnight(now)).toISOString()).toBe("2026-11-21T08:00:00.000Z");
    // Midday Pacific: the next midnight is that night.
    const noon = Date.parse("2026-11-21T20:00:00Z");
    expect(new Date(nextPacificMidnight(noon)).toISOString()).toBe("2026-11-22T08:00:00.000Z");
    // Summer time (PDT, UTC-7).
    const july = Date.parse("2027-07-01T12:00:00.250Z");
    expect(new Date(nextPacificMidnight(july)).toISOString()).toBe("2027-07-02T07:00:00.000Z");
  });

  it("says why, once: the demo, or Google refusing", () => {
    expect(streetOffLine(null)).toBeNull();
    expect(streetOffLine("demo")).toMatch(/ends when you reach the hider's station/);
    expect(streetOffLine("refused")).toMatch(/Street View isn't available right now/);
    expect(streetOffLine("phone")).toBe(
      "On a phone, the round ends when you reach the hider's station.",
    );
  });
});
