/**
 * One JSONL file per round under apps/server/logs/: the raw material for playtest
 * metrics (candidates over time, questions by type, time between decisions).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const LOG_DIR = fileURLToPath(new URL("../logs/", import.meta.url));

export class MatchLog {
  readonly id =
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 7)}`;
  private readonly path = join(LOG_DIR, `${this.id}.jsonl`);

  constructor() {
    mkdirSync(LOG_DIR, { recursive: true });
  }

  write(event: string, data: Record<string, unknown>) {
    appendFileSync(this.path, `${JSON.stringify({ at: Date.now(), event, ...data })}\n`);
  }
}
