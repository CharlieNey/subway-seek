import type { Dataset } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import { seededRandom } from "./daily.ts";
import { distanceMeters, offsetMeters } from "./geo.ts";
import { Geometry } from "./geometry.ts";
import {
  advanceSolo,
  applySoloIntent,
  bonusSeconds,
  createSoloRound,
  type HidingSpot,
  placeHider,
  type SoloRound,
  soloView,
} from "./solo.ts";
import { buildIndex, type TimetableIndex } from "./timetable.ts";
import { trailPosition } from "./trail.ts";
import {
  applyIntent,
  ENTER_SECONDS,
  type OnStreet,
  resolve,
  WALK_DETOUR,
  WALK_MPS,
} from "./transit.ts";

const TEN = 10 * 3600;
let ds: Dataset;
let idx: TimetableIndex;
let hub: number;

beforeAll(() => {
  ds = loadDataset();
  idx = buildIndex(ds);
  hub = ds.stations.findIndex((s) => s.id === "127");
});

/** A point `m` meters east of (lat, lon). */
const east = (lat: number, lon: number, m: number) => offsetMeters({ lat, lon }, m, 0);

function onStreetAt(complex: number, t: number): OnStreet {
  return { kind: "street", complex, exit: 0, since: t };
}

describe("walking on the street", () => {
  it("walks at 1.4 m/s with a street detour, then stands at the target", () => {
    const complex = ds.stations[hub]?.complex as number;
    const start = onStreetAt(complex, TEN);
    const [lat, lon] = ds.complexes[complex]?.exits[0] ?? [0, 0];
    const target = east(lat, lon, 200);
    const r = applyIntent(start, { type: "walkTo", ...target, pano: "p1" }, TEN, idx);
    if (!r.ok) throw new Error(r.error);
    const arrive = TEN + (200 * WALK_DETOUR) / WALK_MPS;
    expect(resolve(r.state, arrive - 1, idx).kind).toBe("walking");
    const there = resolve(r.state, arrive + 1, idx);
    expect(there.kind === "street" && there.at?.pano).toBe("p1");
  });

  it("won't walk further than 600 m from the station", () => {
    const complex = ds.stations[hub]?.complex as number;
    const c = ds.complexes[complex];
    if (!c) throw new Error("complex");
    const far = east(c.lat, c.lon, 900);
    expect(applyIntent(onStreetAt(complex, TEN), { type: "walkTo", ...far }, TEN, idx).ok).toBe(
      false,
    );
  });

  it("walks back to the nearest exit before going down", () => {
    const complex = ds.stations[hub]?.complex as number;
    const c = ds.complexes[complex];
    if (!c) throw new Error("complex");
    const away: OnStreet = { ...onStreetAt(complex, TEN), at: east(c.lat, c.lon, 300) };
    const r = applyIntent(away, { type: "enter", station: hub }, TEN, idx);
    if (!r.ok) throw new Error(r.error);
    if (r.state.kind !== "walking") throw new Error("expected walking");
    const nearest = Math.min(
      ...c.exits.map(([lat, lon]) => distanceMeters({ lat, lon }, away.at ?? c)),
    );
    expect(r.state.end - TEN).toBeCloseTo((nearest * WALK_DETOUR) / WALK_MPS + ENTER_SECONDS, 3);
  });
});

describe("the Street View endgame", () => {
  let round: SoloRound;
  let spot: HidingSpot;

  beforeAll(() => {
    const base = createSoloRound(idx, { hub, hideStart: TEN, random: seededRandom(11) });
    const c = ds.complexes[base.hider];
    if (!c) throw new Error("complex");
    spot = { ...east(c.lat, c.lon, 150), pano: "spot-pano" };
    round = placeHider(base, spot, idx);
  });

  it("walks the bot from its station to the spot in the replay", () => {
    const geo = new Geometry(idx);
    const end = round.hiderTrail.at(-1)?.state;
    if (end?.kind !== "walking") throw new Error("expected a final walk");
    const p = trailPosition(geo, round.hiderTrail, end.end + 60);
    expect(p && distanceMeters({ lat: p[1], lon: p[0] }, spot)).toBeLessThan(1);
  });

  it("finding the station starts the endgame instead of ending the round", () => {
    const c = ds.complexes[round.hider];
    if (!c) throw new Error("complex");
    const station = c.stations[0] as number;
    const atStation: SoloRound = {
      ...round,
      seeker: { kind: "platform", station, since: round.seekStart + 600, arrivedDir: null },
    };
    const r = advanceSolo(atStation, round.seekStart + 700, idx);
    expect(r.stationFoundAt).toBe(round.seekStart + 600); // recorded (server-side)
    expect(r.result).toBeNull();
  });

  it("changes nothing the seeker sees when they reach the hider's station", () => {
    // The server pushes a frame only when the seeker's view changes, so the view must not
    // change here, or the frame's arrival alone would say "right station".
    const c = ds.complexes[round.hider];
    if (!c) throw new Error("complex");
    const t = round.seekStart + 700;
    const atStation: SoloRound = {
      ...round,
      seeker: {
        kind: "platform",
        station: c.stations[0] as number,
        since: round.seekStart + 600,
        arrivedDir: null,
      },
    };
    const found = advanceSolo(atStation, t, idx);
    expect(found.stationFoundAt).not.toBeNull();
    expect(soloView(found, t, idx)).toEqual(soloView(atStation, t, idx));
  });

  it("reveals the marker within 40 m and only catches within 25 m", () => {
    const t = round.seekStart + 1200;
    const at = (m: number): SoloRound => ({
      ...round,
      seeker: { ...onStreetAt(round.hider, t), at: east(spot.lat, spot.lon, m) },
    });
    expect(soloView(at(80), t, idx).spotNearby).toBeNull();
    expect(applySoloIntent(at(80), { type: "catch" }, t, idx).ok).toBe(false);
    expect(soloView(at(35), t, idx).spotNearby).not.toBeNull();
    expect(applySoloIntent(at(35), { type: "catch" }, t, idx).ok).toBe(false);
    const caught = applySoloIntent(at(10), { type: "catch" }, t, idx);
    if (!caught.ok) throw new Error(caught.error);
    expect(caught.round.result).toEqual({ kind: "found", at: t });
  });

  it("reveals the hider when any round ends, a daily given up included", () => {
    // Reversed 2026-10-07: the reveal is the reward for trying. The give-up-and-replay
    // exploit is left to the honor system until results live on a server.
    const daily: SoloRound = { ...round, mode: "daily", daily: { date: "2026-10-06", number: 2 } };
    const t = round.seekStart + 1200;
    const shown = (r: SoloRound) => {
      const v = soloView(r, t, idx);
      return { hider: v.hider, trail: v.replay?.hider, spot: v.spotNearby };
    };
    const gaveUp = applySoloIntent(daily, { type: "giveUp" }, t, idx);
    if (!gaveUp.ok) throw new Error(gaveUp.error);
    expect(shown(gaveUp.round)).toEqual({
      hider: round.hider,
      trail: daily.hiderTrail,
      spot: { lat: spot.lat, lon: spot.lon },
    });
    expect(soloView(gaveUp.round, t, idx).replay?.seeker).toEqual(daily.seekerTrail);
    // Time's up reveals it too.
    expect(shown(advanceSolo(daily, daily.seekEnd, idx))).toEqual(shown(gaveUp.round));
    // Still secret while the round is on.
    expect(soloView(daily, t, idx).hider).toBeNull();
    expect(soloView(daily, t, idx).replay).toBeNull();
    // Found, or a practice round given up: everything shows.
    const near: SoloRound = {
      ...daily,
      seeker: { ...onStreetAt(round.hider, t), at: east(spot.lat, spot.lon, 10) },
    };
    const caught = applySoloIntent(near, { type: "catch" }, t, idx);
    if (!caught.ok) throw new Error(caught.error);
    expect(soloView(caught.round, t, idx).hider).toBe(round.hider);
    const practice = applySoloIntent(round, { type: "giveUp" }, t, idx);
    if (!practice.ok) throw new Error(practice.error);
    expect(soloView(practice.round, t, idx).hider).toBe(round.hider);
    expect(soloView(practice.round, t, idx).spotNearby).not.toBeNull();
  });

  it("walks past the 600 m radius only toward a hider in sight", () => {
    const t = round.seekStart + 1200;
    const c = ds.complexes[round.hider];
    if (!c) throw new Error("complex");
    // The spot lies in a neighbour's zone, 620 m from the station the seeker came up at.
    const farSpot: HidingSpot = { ...east(c.lat, c.lon, 620), pano: "far-pano" };
    const far: SoloRound = { ...round, spot: farSpot };
    const standing = (m: number): SoloRound => ({
      ...far,
      seeker: { ...onStreetAt(round.hider, t), at: east(c.lat, c.lon, m) },
    });
    const walk = (r: SoloRound, m: number) =>
      applySoloIntent(r, { type: "walkTo", ...east(c.lat, c.lon, m) }, t, idx);
    // Out of sight at 500 m: the radius holds.
    expect(walk(standing(500), 620).ok).toBe(false);
    // In sight at 590 m: a walk to them, or to within 40 m of them, is allowed...
    expect(soloView(standing(590), t, idx).spotNearby).not.toBeNull();
    expect(walk(standing(590), 620).ok).toBe(true);
    expect(walk(standing(590), 650).ok).toBe(true);
    // ...but not anywhere else past the radius.
    expect(walk(standing(590), 700).ok).toBe(false);
  });

  it("dates the hunt's end from coming up when the catch is from a neighbour's street", () => {
    const t = round.seekStart + 1500;
    const neighbour = ds.complexes.findIndex((c, i) => i !== round.hider && c.exits.length > 0);
    const caught = (seeker: OnStreet) =>
      applySoloIntent({ ...round, seeker, stationFoundAt: null }, { type: "catch" }, t, idx);
    const here = { ...onStreetAt(neighbour, t), at: east(spot.lat, spot.lon, 10) };
    const dated = caught({ ...here, up: t - 300 });
    if (!dated.ok) throw new Error(dated.error);
    expect(dated.round.stationFoundAt).toBe(t - 300);
    // An older state without the time they came up falls back to when they last stopped.
    const undated = caught({ ...here, since: t - 120 });
    if (!undated.ok) throw new Error(undated.error);
    expect(undated.round.stationFoundAt).toBe(t - 120);
    // Standing in the hider's own station, the time it was reached stays.
    const own = applySoloIntent(
      { ...round, seeker: { ...onStreetAt(round.hider, t), at: east(spot.lat, spot.lon, 10) } },
      { type: "catch" },
      t,
      idx,
    );
    if (!own.ok) throw new Error(own.error);
    expect(own.round.stationFoundAt).toBe(t);
  });

  it("can't catch while still walking", () => {
    const t = round.seekStart + 1200;
    const walking: SoloRound = {
      ...round,
      seeker: {
        kind: "walking",
        reason: "street",
        start: t - 10,
        end: t + 60,
        fromPoint: [spot.lat, spot.lon],
        toPoint: [spot.lat + 0.001, spot.lon],
        fromComplex: round.hider,
        dest: { ...onStreetAt(round.hider, t + 60), at: { lat: spot.lat + 0.001, lon: spot.lon } },
      },
    };
    expect(applySoloIntent(walking, { type: "catch" }, t, idx).ok).toBe(false);
  });
});

describe("photo questions", () => {
  const ask = (round: SoloRound, from: "exit" | "spot", t: number) =>
    applySoloIntent(round, { type: "ask", question: { kind: "photo", from, look: "N" } }, t, idx);

  it("answers from the station exit with a camera looking the asked way, without narrowing", () => {
    const base = createSoloRound(idx, { hub, hideStart: TEN, random: seededRandom(4) });
    const round: SoloRound = { ...base, photoExit: "exit-pano" };
    const r = ask(round, "exit", round.seekStart);
    if (!r.ok) throw new Error(r.error);
    const a = r.round.asked[0];
    expect(a?.answer).toEqual({ photo: { pano: "exit-pano", heading: 0, pitch: 5, fov: 90 } });
    expect(a?.remaining).toBe(round.reachable.length);
    expect(bonusSeconds(r.round)).toBe(15 * 60);
  });

  it("opens photos from the hiding spot 15 minutes into the round", () => {
    const base = createSoloRound(idx, { hub, hideStart: TEN, random: seededRandom(4) });
    const c = ds.complexes[base.hider];
    if (!c) throw new Error("complex");
    const round = placeHider(base, { ...east(c.lat, c.lon, 100), pano: "spot-pano" }, idx);
    expect(ask(round, "spot", round.seekStart + 60).ok).toBe(false);
    const r = ask(round, "spot", round.seekStart + 15 * 60);
    if (!r.ok) throw new Error(r.error);
    expect(r.round.asked[0]?.answer).toMatchObject({ photo: { pano: "spot-pano" } });
  });

  it("has no photo when the round has no exit panorama", () => {
    const round = createSoloRound(idx, { hub, hideStart: TEN, random: seededRandom(4) });
    expect(ask(round, "exit", round.seekStart).ok).toBe(false);
  });
});
