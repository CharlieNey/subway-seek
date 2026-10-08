import { loadDataset } from "@stand-clear/data/node";
import { beforeAll, expect, it } from "vitest";
import { seededRandom } from "./daily.ts";
import {
  createSeekerDriver,
  driveSeeker,
  rejectSeekerAction,
  SEEKER_LEVELS,
} from "./seekerDriver.ts";
import { applySoloIntent, createSoloRound, type SoloRound, soloView } from "./solo.ts";
import { buildIndex, type TimetableIndex } from "./timetable.ts";

let idx: TimetableIndex;
let round: SoloRound;
beforeAll(() => {
  idx = buildIndex(loadDataset());
  round = createSoloRound(idx, {
    hub: idx.ds.stations.findIndex((s) => s.id === "127"),
    hideStart: 36000,
    random: seededRandom(1),
  });
});
it("waits until seeking and issues one action per three running seconds", () => {
  const t = round.seekStart;
  let driver = createSeekerDriver();
  let r = round;
  const view = soloView(r, t, idx);
  expect(driveSeeker(view, driver, t - 1, idx).intent).toBeNull();
  const first = driveSeeker(view, driver, t, idx);
  expect(first.intent).not.toBeNull();
  expect(driver.lastActionAt).toBe(-Infinity);
  if (!first.intent) throw new Error("missing action");
  const applied = applySoloIntent(r, first.intent, t, idx);
  if (!applied.ok) throw new Error(applied.error);
  r = applied.round;
  driver = first.driver;
  expect(driveSeeker(soloView(r, t + 17, idx), driver, t + 17, idx).intent).toBeNull();
  expect(driveSeeker(soloView(r, t + 18, idx), driver, t + 18, idx).intent?.type).toBe("ask");
});
it("uses the shared speed and cannot bank actions through a pause", () => {
  const t = round.seekStart;
  const previous = createSeekerDriver(t);
  const v = soloView(round, t, idx);
  expect(driveSeeker(v, previous, t + 8, idx, 3).intent).toBeNull();
  expect(driveSeeker(v, previous, t + 9, idx, 3).intent).not.toBeNull();
  expect(driveSeeker(v, previous, t, idx).intent).toBeNull();
});
it("a restored driver rebuilds its own memory and never bursts through missed actions", () => {
  const t = round.seekStart + 600;
  const driver = createSeekerDriver(t - 300);
  const v = soloView(round, t, idx);
  const step = driveSeeker(v, driver, t, idx);
  expect(step.intent).not.toBeNull();
  expect(driveSeeker(v, step.driver, t, idx).intent).toBeNull();
  expect(createSeekerDriver(step.driver.lastActionAt).memory.beliefs.size).toBe(0);
});
it("respects waitUntil unless a new public event invalidates the wait", () => {
  const t = round.seekStart;
  const v = soloView(round, t, idx);
  const first = driveSeeker(v, createSeekerDriver(), t, idx);
  const driver = { ...first.driver, waitUntil: t + 100 };
  expect(driveSeeker(v, driver, t + 20, idx).intent).toBeNull();
  expect(
    driveSeeker({ ...v, candidates: v.candidates.slice(0, 8) }, driver, t + 20, idx).intent,
  ).not.toBeNull();
});
it("backs off after a rejection and stops at the result", () => {
  const t = round.seekStart;
  const v = soloView(round, t, idx);
  const first = driveSeeker(v, createSeekerDriver(), t, idx);
  if (!first.intent) throw new Error("missing action");
  const rejected = rejectSeekerAction(first.driver, v, first.intent, "Unavailable", t, idx);
  expect(driveSeeker(v, rejected, t + 30, idx).intent).toBeNull();
  expect(
    driveSeeker({ ...v, result: { kind: "timeout", at: t } }, rejected, t + 60, idx).waitUntil,
  ).toBe(Infinity);
});
it("keeps the approved thresholds separate from bot-hider difficulty bands", () => {
  expect(Object.values(SEEKER_LEVELS).map((x) => x.endgameAt)).toEqual([4, 3, 2]);
  expect(Object.values(SEEKER_LEVELS).map((x) => x.minBits)).toEqual([0.25, 0.25, 0.25]);
});
