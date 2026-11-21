import type { Dataset } from "@subway-seek/data";
import { loadDataset } from "@subway-seek/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import { seededRandom } from "./daily.ts";
import { distanceMeters, offsetMeters } from "./geo.ts";
import { filterCandidates } from "./questions.ts";
import { possibleSpots, walkedBy } from "./search.ts";
import {
  advanceSolo,
  applySoloIntent,
  bonusSeconds,
  createSoloRound,
  firstWithin,
  footpathOf,
  type HidingSpot,
  placeHider,
  type SoloIntent,
  type SoloRound,
  soloView,
} from "./solo.ts";
import { buildIndex, type TimetableIndex } from "./timetable.ts";
import { type OnStreet, resolve } from "./transit.ts";

const TEN = 10 * 3600;
let ds: Dataset;
let idx: TimetableIndex;
let round: SoloRound;
let spot: HidingSpot;

/** A point `east` m east and `north` m north of p. */
const offset = (p: { lat: number; lon: number }, east: number, north = 0) =>
  offsetMeters(p, east, north);

beforeAll(() => {
  ds = loadDataset();
  idx = buildIndex(ds);
  const hub = ds.stations.findIndex((s) => s.id === "127");
  const base = createSoloRound(idx, { hub, hideStart: TEN, random: seededRandom(11) });
  const c = ds.complexes[base.hider];
  if (!c) throw new Error("complex");
  spot = { ...offset(c, 150), pano: "spot-pano" };
  round = placeHider(base, spot, idx);
});

/** The round with the seeker standing on the street at `p` (at the hider's station). */
const standingAt = (p: { lat: number; lon: number }, t: number, complex?: number): SoloRound => {
  const seeker: OnStreet = {
    kind: "street",
    complex: complex ?? round.hider,
    exit: 0,
    at: p,
    since: t,
  };
  return { ...round, seeker, seekerTrail: [...round.seekerTrail, { t, state: seeker }] };
};
const apply = (r: SoloRound, intent: SoloIntent, t: number) => {
  const res = applySoloIntent(r, intent, t, idx);
  if (!res.ok) throw new Error(res.error);
  return res.round;
};

describe("walking past the hider", () => {
  it("finds where a straight walk first comes within range", () => {
    // Along a line 30 m north of p: in range 25.7 m before passing it.
    const p = { lat: 40.75, lon: -73.99 };
    const a = offset(p, -150, 30);
    const b = offset(p, 150, 30);
    const f = firstWithin([a.lat, a.lon], [b.lat, b.lon], p, 39.5);
    expect(f).toBeCloseTo((150 - Math.sqrt(39.5 ** 2 - 30 ** 2)) / 300, 3);
    // Starting in range, or never coming close: no stop.
    expect(firstWithin([p.lat, p.lon], [b.lat, b.lon], p, 39.5)).toBeNull();
    const c = offset(p, -150, 80);
    const d = offset(p, 150, 80);
    expect(firstWithin([c.lat, c.lon], [d.lat, d.lon], p, 39.5)).toBeNull();
  });

  it("stops the walk where they come into view, and shows them", () => {
    const t = round.seekStart + 1200;
    const r = standingAt(offset(spot, -150, 30), t);
    const walking = apply(r, { type: "walkTo", ...offset(spot, 150, 30) }, t);
    const s = walking.seeker;
    if (s.kind !== "walking") throw new Error("expected a walk");
    expect(advanceSolo(walking, t + 30, idx).seeker.kind).toBe("walking");
    const stopped = advanceSolo(walking, s.end, idx);
    const at = resolve(stopped.seeker, s.end, idx);
    if (at.kind !== "street" || !at.at) throw new Error("expected to stand on the street");
    expect(distanceMeters(at.at, spot)).toBeCloseTo(39.5, 0);
    expect(at.since).toBeLessThan(s.end);
    expect(soloView(stopped, s.end, idx).spotNearby).not.toBeNull();
    // The replay knows where you stopped.
    expect(stopped.seekerTrail.at(-1)?.state).toEqual(at);
  });

  it("lets you walk up to them once they're in sight, to catch them", () => {
    const t = round.seekStart + 1200;
    // Where the last walk stopped can land a rounding error outside 39.5 m.
    const r = standingAt(offset(spot, -39.50001), t);
    const walking = apply(r, { type: "walkTo", lat: spot.lat, lon: spot.lon }, t);
    const s = walking.seeker;
    if (s.kind !== "walking") throw new Error("expected a walk");
    const there = advanceSolo(walking, s.end, idx);
    const at = resolve(there.seeker, s.end, idx);
    expect(at.kind === "street" && distanceMeters(at.at ?? spot, spot)).toBeCloseTo(0, 3);
    expect(applySoloIntent(there, { type: "catch" }, s.end, idx).ok).toBe(true);
  });

  it("doesn't stop you walking away from a marker you can already see", () => {
    const t = round.seekStart + 1200;
    const walking = apply(
      standingAt(offset(spot, -20), t),
      { type: "walkTo", ...offset(spot, -220) },
      t,
    );
    const s = walking.seeker;
    if (s.kind !== "walking") throw new Error("expected a walk");
    const done = advanceSolo(walking, s.end + 1, idx);
    const at = resolve(done.seeker, s.end + 1, idx);
    expect(at.kind === "street" && distanceMeters(at.at ?? spot, spot)).toBeCloseTo(220, 0);
  });

  it("records walks as a footpath, cut short where they stopped", () => {
    const t = round.seekStart + 1200;
    const walking = apply(
      standingAt(offset(spot, -150, 30), t),
      { type: "walkTo", ...offset(spot, 150, 30) },
      t,
    );
    const s = walking.seeker;
    if (s.kind !== "walking") throw new Error("expected a walk");
    const stopped = advanceSolo(walking, s.end, idx);
    const path = footpathOf(stopped.seekerTrail);
    const walk = path.find((p) => p.start === t && p.a !== p.b);
    if (!walk) throw new Error("no walk in the footpath");
    expect(distanceMeters({ lat: walk.b[0], lon: walk.b[1] }, spot)).toBeCloseTo(39.5, 0);
    // Half way through the walk, only the first half counts as walked.
    const half = walkedBy([walk], (walk.start + walk.end) / 2)[0];
    expect(
      half &&
        distanceMeters({ lat: half.b[0], lon: half.b[1] }, { lat: walk.a[0], lon: walk.a[1] }),
    ).toBeCloseTo(
      distanceMeters({ lat: walk.b[0], lon: walk.b[1] }, { lat: walk.a[0], lon: walk.a[1] }) / 2,
      0,
    );
  });
});

describe("on-foot questions", () => {
  it("only on the street, about the exact spot, cheap, and without the gap", () => {
    const t = round.seekStart + 1200;
    const onPlatform: SoloRound = {
      ...round,
      seeker: {
        kind: "platform",
        station: ds.complexes[round.hider]?.stations[0] as number,
        since: t,
        arrivedDir: null,
      },
    };
    const radar = { type: "ask" as const, question: { kind: "spotRadar" as const, meters: 100 } };
    expect(applySoloIntent(onPlatform, radar, t, idx)).toMatchObject({ ok: false });

    // A station question first: on-foot questions don't wait out the 5-min gap.
    const r = apply(
      standingAt(offset(spot, -80), t),
      { type: "ask", question: { kind: "radar", miles: 1 } },
      t,
    );
    const asked = apply(r, radar, t + 10);
    expect(asked.asked.at(-1)?.answer).toBe(true);
    expect(bonusSeconds(asked) - bonusSeconds(r)).toBe(3 * 60);
    const again = applySoloIntent(
      asked,
      { type: "ask", question: { kind: "spotRadar", meters: 50 } },
      t + 20,
      idx,
    );
    expect(again.ok).toBe(false); // the on-foot cooldown
  });

  it("answers 'Not near you' from far away, and rules out the stations near you", () => {
    const t = round.seekStart + 1200;
    const hub = ds.complexes[ds.stations[round.hub]?.complex as number];
    if (!hub) throw new Error("hub");
    const far = apply(
      standingAt(hub, t, ds.stations[round.hub]?.complex),
      { type: "ask", question: { kind: "spotRadar", meters: 200 } },
      t,
    );
    expect(far.asked.at(-1)?.answer).toBe("far");
    const view = soloView(far, t, idx);
    expect(view.candidates).toContain(round.hider);
    for (const c of view.candidates) {
      expect(distanceMeters(ds.complexes[c] as { lat: number; lon: number }, hub)).toBeGreaterThan(
        190,
      );
    }
  });

  it("answer at once, and their count doesn't give away a station answer still in its window", () => {
    const t = round.seekStart + 1200;
    const r = standingAt(offset(spot, -60, 20), t);
    const radar = apply(r, { type: "ask", question: { kind: "radar", miles: 0.25 } }, t);
    const foot = apply(
      radar,
      { type: "ask", question: { kind: "spotRadar", meters: 100 } },
      t + 10,
    );
    const entry = foot.asked.at(-1);
    if (!entry) throw new Error("asked");
    expect(entry.answerAt).toBe(t + 10);
    // Counted without the radar, whose answer lands later.
    expect(entry.remaining).toBe(filterCandidates(ds, round.reachable, [entry]).length);
    expect(entry.remaining).toBeGreaterThan(
      filterCandidates(ds, round.reachable, foot.asked).length,
    );
    const view = soloView(foot, t + 10, idx);
    expect(view.asked.map((a) => a.answer === null)).toEqual([true, false]);
    expect(view.candidates).toHaveLength(entry.remaining);
  });

  it("walking hotter/colder: start it, walk 30 m, then read it", () => {
    const t = round.seekStart + 1200;
    const thermo = { type: "ask" as const, question: { kind: "spotThermometer" as const } };
    const r = standingAt(offset(spot, -200), t);
    expect(applySoloIntent(r, thermo, t, idx)).toMatchObject({ ok: false });
    const started = apply(r, { type: "startFootThermometer" }, t);
    const nudged = {
      ...started,
      seeker: { ...(started.seeker as OnStreet), at: offset(spot, -190) },
    };
    expect(applySoloIntent(nudged, thermo, t + 60, idx)).toMatchObject({ ok: false });
    const closer = {
      ...started,
      seeker: { ...(started.seeker as OnStreet), at: offset(spot, -150) },
    };
    expect(apply(closer, thermo, t + 60).asked.at(-1)?.answer).toBe("hotter");
  });
});

describe("the search area", () => {
  it("shades what fits every answer and hasn't been seen, and never loses the spot", () => {
    const t = round.seekStart + 1200;
    const c = ds.complexes[round.hider];
    if (!c) throw new Error("complex");
    const from = offset(spot, -60, 20);
    const r = apply(
      standingAt(from, t),
      { type: "ask", question: { kind: "spotRadar", meters: 100 } },
      t,
    );
    const view = soloView(r, t, idx);
    const area = possibleSpots(ds, c, view.asked, view.candidates, view.footpath, t);
    expect(area.length).toBeGreaterThan(50);
    for (const p of area) {
      expect(distanceMeters(p, from)).toBeLessThanOrEqual(101); // the radar said yes
      expect(distanceMeters(p, from)).toBeGreaterThan(38); // you'd see anything closer
    }
    expect(Math.min(...area.map((p) => distanceMeters(p, spot)))).toBeLessThan(8);
  });
});
