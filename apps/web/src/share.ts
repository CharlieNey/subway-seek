import type { Question, SoloView } from "@subway-seek/engine";
import { GAME_NAME } from "./brand.ts";
import { isHider } from "./hide.ts";

const EMOJI: Record<Question["kind"], string> = {
  radar: "📡",
  thermometer: "🌡️",
  route: "🚇",
  borough: "🗽",
  express: "⚡",
  moreRoutes: "➕",
  matching: "🟰",
  measuring: "📏",
  tentacles: "🧭",
  spotRadar: "🎯",
  spotThermometer: "🔥",
  photo: "📸",
};

export function formatMinutes(seconds: number): string {
  const min = Math.round(seconds / 60);
  return min < 60
    ? `${min} min`
    : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

/**
 * The link a daily's share ends with: the homepage, with the daily's number and, on a find,
 * your minutes. The homepage reads it as "A friend found Daily #23 in 41 min. Your turn."
 * (home/record.ts, friendLine). It never names the station.
 */
export function shareLink(view: SoloView, origin: string): string | null {
  if (!view.daily || !view.result) return null;
  const q = new URLSearchParams({ d: String(view.daily.number) });
  if (view.result.kind === "found") {
    q.set("t", String(Math.round((view.result.at - view.seekStart) / 60)));
  }
  return `${origin}/?${q}`;
}

/**
 * The shareable result line for a finished round. Shows which kinds of questions you
 * asked (not their answers), so it doesn't spoil the day's station. Given the site's
 * origin, a daily's ends with its link (shareLink).
 */
export function shareText(view: SoloView, startName?: string, origin?: string): string {
  if (!view.result || (isHider(view) && view.incomplete)) return "";
  const elapsed = view.result.at - view.seekStart;
  const n = view.asked.length;
  if (isHider(view)) {
    const qs = `${n} ${n === 1 ? "question" : "questions"}`;
    return [
      `${GAME_NAME} (you hide · ${view.difficulty})${startName ? ` · from ${startName}` : ""}`,
      view.result.kind === "found"
        ? `Found${view.stationOnly ? " at the station" : ""} in ${formatMinutes(elapsed)} · ${qs}`
        : `Not found · ${formatMinutes(elapsed)} · ${qs}`,
      view.asked.map((a) => EMOJI[a.q.kind]).join(""),
      `My score: ${formatMinutes(view.scoreSeconds ?? elapsed + view.bonusSeconds)}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  const practice = view.difficulty === "normal" ? "practice" : `practice · ${view.difficulty}`;
  const title = `${view.daily ? `${GAME_NAME} #${view.daily.number}` : `${GAME_NAME} (${practice})`}${startName ? ` · from ${startName}` : ""}`;
  const qs = `${n} ${n === 1 ? "question" : "questions"}`;
  const line =
    view.result.kind === "found"
      ? // A round on the free map ends at the station: say so, not a street catch.
        `Found ${view.stationOnly ? "the station" : "it"} in ${formatMinutes(elapsed)} · ${qs}`
      : view.result.kind === "gaveUp"
        ? `Gave up after ${formatMinutes(elapsed)} · ${qs}`
        : `Didn't find it in ${formatMinutes(elapsed)} · ${qs}`;
  const trail = view.asked.map((a) => EMOJI[a.q.kind]).join("");
  const link = origin ? shareLink(view, origin) : null;
  return [
    `${title} 🚇`,
    line,
    trail,
    `Hider score: ${formatMinutes(elapsed + view.bonusSeconds)}`,
    link,
  ]
    .filter(Boolean)
    .join("\n");
}
