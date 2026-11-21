import { loadDataset } from "@subway-seek/data/node";
import { buildIndex, departures, type TimetableIndex } from "@subway-seek/engine";
import { beforeAll, describe, expect, it } from "vitest";
import { connectionsBoard, platformBoard } from "./boards.ts";

let idx: TimetableIndex;
let timesSq: number;
const T = 10 * 3600 + 20 * 60;

beforeAll(() => {
  idx = buildIndex(loadDataset());
  // Times Sq–42 St on the N, Q, R and W.
  timesSq = idx.ds.stations.findIndex((s) => s.id === "R16");
});

describe("the platform board", () => {
  it("groups by direction, one row per route, the next two trains, soonest first", () => {
    const groups = platformBoard(
      idx,
      { kind: "platform", station: timesSq, since: T, arrivedDir: null },
      T,
      [],
    );
    expect(groups.map((g) => g.dir)).toEqual([0, 1]);
    for (const g of groups) {
      const keys = g.lines.map((l) => `${l.route.id}|${l.dir}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const l of g.lines) {
        expect(l.dir).toBe(g.dir);
        expect(l.first.dep).toBeGreaterThanOrEqual(T);
        if (l.then) expect(l.then.dep).toBeGreaterThanOrEqual(l.first.dep);
        expect(l.minutes).toBe(Math.floor((l.first.dep - T) / 60));
        expect(l.reason).toBeNull();
      }
      const firsts = g.lines.map((l) => l.first.dep);
      expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
    }
    expect(groups[0]?.label).toBe(idx.ds.stations[timesSq]?.northLabel);
  });

  it("dims the other direction's trains until the platform change is done", () => {
    // Just off a northbound train: southbound trains in the next 90+ s can't be made.
    const groups = platformBoard(
      idx,
      { kind: "platform", station: timesSq, since: T, arrivedDir: 0 },
      T,
      [],
    );
    const changeBy = T + (idx.selfTransfer[timesSq] ?? 0);
    for (const l of groups.flatMap((g) => g.lines)) {
      const tooSoon = l.dir === 1 && l.first.dep < changeBy;
      expect(l.reason).toBe(tooSoon ? "too soon to change platforms" : null);
      expect(l.struck).toBe(false);
    }
  });

  it("strikes out the rows a curse rules out", () => {
    const state = { kind: "platform" as const, station: timesSq, since: T, arrivedDir: null };
    const wrong = platformBoard(idx, state, T, [
      { card: "wrongWay", at: T, dir: 1, until: T + 1800 },
    ]);
    for (const l of wrong.flatMap((g) => g.lines)) expect(l.struck).toBe(l.dir === 0);
    const tourist = platformBoard(idx, state, T, [{ card: "tourist", at: T, station: timesSq }]);
    expect(tourist.flatMap((g) => g.lines).every((l) => l.struck)).toBe(true);
  });
});

describe("connections at your stop", () => {
  it("lists what you can make from your stop and its complex, from your arrival, without your own train", () => {
    const q = departures(idx, timesSq, T, { limit: 40 }).find(
      (d) => d.route.letter === "Q" && d.dir === 1,
    );
    if (!q) throw new Error("no downtown Q");
    const trip = idx.ds.trips[q.trip];
    if (!trip) throw new Error("no trip");
    const to = q.stop + 3;
    const board = connectionsBoard(idx, { trip: q.trip, to });
    if (!board) throw new Error("no board");
    expect(board.station).toBe(trip.stops[to]);
    expect(board.arrival).toBe(trip.arr[to]);
    expect(board.lines.length).toBeGreaterThan(0);
    expect(board.lines.length).toBeLessThanOrEqual(5);
    const deps = board.lines.map((l) => l.first.dep);
    expect([...deps].sort((a, b) => a - b)).toEqual(deps);
    for (const l of board.lines) {
      expect(l.first.dep).toBeGreaterThanOrEqual(board.arrival);
      expect(l.first.trip).not.toBe(q.trip);
      expect(l.minutes).toBe(Math.floor((l.first.dep - board.arrival) / 60));
      expect(l.note).toMatch(/^[↑↓] /);
      // Not the train you're on, nor its route the same way from the same platform.
      expect(
        l.route.id === q.route.id && l.dir === 1 && l.first.stop >= 0 && l.first.trip === q.trip,
      ).toBe(false);
    }
  });
});
