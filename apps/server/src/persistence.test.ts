import { loadDataset } from "@subway-seek/data/node";
import {
  buildIndex,
  createHideRound,
  createSeekerDriver,
  pauseClock,
  startClock,
} from "@subway-seek/engine";
import { expect, it, vi } from "vitest";
import { storeHideRound } from "./hidePersistence.ts";
import { createSessionPersistence } from "./persistence.ts";
import { SessionStore } from "./sessions.ts";

it("encodes only changed rounds but saves clock, seq, action-floor and drop changes", () => {
  const ds = loadDataset();
  const round = createHideRound(buildIndex(ds), { hub: 0, hideStart: 36000 });
  const game = {
    round,
    clock: startClock(36000, 6, 0),
    driver: createSeekerDriver(),
    lastSeq: 0,
    log: { id: "test" },
    cardsLogged: 0,
    stationLogged: false,
  };
  const session = new SessionStore<typeof game>({ graceMs: 1000 }).create(game);
  const save = vi.fn();
  const encode = vi.fn(storeHideRound);
  const persist = createSessionPersistence(ds, save, encode);
  persist(session, 0);
  persist(session, 1000);
  game.driver = { ...game.driver, waitUntil: 37000 };
  persist(session, 2000);
  expect(save).toHaveBeenCalledTimes(1);
  expect(encode).toHaveBeenCalledTimes(1);
  game.driver = { ...game.driver, lastActionAt: 36018 };
  persist(session, 3000);
  game.lastSeq++;
  persist(session, 4000);
  game.clock = pauseClock(game.clock, 5000);
  persist(session, 5000);
  session.droppedAt = 6000;
  persist(session, 6000);
  expect(save).toHaveBeenCalledTimes(5);
  expect(encode).toHaveBeenCalledTimes(1);
  game.round = { ...game.round, hand: ["late5"] };
  persist(session, 7000);
  expect(encode).toHaveBeenCalledTimes(2);
  expect(save.mock.lastCall?.[0].game).toMatchObject({ seekerLastActionAt: 36018, lastSeq: 1 });
  game.round = { ...game.round, hand: ["work15"] };
  encode.mockImplementationOnce(() => {
    throw new Error("metadata");
  });
  expect(() => persist(session, 8000)).toThrow("metadata");
  persist(session, 9000);
  expect(save).toHaveBeenCalledTimes(7);
  game.lastSeq++;
  save.mockImplementationOnce(() => {
    throw new Error("disk");
  });
  expect(() => persist(session, 10000)).toThrow("disk");
  persist(session, 11000);
  expect(save.mock.lastCall?.[0].game.lastSeq).toBe(2);
  persist(session, 12000);
  expect(save).toHaveBeenCalledTimes(9);
});
