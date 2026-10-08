/**
 * Playtest metrics from the match logs (matchLog.ts): the numbers DESIGN.md's "Playtest
 * metrics" and docs/LAUNCH.md say the first week measures, in the shape the sims print
 * (docs/match-balance.md), so human rounds can be read against the bot's line for line.
 *
 * Pure: parse(lines) → a Round; summarize(rounds) → text. `pnpm metrics` wraps it.
 */
import { categoryOf, isVetoed, type Question, type QuestionCategory } from "@stand-clear/engine";

/** One line of a match log. `at` is wall-clock ms, `t` game seconds. */
interface Event {
  at: number;
  event: string;
  t?: number;
  [k: string]: unknown;
}

export interface Round {
  id: string;
  mode: string;
  difficulty: string;
  startedAt: number;
  daily: number | null;
  reachable: number;
  seekStart: number;
  /** "found" | "timeout" | "gaveUp" | "incomplete", or null if the log never ended. */
  result: string | null;
  /** Left mid-round and never came back (the server gave the session up). */
  abandoned: boolean;
  elapsedMin: number | null;
  stationFoundMin: number | null;
  questions: { t: number; category: QuestionCategory; vetoed: boolean; remaining: number | null }[];
  cardsPlayed: string[];
  hiderScoreMin: number | null;
  /** Game minutes into seeking when they gave up, if they did. */
  gaveUpAtMin: number | null;
  /** Real seconds between the human's consecutive decisions while connected. */
  decisionGaps: number[];
  skips: number;
  reconnects: number;
}

export function parseRound(id: string, lines: string[]): Round | null {
  const events: Event[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as Event);
    } catch {
      // A torn last line from a crash: skip it.
    }
  }
  const start = events.find((e) => e.event === "round_start");
  if (!start) return null;
  const end = events.find((e) => e.event === "round_end");
  const mode = String(start.mode ?? "daily");
  const humanSide = mode === "hide" ? "hider" : "seeker";
  const seekStart = Number(start.seekStart ?? 0);
  const questions = events
    .filter((e) => e.event === "question" && e.q)
    .map((e) => {
      const answer = e.answer as Parameters<typeof isVetoed>[0] | null;
      return {
        t: Number(e.t),
        category: categoryOf(e.q as Question),
        vetoed: answer !== null && answer !== undefined && isVetoed(answer),
        remaining: typeof e.remaining === "number" ? e.remaining : null,
      };
    });
  // The human's decisions, in wall-clock order: their intents, their questions (the seeker's),
  // and clock controls. The bot's intents in a hide round carry side "seeker".
  let connected = true;
  let last: number | null = null;
  const gaps: number[] = [];
  let skips = 0;
  let reconnects = 0;
  for (const e of events) {
    if (e.event === "disconnect") {
      connected = false;
      last = null;
      continue;
    }
    if (e.event === "reconnect" || e.event === "restored") {
      connected = true;
      last = e.at;
      if (e.event === "reconnect") reconnects++;
      continue;
    }
    if (e.event === "round_start") {
      last = e.at;
      continue;
    }
    const mine =
      (e.event === "intent" && (e.side ?? "seeker") === humanSide) ||
      (e.event === "question" && humanSide === "seeker") ||
      e.event === "clock";
    if (!mine || !connected) continue;
    if (e.event === "clock" && e.type === "skip") skips++;
    if (last !== null) gaps.push((e.at - last) / 1000);
    last = e.at;
  }
  const gaveUp = end?.result === "gaveUp" ? Number(end.elapsedMin) : null;
  return {
    id,
    mode,
    difficulty: String(start.difficulty ?? "normal"),
    startedAt: start.at,
    daily: (start.daily as { number?: number } | null)?.number ?? null,
    reachable: Number(start.reachable ?? 0),
    seekStart,
    result: end ? String(end.result) : null,
    abandoned: !end && events.some((e) => e.event === "abandoned"),
    elapsedMin: end ? Number(end.elapsedMin) : null,
    stationFoundMin: end && typeof end.stationFoundMin === "number" ? end.stationFoundMin : null,
    questions,
    cardsPlayed: (end?.cardsPlayed as string[] | undefined) ?? [],
    hiderScoreMin: end && typeof end.hiderScoreMin === "number" ? end.hiderScoreMin : null,
    gaveUpAtMin: gaveUp,
    decisionGaps: gaps,
    skips,
    reconnects,
  };
}

const median = (xs: number[]) => quantile(xs, 0.5);
function quantile(xs: number[], q: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? null;
}
const fmt = (x: number | null, d = 0) => (x === null ? "–" : x.toFixed(d));
const share = (n: number, of: number) => (of === 0 ? "–" : `${Math.round((100 * n) / of)}%`);
/** "median (p25–p90)". */
function spread(xs: number[], d = 0): string {
  return xs.length === 0
    ? "–"
    : `${fmt(median(xs), d)} (p25 ${fmt(quantile(xs, 0.25), d)}, p90 ${fmt(quantile(xs, 0.9), d)})`;
}

/** The bot seeker's Normal line from docs/match-balance.md (2026-10-07), for comparison. */
export const SIM_NORMAL = { stationMin: 38, endgameShare: 38, questions: 5.4, scoreMin: 176 };

export function summarize(rounds: Round[]): string {
  const out: string[] = [];
  const groups = new Map<string, Round[]>();
  for (const r of rounds) {
    const key = `${r.mode} · ${r.difficulty}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const started = rounds.filter((r) => r.result !== null || r.abandoned).length;
  out.push(
    `${rounds.length} rounds in the logs, ${started} played past the first screen ` +
      `(${rounds.length - started} opened and never touched).`,
  );
  for (const [key, rs] of [...groups.entries()].sort()) {
    const ended = rs.filter((r) => r.result !== null);
    if (ended.length === 0 && rs.every((r) => !r.abandoned)) continue;
    const found = ended.filter((r) => r.result === "found");
    const gaveUp = ended.filter((r) => r.result === "gaveUp");
    const timeout = ended.filter((r) => r.result === "timeout");
    const abandoned = rs.filter((r) => r.abandoned);
    const played = ended.length + abandoned.length;
    out.push(
      "",
      `${key.toUpperCase()} — ${played} rounds played, ${rs.length - played} opened only`,
    );
    out.push(
      `  found ${share(found.length, played)}, gave up ${share(gaveUp.length, played)}, ` +
        `timed out ${share(timeout.length, played)}, left without finishing ${share(abandoned.length, played)}`,
    );
    if (gaveUp.length > 0) {
      out.push(
        `  gave up at: ${spread(gaveUp.map((r) => r.gaveUpAtMin ?? 0))} game-min into seeking, ` +
          `after ${spread(gaveUp.map((r) => r.questions.length))} questions`,
      );
    }
    const stationMins = found.map((r) => r.stationFoundMin).filter((x): x is number => x !== null);
    const endgames = found
      .filter((r) => r.stationFoundMin !== null && r.elapsedMin !== null)
      .map((r) => ({
        end: (r.elapsedMin as number) - (r.stationFoundMin as number),
        share: r.elapsedMin
          ? (100 * ((r.elapsedMin as number) - (r.stationFoundMin as number))) /
            (r.elapsedMin as number)
          : 0,
      }));
    if (found.length > 0) {
      out.push(`  station found: ${spread(stationMins)} game-min`);
      out.push(
        `  endgame: ${spread(endgames.map((e) => e.end))} game-min, ` +
          `${fmt(median(endgames.map((e) => e.share)))}% of seeking (median share)`,
      );
      out.push(
        `  seeking total: ${spread(found.map((r) => r.elapsedMin as number))}; ` +
          `hider score: ${spread(found.map((r) => r.hiderScoreMin ?? 0))}`,
      );
    }
    // Questions, as the sim reports them: per round, and the category mix.
    const qs = ended.flatMap((r) => r.questions);
    const station = qs.filter((q) => q.category !== "onFoot");
    const byCat = new Map<string, number>();
    for (const q of station) byCat.set(q.category, (byCat.get(q.category) ?? 0) + 1);
    const mix = [...byCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} ${share(n, station.length)}`)
      .join(", ");
    if (ended.length > 0) {
      out.push(
        `  questions: ${fmt(station.length / ended.length, 1)} station questions a round` +
          (mix ? ` (${mix})` : "") +
          `; ${fmt(qs.filter((q) => q.category === "onFoot").length / ended.length, 1)} on foot; ` +
          `vetoed ${qs.filter((q) => q.vetoed).length}`,
      );
      const cards = new Map<string, number>();
      for (const c of ended.flatMap((r) => r.cardsPlayed)) cards.set(c, (cards.get(c) ?? 0) + 1);
      if (cards.size > 0) {
        out.push(
          `  curses and cards played: ${[...cards.entries()].map(([c, n]) => `${c} ${n}`).join(", ")}`,
        );
      }
    }
    // Dead time: real seconds between the human's decisions, and the longest wait per round.
    const gaps = rs.flatMap((r) => r.decisionGaps);
    const longest = rs.map((r) => Math.max(0, ...r.decisionGaps)).filter((x) => x > 0);
    if (gaps.length > 0) {
      out.push(
        `  between decisions: ${spread(gaps)} real s; longest wait in a round: ${spread(longest)} s; ` +
          `fast-forwards ${fmt(rs.reduce((n, r) => n + r.skips, 0) / rs.length, 1)} a round`,
      );
    }
    const reconnects = rs.reduce((n, r) => n + r.reconnects, 0);
    if (reconnects > 0) out.push(`  reconnects: ${reconnects} across ${rs.length} rounds`);
    if (key.startsWith("daily") || key.endsWith("normal")) {
      const q = station.length / Math.max(1, ended.length);
      out.push(
        `  vs the bot seeker on Normal (docs/match-balance.md): station ${SIM_NORMAL.stationMin}, ` +
          `endgame ${SIM_NORMAL.endgameShare}%, ${SIM_NORMAL.questions} questions, score ${SIM_NORMAL.scoreMin}` +
          (found.length > 0
            ? ` → humans: station ${fmt(median(stationMins))}, endgame ${fmt(median(endgames.map((e) => e.share)))}%, ` +
              `${fmt(q, 1)} questions, score ${fmt(median(found.map((r) => r.hiderScoreMin ?? 0)))}`
            : ""),
      );
    }
  }
  return out.join("\n");
}
