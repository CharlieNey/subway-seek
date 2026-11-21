/**
 * The hero's live map (DESIGN.md, Homepage): today's timetable at 6×, every dot a train
 * and every square a station today's hider could have reached. Real data, not decoration
 * (Motion rule 8), and nothing on it hints at today's station. It runs only while on
 * screen, and with reduced motion it holds still at 10:20.
 */
import type { LonLat } from "@subway-seek/engine";
import { useEffect, useRef } from "react";
import { hhmm } from "../ask.ts";
import { reducedMotion } from "../clearings.ts";
import { useGame } from "../game.ts";
import { Caption } from "../ui/vocab.tsx";
import type { DailyFacts } from "./daily.ts";
import { drawBase, drawDot, drawTrains, fit, project, type View, viewAround } from "./schematic.ts";

const SPEED = 6;

export function LiveMap({ facts }: { facts: DailyFacts | null }) {
  const world = useGame((s) => s.world);
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!world || !c) return;
    const reachable = new Set(facts?.reachable ?? []);
    const start = facts?.start ?? null;
    const t0 = facts?.seekStart ?? 10 * 3600 + 20 * 60;
    const begun = performance.now();
    // Frame the stations today's hider could reach, or Midtown before the server answers.
    const pts: LonLat[] = [...reachable].flatMap((i) => {
      const cx = world.ds.complexes[i];
      return cx ? [[cx.lon, cx.lat] as LonLat] : [];
    });
    const box = (): [LonLat, LonLat] =>
      pts.length > 1
        ? [
            [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))],
            [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))],
          ]
        : [
            [-74.01, 40.73],
            [-73.96, 40.775],
          ];
    let base: HTMLCanvasElement | null = null;
    let size = { w: 0, h: 0 };
    let view: View | null = null;
    const layout = () => {
      const f = fit(c);
      size = { w: f.w, h: f.h };
      const [sw, ne] = box();
      view = viewAround(sw, ne, f.w, f.h, 1.25);
      // The ground, lines and stations don't move: draw them once per size.
      base = document.createElement("canvas");
      base.width = c.width;
      base.height = c.height;
      const bx = base.getContext("2d");
      if (!bx) return;
      bx.setTransform(c.width / f.w, 0, 0, c.height / f.h, 0, 0);
      drawBase(bx, world, view, f.w, f.h, (i) => (reachable.has(i) ? "ink" : null));
    };
    layout();
    const still = reducedMotion();
    let id = 0;
    let visible = true;
    const frame = (now: number) => {
      const x = c.getContext("2d");
      if (!x || !base || !view) return;
      const t = t0 + (still ? 0 : ((now - begun) / 1000) * SPEED);
      x.save();
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.drawImage(base, 0, 0);
      x.restore();
      drawTrains(x, world, view, size.w, size.h, t);
      const s = start === null ? undefined : world.ds.complexes[start];
      if (s) drawDot(x, project(view, size.w, size.h)([s.lon, s.lat]));
      if (clock.current) clock.current.textContent = hhmm(t);
      if (!still && visible) id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = !!e?.isIntersecting;
      if (visible && !was && !still) id = requestAnimationFrame(frame);
    });
    io.observe(c);
    const ro = new ResizeObserver(() => {
      layout();
      if (still) id = requestAnimationFrame(frame);
    });
    ro.observe(c);
    return () => {
      cancelAnimationFrame(id);
      io.disconnect();
      ro.disconnect();
    };
  }, [world, facts]);

  return (
    <div className="hp-live" role="img" aria-label="A live map of trains moving on the timetable">
      <canvas ref={canvas} />
      {!world && <span className="hp-live-wait">Loading the timetable…</span>}
      <Caption>
        <span className="n" ref={clock}>
          {hhmm(facts?.seekStart ?? 10 * 3600 + 20 * 60)}
        </span>{" "}
        · 6× real time
      </Caption>
      <p className="hp-live-note">
        Every dot is a train running to the real weekday timetable. Every square is a station the
        hider could have reached.
      </p>
    </div>
  );
}
