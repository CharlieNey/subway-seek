import { loadDataset } from "@subway-seek/data/node";
import { HUB_STATION_IDS } from "@subway-seek/engine";
import { describe, expect, it } from "vitest";
import data from "./hardness.json";

describe("the hardest-stations table", () => {
  it("was built from the pinned timetable (run pnpm data:hardness after a re-pin)", () => {
    expect(data.serviceDate).toBe(loadDataset().meta.serviceDate);
  });

  it("covers every hub, hardest first, with the bot's bands", () => {
    expect(data.hubs.map((h) => h.id)).toEqual([...HUB_STATION_IDS]);
    for (const hub of data.hubs) {
      expect(hub.stations.length).toBe(hub.reachable);
      const qs = hub.stations.map((s) => s.questions ?? 99);
      expect([...qs].sort((a, b) => b - a)).toEqual(qs);
      for (const s of hub.stations) {
        if (s.questions === null) expect(s.band).toBeNull();
        else if (s.questions >= 7) expect(s.band).toBe("hard");
        else if (s.questions >= 5) expect(s.band).toBe("normal");
        else expect(s.band).toBe("easy");
        for (const r of s.routes) expect(data.routes).toHaveProperty(r);
      }
    }
  });
});
