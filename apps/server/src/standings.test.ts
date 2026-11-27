import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DailyScores, finishedDaily, scoresFromLogs } from "./standings.ts";

const line = (o: object) => JSON.stringify({ at: 0, ...o });
const start = (date: string, mode = "daily") =>
  line({ event: "round_start", mode, daily: mode === "daily" ? { date, number: 1 } : null });
const end = (result: string, hiderScoreMin: number | null) =>
  line({ event: "round_end", result, hiderScoreMin });

describe("today's finished dailies", () => {
  it("reads a found or timed-out daily from its log, and nothing else", () => {
    expect(finishedDaily([start("2026-11-27"), end("found", 97)])).toEqual({
      date: "2026-11-27",
      minutes: 97,
    });
    expect(finishedDaily([start("2026-11-27"), end("timeout", 150)])?.minutes).toBe(150);
    expect(finishedDaily([start("2026-11-27"), end("gaveUp", 40)])).toBeNull();
    expect(finishedDaily([start("2026-11-27", "practice"), end("found", 30)])).toBeNull();
    expect(finishedDaily([start("2026-11-27")])).toBeNull();
    // Played again in a browser that already had today's result: not counted.
    const replay = line({
      event: "round_start",
      mode: "daily",
      daily: { date: "2026-11-27", number: 54, replay: true },
    });
    expect(finishedDaily([replay, end("found", 12)])).toBeNull();
    expect(finishedDaily(["not json", start("2026-11-27"), end("found", 50)])?.minutes).toBe(50);
  });

  it("counts each round once, however often its end is logged", () => {
    const s = new DailyScores();
    s.add("2026-11-27", 97, "a");
    s.add("2026-11-27", 97, "a");
    s.add("2026-11-27", 60.4, "b");
    expect(s.histogram("2026-11-27").n).toBe(2);
    expect(s.histogram("2026-11-27").counts[60]).toBe(1);
    expect(s.histogram("2026-11-27").counts[97]).toBe(1);
  });

  it("serves minutes only, and keeps two dates", () => {
    const s = new DailyScores();
    s.add("2026-11-25", 10, "x");
    s.add("2026-11-26", 20, "y");
    s.add("2026-11-27", 30, "z");
    expect(s.histogram("2026-11-25").n).toBe(0);
    expect(s.histogram("2026-11-27")).toEqual({
      n: 1,
      counts: [...Array(30).fill(0), 1],
    });
  });

  it("rebuilds from the last two days of logs, by file name", () => {
    const dir = mkdtempSync(join(tmpdir(), "standings-"));
    writeFileSync(
      join(dir, "2026-11-27T15-47-45-426Z-aaaaa.jsonl"),
      [start("2026-11-27"), end("found", 97)].join("\n"),
    );
    writeFileSync(
      join(dir, "2026-11-28T01-10-00-000Z-bbbbb.jsonl"),
      [start("2026-11-27"), end("timeout", 140), end("timeout", 140)].join("\n"),
    );
    writeFileSync(
      join(dir, "2026-11-20T10-00-00-000Z-ccccc.jsonl"),
      [start("2026-11-20"), end("found", 5)].join("\n"),
    );
    const s = scoresFromLogs(dir, new Date("2026-11-28T02:00:00Z"));
    expect(s.histogram("2026-11-27").n).toBe(2);
    expect(s.histogram("2026-11-20").n).toBe(0);
    // The boot count and a later end logged by the same round don't double up.
    s.add("2026-11-27", 97, "2026-11-27T15-47-45-426Z-aaaaa");
    expect(s.histogram("2026-11-27").n).toBe(2);
  });
});
