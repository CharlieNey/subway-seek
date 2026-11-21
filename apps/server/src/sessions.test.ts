import { type GameClock, gameTime, pauseClock, startClock } from "@subway-seek/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Conn, SessionStore } from "./sessions.ts";

const GRACE = 3 * 60 * 1000;
const conn = (): Conn & { closed: [number, string][] } => {
  const closed: [number, string][] = [];
  return { closed, close: (code, reason) => closed.push([code, reason]) };
};

describe("sessions", () => {
  let expired: string[];
  let store: SessionStore<{ clock: GameClock }>;
  let n: number;

  beforeEach(() => {
    vi.useFakeTimers();
    expired = [];
    n = 0;
    store = new SessionStore({
      graceMs: GRACE,
      onExpire: (s) => expired.push(s.token),
      newToken: () => `t${++n}`,
    });
  });
  afterEach(() => vi.useRealTimers());

  it("pauses the clock on a drop and resumes it at the same game time", () => {
    const s = store.create({ clock: startClock(36000, 6, 0) });
    const a = conn();
    store.attach(s, a, 0);
    // 10 s real at 6× = 60 game-s, then the connection drops.
    expect(store.detach(s, a, 10_000)).toBe(true);
    expect(gameTime(s.game.clock, 10_000)).toBe(36060);
    // Away for 2 min: the clock hasn't moved.
    expect(gameTime(s.game.clock, 130_000)).toBe(36060);
    vi.advanceTimersByTime(120_000);
    expect(store.get("t1")).toBe(s);
    store.attach(s, conn(), 130_000);
    expect(gameTime(s.game.clock, 130_000)).toBe(36060);
    expect(gameTime(s.game.clock, 140_000)).toBe(36120);
    // Back in time: the grace timer is off.
    vi.advanceTimersByTime(GRACE);
    expect(expired).toEqual([]);
  });

  it("keeps a solo round's clock running through a drop", () => {
    const solo = new SessionStore<{ clock: GameClock }>({
      graceMs: GRACE,
      pauseOnDrop: false,
      newToken: () => "solo",
    });
    const s = solo.create({ clock: startClock(36000, 6, 0) });
    const a = conn();
    solo.attach(s, a, 0);
    expect(solo.detach(s, a, 10_000)).toBe(true);
    // Away for 2 min: the round went on without them, 720 game-s.
    expect(gameTime(s.game.clock, 130_000)).toBe(36780);
    expect(solo.all()).toEqual([s]);
    expect(solo.connected()).toEqual([]);
    solo.attach(s, conn(), 130_000);
    expect(gameTime(s.game.clock, 140_000)).toBe(36840);
  });

  it("drops the session once the grace period runs out", () => {
    const s = store.create({ clock: startClock(36000, 6, 0) });
    const a = conn();
    store.attach(s, a, 0);
    store.detach(s, a, 1000);
    vi.advanceTimersByTime(GRACE - 1);
    expect(store.get("t1")).toBe(s);
    vi.advanceTimersByTime(1);
    expect(store.get("t1")).toBeUndefined();
    expect(expired).toEqual(["t1"]);
    expect(store.size).toBe(0);
  });

  it("keeps a practice round the player paused paused", () => {
    const s = store.create({ clock: pauseClock(startClock(36000, 6, 0), 5000) });
    const a = conn();
    store.attach(s, a, 5000);
    store.detach(s, a, 20_000);
    store.attach(s, conn(), 30_000);
    expect(s.game.clock.pausedAt).not.toBeNull();
    expect(gameTime(s.game.clock, 60_000)).toBe(36030);
  });

  it("lets a second connection take the session over", () => {
    const s = store.create({ clock: startClock(36000, 6, 0) });
    const a = conn();
    const b = conn();
    store.attach(s, a, 0);
    expect(store.attach(s, b, 1000)).toBe(a);
    expect(s.conn).toBe(b);
    // The replaced connection closing later changes nothing: no pause, no grace.
    expect(store.detach(s, a, 2000)).toBe(false);
    expect(s.game.clock.pausedAt).toBeNull();
    vi.advanceTimersByTime(GRACE * 2);
    expect(store.get("t1")).toBe(s);
    expect(store.connected()).toEqual([s]);
  });

  it("restarts the grace period on every drop", () => {
    const s = store.create({ clock: startClock(36000, 6, 0) });
    const a = conn();
    store.attach(s, a, 0);
    store.detach(s, a, 0);
    vi.advanceTimersByTime(GRACE - 1000);
    const b = conn();
    store.attach(s, b, GRACE - 1000);
    store.detach(s, b, GRACE - 1000);
    vi.advanceTimersByTime(GRACE - 1);
    expect(store.get("t1")).toBe(s);
    vi.advanceTimersByTime(1);
    expect(store.get("t1")).toBeUndefined();
  });

  it("knows only the tokens it handed out", () => {
    store.create({ clock: startClock(36000, 6, 0) });
    expect(store.get("nope")).toBeUndefined();
    expect(store.get(null)).toBeUndefined();
    expect(store.get("t1")).toBeDefined();
  });
});
