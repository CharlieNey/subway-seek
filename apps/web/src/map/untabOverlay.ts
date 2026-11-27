/**
 * deck.gl makes its overlay canvas a tab stop (tabindex 0) with no name and no focus ring.
 * The map's own canvas already takes the keyboard and says "Map", so the overlay's is a
 * dead, invisible stop for anyone on a keyboard or a screen reader: take it out of the tab
 * order and the accessibility tree. deck.gl makes the canvas after the map does and sets
 * its tabindex again later, so this keeps watching the container.
 */
export function untabOverlay(container: HTMLElement): () => void {
  const fix = () => {
    const c = container.querySelector<HTMLCanvasElement>("canvas#deckgl-overlay");
    if (!c) return;
    if (c.tabIndex !== -1) c.tabIndex = -1;
    if (c.getAttribute("aria-hidden") !== "true") c.setAttribute("aria-hidden", "true");
  };
  fix();
  // deck.gl sets the attribute again after it starts, so keep watching while the map lives.
  const watch = new MutationObserver(fix);
  watch.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["tabindex"],
  });
  return () => watch.disconnect();
}
