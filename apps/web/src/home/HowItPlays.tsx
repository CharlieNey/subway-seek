/**
 * How it plays (DESIGN.md, Homepage): the round as a strip map, Hide → Seek → Endgame,
 * drawn with the game's own lines, stations and shapes. The example round is the
 * design's: from Times Sq–42 St, the hider rides down to 14 St–Union Sq.
 */
import type { LonLat } from "@stand-clear/engine";
import { milesToMeters } from "@stand-clear/engine";
import { useEffect, useRef, useState } from "react";
import { useGame, type World } from "../game.ts";
import { ring } from "../map/shapes.ts";
import { FAMILIES, FAMILY_NAME } from "../ui/family.ts";
import { Caption, FamilySquare } from "../ui/vocab.tsx";
import { drawBase, drawDot, fit, project, viewOf } from "./schematic.ts";

const complexNamed = (world: World, name: string) =>
  world.ds.complexes.findIndex((c) => c.name.replace(/[–-]/g, "-") === name);

/** The stops of a trip that calls at both complexes, from one to the other, as points. */
function rideBetween(world: World, from: number, to: number): LonLat[] {
  const { ds } = world;
  for (const trip of ds.trips) {
    const a = trip.stops.findIndex((s) => ds.stations[s]?.complex === from);
    const b = trip.stops.findIndex((s) => ds.stations[s]?.complex === to);
    if (a >= 0 && b > a) {
      return trip.stops.slice(a, b + 1).flatMap((s) => {
        const st = ds.stations[s];
        return st ? [[st.lon, st.lat] as LonLat] : [];
      });
    }
  }
  return [];
}

/** Draw into a canvas once the timetable is in, and again when it changes size. */
function useArt(draw: (x: CanvasRenderingContext2D, w: number, h: number, world: World) => void) {
  const world = useGame((s) => s.world);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!world || !c) return;
    const paint = () => {
      const { ctx, w, h } = fit(c);
      if (ctx) draw(ctx, w, h, world);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(c);
    return () => ro.disconnect();
  }, [world, draw]);
  return ref;
}

const TIMES_SQ = "Times Sq-42 St";
const UNION_SQ = "14 St-Union Sq";

function drawHide(x: CanvasRenderingContext2D, w: number, h: number, world: World) {
  const a = world.ds.complexes[complexNamed(world, TIMES_SQ)];
  const b = world.ds.complexes[complexNamed(world, UNION_SQ)];
  if (!a || !b) return;
  const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
  const v = viewOf(mid, 1700, w, h);
  drawBase(x, world, v, w, h, () => "ink");
  const at = project(v, w, h);
  // The hider's trail: terra cotta tesserae along the ride.
  const pts = rideBetween(world, complexNamed(world, TIMES_SQ), complexNamed(world, UNION_SQ)).map(
    at,
  );
  x.fillStyle = "#B9532F";
  for (let i = 1; i < pts.length; i++) {
    const [p, q] = [pts[i - 1] as [number, number], pts[i] as [number, number]];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    for (let d = 0; d < len; d += 7) {
      const k = d / len;
      x.fillRect(p[0] + (q[0] - p[0]) * k - 2.3, p[1] + (q[1] - p[1]) * k - 2.3, 4.6, 4.6);
    }
  }
  // Their zone: 400 m round the station they got off at.
  x.strokeStyle = "#B9532F";
  x.lineWidth = 2.4;
  x.setLineDash([6, 5]);
  x.beginPath();
  ring(b, 400).forEach((p, i) => {
    const [px, py] = at(p as LonLat);
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  });
  x.stroke();
  x.setLineDash([]);
  drawDot(x, at([b.lon, b.lat]), "#B9532F");
  drawDot(x, at([a.lon, a.lat]));
}

function radarArt(world: World) {
  const a = world.ds.complexes[complexNamed(world, TIMES_SQ)];
  if (!a) return null;
  const r = milesToMeters(1);
  const inside = (c: { lat: number; lon: number }) =>
    Math.hypot(
      (c.lat - a.lat) * 111_195,
      (c.lon - a.lon) * 111_195 * Math.cos((a.lat * Math.PI) / 180),
    ) < r;
  return { a, r, inside };
}

function drawSeek(x: CanvasRenderingContext2D, w: number, h: number, world: World) {
  const art = radarArt(world);
  if (!art) return;
  const v = viewOf(art.a, 2400, w, h);
  // A radar of 1 mi, answered No: the stations inside clear to outlines.
  drawBase(x, world, v, w, h, (i) => {
    const c = world.ds.complexes[i];
    return c && art.inside(c) ? "out" : "ink";
  });
  const at = project(v, w, h);
  x.strokeStyle = "rgba(37,57,107,.75)";
  x.lineWidth = 2.2;
  x.beginPath();
  ring(art.a, art.r).forEach((p, i) => {
    const [px, py] = at(p as LonLat);
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  });
  x.stroke();
  drawDot(x, at([art.a.lon, art.a.lat]));
}

export function HowItPlays() {
  const hide = useArt(drawHide);
  const seek = useArt(drawSeek);
  const world = useGame((s) => s.world);
  const [cleared, setCleared] = useState<string | null>(null);
  useEffect(() => {
    if (!world) return;
    const art = radarArt(world);
    if (!art) return;
    const n = world.ds.complexes.filter(art.inside).length;
    setCleared(`Radar 1 mi · No · ${n} stations clear`);
  }, [world]);
  return (
    <div className="hp-strip">
      <div className="hp-stop">
        <span className="ph">Hide · 20 game-min</span>
        <h3>The hider rides and gets off</h3>
        <p>
          Wherever their train stops when the time runs out, that station is the middle of their
          hiding zone: 400 m all round.
        </p>
        <div className="hp-art">
          <canvas ref={hide} />
          <Caption>The hider's ride</Caption>
        </div>
      </div>
      <div className="hp-stop">
        <span className="ph">Seek · up to 2 game-hours</span>
        <h3>You ride, ask, and the map clears</h3>
        <p>
          Ask from wherever your train stops. Each answer rules stations out, and each question adds
          minutes to the hider's score.
        </p>
        <div className="hp-art">
          <canvas ref={seek} />
          <Caption>{cleared ?? "Radar 1 mi · No"}</Caption>
        </div>
        <ul className="hp-fams" aria-label="Question types">
          {FAMILIES.map((f) => (
            <li key={f} style={{ color: "var(--color-ink)" }}>
              <FamilySquare family={f} size={12} />
              {FAMILY_NAME[f] === "Photos" ? "Photo" : FAMILY_NAME[f]}
            </li>
          ))}
        </ul>
      </div>
      <div className="hp-stop">
        <span className="ph">Endgame</span>
        <h3>Come up and find them</h3>
        <p>
          Get off where you think they are, climb to the street and search in Street View. They
          appear once you pass within 40 m; get within 25 m to catch them.
        </p>
        {/* Street View itself only shows in the game, beside the Google map. */}
        <div
          className="hp-art dark"
          role="img"
          aria-label="The catch prompt and the hider's gold marker"
        >
          <span className="catch">Someone's here</span>
          <span className="marker" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
