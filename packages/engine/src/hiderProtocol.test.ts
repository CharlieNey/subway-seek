import { expect, it } from "vitest";
import { clientMessageSchema, hiderIntentSchema } from "./protocol.ts";

it("accepts ordered hider commands and a hide round, but refuses malformed payments", () => {
  expect(
    clientMessageSchema.safeParse({
      type: "intent",
      seq: 1,
      intent: { type: "newRound", mode: "hide", difficulty: "hard" },
    }).success,
  ).toBe(true);
  expect(
    clientMessageSchema.safeParse({
      type: "intent",
      seq: 2,
      intent: { type: "answer", question: 0, decision: "veto" },
    }).success,
  ).toBe(true);
  expect(
    hiderIntentSchema.safeParse({ type: "playCard", revision: 0, card: 1, payment: [-1] }).success,
  ).toBe(false);
  expect(
    hiderIntentSchema.safeParse({ type: "ask", question: { kind: "radar", miles: 1 } }).success,
  ).toBe(false);
  expect(
    clientMessageSchema.safeParse({
      type: "intent",
      seq: 3,
      intent: { type: "hideHere", pano: "", lat: 40.7, lon: -74 },
    }).success,
  ).toBe(false);
});
