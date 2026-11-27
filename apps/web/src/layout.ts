/**
 * How a round lays out on this screen (DESIGN.md, Phones). A computer puts the panel
 * beside the map; a phone stacks the map over the panel, which becomes a sheet that folds
 * to give the map more room. The pure rules are here, tested; the hooks read the window.
 */
import { useEffect, useState } from "react";
import { create } from "zustand";

/** The board is 380 px; a round beside it needs at least 480 px of map. */
export const COMPUTER_MIN_WIDTH = 860;
/** Under this height, a phone on its side keeps the map beside the panel. */
const SIDEWAYS_MAX_HEIGHT = 560;

export type PlayLayout = "wide" | "stack";

/**
 * Wide: the panel beside the map. Stack: the map over the panel. A phone on its side is
 * too short to stack, so it gets the map beside the panel even below 860 px.
 */
export function playLayout(width: number, height: number): PlayLayout {
  if (width >= COMPUTER_MIN_WIDTH) return "wide";
  if (height < SIDEWAYS_MAX_HEIGHT && width > height) return "wide";
  return "stack";
}

/**
 * Whether the street endgame fits: Street View, the map and the board side by side. Below
 * this a page plays its rounds to the station on the free map (streetMode.ts).
 */
export function streetFits(width: number): boolean {
  return width >= COMPUTER_MIN_WIDTH;
}

export type Tab = "travel" | "ask";
export type Sheet = "open" | "folded";

/**
 * A tap on the stack's tab row, which is the sheet's handle: the tab you're on folds or
 * opens the sheet; the other tab opens the sheet on it.
 */
export function tapTab(now: { tab: Tab; sheet: Sheet }, tapped: Tab): { tab: Tab; sheet: Sheet } {
  if (tapped !== now.tab) return { tab: tapped, sheet: "open" };
  return { tab: tapped, sheet: now.sheet === "open" ? "folded" : "open" };
}

/** The fold toggle at the tab row's end: what it shows, and what a tap gives. */
export function sheetToggle(sheet: Sheet): { label: string; next: Sheet } {
  return sheet === "open" ? { label: "Map ▴", next: "folded" } : { label: "Board ▾", next: "open" };
}

/** The sheet's height on the stack, shared by the panel and the page. */
export const useSheet = create<{ sheet: Sheet; setSheet: (s: Sheet) => void }>((set) => ({
  sheet: "open",
  setSheet: (sheet) => set({ sheet }),
}));

function current(): PlayLayout {
  return typeof window === "undefined" ? "wide" : playLayout(innerWidth, innerHeight);
}

/** This window's layout, kept up to date as it resizes or turns. */
export function usePlayLayout(): PlayLayout {
  const [layout, setLayout] = useState(current);
  useEffect(() => {
    const changed = () => setLayout(current());
    addEventListener("resize", changed);
    changed();
    return () => removeEventListener("resize", changed);
  }, []);
  return layout;
}

/**
 * Whether the main pointer can hover. On a touch screen a tap fires the mouse's enter and
 * focus too, so a hover preview would stick after the tap: there, a tap only arms.
 */
export function canHover(): boolean {
  return typeof matchMedia === "undefined" || matchMedia("(hover: hover)").matches;
}
