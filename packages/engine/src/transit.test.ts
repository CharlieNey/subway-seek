import type { Dataset, Trip } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import { Geometry } from "./geometry.ts";
import { buildIndex, departures, type TimetableIndex } from "./timetable.ts";
import {
  type ApplyResult,
  applyIntent,
  ENTER_SECONDS,
  EXIT_SECONDS,
  lastStation,
  type OnPlatform,
  resolve,
  type Transit,
} from "./transit.ts";

const TEN = 10 * 3600;
let ds: Dataset;
let idx: TimetableIndex;

const station = (id: string) => {
  const i = ds.stations.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`no station ${id}`);
  return i;
};
const ok = (r: ApplyResult): Transit => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const platform = (id: string, since = TEN, arrivedDir: 0 | 1 | null = null): OnPlatform => ({
  kind: "platform",
  station: station(id),
  since,
  arrivedDir,
});
/** First departure from a station at/after t matching a route id and direction. */
const nextDeparture = (id: string, t: number, routeId: string, dir: 0 | 1) => {
  const d = departures(idx, station(id), t, { horizon: 3600, limit: 500 }).find(
    (x) => x.route.id === routeId && x.dir === dir,
  );
  if (!d) throw new Error(`no ${routeId} dir ${dir} from ${id} after ${t}`);
  return d;
};
const trip = (i: number) => ds.trips[i] as Trip;

beforeAll(() => {
  ds = loadDataset();
  idx = buildIndex(ds);
});

describe("departures", () => {
  it("lists boardable trains at Times Sq soonest first, within the horizon", () => {
    const list = departures(idx, station("127"), TEN, { horizon: 1800 });
    expect(list.length).toBeGreaterThan(10);
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (!d) continue;
      expect(d.dep).toBeGreaterThanOrEqual(TEN);
      expect(d.dep).toBeLessThanOrEqual(TEN + 1800);
      if (i > 0) expect(d.dep).toBeGreaterThanOrEqual(list[i - 1]?.dep ?? 0);
      expect(d.stop).toBeLessThan(trip(d.trip).stops.length - 1);
    }
  });
});

describe("riding", () => {
  it("boards, rides, and arrives at the chosen stop", () => {
    const d = nextDeparture("127", TEN, "1", 1); // downtown 1
    let s = ok(
      applyIntent(platform("127"), { type: "board", trip: d.trip, stop: d.stop }, TEN, idx),
    );
    expect(resolve(s, d.dep - 1, idx).kind).toBe("train"); // still waiting
    const j = d.stop + 3;
    s = ok(applyIntent(s, { type: "alightAt", stop: j }, TEN, idx));
    const arrival = trip(d.trip).arr[j] as number;
    expect(resolve(s, arrival - 1, idx).kind).toBe("train");
    expect(resolve(s, arrival, idx)).toEqual({
      kind: "platform",
      station: trip(d.trip).stops[j],
      since: arrival,
      arrivedDir: 1,
    });
  });

  it("stays on to the terminal by default", () => {
    const d = nextDeparture("127", TEN, "1", 1);
    const s = ok(
      applyIntent(platform("127"), { type: "board", trip: d.trip, stop: d.stop }, TEN, idx),
    );
    const t = trip(d.trip);
    const end = resolve(s, t.arr.at(-1) as number, idx);
    expect(end.kind === "platform" && end.station).toBe(t.stops.at(-1));
  });

  it("rejects a train that has already left", () => {
    const d = nextDeparture("127", TEN, "1", 1);
    const r = applyIntent(
      platform("127"),
      { type: "board", trip: d.trip, stop: d.stop },
      d.dep + 1,
      idx,
    );
    expect(r.ok).toBe(false);
  });

  it("needs the platform-change time to switch direction, but not to continue the same way", () => {
    const up = nextDeparture("127", TEN, "1", 0);
    const arrivedDown = platform("127", up.dep - 60, 1); // got off a downtown train 1 min before
    expect(
      applyIntent(arrivedDown, { type: "board", trip: up.trip, stop: up.stop }, up.dep - 60, idx)
        .ok,
    ).toBe(false);
    const later = nextDeparture(
      "127",
      up.dep - 60 + (idx.selfTransfer[station("127")] ?? 0),
      "1",
      0,
    );
    expect(
      applyIntent(
        arrivedDown,
        { type: "board", trip: later.trip, stop: later.stop },
        up.dep - 60,
        idx,
      ).ok,
    ).toBe(true);
    const down = nextDeparture("127", up.dep - 60, "1", 1);
    expect(
      applyIntent(
        arrivedDown,
        { type: "board", trip: down.trip, stop: down.stop },
        up.dep - 60,
        idx,
      ).ok,
    ).toBe(true);
  });

  it("steps off immediately when the doors are open at the chosen stop", () => {
    // Find a ride with a dwell (arr < dep) at some later stop.
    const d = departures(idx, station("127"), TEN, { horizon: 3600, limit: 500 }).find((x) => {
      const t = trip(x.trip);
      return t.arr.some((a, k) => k > x.stop && k < t.stops.length - 1 && a < (t.dep[k] as number));
    });
    if (!d) throw new Error("no trip with a dwell");
    const t = trip(d.trip);
    const j = t.arr.findIndex(
      (a, k) => k > d.stop && k < t.stops.length - 1 && a < (t.dep[k] as number),
    );
    const s = ok(
      applyIntent(platform("127"), { type: "board", trip: d.trip, stop: d.stop }, TEN, idx),
    );
    const at = t.arr[j] as number;
    expect(ok(applyIntent(s, { type: "alightAt", stop: j }, at, idx))).toEqual({
      kind: "platform",
      station: t.stops[j],
      since: at,
      arrivedDir: t.dir,
    });
  });

  it("can cancel before the train leaves, not after", () => {
    const d = nextDeparture("127", TEN, "1", 1);
    const start = platform("127");
    const s = ok(applyIntent(start, { type: "board", trip: d.trip, stop: d.stop }, TEN, idx));
    expect(ok(applyIntent(s, { type: "cancelBoard" }, d.dep - 1, idx))).toEqual(start);
    expect(applyIntent(s, { type: "cancelBoard" }, d.dep + 1, idx).ok).toBe(false);
  });

  it("reports the last station reached while riding", () => {
    const d = nextDeparture("127", TEN, "1", 1);
    const s = ok(
      applyIntent(platform("127"), { type: "board", trip: d.trip, stop: d.stop }, TEN, idx),
    );
    const t = trip(d.trip);
    const mid = ((t.dep[d.stop + 1] as number) + (t.arr[d.stop + 2] as number)) / 2;
    expect(lastStation(s, mid, idx)).toBe(t.stops[d.stop + 1]);
  });
});

describe("walking", () => {
  it("transfers within Times Sq using the GTFS transfer time", () => {
    const link = idx.transfersFrom[station("127")]?.find((x) => x.to === station("R16"));
    expect(link).toBeDefined();
    const s = ok(applyIntent(platform("127"), { type: "transfer", to: station("R16") }, TEN, idx));
    const end = TEN + (link?.seconds ?? 0);
    expect(resolve(s, end - 1, idx).kind).toBe("walking");
    expect(resolve(s, end, idx)).toEqual(platform("R16", end, null));
    expect(applyIntent(s, { type: "board", trip: 0, stop: 0 }, TEN + 1, idx).ok).toBe(false);
  });

  it("goes up to the street and back down into another platform of the complex", () => {
    const up = ok(applyIntent(platform("127"), { type: "exit", exit: 0 }, TEN, idx));
    const street = resolve(up, TEN + EXIT_SECONDS, idx);
    expect(street.kind).toBe("street");
    expect(
      applyIntent(street, { type: "enter", station: station("120") }, TEN + EXIT_SECONDS, idx).ok,
    ).toBe(false); // 96 St isn't part of Times Sq
    const down = ok(
      applyIntent(street, { type: "enter", station: station("R16") }, TEN + EXIT_SECONDS, idx),
    );
    expect(resolve(down, TEN + EXIT_SECONDS + ENTER_SECONDS, idx)).toEqual(
      platform("R16", TEN + EXIT_SECONDS + ENTER_SECONDS, null),
    );
  });
});

describe("geometry", () => {
  const meters = ([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) =>
    Math.hypot((lon2 - lon1) * 84_000, (lat2 - lat1) * 110_540);

  it("puts a dwelling train at its station and a moving one between its stops", () => {
    const geo = new Geometry(idx);
    const d = nextDeparture("127", TEN, "1", 1);
    const t = trip(d.trip);
    const a = ds.stations[t.stops[d.stop] as number];
    const b = ds.stations[t.stops[d.stop + 1] as number];
    if (!a || !b) throw new Error("stations");
    const atA = geo.trainPosition(d.trip, t.arr[d.stop] as number);
    expect(atA && meters(atA, [a.lon, a.lat])).toBeLessThan(150);
    const mid = ((t.dep[d.stop] as number) + (t.arr[d.stop + 1] as number)) / 2;
    const p = geo.trainPosition(d.trip, mid);
    if (!p) throw new Error("not running");
    const ab = meters([a.lon, a.lat], [b.lon, b.lat]);
    expect(meters(p, [a.lon, a.lat])).toBeLessThan(ab);
    expect(meters(p, [b.lon, b.lat])).toBeLessThan(ab);
  });

  it("counts a plausible number of trains running at 10:00", () => {
    const n = new Geometry(idx).runningTrips(TEN).length;
    expect(n).toBeGreaterThan(200);
    expect(n).toBeLessThan(800);
  });
});

describe("fast-forward targets", () => {
  it("skips to departure, then each next stop, then the alight stop", async () => {
    const { nextEventTime, SKIP_LEAD_SECONDS } = await import("./transit.ts");
    const d = nextDeparture("127", TEN, "1", 1);
    const s = ok(
      applyIntent(platform("127"), { type: "board", trip: d.trip, stop: d.stop }, TEN, idx),
    );
    const t = trip(d.trip);
    expect(nextEventTime(s, TEN, idx, "next")).toBe(d.dep);
    expect(nextEventTime(s, d.dep + 1, idx, "next")).toBe(
      (t.arr[d.stop + 1] as number) - SKIP_LEAD_SECONDS,
    );
    // Your own stop: straight to the arrival.
    expect(nextEventTime(s, (t.arr.at(-2) as number) + 1, idx, "next")).toBe(t.arr.at(-1));
    expect(nextEventTime(s, d.dep + 1, idx, "end")).toBe(t.arr.at(-1));
    expect(nextEventTime(platform("127"), TEN, idx, "next")).toBeNull();
  });

  it("stops short of the next stop, so you can still get off there", async () => {
    const { nextEventTime } = await import("./transit.ts");
    const d = nextDeparture("127", TEN, "1", 1);
    const s = ok(
      applyIntent(platform("127"), { type: "board", trip: d.trip, stop: d.stop }, TEN, idx),
    );
    const at = nextEventTime(s, d.dep + 1, idx, "next") as number;
    const off = ok(applyIntent(s, { type: "alightAt", stop: d.stop + 1 }, at, idx));
    expect(resolve(off, trip(d.trip).arr[d.stop + 1] as number, idx)).toMatchObject({
      kind: "platform",
      station: trip(d.trip).stops[d.stop + 1],
    });
  });
});
