import { loadDataset } from "@subway-seek/data/node";
import {
  ANSWER_WINDOW_SECONDS,
  applySoloIntent,
  buildIndex,
  createSoloRound,
  type Question,
  type SoloRound,
  SPOT_PHOTOS_OPEN_SECONDS,
  soloView,
  type TimetableIndex,
} from "@subway-seek/engine";
import { beforeAll, describe, expect, it } from "vitest";
import {
  askBlocker,
  askLabel,
  chipState,
  closedKeys,
  currentHint,
  HINTS,
  type HintId,
  hintText,
  keepArmed,
  priceText,
  questionHint,
  tallyTiles,
  toggleArm,
} from "./ask.ts";
import { displayName } from "./names.ts";

let idx: TimetableIndex;
let round: SoloRound;
const T0 = 10 * 3600 + 20 * 60;

beforeAll(() => {
  const ds = loadDataset();
  idx = buildIndex(ds);
  const hub = ds.stations.findIndex((s) => s.id === "127"); // Times Sq–42 St
  let n = 0;
  round = createSoloRound(idx, { hub, hideStart: 36_000, random: () => (n++ * 0.618) % 1 });
});

const radar1: Question = { kind: "radar", miles: 1 };
const radarHalf: Question = { kind: "radar", miles: 0.5 };
const places = {
  complexName: (c: number) => displayName(idx.ds.complexes[c]?.name ?? "?"),
  borough: (c: number) => idx.ds.complexes[c]?.borough ?? "?",
};

function ask(r: SoloRound, q: Question, t: number): SoloRound {
  const res = applySoloIntent(r, { type: "ask", question: q }, t, idx);
  if (!res.ok) throw new Error(res.error);
  return res.round;
}

describe("arming a question", () => {
  it("arms a chip, swaps to another, and disarms the armed one on a second click", () => {
    expect(toggleArm(null, radar1)).toEqual(radar1);
    expect(toggleArm(radar1, radarHalf)).toEqual(radarHalf);
    expect(toggleArm(radar1, { kind: "radar", miles: 1 })).toBeNull();
  });

  it("stays armed across stops, and disarms once it's asked", () => {
    const before = soloView(round, T0, idx);
    // A stop later, nothing asked: still armed.
    const later = soloView(round, T0 + 120, idx);
    expect(keepArmed(radar1, before, later)).toEqual(radar1);
    const asked = soloView(ask(round, radar1, T0 + 120), T0 + 121, idx);
    expect(keepArmed(radar1, later, asked)).toBeNull();
    // Asking something else leaves it armed.
    const other = soloView(ask(round, { kind: "borough" }, T0 + 120), T0 + 121, idx);
    expect(keepArmed(radar1, later, other)).toEqual(radar1);
  });

  it("disarms when the round ends", () => {
    const res = applySoloIntent(round, { type: "giveUp" }, T0 + 60, idx);
    if (!res.ok) throw new Error(res.error);
    expect(
      keepArmed(radar1, soloView(round, T0, idx), soloView(res.round, T0 + 61, idx)),
    ).toBeNull();
  });
});

describe("what stops a question", () => {
  it("blocks every missing exit direction while keeping spot photos independently available", () => {
    const view = soloView(round, T0, idx);
    for (const look of ["N", "E", "S", "W", "up"] as const) {
      const q = { kind: "photo", from: "exit", look } as const;
      expect(askBlocker(q, view, T0, idx)).toBe("No exit photo this round.");
      expect(askBlocker(q, { ...view, hasExitPhoto: true }, T0, idx)).toBeNull();
    }
    const spot = { kind: "photo", from: "spot", look: "N" } as const;
    const withSpot = { ...view, hasSpot: true };
    expect(askBlocker(spot, withSpot, T0, idx)).toBe("Spot photos open at 10:35");
    expect(askBlocker(spot, withSpot, T0 + SPOT_PHOTOS_OPEN_SECONDS, idx)).toBeNull();
    expect(askBlocker(spot, view, T0 + SPOT_PHOTOS_OPEN_SECONDS, idx)).toBe(
      "No hiding spot this round.",
    );
    expect(
      askBlocker(spot, { ...withSpot, hasExitPhoto: true }, T0 + SPOT_PHOTOS_OPEN_SECONDS, idx),
    ).toBeNull();
  });

  it("says when a cooling category is ready, in words", () => {
    const r = ask(round, radar1, T0);
    const v = soloView(r, T0 + 60, idx);
    // Radar cools 15 min; the 5-min gap holds every other station question.
    expect(askBlocker(radarHalf, v, T0 + 60, idx)).toBe("Ready at 10:35");
    expect(askBlocker({ kind: "borough" }, v, T0 + 60, idx)).toBe("Ready at 10:25");
    expect(askBlocker({ kind: "borough" }, v, T0 + 5 * 60, idx)).toBeNull();
  });

  it("passes on the engine's reason for a question that can't be asked from here", () => {
    const v = soloView(round, T0, idx);
    expect(askBlocker({ kind: "thermometer" }, v, T0, idx)).toMatch(/Start a thermometer/);
    expect(askBlocker({ kind: "route", letter: "G" }, v, T0, idx)).toMatch(/stops where you are/);
    expect(askBlocker({ kind: "spotRadar", meters: 100 }, v, T0, idx)).toBeTruthy();
  });

  it("closes a vetoed question for the round and keeps the rest of its category", () => {
    const r = ask(round, radar1, T0);
    const vetoed: SoloRound = {
      ...r,
      asked: r.asked.map((a) => ({ ...a, answer: { vetoed: true as const } })),
    };
    const v = soloView(vetoed, T0 + ANSWER_WINDOW_SECONDS + 1, idx);
    const closed = closedKeys(v);
    expect(chipState(radar1, { armed: null, closed, cooling: false })).toBe("closed");
    expect(chipState(radarHalf, { armed: null, closed, cooling: true })).toBe("cooling");
    expect(chipState(radarHalf, { armed: radarHalf, closed, cooling: true })).toBe("armed");
    expect(askBlocker(radar1, v, T0 + 3600, idx)).toBe("Vetoed · closed this round");
    // Armed when the veto lands: disarmed.
    expect(keepArmed(radar1, soloView(r, T0 + 30, idx), v)).toBeNull();
  });

  it("doesn't close a question while its answer is still in the window", () => {
    const r = ask(round, radar1, T0);
    const vetoed = {
      ...r,
      asked: r.asked.map((a) => ({ ...a, answer: { vetoed: true as const } })),
    };
    expect(closedKeys(soloView(vetoed, T0 + 30, idx)).size).toBe(0);
  });
});

describe("the wainscot and the hints", () => {
  it("labels the confirm with the question and its price", () => {
    expect(askLabel(radar1)).toBe("Ask · Radar 1 mi");
    expect(askLabel({ kind: "tentacles", landmark: "hospital" })).toBe("Ask · Nearest · Hospitals");
    expect(askLabel({ kind: "photo", from: "spot", look: "N" })).toBe("Ask · Spot photo · N");
    expect(priceText(radar1)).toBe("+10 min to their score");
    expect(priceText({ kind: "tentacles", landmark: "museum" })).toBe("+20 min to their score");
    expect(priceText({ kind: "spotRadar", meters: 50 })).toBe("+3 min to their score");
  });

  it("says what a question does without counting what it would leave", () => {
    const v = soloView(round, T0, idx);
    const all: Question[] = [
      radar1,
      { kind: "route", letter: "Q" },
      { kind: "borough" },
      { kind: "express" },
      { kind: "moreRoutes" },
      { kind: "matching", landmark: "museum" },
      { kind: "measuring", landmark: "park" },
      { kind: "tentacles", landmark: "hospital" },
      { kind: "photo", from: "exit", look: "N" },
    ];
    for (const q of all) {
      const h = questionHint(q, v, T0, idx, places);
      const text = `${h.lead} ${h.rest}`;
      expect(text.length).toBeGreaterThan(20);
      // Never "keeps 23" or "would leave 6": no outcome counts.
      expect(text).not.toMatch(/\d+ stations?/);
      expect(text).not.toMatch(/(leave|leaves|left)\s+\d/);
    }
    expect(questionHint(radar1, v, T0, idx, places).lead).toBe(
      "A 1-mile ring round Times Sq–42 St, drawn on the map.",
    );
  });
});

describe("the onboarding hints", () => {
  const seen = (...ids: HintId[]) => new Set(ids);

  it("comes in order: before the first question, after the first answer, at three left", () => {
    const fresh = soloView(round, T0, idx);
    expect(currentHint(seen(), fresh)).toBe("hover");
    expect(currentHint(seen("hover"), fresh)).toBeNull();
    const r = ask(round, radar1, T0);
    // Asked, answer still in its window: nothing new to say.
    expect(currentHint(seen("hover"), soloView(r, T0 + 30, idx))).toBeNull();
    const answered = soloView(r, T0 + ANSWER_WINDOW_SECONDS + 1, idx);
    expect(currentHint(seen("hover"), answered)).toBe(
      answered.candidates.length <= 3 ? "three" : "ride",
    );
    expect(currentHint(seen("hover", "ride"), { ...answered, candidates: [1, 2, 3] })).toBe(
      "three",
    );
    expect(
      currentHint(seen("hover", "ride", "three"), { ...answered, candidates: [1] }),
    ).toBeNull();
  });

  it("says nothing once the round is over", () => {
    const res = applySoloIntent(round, { type: "giveUp" }, T0 + 60, idx);
    if (!res.ok) throw new Error(res.error);
    expect(currentHint(seen(), soloView(res.round, T0 + 61, idx))).toBeNull();
  });
  it("says them for this screen: the tab you're on, a touch screen, a round that ends below", () => {
    // The round opens on Travel, where the questions aren't: the first hint sends you to Ask.
    expect(hintText("hover", { tab: "travel" })).toBe("Open Ask and hover a question to start.");
    expect(hintText("hover", { tab: "ask" })).toBe("Hover a question to see what it does.");
    expect(hintText("hover", { tab: "travel", touch: true })).toBe(
      "Open Ask and tap a question to start.",
    );
    expect(hintText("hover", { tab: "ask", touch: true })).toBe(
      "Tap a question to see what it does.",
    );
    // There's no street search to go up to when the round ends at the station.
    expect(hintText("three", { stationOnly: true })).toBe("Three left. Ride to each in turn.");
    expect(hintText("three")).toBe(HINTS.three);
    expect(hintText("ride", { stationOnly: true, touch: true })).toBe(HINTS.ride);
    // Eight words or fewer, as the design asks (Interaction: onboarding).
    for (const t of [
      hintText("hover", { tab: "travel" }),
      hintText("hover", { tab: "travel", touch: true }),
      hintText("three", { stationOnly: true }),
    ])
      expect(t.split(" ").length).toBeLessThanOrEqual(8);
  });
});

describe("the score tally", () => {
  it("sets one tile per 5 game-min: time in ink, each question in its family", () => {
    let r = ask(round, radar1, T0);
    r = ask(r, { kind: "tentacles", landmark: "hospital" }, T0 + 5 * 60);
    const res = applySoloIntent(r, { type: "giveUp" }, T0 + 40 * 60, idx);
    if (!res.ok) throw new Error(res.error);
    const view = soloView(res.round, T0 + 40 * 60, idx);
    const tiles = tallyTiles(view);
    const score = view.result ? view.result.at - view.seekStart + view.bonusSeconds : 0;
    expect(tiles).toHaveLength(Math.round(score / 300));
    expect(tiles.slice(0, 8)).toEqual(Array(8).fill("ink"));
    expect(tiles.filter((x) => x === "radar")).toHaveLength(2);
    expect(tiles.filter((x) => x === "tent")).toHaveLength(4);
  });

  it("has nothing to show before the round ends", () => {
    expect(tallyTiles(soloView(round, T0, idx))).toEqual([]);
  });
});
