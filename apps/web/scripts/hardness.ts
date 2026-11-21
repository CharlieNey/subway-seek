/**
 * The hardest-stations table for the homepage's /hardest page: every station the bot
 * hider could hide at from each hub, with the questions a strong seeker needs to pin it
 * and its twins, from the engine's hardness table (the same one the bot picks its station
 * from). Written to src/home/hardness.json so the page needs neither the engine nor the
 * timetable. Re-run after a re-pin (`pnpm data:hardness`); a test checks the dates match.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadDataset } from "@subway-seek/data/node";
import {
  buildIndex,
  DIFFICULTY_BANDS,
  type Difficulty,
  HIDE_SECONDS,
  HUB_STATION_IDS,
  hardnessTable,
  reachableComplexes,
} from "@subway-seek/engine";

const HIDE_START = 10 * 3600;
const ds = loadDataset();
const idx = buildIndex(ds);

function bandOf(q: number | null): Difficulty | null {
  if (q === null) return null;
  for (const d of ["easy", "normal", "hard"] as const) {
    const [lo, hi] = DIFFICULTY_BANDS[d];
    if (q >= lo && q <= hi) return d;
  }
  return q < DIFFICULTY_BANDS.easy[0] ? "easy" : "hard";
}

const routes = new Map<
  string,
  { letter: string; display: string; color: string; textColor: string; name: string }
>();
const hubs = HUB_STATION_IDS.map((id) => {
  const hub = ds.stations.findIndex((s) => s.id === id);
  if (hub < 0) throw new Error(`hub ${id} missing`);
  const reach = reachableComplexes(idx, hub, HIDE_START, HIDE_START + HIDE_SECONDS);
  const table = hardnessTable(idx, hub, HIDE_START, reach);
  const stations = reach
    .map((c) => {
      const complex = ds.complexes[c];
      if (!complex) throw new Error(`complex ${c} missing`);
      for (const letter of complex.routes) {
        const r = ds.routes.find((x) => x.letter === letter);
        if (r && !routes.has(letter)) {
          routes.set(letter, {
            letter: r.letter,
            display: r.display,
            color: r.color,
            textColor: r.textColor,
            name: r.name,
          });
        }
      }
      const h = table.get(c);
      return {
        name: complex.name,
        routes: complex.routes,
        questions: h?.questions ?? null,
        twins: h?.twins ?? 0,
        band: bandOf(h?.questions ?? null),
      };
    })
    // Hardest first: more questions, then more twins, then by name so the order is stable.
    .sort(
      (a, b) =>
        (b.questions ?? 99) - (a.questions ?? 99) ||
        b.twins - a.twins ||
        a.name.localeCompare(b.name),
    );
  const byQuestions: Record<string, number> = {};
  for (const s of stations) {
    const k = s.questions === null ? "none" : String(s.questions);
    byQuestions[k] = (byQuestions[k] ?? 0) + 1;
  }
  const hubComplex = ds.complexes[ds.stations[hub]?.complex as number];
  return { id, name: hubComplex?.name ?? id, reachable: reach.length, byQuestions, stations };
});

const out = {
  serviceDate: ds.meta.serviceDate,
  hideStart: "10:00",
  hideMinutes: HIDE_SECONDS / 60,
  routes: Object.fromEntries(routes),
  hubs,
};
const path = fileURLToPath(new URL("../src/home/hardness.json", import.meta.url));
writeFileSync(path, `${JSON.stringify(out)}\n`);
console.log(
  `wrote ${path}: ${hubs.length} hubs, ${hubs.reduce((n, h) => n + h.stations.length, 0)} station rows, service day ${ds.meta.serviceDate}`,
);
