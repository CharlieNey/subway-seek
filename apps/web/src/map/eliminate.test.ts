import type { Dataset } from "@subway-seek/data";
import { loadDataset } from "@subway-seek/data/node";
import { type AskContext, distanceMeters, milesToMeters } from "@subway-seek/engine";
import { beforeAll, describe, expect, it } from "vitest";
import { clearingFor, LIFT_MS, liftOf, spreadMs, stillStanding } from "./eliminate.ts";
import { bisector, landmarkCells, questionShape, sideOfBisector } from "./shapes.ts";

let ds: Dataset;
const timesSq = { lat: 40.7553, lon: -73.9873, complex: 0 };
const ctx: AskContext = { origin: timesSq, baseline: null };

beforeAll(() => {
  ds = loadDataset();
});

const stations = () =>
  ds.complexes.map((c, id) => ({ id, at: { lat: c.lat, lon: c.lon }, complex: id }));

describe("elimination", () => {
  it("clears from the ring: outward for Yes, inward for No", () => {
    const r = milesToMeters(1);
    const outside = stations().filter((s) => distanceMeters(timesSq, s.at) > r);
    const yes = clearingFor(ds, { kind: "radar", miles: 1 }, true, ctx, outside, 0);
    const byDistance = [...outside].sort(
      (a, b) => distanceMeters(timesSq, a.at) - distanceMeters(timesSq, b.at),
    );
    const delays = byDistance.map((s) => yes.delays.get(s.id) as number);
    expect([...delays].sort((a, b) => a - b)).toEqual(delays);
    // The ring draws first (400 ms), then the nearest station to it goes.
    expect(delays[0]).toBe(400);

    const inside = stations().filter((s) => distanceMeters(timesSq, s.at) <= r);
    const no = clearingFor(ds, { kind: "radar", miles: 1 }, false, ctx, inside, 0);
    const farthestIn = [...inside].sort(
      (a, b) => distanceMeters(timesSq, b.at) - distanceMeters(timesSq, a.at),
    )[0];
    expect(no.delays.get(farthestIn?.id ?? -1)).toBe(400);
  });

  it("stays under 2 s, with the stagger spread 600–900 ms by count", () => {
    expect(spreadMs(1)).toBe(600);
    expect(spreadMs(400)).toBe(900);
    const all = stations();
    const c = clearingFor(ds, { kind: "borough" }, false, ctx, all, 1000);
    expect(c.end).toBeLessThan(2000);
    expect(Math.max(...c.delays.values())).toBe(spreadMs(all.length));
    // No geometry: outward from where you asked, with nothing to draw first.
    expect(c.boundary).toBe(0);
  });

  it("lifts each square over 160 ms and counts down one per lift", () => {
    const some = stations().slice(0, 50);
    const c = clearingFor(ds, { kind: "express" }, true, ctx, some, 10_000);
    expect(stillStanding(c, 10_000)).toBe(50);
    expect(stillStanding(c, 10_000 + c.end)).toBe(0);
    const id = some[0]?.id ?? 0;
    const d = c.delays.get(id) as number;
    expect(liftOf(c, id, 10_000 + d)).toBe(0);
    expect(liftOf(c, id, 10_000 + d + LIFT_MS / 2)).toBeCloseTo(0.5);
    expect(liftOf(c, id, 10_000 + d + LIFT_MS)).toBe(1);
  });

  it("clears everything at once with reduced motion, and nothing on a veto", () => {
    const some = stations().slice(0, 20);
    const reduced = clearingFor(ds, { kind: "radar", miles: 2 }, true, ctx, some, 0, true);
    expect([...reduced.delays.values()].every((d) => d === 0)).toBe(true);
    const vetoed = clearingFor(ds, { kind: "radar", miles: 2 }, { vetoed: true }, ctx, some, 0);
    expect(vetoed.delays.size).toBe(0);
  });

  it("clears away from the thermometer's line", () => {
    const a = { lat: 40.7484, lon: -73.9857 };
    const t = { origin: timesSq, baseline: { ...a, complex: 1 } };
    const colder = stations().filter((s) => sideOfBisector(a, timesSq, s.at) < 0);
    const c = clearingFor(ds, { kind: "thermometer" }, "hotter", t, colder, 0);
    const sorted = [...colder].sort(
      (x, y) =>
        Math.abs(sideOfBisector(a, timesSq, x.at)) - Math.abs(sideOfBisector(a, timesSq, y.at)),
    );
    const delays = sorted.map((s) => c.delays.get(s.id) as number);
    expect([...delays].sort((x, y) => x - y)).toEqual(delays);
  });
});

describe("question shapes", () => {
  it("draws radar as a ring of the right size round you", () => {
    const s = questionShape(ds, { kind: "radar", miles: 1 }, ctx);
    expect(s.family).toBe("radar");
    expect(s.rings).toHaveLength(1);
    for (const [lon, lat] of s.rings[0] ?? []) {
      expect(distanceMeters(timesSq, { lat, lon })).toBeCloseTo(milesToMeters(1), -1);
    }
  });

  it("draws the thermometer's line halfway between the readings", () => {
    const a = { lat: 40.73, lon: -73.99 };
    const [p, q] = bisector(a, timesSq, 1000);
    for (const [lon, lat] of [p, q] as [number, number][]) {
      expect(distanceMeters(a, { lat, lon })).toBeCloseTo(
        distanceMeters(timesSq, { lat, lon }),
        -1,
      );
    }
  });

  it("divides the city by nearest landmark, one cell each, yours among them", () => {
    const cells = landmarkCells(ds, "museum");
    expect(cells).toHaveLength(ds.landmarks.museum.length);
    expect(cells.every((c) => c.length >= 4)).toBe(true);
    const s = questionShape(ds, { kind: "matching", landmark: "museum" }, ctx);
    expect(s.yourCell).not.toBeNull();
    expect(s.plaques.filter((p) => p.nearest)).toHaveLength(1);
  });

  it("draws tentacles to every landmark in range, and nothing for a question with no shape", () => {
    const s = questionShape(ds, { kind: "tentacles", landmark: "hospital" }, ctx);
    expect(s.lines.length).toBe(s.plaques.length);
    expect(s.rings).toHaveLength(1);
    const borough = questionShape(ds, { kind: "borough" }, ctx);
    expect(borough.rings.length + borough.lines.length + borough.cells.length).toBe(0);
    expect(questionShape(ds, { kind: "route", letter: "Q" }, ctx).route).toBe("Q");
  });
});
