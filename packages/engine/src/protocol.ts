/**
 * Messages between client and server. Client messages are validated with zod before
 * the engine sees them; server messages are plain types (the server is trusted).
 */
import { z } from "zod";
import type { Difficulty } from "./hardness.ts";
import type { HiderIntent, HiderView } from "./hider.ts";
import type { RoundMode, SoloIntent, SoloView } from "./solo.ts";
import type { TransitIntent } from "./transit.ts";

const index = z.number().int().nonnegative();
const landmark = z.enum(["park", "museum", "library", "hospital", "zoo", "airport"]);

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
  z.object({ kind: z.literal("matching"), landmark }),
  z.object({ kind: z.literal("measuring"), landmark }),
  z.object({ kind: z.literal("tentacles"), landmark }),
  z.object({
    kind: z.literal("photo"),
    from: z.enum(["exit", "spot"]),
    look: z.enum(["N", "E", "S", "W", "up"]),
  }),
  z.object({ kind: z.literal("spotRadar"), meters: z.number() }),
  z.object({ kind: z.literal("spotThermometer") }),
]);

/**
 * `difficulty` applies to practice rounds; the daily always plays Normal. `street: false`
 * asks for a round that ends at the station (the free map; SoloRound.stationOnly).
 */
export type NewRoundIntent = {
  type: "newRound";
  mode: RoundMode;
  difficulty?: Difficulty;
  street?: boolean;
  /** A daily this browser has already played today (DailyInfo.replay). */
  replay?: boolean;
};
/** Solo-only clock controls, handled by the server's session rather than the round. */
export type ClockIntent =
  | { type: "pause" }
  | { type: "resume" }
  | { type: "skip"; to: "next" | "end" };
export type ClientIntent = SoloIntent | HiderIntent | NewRoundIntent | ClockIntent;

export const hiderIntentSchema = z.discriminatedUnion("type", [
  ...transitIntentSchema.options,
  z.object({
    type: z.literal("hideHere"),
    pano: z.string().min(1).max(200),
    lat: z.number().min(40).max(41.5),
    lon: z.number().min(-74.5).max(-73),
  }),
  z.object({
    type: z.literal("answer"),
    question: index,
    decision: z.enum(["true", "veto", "randomize"]),
  }),
  z.object({
    type: z.literal("keepCards"),
    revision: index,
    keep: z.array(index).max(6),
    discard: z.array(index).max(6),
  }),
  z.object({
    type: z.literal("playCard"),
    revision: index,
    card: index,
    payment: z.array(index).max(6),
  }),
  z.object({
    type: z.literal("redraw"),
    revision: index,
    card: index,
    payment: z.array(index).max(6),
  }),
  z.object({ type: z.literal("leaveHide") }),
  // Google refused the map or Street View: finish this round at the station.
  z.object({ type: z.literal("streetOff") }),
]);

export const clientIntentSchema = z.discriminatedUnion("type", [
  ...hiderIntentSchema.options,
  z.object({ type: z.literal("ask"), question: questionSchema }),
  z.object({ type: z.literal("startThermometer") }),
  z.object({ type: z.literal("startFootThermometer") }),
  z.object({ type: z.literal("giveUp") }),
  z.object({ type: z.literal("catch") }),
  z.object({
    type: z.literal("newRound"),
    mode: z.enum(["daily", "practice", "hide"]),
    difficulty: z.enum(["easy", "normal", "hard"]).optional(),
    street: z.boolean().optional(),
    replay: z.boolean().optional(),
  }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("skip"), to: z.enum(["next", "end"]) }),
]);

// Keep the schemas and the engine's types in lockstep.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _hiderMatches: Same<z.infer<typeof hiderIntentSchema>, HiderIntent> = true;
void _hiderMatches;
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

/**
 * A dropped player's round is kept this long on the server for them to come back to with
 * their session token (DESIGN.md, Disconnects).
 */
export const RECONNECT_GRACE_MS = 3 * 60 * 1000;
/**
 * A solo round's clock runs through a drop: the server advances the round, and a missed
 * stop is the player's cost. A pause there would be free thinking time on the daily (close
 * the tab, think, come back). Two-player rounds will pause, for fairness.
 */
export const SOLO_PAUSES_ON_DROP = false;
/** The WebSocket subprotocol the game speaks; the server picks it in the handshake. */
export const WS_PROTOCOL = "game.v1";
/**
 * The session token travels as a second subprotocol, `session.<token>`, in the
 * `Sec-WebSocket-Protocol` header rather than the URL, so access logs that record URLs
 * (a proxy's, a host's) never hold it. Tokens are UUIDs, which are valid header tokens.
 */
export const SESSION_PROTOCOL_PREFIX = "session.";

/** The subprotocols a client offers: the game's, and its session token if it has one. */
export function clientProtocols(token: string | null): string[] {
  return token ? [WS_PROTOCOL, `${SESSION_PROTOCOL_PREFIX}${token}`] : [WS_PROTOCOL];
}

/** The session token in a `Sec-WebSocket-Protocol` header, or null. */
export function sessionFromProtocols(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header.join(",") : (header ?? "");
  for (const p of value.split(",")) {
    const v = p.trim();
    if (v.startsWith(SESSION_PROTOCOL_PREFIX) && v.length > SESSION_PROTOCOL_PREFIX.length)
      return v.slice(SESSION_PROTOCOL_PREFIX.length);
  }
  return null;
}
/** Close code for a connection whose session was opened somewhere else (another tab). */
export const CLOSE_TAKEN_OVER = 4001;
/** Close codes for a new connection turned away: too many new rounds from its address, or a full server. */
export const CLOSE_TOO_MANY_ROUNDS = 4002;
export const CLOSE_FULL = 4003;
/** Close code for a connection sending messages faster than any player could (limits.ts). */
export const CLOSE_TOO_MANY_MESSAGES = 4004;

export type ServerMessage =
  | {
      type: "hello";
      /** The session token: send it back on reconnect to pick the round up again. */
      session: string;
      /** This connection picked up a session that was already running. */
      resumed: boolean;
      /** The last intent seq the session handled; the client numbers on from there. */
      seq: number;
      serviceDate: string;
      clock: ClockSync;
      view: SoloView | HiderView;
    }
  | { type: "state"; seq: number; clock: ClockSync; view: SoloView }
  | { type: "rejected"; seq: number; error: string; clock: ClockSync; view: SoloView };

/**
 * A sync as received, re-anchored to the receiver's own clock. `serverNow` is the server's
 * wall clock, and a computer's can be minutes off: read against it, a fast clock runs the
 * game ahead (6 game-min per real minute) and a slow one stalls. Anchored at receipt
 * instead, the only error is the one-way delay, about half a game-second at 6×.
 */
export function receivedSync(sync: ClockSync, receivedAtMs: number): ClockSync {
  return { ...sync, serverNow: receivedAtMs };
}

/** Game time now, from the last sync (anchored by `receivedSync` on the client). */
export function syncedGameTime(sync: ClockSync, nowMs: number): number {
  if (sync.paused) return sync.gameTime;
  return sync.gameTime + ((nowMs - sync.serverNow) / 1000) * sync.speed;
}
