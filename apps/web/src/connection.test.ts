import { describe, expect, it } from "vitest";
import {
  attemptFailed,
  type Link,
  LOST_TRIES,
  linkScreen,
  MAX_WAIT_MS,
  retryDelayMs,
  SLOW_MS,
  startAttempt,
} from "./connection.ts";

const refused = { code: 1006, opened: false };

describe("the link to the server", () => {
  it("shows the board while the first attempt is under way, then says it's slow", () => {
    const link = startAttempt({ kind: "idle" }, 0);
    expect(linkScreen({ kind: "idle" }, false, 0)).toEqual({
      kind: "board",
      status: "waiting",
      seconds: 0,
    });
    expect(linkScreen(link, false, 3000)).toEqual({
      kind: "board",
      status: "connecting",
      seconds: 3,
    });
    expect(linkScreen(link, false, SLOW_MS + 6000)).toEqual({
      kind: "board",
      status: "slow",
      seconds: 14,
    });
  });

  it("turns refused attempts before the round into the plaque, with growing waits", () => {
    let link: Link = startAttempt({ kind: "idle" }, 1000);
    link = attemptFailed(link, refused, 1200, false);
    expect(link).toMatchObject({ kind: "waiting", tries: 1, wait: 2000, until: 3200 });
    const s = linkScreen(link, false, 1200);
    expect(s).toMatchObject({
      kind: "unreachable",
      midRound: false,
      attempt: 2,
      inSeconds: 2,
      tilesLeft: 2,
      tries: 1,
      firstTryAt: 1000,
    });
    link = startAttempt(link, 3200);
    expect(linkScreen(link, false, 3300)).toMatchObject({ kind: "unreachable", inSeconds: null });
    link = attemptFailed(link, refused, 3300, false);
    expect(link).toMatchObject({ tries: 2, wait: 4000 });
  });

  it("never waits longer than the ten-tile timer", () => {
    for (let tries = 1; tries < 30; tries++) {
      expect(retryDelayMs(tries, true)).toBeLessThanOrEqual(MAX_WAIT_MS);
      expect(retryDelayMs(tries, false)).toBeLessThanOrEqual(MAX_WAIT_MS);
      expect(retryDelayMs(tries + 1, true)).toBeGreaterThanOrEqual(retryDelayMs(tries, true));
    }
  });

  it("mid-round, counts five tries in the band, then shows the plaque", () => {
    // Open, then the connection drops: the first try goes at once.
    let link: Link = attemptFailed({ kind: "open" }, { code: 1006, opened: true }, 50_000, true);
    expect(link).toMatchObject({ kind: "waiting", until: 50_000, tries: 0 });
    let now = 50_000;
    for (let attempt = 1; attempt <= LOST_TRIES; attempt++) {
      link = startAttempt(link, now);
      expect(linkScreen(link, true, now)).toEqual({ kind: "lost", attempt, tilesLeft: 0 });
      now += 100;
      link = attemptFailed(link, refused, now, true);
      if (attempt < LOST_TRIES) {
        const wait = retryDelayMs(attempt, true);
        expect(linkScreen(link, true, now)).toEqual({
          kind: "lost",
          attempt: attempt + 1,
          tilesLeft: wait / 1000,
        });
        now += wait;
      }
    }
    expect(linkScreen(link, true, now)).toMatchObject({
      kind: "unreachable",
      midRound: true,
      attempt: LOST_TRIES + 1,
      firstTryAt: 50_000,
    });
  });

  it("stays put when another tab has the round, and shows nothing when open", () => {
    expect(linkScreen({ kind: "takenOver" }, true, 0)).toEqual({ kind: "takenOver" });
    expect(linkScreen({ kind: "open" }, true, 0)).toEqual({ kind: "none" });
    // Coming back from another tab starts a fresh streak.
    expect(startAttempt({ kind: "takenOver" }, 9)).toMatchObject({ tries: 0, firstTryAt: 9 });
  });
});
