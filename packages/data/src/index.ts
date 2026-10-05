export type * from "./types.ts";

/** Seconds since service-day midnight → "HH:MM" (hours can exceed 23 for after-midnight service). */
export function formatServiceTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
