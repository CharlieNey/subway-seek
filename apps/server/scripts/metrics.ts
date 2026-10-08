/**
 * Playtest metrics from the match logs. From the repo root:
 *
 *   pnpm metrics                           # apps/server/logs
 *   pnpm metrics -- --dir=/path/to/logs    # logs pulled from the instance
 *   pnpm metrics -- --since=2026-10-20 --mode=daily
 *
 * On the instance: `docker compose cp server:/data/logs ./logs` in /opt/stand-clear, then
 * point --dir at it. Output mirrors `pnpm sim:match` so the two read line for line.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRound, summarize } from "../src/metrics.ts";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k ?? "", v ?? "true"];
  }),
);
const dir = args.get("dir") ?? fileURLToPath(new URL("../logs/", import.meta.url));
const since = args.get("since") ? Date.parse(args.get("since") as string) : 0;
const mode = args.get("mode");

const rounds = readdirSync(dir)
  .filter((f) => f.endsWith(".jsonl"))
  .sort()
  .map((f) => parseRound(f.replace(/\.jsonl$/, ""), readFileSync(join(dir, f), "utf8").split("\n")))
  .filter((r): r is NonNullable<typeof r> => r !== null)
  .filter((r) => r.startedAt >= since && (!mode || r.mode === mode));

console.log(`${dir}${since ? ` since ${args.get("since")}` : ""}${mode ? ` · ${mode} only` : ""}`);
console.log(summarize(rounds));
