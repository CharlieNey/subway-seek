/**
 * Sound (DESIGN.md, Interaction: Sound; fun round 1 proposed 2026-11-27). Every sound is
 * synthesized here with the Web Audio API: no recordings, no audio files, nothing
 * licensed. The credits on the terms page say so, sound by sound.
 *
 * - Nothing plays until your first tap or key on the play page (browsers require it),
 *   and the home page never loads this.
 * - One master switch, kept in this browser, and one toggle per sound under it.
 * - Quiet by default: everything goes through one master gain.
 * - Events: "Someone's here", the doors (boarding and getting off), an answer landing, a
 *   card landing. Two continuous sounds: a low rumble while your train moves, and a pulse
 *   that quickens as the possible stations fall. With reduced motion asked for, the two
 *   continuous ones start off.
 */
import type { HiderView, SoloView } from "@subway-seek/engine";
import { create } from "zustand";
import type { World } from "./game.ts";
import { storageKey } from "./storage.ts";

/** `chime` is the doors: the id stays so a choice made before keeps. */
export type SoundId = "someone" | "chime" | "tock" | "card" | "rumble" | "pulse";

export const SOUNDS: { id: SoundId; label: string; source: string }[] = [
  {
    id: "someone",
    label: "Someone's here",
    source: "two struck square-wave tones, the second higher",
  },
  { id: "chime", label: "Doors", source: "two soft falling sine notes" },
  { id: "tock", label: "An answer lands", source: "a short falling sine, like a woodblock" },
  { id: "card", label: "A card lands", source: "a filtered noise flick over a low triangle tap" },
  { id: "rumble", label: "Riding", source: "brown noise through a low-pass filter, swaying" },
  { id: "pulse", label: "Closing in", source: "a soft low sine thump, quicker as stations fall" },
];

const CONTINUOUS: SoundId[] = ["rumble", "pulse"];

function defaults(): Record<SoundId, boolean> {
  // Not clearings.ts's reducedMotion: that module plays sounds, so importing it here loops.
  const calm =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    someone: true,
    chime: true,
    tock: true,
    card: true,
    rumble: !calm,
    pulse: !calm,
  };
}

const KEY = storageKey("sound");
const MASTER_KEY = storageKey("sound-on");
/** The master gain: quiet, since the game is mostly read in silence. */
const VOLUME = 0.55;

function load(): Record<SoundId, boolean> {
  try {
    return { ...defaults(), ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as object) };
  } catch {
    return defaults();
  }
}

function loadMaster(): boolean {
  try {
    return localStorage.getItem(MASTER_KEY) !== "off";
  } catch {
    return true;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Refused: the choice lasts until the page closes.
  }
}

export const useSound = create<{
  /** All sound on or off: the one-tap mute. */
  master: boolean;
  on: Record<SoundId, boolean>;
  set: (id: SoundId, on: boolean) => void;
  setMaster: (on: boolean) => void;
}>((set, get) => ({
  master: loadMaster(),
  on: load(),
  set: (id, on) => {
    const next = { ...get().on, [id]: on };
    set({ on: next });
    save(KEY, JSON.stringify(next));
    if (!on && CONTINUOUS.includes(id)) ambient.sync();
    // Turning one on plays it, so you know what you chose.
    if (on && get().master) preview(id);
  },
  setMaster: (on) => {
    set({ master: on });
    save(MASTER_KEY, on ? "on" : "off");
    if (on) {
      unlock();
      play("tock", true);
    }
    ambient.sync();
  },
}));

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let unlocked = false;

function audio(): { a: AudioContext; dest: GainNode } | null {
  if (!unlocked) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (!out) {
      out = ctx.createGain();
      out.gain.value = VOLUME;
      out.connect(ctx.destination);
    }
    return { a: ctx, dest: out };
  } catch {
    return null;
  }
}

function unlock() {
  unlocked = true;
  audio();
  ambient.sync();
}

/**
 * Wait for the first tap or key on this page before any sound (autoplay rules). Call
 * once from the play page; the home page never does.
 */
export function unlockOnFirstGesture(): () => void {
  if (unlocked) return () => {};
  const go = () => {
    unlock();
    off();
  };
  const off = () => {
    window.removeEventListener("pointerdown", go, true);
    window.removeEventListener("keydown", go, true);
  };
  window.addEventListener("pointerdown", go, true);
  window.addEventListener("keydown", go, true);
  return off;
}

/** One note: a shape, a pitch that may fall, a sharp attack and a decay. */
function note(
  a: AudioContext,
  dest: AudioNode,
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
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + decay + 0.02);
}

/** Noise samples: white, or brown (integrated, so the weight is in the lows). */
function noiseBuffer(a: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * seconds), a.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function strike(a: AudioContext, dest: AudioNode, id: SoundId) {
  const t = a.currentTime + 0.01;
  switch (id) {
    case "someone":
      // Hard and short: two struck square tones, the second higher.
      note(a, dest, t, { type: "square", from: 520, gain: 0.12, decay: 0.11 });
      note(a, dest, t + 0.09, { type: "square", from: 780, gain: 0.12, decay: 0.16 });
      return;
    case "chime":
      // Two soft notes, falling: the doors.
      note(a, dest, t, { type: "sine", from: 784, gain: 0.08, decay: 0.45 });
      note(a, dest, t + 0.32, { type: "sine", from: 659, gain: 0.08, decay: 0.6 });
      return;
    case "tock":
      // A tile set down: a short woodblock tock.
      note(a, dest, t, { type: "sine", from: 1100, to: 650, gain: 0.07, decay: 0.07 });
      return;
    case "card": {
      // A card flicked onto the table: a bright noise flick over a low tap.
      const src = a.createBufferSource();
      src.buffer = noiseBuffer(a, 0.12, false);
      const bp = a.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600;
      bp.Q.value = 0.9;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      src.connect(bp).connect(g).connect(dest);
      src.start(t);
      src.stop(t + 0.12);
      note(a, dest, t + 0.015, { type: "triangle", from: 220, to: 160, gain: 0.06, decay: 0.12 });
      return;
    }
    case "pulse":
      // A soft low thump, felt more than heard.
      note(a, dest, t, { type: "sine", from: 70, to: 46, gain: 0.16, decay: 0.22 });
      return;
    case "rumble":
      return;
  }
}

function allowed(id: SoundId): boolean {
  const s = useSound.getState();
  return s.master && s.on[id];
}

/** Play an event sound if it's on (or `anyway`, after a tap that asked for it). */
export function play(id: SoundId, anyway = false) {
  if (!anyway && !allowed(id)) return;
  const au = audio();
  if (!au) return;
  try {
    strike(au.a, au.dest, id);
  } catch {
    // No audio here: nothing to hear.
  }
}

/** A toggle switched on: the continuous ones play a moment of themselves. */
function preview(id: SoundId) {
  unlock();
  if (id === "rumble") {
    ambient.previewRumble();
    return;
  }
  play(id, true);
}

// --- The two continuous sounds --------------------------------------------------------

/** What the page wants playing; `sync` makes the audio match it, and the switches. */
const want = { riding: false, pulseEvery: null as number | null, visible: true };

const ambient = (() => {
  let rumble: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  let pulseTimer: ReturnType<typeof setTimeout> | null = null;
  const RUMBLE_GAIN = 0.05;

  const startRumble = (fadeIn = 0.8) => {
    const au = audio();
    if (!au || rumble) return;
    const { a, dest } = au;
    const src = a.createBufferSource();
    src.buffer = noiseBuffer(a, 2, true);
    src.loop = true;
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 110;
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(RUMBLE_GAIN, a.currentTime + fadeIn);
    // A slow sway, as a car does on the rails.
    const lfo = a.createOscillator();
    const depth = a.createGain();
    lfo.frequency.value = 0.7;
    depth.gain.value = RUMBLE_GAIN * 0.35;
    lfo.connect(depth).connect(gain.gain);
    src.connect(lp).connect(gain).connect(dest);
    src.start();
    lfo.start();
    rumble = { src, gain, lfo };
  };

  const stopRumble = (fadeOut = 0.6) => {
    if (!rumble || !ctx) return;
    const { src, gain, lfo } = rumble;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeOut);
    src.stop(now + fadeOut + 0.05);
    lfo.stop(now + fadeOut + 0.05);
    rumble = null;
  };

  const schedulePulse = () => {
    if (pulseTimer !== null) return;
    const beat = () => {
      pulseTimer = null;
      if (want.pulseEvery === null || !want.visible || !allowed("pulse")) return;
      play("pulse");
      pulseTimer = setTimeout(beat, want.pulseEvery * 1000);
    };
    pulseTimer = setTimeout(beat, (want.pulseEvery ?? 1) * 1000);
  };

  const sync = () => {
    const live = unlocked && want.visible;
    if (live && want.riding && allowed("rumble")) startRumble();
    else stopRumble();
    if (live && want.pulseEvery !== null && allowed("pulse")) schedulePulse();
    else if (pulseTimer !== null) {
      clearTimeout(pulseTimer);
      pulseTimer = null;
    }
  };

  const previewRumble = () => {
    if (rumble) return;
    startRumble(0.3);
    setTimeout(() => {
      if (!want.riding) stopRumble(0.5);
    }, 1400);
  };

  return { sync, previewRumble };
})();

/** Whether your own train is moving: the rumble follows it. */
export function setRiding(riding: boolean) {
  if (want.riding === riding) return;
  want.riding = riding;
  ambient.sync();
}

/** Seconds between pulses, or null for none. */
export function setPulse(every: number | null) {
  const was = want.pulseEvery;
  want.pulseEvery = every;
  if ((was === null) !== (every === null)) ambient.sync();
}

/** A hidden tab goes quiet; it picks up again when you come back. */
export function setPageVisible(visible: boolean) {
  want.visible = visible;
  ambient.sync();
}

/**
 * Seconds between pulses for `left` of `total` stations: none until half are gone, then
 * from 2.4 s down to 0.7 s as the last ones fall.
 */
export function pulseInterval(left: number, total: number): number | null {
  if (total <= 0 || left <= 0) return null;
  const share = left / total;
  if (share > 0.5) return null;
  return Math.round((0.7 + 1.7 * (share / 0.5)) * 100) / 100;
}

/** Whether your own train is between its departure and its arrival at time t. */
export function ridingAt(world: Pick<World, "ds">, view: SoloView | HiderView, t: number): boolean {
  // hide.ts's ownTransit, without its import of the game store.
  const s = "role" in view && view.role === "hider" ? (view as HiderView).self : view.seeker;
  if (s.kind !== "train") return false;
  const trip = world.ds.trips[s.trip];
  const dep = trip?.dep[s.from];
  const arr = trip?.arr[s.to];
  return dep !== undefined && arr !== undefined && t >= dep && t < arr;
}
