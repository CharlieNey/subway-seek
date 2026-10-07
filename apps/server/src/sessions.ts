/**
 * Sessions: a round that outlives its connection. Each connection gets a session token
 * in `hello`; a reconnect that brings the token back picks up the same round and clock.
 * When the connection drops, the session waits out the grace period (RECONNECT_GRACE_MS)
 * before it's dropped, its clock paused or, for a solo round, still running (DESIGN.md,
 * Disconnects). A second connection with the same token takes the session over, and the
 * first is closed.
 */
import { randomUUID } from "node:crypto";
import { type GameClock, pauseClock, resumeClock } from "@stand-clear/engine";

/** The part of a socket a session needs. */
export interface Conn {
  close(code: number, reason: string): void;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface Session<G extends { clock: GameClock }> {
  readonly token: string;
  game: G;
  conn: Conn | null;
  /** Real ms the connection dropped, while it's away. */
  droppedAt: number | null;
  /** The clock was paused because the connection dropped, not by the player. */
  pausedByDrop: boolean;
  graceTimer: unknown;
}

export class SessionStore<G extends { clock: GameClock }> {
  private readonly sessions = new Map<string, Session<G>>();
  private readonly timers: Timers;

  constructor(
    private readonly opts: {
      graceMs: number;
      /**
       * Pause the clock while the connection is away (default). Two-player rounds pause
       * for fairness; a solo round's clock runs through a drop (DESIGN.md, Disconnects).
       */
      pauseOnDrop?: boolean;
      /** Called when a session is dropped after its grace period. */
      onExpire?: (session: Session<G>) => void;
      timers?: Timers;
      newToken?: () => string;
    },
  ) {
    this.timers = opts.timers ?? realTimers;
  }

  create(game: G, token = (this.opts.newToken ?? randomUUID)()): Session<G> {
    const session: Session<G> = {
      token,
      game,
      conn: null,
      droppedAt: null,
      pausedByDrop: false,
      graceTimer: null,
    };
    this.sessions.set(token, session);
    return session;
  }

  /**
   * Bring back a session saved before a restart, with no connection, as if it had
   * dropped at `droppedAt`: its grace period runs for whatever is left of it. The clock
   * is left as saved (a solo clock runs through a drop; a paused one stays paused).
   */
  restore(game: G, token: string, droppedAt: number, now: number): Session<G> {
    const session = this.create(game, token);
    session.droppedAt = droppedAt;
    const left = Math.max(0, this.opts.graceMs - (now - droppedAt));
    session.graceTimer = this.timers.setTimeout(() => {
      session.graceTimer = null;
      if (session.conn !== null || this.sessions.get(session.token) !== session) return;
      this.sessions.delete(session.token);
      this.opts.onExpire?.(session);
    }, left);
    return session;
  }

  get(token: string | null | undefined): Session<G> | undefined {
    return token ? this.sessions.get(token) : undefined;
  }

  /** Sessions with a live connection. */
  connected(): Session<G>[] {
    return [...this.sessions.values()].filter((s) => s.conn !== null);
  }

  /** Every session still kept, connected or waiting out its grace period. */
  all(): Session<G>[] {
    return [...this.sessions.values()];
  }

  get size(): number {
    return this.sessions.size;
  }

  /**
   * Put a connection on a session, resuming a clock the drop paused. Returns the
   * connection it replaced, if one was still attached, for the caller to close.
   */
  attach(session: Session<G>, conn: Conn, now: number): Conn | null {
    this.cancelGrace(session);
    const replaced = session.conn;
    session.conn = conn;
    session.droppedAt = null;
    if (session.pausedByDrop) {
      session.game.clock = resumeClock(session.game.clock, now);
      session.pausedByDrop = false;
    }
    return replaced;
  }

  /**
   * A connection closed. Pauses the clock if the store pauses on a drop (a practice round
   * the player paused stays paused) and starts the grace period. False if `conn` had
   * already been replaced.
   */
  detach(session: Session<G>, conn: Conn, now: number): boolean {
    if (conn !== session.conn) return false;
    session.conn = null;
    session.droppedAt = now;
    if (this.opts.pauseOnDrop !== false && session.game.clock.pausedAt === null) {
      session.game.clock = pauseClock(session.game.clock, now);
      session.pausedByDrop = true;
    }
    this.cancelGrace(session);
    session.graceTimer = this.timers.setTimeout(() => {
      session.graceTimer = null;
      if (session.conn !== null || this.sessions.get(session.token) !== session) return;
      this.sessions.delete(session.token);
      this.opts.onExpire?.(session);
    }, this.opts.graceMs);
    return true;
  }

  private cancelGrace(session: Session<G>) {
    if (session.graceTimer !== null) this.timers.clearTimeout(session.graceTimer);
    session.graceTimer = null;
  }
}
