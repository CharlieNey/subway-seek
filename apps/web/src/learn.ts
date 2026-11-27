/**
 * What this browser has learned (DESIGN.md, Interaction: the playable round, 2026-11-27).
 * A first round keeps the hider's score minutes, the prices and the less-used questions out
 * of sight; the guided first round shows once. Both are remembered here, never on the server.
 */
import { create } from "zustand";
import { storageKey } from "./storage.ts";

const PLAYED_KEY = storageKey("played");
const GUIDE_KEY = storageKey("guide");

/** New: not yet shown. Done: shown to the end. Skipped: turned away (no teaching help). */
export type GuideState = "new" | "done" | "skipped";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage refused: the first round's view may show again. Nothing breaks.
  }
}

export interface Learn {
  /** A seeking round has ended in this browser: no longer a first round. */
  played: boolean;
  guide: GuideState;
  markPlayed: () => void;
  finishGuide: () => void;
  /** "Skip the guide": no guide, and no teaching suggestion, this round. */
  skipGuide: () => void;
  /** "Play the guided round again", from How it plays. */
  resetGuide: () => void;
}

export const useLearn = create<Learn>((set) => ({
  played: read(PLAYED_KEY) === "1",
  guide: ((g) => (g === "done" || g === "skipped" ? g : "new"))(read(GUIDE_KEY)),
  markPlayed: () => {
    write(PLAYED_KEY, "1");
    set({ played: true });
  },
  finishGuide: () => {
    write(GUIDE_KEY, "done");
    set({ guide: "done" });
  },
  skipGuide: () => {
    write(GUIDE_KEY, "skipped");
    set({ guide: "skipped" });
  },
  resetGuide: () => {
    write(GUIDE_KEY, null);
    set({ guide: "new" });
  },
}));

/** A first round: nothing finished in this browser yet. */
export function useFirstRound(): boolean {
  return !useLearn((s) => s.played);
}
