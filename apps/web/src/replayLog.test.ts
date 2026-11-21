import type { Dataset } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import type { SoloView, TimetableIndex, TrailEntry } from "@stand-clear/engine";
import { beforeAll, describe, expect, it } from "vitest";
import { displayName } from "./names.ts";
import { currentEvent, movesOf, replayLog } from "./replayLog.ts";

let ds: Dataset;
beforeAll(() => {
  ds = loadDataset();
});

/** A ride on the dataset's first trip with 5+ stops, from its first stop. */
function ride() {
  const trip = ds.trips.findIndex((t) => t.stops.length > 5);
  const tr = ds.trips[trip];
  if (!tr) throw new Error("no trip");
  const start = tr.stops[0] as number;
  const platform = {
    kind: "platform" as const,
    station: start,
    since: (tr.dep[0] ?? 0) - 60,
    arrivedDir: null,
  };
  return { trip, tr, platform };
}

describe("replay log", () => {
  it("says boarding, getting off and coming up, in order", () => {
    const { trip, tr, platform } = ride();
    const stop = tr.stops[3] as number;
    const arr = tr.arr[3] as number;
    const trail: TrailEntry[] = [
      { t: platform.since, state: platform },
      {
        t: platform.since + 10,
        state: { kind: "train", trip, from: 0, to: 5, boardedFrom: platform },
      },
      // Alight-at moved the stop: one ride, off at stop 3.
      {
        t: platform.since + 20,
        state: { kind: "train", trip, from: 0, to: 3, boardedFrom: platform },
      },
      {
        t: arr + 30,
        state: {
          kind: "walking",
          reason: "exit",
          start: arr + 30,
          end: arr + 150,
          fromPoint: [0, 0],
          toPoint: [0, 0],
          fromComplex: 0,
          dest: { kind: "street", complex: 0, exit: 1, since: arr + 150 },
        },
      },
    ];
    const moves = movesOf(ds, trail, "you", arr + 600);
    expect(moves.map((m) => m.t)).toEqual([tr.dep[0], arr, arr + 150]);
    expect(moves[0]?.text).toMatch(/^You board the \S+ (uptown|downtown|to .+)$/);
    expect(moves[1]?.text).toMatch(/^You get off at /);
    expect(moves[1]?.text).toBe(
      `You get off at ${displayName(ds.complexes[ds.stations[stop]?.complex ?? 0]?.name ?? "")}`,
    );
    expect(moves[2]?.text).toBe("You come up at Exit 2");
    // The hider says it in the third person.
    expect(movesOf(ds, trail, "hider", arr + 600)[0]?.text).toMatch(/^Hider boards the /);
  });

  it("leaves out a ride cancelled before the train left, and an arrival after the end", () => {
    const { trip, tr, platform } = ride();
    const dep = tr.dep[0] as number;
    const cancelled: TrailEntry[] = [
      { t: dep - 50, state: { kind: "train", trip, from: 0, to: 3, boardedFrom: platform } },
      { t: dep - 20, state: platform },
    ];
    expect(movesOf(ds, cancelled, "you", dep + 9999)).toEqual([]);
    const riding: TrailEntry[] = [
      { t: dep - 50, state: { kind: "train", trip, from: 0, to: 3, boardedFrom: platform } },
    ];
    expect(movesOf(ds, riding, "you", dep + 1).map((m) => m.text)).toHaveLength(1);
  });

  it("puts questions, curses and the find in time order, with what each left", () => {
    const view = {
      result: { kind: "found", at: 5000 },
      replay: { hider: [], seeker: [] },
      asked: [
        {
          q: { kind: "radar", miles: 1 },
          ctx: { origin: { lat: 40.7, lon: -74, complex: 0 }, baseline: null },
          answer: false,
          at: 1000,
          answerAt: 1060,
          remaining: 72,
        },
        {
          q: { kind: "radar", miles: 0.5 },
          ctx: { origin: { lat: 40.7, lon: -74, complex: 0 }, baseline: null },
          answer: { vetoed: true },
          at: 2000,
          answerAt: 2060,
          remaining: 72,
        },
        {
          q: { kind: "spotRadar", meters: 200 },
          ctx: { origin: { lat: 40.7, lon: -74, complex: 0 }, baseline: null },
          answer: true,
          at: 4000,
          answerAt: 4000,
          remaining: null,
        },
      ],
      cardEvents: [
        { t: 3000, card: "fog" },
        { t: 2060, card: "veto" },
      ],
    } as unknown as SoloView;
    const log = replayLog(ds, { ds } as TimetableIndex, view, () => 0.21);
    expect(log.map((e) => [e.text, e.note])).toEqual([
      ["Radar 1 mi: No", "72 left"],
      ["Radar ½ mi: Vetoed", "72 left"],
      ["Hider plays Fog", undefined],
      ["Spot within 200 m: Yes", "21% left"],
      ["Found", undefined],
    ]);
    expect(log[1]?.mark).toEqual({ kind: "question", family: "radar", vetoed: true });
    expect(currentEvent(log, 2999)).toBe(1);
    expect(currentEvent(log, 0)).toBe(-1);
  });

  it("says the bot's moves as the seeker's, not yours", () => {
    const { trip, tr, platform } = ride();
    const seeker: TrailEntry[] = [
      { t: platform.since, state: platform },
      {
        t: platform.since + 10,
        state: { kind: "train", trip, from: 0, to: 3, boardedFrom: platform },
      },
    ];
    const end = (tr.arr[3] as number) + 60;
    const view = {
      result: { kind: "found", at: end },
      replay: { hider: [], seeker },
      asked: [],
      cardEvents: [],
    } as unknown as SoloView;
    const yours = replayLog(ds, { ds } as TimetableIndex, view).map((e) => e.text);
    const bots = replayLog(ds, { ds } as TimetableIndex, view, undefined, true).map((e) => e.text);
    expect(yours[0]).toMatch(/^You board the /);
    expect(bots[0]).toMatch(/^Seeker boards the /);
    expect(bots[1]).toMatch(/^Seeker gets off at /);
  });
});
