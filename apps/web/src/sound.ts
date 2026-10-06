/**
 * Sound is events (DESIGN.md, Interaction): "Someone's here" gets a hard sound, on by
 * default and the only one that is. The departure chime and the answer tock are optional
 * and off. No soundtrack, no audio files: each is a few oscillators, synthesized here.
 * The choice is kept in this browser.
 */
import { create } from "zustand";

export type SoundId = "someone" | "chime" | "tock";

export const SOUNDS: { id: SoundId; label: string }[] = [
  { id: "someone", label: "Someone's here" },
  { id: "chime", label: "Your train departs" },
  { id: "tock", label: "An answer lands" },
];

const DEFAULTS: Record<SoundId, boolean> = { someone: true, chime: false, tock: false };
const KEY = "standClear.sound";

function load(): Record<SoundId, boolean> {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as object) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const useSound = create<{
  on: Record<SoundId, boolean>;
  set: (id: SoundId, on: boolean) => void;
}>((set, get) => ({
  on: load(),
  set: (id, on) => {
    const next = { ...get().on, [id]: on };
    set({ on: next });
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Refused: the choice lasts until the page closes.
    }
    // Turning one on plays it, so you know what you chose.
    if (on) play(id, true);
  },
}));

let ctx: AudioContext | null = null;

/** One note: a shape, a pitch that may fall, a sharp attack and a decay. */
function note(
  a: AudioContext,
  at: number,
  {
    type,
    from,
    to = from,
    gain,
    decay,
  }: { type: OscillatorType; from: number; to?: number; gain: number; decay: number },
) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, at + decay);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + decay + 0.02);
}

/** Play a sound if it's on (or `anyway`, to preview it). Quiet if audio isn't allowed. */
export function play(id: SoundId, anyway = false) {
  if (!anyway && !useSound.getState().on[id]) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime + 0.01;
    if (id === "someone") {
      // Hard and short: two struck square tones, the second higher.
      note(ctx, t, { type: "square", from: 520, gain: 0.12, decay: 0.11 });
      note(ctx, t + 0.09, { type: "square", from: 780, gain: 0.12, decay: 0.16 });
    } else if (id === "chime") {
      // Two soft notes, falling: the doors are closing behind you.
      note(ctx, t, { type: "sine", from: 784, gain: 0.08, decay: 0.45 });
      note(ctx, t + 0.32, { type: "sine", from: 659, gain: 0.08, decay: 0.6 });
    } else {
      // A tile set down: a short woodblock tock.
      note(ctx, t, { type: "sine", from: 1100, to: 650, gain: 0.07, decay: 0.07 });
    }
  } catch {
    // No audio here: nothing to hear.
  }
}
