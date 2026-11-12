import { beforeAll, describe, expect, it } from "vitest";
import { loadDataset } from "./node.ts";
import type { Dataset } from "./types.ts";

let d: Dataset;
const byId = (id: string) => {
  const s = d.stations.find((st) => st.id === id);
  if (!s) throw new Error(`no station ${id}`);
  return s;
};

beforeAll(() => {
  d = loadDataset();
});

describe("generated dataset", () => {
  it("is the pinned weekday without Staten Island Railway", () => {
    expect(d.meta.serviceDate).toBe("2026-12-02");
    expect(d.meta.serviceIds).toEqual(["Weekday"]);
    expect(d.routes.map((r) => r.id)).not.toContain("SI");
    expect(d.stations.every((s) => ["M", "Bk", "Q", "Bx"].includes(s.borough))).toBe(true);
  });

  // 8,000 trips with several expects each: under load the default 5 s is not enough.
  it("has well-formed trips", () => {
    for (const t of d.trips) {
      expect(t.stops.length).toBeGreaterThan(1);
      expect(t.arr.length).toBe(t.stops.length);
      expect(t.dep.length).toBe(t.stops.length);
      expect(d.routes[t.route]).toBeDefined();
      expect(d.shapes[t.shape]).toBeDefined();
      for (let i = 0; i < t.stops.length; i++) {
        expect(d.stations[t.stops[i] as number]).toBeDefined();
        expect(t.dep[i] as number).toBeGreaterThanOrEqual(t.arr[i] as number);
        if (i > 0) expect(t.arr[i] as number).toBeGreaterThanOrEqual(t.dep[i - 1] as number);
      }
    }
  }, 30_000);

  it("links every station to a complex that lists it, and every complex has an exit", () => {
    d.stations.forEach((s, i) => {
      expect(d.complexes[s.complex]?.stations).toContain(i);
    });
    for (const c of d.complexes) expect(c.exits.length).toBeGreaterThan(0);
  });

  it("references valid stations in transfers", () => {
    for (const t of d.transfers) {
      expect(d.stations[t.from]).toBeDefined();
      expect(d.stations[t.to]).toBeDefined();
      expect(t.seconds).toBeGreaterThanOrEqual(0);
    }
  });

  it("groups Times Sq into one complex", () => {
    const ts = d.complexes[byId("127").complex];
    expect(ts?.name).toBe("Times Sq-42 St");
    expect(ts?.stations.map((i) => d.stations[i]?.id).sort()).toEqual([
      "127",
      "725",
      "902",
      "A27",
      "R16",
    ]);
  });

  it("knows routes and boroughs", () => {
    expect(byId("127").routes).toEqual(["1", "2", "3"]);
    expect(byId("127").borough).toBe("M");
    expect(byId("L08").borough).toBe("Bk"); // Bedford Av
  });

  it("flags express stops from the timetable", () => {
    for (const id of ["120", "127", "631", "A24"]) expect(byId(id).express, id).toBe(true); // 96 St, Times Sq, Grand Central, Columbus Circle
    for (const id of ["121", "122", "135", "L08", "G26"]) expect(byId(id).express, id).toBe(false); // 86 St (1), 79 St, Canal St (1), Bedford Av, Greenpoint Av
  });
});
