import { loadDataset } from "@subway-seek/data/node";
import {
  applySoloIntent,
  buildIndex,
  createSoloRound,
  hashString,
  type SoloRound,
  seededRandom,
  soloView,
  stationOnly,
  type TimetableIndex,
} from "@subway-seek/engine";
import { beforeAll, describe, expect, it } from "vitest";
import { nextMove } from "./nextMove.ts";
import { checkedNow, NOT_HERE_AFTER_SECONDS, stillPossible } from "./notHere.ts";

let idx: TimetableIndex;
beforeAll(() => {
  idx = buildIndex(loadDataset());
});

const TEN = 10 * 3600;

function round(): SoloRound {
  const hub = idx.ds.stations.findIndex((s) => s.id === "127");
  return stationOnly(
    createSoloRound(idx, {
      hub,
      hideStart: TEN,
      random: seededRandom(hashString("not-here")),
      difficulty: "easy",
    }),
  );
}

/** Board a train from the start platform and get off at the first possible station on it. */
function rideToPossible(r: SoloRound): { r: SoloRound; at: number; complex: number } {
  const t0 = r.seekStart;
  const start = r.seeker.kind === "platform" ? r.seeker.station : -1;
  const view = soloView(r, t0, idx);
  const hub = idx.ds.stations[start]?.complex;
  for (let trip = 0; trip < idx.ds.trips.length; trip++) {
    const tr = idx.ds.trips[trip];
    if (!tr) continue;
    const from = tr.stops.indexOf(start);
    if (from < 0 || (tr.dep[from] as number) < t0 + 60 || (tr.dep[from] as number) > t0 + 900)
      continue;
    for (let k = from + 1; k < tr.stops.length; k++) {
      const c = idx.ds.stations[tr.stops[k] as number]?.complex as number;
      if (c === hub || c === r.hider || !view.candidates.includes(c)) continue;
      let res = applySoloIntent(r, { type: "board", trip, stop: from }, t0, idx);
      if (!res.ok) break;
      res = applySoloIntent(res.round, { type: "alightAt", stop: k }, t0, idx);
      if (!res.ok) break;
      return { r: res.round, at: tr.arr[k] as number, complex: c };
    }
  }
  throw new Error("no possible station one ride away");
}

describe("not here", () => {
  it("counts a possible station once you've stood in it, never before", () => {
    // A possible station that isn't theirs, one ride away.
    const { r, at, complex } = rideToPossible(round());
    const arrived = soloView(r, at + 1, idx);
    expect(arrived.result).toBeNull();
    // Just off the train: too soon to say, the server's tick may not have run.
    expect(checkedNow(arrived, at + 1, idx)).toBeNull();
    const t = at + NOT_HERE_AFTER_SECONDS;
    const settled = soloView(r, t, idx);
    expect(checkedNow(settled, t, idx)).toBe(complex);
    expect(stillPossible(settled, [complex])).not.toContain(complex);
    // The next move says so first.
    const move = nextMove({
      idx,
      view: settled,
      t,
      tab: "travel",
      armed: null,
      armedReady: false,
      suggest: true,
      notHere: [complex],
    });
    expect(move?.line).toMatch(/^Not here\. \d+ stations? left\. /);
  });

  it("says nothing in a round with the street search, or once it's over", () => {
    const start = round();
    const street = { ...soloView(start, start.seekStart, idx), stationOnly: false };
    expect(checkedNow(street, start.seekStart + 3600, idx)).toBeNull();
    const res = applySoloIntent(start, { type: "giveUp" }, start.seekStart + 60, idx);
    if (!res.ok) throw new Error(res.error);
    expect(
      checkedNow(soloView(res.round, start.seekStart + 120, idx), start.seekStart + 120, idx),
    ).toBeNull();
  });
});
