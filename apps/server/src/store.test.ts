import { loadDataset } from "@stand-clear/data/node";
import {
  applySoloIntent,
  buildIndex,
  createSoloRound,
  type SoloRound,
  soloView,
  startClock,
} from "@stand-clear/engine";
import { describe, expect, it } from "vitest";
import { deserializeGame, restorable, type SavedGame, SessionDb, serializeGame } from "./store.ts";

const idx = buildIndex(loadDataset());
const hub = idx.ds.stations.findIndex((s) => s.id === "127");

function game(): SavedGame & { round: SoloRound } {
  let round = createSoloRound(idx, { hub, hideStart: 36000, random: () => 0.42 });
  const asked = applySoloIntent(
    round,
    { type: "ask", question: { kind: "radar", miles: 1 } },
    round.seekStart + 30,
    idx,
  );
  if (asked.ok) round = asked.round;
  return {
    round,
    clock: startClock(round.seekStart, 6, 1_700_000_000_000),
    lastSeq: 3,
    logId: "2026-10-07T00-00-00-000Z-abcde",
    cardsLogged: 0,
    stationLogged: false,
  };
}

describe("session store", () => {
  it("round-trips a game through JSON, -Infinity included", () => {
    const g = game();
    const back = deserializeGame(serializeGame(g));
    if ("storage" in back.round) throw new Error("Expected a solo round");
    expect(back.round.lastCurseAt).toBe(Number.NEGATIVE_INFINITY);
    expect(back).toEqual(g);
    // The restored round plays on exactly as the saved one would.
    const t = g.round.seekStart + 120;
    expect(soloView(back.round, t, idx)).toEqual(soloView(g.round, t, idx));
  });

  it("saves, updates, lists and deletes sessions", () => {
    const db = new SessionDb(":memory:");
    const g = game();
    db.save({ token: "a", game: g, droppedAt: null, updatedAt: 1000 });
    db.save({ token: "b", game: g, droppedAt: 500, updatedAt: 900 });
    expect(db.size).toBe(2);
    expect(db.all().map((s) => s.token)).toEqual(["b", "a"]); // oldest first
    db.save({ token: "a", game: { ...g, lastSeq: 9 }, droppedAt: 1200, updatedAt: 1200 });
    const a = db.all().find((s) => s.token === "a");
    expect(a?.game.lastSeq).toBe(9);
    expect(a?.droppedAt).toBe(1200);
    db.delete("b");
    expect(db.all().map((s) => s.token)).toEqual(["a"]);
    db.close();
  });

  it("restores only sessions still inside their grace period", () => {
    const g = game();
    const grace = 3 * 60 * 1000;
    const now = 10_000_000;
    const saved = [
      { token: "fresh", game: g, droppedAt: now - 1000, updatedAt: now - 1000 },
      { token: "stale", game: g, droppedAt: now - grace - 1, updatedAt: now - grace - 1 },
      // Connected when the server went down: counts as dropped at its last save.
      { token: "live", game: g, droppedAt: null, updatedAt: now - 5000 },
      { token: "old-live", game: g, droppedAt: null, updatedAt: now - grace - 5000 },
    ];
    expect(restorable(saved, now, grace).map((s) => s.token)).toEqual(["fresh", "live"]);
  });
});
