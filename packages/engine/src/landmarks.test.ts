import type { Dataset } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import { distanceMeters, METERS_PER_MILE } from "./geo.ts";
import { complexNearest, landmarksWithin, nearestLandmark, TENTACLE_MILES } from "./landmarks.ts";
import {
  type AskContext,
  describeAnswer,
  describeQuestion,
  evaluate,
  filterCandidates,
  questionError,
} from "./questions.ts";

let ds: Dataset;
const complexOf = (id: string) => {
  const s = ds.stations.find((st) => st.id === id);
  if (!s) throw new Error(`no station ${id}`);
  return s.complex;
};
/** Asking from a complex's center. */
const from = (id: string): AskContext => {
  const complex = complexOf(id);
  const c = ds.complexes[complex];
  if (!c) throw new Error(id);
  return { origin: { lat: c.lat, lon: c.lon, complex }, baseline: null };
};

beforeAll(() => {
  ds = loadDataset();
});

describe("landmark data", () => {
  it("has every kind, inside the city and off Staten Island", () => {
    expect(ds.landmarks.airport.map((a) => a.name).sort()).toEqual([
      "John F. Kennedy International Airport",
      "LaGuardia Airport",
    ]);
    for (const [kind, list] of Object.entries(ds.landmarks)) {
      expect(list.length, kind).toBeGreaterThan(1);
      for (const l of list) {
        expect(l.lat).toBeGreaterThan(40.54);
        expect(l.lat).toBeLessThan(40.92);
        expect(l.lon).toBeGreaterThan(-74.06);
      }
    }
    expect(ds.landmarkAttribution).toMatch(/OpenStreetMap/);
  });
});

describe("landmark questions", () => {
  it("matching: your own station always matches, and an airport splits the city", () => {
    const ts = from("127");
    expect(evaluate(ds, { kind: "matching", landmark: "museum" }, complexOf("127"), ts)).toBe(true);
    // Times Sq is nearest LaGuardia; Howard Beach (by JFK) is not.
    const q = { kind: "matching" as const, landmark: "airport" as const };
    expect(evaluate(ds, q, complexOf("H03"), ts)).toBe(false);
    expect(evaluate(ds, q, complexOf("702"), ts)).toBe(true); // Mets-Willets Point
  });

  it("measuring: strictly closer than me", () => {
    const ts = from("127");
    const q = { kind: "measuring" as const, landmark: "airport" as const };
    expect(evaluate(ds, q, complexOf("127"), ts)).toBe(false);
    expect(evaluate(ds, q, complexOf("H03"), ts)).toBe(true); // Howard Beach-JFK
  });

  it("tentacles: names the nearest landmark in range, or none when you're out of range", () => {
    const ts = from("127");
    const q = { kind: "tentacles" as const, landmark: "museum" as const };
    const options = landmarksWithin(ds, "museum", ts.origin, TENTACLE_MILES.museum as number);
    expect(options.length).toBeGreaterThan(3);
    // Far away: out of range.
    expect(evaluate(ds, q, complexOf("H03"), ts)).toEqual({ landmark: null });
    // Grand Central (well within a mile): one of the options, the nearest of them to it.
    const gc = ds.complexes[complexOf("631")];
    if (!gc) throw new Error("gc");
    const answer = evaluate(ds, q, complexOf("631"), ts) as { landmark: number };
    expect(options).toContain(answer.landmark);
    const d = (i: number) =>
      distanceMeters(gc, ds.landmarks.museum[i] as { lat: number; lon: number });
    expect(Math.min(...options.map(d))).toBe(d(answer.landmark));
    expect(distanceMeters(gc, ts.origin)).toBeLessThan(METERS_PER_MILE);
  });

  it("filters on tentacle answers by value, not by object identity", () => {
    const ts = from("127");
    const q = { kind: "tentacles" as const, landmark: "museum" as const };
    const hider = complexOf("631");
    const asked = [{ q, ctx: ts, answer: evaluate(ds, q, hider, ts) }];
    const all = ds.complexes.map((_, i) => i);
    const left = filterCandidates(ds, all, asked);
    expect(left).toContain(hider);
    expect(left.length).toBeLessThan(all.length / 4);
  });

  it("refuses tentacles with nothing in range", () => {
    // Far Rockaway: no museum within a mile.
    expect(questionError(ds, { kind: "tentacles", landmark: "museum" }, from("H11"))).toMatch(
      /no museums within 1 mile/,
    );
    expect(questionError(ds, { kind: "tentacles", landmark: "zoo" }, from("127"))).not.toBeNull();
  });

  it("names the seeker's own landmark in the question, and the answer's landmark", () => {
    const ts = from("127");
    const q = { kind: "matching" as const, landmark: "airport" as const };
    expect(describeQuestion(q, ds, ts)).toBe(
      "Is your nearest airport LaGuardia Airport, like mine?",
    );
    const t = { kind: "tentacles" as const, landmark: "museum" as const };
    expect(describeAnswer({ landmark: null }, t, ds)).toBe("Not within 1 mile");
    const near = nearestLandmark(ds, "museum", ts.origin);
    expect(describeAnswer({ landmark: near.index }, t, ds)).toBe(
      ds.landmarks.museum[near.index]?.name,
    );
    expect(complexNearest(ds, "museum", complexOf("127")).index).toBe(near.index);
  });
});
