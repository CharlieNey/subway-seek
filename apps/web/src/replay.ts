/**
 * End-of-round replay: both routes on one game-time timeline, from the bot leaving the
 * start (10:00) to the end of the round, compressed into about 25 real seconds.
 * The map reads `useReplay` each frame; while it's active, trains are drawn at replay
 * time too, so the whole city rewinds.
 */
import {
  type LonLat,
  possibleSpots,
  type SoloView,
  sampleTrail,
  searchGrid,
} from "@stand-clear/engine";
import { create } from "zustand";
import type { World } from "./game.ts";
import { isHider } from "./hide.ts";
import { type LogEvent, replayLog } from "./replayLog.ts";

export const REPLAY_REAL_SECONDS = 25;

interface ReplayStore {
  active: boolean;
  playing: boolean;
  start: number;
  end: number;
  t: number;
  hider: { t: number; p: LonLat }[];
  seeker: { t: number; p: LonLat }[];
  /** Everything that happened, for the log, the map's question squares and the ticks. */
  log: LogEvent[];
  /** When the seek began and when you first came up at their station (null if never). */
  seekStart: number;
  footStart: number | null;
  /** When the hider reached their spot, for the zone ring (null if they never did). */
  settled: number | null;
  humanHider: boolean;
  /**
   * `street: false` for a round kept without its street positions (history.ts, keptView):
   * the on-foot answers' shares of the circle can't be worked out again.
   */
  open: (world: World, view: SoloView, opts?: { street?: boolean }) => void;
  close: () => void;
  toggle: () => void;
  seek: (t: number) => void;
}

export const useReplay = create<ReplayStore>((set, get) => ({
  active: false,
  playing: false,
  start: 0,
  end: 0,
  t: 0,
  hider: [],
  seeker: [],
  log: [],
  seekStart: 0,
  footStart: null,
  settled: null,
  humanHider: false,
  open: (world, view, { street = true } = {}) => {
    if (!view.replay || !view.result) return;
    const start = view.hideStart;
    const end = view.result.at;
    // What share of the search circle each on-foot answer left.
    const spotsLeft = (at: number) => {
      const a = view.asked.find((x) => x.answerAt === at);
      const c = a ? world.ds.complexes[a.ctx.origin.complex] : undefined;
      if (!c) return null;
      const asked = view.asked.filter((x) => x.answerAt <= at);
      const left = possibleSpots(
        world.ds,
        c,
        asked,
        view.candidates,
        view.footpath,
        at + 0.001,
        isHider(view),
      );
      return left.length / Math.max(1, searchGrid(c).length);
    };
    const log = replayLog(world.ds, world.idx, view, street ? spotsLeft : undefined);
    const reached = log.find((e) => e.text === "Hider reaches their spot");
    set({
      active: true,
      playing: true,
      start,
      end,
      t: start,
      hider: sampleTrail(world.geo, view.replay.hider, start, end, 10),
      seeker: sampleTrail(world.geo, view.replay.seeker, start, end, 10),
      log,
      seekStart: view.seekStart,
      footStart: view.stationFoundAt,
      settled: isHider(view) ? (view.lock?.at ?? null) : (reached?.t ?? null),
      humanHider: isHider(view),
    });
  },
  close: () => set({ active: false, playing: false, hider: [], seeker: [], log: [] }),
  toggle: () => {
    const { playing, t, end, start } = get();
    // Play from the start again once it has finished.
    set({ playing: !playing, t: !playing && t >= end ? start : t });
  },
  seek: (t) => {
    const { start, end } = get();
    set({ t: Math.min(end, Math.max(start, t)) });
  },
}));

if (import.meta.env.DEV) (window as unknown as { __replay: typeof useReplay }).__replay = useReplay;

/** Advance replay time by `realMs`; stops at the end. */
export function stepReplay(realMs: number) {
  const r = useReplay.getState();
  if (!r.active || !r.playing) return;
  const rate = (r.end - r.start) / REPLAY_REAL_SECONDS; // game seconds per real second
  const t = Math.min(r.end, r.t + (realMs / 1000) * rate);
  useReplay.setState({ t, playing: t < r.end });
}

/** The path up to time t, with an interpolated head. */
export function pathUntil(samples: { t: number; p: LonLat }[], t: number): LonLat[] {
  const out: LonLat[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] as { t: number; p: LonLat };
    if (s.t <= t) {
      out.push(s.p);
      continue;
    }
    const prev = samples[i - 1];
    if (prev) {
      const f = (t - prev.t) / (s.t - prev.t);
      out.push([prev.p[0] + f * (s.p[0] - prev.p[0]), prev.p[1] + f * (s.p[1] - prev.p[1])]);
    }
    break;
  }
  return out;
}
