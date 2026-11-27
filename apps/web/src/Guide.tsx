/**
 * The guided first round (DESIGN.md, Interaction: the playable round, 2026-11-27). Four
 * steps on the real screen, each chosen by what the round is doing, under the next-move
 * line that says the move itself: ask your first question, read the map, ride, arrive.
 * Skippable, finished once you've ridden somewhere (or the round ends), never shown again,
 * and replayable from How it plays. It says nothing the seeker's view doesn't hold.
 */
import { isAnswered, resolve, type SoloView } from "@subway-seek/engine";
import { useEffect, useRef } from "react";
import type { World } from "./game.ts";
import { useLearn } from "./learn.ts";
import { stillPossible, useNotHereList } from "./notHere.ts";

export type GuideStep = 1 | 2 | 3 | 4;

/** Which step the round is on, given whether you've been on a train yet. */
export function guideStep(
  view: SoloView,
  t: number,
  world: World,
  tab: "travel" | "ask",
  rode: boolean,
): GuideStep | "done" {
  if (view.result) return "done";
  const s = resolve(view.seeker, t, world.idx);
  if (s.kind === "train") return 4;
  if (rode) return "done";
  if (view.asked.length === 0) return 1;
  if (!view.asked.some(isAnswered) || tab === "ask") return 2;
  return 3;
}

function stepText(step: GuideStep, n: number): string {
  switch (step) {
    case 1:
      return `The hider is at one of these ${n} stations. Each question you ask rules some out. Try the one marked, then press Ask.`;
    case 2:
      return "Watch the map as the answer lands: ruled-out stations turn hollow, and the number at the top drops.";
    case 3:
      return "You can ask one question every 5 minutes. In between, ride toward the black squares: board the marked train.";
    case 4:
      return "To win, get off at the hider's station. A wrong one says Not here. Get off at the marked stop, or anywhere.";
  }
}

export function Guide({
  world,
  view,
  t,
  tab,
}: {
  world: World;
  view: SoloView;
  t: number;
  tab: "travel" | "ask";
}) {
  const guide = useLearn((s) => s.guide);
  const finish = useLearn((s) => s.finishGuide);
  const notHere = useNotHereList(view);
  const rode = useRef(false);
  const s = resolve(view.seeker, t, world.idx);
  if (s.kind === "train") rode.current = true;
  const step = guideStep(view, t, world, tab, rode.current);
  useEffect(() => {
    if (guide === "new" && step === "done") finish();
  }, [guide, step, finish]);
  if (guide !== "new" || step === "done") return null;
  return (
    <section className="sc-guide mx-4 mt-2" aria-label="Guide">
      <p className="sc-guide-head">
        <span>Guide · {step} of 4</span>
        <button type="button" className="sc-focus" onClick={finish}>
          Skip the guide
        </button>
      </p>
      <p className="sc-guide-text">{stepText(step, stillPossible(view, notHere).length)}</p>
    </section>
  );
}
