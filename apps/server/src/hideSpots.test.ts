import type { Dataset } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import { buildIndex, createHideRound, offsetMeters, setHiderExit } from "@stand-clear/engine";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
async function load() {
  vi.stubEnv("GOOGLE_STREETVIEW_SERVER_KEY", "test");
  return import("./hideSpots.ts");
}
const response = (copyright = "© Google") => ({
  json: async () => ({ status: "OK", pano_id: "p", location: { lat: 40.7, lng: -74 }, copyright }),
});
it("checks Google's canonical point, retries one lookup error and rejects invented coordinates", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(response());
  vi.stubGlobal("fetch", fetch);
  const { verifyHideSpot } = await load();
  expect(await verifyHideSpot(40.7, -74, "p")).toEqual({ lat: 40.7, lon: -74, pano: "p" });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(await verifyHideSpot(41, -74, "p")).toBeNull();
});
it("refuses contributor imagery and a second failed lookup", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response("A photographer"));
  vi.stubGlobal("fetch", fetch);
  const { verifyHideSpot } = await load();
  expect(await verifyHideSpot(40.7, -74, "p")).toBeNull();
  fetch.mockRejectedValue(new Error("network"));
  expect(await verifyHideSpot(40.7, -74, "p")).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("keeps an exit's verified panorama inside the zone, with only the all-exits-outside exception", async () => {
  const center = { lat: 40.7, lon: -74 };
  const edge = offsetMeters(center, 390, 0);
  const outside = offsetMeters(center, 410, 0);
  const ds = { complexes: [{ ...center, exits: [[edge.lat, edge.lon]] }] } as unknown as Dataset;
  const fetch = vi.fn().mockResolvedValue({
    json: async () => ({
      status: "OK",
      pano_id: "edge",
      location: { lat: outside.lat, lng: outside.lon },
      copyright: "© Google",
    }),
  });
  vi.stubGlobal("fetch", fetch);
  const { exitSpot } = await load();
  expect(await exitSpot(ds, 0, 0)).toBeNull();
  const station = ds.complexes[0];
  if (!station) throw new Error("station");
  station.exits[0] = [outside.lat, outside.lon];
  expect(await exitSpot(ds, 0, 0)).toEqual({ ...outside, pano: "edge" });
});

it("reuses active-round exit metadata and rate-limits only uncached legal exit lookups", async () => {
  const { prepareHiderExit } = await load();
  const ds = loadDataset();
  const idx = buildIndex(ds);
  const station = ds.stations.findIndex((s) => s.id === "132");
  const complex = ds.stations[station]?.complex;
  if (complex === undefined) throw new Error("station");
  const initial = createHideRound(idx, { hub: station, hideStart: 36000 });
  if (!initial.human) throw new Error("human");
  const round = {
    ...initial,
    hider: complex,
    human: { ...initial.human, station },
  };
  const point = { lat: 40.7, lon: -74, pano: "verified-exit" };
  const lookup = vi.fn().mockResolvedValue(point);
  const allow = vi.fn().mockReturnValue(true);
  const first = await prepareHiderExit(round, 0, round.seekStart, idx, allow, lookup);
  expect(first.round.human?.exits[0]).toEqual(point);
  expect(lookup).toHaveBeenCalledExactlyOnceWith(ds, complex, 0);
  expect(allow).toHaveBeenCalledTimes(1);
  expect(await prepareHiderExit(first.round, 0, round.seekStart, idx, allow, lookup)).toEqual(
    first,
  );
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(allow).toHaveBeenCalledTimes(1);
  allow.mockReturnValue(false);
  expect(await prepareHiderExit(round, 0, round.seekStart, idx, allow, lookup)).toEqual({
    round,
    limited: true,
  });
  expect(lookup).toHaveBeenCalledTimes(1);
  // Early, nonexistent and off-platform exits never spend a metadata request.
  for (const [r, exit, t] of [
    [round, 0, round.seekStart - 1],
    [round, 999, round.seekStart],
    [
      {
        ...round,
        human: { ...round.human, lock: { at: round.seekStart, cause: "hideHere" as const } },
      },
      0,
      round.seekStart,
    ],
  ] as const) {
    await prepareHiderExit(r, exit, t, idx, allow, lookup);
  }
  const place = ds.complexes[complex];
  if (!place) throw new Error("complex");
  const outside = offsetMeters(place, 500, 0);
  place.exits.push([outside.lat, outside.lon]);
  await prepareHiderExit(round, place.exits.length - 1, round.seekStart, idx, allow, lookup);
  expect(allow).toHaveBeenCalledTimes(2);
  expect(lookup).toHaveBeenCalledTimes(1);
  // A cached exit remains usable when the lookup budget is spent.
  expect(
    (await prepareHiderExit(setHiderExit(round, 0, point), 0, round.seekStart, idx, allow, lookup))
      .limited,
  ).toBe(false);
});
