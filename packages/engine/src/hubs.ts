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

export function pickHubId(random: () => number): string {
  return HUB_STATION_IDS[Math.floor(random() * HUB_STATION_IDS.length)] as string;
}
