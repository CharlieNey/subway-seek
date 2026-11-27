/**
 * The guided first round (DESIGN.md, Interaction: the playable round, 2026-11-27). Four
 * steps on the real screen, each chosen by what the round is doing, under the next-move
 * line that says the move itself: ask your first question, read the map, ride, arrive.
 * Skippable, finished once you've ridden somewhere (or the round ends), never shown again,
 * and replayable from How it plays. It says nothing the seeker's view doesn't hold.
 */
import { isAnswered, resolve, type SoloView } from "@subway-seek/engine";
import { useEffect } from "react";
import { create } from "zustand";
import type { World } from "./game.ts";
import { useLearn } from "./learn.ts";
import { stillPossible, useNotHereList } from "./notHere.ts";
import { roundKey } from "./voice.ts";

export type GuideStep = 1 | 2 | 3 | 4;

/**
 * How far the guide has got this round: one record, shared by the Travel tab's copy and
 * the Ask tab's (a tester saw 2 of 4 on one tab and 3 of 4 on the other).
 */
const useGuideProgress = create<{
  round: string | null;
  reached: GuideStep;
  rode: boolean;
  set: (round: string, reached: GuideStep, rode: boolean) => void;
}>((set) => ({
  round: null,
  reached: 1,
  rode: false,
  set: (round, reached, rode) => set({ round, reached, rode }),
}));

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
      return `The hider is at one of these ${n} stations. Each question you ask rules some out. Open Ask, choose the marked question, then press Ask.`;
    case 2:
      return "Watch the map as the answer lands: ruled-out stations turn hollow, and the number at the top drops.";
    case 3:
      return "You can ask one question every 5 minutes. In between, ride toward the black squares: take the marked train, or walk to the marked platform.";
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
  const progress = useGuideProgress();
  const round = roundKey(view);
  const mine = progress.round === round;
  const s = resolve(view.seeker, t, world.idx);
  const rode = (mine && progress.rode) || s.kind === "train";
  const raw = guideStep(view, t, world, tab, rode);
  // It only goes forward: a second question doesn't send you back to step 2.
  const before = mine ? progress.reached : 1;
  const reached: GuideStep = raw !== "done" && raw > before ? raw : before;
  const step = raw === "done" ? raw : reached;
  useEffect(() => {
    if (!mine || progress.reached !== reached || progress.rode !== rode)
      progress.set(round, reached, rode);
    if (guide === "new" && step === "done") finish();
  });
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
