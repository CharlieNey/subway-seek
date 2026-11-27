import { CARDS, type CardId } from "@subway-seek/engine";
import { describe, expect, it } from "vitest";
import { CARDS_INTRO, cardNote, SEEKER_CARD_NOTE } from "./cardNotes.ts";

describe("card notes", () => {
  it("has a note for every card, in the seeker's words", () => {
    for (const id of Object.keys(CARDS) as CardId[]) {
      expect(SEEKER_CARD_NOTE[id]).toBeTruthy();
      expect(SEEKER_CARD_NOTE[id]).not.toMatch(/\bthe seeker\b/i);
    }
  });

  it("explains a card once it has landed, the first one with the intro", () => {
    const events = [
      { t: 100, card: "veto" as const },
      { t: 200, card: "wrongWay" as const },
    ];
    expect(cardNote(events, 50, new Set())).toBeNull();
    expect(cardNote(events, 100, new Set())?.text).toBe(CARDS_INTRO + SEEKER_CARD_NOTE.veto);
    expect(cardNote(events, 250, new Set(["veto"]))?.text).toBe(SEEKER_CARD_NOTE.wrongWay);
    expect(cardNote(events, 250, new Set(["veto", "wrongWay"]))).toBeNull();
  });
});
