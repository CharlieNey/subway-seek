import type { Dataset } from "@subway-seek/data";
import { loadDataset } from "@subway-seek/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type CardId,
  DECK_COUNTS,
  drawAndKeep,
  HAND_LIMIT,
  playCard,
  shuffledDeck,
  TOURIST_WALK_M,
} from "./cards.ts";
import { seededRandom } from "./daily.ts";
import { offsetMeters } from "./geo.ts";
import { botPowerup, expectedLeft, STRONG_QUESTION_LEFT } from "./hiderBot.ts";
import {
  type AskContext,
  closedQuestions,
  evaluate,
  filterCandidates,
  questionKey,
  RADAR_MILES,
} from "./questions.ts";
import {
  type ActiveCurse,
  ANSWER_WINDOW_SECONDS,
  advanceSolo,
  applySoloIntent,
  bonusSeconds,
  createSoloRound,
  QUESTION_RULES,
  type SoloIntent,
  type SoloRound,
  skipSolo,
  soloView,
} from "./solo.ts";
import { buildIndex, departures, type TimetableIndex } from "./timetable.ts";
import { nextEventTime, type OnStreet, resolve } from "./transit.ts";

const TEN = 10 * 3600;
let ds: Dataset;
let idx: TimetableIndex;
let hub: number;

beforeAll(() => {
  ds = loadDataset();
  idx = buildIndex(ds);
  hub = ds.stations.findIndex((s) => s.id === "127");
});

const station = (id: string) => ds.stations.findIndex((s) => s.id === id);
const round = (seed = 3): SoloRound =>
  createSoloRound(idx, { hub, hideStart: TEN, random: seededRandom(seed) });
const apply = (r: SoloRound, intent: SoloIntent, t: number) => {
  const res = applySoloIntent(r, intent, t, idx);
  if (!res.ok) throw new Error(res.error);
  return res.round;
};

describe("the deck", () => {
  it("is the same shuffle for the same seed, with every card", () => {
    const a = shuffledDeck(seededRandom(1));
    expect(shuffledDeck(seededRandom(1))).toEqual(a);
    expect(a).toHaveLength(Object.values(DECK_COUNTS).reduce((x, y) => x + y, 0));
    expect(a.filter((c) => c === "veto")).toHaveLength(DECK_COUNTS.veto);
  });

  it("keeps the best of a draw, and the best six over the limit", () => {
    const { hand, deck } = drawAndKeep([], ["late5", "work15", "fog"], 3, 1);
    expect(hand).toEqual(["work15"]);
    expect(deck).toEqual([]);
    const full: CardId[] = ["late5", "late5", "delays10", "veto", "tourist", "work15"];
    const over = drawAndKeep(full, ["randomize"], 1, 1).hand;
    expect(over).toHaveLength(HAND_LIMIT);
    expect(over.filter((c) => c === "late5")).toHaveLength(1);
  });

  it("pays for a curse with the cheapest other cards", () => {
    const hand: CardId[] = ["work15", "tourist", "late5", "redraw", "delays10"];
    expect(playCard(hand, 1, 2)).toEqual(["work15", "delays10"]);
  });
});

describe("answering with cards", () => {
  it("draws on every answer, and counts held time bonuses only at the end", () => {
    const r = round();
    const asked = apply(r, { type: "ask", question: { kind: "radar", miles: 1 } }, r.seekStart);
    expect(asked.hand).toHaveLength(1); // radar: draw 2, keep 1
    expect(asked.deck).toHaveLength(r.deck.length - 2);
    const held: SoloRound = { ...asked, hand: ["work15", "late5"] };
    expect(bonusSeconds(held)).toBe(10 * 60);
    const over = { ...held, result: { kind: "found" as const, at: r.seekStart + 600 } };
    expect(bonusSeconds(over)).toBe(10 * 60 + 20 * 60);
    expect(soloView(over, r.seekStart, idx).hiderHand).toEqual(["work15", "late5"]);
    expect(soloView(held, r.seekStart, idx).hiderHand).toBeNull();
  });

  /** Asking from the start. */
  const fromHub = (): AskContext => ({
    origin: {
      ...(ds.stations[hub] as { lat: number; lon: number }),
      complex: ds.stations[hub]?.complex as number,
    },
    baseline: null,
  });

  /** From the start: the radar that splits these stations best. */
  const strongRadar = (cands: number[]) => {
    const ctx = fromHub();
    const best = RADAR_MILES.map((miles) => ({ kind: "radar" as const, miles })).sort(
      (a, b) => expectedLeft(ds, a, cands, ctx) - expectedLeft(ds, b, cands, ctx),
    )[0];
    if (!best || expectedLeft(ds, best, cands, ctx) > STRONG_QUESTION_LEFT) throw new Error("weak");
    return best;
  };

  /** Late in the hunt (a dozen stations, half near and half far), a strong radar, vetoed. */
  function vetoed() {
    const r0 = round();
    const byDistance = [...r0.reachable].sort((a, b) => {
      const s = ds.stations[hub] as { lat: number; lon: number };
      const d = (c: number) =>
        Math.hypot((ds.complexes[c]?.lat ?? 0) - s.lat, (ds.complexes[c]?.lon ?? 0) - s.lon);
      return d(a) - d(b);
    });
    const few = [...byDistance.slice(0, 6), ...byDistance.slice(-6)];
    const r: SoloRound = {
      ...r0,
      reachable: few,
      hider: few[0] as number,
      hand: ["veto", "late5"],
    };
    const q = strongRadar(few);
    return { r, q, few, after: apply(r, { type: "ask", question: q }, r.seekStart) };
  }

  it("vetoes a strong late question: no answer, still paid for, no draw", () => {
    const { r, few, after } = vetoed();
    const last = after.asked.at(-1);
    expect(last?.answer).toEqual({ vetoed: true });
    expect(soloView(after, r.seekStart + ANSWER_WINDOW_SECONDS, idx).candidates).toHaveLength(
      few.length,
    );
    expect(bonusSeconds(after)).toBe(10 * 60);
    expect(after.hand).toEqual(["late5"]);
    expect(after.cardEvents.at(-1)?.card).toBe("veto");
  });

  it("shows the veto when the answer window ends, like any answer", () => {
    const { r, after } = vetoed();
    const during = soloView(after, r.seekStart + ANSWER_WINDOW_SECONDS - 1, idx);
    expect(during.asked[0]?.answer).toBeNull();
    expect(during.cardEvents).toEqual([]);
    const landed = soloView(after, r.seekStart + ANSWER_WINDOW_SECONDS, idx);
    expect(landed.asked[0]?.answer).toEqual({ vetoed: true });
    expect(landed.cardEvents.map((e) => e.card)).toEqual(["veto"]);
  });

  it("closes a vetoed question for the round, from anywhere; the rest of its category stays open", () => {
    const { r, q, after } = vetoed();
    const cooled = r.seekStart + QUESTION_RULES.radar.cooldownSeconds;
    expect(closedQuestions(soloView(after, cooled, idx).asked)).toEqual(new Set([questionKey(q)]));
    expect(applySoloIntent(after, { type: "ask", question: q }, cooled, idx)).toMatchObject({
      ok: false,
      error: "The hider vetoed that question. It's closed for the round.",
    });
    // Asking it again from another station doesn't reopen it.
    const elsewhere: SoloRound = {
      ...after,
      seeker: { kind: "platform", station: station("132"), since: cooled, arrivedDir: null },
    };
    expect(applySoloIntent(elsewhere, { type: "ask", question: q }, cooled, idx).ok).toBe(false);
    const other = { kind: "radar" as const, miles: RADAR_MILES.find((m) => m !== q.miles) ?? 0 };
    expect(applySoloIntent(after, { type: "ask", question: other }, cooled, idx).ok).toBe(true);
  });

  it("decides on a veto without looking at the real answer", () => {
    const r = round();
    const ctx = {
      origin: { lat: 40.7553, lon: -73.9873, complex: ds.stations[hub]?.complex as number },
      baseline: null,
    };
    const cands = filterCandidates(ds, r.reachable, []).slice(0, 20);
    // botPowerup never sees the hider: the same inputs give the same call wherever they are.
    const play = botPowerup(
      ds,
      { kind: "radar", miles: 1 },
      ctx,
      cands,
      ["veto"],
      new Set(),
      () => 0,
    );
    const answers = new Set(cands.map((c) => evaluate(ds, { kind: "radar", miles: 1 }, c, ctx)));
    expect(answers.size).toBeGreaterThan(1);
    expect(play).toEqual(
      botPowerup(ds, { kind: "radar", miles: 1 }, ctx, cands, ["veto"], new Set(), () => 0),
    );
  });

  it("randomizes a strong question into another of the same type", () => {
    const r: SoloRound = { ...round(), hand: ["randomize"] };
    const q = strongRadar(r.reachable);
    const after = apply(r, { type: "ask", question: q }, r.seekStart);
    const last = after.asked.at(-1);
    expect(last?.randomizedFrom).toEqual(q);
    expect(last?.q.kind).toBe("radar");
    expect(last?.q).not.toEqual(q);
    expect(after.cardEvents.at(-1)?.card).toBe("randomize");
    // Until the window ends the seeker sees only the question they asked.
    const during = soloView(after, r.seekStart + ANSWER_WINDOW_SECONDS - 1, idx).asked[0];
    expect(during).toMatchObject({ q, answer: null, remaining: null });
    expect(during?.randomizedFrom).toBeUndefined();
    expect(soloView(after, r.seekStart + ANSWER_WINDOW_SECONDS - 1, idx).cardEvents).toEqual([]);
  });

  it("never randomizes into a closed question", () => {
    const { reachable } = round();
    const q = strongRadar(reachable);
    const others = RADAR_MILES.filter((m) => m !== q.miles);
    const open = others.at(-1) as number;
    const closed = new Set(
      others.filter((m) => m !== open).map((miles) => questionKey({ kind: "radar", miles })),
    );
    for (const x of [0, 0.5, 0.99]) {
      expect(botPowerup(ds, q, fromHub(), reachable, ["randomize"], closed, () => x)).toEqual({
        card: "randomize",
        question: { kind: "radar", miles: open },
      });
    }
  });

  it("keeps Discard 2, draw 3 and the hand's size from the seeker until the round is over", () => {
    const r: SoloRound = { ...round(), hand: ["redraw", "late5", "late5"] };
    const t = r.seekStart;
    const after = apply(r, { type: "ask", question: { kind: "borough" } }, t);
    expect(after.cardEvents.map((e) => e.card)).toEqual(["redraw"]);
    const view = soloView(after, t + ANSWER_WINDOW_SECONDS, idx);
    expect(view.cardEvents).toEqual([]);
    expect(view).not.toHaveProperty("hiderHandSize");
    const over = apply(after, { type: "giveUp" }, t + 120);
    expect(soloView(over, t + 120, idx).cardEvents.map((e) => e.card)).toEqual(["redraw"]);
  });
});

describe("curses", () => {
  /** A seeker riding the downtown 1 from Times Sq, with the hider four stops on. */
  function riding(hand: CardId[]) {
    const r0 = round();
    const dep = departures(idx, hub, r0.seekStart, { horizon: 1800 }).find(
      (d) => d.route.id === "1" && d.dir === 1,
    );
    if (!dep) throw new Error("no downtown 1");
    const trip = ds.trips[dep.trip];
    if (!trip) throw new Error("trip");
    const hider = ds.stations[trip.stops[dep.stop + 4] as number]?.complex as number;
    // Hard plays movement curses from the first ride (Normal waits for ≤ 20 candidates).
    let r: SoloRound = { ...r0, hider, hand, difficulty: "hard" };
    r = apply(r, { type: "board", trip: dep.trip, stop: dep.stop }, r.seekStart);
    const moving = (trip.dep[dep.stop] as number) + 10;
    return { r, trip, dep, moving };
  }

  it("Tourist: off at the next stop, then walk 200 m before going back in", () => {
    const { r, trip, dep, moving } = riding(["tourist", "late5", "late5"]);
    // Normal waits until the seeker has narrowed to 20 stations; Easy never curses.
    expect(advanceSolo({ ...r, difficulty: "normal" }, moving, idx).curses).toHaveLength(0);
    expect(advanceSolo({ ...r, difficulty: "easy" }, moving, idx).curses).toHaveLength(0);
    const cursed = advanceSolo(r, moving, idx);
    const curse = cursed.curses[0];
    expect(curse?.card).toBe("tourist");
    expect(cursed.hand).toEqual([]);
    const s = cursed.seeker;
    if (s.kind !== "train") throw new Error("expected to be riding");
    expect(s.to).toBe(dep.stop + 1);
    // Can't stay on.
    expect(
      applySoloIntent(cursed, { type: "alightAt", stop: dep.stop + 3 }, moving, idx),
    ).toMatchObject({ ok: false, error: "Tourist: you have to get off at the next stop." });
    // Off at the next stop: can't board again yet.
    const off = (trip.arr[dep.stop + 1] as number) + 5;
    const there = advanceSolo(cursed, off, idx);
    const platform = resolve(there.seeker, off, idx);
    if (platform.kind !== "platform") throw new Error("expected the platform");
    const next = departures(idx, platform.station, off, { horizon: 1800 })[0];
    if (!next) throw new Error("no train");
    expect(
      applySoloIntent(there, { type: "board", trip: next.trip, stop: next.stop }, off, idx).ok,
    ).toBe(false);
    // Up, walk 250 m, and back in.
    let up = apply(there, { type: "exit", exit: 0 }, off);
    const onStreet = off + 130;
    up = advanceSolo(up, onStreet, idx);
    const street = resolve(up.seeker, onStreet, idx) as OnStreet;
    const c = ds.complexes[street.complex];
    if (!c) throw new Error("complex");
    const enter = { type: "enter" as const, station: platform.station };
    expect(applySoloIntent(up, enter, onStreet, idx)).toMatchObject({ ok: false });
    const walked = apply(up, { type: "walkTo", ...offsetMeters(c, 0, 250) }, onStreet);
    const later = onStreet + 600;
    const done = advanceSolo(walked, later, idx);
    expect(done.curses).toHaveLength(0);
    expect(applySoloIntent(done, enter, later, idx).ok).toBe(true);
    expect(TOURIST_WALK_M).toBe(200);
  });

  it("Wrong way: the next train must run the other way, then it's over", () => {
    const { r, moving } = riding(["wrongWay", "late5", "late5"]);
    // Tourist isn't in hand, so the bot plays Wrong way.
    const cursed = advanceSolo(r, moving, idx);
    const curse = cursed.curses[0] as Extract<ActiveCurse, { card: "wrongWay" }>;
    expect(curse.card).toBe("wrongWay");
    expect(curse.dir).toBe(0); // was riding downtown
    const s = cursed.seeker;
    if (s.kind !== "train") throw new Error("riding");
    const trip = ds.trips[s.trip];
    const off = (trip?.arr[s.from + 1] as number) + 1;
    const atStop = apply(cursed, { type: "alightAt", stop: s.from + 1 }, off - 30);
    const plat = resolve(atStop.seeker, off, idx);
    if (plat.kind !== "platform") throw new Error("platform");
    // Long enough after arriving to change platforms.
    const boardAt = off + 600;
    const deps = departures(idx, plat.station, boardAt, { horizon: 1800 });
    const down = deps.find((d) => d.dir === 1);
    const up = deps.find((d) => d.dir === 0);
    if (!down || !up) throw new Error("trains both ways");
    const board = (d: typeof up) => ({ type: "board" as const, trip: d.trip, stop: d.stop });
    expect(applySoloIntent(atStop, board(down), boardAt, idx)).toMatchObject({ ok: false });
    // Boarding the right way isn't enough: cancel, and the other way is still closed.
    const waiting = apply(atStop, board(up), boardAt);
    expect(waiting.curses).toHaveLength(1);
    const cancelled = apply(waiting, { type: "cancelBoard" }, boardAt + 1);
    expect(applySoloIntent(cancelled, board(down), boardAt + 2, idx)).toMatchObject({ ok: false });
    // It's over once the right-way train leaves with you on it.
    expect(advanceSolo(waiting, up.dep, idx).curses).toHaveLength(0);
  });

  it("fast-forwarding a ride still gives the hider its chance, and stops where it plays", () => {
    const { r, trip, dep } = riding(["tourist", "late5", "late5"]);
    const end = nextEventTime(r.seeker, r.seekStart, idx, "end");
    if (end === null) throw new Error("no arrival");
    const skipped = skipSolo(r, r.seekStart, end, idx);
    expect(skipped.round.cardEvents.map((e) => e.card)).toEqual(["tourist"]);
    expect(skipped.t).toBe(trip.dep[dep.stop]);
    // With nothing to play, the skip goes all the way.
    const quiet = skipSolo({ ...r, hand: [] }, r.seekStart, end, idx);
    expect(quiet.t).toBe(end);
    expect(quiet.round.cardEvents).toHaveLength(0);
  });

  it("Sidewalk shed doubles walking time; timed curses run out", () => {
    const r = round();
    const t = r.seekStart + 600;
    const c = ds.complexes[ds.stations[hub]?.complex as number];
    if (!c) throw new Error("complex");
    const street: OnStreet = {
      kind: "street",
      complex: ds.stations[hub]?.complex as number,
      exit: 0,
      since: t,
    };
    const base: SoloRound = { ...r, seeker: street };
    const shed: SoloRound = {
      ...base,
      curses: [{ card: "shed", at: t, until: t + 600 }],
      lastCurseAt: t,
    };
    const walk = { type: "walkTo" as const, ...offsetMeters(c, 0, 200) };
    const normal = apply(base, walk, t).seeker;
    const slow = apply(shed, walk, t).seeker;
    if (normal.kind !== "walking" || slow.kind !== "walking") throw new Error("walks");
    expect(slow.end - slow.start).toBeCloseTo(2 * (normal.end - normal.start), 5);
    expect(advanceSolo(shed, t + 599, idx).curses).toHaveLength(1);
    expect(advanceSolo(shed, t + 601, idx).curses).toHaveLength(0);
  });
});
