/**
 * The replay's log (DESIGN.md, the Deck page, part eight): both players' moves, every
 * question with its answer and what it left, the curses, and the end, in game-time
 * order. Hider moves carry a terra cotta dot, yours an ink dot, questions their family
 * square. Derived from the round's trails once the round is over, when everything is
 * revealed.
 */
import type { Dataset } from "@stand-clear/data";
import {
  CARDS,
  categoryOf,
  isAnswered,
  LANDMARK_WORDS,
  type LonLat,
  type Question,
  type SoloView,
  type TrailEntry,
  type Transit,
} from "@stand-clear/engine";
import { answerWord, radarLabel } from "./ask.ts";
import { isHider } from "./hide.ts";
import { displayName } from "./names.ts";
import { type Family, familyOf } from "./ui/family.ts";

export type LogMark =
  | { kind: "hider" }
  | { kind: "you" }
  | { kind: "question"; family: Family; vetoed: boolean }
  | { kind: "curse" }
  | { kind: "found" }
  | { kind: "end" };

export interface LogEvent {
  t: number;
  mark: LogMark;
  text: string;
  /** What it left: "59 left", "21% left". */
  note?: string;
  /** Where it happened, for the map's stacked question squares. */
  p?: LonLat;
}

type Who = "hider" | "you";
const VERB: Record<string, [string, string]> = {
  board: ["You board", "Hider boards"],
  change: ["You change at", "Hider changes at"],
  off: ["You get off at", "Hider gets off at"],
  walk: ["You walk to", "Hider walks to"],
  up: ["You come up at", "Hider comes up at"],
  down: ["You go back down at", "Hider goes back down at"],
};
const say = (who: Who, verb: string) => (VERB[verb] as [string, string])[who === "you" ? 0 : 1];

/** "downtown", "uptown", or "to Coney Island" when the platform's sign says neither. */
function way(ds: Dataset, station: number, dir: 0 | 1, headsign: string): string {
  const st = ds.stations[station];
  const label = st ? (dir === 0 ? st.northLabel : st.southLabel) : "";
  const m = /^(uptown|downtown)\b/i.exec(label);
  return m?.[1] ? m[1].toLowerCase() : `to ${displayName(headsign)}`;
}

const stationName = (ds: Dataset, station: number) =>
  displayName(ds.complexes[ds.stations[station]?.complex ?? -1]?.name ?? "?");

/** A player's moves from their trail, cut at `end`. */
export function movesOf(ds: Dataset, trail: readonly TrailEntry[], who: Who, end: number) {
  const out: LogEvent[] = [];
  const mark: LogMark = { kind: who };
  for (let i = 0; i < trail.length; i++) {
    const entry = trail[i] as TrailEntry;
    const s: Transit = entry.state;
    if (s.kind === "train") {
      // An alight-at change re-states the same ride: fold it into one.
      let to = s.to;
      let j = i;
      while (true) {
        const n = trail[j + 1]?.state;
        if (n?.kind !== "train" || n.trip !== s.trip || n.from !== s.from) break;
        to = n.to;
        j++;
      }
      const until = Math.min(end, trail[j + 1]?.t ?? end);
      i = j;
      const trip = ds.trips[s.trip];
      const dep = trip?.dep[s.from];
      const arr = trip?.arr[to];
      if (!trip || dep === undefined || dep > until) continue;
      const route = ds.routes[trip.route];
      const from = trip.stops[s.from] as number;
      out.push({
        t: dep,
        mark,
        text: `${say(who, "board")} the ${route?.display ?? "?"} ${way(ds, from, trip.dir, trip.headsign)}`,
      });
      if (arr === undefined || arr > until) continue;
      const next = trail[j + 1]?.state;
      const changes =
        next?.kind === "train" || (next?.kind === "walking" && next.reason === "transfer");
      out.push({
        t: arr,
        mark,
        text: `${say(who, changes ? "change" : "off")} ${stationName(ds, trip.stops[to] as number)}`,
      });
    } else if (s.kind === "walking") {
      const until = Math.min(end, trail[i + 1]?.t ?? end);
      // A change within one complex already says where: only a walk to another one shows.
      const from = trail[i - 1]?.state;
      const fromComplex =
        from?.kind === "platform"
          ? ds.stations[from.station]?.complex
          : from?.kind === "train"
            ? ds.stations[ds.trips[from.trip]?.stops[from.to] ?? -1]?.complex
            : undefined;
      const sameComplex =
        s.dest.kind === "platform" && ds.stations[s.dest.station]?.complex === fromComplex;
      if (s.reason === "transfer" && s.dest.kind === "platform" && !sameComplex) {
        out.push({
          t: s.start,
          mark,
          text: `${say(who, "walk")} ${stationName(ds, s.dest.station)}`,
        });
      } else if (s.reason === "exit" && s.dest.kind === "street" && s.end <= until) {
        out.push({ t: s.end, mark, text: `${say(who, "up")} Exit ${s.dest.exit + 1}` });
      } else if (s.reason === "enter" && s.dest.kind === "platform") {
        out.push({
          t: s.start,
          mark,
          text: `${say(who, "down")} ${stationName(ds, s.dest.station)}`,
        });
      }
    }
  }
  // The hider's last walk on the street ends at their spot.
  if (who === "hider") {
    const last = [...trail].reverse().find((e) => e.state.kind === "walking");
    if (last?.state.kind === "walking" && last.state.reason === "street" && last.state.end <= end) {
      out.push({ t: last.state.end, mark, text: "Hider reaches their spot" });
    }
  }
  return out;
}

/** "Radar 1 mi", "Same borough", "Nearest hospital": the question, short, for the log. */
export function questionName(q: Question): string {
  switch (q.kind) {
    case "radar":
      return `Radar ${radarLabel(q.miles)}`;
    case "thermometer":
      return "Thermometer";
    case "route":
      return `The ${q.letter} stops there`;
    case "borough":
      return "Same borough";
    case "express":
      return "Same kind of stop";
    case "moreRoutes":
      return "More lines";
    case "matching":
      return `Same nearest ${LANDMARK_WORDS[q.landmark].one}`;
    case "measuring":
      return `Closer to ${LANDMARK_WORDS[q.landmark].a}`;
    case "tentacles":
      return `Nearest ${LANDMARK_WORDS[q.landmark].one}`;
    case "photo":
      return `${q.from === "exit" ? "Exit" : "Spot"} photo, facing ${q.look === "up" ? "up" : q.look}`;
    case "spotRadar":
      return `Spot within ${q.meters} m`;
    case "spotThermometer":
      return "Hotter or colder";
  }
}

/**
 * The whole log, in time order. `spotsLeft` says what share of the search circle an
 * on-foot answer left (0–1), when the caller can work it out.
 */
/** "You board the F" as someone else's move: "Seeker boards the F". */
function asSeeker(text: string): string {
  return text
    .replace(/^You board/, "Seeker boards")
    .replace(/^You change/, "Seeker changes")
    .replace(/^You get/, "Seeker gets")
    .replace(/^You walk/, "Seeker walks")
    .replace(/^You come/, "Seeker comes")
    .replace(/^You go/, "Seeker goes");
}

export function replayLog(
  ds: Dataset,
  idx: Parameters<typeof answerWord>[2],
  view: SoloView,
  spotsLeft?: (answerAt: number) => number | null,
  /** The seeker was the bot (yesterday's daily on a phone): its moves aren't "You". */
  botSeeker = false,
): LogEvent[] {
  if (!view.replay || !view.result) return [];
  const end = view.result.at;
  const hiding = isHider(view);
  const out: LogEvent[] = [
    ...movesOf(ds, view.replay.hider, "hider", end),
    ...movesOf(ds, view.replay.seeker, "you", end),
  ];
  if (botSeeker && !hiding)
    for (const e of out) if (e.mark.kind === "you") e.text = asSeeker(e.text);
  if (hiding) {
    for (const e of out) {
      if (e.mark.kind === "hider") {
        e.mark = { kind: "you" };
        e.text = e.text
          .replace(/^Hider boards/, "You board")
          .replace(/^Hider changes/, "You change")
          .replace(/^Hider gets/, "You get")
          .replace(/^Hider walks/, "You walk")
          .replace(/^Hider comes/, "You come")
          .replace(/^Hider goes/, "You go")
          .replace(/^Hider reaches their/, "You reach your");
      } else if (e.mark.kind === "you") {
        e.mark = { kind: "hider" };
        e.text = asSeeker(e.text);
      }
    }
    if (view.lock)
      out.push({
        t: view.lock.at,
        mark: { kind: "you" },
        text: view.lock.cause === "hideHere" ? "Locked in" : "Frozen",
      });
  }
  for (const a of view.asked) {
    if (!isAnswered(a) || a.answerAt > end) continue;
    const vetoed = typeof a.answer === "object" && a.answer !== null && "vetoed" in a.answer;
    const onFoot = categoryOf(a.q) === "onFoot";
    const share = onFoot && !vetoed ? spotsLeft?.(a.answerAt) : null;
    const word = a.q.kind === "photo" && !vetoed ? null : answerWord(a.answer, a.q, idx);
    out.push({
      t: a.answerAt,
      mark: { kind: "question", family: familyOf(a.q), vetoed },
      text: word ? `${questionName(a.q)}: ${word}` : questionName(a.q),
      note:
        share !== null && share !== undefined
          ? `${Math.round(share * 100)}% left`
          : !onFoot && a.remaining !== null
            ? `${a.remaining} left`
            : undefined,
      p: [a.ctx.origin.lon, a.ctx.origin.lat],
    });
  }
  for (const e of view.cardEvents) {
    if (CARDS[e.card].kind !== "curse" || e.t > end) continue;
    out.push({
      t: e.t,
      mark: { kind: "curse" },
      text: `${hiding ? "You play" : "Hider plays"} ${CARDS[e.card].title}`,
    });
  }
  const r = view.result;
  out.push({
    t: r.at,
    mark: { kind: r.kind === "found" ? "found" : "end" },
    text:
      hiding && view.incomplete
        ? view.incomplete === "start"
          ? "You didn't leave the start."
          : "Incomplete"
        : r.kind === "found"
          ? "Found"
          : r.kind === "timeout"
            ? "Time's up"
            : "You gave up",
  });
  // Stable: moves before the question asked at the same moment.
  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
    .map((x) => x.e);
}

/** The event the replay is on at time t: the last one that has happened. */
export function currentEvent(log: readonly LogEvent[], t: number): number {
  let k = -1;
  for (let i = 0; i < log.length; i++) if ((log[i] as LogEvent).t <= t) k = i;
  return k;
}
