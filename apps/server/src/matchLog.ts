/**
 * One JSONL file per round under apps/server/logs/: the raw material for playtest
 * metrics (candidates over time, questions by type, time between decisions).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// MATCH_LOG_DIR keeps test rounds (headless checks) out of the playtest logs.
const LOG_DIR = process.env.MATCH_LOG_DIR ?? fileURLToPath(new URL("../logs/", import.meta.url));

export class MatchLog {
  readonly id: string;
  private readonly path: string;

  /** A new log, or an existing one reopened by id (a session restored after a restart). */
  constructor(id?: string) {
    this.id =
      id ??
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 7)}`;
    this.path = join(LOG_DIR, `${this.id}.jsonl`);
    mkdirSync(LOG_DIR, { recursive: true });
  }

  write(event: string, data: Record<string, unknown>) {
    appendFileSync(this.path, `${JSON.stringify({ at: Date.now(), event, ...data })}\n`);
  }
}
