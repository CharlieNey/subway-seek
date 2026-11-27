/**
 * Not here (DESIGN.md, Interaction: the playable round, 2026-11-27). In a round that ends at
 * the station, reaching the hider's station is the find. So standing on a platform of a
 * station that could be theirs, with the round still going, means it isn't theirs. The
 * browser keeps those stations for the round, and the count, the map and the next move
 * leave them out.
 *
 * Nothing here comes from the server but the seeker's own view: the round not ending is
 * the answer, which the seeker knows anyway. The engine's candidates are unchanged.
 */
import { resolve, type SoloView, type TimetableIndex } from "@subway-seek/engine";
import { create } from "zustand";
import { isHider } from "./hide.ts";
import { storageKey } from "./storage.ts";
import { roundKey } from "./voice.ts";

/**
 * How long you stand on the platform before it counts, in game seconds (5 s real). The
 * server ends a round on its 1 s tick, so this never says "Not here" at their station.
 */
export const NOT_HERE_AFTER_SECONDS = 30;

/** The station you've just shown isn't theirs, or null. */
export function checkedNow(view: SoloView, t: number, idx: TimetableIndex): number | null {
  if (!view.stationOnly || view.result || isHider(view) || t < view.seekStart) return null;
  const s = resolve(view.seeker, t, idx);
  if (s.kind !== "platform" || t - s.since < NOT_HERE_AFTER_SECONDS) return null;
  const c = idx.ds.stations[s.station]?.complex;
  return c !== undefined && view.candidates.includes(c) ? c : null;
}

/** The stations still possible, less the ones you've stood in. */
export function stillPossible(view: SoloView, notHere: readonly number[]): number[] {
  if (notHere.length === 0) return view.candidates;
  const out = new Set(notHere);
  return view.candidates.filter((c) => !out.has(c));
}

const KEY = storageKey("not-here");

interface Saved {
  round: string;
  complexes: number[];
}

function load(): Saved | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Saved | null;
  } catch {
    return null;
  }
}

function save(saved: Saved | null): void {
  try {
    if (saved) sessionStorage.setItem(KEY, JSON.stringify(saved));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Refused: a reload forgets them, and the stations show as possible again.
  }
}

export const useNotHere = create<{
  round: string | null;
  complexes: number[];
  /** Keep up with the round: start it, add a station, or forget it once it's over. */
  sync: (view: SoloView, checked: number | null) => void;
}>((set, get) => {
  const saved = load();
  return {
    round: saved?.round ?? null,
    complexes: saved?.complexes ?? [],
    sync: (view, checked) => {
      if (view.result || isHider(view) || !view.stationOnly) {
        if (get().round !== null) {
          save(null);
          set({ round: null, complexes: [] });
        }
        return;
      }
      const round = roundKey(view);
      const kept = get().round === round ? get().complexes : [];
      const complexes = checked !== null && !kept.includes(checked) ? [...kept, checked] : kept;
      if (round === get().round && complexes === get().complexes) return;
      save({ round, complexes });
      set({ round, complexes });
    },
  };
});

/** The stations you've stood in this round (none once it's over). */
export function useNotHereList(view: SoloView | null): number[] {
  const { round, complexes } = useNotHere();
  return view && round === roundKey(view) && !view.result ? complexes : [];
}
