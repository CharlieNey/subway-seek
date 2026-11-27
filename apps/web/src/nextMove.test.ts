import { loadDataset } from "@subway-seek/data/node";
import {
  applySoloIntent,
  buildIndex,
  createSoloRound,
  hashString,
  resolve,
  type SoloRound,
  seededRandom,
  soloView,
  stationOnly,
  type TimetableIndex,
} from "@subway-seek/engine";
import { beforeAll, describe, expect, it } from "vitest";
import {
  answerPending,
  endLineText,
  type NextMoveInput,
  nextMove,
  offersSuggestion,
  suggestedQuestion,
} from "./nextMove.ts";

let idx: TimetableIndex;
beforeAll(() => {
  idx = buildIndex(loadDataset());
});

const TEN = 10 * 3600;

/** A practice round from Times Sq at Easy, ending at the station, opened at 10:20. */
function round(seed = "next"): SoloRound {
  const hub = idx.ds.stations.findIndex((s) => s.id === "127");
  return stationOnly(
    createSoloRound(idx, {
      hub,
      hideStart: TEN,
      random: seededRandom(hashString(seed)),
      difficulty: "easy",
    }),
  );
}

function input(r: SoloRound, t: number, over: Partial<NextMoveInput> = {}): NextMoveInput {
  return {
    idx,
    view: soloView(r, t, idx),
    t,
    tab: "travel",
    armed: null,
    armedReady: false,
    suggest: true,
    ...over,
  };
}

function ask(r: SoloRound, t: number): SoloRound {
  const pick = suggestedQuestion(idx, soloView(r, t, idx), t);
  if (!pick) throw new Error("nothing to ask");
  const res = applySoloIntent(r, { type: "ask", question: pick.q }, t, idx);
  if (!res.ok) throw new Error(res.error);
  return res.round;
}

describe("the next move", () => {
  it("opens by sending you to Ask, then to the suggested question", () => {
    const r = round();
    const t = r.seekStart;
    expect(nextMove(input(r, t))).toEqual({
      line: "Ask a question to rule stations out.",
      target: { kind: "askTab" },
    });
    const onAsk = nextMove(input(r, t, { tab: "ask" }));
    expect(onAsk?.target.kind).toBe("question");
    // Without the suggestion (the daily), the line stays and nothing is picked for you.
    expect(nextMove(input(r, t, { tab: "ask", suggest: false }))?.target).toEqual({ kind: "none" });
  });

  it("points at the confirm once a question is chosen", () => {
    const r = round();
    const move = nextMove(
      input(r, r.seekStart, { tab: "ask", armed: { kind: "borough" }, armedReady: true }),
    );
    expect(move?.target).toEqual({ kind: "askButton" });
  });

  it("says the answer is coming while its window runs", () => {
    const t = round().seekStart;
    const r = ask(round(), t);
    const view = soloView(r, t + 10, idx);
    expect(answerPending(view, t + 10)).toBe(true);
    expect(nextMove(input(r, t + 10))?.line).toBe(
      "Your answer lands in a few seconds. Watch the map.",
    );
  });

  it("while the next question waits, names a real train toward what's left", () => {
    const t0 = round().seekStart;
    const r = ask(round(), t0);
    const t = t0 + 90; // answered, the gap still running
    const move = nextMove(input(r, t));
    // A train from here, or first a change of platform toward one.
    expect(move?.line).toMatch(
      /^Next question at 10:25\. (Ride toward .+: the .+ to .+|Change to the .+, toward .+)\.$/,
    );
    expect(["board", "transfer"]).toContain(move?.target.kind);
    // On Ask, it points at Travel first.
    expect(nextMove(input(r, t, { tab: "ask" }))?.target).toEqual({ kind: "travelTab" });
    // The row it points at leaves from where you stand.
    const s = resolve(r.seeker, t, idx);
    expect(s.kind).toBe("platform");
    if (s.kind !== "platform") return;
    if (move?.target.kind === "transfer") {
      const to = move.target.to;
      expect((idx.transfersFrom[s.station] ?? []).some((x) => x.to === to)).toBe(true);
    } else if (move?.target.kind === "board") {
      const { route, dir } = move.target;
      const leaves = idx.ds.trips.some(
        (tr) => tr.route === route && tr.dir === dir && tr.stops.includes(s.station),
      );
      expect(leaves).toBe(true);
    }
  });

  it("keeps naming the same train while it's still on offer", () => {
    const t0 = round().seekStart;
    const r = ask(round(), t0);
    const t = t0 + 90;
    const first = nextMove(input(r, t));
    expect(first?.hold).toBeDefined();
    // Departures move on; with the hold, the line doesn't change its mind.
    for (const later of [t + 6, t + 30, t + 60]) {
      const again = nextMove({ ...input(r, later), hold: first?.hold });
      const held = first?.hold;
      const trip = held?.trip !== undefined ? idx.ds.trips[held.trip] : undefined;
      const station = held?.station as number;
      const gone = trip ? (trip.dep[trip.stops.indexOf(station)] as number) < later : false;
      if (!gone)
        expect(again?.line.replace(/^Next question at \S+ /, "")).toBe(
          first?.line.replace(/^Next question at \S+ /, ""),
        );
    }
  });

  it("keeps heading for the same station while it's still possible", () => {
    const t0 = round().seekStart;
    const r = ask(round(), t0);
    const t = t0 + 90;
    const first = nextMove(input(r, t));
    const goal = first?.hold?.goal;
    expect(goal).toBeDefined();
    // Later, from anywhere, with no train held: the goal stands while it's possible.
    const later = nextMove({ ...input(r, t + 120), hold: { station: -1, answers: -1, goal } });
    if (later?.hold) expect(later.hold.goal).toBe(goal);
  });

  it("is blind to the hider: the same view gets the same move", () => {
    const a = round("next");
    const t = a.seekStart;
    const view = soloView(a, t, idx);
    // Another station from the same list, as if the hider had chosen differently.
    const other = view.candidates.find((c) => c !== a.hider) as number;
    const b: SoloRound = { ...a, hider: other };
    for (const tab of ["travel", "ask"] as const) {
      expect(nextMove(input(b, t, { tab }))).toEqual(nextMove(input(a, t, { tab })));
    }
  });

  it("says nothing once the round is over", () => {
    const r = round();
    const res = applySoloIntent(r, { type: "giveUp" }, r.seekStart + 60, idx);
    if (!res.ok) throw new Error(res.error);
    expect(nextMove(input(res.round, r.seekStart + 60))).toBeNull();
  });

  it("says plainly how the round ended", () => {
    expect(endLineText({ result: { kind: "found", at: 0 } }, "Wall St")).toBe(
      "You found the hider at Wall St. Your result is below.",
    );
    expect(endLineText({ result: { kind: "timeout", at: 0 } }, "Wall St")).toMatch(/^Time's up\./);
    expect(endLineText({ result: { kind: "gaveUp", at: 0 } }, "Wall St")).toBe(
      "You gave up. The hider was at Wall St.",
    );
  });

  it("offers a suggested question only in the guided first round, never the daily", () => {
    expect(offersSuggestion({ daily: false, firstRound: true, guide: "new" })).toBe(true);
    // The guide finished partway through the first round: still that round.
    expect(offersSuggestion({ daily: false, firstRound: true, guide: "done" })).toBe(true);
    expect(offersSuggestion({ daily: false, firstRound: true, guide: "skipped" })).toBe(false);
    expect(offersSuggestion({ daily: false, firstRound: false, guide: "done" })).toBe(false);
    expect(offersSuggestion({ daily: true, firstRound: true, guide: "new" })).toBe(false);
    // "Play the guided round" again, from How it plays.
    expect(offersSuggestion({ daily: false, firstRound: false, guide: "new" })).toBe(true);
  });
});
