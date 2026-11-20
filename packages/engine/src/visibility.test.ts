/**
 * The one promise the server makes the seeker (DESIGN.md, Engineering: one visibility
 * filter): until the round ends, nothing they're sent names the hider's station, spot or
 * hand, and an answer says nothing before its window ends. Checked on every frame a bot
 * seeker sees across whole rounds from every hub at every difficulty, the way the server
 * builds them, not on hand-picked states.
 */
import type { Dataset } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import { beforeAll, describe, expect, it } from "vitest";
import { hashString, seededRandom } from "./daily.ts";
import { distanceMeters, offsetMeters } from "./geo.ts";
import { DIFFICULTIES } from "./hardness.ts";
import { HUB_STATION_IDS } from "./hubs.ts";
import { runSeeker } from "./seekerBot.ts";
import {
  createSoloRound,
  placeHider,
  type SoloRound,
  type SoloView,
  SPOT_REVEAL_METERS,
  soloView,
} from "./solo.ts";
import { buildIndex, type TimetableIndex } from "./timetable.ts";
import { resolve, streetPoint } from "./transit.ts";

const TEN = 10 * 3600;
let ds: Dataset;
let idx: TimetableIndex;

beforeAll(() => {
  ds = loadDataset();
  idx = buildIndex(ds);
});

/** A seeded round from a hub, the hider placed 60–360 m from their station, as the sims do. */
function round(hubId: string, difficulty: (typeof DIFFICULTIES)[number]): SoloRound {
  const hub = ds.stations.findIndex((s) => s.id === hubId);
  const random = seededRandom(hashString(`visibility|${hubId}|${difficulty}`));
  const r = createSoloRound(idx, { hub, hideStart: TEN, random, difficulty });
  const c = ds.complexes[r.hider];
  if (!c) throw new Error("no hider complex");
  const angle = random() * 2 * Math.PI;
  const meters = 60 + random() * 300;
  const spot = offsetMeters(c, meters * Math.cos(angle), meters * Math.sin(angle));
  return placeHider(r, { ...spot, pano: "test" }, idx);
}

/** Everything a mid-round frame must not say. Returns the broken rules, empty if none. */
function leaks(view: SoloView, truth: SoloRound, t: number): string[] {
  const out: string[] = [];
  if (view.hider !== null) out.push("hider");
  if (view.hiderHand !== null) out.push("hiderHand");
  if (view.replay !== null) out.push("replay");
  if (view.stationFoundAt !== null) out.push("stationFoundAt");
  if (!view.candidates.includes(truth.hider)) out.push("candidates exclude the hider");
  for (const a of view.asked) {
    if (a.answerAt > t && (a.answer !== null || a.remaining !== null)) out.push("early answer");
  }
  for (const e of view.cardEvents) if (e.t > t) out.push(`future card ${e.card}`);
  if (view.spotNearby) {
    // Shown only to a seeker standing on the street within the reveal distance.
    const s = resolve(view.seeker, t, idx);
    const near =
      s.kind === "street" &&
      truth.spot !== null &&
      distanceMeters(streetPoint(s, idx), truth.spot) <= SPOT_REVEAL_METERS + 0.01;
    if (!near) out.push("spotNearby out of sight");
  }
  return out;
}

describe("the seeker's view", () => {
  it("never shows the hider's station, spot or hand before the round ends", () => {
    let frames = 0;
    let rounds = 0;
    const broken = new Map<string, number>();
    for (const difficulty of DIFFICULTIES) {
      for (const hubId of HUB_STATION_IDS) {
        const start = round(hubId, difficulty);
        const { round: end } = runSeeker(start, idx, undefined, 5000, (view, _step, t) => {
          frames++;
          for (const rule of leaks(view, start, t)) {
            const key = `${rule} (${difficulty}, hub ${hubId})`;
            broken.set(key, (broken.get(key) ?? 0) + 1);
          }
        });
        rounds++;
        // Once it's over, the answer is shown.
        const after = soloView(end, end.result?.at ?? end.seekEnd, idx);
        if (end.result) expect(after.hider).toBe(end.hider);
      }
    }
    expect([...broken.keys()]).toEqual([]);
    expect(rounds).toBe(HUB_STATION_IDS.length * DIFFICULTIES.length);
    expect(frames).toBeGreaterThan(rounds * 10);
  }, 60_000);
});
