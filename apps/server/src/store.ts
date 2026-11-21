/**
 * Live sessions on disk, so a deploy or a crash doesn't end every round in progress.
 * Node's built-in SQLite (one file on the host's volume, SESSION_DB) holds each session's
 * game as JSON, written whenever it changes. At boot the rows come back: sessions whose
 * grace period has run out are dropped, the rest wait for their player to reconnect with
 * the clock running on, as it does through any drop of a solo round.
 *
 * The game is plain data (the engine's round, the clock, the seq, the match log's id);
 * the match log itself is its JSONL file, reopened by id. `lastCurseAt` starts at
 * -Infinity, which JSON can't carry, so it rides as a string.
 */

import { DatabaseSync } from "node:sqlite";
import type { GameClock, SoloRound } from "@subway-seek/engine";
import type { StoredHideRound } from "./hidePersistence.ts";

/** What a session needs to come back. */
export interface SavedGame {
  round: SoloRound | StoredHideRound;
  seekerLastActionAt?: number;
  clock: GameClock;
  lastSeq: number;
  logId: string;
  cardsLogged: number;
  stationLogged: boolean;
}

export interface SavedSession {
  token: string;
  game: SavedGame;
  /** Real ms the connection dropped, or null while connected. */
  droppedAt: number | null;
  updatedAt: number;
}

const NEG_INF = "-Infinity";

export function serializeGame(game: SavedGame): string {
  return JSON.stringify(game, (_k, v) => (v === Number.NEGATIVE_INFINITY ? NEG_INF : v));
}

export function deserializeGame(json: string): SavedGame {
  return JSON.parse(json, (_k, v) => (v === NEG_INF ? Number.NEGATIVE_INFINITY : v)) as SavedGame;
}

export class SessionDb {
  private readonly db: DatabaseSync;

  /** `path` is a file, or ":memory:" for tests. */
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        game TEXT NOT NULL,
        dropped_at INTEGER,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  save(s: SavedSession): void {
    this.db
      .prepare(
        `INSERT INTO sessions (token, game, dropped_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET game = excluded.game, dropped_at = excluded.dropped_at, updated_at = excluded.updated_at`,
      )
      .run(s.token, serializeGame(s.game), s.droppedAt, s.updatedAt);
  }

  delete(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }

  /** Every saved session, oldest first. */
  all(): SavedSession[] {
    const rows = this.db
      .prepare("SELECT token, game, dropped_at, updated_at FROM sessions ORDER BY updated_at")
      .all() as { token: string; game: string; dropped_at: number | null; updated_at: number }[];
    return rows.map((r) => ({
      token: r.token,
      game: deserializeGame(r.game),
      droppedAt: r.dropped_at,
      updatedAt: r.updated_at,
    }));
  }

  get size(): number {
    return (this.db.prepare("SELECT count(*) AS n FROM sessions").get() as { n: number }).n;
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Which saved sessions are worth restoring at boot: ones whose grace period hasn't run
 * out. A session that was connected when the server went down is treated as dropped
 * at that moment (its last save). Finished rounds come back too, so a player who
 * reconnects within the grace period still sees their result.
 */
export function restorable(saved: SavedSession[], now: number, graceMs: number): SavedSession[] {
  return saved.filter((s) => now - (s.droppedAt ?? s.updatedAt) < graceMs);
}
