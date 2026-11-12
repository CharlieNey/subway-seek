/**
 * The hider's deck (DESIGN.md, "Cards"): an original deck, not the show's. The hider
 * draws when answering a question and keeps the best; time bonuses still held when
 * they're caught add to their score; powerups act on questions; curses act on the
 * seeker and cost cards to play.
 *
 * Solo deck for now. Not in it yet: Move (a bot doesn't move), and Signal problems and
 * Local only, which need per-player train timing.
 */
import type { QuestionCategory } from "./questions.ts";

export type CardId =
  | "late5"
  | "delays10"
  | "work15"
  | "veto"
  | "randomize"
  | "redraw"
  | "fog"
  | "signalLoss"
  | "wrongWay"
  | "tourist"
  | "shed";

export type CurseId = "fog" | "signalLoss" | "wrongWay" | "tourist" | "shed";

export interface CardDef {
  title: string;
  kind: "bonus" | "powerup" | "curse";
  /** The rule as printed on the card. */
  rule: string;
  /** Curses: the rule told to the seeker it lands on. */
  toSeeker?: string;
  /** The conductor's line. */
  line: string;
  /** Time bonuses: added to the hider's score if still held when caught. */
  bonusSeconds?: number;
  /** Curses: cards discarded to play it. */
  cost?: number;
  /** Timed curses. */
  durationSeconds?: number;
}

export const CARDS: Record<CardId, CardDef> = {
  late5: {
    title: "Running late",
    kind: "bonus",
    rule: "Adds 5 min to your score if you're still holding it when you're caught.",
    line: "Next train in 5 minutes.",
    bonusSeconds: 5 * 60,
  },
  delays10: {
    title: "Delays",
    kind: "bonus",
    rule: "Adds 10 min to your score if you're still holding it when the round ends.",
    line: "We are delayed because of train traffic ahead.",
    bonusSeconds: 10 * 60,
  },
  work15: {
    title: "Planned work",
    kind: "bonus",
    rule: "Adds 15 min to your score if you're still holding it when the round ends.",
    line: "Trains are running with delays because of planned work.",
    bonusSeconds: 15 * 60,
  },
  veto: {
    title: "Veto",
    kind: "powerup",
    rule: "Refuse a question. The seeker has still spent it, and can't ask it again this round.",
    line: "This entrance is closed.",
  },
  randomize: {
    title: "Randomize",
    kind: "powerup",
    rule: "Swap the seeker's question for a random one of the same type.",
    line: "Good for one fare.",
  },
  redraw: {
    title: "Discard 2, draw 3",
    kind: "powerup",
    rule: "Discard two cards, then draw three.",
    line: "Transfer is available.",
  },
  fog: {
    title: "Fog",
    kind: "curse",
    rule: "The seeker's Street View is blurred for 10 min.",
    toSeeker: "Your Street View is blurred for 10 min.",
    line: "Visibility is limited in the area.",
    cost: 1,
    durationSeconds: 10 * 60,
  },
  signalLoss: {
    title: "Signal loss",
    kind: "curse",
    rule: "The seeker's map is hidden for 10 min. Departure boards still work.",
    toSeeker: "Your map is hidden for 10 min. Departure boards still work.",
    line: "Please listen for announcements.",
    cost: 2,
    durationSeconds: 10 * 60,
  },
  wrongWay: {
    title: "Wrong way",
    kind: "curse",
    rule: "The seeker's next train must run the opposite way to their last one.",
    toSeeker: "Your next train has to run the opposite way to your last one.",
    line: "Change here for trains in the other direction.",
    cost: 1,
  },
  tourist: {
    title: "Tourist",
    kind: "curse",
    rule: "At the next stop, the seeker gets off and walks 200 m before going back in.",
    toSeeker: "At the next stop, get off and walk 200 m before going back in.",
    line: "Excuse me, which way is uptown?",
    cost: 2,
  },
  shed: {
    title: "Sidewalk shed",
    kind: "curse",
    rule: "The seeker walks at half speed for 20 min.",
    toSeeker: "You walk at half speed for 20 min.",
    line: "Pardon our dust.",
    cost: 1,
    durationSeconds: 20 * 60,
  },
};

/**
 * How many of each card are in the solo deck (31). Set by the S4 match sim (2026-10-07,
 * `docs/match-balance.md`): with 19 time bonuses in 38 the held bonus was a flat +35–42 min
 * on every score, so draws hardly mattered.
 */
export const DECK_COUNTS: Record<CardId, number> = {
  late5: 6,
  delays10: 4,
  work15: 2,
  veto: 3,
  randomize: 3,
  redraw: 3,
  fog: 2,
  signalLoss: 2,
  wrongWay: 2,
  tourist: 2,
  shed: 2,
};

/** Cards drawn and kept when the hider answers a question of each category. */
export const DRAWS: Record<QuestionCategory, { draw: number; keep: number }> = {
  radar: { draw: 2, keep: 1 },
  thermometer: { draw: 2, keep: 1 },
  matching: { draw: 3, keep: 1 },
  measuring: { draw: 3, keep: 1 },
  tentacles: { draw: 4, keep: 2 },
  photo: { draw: 1, keep: 1 },
  onFoot: { draw: 1, keep: 1 },
};

export const HAND_LIMIT = 6;
/** Tourist: how far the seeker has to walk before going back in. */
export const TOURIST_WALK_M = 200;
/** Wrong way lapses after this long, so a terminal can't strand the seeker. */
export const WRONG_WAY_MAX_SECONDS = 30 * 60;

/** A shuffled deck, from a seeded random source (the daily's deck is the same for everyone). */
export function shuffledDeck(random: () => number): CardId[] {
  const deck = (Object.keys(DECK_COUNTS) as CardId[]).flatMap((id) =>
    Array.from({ length: DECK_COUNTS[id] }, () => id),
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j] as CardId, deck[i] as CardId];
  }
  return deck;
}

/**
 * What a card is worth to the bot, in rough minutes of score, for choosing which to
 * keep and which to discard. Curses are worth about what they cost the seeker, as the
 * S4 match sim measured it (`docs/match-balance.md`): Veto keeps ~7 stations in play,
 * ~9–10 min; Tourist 8–10 min; Wrong way a median 0 and a mean 6; Sidewalk shed, at
 * 20 min, see the doc.
 */
export const CARD_VALUE: Record<CardId, number> = {
  late5: 5,
  delays10: 10,
  work15: 15,
  veto: 10,
  randomize: 8,
  redraw: 4,
  fog: 5,
  signalLoss: 8,
  wrongWay: 6,
  tourist: 10,
  shed: 6,
};

/** Held time bonuses, in seconds. */
export function handBonusSeconds(hand: readonly CardId[]): number {
  return hand.reduce((sum, c) => sum + (CARDS[c].bonusSeconds ?? 0), 0);
}

/**
 * Draw `draw` cards and keep the best `keep`; then, over the hand limit, drop the
 * least valuable. Returns the new hand and deck. An empty deck draws nothing.
 */
export function drawAndKeep(
  hand: readonly CardId[],
  deck: readonly CardId[],
  draw: number,
  keep: number,
): { hand: CardId[]; deck: CardId[] } {
  const drawn = deck.slice(0, draw);
  const kept = [...drawn].sort((a, b) => CARD_VALUE[b] - CARD_VALUE[a]).slice(0, keep);
  return { hand: trimHand([...hand, ...kept]), deck: deck.slice(draw) };
}

/** Over the hand limit, drop the least valuable cards. */
export function trimHand(hand: readonly CardId[]): CardId[] {
  if (hand.length <= HAND_LIMIT) return [...hand];
  const order = hand.map((c, i) => ({ c, i })).sort((a, b) => CARD_VALUE[b.c] - CARD_VALUE[a.c]);
  const keep = new Set(order.slice(0, HAND_LIMIT).map((x) => x.i));
  return hand.filter((_, i) => keep.has(i));
}

/** Play the card at `index`, paying `cost` more cards (the least valuable others). */
export function playCard(hand: readonly CardId[], index: number, cost = 0): CardId[] {
  const order = hand
    .map((c, i) => ({ c, i }))
    .filter((x) => x.i !== index)
    .sort((a, b) => CARD_VALUE[a.c] - CARD_VALUE[b.c]);
  const drop = new Set(order.slice(0, cost).map((x) => x.i));
  drop.add(index);
  return hand.filter((_, i) => !drop.has(i));
}
