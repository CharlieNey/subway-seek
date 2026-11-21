import type { Dataset } from "@subway-seek/data";
import { loadDataset } from "@subway-seek/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import { WRONG_WAY_MAX_SECONDS } from "./cards.ts";
import { seededRandom } from "./daily.ts";
import { distanceMeters, offsetMeters } from "./geo.ts";
import {
  applyHiderIntent,
  createHideRound,
  defaultHiderExit,
  firstZoneEntry,
  type HiderIntent,
  type HumanHider,
  hiderExits,
  hiderView,
  setHiderExit,
} from "./hider.ts";
import { possibleSpots, publicZoneEntryAt } from "./search.ts";
import {
  advanceSolo,
  applySoloIntent,
  type HidingSpot,
  type SoloIntent,
  type SoloRound,
  soloView,
} from "./solo.ts";
import { buildIndex, departures, type TimetableIndex } from "./timetable.ts";
import { lastStation } from "./transit.ts";

const TEN = 36000;
let ds: Dataset;
let idx: TimetableIndex;
let hub: number;
let station: number;
let complex: number;
beforeAll(() => {
  ds = loadDataset();
  idx = buildIndex(ds);
  hub = ds.stations.findIndex((s) => s.id === "127");
  station = ds.stations.findIndex((s) => s.id === "132");
  complex = ds.stations[station]?.complex as number;
});
const fresh = () => createHideRound(idx, { hub, hideStart: TEN, random: seededRandom(12) });
const h = (r: SoloRound, intent: HiderIntent, t: number) => {
  const out = applyHiderIntent(r, intent, t, idx);
  if (!out.ok) throw new Error(out.error);
  return out.round;
};
const s = (r: SoloRound, intent: SoloIntent, t: number) => {
  const out = applySoloIntent(r, intent, t, idx);
  if (!out.ok) throw new Error(out.error);
  return out.round;
};
function underground() {
  const r = fresh();
  const transit = { kind: "platform" as const, station, since: r.seekStart, arrivedDir: null };
  let next: SoloRound = {
    ...r,
    hider: complex,
    human: { ...(r.human as HumanHider), station, transit },
    hiderTrail: [
      { t: r.hideStart, state: r.human?.transit as HumanHider["transit"] },
      { t: r.seekStart, state: transit },
    ],
  };
  for (const e of hiderExits(next, idx))
    next = setHiderExit(next, e.exit, { lat: e.lat, lon: e.lon, pano: `exit-${e.exit}` });
  return next;
}
function street() {
  let r = underground();
  const exit = defaultHiderExit(r, idx);
  r = h(r, { type: "exit", exit }, r.seekStart);
  return advanceSolo(r, r.seekStart + 120, idx);
}
function locked() {
  const r = street();
  const spot = hiderView(r, r.seekStart + 120, idx).spot as HidingSpot;
  return h(r, { type: "hideHere", ...spot }, r.seekStart + 120);
}
const radar = { type: "ask" as const, question: { kind: "radar" as const, miles: 1 } };

describe("played hide", () => {
  it("starts at 10:00 with an empty hand and no chosen station, and does not mutate its input", () => {
    const r = fresh();
    const before = structuredClone(r);
    const v = hiderView(r, TEN, idx);
    expect(v.station).toBeNull();
    expect(v.hand).toEqual([]);
    expect(v.deckSize).toBe(31);
    expect(v.self).toMatchObject({ kind: "platform", station: hub });
    expect(v.hideStatus).toBe("changing");
    expect(r).toEqual(before);
    expect(applySoloIntent(r, radar, TEN, idx).ok).toBe(false);
    expect(applyHiderIntent(r, { type: "exit", exit: 0 }, TEN, idx).ok).toBe(false);
  });
  it("ends a deadline ride at its last called platform, preserving the actual trail", () => {
    let r = fresh();
    const d = departures(idx, hub, TEN, { horizon: 300 }).find((d) => d.dir === 1);
    if (!d) throw new Error("train");
    r = h(r, { type: "board", trip: d.trip, stop: d.stop }, TEN);
    const last = lastStation(r.human?.transit as HumanHider["transit"], r.seekStart, idx);
    const done = advanceSolo(r, r.seekStart, idx);
    expect(done.human?.station).toBe(last);
    expect(done.reachable).toContain(done.hider);
    expect(done.human?.transit).toMatchObject({
      kind: "platform",
      station: last,
      since: r.seekStart,
    });
    expect(done.hiderTrail[1]?.state).toMatchObject({ kind: "train", trip: d.trip });
    expect(done.hiderTrail.at(-1)?.t).toBe(r.seekStart);
  });
  it("counts an arrival exactly at the deadline as the last called stop", () => {
    let r = fresh();
    const d = departures(idx, hub, TEN, { horizon: 300 }).find((d) => d.dir === 1);
    if (!d) throw new Error("train");
    r = h(r, { type: "board", trip: d.trip, stop: d.stop }, TEN);
    const trip = ds.trips[d.trip];
    const at = trip?.arr[d.stop + 1] as number;
    r = { ...r, seekStart: at };
    expect(advanceSolo(r, at, idx).human?.station).toBe(trip?.stops[d.stop + 1]);
  });
  it("a queued departure still counts as changing trains", () => {
    let r = fresh();
    const d = departures(idx, hub, TEN + 120, { horizon: 300 })[0];
    if (!d) throw new Error("train");
    r = h(r, { type: "board", trip: d.trip, stop: d.stop }, TEN);
    expect(hiderView(r, TEN, idx).hideStatus).toBe("changing");
    expect(hiderView(r, d.dep, idx).hideStatus).toBe("riding");
  });
  it("staying at the starting complex ends incomplete without extending the hide", () => {
    const r = fresh();
    const end = advanceSolo(r, r.seekStart + 30, idx);
    expect(end.result).toEqual({ kind: "gaveUp", at: r.seekStart });
    expect(end.human?.incomplete).toBe("start");
  });
  it("refuses a transfer that crosses the deadline", () => {
    const r = fresh();
    const link = idx.transfersFrom[hub]?.[0];
    if (!link) throw new Error("transfer");
    expect(
      applyHiderIntent(r, { type: "transfer", to: link.to }, r.seekStart - 1, idx),
    ).toMatchObject({ ok: false, error: "That transfer arrives after 10:20." });
  });
  it("refuses exits until exactly 10:20, even with verified exit metadata", () => {
    const r = underground();
    const exit = defaultHiderExit(r, idx);
    expect(applyHiderIntent(r, { type: "exit", exit }, r.seekStart - 1, idx)).toEqual({
      ok: false,
      error: "Exits open at 10:20.",
    });
    expect(applyHiderIntent(r, { type: "exit", exit }, r.seekStart, idx).ok).toBe(true);
  });
  it("refuses all seeker intents before 10:20 without changing the round", () => {
    const r = fresh();
    const before = structuredClone(r);
    const intents: SoloIntent[] = [
      radar,
      { type: "startThermometer" },
      { type: "startFootThermometer" },
      { type: "board", trip: 0, stop: 0 },
      { type: "cancelBoard" },
      { type: "alightAt", stop: 1 },
      { type: "transfer", to: station },
      { type: "exit", exit: 0 },
      { type: "enter", station },
      { type: "walkTo", lat: 40.7, lon: -74, pano: "next" },
      { type: "giveUp" },
    ];
    for (const intent of intents)
      expect(applySoloIntent(r, intent, r.seekStart - 1, idx)).toEqual({
        ok: false,
        error: "Trains open at 10:20.",
      });
    expect(r).toEqual(before);
  });
  it("reaching the station underground does not catch a street hider before a lock", () => {
    const r = street();
    const now = r.seekStart + 180;
    const seeker = { kind: "platform" as const, station, since: now, arrivedDir: null };
    expect(
      advanceSolo(
        { ...r, seeker, seekerTrail: [...r.seekerTrail, { t: now, state: seeker }] },
        now,
        idx,
      ).result,
    ).toBeNull();
    expect(soloView(r, now, idx).hasSpot).toBe(true);
  });
  it("permits zone walks and rejects outside points, boarding and re-entry", () => {
    const r = street();
    const t = r.seekStart + 130;
    const c = ds.complexes[complex] as { lat: number; lon: number };
    expect(
      applyHiderIntent(r, { type: "walkTo", ...offsetMeters(c, 399, 0), pano: "inside" }, t, idx)
        .ok,
    ).toBe(true);
    expect(
      applyHiderIntent(r, { type: "walkTo", ...offsetMeters(c, 401, 0), pano: "outside" }, t, idx)
        .ok,
    ).toBe(false);
    expect(applyHiderIntent(r, { type: "enter", station }, t, idx).ok).toBe(false);
  });
  it("locks only the current verified panorama and refuses every later move", () => {
    let r = street();
    const t = r.seekStart + 130;
    const p = hiderView(r, t, idx).spot as HidingSpot;
    expect(applyHiderIntent(r, { type: "hideHere", ...p, pano: "somewhere-else" }, t, idx).ok).toBe(
      false,
    );
    r = h(r, { type: "hideHere", ...p }, t);
    expect(r.spot).toEqual(p);
    expect(r.human?.lock).toEqual({ at: t, cause: "hideHere" });
    expect(applyHiderIntent(r, { type: "walkTo", ...p }, t + 1, idx).ok).toBe(false);
  });
  it("keeps an exit walk crossing 10:35 on its chosen stairs without relocation", () => {
    let r = underground();
    const latest = r.seekStart + 900;
    const nearest = defaultHiderExit(r, idx);
    const exit = hiderExits(r, idx).find((e) => e.allowed && e.exit !== nearest)?.exit ?? nearest;
    r = h(r, { type: "exit", exit }, latest - 30);
    const stairs = r.human?.transit;
    if (stairs?.kind !== "walking") throw new Error("stairs");
    const during = advanceSolo(r, latest + 1, idx);
    expect(during.human?.transit).toEqual(stairs);
    expect(during.human?.lock).toBeNull();
    expect(during.result).toBeNull();
    const arrived = advanceSolo(during, stairs.end + 1, idx);
    expect(hiderView(arrived, stairs.end + 1, idx).spot).toEqual(r.human?.exits[exit]);
    expect(arrived.human?.lock).toBeNull();
  });
  it("defers a zone-entry freeze on the stairs until the chosen exit arrival", () => {
    let r = underground();
    const exit = defaultHiderExit(r, idx);
    const start = r.seekStart + 300;
    r = h(r, { type: "exit", exit }, start);
    const stairs = r.human?.transit;
    if (stairs?.kind !== "walking") throw new Error("stairs");
    const at = start + 45;
    const point = ds.complexes[complex] as { lat: number; lon: number };
    const seeker = { kind: "street" as const, complex, exit, since: at, at: point };
    r = { ...r, seeker, seekerTrail: [...r.seekerTrail, { t: at, state: seeker }] };
    const during = advanceSolo(r, at + 1, idx);
    expect(during.result).toBeNull();
    expect(during.human?.transit).toEqual(stairs);
    expect(during.human?.lock).toBeNull();
    expect(during.human?.entered?.at).toBe(at);
    for (const initial of [r, during]) {
      const arrived = advanceSolo(initial, stairs.end + 1, idx);
      expect(arrived.result).toBeNull();
      expect(arrived.human?.lock).toEqual({ cause: "zone", at: stairs.end });
      expect(arrived.spot).toEqual(r.human?.exits[exit]);
      expect(
        applyHiderIntent(arrived, { type: "walkTo", ...point, pano: "next" }, stairs.end + 2, idx)
          .ok,
      ).toBe(false);
    }
  });
  it("forces the nearest platform exit and freezes at 10:35, even across a long advance", () => {
    const r = underground();
    const at = r.seekStart + 900;
    const exit = defaultHiderExit(r, idx);
    const done = advanceSolo(r, at + 150, idx);
    expect(done.spot).toEqual(r.human?.exits[exit]);
    expect(done.human?.lock).toEqual({ at, cause: "latestExit" });
    expect(done.human?.transit).toMatchObject({ kind: "street", exit, since: at });
  });
  it("catches an underground hider at the actual seeker exit time", () => {
    let r = underground();
    const at = r.seekStart + 120;
    const e = hiderExits(r, idx).find((e) => e.allowed);
    if (!e) throw new Error("exit");
    const state = {
      kind: "walking" as const,
      reason: "exit" as const,
      start: at - 120,
      end: at,
      fromPoint: [e.lat, e.lon] as [number, number],
      toPoint: [e.lat, e.lon] as [number, number],
      fromComplex: complex,
      dest: { kind: "street" as const, complex, exit: e.exit, since: at },
    };
    r = { ...r, seeker: state, seekerTrail: [...r.seekerTrail, { t: at - 120, state }] };
    const done = advanceSolo(r, at + 50, idx);
    expect(done.result).toEqual({ kind: "found", at });
    expect(done.human?.entered?.at).toBe(at);
  });
  it.each([0.25, 0.75])(
    "snaps a mid-walk freeze at %s to the nearer endpoint by time",
    (fraction) => {
      let r = street();
      const start = r.seekStart + 150;
      const from = hiderView(r, start, idx).spot as HidingSpot;
      const c = ds.complexes[complex] as { lat: number; lon: number };
      const to = { ...offsetMeters(c, 250, 0), pano: "destination" };
      r = h(r, { type: "walkTo", ...to }, start);
      const state = r.human?.transit;
      if (state?.kind !== "walking") throw new Error("walk");
      const at = start + fraction * (state.end - start);
      const seeker = { kind: "street" as const, complex, exit: 0, at: c, since: at };
      r = { ...r, seeker, seekerTrail: [...r.seekerTrail, { t: at, state: seeker }] };
      const done = advanceSolo(r, at + 0.01, idx);
      expect(done.spot?.pano).toBe(fraction < 0.5 ? from.pano : to.pano);
      expect(done.human?.lock?.at).toBe(at);
      expect(done.result).toBeNull();
    },
  );
  it("finds a neighbouring-zone crossing between ticks", () => {
    const c = ds.complexes[complex] as { lat: number; lon: number };
    const a = offsetMeters(c, 500, 0);
    const b = offsetMeters(c, 300, 0);
    const start = TEN + 1400;
    const end = start + 200;
    const state = {
      kind: "walking" as const,
      reason: "street" as const,
      start,
      end,
      fromPoint: [a.lat, a.lon] as [number, number],
      toPoint: [b.lat, b.lon] as [number, number],
      fromComplex: 0,
      dest: {
        kind: "street" as const,
        complex: 0,
        exit: 0,
        since: end,
        at: { ...b, pano: "next" },
      },
    };
    const entry = firstZoneEntry([{ t: start, state }], c, end);
    expect(entry?.at).toBeCloseTo(start + 100, 1);
    expect(entry?.walked).toBe(true);
    const r = street();
    const walking = { ...r, seeker: state, seekerTrail: [...r.seekerTrail, { t: start, state }] };
    expect(advanceSolo(walking, start + 90, idx).human?.lock).toBeNull();
    const done = advanceSolo(walking, end, idx);
    expect(done.human?.lock?.cause).toBe("zone");
    expect(done.human?.lock?.at).toBeCloseTo(start + 100, 1);
    expect(done.human?.entered).toMatchObject({ walked: true, complex: 0 });
    expect(done.spot).toEqual(hiderView(r, start, idx).spot);
    expect(done.result).toBeNull();
  });
  it("shows but disables distant exits; allows the nearest if all are distant", () => {
    const r = underground();
    const original = ds.complexes[complex];
    if (!original) throw new Error("complex");
    const a = offsetMeters(original, 500, 0);
    const b = offsetMeters(original, 600, 0);
    const changed = {
      ...idx,
      ds: {
        ...ds,
        complexes: ds.complexes.map((c, i) =>
          i === complex
            ? {
                ...c,
                exits: [
                  [a.lat, a.lon],
                  [b.lat, b.lon],
                ] as [number, number][],
              }
            : c,
        ),
      },
    };
    expect(hiderExits(r, changed).map((e) => e.allowed)).toEqual([true, false]);
    const verified = setHiderExit(setHiderExit(r, 0, { ...a, pano: "near" }), 1, {
      ...b,
      pano: "far",
    });
    expect(applyHiderIntent(verified, { type: "exit", exit: 0 }, r.seekStart, changed).ok).toBe(
      true,
    );
    expect(applyHiderIntent(verified, { type: "exit", exit: 1 }, r.seekStart, changed)).toEqual({
      ok: false,
      error: "Outside your zone",
    });
    // Once any exit is in-zone, an outside exit gets no exception, even if verified.
    const place = changed.ds.complexes[complex];
    if (!place) throw new Error("complex");
    place.exits[0] = [original.lat, original.lon];
    expect(hiderExits(r, changed).map((e) => e.allowed)).toEqual([true, false]);
    expect(applyHiderIntent(verified, { type: "exit", exit: 1 }, r.seekStart, changed)).toEqual({
      ok: false,
      error: "Outside your zone",
    });
  });
});

describe("human answers and cards", () => {
  it("waits the full window with no decision and draws only when the answer lands", () => {
    const r = locked();
    const t = r.seekStart + 130;
    const after = s(r, radar, t);
    expect(after.hand).toEqual([]);
    expect(after.deck).toEqual(r.deck);
    expect(hiderView(after, t, idx).incoming[0]?.trueAnswer).toBeTypeOf("boolean");
    expect(soloView(after, t + 59, idx).asked[0]?.answer).toBeNull();
    const landed = advanceSolo(after, t + 60, idx);
    expect(landed.deck.length).toBe(r.deck.length - 2);
    expect(landed.human?.draw?.keep).toBe(1);
    expect(soloView(landed, t + 60, idx).candidates).toContain(r.hider);
  });
  it("a true decision does not answer early and cannot be changed", () => {
    let r = locked();
    const t = r.seekStart + 130;
    r = s(r, radar, t);
    r = h(r, { type: "answer", question: 0, decision: "true" }, t + 1);
    expect(soloView(r, t + 59, idx).asked[0]?.answer).toBeNull();
    expect(
      applyHiderIntent(r, { type: "answer", question: 0, decision: "veto" }, t + 2, idx).ok,
    ).toBe(false);
  });
  it("Veto reserves its card, lands at the deadline, charges the question and draws nothing", () => {
    let r = locked();
    r = { ...r, hand: ["veto", "late5"] };
    const t = r.seekStart + 130;
    const deck = r.deck;
    r = s(r, radar, t);
    const before = soloView(r, t + 1, idx);
    r = h(r, { type: "answer", question: 0, decision: "veto" }, t + 1);
    expect(soloView(r, t + 1, idx)).toEqual(before);
    expect(r.hand).toEqual(["late5"]);
    const done = advanceSolo(r, t + 60, idx);
    expect(done.deck).toEqual(deck);
    expect(soloView(done, t + 60, idx).asked[0]?.answer).toEqual({ vetoed: true });
    expect(soloView(done, t + 60, idx).bonusSeconds).toBe(600);
    expect(applySoloIntent(done, radar, t + 900, idx).ok).toBe(false);
  });
  it("Randomize is private until the original deadline and cannot be followed by another choice", () => {
    let r = locked();
    r = { ...r, hand: ["randomize"] };
    const t = r.seekStart + 130;
    r = s(r, radar, t);
    const before = soloView(r, t + 1, idx);
    r = h(r, { type: "answer", question: 0, decision: "randomize" }, t + 1);
    expect(soloView(r, t + 1, idx)).toEqual(before);
    expect(r.asked[0]?.answerAt).toBe(t + 60);
    expect(r.asked[0]?.q).not.toEqual(radar.question);
    expect(
      applyHiderIntent(r, { type: "answer", question: 0, decision: "true" }, t + 2, idx).ok,
    ).toBe(false);
  });
  it.each(["true", "veto", "randomize"] as const)(
    "photo %s uses the same window and source",
    (decision) => {
      let r = locked();
      r = { ...r, hand: ["veto", "randomize"] };
      const t = r.seekStart + 910;
      const q = { kind: "photo" as const, from: "spot" as const, look: "E" as const };
      r = s(r, { type: "ask", question: q }, t);
      r = h(r, { type: "answer", question: 0, decision }, t + 1);
      const done = advanceSolo(r, t + 60, idx);
      const a = done.asked[0];
      expect(a?.answerAt).toBe(t + 60);
      expect(a?.q).toMatchObject({ kind: "photo", from: "spot" });
      if (decision === "true")
        expect(a?.answer).toMatchObject({ photo: { heading: 90, pano: r.spot?.pano } });
      if (decision === "veto") expect(a?.answer).toEqual({ vetoed: true });
      if (decision === "randomize") expect(a?.q).not.toEqual(q);
    },
  );
  it("answering a spot photo locks now but sends later; timeout locks at the deadline", () => {
    const r = street();
    const t = r.seekStart + 910;
    const q = {
      type: "ask" as const,
      question: { kind: "photo" as const, from: "spot" as const, look: "W" as const },
    };
    const asked = s(r, q, t);
    const explicit = h(asked, { type: "answer", question: 0, decision: "true" }, t + 2);
    expect(explicit.human?.lock).toEqual({ at: t + 2, cause: "photo" });
    expect(soloView(explicit, t + 2, idx).asked[0]?.answer).toBeNull();
    const expired = advanceSolo(asked, t + 60, idx);
    expect(expired.human?.lock).toEqual({ at: t + 60, cause: "photo" });
    expect(expired.asked[0]?.answer).toMatchObject({ photo: { heading: 270 } });
  });
  it("on-foot answers are immediate and automatically keep a single card if it fits", () => {
    let r = locked();
    const t = r.seekStart + 130;
    r = { ...r, seeker: { kind: "street", complex, exit: 0, at: r.spot as HidingSpot, since: t } };
    r = s(r, { type: "ask", question: { kind: "spotRadar", meters: 50 } }, t);
    expect(r.asked[0]?.answerAt).toBe(t);
    expect(r.asked[0]?.answer).toBe(true);
    expect(r.hand).toHaveLength(1);
    expect(r.human?.draw).toBeNull();
  });
  it("permits explicit keep and overflow choices and rejects stale/duplicate indices", () => {
    let r = locked();
    r = {
      ...r,
      hand: ["late5", "late5", "late5", "late5", "late5", "late5"],
      deck: ["work15", "fog", "tourist"],
    };
    const t = r.seekStart + 130;
    r = advanceSolo(s(r, radar, t), t + 60, idx);
    const revision = r.human?.draw?.revision as number;
    expect(
      applyHiderIntent(r, { type: "keepCards", revision, keep: [0], discard: [] }, t + 61, idx).ok,
    ).toBe(false);
    r = h(r, { type: "keepCards", revision, keep: [1], discard: [0] }, t + 61);
    expect(r.hand).toEqual(["late5", "late5", "late5", "late5", "late5", "fog"]);
    expect(
      applyHiderIntent(r, { type: "keepCards", revision, keep: [0], discard: [0] }, t + 62, idx).ok,
    ).toBe(false);
  });
  it("defaults deterministically after ten seconds, including across a sparse tick or end", () => {
    let r = locked();
    r = { ...r, deck: ["late5", "work15"] };
    const t = r.seekStart + 130;
    r = s(r, radar, t);
    const done = advanceSolo(r, t + 130, idx);
    expect(done.hand).toEqual(["work15"]);
    expect(done.human?.draw).toBeNull();
    const pending = advanceSolo(r, t + 60, idx);
    const left = h(pending, { type: "leaveHide" }, t + 61);
    expect(left.hand).toEqual(["work15"]);
    expect(left.human?.incomplete).toBe("left");
    expect(hiderView(left, t + 61, idx).replay).not.toBeNull();
  });
  it("requires explicit curse payments, enforces the gap and never auto-plays human cards", () => {
    let r = locked();
    r = { ...r, hand: ["shed", "work15", "late5", "fog"] };
    const t = r.seekStart + 130;
    expect(advanceSolo(r, t, idx).cardEvents).toEqual([]);
    expect(
      applyHiderIntent(r, { type: "playCard", revision: 0, card: 0, payment: [0] }, t, idx).ok,
    ).toBe(false);
    r = h(r, { type: "playCard", revision: 0, card: 0, payment: [1] }, t);
    expect(r.hand).toEqual(["late5", "fog"]);
    expect(r.curses).toEqual([{ card: "shed", at: t, until: t + 1200 }]);
    expect(
      applyHiderIntent(r, { type: "playCard", revision: 1, card: 1, payment: [0] }, t + 1, idx).ok,
    ).toBe(false);
  });
  it.each(["tourist", "wrongWay"] as const)(
    "applies %s to the next stop with explicit payment",
    (card) => {
      let r = locked();
      const d = departures(idx, hub, r.seekStart + 130)[0];
      if (!d) throw new Error("train");
      const t = d.dep + 1;
      r = s(r, { type: "board", trip: d.trip, stop: d.stop }, d.dep - 1);
      r = { ...r, hand: [card, "late5", "work15"] };
      const payment = card === "tourist" ? [1, 2] : [1];
      const done = h(r, { type: "playCard", revision: 0, card: 0, payment }, t);
      const trip = ds.trips[d.trip];
      if (!trip) throw new Error("trip");
      expect(done.curses).toEqual([
        card === "wrongWay"
          ? { card, at: t, dir: trip.dir === 0 ? 1 : 0, until: t + WRONG_WAY_MAX_SECONDS }
          : { card, at: t, station: trip.stops[d.stop + 1] },
      ]);
      expect(done.hand).toEqual(card === "tourist" ? [] : ["work15"]);
      if (card === "tourist") {
        expect(done.seeker).toMatchObject({ kind: "train", to: d.stop + 1 });
        expect(done.seekerTrail.at(-1)).toEqual({ t, state: done.seeker });
      }
    },
  );
  it("redraw consumes itself plus two explicit cards; its play and draw remain private", () => {
    let r = locked();
    r = { ...r, hand: ["redraw", "work15", "fog", "late5"], deck: ["veto", "tourist", "delays10"] };
    const t = r.seekStart + 130;
    const before = soloView(r, t, idx);
    r = h(r, { type: "redraw", revision: 0, card: 0, payment: [1, 2] }, t);
    expect(r.hand).toEqual(["late5"]);
    expect(r.human?.draw?.cards).toEqual(["veto", "tourist", "delays10"]);
    expect(soloView(r, t, idx)).toEqual(before);
  });
  it("keeps the hider's hand, station, spot and lock out of seeker frames", () => {
    const r = locked();
    const t = r.seekStart + 130;
    const view = soloView(r, t, idx);
    expect(view.hider).toBeNull();
    expect(view.hiderHand).toBeNull();
    expect(view.spotNearby).toBeNull();
    expect(view.hasExitPhoto).toBe(true);
    expect(view).not.toHaveProperty("photoExit");
    expect(view).not.toHaveProperty("human");
    expect(view).not.toHaveProperty("lock");
    expect(
      soloView(
        {
          ...r,
          hand: ["veto", "tourist"],
          human: { ...(r.human as HumanHider), lock: null },
          spot: null,
          photoExit: null,
        },
        t,
        idx,
      ),
    ).toEqual(view);
  });
  it("hider view does not expose the bot's chosen alight stop", () => {
    let r = locked();
    const t = r.seekStart + 130;
    const d = departures(idx, hub, t, { horizon: 600 })[0];
    if (!d) throw new Error("train");
    r = s(r, { type: "board", trip: d.trip, stop: d.stop }, t);
    r = s(r, { type: "alightAt", stop: d.stop + 1 }, t);
    const view = hiderView(r, t, idx);
    expect(view.seeker).toMatchObject({
      kind: "train",
      to: (ds.trips[d.trip]?.stops.length as number) - 1,
    });
    const alternative = s(r, { type: "alightAt", stop: d.stop + 2 }, t);
    expect(hiderView(alternative, t, idx).seekerTrail).toEqual(view.seekerTrail);
    expect(view).not.toHaveProperty("beliefs");
    expect(view.seekerTrail.every((e) => e.t <= t)).toBe(true);
    expect(
      view.seekerTrail
        .filter((e) => e.state.kind === "train")
        .every(
          (e) =>
            e.state.kind === "train" &&
            e.state.to === (idx.ds.trips[e.state.trip]?.stops.length ?? 0) - 1,
        ),
    ).toBe(true);
  });
});

describe("moving-hider street evidence", () => {
  it("does not permanently clear cells from a question asked before entering a candidate zone", () => {
    const center = ds.complexes[complex] as { lat: number; lon: number };
    const outside = offsetMeters(center, 450, 0);
    const asked = [
      {
        q: { kind: "spotRadar" as const, meters: 50 },
        ctx: { origin: { ...outside, complex }, baseline: null },
        answer: true,
        at: TEN + 1300,
      },
    ];
    const moving = possibleSpots(ds, center, asked, [complex], [], TEN + 1400, true);
    const fixed = possibleSpots(ds, center, asked, [complex], [], TEN + 1400);
    expect(moving.length).toBeGreaterThan(7000);
    expect(fixed.length).toBeLessThan(100);
  });
  it("clips a walk at public circle entry and then accumulates exact evidence", () => {
    const center = ds.complexes[complex] as { lat: number; lon: number };
    const outside = offsetMeters(center, 500, 0);
    const inside = offsetMeters(center, 300, 0);
    const path = [
      {
        a: [outside.lat, outside.lon] as [number, number],
        b: [inside.lat, inside.lon] as [number, number],
        start: TEN,
        end: TEN + 200,
      },
    ];
    expect(publicZoneEntryAt(center, path, TEN + 200)).toBeCloseTo(TEN + 100, 1);
    const asked = [
      {
        q: { kind: "spotRadar" as const, meters: 50 },
        ctx: { origin: { ...inside, complex }, baseline: null },
        answer: true,
        at: TEN + 201,
      },
    ];
    const points = possibleSpots(ds, center, asked, [complex], path, TEN + 201, true);
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((p) => distanceMeters(p, inside) <= 50)).toBe(true);
  });
});
