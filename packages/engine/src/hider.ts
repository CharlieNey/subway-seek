/** Human hiding, with the same transit, questions, deck and catch rules as solo seeking. */
import {
  CARD_VALUE,
  CARDS,
  type CardId,
  type CurseId,
  DRAWS,
  HAND_LIMIT,
  handBonusSeconds,
  trimHand,
} from "./cards.ts";
import { hashString, seededRandom } from "./daily.ts";
import { distanceMeters } from "./geo.ts";
import {
  type Answer,
  type Asked,
  categoryOf,
  closedQuestions,
  evaluate,
  evaluateSpot,
  filterCandidates,
  isMapQuestion,
  isSpotQuestion,
  PHOTO_LOOKS,
  type Photo,
  photoCamera,
  type Question,
  questionKey,
  questionPool,
  ZONE_RADIUS_M,
} from "./questions.ts";
import {
  ANSWER_WINDOW_SECONDS,
  type AskedQuestion,
  activateCurse,
  advanceSolo,
  CURSE_GAP_SECONDS,
  createSoloRound,
  firstWithin,
  type HidingSpot,
  needsStreet,
  type SoloResult,
  type SoloRound,
  type SoloView,
  SPOT_PHOTOS_OPEN_SECONDS,
  soloView,
  stationOnly,
} from "./solo.ts";
import type { TimetableIndex } from "./timetable.ts";
import type { TrailEntry } from "./trail.ts";
import {
  applyIntent,
  lastStation,
  type OnPlatform,
  resolve,
  type Transit,
  type TransitIntent,
} from "./transit.ts";

export const KEEP_SECONDS = 60;
/** What a hider hears trying to come up in a round that ends at the station. */
export const STAY_BELOW =
  "This round ends at the station, so you stay below. The seeker finds you by reaching it.";
export type LockCause = "hideHere" | "photo" | "zone" | "latestExit";
export interface DrawChoice {
  cards: CardId[];
  keep: number;
  until: number;
  revision: number;
}
export interface PendingAnswer {
  index: number;
  decision: "true" | "veto" | "randomize" | null;
}
export interface HumanHider {
  /** Opaque server-generated identity; never a deck seed. */
  roundId: string;
  transit: Transit;
  /** Actual platform at the hide deadline. */
  station: number | null;
  lock: { at: number; cause: LockCause } | null;
  entered: { at: number; complex: number; exit: number; walked: boolean } | null;
  /** Verified Google panoramas at this station's exits, supplied by the server. */
  exits: Record<number, HidingSpot>;
  walkFrom: HidingSpot | null;
  pending: PendingAnswer[];
  draw: DrawChoice | null;
  handRevision: number;
  incomplete: "left" | "start" | null;
}
export type HiderIntent =
  | TransitIntent
  | { type: "hideHere"; pano: string; lat: number; lon: number }
  | { type: "answer"; question: number; decision: "true" | "veto" | "randomize" }
  | { type: "keepCards"; revision: number; keep: number[]; discard: number[] }
  | { type: "playCard"; revision: number; card: number; payment: number[] }
  | { type: "redraw"; revision: number; card: number; payment: number[] }
  | { type: "leaveHide" }
  | { type: "streetOff" };

export function createHideRound(
  idx: TimetableIndex,
  opts: Parameters<typeof createSoloRound>[1] & { roundId?: string },
): SoloRound {
  const round = createSoloRound(idx, opts);
  const transit: OnPlatform = {
    kind: "platform",
    station: round.hub,
    since: round.hideStart,
    arrivedDir: null,
  };
  return {
    ...round,
    mode: "hide",
    hider: -1,
    hiderTrail: [{ t: round.hideStart, state: transit }],
    human: {
      roundId: opts.roundId ?? "fixture",
      transit,
      station: null,
      lock: null,
      entered: null,
      exits: {},
      walkFrom: null,
      pending: [],
      draw: null,
      handRevision: 0,
      incomplete: null,
    },
  };
}

/** Exits outside the zone stay visible. Only when all are outside is the nearest allowed. */
export function hiderExits(round: SoloRound, idx: TimetableIndex) {
  const c = idx.ds.complexes[round.hider];
  if (!c) return [];
  const rows = c.exits.map(([lat, lon], exit) => ({
    exit,
    lat,
    lon,
    meters: distanceMeters(c, { lat, lon }),
  }));
  const nearest = [...rows].sort((a, b) => a.meters - b.meters)[0]?.exit;
  const anyInside = rows.some((e) => e.meters <= ZONE_RADIUS_M);
  return rows.map((e) => ({
    ...e,
    allowed: e.meters <= ZONE_RADIUS_M || (!anyInside && e.exit === nearest),
  }));
}

export function defaultHiderExit(round: SoloRound, idx: TimetableIndex): number {
  const platform = idx.ds.stations[round.human?.station ?? round.hub];
  return (
    hiderExits(round, idx)
      .filter((e) => e.allowed)
      .sort((a, b) => distanceMeters(a, platform ?? a) - distanceMeters(b, platform ?? b))[0]
      ?.exit ?? 0
  );
}

/** Trusted metadata input, not a client intent. Coordinates live only in the active round. */
export function setHiderExit(round: SoloRound, exit: number, spot: HidingSpot): SoloRound {
  if (!round.human) return round;
  return {
    ...round,
    human: { ...round.human, exits: { ...round.human.exits, [exit]: spot } },
    photoExit: exit === 0 || !round.photoExit ? spot.pano : round.photoExit,
  };
}

function moveHider(round: SoloRound, transit: Transit, t: number): SoloRound {
  const h = round.human;
  if (!h) return round;
  return {
    ...round,
    human: { ...h, transit },
    hiderTrail: [...round.hiderTrail, { t, state: transit }],
  };
}

export function hiderPoint(round: SoloRound, t: number, idx: TimetableIndex): HidingSpot | null {
  const h = round.human;
  if (!h) return round.spot;
  if (h.lock) return round.spot;
  const s = resolve(h.transit, t, idx);
  if (s.kind === "street") {
    if (s.at?.pano) return { ...s.at, pano: s.at.pano };
    return h.exits[s.exit] ?? null;
  }
  if (s.kind === "walking" && s.reason === "street" && s.dest.kind === "street") {
    const dest = s.dest.at;
    return (t - s.start) * 2 < s.end - s.start
      ? h.walkFrom
      : dest?.pano
        ? { ...dest, pano: dest.pano }
        : null;
  }
  return null;
}

export function hiderUnderground(round: SoloRound, t: number, idx: TimetableIndex): boolean {
  const s = round.human && resolve(round.human.transit, t, idx);
  return (
    !!s &&
    s.kind !== "street" &&
    !(s.kind === "walking" && (s.reason === "street" || s.reason === "exit"))
  );
}

function lockHider(round: SoloRound, cause: LockCause, t: number, idx: TimetableIndex): SoloRound {
  const h = round.human;
  if (!h || h.lock) return round;
  const spot = hiderPoint(round, t, idx);
  if (!spot) return round; // external metadata must be supplied before a street arrival
  const s = resolve(h.transit, t, idx);
  const street =
    s.kind === "street" ? s : s.kind === "walking" && s.dest.kind === "street" ? s.dest : null;
  if (!street) return round;
  const moved = moveHider(round, { ...street, at: spot, since: t }, t);
  return {
    ...moved,
    spot,
    human: { ...(moved.human as HumanHider), lock: { at: t, cause }, walkFrom: null },
  };
}

/** First public entry into a candidate circle. The same calculation drives freeze and belief. */
export function firstZoneEntry(
  trail: readonly TrailEntry[],
  centre: { lat: number; lon: number },
  t: number,
) {
  let best: { at: number; complex: number; exit: number; walked: boolean } | null = null;
  for (let i = 0; i < trail.length; i++) {
    const e = trail[i];
    if (!e || e.t > t) continue;
    const s = e.state;
    const until = Math.min(t, trail[i + 1]?.t ?? t);
    let at: number | null = null;
    const street =
      s.kind === "street" ? s : s.kind === "walking" && s.dest.kind === "street" ? s.dest : null;
    if (!street) continue;
    if (s.kind === "street" && s.at && distanceMeters(centre, s.at) <= ZONE_RADIUS_M) at = e.t;
    if (
      s.kind === "walking" &&
      s.reason === "exit" &&
      s.end <= until &&
      distanceMeters(centre, { lat: s.toPoint[0], lon: s.toPoint[1] }) <= ZONE_RADIUS_M
    )
      at = s.end;
    if (s.kind === "walking" && s.reason === "street") {
      const from = { lat: s.fromPoint[0], lon: s.fromPoint[1] };
      const f =
        distanceMeters(centre, from) <= ZONE_RADIUS_M
          ? 0
          : firstWithin(s.fromPoint, s.toPoint, centre, ZONE_RADIUS_M);
      if (f !== null) {
        const crossing = s.start + f * (s.end - s.start);
        if (crossing <= until) at = crossing;
      }
    }
    if (at !== null && (!best || at < best.at))
      best = {
        at,
        complex: street.complex,
        exit: street.exit,
        walked: s.kind === "walking" && s.reason === "street",
      };
  }
  return best;
}

function settleKeep(round: SoloRound): SoloRound {
  const h = round.human;
  const d = h?.draw;
  if (!h || !d) return round;
  const kept = [...d.cards].sort((a, b) => CARD_VALUE[b] - CARD_VALUE[a]).slice(0, d.keep);
  return {
    ...round,
    hand: trimHand([...round.hand, ...kept]),
    human: { ...h, draw: null, handRevision: h.handRevision + 1 },
  };
}

function drawCards(round: SoloRound, draw: number, keep: number, t: number): SoloRound {
  round = settleKeep(round);
  const h = round.human as HumanHider;
  const cards = round.deck.slice(0, draw);
  if (!cards.length) return round;
  const revision = h.handRevision + 1;
  const next = {
    ...round,
    deck: round.deck.slice(draw),
    human: {
      ...h,
      handRevision: revision,
      draw: { cards, keep: Math.min(keep, cards.length), until: t + KEEP_SECONDS, revision },
    },
  };
  return cards.length === 1 && round.hand.length < HAND_LIMIT ? settleKeep(next) : next;
}

/** Request-time true answer; photo location is materialized only when it is sent. */
export function humanAnswer(
  round: SoloRound,
  asked: Asked,
  t: number,
  idx: TimetableIndex,
): Answer {
  const q = asked.q;
  if (isMapQuestion(q)) return evaluate(idx.ds, q, round.hider, asked.ctx);
  if (isSpotQuestion(q)) {
    const p =
      hiderPoint(round, t, idx) ??
      round.human?.exits[defaultHiderExit(round, idx)] ??
      idx.ds.complexes[round.hider];
    return evaluateSpot(q, p as { lat: number; lon: number }, asked.ctx);
  }
  const pano = q.from === "exit" ? round.photoExit : hiderPoint(round, t, idx)?.pano;
  return { photo: photoCamera(pano ?? "", q.look) };
}

export function queueHumanQuestion(
  round: SoloRound,
  asked: Asked,
  t: number,
  idx: TimetableIndex,
): SoloRound {
  const h = round.human as HumanHider;
  const index = round.asked.length;
  const answerAt = categoryOf(asked.q) === "onFoot" ? t : t + ANSWER_WINDOW_SECONDS;
  const entry = { ...asked, at: t, answerAt, remaining: round.reachable.length };
  const next = {
    ...round,
    asked: [...round.asked, entry],
    human: { ...h, pending: [...h.pending, { index, decision: null }] },
    thermometer: asked.q.kind === "thermometer" ? asked.ctx.origin : round.thermometer,
    footThermometer: asked.q.kind === "spotThermometer" ? asked.ctx.origin : round.footThermometer,
  };
  return answerAt === t ? settleAnswer(next, index, t, idx) : next;
}

function settleAnswer(round: SoloRound, index: number, t: number, idx: TimetableIndex): SoloRound {
  const h = round.human as HumanHider;
  const pending = h.pending.find((p) => p.index === index);
  const a = round.asked[index];
  if (!pending || !a) return round;
  if (pending.decision !== "veto" && a.q.kind === "photo" && a.q.from === "spot")
    round = lockHider(round, "photo", t, idx);
  const answer =
    pending.decision === "veto" ? { vetoed: true as const } : humanAnswer(round, a, t, idx);
  const known = round.asked.filter((q, i) => i !== index && q.answerAt <= t);
  const entry = {
    ...a,
    answer,
    remaining: filterCandidates(idx.ds, round.reachable, [...known, { ...a, answer }]).length,
  };
  round = {
    ...round,
    asked: round.asked.map((q, i) => (i === index ? entry : q)),
    human: { ...(round.human as HumanHider), pending: h.pending.filter((p) => p.index !== index) },
  };
  if (pending.decision !== "veto") {
    const { draw, keep } = DRAWS[categoryOf(a.q)];
    round = drawCards(round, draw, keep, t);
  }
  return round;
}

/** Deterministic transitions, settled in game-time order even across a sparse tick. */
export function advanceHider(round: SoloRound, t: number, idx: TimetableIndex): SoloRound {
  if (!round.human || round.result) return round;
  t = Math.min(t, round.seekEnd);
  let h = round.human;
  if (h.station === null && t >= round.seekStart) {
    const station = lastStation(h.transit, round.seekStart, idx);
    if (station === null) return round;
    const complex = idx.ds.stations[station]?.complex as number;
    round = moveHider(
      { ...round, hider: complex, human: { ...h, station } },
      { kind: "platform", station, since: round.seekStart, arrivedDir: null },
      round.seekStart,
    );
    h = round.human as HumanHider;
    if (!round.reachable.includes(complex))
      return {
        ...round,
        result: { kind: "gaveUp", at: round.seekStart },
        human: { ...h, incomplete: "start" },
      };
  }
  if (t < round.seekStart) return round;
  const centre = idx.ds.complexes[round.hider];
  const entry = centre && !h.entered ? firstZoneEntry(round.seekerTrail, centre, t) : null;
  const latest = round.seekStart + SPOT_PHOTOS_OPEN_SECONDS;
  const moments = new Set<number>();
  if (entry) moments.add(Math.max(entry.at, round.seekStart));
  // Entry on the stairs freezes at the chosen exit, after the remaining travel time.
  const stairs = h.transit;
  const enteredAt = h.entered?.at ?? entry?.at;
  const exitFreezeAt =
    !h.lock &&
    stairs.kind === "walking" &&
    stairs.reason === "exit" &&
    enteredAt !== undefined &&
    enteredAt <= stairs.end
      ? stairs.end
      : null;
  if (exitFreezeAt !== null && exitFreezeAt <= t) moments.add(exitFreezeAt);
  if (!h.lock && !round.stationOnly && latest <= t && hiderUnderground(round, latest, idx))
    moments.add(latest);
  for (const p of h.pending) {
    const at = round.asked[p.index]?.answerAt;
    if (at !== undefined && at <= t) moments.add(at);
  }
  if (h.draw && h.draw.until <= t) moments.add(h.draw.until);
  for (const at of [...moments].sort((a, b) => a - b)) {
    h = round.human as HumanHider;
    if (entry && at === Math.max(entry.at, round.seekStart) && !h.entered) {
      round = { ...round, human: { ...h, entered: entry } };
      if (hiderUnderground(round, at, idx))
        return finishHider({ ...round, result: { kind: "found", at }, stationFoundAt: at });
      round = lockHider(round, "zone", at, idx);
    }
    if (at === exitFreezeAt) round = lockHider(round, "zone", at, idx);
    if (at === latest && !round.human?.lock && hiderUnderground(round, at, idx)) {
      const exit = defaultHiderExit(round, idx);
      const spot = round.human?.exits[exit];
      if (spot) {
        round = moveHider(
          round,
          { kind: "street", complex: round.hider, exit, at: spot, since: at, up: at },
          at,
        );
        round = lockHider(round, "latestExit", at, idx);
      }
    }
    for (const p of [...(round.human?.pending ?? [])])
      if (round.asked[p.index]?.answerAt === at) round = settleAnswer(round, p.index, at, idx);
    if (round.human?.draw && round.human.draw.until <= at) round = settleKeep(round);
  }
  // A draw created during this advance can also have expired by the target time.
  if (round.human?.draw && round.human.draw.until <= t) round = settleKeep(round);
  return round;
}

export function finishHider(round: SoloRound): SoloRound {
  return settleKeep(round);
}

export function randomizeOptions(round: SoloRound, index: number, idx: TimetableIndex): Question[] {
  const a = round.asked[index];
  if (!a) return [];
  const q = a.q;
  const closed = closedQuestions(round.asked.filter((x) => x.answerAt <= a.at));
  const pool: Question[] =
    q.kind === "photo"
      ? PHOTO_LOOKS.map((look) => ({ ...q, look }))
      : isMapQuestion(q)
        ? questionPool(idx.ds, a.ctx.origin, a.ctx.baseline).map((x) => x.q)
        : [];
  return pool.filter(
    (o) =>
      categoryOf(o) === categoryOf(q) &&
      questionKey(o) !== questionKey(q) &&
      !closed.has(questionKey(o)),
  );
}

const fail = (error: string): SoloResult => ({ ok: false, error });
const unique = (xs: number[]) => new Set(xs).size === xs.length;

/** Hider role only; the server verifies panorama metadata before invoking street intents. */
export function applyHiderIntent(
  current: SoloRound,
  intent: HiderIntent,
  t: number,
  idx: TimetableIndex,
): SoloResult {
  let round = advanceSolo(current, t, idx);
  let h = round.human;
  if (!h) return fail("This round has no human hider.");
  if (round.result) return fail("This round is over.");
  const ok = (r: SoloRound): SoloResult => ({ ok: true, round: r });
  if (intent.type === "streetOff") {
    if (round.stationOnly) return ok(round);
    if (h.lock || !hiderUnderground(round, t, idx))
      return fail("You're already on the street, so this round carries on.");
    return ok(stationOnly(round));
  }
  if (intent.type === "leaveHide")
    return ok(
      finishHider({
        ...round,
        result: { kind: "gaveUp", at: t },
        human: { ...h, incomplete: "left" },
      }),
    );
  if (intent.type === "answer") {
    const p = h.pending.find((p) => p.index === intent.question);
    const a = round.asked[intent.question];
    if (!p || !a || t >= a.answerAt || p.decision !== null)
      return fail("That answer is already set.");
    if (intent.decision !== "true") {
      round = settleKeep(round);
      h = round.human as HumanHider;
      const card = intent.decision;
      const at = round.hand.indexOf(card);
      if (at < 0) return fail("That card is no longer in your hand.");
      let q = a.q;
      if (card === "randomize") {
        const choices = randomizeOptions(round, intent.question, idx);
        if (!choices.length) return fail("No other question is available.");
        q = choices[
          Math.floor(
            seededRandom(hashString(`${round.rngSeed}|${intent.question}`))() * choices.length,
          )
        ] as Question;
      }
      round = {
        ...round,
        hand: round.hand.filter((_, i) => i !== at),
        cardEvents: [...round.cardEvents, { t: a.answerAt, card }],
        asked: round.asked.map((x, i) =>
          i === intent.question && card === "randomize" ? { ...x, q, randomizedFrom: x.q } : x,
        ),
        human: { ...h, handRevision: h.handRevision + 1 },
      };
    } else if (a.q.kind === "photo" && a.q.from === "spot" && !h.lock) {
      if (!hiderPoint(round, t, idx)) return fail("Come up to the street first.");
      round = lockHider(round, "photo", t, idx);
    }
    return ok({
      ...round,
      human: {
        ...(round.human as HumanHider),
        pending: (round.human as HumanHider).pending.map((x) =>
          x.index === intent.question ? { ...x, decision: intent.decision } : x,
        ),
      },
    });
  }
  if (intent.type === "keepCards") {
    const d = h.draw;
    if (
      !d ||
      d.revision !== intent.revision ||
      !unique(intent.keep) ||
      !unique(intent.discard) ||
      intent.keep.length !== d.keep ||
      intent.keep.some((i) => !d.cards[i])
    )
      return fail("Choose the cards to keep.");
    const combined = [...round.hand, ...intent.keep.map((i) => d.cards[i] as CardId)];
    if (
      intent.discard.length !== Math.max(0, combined.length - HAND_LIMIT) ||
      intent.discard.some((i) => !combined[i])
    )
      return fail("Choose cards to discard down to 6.");
    return ok({
      ...round,
      hand: combined.filter((_, i) => !intent.discard.includes(i)),
      human: { ...h, draw: null, handRevision: h.handRevision + 1 },
    });
  }
  if (intent.type === "playCard" || intent.type === "redraw") {
    if (h.draw) return fail("Keep your drawn cards first.");
    const card = round.hand[intent.card];
    if (
      intent.revision !== h.handRevision ||
      !card ||
      !unique(intent.payment) ||
      intent.payment.includes(intent.card) ||
      intent.payment.some((i) => !round.hand[i])
    )
      return fail("That hand has changed. Choose your cards again.");
    const def = CARDS[card];
    const cost = intent.type === "redraw" ? 2 : def.cost;
    if (
      intent.payment.length !== cost ||
      (intent.type === "redraw" ? card !== "redraw" : def.kind !== "curse")
    )
      return fail("Choose the cards to pay for this play.");
    if (intent.type === "playCard") {
      if (round.stationOnly && needsStreet(card))
        return fail("That card needs the street, and this round ends at the station.");
      if (t < round.seekStart || round.curses.length || t < round.lastCurseAt + CURSE_GAP_SECONDS)
        return fail("Wait until another curse is ready.");
      const activated = activateCurse(round, card as CurseId, t, idx);
      if (!activated) return fail("Play this while the seeker is riding.");
      round = activated;
    }
    const remove = new Set([intent.card, ...intent.payment]);
    round = {
      ...round,
      hand: round.hand.filter((_, i) => !remove.has(i)),
      cardEvents: [...round.cardEvents, { t, card }],
      human: { ...h, handRevision: h.handRevision + 1 },
    };
    return ok(intent.type === "redraw" ? drawCards(round, 3, 3, t) : round);
  }
  // At the station only, the hider stays below: nothing to come up to (DESIGN.md, Playable
  // without Google).
  if (round.stationOnly && (intent.type === "hideHere" || intent.type === "exit"))
    return fail(STAY_BELOW);
  if (intent.type === "hideHere") {
    const s = resolve(h.transit, t, idx);
    const point = hiderPoint(round, t, idx);
    if (
      h.lock ||
      t < round.seekStart ||
      s.kind !== "street" ||
      !point ||
      point.pano !== intent.pano ||
      distanceMeters(point, intent) > 5
    )
      return fail("That spot couldn't be checked. Try again.");
    return ok(lockHider(round, "hideHere", t, idx));
  }
  if (h.lock) return fail("You're locked here.");
  if (t < round.seekStart) {
    if (!["board", "cancelBoard", "alightAt", "transfer"].includes(intent.type))
      return fail("Exits open at 10:20.");
  } else {
    if (intent.type !== "exit" && intent.type !== "walkTo") return fail("Stay inside your zone.");
    if (
      intent.type === "exit" &&
      !hiderExits(round, idx).some((e) => e.exit === intent.exit && e.allowed)
    )
      return fail("Outside your zone");
    if (intent.type === "exit" && !h.exits[intent.exit])
      return fail("That spot couldn't be checked. Try again.");
    if (
      intent.type === "walkTo" &&
      (!intent.pano ||
        distanceMeters(idx.ds.complexes[round.hider] as { lat: number; lon: number }, intent) >
          ZONE_RADIUS_M)
    )
      return fail("Stay inside your zone.");
  }
  const from = hiderPoint(round, t, idx);
  const result = applyIntent(h.transit, intent, t, idx, { pastRadius: true });
  if (!result.ok) return result;
  if (t < round.seekStart && result.state.kind === "walking" && result.state.end > round.seekStart)
    return fail("That transfer arrives after 10:20.");
  let transit = result.state;
  if (intent.type === "exit" && transit.kind === "walking" && transit.dest.kind === "street") {
    const spot = h.exits[intent.exit] as HidingSpot;
    transit = { ...transit, toPoint: [spot.lat, spot.lon], dest: { ...transit.dest, at: spot } };
  }
  if (intent.type === "exit")
    round = { ...round, photoExit: h.exits[intent.exit]?.pano ?? round.photoExit };
  round = moveHider(round, transit, t);
  return ok({
    ...round,
    human: { ...(round.human as HumanHider), walkFrom: intent.type === "walkTo" ? from : null },
  });
}

/** Public transit without a private planned alighting stop or later trail changes. */
function visibleTransit(s: Transit, t: number, idx: TimetableIndex): Transit {
  const resolved = resolve(s, t, idx);
  return resolved.kind === "train"
    ? { ...resolved, to: (idx.ds.trips[resolved.trip]?.stops.length ?? 1) - 1 }
    : resolved;
}
/** A completed public trail: hide private alighting choices and their no-op events. */
function publicSeekerTrail(round: SoloRound, t: number, idx: TimetableIndex): TrailEntry[] {
  const out: TrailEntry[] = [];
  const add = (at: number, state: Transit) => {
    if (JSON.stringify(out.at(-1)?.state) !== JSON.stringify(state)) out.push({ t: at, state });
  };
  for (let i = 0; i < round.seekerTrail.length; i++) {
    const e = round.seekerTrail[i] as TrailEntry;
    if (e.t > t) break;
    add(e.t, visibleTransit(e.state, e.t, idx));
    const until = Math.min(t, round.seekerTrail[i + 1]?.t ?? t);
    const end = resolve(e.state, until, idx);
    if (
      (e.state.kind === "train" || e.state.kind === "walking") &&
      (end.kind === "platform" || end.kind === "street")
    )
      add(end.since, end);
  }
  return out;
}
export type HideStatus = "riding" | "changing" | "walking";
export function hideStatus(round: SoloRound, t: number, idx: TimetableIndex): HideStatus {
  const s = round.human && resolve(round.human.transit, t, idx);
  if (s?.kind === "walking") return "walking";
  if (s?.kind === "train" && t >= (idx.ds.trips[s.trip]?.dep[s.from] ?? Infinity)) return "riding";
  return "changing";
}
export interface HiderView extends Omit<SoloView, "seeker"> {
  role: "hider";
  roundId: string;
  seeker: Transit;
  self: Transit;
  ownTrail: TrailEntry[];
  seekerTrail: TrailEntry[];
  station: number | null;
  zone: { lat: number; lon: number; radius: number } | null;
  spot: HidingSpot | null;
  spotPhoto: Photo | null;
  lock: HumanHider["lock"];
  entered: HumanHider["entered"];
  hand: CardId[];
  deckSize: number;
  handRevision: number;
  draw: DrawChoice | null;
  incoming: {
    index: number;
    trueAnswer: Answer;
    remaining: number;
    decision: PendingAnswer["decision"];
    randomizable: boolean;
  }[];
  exits: ReturnType<typeof hiderExits>;
  incomplete: HumanHider["incomplete"];
  heldBonusSeconds: number;
  /** Final score only; live score is derived from the shared clock. */
  scoreSeconds: number | null;
  hideStatus: HideStatus;
}
export function hiderView(round: SoloRound, t: number, idx: TimetableIndex): HiderView {
  round = advanceSolo(round, t, idx);
  const h = round.human;
  if (!h) throw new Error("Not a human hide");
  const view = soloView(round, t, idx);
  const c = idx.ds.complexes[round.hider];
  return {
    ...view,
    role: "hider",
    roundId: h.roundId,
    seeker: visibleTransit(round.seeker, t, idx),
    self: h.transit,
    ownTrail: round.hiderTrail,
    seekerTrail: publicSeekerTrail(round, t, idx),
    station: h.station,
    zone: c ? { lat: c.lat, lon: c.lon, radius: ZONE_RADIUS_M } : null,
    spot: hiderPoint(round, t, idx),
    spotPhoto: round.spot ? photoCamera(round.spot.pano, "N") : null,
    lock: h.lock,
    entered: h.entered,
    hand: round.hand,
    deckSize: round.deck.length,
    handRevision: h.handRevision,
    draw: h.draw,
    exits: hiderExits(round, idx),
    incomplete: h.incomplete,
    heldBonusSeconds: handBonusSeconds(round.hand),
    scoreSeconds:
      h.incomplete || !round.result
        ? null
        : Math.max(0, round.result.at - round.seekStart) + view.bonusSeconds,
    hideStatus: hideStatus(round, t, idx),
    incoming: h.pending.map((p) => {
      const a = round.asked[p.index] as AskedQuestion;
      const trueAnswer = humanAnswer(round, a, t, idx);
      return {
        ...p,
        trueAnswer,
        remaining: filterCandidates(idx.ds, view.candidates, [{ ...a, answer: trueAnswer }]).length,
        randomizable: randomizeOptions(round, p.index, idx).length > 0,
      };
    }),
  };
}
