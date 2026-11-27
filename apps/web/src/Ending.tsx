/**
 * The ending's verdict and callouts (DESIGN.md, Ending), and the reveal: once a round ends
 * while you watch, the map plays both routes once while the result card keeps the panel.
 */
import type { SoloView } from "@subway-seek/engine";
import { useEffect, useMemo, useRef } from "react";
import { hhmm } from "./ask.ts";
import { reducedMotion } from "./clearings.ts";
import { type Callout, endingOf } from "./ending.ts";
import type { World } from "./game.ts";
import { useReplay } from "./replay.ts";
import { Caption, Num, Rule } from "./ui/vocab.tsx";

const NONE = { verdict: null, callouts: [] as Callout[] };

export function useEnding(world: World, view: SoloView | null | undefined) {
  return useMemo(() => (view ? endingOf(world.ds, world.idx, view) : NONE), [world, view]);
}

export function Verdict({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="max-w-[320px] text-center text-[16px] leading-[1.35] font-bold">{text}</p>;
}

/** Move the map's replay to a callout's minute: the reveal if nothing is playing yet. */
function showMoment(world: World, view: SoloView, t: number) {
  const r = useReplay.getState();
  if (!r.active) r.open(world, view, { reveal: true });
  useReplay.setState({ playing: false });
  useReplay.getState().seek(t);
}

export function Callouts({
  world,
  view,
  callouts,
}: {
  world: World;
  view: SoloView;
  callouts: Callout[];
}) {
  if (callouts.length === 0) return null;
  return (
    <section className="w-full pt-1">
      <Rule>How it went</Rule>
      <ul>
        {callouts.map((c) => (
          <li key={c.kind}>
            <button
              type="button"
              className="sc-focus sc-callout flex w-full items-baseline gap-2.5 border-b border-dashed border-grout py-1.5 text-left text-[13px] leading-[1.4] hover:bg-glaze"
              aria-label={`${hhmm(c.t)}: ${c.text} Show it on the map.`}
              onClick={() => showMoment(world, view, c.t)}
            >
              <Caption tone="light">
                <Num>{hhmm(c.t)}</Num>
              </Caption>
              <span className="flex-1">{c.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Play both routes on the map once, `afterMs` after a round ended live (the tablet and
 * tally set first). Never with reduced motion, and never over a replay already open.
 */
export function useReveal(
  world: World,
  view: SoloView | null | undefined,
  live: boolean,
  afterMs: number,
) {
  // Once per ended round, keyed on when it ended: the view object changes every sync, so
  // the timer reads the latest one rather than restarting.
  const latest = useRef(view);
  latest.current = view;
  const endedAt = view?.replay ? (view.result?.at ?? null) : null;
  useEffect(() => {
    if (!live || endedAt === null || reducedMotion()) return;
    const id = setTimeout(() => {
      const v = latest.current;
      if (v && !useReplay.getState().active) useReplay.getState().open(world, v, { reveal: true });
    }, afterMs);
    return () => clearTimeout(id);
  }, [world, live, endedAt, afterMs]);
}
