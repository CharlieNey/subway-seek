import { loadDataset } from "@subway-seek/data/node";
import { buildIndex, type HiderView, hiderView, type Transit } from "@subway-seek/engine";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { GAME_NAME } from "./brand.ts";
import { hideFixture } from "./hideFixtures.ts";
import {
  keptView,
  loadHideReplays,
  loadHideResults,
  loadResults,
  saveHideResult,
} from "./history.ts";
import { replayLog } from "./replayLog.ts";
import { shareText } from "./share.ts";

const ds = loadDataset();
const idx = buildIndex(ds);
let view: HiderView;
beforeAll(() => {
  const f = hideFixture(idx, "locked");
  view = hiderView({ ...f.round, result: { kind: "found", at: 39000 } }, 39000, idx);
});
afterEach(() => vi.unstubAllGlobals());
function storage() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
  });
  return map;
}
it("keeps hider history separate, with an idempotent score and an unscored incomplete replay", () => {
  storage();
  saveHideResult(ds, { ...view, roundId: "one" }, "first");
  saveHideResult(ds, { ...view, roundId: "one" }, "duplicate");
  saveHideResult(ds, { ...view, roundId: "two", incomplete: "left", scoreSeconds: null }, "");
  expect(Object.keys(loadHideResults())).toEqual(["one"]);
  expect(loadHideResults().one?.share).toBe("first");
  expect(Object.keys(loadHideReplays()).sort()).toEqual(["one", "two"]);
  expect(loadResults()).toEqual({});
});
it("removes Google locations in every hider field, including an exit walk and live previews", () => {
  const complex = view.hider as number;
  const spot = { pano: "google-id", lat: 40.123456789, lon: -73.123456789 };
  const self: Transit = {
    kind: "walking",
    reason: "exit",
    start: 37200,
    end: 37320,
    fromPoint: [ds.complexes[complex]?.lat ?? 0, ds.complexes[complex]?.lon ?? 0],
    toPoint: [spot.lat, spot.lon],
    fromComplex: complex,
    dest: { kind: "street", complex, exit: 0, since: 37320, at: spot },
  };
  const unsafe: HiderView = {
    ...view,
    self,
    seeker: self,
    spot,
    thermometer: { ...spot, complex },
    asked: [
      {
        q: { kind: "radar", miles: 1 },
        ctx: { origin: { ...spot, complex }, baseline: { ...spot, complex } },
        answer: true,
        at: 37200,
        answerAt: 37260,
        remaining: 1,
      },
    ],
    spotPhoto: { pano: spot.pano, heading: 0, pitch: 5, fov: 90, url: "secret-signed-url" },
    ownTrail: [{ t: 37200, state: self }],
    seekerTrail: [{ t: 37200, state: self }],
    replay: { hider: [{ t: 37200, state: self }], seeker: [{ t: 37200, state: self }] },
  };
  const kept = keptView(ds, unsafe);
  const json = JSON.stringify(kept);
  expect(json).not.toContain(String(spot.lat));
  expect(json).not.toContain(String(spot.lon));
  expect(json).not.toContain("secret-signed-url");
  expect(kept.spot).toBeNull();
  expect(kept.spotPhoto?.pano).toBe("google-id");
  expect(kept.lock).toEqual(view.lock);
  expect(kept.roundId).toBe(view.roundId);
});
it("shares the hider score once, with no daily identity, and never shares an incomplete round", () => {
  const share = shareText(view, "Times Sq");
  expect(share).toContain(`${GAME_NAME} (you hide · normal) · from Times Sq`);
  expect(share).toContain("Found in 30 min");
  expect(share).toContain(`My score: 35 min`);
  expect(shareText({ ...view, incomplete: "left" } as HiderView)).toBe("");
});
it("labels the played trail as you, logs the lock, and marks an abandoned replay incomplete", () => {
  const log = replayLog(ds, idx, view);
  expect(log.some((e) => e.text === "Locked in" && e.mark.kind === "you")).toBe(true);
  const incomplete = replayLog(ds, idx, {
    ...view,
    incomplete: "left",
    scoreSeconds: null,
  } as HiderView);
  expect(incomplete.at(-1)?.text).toBe("Incomplete");
});
