/**
 * Where rounds start: big interchanges across four boroughs. Each gives a different
 * search space (stations a hider can reach in 20 minutes: ~47 at 161 St, ~103 at
 * Union Sq), so the hub varies difficulty as well as scenery.
 */
export const HUB_STATION_IDS = [
  "127", // Times Sq-42 St
  "631", // Grand Central-42 St
  "235", // Atlantic Av-Barclays Ctr
  "635", // 14 St-Union Sq
  "G14", // Jackson Hts-Roosevelt Av
  "A38", // Fulton St
  "A24", // 59 St-Columbus Circle
  "A41", // Jay St-MetroTech
  "D17", // 34 St-Herald Sq
  "414", // 161 St-Yankee Stadium
  "A51", // Broadway Junction
  "D20", // W 4 St-Wash Sq
  "A15", // 125 St
] as const;

/**
 * The hubs for the Outer boroughs Saturdays (themes.ts): four of the five outside
 * Manhattan, Atlantic Av–Barclays Ctr, Jackson Hts–Roosevelt Av, Jay St–MetroTech and
 * Broadway Junction. Not 161 St–Yankee Stadium: without Manhattan it reaches 25 stations
 * and the daily's Normal band holds just 4, so a regular would soon know them all
 * (`pnpm sim --theme outerBoroughs`, docs/question-balance.md).
 */
export const OUTER_HUB_STATION_IDS = ["235", "G14", "A41", "A51"] as const;

export function pickHubId(random: () => number, ids: readonly string[] = HUB_STATION_IDS): string {
  return ids[Math.floor(random() * ids.length)] as string;
}
