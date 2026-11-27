/**
 * Station names as the design sets them: the MTA's hyphen between two names becomes an
 * en dash ("Times Sq–42 St"), as on the platform signs and the Deck page.
 */
export function displayName(name: string): string {
  return name.replace(/\s*-\s*/g, "–");
}

const BEARING = /^(Uptown|Downtown|Northbound|Southbound|Eastbound|Westbound|Inbound|Outbound)\b/;

/**
 * A platform's direction label in a sentence: "uptown", "uptown & Queens", "toward
 * Manhattan", "toward The Bronx". Bearings read in lower case; places keep their capitals.
 */
export function directionPhrase(label: string): string {
  if (BEARING.test(label)) return label.replace(BEARING, (w) => w.toLowerCase());
  return `toward ${label === "Last Stop" ? "the last stop" : label}`;
}

/** "Tue, Oct 6": a daily's date (YYYY-MM-DD) as the header and the homepage say it. */
export const formatDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/** The dataset's borough codes as people say them: "Yes keeps Manhattan". */
const BOROUGHS: Record<string, string> = {
  M: "Manhattan",
  Bk: "Brooklyn",
  Bx: "the Bronx",
  Q: "Queens",
  SI: "Staten Island",
};

export function boroughName(code: string | undefined): string {
  return code === undefined ? "?" : (BOROUGHS[code] ?? code);
}
