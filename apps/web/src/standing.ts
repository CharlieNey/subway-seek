/**
 * Where a daily stands (DESIGN.md, Coming back; proposed 2026-11-27): par from the
 * hardest-stations table (the questions a strong seeker needs for that station, from the
 * same hub), and a percentile against today's other finished dailies once there are
 * enough of them to mean something.
 */
import type { Dataset } from "@subway-seek/data";
import type { DailyResult } from "./history.ts";

/** The percentile shows once this many other dailies have finished today. */
export const PERCENTILE_MIN = 20;

export interface HardnessData {
  hubs: {
    id: string;
    stations: { name: string; routes: string[]; questions: number | null }[];
  }[];
}

/** Par for a station from a hub: the questions a strong seeker needs, or null. */
export function parFor(
  data: HardnessData,
  ds: Dataset,
  hubStation: number,
  complex: number,
): number | null {
  const hubId = ds.stations[hubStation]?.id;
  const c = ds.complexes[complex];
  if (!hubId || !c) return null;
  const routes = c.routes.join(",");
  const hub = data.hubs.find((h) => h.id === hubId);
  const st = hub?.stations.find((s) => s.name === c.name && s.routes.join(",") === routes);
  return st?.questions ?? null;
}

/**
 * "Par 6 · 3 over", "Par 6 · level", "Par 6 · 2 under" for a find. Without one, over or
 * under means nothing (a give-up with no questions isn't "6 under"): just "Par 6".
 */
export function parLine(par: number, asked: number, found = true): string {
  if (!found) return `Par ${par}`;
  const d = asked - par;
  return `Par ${par} · ${d === 0 ? "level" : d > 0 ? `${d} over` : `${-d} under`}`;
}

/**
 * The share of today's other finished dailies you beat (a lower hider score is better),
 * from the server's minute histogram, which includes your own round once. Null until
 * PERCENTILE_MIN others have finished.
 */
export function percentileOf(
  counts: readonly number[],
  n: number,
  mine: number,
): { beat: number; others: number } | null {
  const m = Math.round(mine);
  const others = n - ((counts[m] ?? 0) > 0 ? 1 : 0);
  if (others < PERCENTILE_MIN) return null;
  let worse = 0;
  for (let k = m + 1; k < counts.length; k++) worse += counts[k] ?? 0;
  return { beat: Math.round((100 * worse) / others), others };
}

/**
 * Days in a row you played the daily (found, timed out or given up), ending at the latest
 * one played. With `today` (its daily number), a run whose last day is before yesterday
 * has ended: 0. Yesterday still counts, since today's may not be played yet.
 */
export function daysRunning(results: Record<string, DailyResult>, today?: number): number {
  const numbers = [...new Set(Object.values(results).map((r) => r.number))].sort((a, b) => a - b);
  const latest = numbers.at(-1);
  if (today !== undefined && (latest === undefined || latest < today - 1)) return 0;
  let run = 0;
  for (let i = numbers.length - 1; i >= 0; i--) {
    if (i < numbers.length - 1 && numbers[i] !== (numbers[i + 1] as number) - 1) break;
    run++;
  }
  return run;
}
