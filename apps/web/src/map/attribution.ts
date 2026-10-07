/**
 * The map's and Street View's own credits: Google's logo and its row of the data credit,
 * Terms and Report a problem, or MapLibre's attribution. Google's terms want them visible,
 * so the game's overlays keep clear of them (DESIGN.md, Street endgame: the walk tiles sit
 * above Google's attribution and never cover it). Their size changes with the map's width
 * and Google's own layout, so they're measured, not assumed.
 */
import { type RefObject, useEffect, useState } from "react";

export const ATTRIBUTION_SELECTOR = [
  // Google: the logo links to Google Maps; the credit row's parts are .gm-style-cc.
  'a[href*="maps.google.com/maps"]',
  'a[href*="google.com/maps/@"]',
  ".gm-style-cc",
  // MapLibre, the dev map.
  ".maplibregl-ctrl-attrib",
  ".maplibregl-ctrl-logo",
].join(", ");

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The credits inside `root`, as rectangles in `root`'s own pixels. */
export function attributionRects(root: Element): Rect[] {
  const box = root.getBoundingClientRect();
  const out: Rect[] = [];
  for (const el of root.querySelectorAll(ATTRIBUTION_SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    out.push({ x: r.x - box.x, y: r.y - box.y, w: r.width, h: r.height });
  }
  return out;
}

/**
 * Overlapping or touching rectangles joined into their bounding boxes, until none
 * overlap. A credit can match twice (Google's credit cell and the link inside it), and
 * neighbours touch; cut as even-odd holes, an overlap would cancel itself out.
 */
export function mergeRects(rects: readonly Rect[]): Rect[] {
  const out = rects.map((r) => ({ ...r }));
  const meet = (a: Rect, b: Rect) =>
    a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
  // Join one pair at a time, and look again from the start: a grown rectangle can meet
  // one already passed.
  for (let joined = true; joined; ) {
    joined = false;
    for (let i = 0; i < out.length && !joined; i++) {
      for (let j = i + 1; j < out.length && !joined; j++) {
        const a = out[i] as Rect;
        const b = out[j] as Rect;
        if (!meet(a, b)) continue;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        out[i] = {
          x,
          y,
          w: Math.max(a.x + a.w, b.x + b.w) - x,
          h: Math.max(a.y + a.h, b.y + b.h) - y,
        };
        out.splice(j, 1);
        joined = true;
      }
    }
  }
  return out;
}

/**
 * How far up from the bottom of `root` its credits reach, in px (0 with none showing),
 * checked as it resizes and once a second, since Google lays its row out again as tiles
 * and zoom change.
 */
export function useAttributionClearance(root: RefObject<HTMLElement | null>): number {
  const [clearance, setClearance] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      // Only what sits along the foot: a credit higher up isn't in an overlay's way.
      const tops = attributionRects(el)
        .filter((r) => r.y + r.h > h - 60)
        .map((r) => r.y);
      const next = tops.length ? Math.max(0, Math.round(h - Math.min(...tops))) : 0;
      setClearance((old) => (old === next ? old : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const id = setInterval(measure, 1000);
    return () => {
      ro.disconnect();
      clearInterval(id);
    };
  }, [root]);
  return clearance;
}
