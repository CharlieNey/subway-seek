/** Explicit fixtures for UI QA, especially photos the bot never asks. Not imported by the app. */
import {
  advanceSolo,
  applySoloIntent,
  buildIndex,
  createHideRound,
  type HumanHider,
  hiderView,
  type TimetableIndex,
} from "@stand-clear/engine";
export const HIDE_SCENES = [
  "hiding",
  "timesUp",
  "finding",
  "locked",
  "question",
  "zone",
  "photo",
  "draw",
] as const;
export type HideScene = (typeof HIDE_SCENES)[number];
export function hideFixture(idx: TimetableIndex, scene: HideScene) {
  const hub = idx.ds.stations.findIndex((s) => s.id === "127");
  let round = createHideRound(idx, { hub, hideStart: 36000, random: () => 0.42 });
  if (scene === "hiding") return { round, t: 36000, view: hiderView(round, 36000, idx) };
  const complex =
    round.reachable.find((c) => idx.ds.complexes[c]?.name.includes("Union")) ??
    (round.reachable[1] as number);
  const c = idx.ds.complexes[complex];
  if (!c) throw new Error("fixture station");
  const station = c.stations[0] as number;
  const spot = { lat: c.lat + 0.0005, lon: c.lon, pano: "fixture-only" };
  const platform = { kind: "platform" as const, station, since: 37200, arrivedDir: null };
  const street = { kind: "street" as const, complex, exit: 0, at: spot, since: 37320, up: 37320 };
  const locked = ["locked", "question", "zone", "draw"].includes(scene);
  round = {
    ...round,
    hider: complex,
    spot: locked ? spot : null,
    photoExit: spot.pano,
    hand: ["veto", "randomize", "late5", "tourist", "shed"],
    human: {
      ...(round.human as HumanHider),
      station,
      transit: scene === "timesUp" ? platform : street,
      exits: { 0: spot },
      lock: locked ? { at: 37380, cause: "hideHere" } : null,
    },
    hiderTrail: [...round.hiderTrail, { t: 37200, state: platform }, { t: 37320, state: street }],
  };
  let t = scene === "timesUp" ? 37200 : scene === "photo" ? 38200 : 37500;
  if (scene === "question" || scene === "photo") {
    const r = applySoloIntent(
      round,
      {
        type: "ask",
        question:
          scene === "photo"
            ? { kind: "photo", from: "spot", look: "N" }
            : { kind: "radar", miles: 1 },
      },
      t,
      idx,
    );
    if (!r.ok) throw new Error(r.error);
    round = r.round;
    t += 18;
  }
  if (scene === "zone") {
    const seeker = { ...street, at: { ...spot, lat: spot.lat + 0.0007 }, since: t, up: t };
    round = {
      ...round,
      seeker,
      seekerTrail: [...round.seekerTrail, { t, state: seeker }],
      human: {
        ...(round.human as HumanHider),
        entered: { at: t, complex, exit: 0, walked: false },
      },
    };
  }
  if (scene === "draw")
    round = {
      ...round,
      human: {
        ...(round.human as HumanHider),
        draw: { cards: ["late5", "tourist", "work15"], keep: 1, until: t + 60, revision: 1 },
      },
    };
  round = advanceSolo(round, t, idx);
  return { round, t, view: hiderView(round, t, idx) };
}
export { buildIndex };
