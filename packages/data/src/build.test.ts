import { describe, expect, it } from "vitest";
import {
  findExpressStations,
  parseGtfsTime,
  resolveServiceIds,
  routeLetter,
  simplifyLine,
} from "./build.ts";

describe("parseGtfsTime", () => {
  it("parses times past midnight", () => {
    expect(parseGtfsTime("10:00:00")).toBe(36_000);
    expect(parseGtfsTime("25:10:30")).toBe(90_630);
  });
  it("rejects garbage", () => {
    expect(() => parseGtfsTime("10:xx")).toThrow();
  });
});

describe("resolveServiceIds", () => {
  const cal = (service_id: string, days: string, start: string, end: string) => {
    const [mo, tu, we, th, fr, sa, su] = days.split("");
    return {
      service_id,
      monday: mo ?? "0",
      tuesday: tu ?? "0",
      wednesday: we ?? "0",
      thursday: th ?? "0",
      friday: fr ?? "0",
      saturday: sa ?? "0",
      sunday: su ?? "0",
      start_date: start,
      end_date: end,
    };
  };
  const calendar = [
    cal("Weekday", "1111100", "20260526", "20261031"),
    cal("Saturday", "0000010", "20260526", "20261031"),
  ];

  it("picks the weekday service on a Wednesday", () => {
    expect(resolveServiceIds("2026-10-14", calendar, [])).toEqual(["Weekday"]);
  });
  it("applies calendar_dates removals and additions (holiday runs Saturday service)", () => {
    const dates = [
      { service_id: "Weekday", date: "20260703", exception_type: "2" },
      { service_id: "Saturday", date: "20260703", exception_type: "1" },
    ];
    expect(resolveServiceIds("2026-07-03", calendar, dates)).toEqual(["Saturday"]);
  });
  it("respects the date range", () => {
    expect(resolveServiceIds("2026-11-04", calendar, [])).toEqual([]);
  });
});

describe("findExpressStations", () => {
  const W = [100, 200] as const;
  const trip = (stops: number[], start: number) => ({ stops, dep: stops.map((_, i) => start + i) });
  // local: 0 1 2 3 4 ; express: 0 2 4 (skips 1 and 3)
  const local = trip([0, 1, 2, 3, 4], 100);
  const express = trip([0, 2, 4], 110);

  it("flags both ends of a hop that skips a station a local serves", () => {
    expect([...findExpressStations([local, express], W, 1)].sort()).toEqual([0, 2, 4]);
  });
  it("flags nothing when every train makes every stop", () => {
    expect(findExpressStations([trip([0, 1, 2], 100), trip([2, 1, 0], 120)], W, 1).size).toBe(0);
  });
  it("ignores express calls outside the window", () => {
    expect(findExpressStations([local, trip([0, 2, 4], 300)], W, 1).size).toBe(0);
  });
  it("requires minCalls express calls, so a one-off trip doesn't count", () => {
    expect(findExpressStations([local, express], W, 2).size).toBe(0);
    expect(findExpressStations([local, express, trip([0, 2, 4], 150)], W, 2).size).toBe(3);
  });
});

describe("routeLetter", () => {
  const ids = new Set(["6", "6X", "7", "7X", "F", "FX", "GS", "SI"]);
  it("folds express variants into their base route", () => {
    expect(routeLetter("6X", ids)).toBe("6");
    expect(routeLetter("FX", ids)).toBe("F");
    expect(routeLetter("GS", ids)).toBe("GS");
    expect(routeLetter("A", ids)).toBe("A");
  });
});

describe("simplifyLine", () => {
  it("drops collinear points and keeps corners", () => {
    const line: [number, number][] = [
      [-74.0, 40.7],
      [-73.999, 40.7],
      [-73.998, 40.7],
      [-73.998, 40.701],
    ];
    expect(simplifyLine(line, 2)).toEqual([
      [-74.0, 40.7],
      [-73.998, 40.7],
      [-73.998, 40.701],
    ]);
  });
});
