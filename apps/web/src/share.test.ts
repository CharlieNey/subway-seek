import type { SoloView } from "@stand-clear/engine";
import { describe, expect, it } from "vitest";
import { shareText } from "./share.ts";

const view = (over: Partial<SoloView>): SoloView => ({
  mode: "daily",
  daily: { date: "2026-10-05", number: 1 },
  hub: 0,
  hideStart: 36_000,
  seekStart: 37_200,
  seekEnd: 44_400,
  reachable: [],
  candidates: [],
  seeker: { kind: "platform", station: 0, since: 37_200, arrivedDir: null },
  asked: [],
  thermometer: null,
  cooldownUntil: 37_200,
  bonusSeconds: 0,
  result: null,
  hider: null,
  replay: null,
  ...over,
});
const asked = (kind: "radar" | "borough") => ({
  q: kind === "radar" ? { kind, miles: 2 } : { kind },
  ctx: { origin: { lat: 0, lon: 0, complex: 0 }, baseline: null },
  answer: false,
  at: 0,
  remaining: 1,
});

describe("shareText", () => {
  it("summarises a found daily without spoiling answers", () => {
    const text = shareText(
      view({
        result: { kind: "found", at: 37_200 + 32 * 60 },
        asked: [asked("radar"), asked("borough")],
        bonusSeconds: 1200,
        hider: 5,
      }),
    );
    expect(text).toBe(
      "Stand Clear #1 🚇\nFound it in 32 min · 2 questions\n📡🗽\nHider score: 52 min",
    );
  });

  it("handles a timeout and a practice round", () => {
    const text = shareText(
      view({ mode: "practice", daily: null, result: { kind: "timeout", at: 44_400 }, hider: 5 }),
    );
    expect(text).toBe(
      "Stand Clear (practice) 🚇\nDidn't find it in 2 h 00 min · 0 questions\nHider score: 2 h 00 min",
    );
  });

  it("says when you gave up", () => {
    const text = shareText(view({ result: { kind: "gaveUp", at: 37_200 + 600 }, hider: 5 }));
    expect(text).toBe("Stand Clear #1 🚇\nGave up after 10 min · 0 questions\nHider score: 10 min");
  });

  it("is empty while the round is running", () => {
    expect(shareText(view({}))).toBe("");
  });
});
