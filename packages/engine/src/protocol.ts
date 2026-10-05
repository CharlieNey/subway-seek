/**
 * Messages between client and server. Client messages are validated with zod before
 * the engine sees them; server messages are plain types (the server is trusted).
 */
import { z } from "zod";
import type { RoundMode, SoloIntent, SoloView } from "./solo.ts";
import type { TransitIntent } from "./transit.ts";

const index = z.number().int().nonnegative();

export const transitIntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("board"), trip: index, stop: index }),
  z.object({ type: z.literal("cancelBoard") }),
  z.object({ type: z.literal("alightAt"), stop: index }),
  z.object({ type: z.literal("transfer"), to: index }),
  z.object({ type: z.literal("exit"), exit: index }),
  z.object({ type: z.literal("enter"), station: index }),
  z.object({
    type: z.literal("walkTo"),
    lat: z.number().min(40).max(41.5),
    lon: z.number().min(-74.5).max(-73),
    pano: z.string().max(200).optional(),
  }),
]);

export const questionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("radar"), miles: z.number() }),
  z.object({ kind: z.literal("thermometer") }),
  z.object({ kind: z.literal("route"), letter: z.string().max(4) }),
  z.object({ kind: z.literal("borough") }),
  z.object({ kind: z.literal("express") }),
  z.object({ kind: z.literal("moreRoutes") }),
]);

export type NewRoundIntent = { type: "newRound"; mode: RoundMode };
export type ClientIntent = SoloIntent | NewRoundIntent;

export const clientIntentSchema = z.discriminatedUnion("type", [
  ...transitIntentSchema.options,
  z.object({ type: z.literal("ask"), question: questionSchema }),
  z.object({ type: z.literal("startThermometer") }),
  z.object({ type: z.literal("giveUp") }),
  z.object({ type: z.literal("catch") }),
  z.object({ type: z.literal("newRound"), mode: z.enum(["daily", "practice"]) }),
]);

// Keep the schemas and the engine's types in lockstep.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _transitMatches: Same<z.infer<typeof transitIntentSchema>, TransitIntent> = true;
const _intentsMatch: Same<z.infer<typeof clientIntentSchema>, ClientIntent> = true;
void _transitMatches;
void _intentsMatch;

/** `seq` increases per client; a repeated seq is ignored, so retries can't double-apply. */
export const clientMessageSchema = z.object({
  type: z.literal("intent"),
  seq: index,
  intent: clientIntentSchema,
});
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Enough for a client to run the shared clock locally: game time at `serverNow`, and the speed. */
export interface ClockSync {
  gameTime: number;
  speed: number;
  serverNow: number;
  paused: boolean;
}

export type ServerMessage =
  | { type: "hello"; serviceDate: string; clock: ClockSync; view: SoloView }
  | { type: "state"; seq: number; clock: ClockSync; view: SoloView }
  | { type: "rejected"; seq: number; error: string; clock: ClockSync; view: SoloView };

/** Game time now, from the last sync. */
export function syncedGameTime(sync: ClockSync, nowMs: number): number {
  if (sync.paused) return sync.gameTime;
  return sync.gameTime + ((nowMs - sync.serverNow) / 1000) * sync.speed;
}
