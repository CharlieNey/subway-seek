import { loadDataset } from "@subway-seek/data/node";
import type { SoloView } from "@subway-seek/engine";
import { describe, expect, it } from "vitest";
import { pulseInterval, ridingAt } from "./sound.ts";

describe("the pulse", () => {
  it("stays quiet until half the stations are gone", () => {
    expect(pulseInterval(99, 99)).toBeNull();
    expect(pulseInterval(50, 99)).toBeNull();
  });
  it("quickens as the last ones fall, from 2.4 s to 0.7 s", () => {
    expect(pulseInterval(49, 98)).toBe(2.4);
    expect(pulseInterval(1, 100)).toBe(0.73);
    const a = pulseInterval(40, 100) as number;
    const b = pulseInterval(10, 100) as number;
    expect(b).toBeLessThan(a);
  });
  it("has nothing to say with nothing left or nothing to start from", () => {
    expect(pulseInterval(0, 99)).toBeNull();
    expect(pulseInterval(3, 0)).toBeNull();
  });
});

describe("riding, for the rumble and the doors", () => {
  const ds = loadDataset();
  const world = { ds };
  const trip = ds.trips.findIndex((t) => t.stops.length > 4);
  const tr = ds.trips[trip];
  if (!tr) throw new Error("no trip");
  const platform = {
    kind: "platform" as const,
    station: tr.stops[0] as number,
    since: 0,
    arrivedDir: null,
  };
  const view = {
    seeker: { kind: "train", trip, from: 0, to: 3, boardedFrom: platform },
  } as unknown as SoloView;
  const dep = tr.dep[0] as number;
  const arr = tr.arr[3] as number;

  it("is false while the train waits, true while it moves, false once it arrives", () => {
    expect(ridingAt(world, view, dep - 30)).toBe(false);
    expect(ridingAt(world, view, dep)).toBe(true);
    expect(ridingAt(world, view, arr - 1)).toBe(true);
    expect(ridingAt(world, view, arr)).toBe(false);
  });
  it("is false on a platform", () => {
    expect(ridingAt(world, { seeker: platform } as unknown as SoloView, dep)).toBe(false);
  });
});
