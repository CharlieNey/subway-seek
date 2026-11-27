import { mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOG_MAX_AGE_DAYS, startedAt, sweepLogs } from "./logSweep.ts";

const DAY = 86_400_000;
const now = Date.parse("2026-11-27T12:00:00Z");

/** A log named for `startedDaysAgo`, last written `writtenDaysAgo`. */
function log(dir: string, name: string, writtenDaysAgo: number) {
  const path = join(dir, name);
  writeFileSync(path, "{}\n");
  const t = (now - writtenDaysAgo * DAY) / 1000;
  utimesSync(path, t, t);
}

describe("the log sweep", () => {
  it("reads a log's start from its name", () => {
    expect(startedAt("2026-11-27T15-47-45-426Z-hlfgf.jsonl")).toBe(
      Date.parse("2026-11-27T15:47:45.426Z"),
    );
    expect(startedAt("notes.jsonl")).toBeNull();
  });

  it(`deletes logs older than ${LOG_MAX_AGE_DAYS} days and keeps the rest`, () => {
    const dir = mkdtempSync(join(tmpdir(), "subway-seek-sweep-"));
    log(dir, "2026-07-01T10-00-00-000Z-old01.jsonl", 149); // old by name and by write
    log(dir, "2026-08-28T10-00-00-000Z-edge1.jsonl", 91); // just past 90 days
    log(dir, "2026-08-30T10-00-00-000Z-keep1.jsonl", 89); // just inside
    log(dir, "2026-11-27T10-00-00-000Z-today.jsonl", 0);
    // Started long ago but written today: a restored round still running.
    log(dir, "2026-07-01T10-00-00-000Z-alive.jsonl", 0);
    // Not a match log, however old.
    log(dir, "README.txt", 400);
    mkdirSync(join(dir, "nested.jsonl"));
    expect(sweepLogs(dir, now)).toBe(2);
    expect(readdirSync(dir).sort()).toEqual([
      "2026-07-01T10-00-00-000Z-alive.jsonl",
      "2026-08-30T10-00-00-000Z-keep1.jsonl",
      "2026-11-27T10-00-00-000Z-today.jsonl",
      "README.txt",
      "nested.jsonl",
    ]);
  });

  it("keeps a recently started log even if its write time is old", () => {
    const dir = mkdtempSync(join(tmpdir(), "subway-seek-sweep-"));
    log(dir, "2026-11-20T10-00-00-000Z-clock.jsonl", 300); // a skewed file clock
    expect(sweepLogs(dir, now)).toBe(0);
  });

  it("does nothing without a folder", () => {
    expect(sweepLogs(join(tmpdir(), "no-such-folder-subway-seek"), now)).toBe(0);
  });
});
