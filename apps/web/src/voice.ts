/**
 * The conductor's lines (DESIGN.md, Voice): twelve fixed moments, each with one line, set
 * small under the moment's band or tablet. A line never repeats within a round: the first
 * moment that shows it keeps it. The seeker's nine are here; the hider's three come with
 * the hider's screens.
 */
import type { SoloView } from "@subway-seek/engine";

export const LINES = {
  hideDeadline: "This is your station. Everyone off, please.",
  hideLocked: "You’re set. Hold on and watch them come.",
  hideZone: "Stay where you are. They’re on your block.",
  dailyOpens: "Now boarding. Today's hider went underground at 10:00.",
  trainsOpen: "Trains are running. Ride toward what's left.",
  firstQuestion: "Your question is on its way. Listen for the answer.",
  veto: "This entrance is closed. That question is gone for the round.",
  upToStreet: "Mind the stairs. Daylight ahead.",
  found: "Last stop. Thank you for riding.",
  timeUp: "Service has ended. The hider was at",
  lost: "We're being held by the dispatcher. The round is paused.",
  back: "We're moving again. Thank you for your patience.",
} as const;

export type LineId = keyof typeof LINES;

/** Which moment holds each line, per round. */
const kept = new Map<string, string>();

/** A round, as far as its lines are concerned. */
export const roundKey = (v: Pick<SoloView, "mode" | "hub" | "seekStart" | "daily">) =>
  `${v.mode}|${v.daily?.number ?? ""}|${v.hub}|${v.seekStart}`;

/** Whether `moment` gets the line: the first moment to ask for it in a round keeps it. */
export function lineFor(round: string, line: LineId, moment: string | number): boolean {
  const k = `${round}|${line}`;
  const held = kept.get(k);
  if (held === undefined) {
    kept.set(k, String(moment));
    return true;
  }
  return held === String(moment);
}

/** For tests: forget every round. */
export function resetLines() {
  kept.clear();
}
