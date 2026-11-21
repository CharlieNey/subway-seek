/**
 * Rounds that end at the station (DESIGN.md, Playable without Google): no Street View,
 * no photos, and in You hide the hider stays below until the seeker reaches the station.
 */
import type { Dataset } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import { seededRandom } from "./daily.ts";
import {
  applyHiderIntent,
  createHideRound,
  defaultHiderExit,
  type HumanHider,
  hiderExits,
  hiderView,
  STAY_BELOW,
  setHiderExit,
} from "./hider.ts";
import { createSeekerDriver, driveSeeker, rejectSeekerAction } from "./seekerDriver.ts";
import {
  advanceSolo,
  applySoloIntent,
  createSoloRound,
  placeHider,
  type SoloRound,
  soloView,
  stationOnly,
} from "./solo.ts";
import { buildIndex, departures, type TimetableIndex } from "./timetable.ts";

const TEN = 36000;
let ds: Dataset;
let idx: TimetableIndex;
let hub: number;
beforeAll(() => {
  ds = loadDataset();
  idx = buildIndex(ds);
  hub = ds.stations.findIndex((s) => s.id === "127");
});

/** A platform of the round's hiding complex, and one of another complex. */
function platforms(round: SoloRound) {
  const inside = ds.complexes[round.hider]?.stations[0] as number;
  const outside = ds.stations.findIndex((s) => s.complex !== round.hider);
  return { inside, outside };
}

function seekerRound(): SoloRound {
  const round = createSoloRound(idx, { hub, hideStart: TEN, random: seededRandom(3) });
  const c = ds.complexes[round.hider];
  if (!c) throw new Error("no hiding complex");
  return placeHider(round, { lat: c.lat + 0.001, lon: c.lon, pano: "spot-pano" }, idx);
}

const at = (station: number, since: number) =>
  ({ kind: "platform", station, since, arrivedDir: null }) as const;

describe("a seeker round that ends at the station", () => {
  it("has no spot, says so in the view, and refuses photos", () => {
    const off = stationOnly(seekerRound());
    expect(off.spot).toBeNull();
    const v = soloView(off, off.seekStart + 60, idx);
    expect(v.stationOnly).toBe(true);
    expect(v.hasSpot).toBe(false);
    const photo = applySoloIntent(
      off,
      { type: "ask", question: { kind: "photo", from: "exit", look: "N" } },
      off.seekStart + 60,
      idx,
    );
    expect(photo.ok === false && photo.error).toMatch(/Photos are off/);
    // Station questions still work.
    expect(
      applySoloIntent(
        off,
        { type: "ask", question: { kind: "radar", miles: 1 } },
        off.seekStart + 60,
        idx,
      ).ok,
    ).toBe(true);
  });

  it("ends found the moment the seeker stands in the hider's station", () => {
    const off = stationOnly(seekerRound());
    const { inside } = platforms(off);
    const t = off.seekStart + 900;
    const done = advanceSolo({ ...off, seeker: at(inside, t) }, t + 5, idx);
    expect(done.result).toEqual({ kind: "found", at: t });
    expect(done.stationFoundAt).toBe(t);
  });

  it("streetOff mid-round drops the spot, and the hunt carries on to the station", () => {
    const r = seekerRound();
    const t = r.seekStart + 300;
    const out = applySoloIntent(r, { type: "streetOff" }, t, idx);
    if (!out.ok) throw new Error(out.error);
    expect(out.round.spot).toBeNull();
    expect(out.round.stationOnly).toBe(true);
    expect(out.round.result).toBeNull();
    // Asking it again changes nothing.
    const again = applySoloIntent(out.round, { type: "streetOff" }, t + 10, idx);
    expect(again.ok && again.round.result).toBeNull();
  });

  it("streetOff after the station was found ends the round now, found", () => {
    const r = seekerRound();
    const { outside } = platforms(r);
    const found = r.seekStart + 1200;
    const t = r.seekStart + 2000;
    const searching: SoloRound = { ...r, stationFoundAt: found, seeker: at(outside, found + 60) };
    const out = applySoloIntent(searching, { type: "streetOff" }, t, idx);
    if (!out.ok) throw new Error(out.error);
    expect(out.round.result).toEqual({ kind: "found", at: t });
  });
});

/** A You hide round with the hider waiting on a platform of `complex` at 10:20. */
function hiddenBelow(): { round: SoloRound; station: number } {
  const r = createHideRound(idx, { hub, hideStart: TEN, random: seededRandom(12) });
  const station = ds.stations.findIndex((s) => s.id === "132");
  const complex = ds.stations[station]?.complex as number;
  const transit = at(station, r.seekStart);
  let round: SoloRound = {
    ...r,
    hider: complex,
    human: { ...(r.human as HumanHider), station, transit },
    hiderTrail: [
      { t: r.hideStart, state: r.human?.transit as HumanHider["transit"] },
      { t: r.seekStart, state: transit },
    ],
  };
  for (const e of hiderExits(round, idx))
    round = setHiderExit(round, e.exit, { lat: e.lat, lon: e.lon, pano: `exit-${e.exit}` });
  return { round, station };
}

describe("You hide at the station only", () => {
  it("keeps the hider below: no exits, no hide here, no automatic exit at 10:35", () => {
    const { round } = hiddenBelow();
    const off = stationOnly(round);
    const exit = defaultHiderExit(off, idx);
    const tried = applyHiderIntent(off, { type: "exit", exit }, off.seekStart + 30, idx);
    expect(tried.ok === false && tried.error).toBe(STAY_BELOW);
    // Without the rule the hider is brought up at 15 min; at the station only they stay.
    const later = advanceSolo(off, off.seekStart + 20 * 60, idx);
    expect(later.human?.lock).toBeNull();
    expect(later.human?.transit.kind).toBe("platform");
    expect(hiderView(later, off.seekStart + 20 * 60, idx).stationOnly).toBe(true);
    const unlimited = advanceSolo(round, round.seekStart + 20 * 60, idx);
    expect(unlimited.human?.lock?.cause).toBe("latestExit");
  });

  it("is found when the seeker stands in the hider's station", () => {
    const { round, station } = hiddenBelow();
    const off = stationOnly(round);
    const t = off.seekStart + 1500;
    const done = advanceSolo({ ...off, seeker: at(station, t) }, t + 1, idx);
    expect(done.result).toEqual({ kind: "found", at: t });
    const v = hiderView(done, t + 1, idx);
    expect(v.scoreSeconds).toBe(t - off.seekStart + v.bonusSeconds);
  });

  it("streetOff is taken below ground and refused once the hider is up", () => {
    const { round } = hiddenBelow();
    const below = applyHiderIntent(round, { type: "streetOff" }, round.seekStart + 30, idx);
    expect(below.ok && below.round.stationOnly).toBe(true);
    const exit = defaultHiderExit(round, idx);
    const up = applyHiderIntent(round, { type: "exit", exit }, round.seekStart, idx);
    if (!up.ok) throw new Error(up.error);
    const refused = applyHiderIntent(up.round, { type: "streetOff" }, round.seekStart + 200, idx);
    expect(refused.ok).toBe(false);
  });
});

describe("a whole You hide round at the station only", () => {
  it("the bot seeker finds a hider who waits below, without Street View", () => {
    const results: { found: boolean; minutes: number }[] = [];
    for (const [n, hubId] of ["127", "631", "R20", "A41"].entries()) {
      const start = ds.stations.findIndex((s) => s.id === hubId);
      let round = stationOnly(
        createHideRound(idx, { hub: start, hideStart: TEN, random: seededRandom(40 + n) }),
      );
      // Ride the first train that calls somewhere else before 10:20, and stay on it.
      const train = departures(idx, start, TEN, { horizon: 600 }).find((d) => {
        const trip = ds.trips[d.trip];
        return (trip?.arr[d.stop + 1] ?? Number.POSITIVE_INFINITY) < round.seekStart;
      });
      if (!train) throw new Error(`no train from ${hubId}`);
      const board = applyHiderIntent(
        round,
        { type: "board", trip: train.trip, stop: train.stop },
        TEN,
        idx,
      );
      if (!board.ok) throw new Error(board.error);
      round = advanceSolo(board.round, round.seekStart, idx);
      let driver = createSeekerDriver();
      for (let t = round.seekStart; t <= round.seekEnd && !round.result; t += 6) {
        round = advanceSolo(round, t, idx);
        if (round.result) break;
        const view = soloView(round, t, idx);
        const step = driveSeeker(view, driver, t, idx, 6);
        driver = step.driver;
        if (!step.intent) continue;
        // No Street View: the server can't find a panorama for a street walk.
        const out =
          step.intent.type === "walkTo"
            ? ({ ok: false, error: "No street panorama" } as const)
            : applySoloIntent(round, step.intent, t, idx);
        if (out.ok) round = out.round;
        else driver = rejectSeekerAction(driver, view, step.intent, out.error, t, idx);
      }
      round = advanceSolo(round, round.seekEnd, idx);
      expect(round.result).not.toBeNull();
      expect(round.human?.lock).toBeNull();
      results.push({
        found: round.result?.kind === "found",
        minutes: ((round.result?.at ?? 0) - round.seekStart) / 60,
      });
    }
    // Every round finishes; the seeker reaches the station in most of them.
    expect(results.filter((r) => r.found).length).toBeGreaterThanOrEqual(3);
  }, 60_000);
});
