import { loadDataset } from "@stand-clear/data/node";
import {
  buildIndex,
  createHideRound,
  type HidingSpot,
  type HumanHider,
  type SoloRound,
  startClock,
} from "@stand-clear/engine";
import { expect, it } from "vitest";
import { restoreHideRound, storeHideRound } from "./hidePersistence.ts";
import { deserializeGame, serializeGame } from "./store.ts";

it("saves active hide panoramas by ID, rehydrates walks and preserves private deadlines", async () => {
  const ds = loadDataset();
  const idx = buildIndex(ds);
  const hub = ds.stations.findIndex((s) => s.id === "127");
  const r = createHideRound(idx, { hub, hideStart: 36000, random: () => 0.42 });
  const complex = ds.stations[hub]?.complex as number;
  const a: HidingSpot = { lat: 40.753123456, lon: -73.985123456, pano: "a" };
  const b: HidingSpot = { lat: 40.754123456, lon: -73.984123456, pano: "b" };
  const walk = {
    kind: "walking" as const,
    reason: "street" as const,
    start: 37200,
    end: 37300,
    fromPoint: [a.lat, a.lon] as [number, number],
    toPoint: [b.lat, b.lon] as [number, number],
    fromComplex: complex,
    dest: { kind: "street" as const, complex, exit: 0, at: b, since: 37300 },
  };
  const initial = { kind: "street" as const, complex, exit: 0, at: a, since: 37100 };
  const round: SoloRound = {
    ...r,
    hider: complex,
    human: {
      ...(r.human as HumanHider),
      station: hub,
      transit: walk,
      walkFrom: a,
      exits: { 0: a },
      draw: { cards: ["veto", "late5"], keep: 1, until: 37260, revision: 2 },
      handRevision: 2,
    },
    hiderTrail: [
      { t: 37100, state: initial },
      { t: 37200, state: walk },
    ],
    seeker: initial,
    seekerTrail: [{ t: 37100, state: initial }],
  };
  const stored = storeHideRound(round, ds);
  const saved = serializeGame({
    round: stored,
    clock: startClock(37201, 6, 1000),
    lastSeq: 7,
    logId: "test",
    cardsLogged: 0,
    stationLogged: false,
    seekerLastActionAt: 37200,
  });
  expect(saved).not.toContain(String(a.lat));
  expect(saved).not.toContain(String(a.lon));
  expect(saved).not.toContain(String(b.lat));
  expect(saved).not.toContain('"beliefs"');
  const back = deserializeGame(saved);
  if (!("storage" in back.round)) throw new Error("expected stored hide");
  const calls: string[] = [];
  const hydrated = await restoreHideRound(back.round, async (id) => {
    calls.push(id);
    return id === "a" ? a : b;
  });
  expect(hydrated).toEqual(round);
  expect(calls.sort()).toEqual(["a", "b"]);
  expect(back.seekerLastActionAt).toBe(37200);
});

it("a missing panorama fails restoration rather than making up a location", async () => {
  await expect(
    restoreHideRound(
      {
        storage: "hide-panorama-ids-v1",
        value: { spot: { pano: "gone", __streetPoint: { pano: "gone" } } },
      },
      async () => null,
    ),
  ).rejects.toThrow("could not be restored");
});
