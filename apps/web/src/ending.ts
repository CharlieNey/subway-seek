/**
 * The ending (DESIGN.md, Ending; proposed 2026-11-27): a verdict line and up to three
 * callouts found in the round's own record, never invented. Everything reads
 * `view.replay`, which the server sends only once the round is over.
 *
 * Four detectors, in priority order: you rode straight through their station, your
 * express skipped it, your closest call, and the answer that cut the most. In You hide
 * the same facts are about the bot's hunt for you.
 */
import type { Dataset } from "@subway-seek/data";
import {
  distanceMeters,
  isAnswered,
  type SoloView,
  type TimetableIndex,
  type TrailEntry,
} from "@subway-seek/engine";
import { answerWord, hhmm, hm } from "./ask.ts";
import { isHider } from "./hide.ts";
import { displayName } from "./names.ts";
import { questionName } from "./replayLog.ts";

export type CalloutKind = "rodeThrough" | "expressPast" | "closest" | "turningPoint";

export interface Callout {
  kind: CalloutKind;
  /** Game time it happened, for the time tile and the replay jump. */
  t: number;
  text: string;
}

export interface Ending {
  verdict: string | null;
  /** Up to three, in time order. */
  callouts: Callout[];
}

/** Closest calls count within a mile, and at least 10 game-min before a find. */
const CLOSE_M = 1609.344;
const CLOSE_LEAD_S = 600;
/** A turning point cuts at least half of what was left. */
const TURNING_SHARE = 0.5;
const MAX_CALLOUTS = 3;

const PRIORITY: CalloutKind[] = ["rodeThrough", "expressPast", "closest", "turningPoint"];

/** "0.3 mi", never "0.0 mi". */
export function miles(m: number): string {
  return `${Math.max(0.1, Math.round(m / 160.9344) / 10).toFixed(1)} mi`;
}

/** One ride: a train entry with its alight-at changes folded in, as the replay log does. */
interface Ride {
  trip: number;
  from: number;
  to: number;
  /** When the next move began (or the round ended): the ride doesn't count past it. */
  until: number;
}

function ridesOf(trail: readonly TrailEntry[], end: number): Ride[] {
  const out: Ride[] = [];
  for (let i = 0; i < trail.length; i++) {
    const s = (trail[i] as TrailEntry).state;
    if (s.kind !== "train") continue;
    let to = s.to;
    let j = i;
    while (true) {
      const n = trail[j + 1]?.state;
      if (n?.kind !== "train" || n.trip !== s.trip || n.from !== s.from) break;
      to = n.to;
      j++;
    }
    out.push({ trip: s.trip, from: s.from, to, until: Math.min(end, trail[j + 1]?.t ?? end) });
    i = j;
  }
  return out;
}

/** Every complex the player stood in or got off at, with when. */
function stopsOf(ds: Dataset, trail: readonly TrailEntry[], end: number) {
  const out: { t: number; complex: number }[] = [];
  const at = (t: number, complex: number | undefined) => {
    if (complex !== undefined && t <= end) out.push({ t, complex });
  };
  for (const e of trail) {
    const s = e.state;
    if (s.kind === "platform") at(e.t, ds.stations[s.station]?.complex);
    else if (s.kind === "street") at(e.t, s.complex);
    else if (s.kind === "walking" && s.dest.kind === "platform")
      at(s.end, ds.stations[s.dest.station]?.complex);
    else if (s.kind === "walking" && s.dest.kind === "street") at(s.end, s.dest.complex);
  }
  for (const r of ridesOf(trail, end)) {
    const trip = ds.trips[r.trip];
    const arr = trip?.arr[r.to];
    if (!trip || arr === undefined || arr > r.until) continue;
    at(arr, ds.stations[trip.stops[r.to] as number]?.complex);
  }
  return out;
}

/** The complex the player was last in or last passed by the end, for "where you ended". */
function lastComplex(ds: Dataset, trail: readonly TrailEntry[], end: number): number | null {
  let best: { t: number; complex: number } | null = null;
  for (const s of stopsOf(ds, trail, end)) if (!best || s.t >= best.t) best = s;
  // On a train at the end: the last stop it called at.
  for (const r of ridesOf(trail, end)) {
    const trip = ds.trips[r.trip];
    if (!trip) continue;
    for (let k = r.from; k <= r.to; k++) {
      const t = k === r.from ? (trip.dep[k] as number) : (trip.arr[k] as number);
      if (t > r.until || (best && t < best.t)) continue;
      const c = ds.stations[trip.stops[k] as number]?.complex;
      if (c !== undefined) best = { t, complex: c };
    }
  }
  return best?.complex ?? null;
}

/**
 * The stop patterns that call at the hider's station, each once: an express pair (a, b)
 * skips it when one of them runs a, then the hider's station, then b.
 */
function patternsThrough(ds: Dataset, hiderStations: Set<number>): number[][] {
  const seen = new Map<string, number[]>();
  for (const trip of ds.trips)
    if (trip.stops.some((s) => hiderStations.has(s))) seen.set(trip.stops.join(","), trip.stops);
  return [...seen.values()];
}

function skipped(patterns: number[][], a: number, b: number, hiderStations: Set<number>): boolean {
  for (const stops of patterns) {
    const ia = stops.indexOf(a);
    if (ia < 0) continue;
    const ib = stops.indexOf(b, ia + 1);
    if (ib < 0) continue;
    for (let k = ia + 1; k < ib; k++) if (hiderStations.has(stops[k] as number)) return true;
  }
  return false;
}

/** The ending for a round that's over, or nothing while it's on. */
export function endingOf(ds: Dataset, idx: TimetableIndex, view: SoloView): Ending {
  const none: Ending = { verdict: null, callouts: [] };
  const r = view.result;
  if (!r || !view.replay || view.hider === null) return none;
  const hiding = isHider(view);
  if (isHider(view) && view.incomplete) return none;
  const home = ds.complexes[view.hider];
  if (!home) return none;
  const hiderStations = new Set(home.stations);
  const trail = view.replay.seeker;
  const end = r.at;
  const found = r.kind === "found";
  const foundAt = found ? (view.stationFoundAt ?? end) : end;
  const from = view.seekStart;
  const found_: Callout[] = [];
  const routeOf = (trip: number) => ds.routes[ds.trips[trip]?.route ?? -1]?.display ?? "train";

  // Rode through: a ride called at their station and the seeker stayed on.
  for (const ride of ridesOf(trail, foundAt)) {
    const trip = ds.trips[ride.trip];
    if (!trip) continue;
    for (let k = ride.from + 1; k < ride.to; k++) {
      const t = trip.arr[k] as number;
      if (t < from || t > ride.until) continue;
      if (!hiderStations.has(trip.stops[k] as number)) continue;
      found_.push({
        kind: "rodeThrough",
        t,
        text: hiding
          ? "The seeker rode straight through your station."
          : "You rode straight through their station.",
      });
      break;
    }
    if (found_.length) break;
  }

  // Express past: between two of the ride's stops, a local trip calls at their station.
  const patterns = patternsThrough(ds, hiderStations);
  outer: for (const ride of ridesOf(trail, foundAt)) {
    const trip = ds.trips[ride.trip];
    if (!trip) continue;
    for (let k = ride.from; k < ride.to; k++) {
      const t = trip.dep[k] as number;
      if (t < from || (trip.arr[k + 1] as number) > ride.until) continue;
      if (skipped(patterns, trip.stops[k] as number, trip.stops[k + 1] as number, hiderStations)) {
        const route = routeOf(ride.trip);
        found_.push({
          kind: "expressPast",
          t,
          text: hiding
            ? `The seeker's ${route} ran express past your station.`
            : `Your ${route} ran express past their station.`,
        });
        break outer;
      }
    }
  }

  // Closest call: the nearest other station they stood in, well before a find.
  let closest: { t: number; complex: number; m: number } | null = null;
  for (const s of stopsOf(ds, trail, end)) {
    // Not the start: standing at the hub at 10:20 is where everyone begins.
    if (s.t <= from || s.complex === view.hider) continue;
    if (found && s.t > foundAt - CLOSE_LEAD_S) continue;
    const c = ds.complexes[s.complex];
    if (!c) continue;
    const m = distanceMeters(c, home);
    if (m <= CLOSE_M && (!closest || m < closest.m)) closest = { t: s.t, complex: s.complex, m };
  }
  if (closest) {
    const name = displayName(ds.complexes[closest.complex]?.name ?? "");
    found_.push({
      kind: "closest",
      t: closest.t,
      text: hiding
        ? `The seeker was ${miles(closest.m)} from you, at ${name}.`
        : `${miles(closest.m)} from them, at ${name}.`,
    });
  }

  // Turning point: the answer that cut the most, if it cut at least half.
  let before = view.reachable.length;
  let turning: { t: number; text: string; share: number } | null = null;
  const answered = view.asked.filter(isAnswered).filter((a) => a.answerAt <= end);
  answered.sort((a, b) => a.answerAt - b.answerAt);
  for (const a of answered) {
    if (a.remaining === null) continue;
    const vetoed = typeof a.answer === "object" && a.answer !== null && "vetoed" in a.answer;
    const after = a.remaining;
    const share = before > 0 ? (before - after) / before : 0;
    if (!vetoed && share >= TURNING_SHARE && (!turning || share > turning.share)) {
      const word = answerWord(a.answer, a.q, idx);
      const said = `${questionName(a.q)}${word ? `, ${word}` : ""}: ${before} → ${after}.`;
      turning = { t: a.answerAt, share, text: hiding ? `The seeker's ${said}` : said };
    }
    before = after;
  }
  if (turning) found_.push({ kind: "turningPoint", t: turning.t, text: turning.text });

  const callouts = PRIORITY.flatMap((k) => found_.filter((c) => c.kind === k))
    .slice(0, MAX_CALLOUTS)
    .sort((a, b) => a.t - b.t);

  const elapsed = Math.max(0, foundAt - from);
  const has = (k: CalloutKind) => found_.some((c) => c.kind === k);
  let verdict: string;
  if (found) {
    if (has("rodeThrough"))
      verdict = hiding
        ? "They rode right past you once."
        : "You rode right past them, and came back.";
    else if (hiding) verdict = `You held them for ${hm(elapsed)}.`;
    else if (closest)
      verdict = `Within ${miles(closest.m)} at ${hhmm(closest.t)}. Found at ${hhmm(foundAt)}.`;
    else verdict = `Straight to them in ${hm(elapsed)}.`;
  } else {
    const last = lastComplex(ds, trail, end);
    const c = last === null ? undefined : ds.complexes[last];
    const m = c ? distanceMeters(c, home) : null;
    if (hiding)
      verdict = closest
        ? `They got within ${miles(closest.m)} and never found you.`
        : m !== null
          ? `Never found. They ended ${miles(m)} away.`
          : "Never found.";
    else if (m !== null && m <= CLOSE_M)
      verdict =
        r.kind === "timeout"
          ? `Service ended ${miles(m)} short.`
          : `You stopped ${miles(m)} short.`;
    else
      verdict =
        m !== null ? `They were ${miles(m)} from where you ended.` : "They got away this time.";
  }
  return { verdict, callouts };
}
