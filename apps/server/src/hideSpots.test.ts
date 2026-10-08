import type { Dataset } from "@stand-clear/data";
import { offsetMeters } from "@stand-clear/engine";
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
