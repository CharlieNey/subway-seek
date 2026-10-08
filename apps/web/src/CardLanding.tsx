/**
 * A card played on you, landing (DESIGN.md, Motion › Curse lands): it rises 24 px into place
 * at the center of the screen, holds 1.6 s, then shrinks into its status chip. A curse goes
 * into its chip in the panel; a Veto or Randomize into the question's band. It never
 * blocks a click, and nothing waits on it: the clock runs on underneath.
 */
import { CARDS } from "@stand-clear/engine";
import { useEffect, useRef, useState } from "react";
import { type Landing, landingPhase } from "./curseMotion.ts";
import { useGame } from "./game.ts";
import { isHider } from "./hide.ts";
import { useLandings } from "./landing.ts";
import { CardFace } from "./ui/Card.tsx";

const W = 264;
const H = 372;
const decel = (x: number) => 1 - (1 - x) ** 3;

/** Where the card goes once it has been read. */
function targetOf(l: Landing): DOMRect | null {
  const sel = CARDS[l.card].kind === "curse" ? `[data-land="${l.key}"]` : `[data-land="question"]`;
  const el = document.querySelector(sel);
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? r : null;
}

export function CardLanding() {
  const queue = useLandings((s) => s.queue);
  const hider = useGame((s) => isHider(s.view));
  const [active, setActive] = useState<Landing | null>(null);
  const card = useRef<HTMLDivElement>(null);

  // Pick the landing whose turn it is; the queue spaces them out (one at a time).
  useEffect(() => {
    if (queue.length === 0) return;
    let id = 0;
    const tick = () => {
      const now = performance.now();
      const next = queue.find((l) => l.end > now && l.start <= now) ?? null;
      setActive((a) => (a?.key === next?.key ? a : next));
      if (queue.some((l) => l.end > now)) id = requestAnimationFrame(tick);
      else useLandings.setState({ queue: [] });
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [queue]);

  // Fly it: transform and opacity only, set straight on the element each frame.
  useEffect(() => {
    if (!active) return;
    let id = 0;
    let target: DOMRect | null = null;
    const fly = () => {
      const el = card.current;
      if (!el) return;
      const { phase, p } = landingPhase(active, performance.now());
      const cx = (window.innerWidth - W) / 2;
      const cy = (window.innerHeight - H) / 2;
      let x = cx;
      let y = cy;
      let scale = 1;
      let alpha = 1;
      if (phase === "rise") {
        y = cy + 24 * (1 - decel(p));
        alpha = decel(p);
      } else if (phase === "shrink") {
        target ??= targetOf(active);
        const k = decel(p);
        if (target) {
          // Into the chip: its top-left corner, scaled to its height.
          const s = target.height / H;
          x = cx + (target.left - cx) * k;
          y = cy + (target.top - cy) * k;
          scale = 1 + (s - 1) * k;
        } else {
          // Nowhere to go (the panel is on another tab): it shrinks where it is.
          scale = 1 - 0.88 * k;
          x = cx + (W * (1 - scale)) / 2;
          y = cy + (H * (1 - scale)) / 2;
          alpha = 1 - k;
        }
      } else if (phase === "done" || phase === "waiting") {
        alpha = 0;
      }
      el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      el.style.opacity = String(alpha);
      if (phase !== "done") id = requestAnimationFrame(fly);
    };
    id = requestAnimationFrame(fly);
    return () => cancelAnimationFrame(id);
  }, [active]);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-live="polite">
      <div
        ref={card}
        className="absolute top-0 left-0 origin-top-left will-change-transform"
        style={{ opacity: 0 }}
      >
        <CardFace card={active.card} hider={hider} />
      </div>
    </div>
  );
}
