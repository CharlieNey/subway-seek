/**
 * Wheel, double-click and pinch zooms animate around the pointer, and recentering
 * mid-animation (following the player does it every frame) undid them: scroll-zoom
 * seemed dead until a drag turned following off. Both base maps hold recentering from
 * a zoom input until the zoom settles (`release`), or a second after the last input.
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
    },
  };
}
