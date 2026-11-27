/**
 * What the play page should sound like right now (DESIGN.md, Interaction: Sound): the
 * doors as your train leaves and as you get off, the rumble while it moves, and the
 * pulse as the possible stations fall. Only for what happens while you watch: a refresh
 * that finds you riding starts the rumble but rings no doors.
 */
import type { SoloView } from "@subway-seek/engine";
import { useEffect, useRef } from "react";
import type { World } from "./game.ts";
import {
  play,
  pulseInterval,
  ridingAt,
  setPageVisible,
  setPulse,
  setRiding,
  unlockOnFirstGesture,
} from "./sound.ts";
import { useClockValue } from "./useGameTime.ts";

export function useSoundscape(world: World | null, view: SoloView | null) {
  useEffect(() => unlockOnFirstGesture(), []);
  useEffect(() => {
    const onVis = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      setRiding(false);
      setPulse(null);
    };
  }, []);

  const riding = useClockValue((t) =>
    world && view && !view.result && t !== null ? ridingAt(world, view, t) : null,
  );
  const pulse = useClockValue((t) =>
    view && !view.result && t !== null && t >= view.seekStart
      ? pulseInterval(view.candidates.length, view.reachable.length)
      : null,
  );

  // The doors ring on a change seen live, not on the first value after a load.
  const was = useRef<boolean | null>(null);
  useEffect(() => {
    if (riding === null) {
      setRiding(false);
      return;
    }
    if (was.current !== null && was.current !== riding) play("chime");
    was.current = riding;
    setRiding(riding);
  }, [riding]);

  useEffect(() => setPulse(pulse), [pulse]);
}
