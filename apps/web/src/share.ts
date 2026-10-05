import type { Question, SoloView } from "@stand-clear/engine";

const EMOJI: Record<Question["kind"], string> = {
  radar: "📡",
  thermometer: "🌡️",
  route: "🚇",
  borough: "🗽",
  express: "⚡",
  moreRoutes: "➕",
  matching: "🟰",
  measuring: "📏",
  tentacles: "🐙",
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
 * The shareable result line for a finished round. Shows which kinds of questions you
 * asked (not their answers), so it doesn't spoil the day's station.
 */
export function shareText(view: SoloView, startName?: string): string {
  if (!view.result) return "";
  const elapsed = view.result.at - view.seekStart;
  const n = view.asked.length;
  const title = `${view.daily ? `Stand Clear #${view.daily.number}` : "Stand Clear (practice)"}${startName ? ` · from ${startName}` : ""}`;
  const qs = `${n} ${n === 1 ? "question" : "questions"}`;
  const line =
    view.result.kind === "found"
      ? `Found it in ${formatMinutes(elapsed)} · ${qs}`
      : view.result.kind === "gaveUp"
        ? `Gave up after ${formatMinutes(elapsed)} · ${qs}`
        : `Didn't find it in ${formatMinutes(elapsed)} · ${qs}`;
  const trail = view.asked.map((a) => EMOJI[a.q.kind]).join("");
  return [`${title} 🚇`, line, trail, `Hider score: ${formatMinutes(elapsed + view.bonusSeconds)}`]
    .filter(Boolean)
    .join("\n");
}
