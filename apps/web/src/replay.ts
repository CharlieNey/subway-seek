/**
 * End-of-round replay: both routes on one game-time timeline, from the bot leaving the
 * start (10:00) to the end of the round, compressed into about 25 real seconds.
 * The map reads `useReplay` each frame; while it's active, trains are drawn at replay
 * time too, so the whole city rewinds.
 */
import type { LonLat, SoloView } from "@stand-clear/engine";
import { describeAnswer, sampleTrail } from "@stand-clear/engine";
import { create } from "zustand";
import type { World } from "./game.ts";

export const REPLAY_REAL_SECONDS = 25;

export interface ReplayEvent {
  t: number;
  p: LonLat;
  label: string;
}

interface ReplayStore {
  active: boolean;
  playing: boolean;
  start: number;
  end: number;
  t: number;
  hider: { t: number; p: LonLat }[];
  seeker: { t: number; p: LonLat }[];
  events: ReplayEvent[];
  open: (world: World, view: SoloView) => void;
  close: () => void;
  toggle: () => void;
  seek: (t: number) => void;
}

const QUESTION_NAME: Record<string, string> = {
  radar: "Radar",
  thermometer: "Thermometer",
  route: "Route",
  borough: "Borough",
  express: "Express",
  moreRoutes: "More routes",
  photo: "Photo",
};

export const useReplay = create<ReplayStore>((set, get) => ({
  active: false,
  playing: false,
  start: 0,
  end: 0,
  t: 0,
  hider: [],
  seeker: [],
  events: [],
  open: (world, view) => {
    if (!view.replay || !view.result) return;
    const start = view.hideStart;
    const end = view.result.at;
    set({
      active: true,
      playing: true,
      start,
      end,
      t: start,
      hider: sampleTrail(world.geo, view.replay.hider, start, end, 10),
      seeker: sampleTrail(world.geo, view.replay.seeker, start, end, 10),
      events: view.asked.map((a) => ({
        t: a.at,
        p: [a.ctx.origin.lon, a.ctx.origin.lat] as LonLat,
        label: `${QUESTION_NAME[a.q.kind] ?? "?"}: ${describeAnswer(a.answer)}`,
      })),
    });
  },
  close: () => set({ active: false, playing: false, hider: [], seeker: [], events: [] }),
  toggle: () => {
    const { playing, t, end, start } = get();
    // Play from the start again once it has finished.
    set({ playing: !playing, t: !playing && t >= end ? start : t });
  },
  seek: (t) => set({ t }),
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
