import { describe, expect, it } from "vitest";
import { parseRound, summarize } from "./metrics.ts";

const line = (at: number, event: string, data: Record<string, unknown> = {}) =>
  JSON.stringify({ at, event, ...data });

/** A daily the seeker found: two questions, a skip, a drop and a return, the catch. */
const found = [
  line(1000, "round_start", {
    mode: "daily",
    difficulty: "normal",
    daily: { number: 4 },
    reachable: 97,
    seekStart: 37200,
  }),
  line(5000, "question", { t: 37260, q: { kind: "radar", miles: 1 }, answer: true, remaining: 25 }),
  line(9000, "intent", { t: 37300, side: "seeker", type: "board" }),
  line(12000, "clock", { t: 37400, type: "skip", to: 37600 }),
  line(20000, "question", {
    t: 37620,
    q: { kind: "borough" },
    answer: { vetoed: true },
    remaining: null,
  }),
  line(21000, "disconnect", { t: 37700 }),
  line(81000, "reconnect", { t: 38060, replaced: false }),
  line(84000, "intent", { t: 38100, side: "seeker", type: "exit" }),
  line(90000, "question", {
    t: 38200,
    q: { kind: "spotRadar", meters: 100 },
    answer: true,
    remaining: null,
  }),
  line(95000, "intent", { t: 38300, side: "seeker", type: "catch" }),
  line(95001, "round_end", {
    result: "found",
    elapsedMin: 40,
    questions: 3,
    bonusMin: 23,
    hiderScoreMin: 63,
    hiderHand: ["late5"],
    cardsPlayed: ["veto"],
    stationFoundMin: 28,
  }),
];

/** A practice round left mid-ride: no end, the server gave it up. */
const left = [
  line(2000, "round_start", {
    mode: "practice",
    difficulty: "easy",
    daily: null,
    reachable: 80,
    seekStart: 37200,
  }),
  line(4000, "intent", { t: 37210, side: "seeker", type: "board" }),
  line(6000, "disconnect", { t: 37300 }),
  line(200000, "abandoned", { t: 38500, over: false }),
];

/** A hide round: the bot's intents aren't the human's decisions. */
const hide = [
  line(3000, "round_start", {
    mode: "hide",
    difficulty: "normal",
    daily: null,
    reachable: 90,
    seekStart: 37200,
  }),
  line(4000, "intent", { t: 36100, side: "hider", type: "board" }),
  line(30000, "intent", { t: 37300, side: "seeker", type: "board", ok: true }),
  line(31000, "intent", { t: 37310, side: "hider", type: "hideHere" }),
  line(60000, "round_end", {
    result: "found",
    elapsedMin: 50,
    questions: 4,
    bonusMin: 40,
    hiderScoreMin: 90,
    hiderHand: [],
    cardsPlayed: [],
    stationFoundMin: 30,
  }),
];

describe("match-log metrics", () => {
  it("reads a round's result, times, questions and the seeker's decision gaps", () => {
    const r = parseRound("a", found);
    if (!r) throw new Error("parsed");
    expect(r.result).toBe("found");
    expect(r.stationFoundMin).toBe(28);
    expect(r.elapsedMin).toBe(40);
    expect(r.questions.map((q) => q.category)).toEqual(["radar", "matching", "onFoot"]);
    expect(r.questions[1]?.vetoed).toBe(true);
    expect(r.skips).toBe(1);
    expect(r.reconnects).toBe(1);
    // Gaps: 4, 4, 3, 8 s before the drop; the 60 s away doesn't count; then 3, 6, 5 after.
    expect(r.decisionGaps).toEqual([4, 4, 3, 8, 3, 6, 5]);
  });

  it("counts a round left mid-ride as abandoned, not as a result", () => {
    const r = parseRound("b", left);
    expect(r?.result).toBeNull();
    expect(r?.abandoned).toBe(true);
  });

  it("measures the hider's decisions in a hide round, not the bot's", () => {
    const r = parseRound("c", hide);
    expect(r?.decisionGaps).toEqual([1, 27]);
  });

  it("ignores a torn line and a log with no start", () => {
    expect(parseRound("d", ["{not json", ""])).toBeNull();
    const r = parseRound("e", [...found, "{torn"]);
    expect(r?.result).toBe("found");
  });

  it("summarizes by mode and difficulty against the sim's line", () => {
    const text = summarize(
      [parseRound("a", found), parseRound("b", left), parseRound("c", hide)].filter(
        (r): r is NonNullable<typeof r> => r !== null,
      ),
    );
    expect(text).toContain("DAILY · NORMAL — 1 rounds played");
    expect(text).toContain("station found: 28");
    expect(text).toContain("30% of seeking");
    expect(text).toContain(
      "2.0 station questions a round (radar 50%, matching 50%); 1.0 on foot; vetoed 1",
    );
    expect(text).toContain("PRACTICE · EASY — 1 rounds played, 0 opened only");
    expect(text).toContain("left without finishing 100%");
    expect(text).toContain("vs the bot seeker on Normal");
    expect(text).toContain("HIDE · NORMAL");
  });
});
