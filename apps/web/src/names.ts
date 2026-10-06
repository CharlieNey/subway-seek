/**
 * Station names as the design sets them: the MTA's hyphen between two names becomes an
 * en dash ("Times Sq–42 St"), as on the platform signs and the Deck page.
 */
export function displayName(name: string): string {
  return name.replace(/\s*-\s*/g, "–");
}

/** "Tue, Oct 6": a daily's date (YYYY-MM-DD) as the header and the homepage say it. */
export const formatDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
