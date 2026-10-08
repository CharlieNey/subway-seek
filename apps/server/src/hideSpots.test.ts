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
