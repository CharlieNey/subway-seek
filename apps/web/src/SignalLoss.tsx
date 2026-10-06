/**
 * The Signal loss curse on the map (DESIGN.md, Motion › Curse lands): glazed tiles on a
 * grout bed set across the map in a diagonal sweep (900 ms) once the card is in its chip,
 * so nothing of the map shows between them, and lift in reverse when it ends. The
 * departure boards in the panel still work.
 */
import type { ActiveCurse } from "@stand-clear/engine";
import { useEffect, useRef } from "react";
import { reducedMotion } from "./clearings.ts";
import { SET_MS, SWEEP_MS, tileSet } from "./curseMotion.ts";
import { useLanded, useLandings } from "./landing.ts";
import { useLeaving } from "./ui/useLeaving.ts";
import { Caption } from "./ui/vocab.tsx";

const N = 20;
const GROUT = "#D8CFBC";
const decel = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

export function SignalLoss({ curse }: { curse: ActiveCurse | null }) {
  const landed = useLanded(curse ? `${curse.card}@${curse.at}` : null);
  const shown = useLeaving(curse && landed ? curse : null, SWEEP_MS);
  const ref = useRef<HTMLCanvasElement>(null);
  const cap = useRef<HTMLDivElement>(null);
  const on = shown.value !== null;
  const leaving = shown.leaving;
  const key = shown.value ? `${shown.value.card}@${shown.value.at}` : null;

  useEffect(() => {
    const canvas = ref.current;
    if (!on || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const start = performance.now();
    // It sweeps in only if you just watched its card land; after a refresh it's simply there.
    const landedAt = key ? (useLandings.getState().landedAt[key] ?? 0) : 0;
    const still = reducedMotion() || (!leaving && start - landedAt > 500);
    let id = 0;
    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const ms = still ? SWEEP_MS : performance.now() - start;
      const cols = Math.ceil(w / N);
      const rows = Math.ceil(h / N);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const u = tileSet((c + r) / Math.max(1, cols + rows - 2), ms, leaving);
          if (u <= 0) continue;
          const sz = (N - 1.4) * (0.55 + 0.45 * u);
          ctx.globalAlpha = u;
          ctx.fillStyle = GROUT;
          ctx.fillRect(c * N, r * N, N, N);
          ctx.fillStyle = (r * 7 + c * 3) % 5 ? "#FBF8F1" : "#F6F1E6";
          ctx.fillRect(c * N + (N - sz) / 2, r * N + (N - sz) / 2, sz, sz);
        }
      ctx.globalAlpha = 1;
      if (cap.current) {
        // The caption steps in once the sweep is down, and out as it starts to lift.
        const c = leaving ? 0 : still ? 1 : decel((ms - SWEEP_MS) / SET_MS);
        cap.current.style.opacity = String(c);
      }
      if (ms < SWEEP_MS + SET_MS) id = requestAnimationFrame(draw);
    };
    draw();
    // Redraw in place when the map changes size.
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(id);
      draw();
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, [on, leaving, key]);

  if (!on) return null;
  return (
    <div className="absolute inset-0 z-20">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div
        ref={cap}
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-[13px] text-ink-2"
        style={{ opacity: 0 }}
      >
        <Caption>Map hidden</Caption>
        <span>Departure boards still work</span>
      </div>
    </div>
  );
}
