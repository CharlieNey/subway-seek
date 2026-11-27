/**
 * The hider's cards, as the seeker meets them (DESIGN.md, Interaction: the playable round,
 * less at first). The cards' own rules speak to the hider ("your score"); these say what a
 * card just did to you, once per card, the first time it lands. Both cold plays met cards
 * with nothing to go on: "VETOED, twice, with no warning that the hider has cards".
 */
import type { CardId } from "@subway-seek/engine";
import { storageKey } from "./storage.ts";

export const SEEKER_CARD_NOTE: Record<CardId, string> = {
  veto: "Veto: the hider refused that question. You still spent it, and that exact question is closed for this round. The others still work.",
  randomize:
    "Randomize: the hider swapped your question for a random one of the same kind. The answer is to the new question.",
  redraw: "The hider swapped some of its cards for new ones.",
  fog: "Fog: your Street View is blurred for 10 minutes.",
  signalLoss: "Signal loss: your map is hidden for 10 minutes. The departure boards still work.",
  wrongWay: "Wrong way: your next train has to run the opposite way to your last one.",
  tourist: "Tourist: at the next stop you get off and walk 200 m before going back in.",
  shed: "Sidewalk shed: you walk at half speed for 20 minutes.",
  late5: "Running late: a card the hider keeps. It adds 5 minutes to their score at the end.",
  delays10: "Delays: a card the hider keeps. It adds 10 minutes to their score at the end.",
  work15: "Planned work: a card the hider keeps. It adds 15 minutes to their score at the end.",
};

/** Said before the first card note anyone sees. */
export const CARDS_INTRO = "The hider is the computer, and it holds cards to play on you. ";

const KEY = storageKey("cards-seen");

export function loadSeenCards(): Set<CardId> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as CardId[]);
  } catch {
    return new Set();
  }
}

export function saveSeenCards(seen: ReadonlySet<CardId>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // Refused: the note may show again next round.
  }
}

/** The note to show now: the first card played on you that you haven't had explained. */
export function cardNote(
  events: readonly { t: number; card: CardId }[],
  t: number,
  seen: ReadonlySet<CardId>,
): { card: CardId; text: string } | null {
  const e = events.find((x) => x.t <= t && !seen.has(x.card));
  if (!e) return null;
  return { card: e.card, text: (seen.size === 0 ? CARDS_INTRO : "") + SEEKER_CARD_NOTE[e.card] };
}
