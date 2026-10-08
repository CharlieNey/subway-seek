import { loadDataset } from "@stand-clear/data/node";
import {
  buildIndex,
  createHideRound,
  createSeekerDriver,
  defaultHiderExit,
  gameTime,
  hiderView,
  seededRandom,
  setHiderExit,
  startClock,
  type TimetableIndex,
} from "@stand-clear/engine";
import { beforeAll, expect, it, vi } from "vitest";
import { storeHideRound } from "./hidePersistence.ts";
import { SessionStore } from "./sessions.ts";
import { type TickGame, tick } from "./tick.ts";

let idx: TimetableIndex;
beforeAll(() => {
  idx = buildIndex(loadDataset());
});
function fixture() {
  const hub = idx.ds.stations.findIndex((s) => s.id === "127");
  const station = idx.ds.stations.findIndex((s) => s.id === "132");
  let round = createHideRound(idx, { hub, hideStart: 36000, random: seededRandom(12) });
  const complex = idx.ds.stations[station]?.complex;
  if (complex === undefined || !round.human) throw new Error("station or human");
  round = {
    ...round,
    hider: complex,
    human: {
      ...round.human,
      station,
      transit: { kind: "platform", station, since: round.seekStart, arrivedDir: null },
    },
  };
  const exit = defaultHiderExit(round, idx);
  const coords = idx.ds.complexes[round.hider]?.exits[exit];
  if (!coords) throw new Error("exit");
  const [lat, lon] = coords;
  round = setHiderExit(round, exit, { lat, lon, pano: "exit" });
  const game: TickGame = {
    round,
    clock: startClock(round.seekStart, 6, 0),
    driver: createSeekerDriver(),
    log: { write: vi.fn() },
    lastSeq: 0,
    stationLogged: false,
    shown: "",
  };
  const session = new SessionStore<TickGame>({ graceMs: 1000 }).create(game);
  session.conn = { close: vi.fn() };
  const deps = {
    idx,
    exitSpot: vi.fn().mockResolvedValue(null),
    seekerStreetTarget: vi.fn().mockResolvedValue(null),
    persist: vi.fn(),
    sendState: vi.fn(),
    logCards: vi.fn(),
    logEnd: vi.fn(),
    wallTime: () => 0,
    viewNow: (g: TickGame, now: number) => hiderView(g.round, gameTime(g.clock, now), idx),
  };
  return { game, session, deps };
}

it("still pushes live state when encoding a hide round throws", async () => {
  const { game, session, deps } = fixture();
  // A point with no public coordinate or panorama recipe reproduces the encoder failure.
  game.round = { ...game.round, thermometer: { lat: 0, lon: 0, complex: game.round.hider } };
  deps.persist.mockImplementation(() => storeHideRound(game.round, idx.ds));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await tick(session, 0, deps);
    expect(deps.persist).toHaveBeenCalledOnce();
    expect(deps.sendState).toHaveBeenCalledExactlyOnceWith(session, 0, 0);
    expect(error).toHaveBeenCalled();
    expect(game.driver?.lastActionAt).toBe(game.round.seekStart);
  } finally {
    error.mockRestore();
  }
});

it("runs an actual seeker action through tick and waits three real seconds for the next", async () => {
  const { game, session, deps } = fixture();
  await tick(session, 0, deps);
  expect(game.log.write).toHaveBeenCalledWith(
    "intent",
    expect.objectContaining({ side: "seeker", ok: true }),
  );
  const actions = () =>
    vi.mocked(game.log.write).mock.calls.filter(([event]) => event === "intent");
  expect(actions()).toHaveLength(1);
  expect(game.driver?.lastActionAt).toBe(game.round.seekStart);
  await tick(session, 2999, deps);
  expect(actions()).toHaveLength(1);
  await tick(session, 3000, deps);
  expect(actions()).toHaveLength(2);
  expect(game.round.asked).toHaveLength(1);
  expect(game.round.human?.pending).toHaveLength(1);
  expect(game.round.asked[0]?.answerAt).toBe(game.round.seekStart + 18 + 60);
  expect(deps.sendState).toHaveBeenCalled();
});
