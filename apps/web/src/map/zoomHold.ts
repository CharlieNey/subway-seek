/**
 * Wheel, double-click and pinch zooms animate around the pointer, and recentering
 * mid-animation (following the player does it every frame) undid them: scroll-zoom
 * seemed dead until a drag turned following off. Both base maps hold recentering from
 * a zoom input until the zoom settles (`release`), or a second after the last input.
 * The + and − buttons count too: a cold-play tester pressed − four times while following
 * and the map never moved (2026-11-27).
 */
const ZOOM_INPUTS = ["wheel", "dblclick", "gesturechange"];
const HOLD_MS = 1000;

export function zoomHold(container: HTMLElement) {
  let until = 0;
  const hold = () => {
    until = performance.now() + HOLD_MS;
  };
  for (const type of ZOOM_INPUTS) {
    container.addEventListener(type, hold, { capture: true, passive: true });
  }
  // The zoom buttons, MapLibre's or Google's: both label theirs "Zoom in" and "Zoom out".
  const button = (e: Event) => {
    const el = e.target instanceof Element ? e.target : null;
    if (el?.closest('button[aria-label^="Zoom"], button[title^="Zoom"]')) hold();
  };
  container.addEventListener("pointerdown", button, { capture: true, passive: true });
  return {
    /** A zoom the player started is still settling: don't recenter. */
    held: () => performance.now() < until,
    /** The game is moving the camera itself (fitting a frame): hold recentering too. */
    hold,
    /** The map has settled after the zoom. */
    release: () => {
      until = 0;
    },
    remove: () => {
      for (const type of ZOOM_INPUTS) {
        container.removeEventListener(type, hold, { capture: true });
      }
      container.removeEventListener("pointerdown", button, { capture: true });
    },
  };
}
