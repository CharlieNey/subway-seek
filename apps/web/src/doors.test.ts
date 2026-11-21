import { describe, expect, it } from "vitest";
import { doorOf, resumable, type StoredSession, tokenFor, withoutDoor } from "./doors.ts";

const daily: StoredSession = { token: "d", live: true, mode: "daily", daily: 23, at: 1000 };

describe("doors", () => {
  it("reads the link", () => {
    expect(doorOf("")).toEqual({ kind: "resume" });
    expect(doorOf("?daily")).toEqual({ kind: "daily" });
    expect(doorOf("?practice&difficulty=hard")).toEqual({ kind: "practice", difficulty: "hard" });
    expect(doorOf("?practice&difficulty=silly")).toEqual({ kind: "practice" });
    expect(doorOf("?replay&map=maplibre")).toEqual({ kind: "replay" });
    expect(doorOf("?replay=yesterday")).toEqual({ kind: "replay", yesterday: true });
    expect(doorOf("?replay=abc-123")).toEqual({ kind: "replay", hideId: "abc-123" });
  });

  it("drops the door and keeps the dev overrides", () => {
    expect(withoutDoor("?practice&difficulty=easy&map=maplibre")).toBe("?map=maplibre");
    expect(withoutDoor("?daily")).toBe("");
  });

  it("picks up a daily still going, and starts practice fresh", () => {
    expect(tokenFor({ kind: "daily" }, daily)).toBe("d");
    expect(tokenFor({ kind: "daily" }, { ...daily, mode: "practice" })).toBeNull();
    expect(tokenFor({ kind: "daily" }, { ...daily, live: false })).toBeNull();
    expect(tokenFor({ kind: "practice" }, daily)).toBeNull();
    expect(tokenFor({ kind: "resume" }, { ...daily, mode: "practice" })).toBe("d");
    expect(tokenFor({ kind: "resume" }, null)).toBeNull();
  });

  it("offers Resume only within the grace period, for today's daily", () => {
    expect(resumable(daily, 23, 1000 + 179_000, 180_000)).toBe(true);
    expect(resumable(daily, 23, 1000 + 181_000, 180_000)).toBe(false);
    expect(resumable(daily, 24, 1500, 180_000)).toBe(false);
    expect(resumable({ ...daily, live: false }, 23, 1500, 180_000)).toBe(false);
  });
});
