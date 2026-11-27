/**
 * Themed days (docs/proposals/themed-days.md; decided 2026-11-27): one rule bent on
 * Saturdays. The first and only theme is **Outer boroughs**: the daily starts from one of
 * four hubs outside Manhattan (hubs.ts says why not the fifth), and the bot never hides in
 * Manhattan, though it may ride through it. The seeker's search space starts without Manhattan's stations too.
 *
 * A themed day salts its seeds with the theme, so no other day's daily changes, and themes
 * begin on OUTER_BOROUGHS_FROM, so no Saturday already played changes either.
 */
import { dailyNumber, dailyRandom } from "./daily.ts";
import { HUB_STATION_IDS, OUTER_HUB_STATION_IDS, pickHubId } from "./hubs.ts";
import { createSoloRound, type SoloRound } from "./solo.ts";
import type { TimetableIndex } from "./timetable.ts";

export type DailyTheme = "outerBoroughs";

export const THEME_NAMES: Record<DailyTheme, string> = { outerBoroughs: "Outer boroughs" };

/**
 * The first Saturday with a theme. It has to be a Saturday after the deploy that ships
 * this, so nobody's Saturday daily changes under them: move it if the deploy slips.
 */
export const OUTER_BOROUGHS_FROM = "2026-12-05";

/** The day's theme, or null on an ordinary day. `date` is New York's, YYYY-MM-DD. */
export function dailyTheme(date: string): DailyTheme | null {
  if (date < OUTER_BOROUGHS_FROM) return null;
  const saturday = new Date(`${date}T12:00:00Z`).getUTCDay() === 6;
  return saturday ? "outerBoroughs" : null;
}

/** Which stations a theme lets the bot hide at and the seeker search. */
export function themeKeep(
  idx: TimetableIndex,
  theme: DailyTheme | null,
): ((complex: number) => boolean) | undefined {
  if (theme !== "outerBoroughs") return undefined;
  return (c) => idx.ds.complexes[c]?.borough !== "M";
}

/**
 * The day's daily round: its hub, its hidden station and its search space, the same for
 * everyone. Every place that rebuilds a daily (today's, yesterday's hider, yesterday's
 * replay) comes here, so a theme can't apply to one and not the others. An ordinary day
 * draws exactly as it did before themes: the same seeds, the same hubs.
 */
export function createDailyRound(
  idx: TimetableIndex,
  date: string,
  secret: string,
  hideStart: number,
): SoloRound {
  const theme = dailyTheme(date);
  const salt = theme ? `|${theme}` : "";
  const hubId = pickHubId(
    dailyRandom(`${date}|hub${salt}`, secret),
    theme === "outerBoroughs" ? OUTER_HUB_STATION_IDS : HUB_STATION_IDS,
  );
  const hub = idx.ds.stations.findIndex((s) => s.id === hubId);
  if (hub < 0) throw new Error(`hub ${hubId} isn't in the dataset`);
  return createSoloRound(idx, {
    hub,
    hideStart,
    random: dailyRandom(`${date}${salt}`, secret),
    daily: theme ? { date, number: dailyNumber(date), theme } : { date, number: dailyNumber(date) },
    keep: themeKeep(idx, theme),
  });
}
