/**
 * Daily challenge results, kept in this browser only (per-viewer convenience; nothing
 * else depends on it). Every access is guarded: storage can be blocked or cleared.
 */
import type { Dataset, LatLon } from "@subway-seek/data";
import type {
  Answer,
  Difficulty,
  HiderView,
  OnStreet,
  Place,
  SoloView,
  TrailEntry,
  Transit,
} from "@subway-seek/engine";
import { isHider } from "./hide.ts";
import { storageKey } from "./storage.ts";
import { type Family, familyOf } from "./ui/family.ts";

const KEY = storageKey("daily-results:v1");

export interface DailyResult {
  date: string;
  number: number;
  found: boolean;
  elapsedSeconds: number;
  questions: number;
  /** Each question's family, in order (results saved before 2026-10-06 lack them). */
  families?: Family[];
  scoreSeconds: number;
  share: string;
}

export function loadResults(): Record<string, DailyResult> {
  try {
    return parseResults(localStorage.getItem(KEY));
  } catch {
    return {};
  }
}

const isResult = (r: unknown): r is DailyResult => {
  const o = r as Partial<DailyResult> | null;
  return (
    typeof o === "object" &&
    o !== null &&
    typeof o.number === "number" &&
    typeof o.found === "boolean" &&
    typeof o.elapsedSeconds === "number" &&
    typeof o.share === "string" &&
    (o.families === undefined || Array.isArray(o.families))
  );
};

/**
 * The stored results, keeping only entries shaped like a result. Storage outlives the
 * code: one bad entry (an old build, an extension, a hand edit) would otherwise stop the
 * homepage on every visit, since a reload reads the same entry again.
 */
export function parseResults(raw: string | null): Record<string, DailyResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "{}");
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).filter(([, r]) => isResult(r)));
}

/** v3 also strips station-question origins and thermometers taken on the street. */
const REPLAY_KEY = storageKey("daily-replay:v3");
const OLD_REPLAY_KEYS = [storageKey("daily-replay:v1"), storageKey("daily-replay:v2")];

/** The last daily's finished round as keptView left it, for the homepage's Watch replay. */
export function loadReplay(): { date: string; view: SoloView } | null {
  try {
    for (const k of OLD_REPLAY_KEYS) localStorage.removeItem(k);
    const kept = JSON.parse(localStorage.getItem(REPLAY_KEY) ?? "null") as {
      date: string;
      view: SoloView;
    } | null;
    return kept?.view?.replay ? kept : null;
  } catch {
    return null;
  }
}

/**
 * A finished round as this browser keeps it for Watch replay: the trails and the station,
 * with no coordinate that came from Google, since its terms forbid caching them. Anywhere
 * on the street was a Street View panorama, so the kept trails stand at the exit you came
 * up at (MTA data) for as long as you were up there, walks keep their times but not their
 * places, the hider's spot and your searched streets go, question origins sit at their
 * station, and photos keep their panorama ID (which may be stored) but not their URL.
 * The replay right after a round, from the server's view, has everything.
 */
export function keptView(ds: Dataset, view: HiderView): HiderView;
export function keptView(ds: Dataset, view: SoloView): SoloView;
export function keptView(ds: Dataset, view: SoloView): SoloView {
  const exitOf = (s: OnStreet): LatLon => {
    const c = ds.complexes[s.complex];
    return c?.exits[s.exit] ?? [c?.lat ?? 0, c?.lon ?? 0];
  };
  const atExit = (s: OnStreet): OnStreet => ({
    kind: "street",
    complex: s.complex,
    exit: s.exit,
    since: s.since,
  });
  const keepTrail = (trail: readonly TrailEntry[]): TrailEntry[] => {
    let up: LatLon | null = null;
    return trail.map(({ t, state }) => {
      const kept = keepState(state, up);
      if (kept.kind === "street") up = exitOf(kept);
      if (kept.kind === "walking" && kept.dest.kind === "street") up = exitOf(kept.dest);
      return { t, state: kept };
    });
  };
  const keepState = (s: Transit, up: LatLon | null): Transit => {
    if (s.kind === "street") return atExit(s);
    if (s.kind !== "walking") return s;
    if (s.reason === "street" && s.dest.kind === "street") {
      const exit = exitOf(s.dest);
      return { ...s, fromPoint: exit, toPoint: exit, dest: atExit(s.dest) };
    }
    if (s.reason === "enter") return { ...s, fromPoint: up ?? s.toPoint };
    return s.dest.kind === "street" ? { ...s, toPoint: exitOf(s.dest), dest: atExit(s.dest) } : s;
  };
  const atStation = (p: Place): Place => {
    const c = ds.complexes[p.complex];
    return c ? { lat: c.lat, lon: c.lon, complex: p.complex } : p;
  };
  return {
    ...view,
    ...(isHider(view)
      ? {
          self: keepState(view.self, null),
          ownTrail: keepTrail(view.ownTrail),
          seekerTrail: keepTrail(view.seekerTrail),
          spot: null,
          spotPhoto: view.spotPhoto
            ? {
                pano: view.spotPhoto.pano,
                heading: view.spotPhoto.heading,
                pitch: view.spotPhoto.pitch,
                fov: view.spotPhoto.fov,
              }
            : null,
          incoming: [],
          draw: null,
        }
      : {}),
    seeker: keepState(view.seeker, null),
    asked: view.asked.map((a) => {
      const answer = a.answer as Answer | null;
      let photo = answer;
      if (answer && typeof answer === "object" && "photo" in answer) {
        const { url: _signed, ...rest } = answer.photo;
        photo = { photo: rest };
      }
      const ctx = {
        origin: atStation(a.ctx.origin),
        baseline: a.ctx.baseline && atStation(a.ctx.baseline),
      };
      return { ...a, ctx, answer: photo };
    }),
    thermometer: view.thermometer && atStation(view.thermometer),
    spotNearby: null,
    footThermometer: null,
    footpath: [],
    replay: view.replay && {
      hider: keepTrail(view.replay.hider),
      seeker: keepTrail(view.replay.seeker),
    },
  };
}

export function saveResult(ds: Dataset, view: SoloView, share: string): void {
  if (!view.daily || !view.result) return;
  const results = loadResults();
  if (results[view.daily.date]) return; // first finish of the day is the one that counts
  try {
    // Only the latest daily, and only what keptView keeps.
    localStorage.setItem(
      REPLAY_KEY,
      JSON.stringify({ date: view.daily.date, view: keptView(ds, view) }),
    );
  } catch {
    // Too big or refused: the homepage just doesn't offer the replay.
  }
  const elapsed = view.result.at - view.seekStart;
  results[view.daily.date] = {
    date: view.daily.date,
    number: view.daily.number,
    found: view.result.kind === "found",
    elapsedSeconds: elapsed,
    questions: view.asked.length,
    families: view.asked.map((a) => familyOf(a.q)),
    scoreSeconds: elapsed + view.bonusSeconds,
    share,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(results));
  } catch {
    // Storage unavailable: the result just isn't remembered.
  }
}

export interface DailyStats {
  played: number;
  found: number;
  /** Consecutive days found, ending at the latest result. */
  streak: number;
}

export function dailyStats(results: Record<string, DailyResult>): DailyStats {
  const list = Object.values(results).sort((a, b) => a.number - b.number);
  let streak = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i] as DailyResult;
    const next = list[i + 1];
    if (!r.found || (next && next.number !== r.number + 1)) break;
    streak++;
  }
  return { played: list.length, found: list.filter((r) => r.found).length, streak };
}

const HIDE_KEY = storageKey("hide-results:v1");
const HIDE_REPLAY_KEY = storageKey("hide-replays:v2");
export interface HideResult {
  id: string;
  mode: "hide";
  at: number;
  difficulty: Difficulty;
  found: boolean;
  scoreSeconds: number;
  elapsedSeconds: number;
  questions: number;
  share: string;
}
export interface HideReplay {
  at: number;
  view: HiderView;
}
export function loadHideResults(): Record<string, HideResult> {
  try {
    return JSON.parse(localStorage.getItem(HIDE_KEY) ?? "{}");
  } catch {
    return {};
  }
}
export function loadHideReplays(): Record<string, HideReplay> {
  try {
    localStorage.removeItem(storageKey("hide-replays:v1"));
    return JSON.parse(localStorage.getItem(HIDE_REPLAY_KEY) ?? "{}");
  } catch {
    return {};
  }
}
/** Completed scores and incomplete replays are separate. Repeated socket views are idempotent. */
export function saveHideResult(ds: Dataset, view: HiderView, share: string): void {
  if (!view.result) return;
  const id = view.roundId;
  const replays = loadHideReplays();
  const at = replays[id]?.at ?? Date.now();
  if (!replays[id]) {
    replays[id] = { at, view: keptView(ds, view) };
    // Keep the latest 20 replays; every completed score remains in history.
    const recent = Object.entries(replays)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 20);
    try {
      localStorage.setItem(HIDE_REPLAY_KEY, JSON.stringify(Object.fromEntries(recent)));
    } catch {
      /* Storage unavailable. */
    }
  }
  if (view.incomplete || view.scoreSeconds === null) return;
  const results = loadHideResults();
  if (results[id]) return;
  results[id] = {
    id,
    mode: "hide",
    at,
    difficulty: view.difficulty,
    found: view.result.kind === "found",
    scoreSeconds: view.scoreSeconds,
    elapsedSeconds: Math.max(0, view.result.at - view.seekStart),
    questions: view.asked.length,
    share,
  };
  try {
    localStorage.setItem(HIDE_KEY, JSON.stringify(results));
  } catch {
    /* Storage unavailable. */
  }
}
