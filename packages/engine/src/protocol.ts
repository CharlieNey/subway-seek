/**
 * Messages between client and server. Client messages are validated with zod before
 * the engine sees them; server messages are plain types (the server is trusted).
 */
import { z } from "zod";
import type { Transit, TransitIntent } from "./transit.ts";

const index = z.number().int().nonnegative();

export const transitIntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("board"), trip: index, stop: index }),
  z.object({ type: z.literal("cancelBoard") }),
  z.object({ type: z.literal("alightAt"), stop: index }),
  z.object({ type: z.literal("transfer"), to: index }),
  z.object({ type: z.literal("exit"), exit: index }),
  z.object({ type: z.literal("enter"), station: index }),
]);

// Keep the schema and the engine's intent type in lockstep.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _intentsMatch: Same<z.infer<typeof transitIntentSchema>, TransitIntent> = true;
void _intentsMatch;

/** `seq` increases per client; a repeated seq is ignored, so retries can't double-apply. */
export const clientMessageSchema = z.object({
  type: z.literal("intent"),
  seq: index,
  intent: transitIntentSchema,
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
  | { type: "hello"; serviceDate: string; clock: ClockSync; state: Transit }
  | { type: "state"; seq: number; clock: ClockSync; state: Transit }
  | { type: "rejected"; seq: number; error: string; clock: ClockSync; state: Transit };

/** Game time now, from the last sync. */
export function syncedGameTime(sync: ClockSync, nowMs: number): number {
  if (sync.paused) return sync.gameTime;
  return sync.gameTime + ((nowMs - sync.serverNow) / 1000) * sync.speed;
}
