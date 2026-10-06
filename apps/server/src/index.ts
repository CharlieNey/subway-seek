/**
 * M2 server: every connection plays solo rounds against a bot hider. The bot leaves
 * Times Sq at 10:00 and hides somewhere it could reach in 20 minutes; the seeker's
 * clock starts at 10:20. The server holds the round (including the secret hider) and
 * only ever sends the seeker's view of it. Rooms and a human hider come in M3.
 */
import "./env.ts";
import { formatServiceTime } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import {
  advanceSolo,
  applySoloIntent,
  bonusSeconds,
  buildIndex,
  type ClockSync,
  clientMessageSchema,
  createSoloRound,
  type Difficulty,
  dailyNumber,
  dailyRandom,
  type GameClock,
  gameTime,
  type HidingSpot,
  isAnswered,
  jumpClock,
  nextAnswerAt,
  nextEventTime,
  nyDate,
  pauseClock,
  pickHubId,
  placeHider,
  type RoundMode,
  realMsUntil,
  resumeClock,
  type ServerMessage,
  type SoloRound,
  type SoloView,
  skipSolo,
  soloView,
  startClock,
} from "@stand-clear/engine";
import { type WebSocket, WebSocketServer } from "ws";
import { MatchLog } from "./matchLog.ts";
import { pickExitPano, pickSpot, spotFromPano } from "./spot.ts";

const PORT = Number(process.env.PORT ?? 8787);
const HIDE_START = 10 * 3600;
const SPEED = 6;
// Mixed into the daily seed so players can't compute today's answer from the client code.
const DAILY_SECRET = process.env.DAILY_SECRET ?? "dev-only-daily-secret";
if (!process.env.DAILY_SECRET) console.warn("DAILY_SECRET not set — using a dev secret");

const t0 = performance.now();
const dataset = loadDataset();
const idx = buildIndex(dataset);
const stationIndex = (id: string) => {
  const i = dataset.stations.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`Station ${id} missing from dataset`);
  return i;
};
console.log(
  `dataset ${dataset.meta.serviceDate}: ${dataset.complexes.length} complexes, ` +
    `${dataset.trips.length} trips (ready in ${Math.round(performance.now() - t0)} ms)`,
);

interface Session {
  clock: GameClock;
  round: SoloRound;
  lastSeq: number;
  log: MatchLog;
  /** How many of the hider's card plays are already in the log. */
  cardsLogged: number;
}

/** Log any cards the hider has played since last time. */
function logCards(session: Session) {
  for (const e of session.round.cardEvents.slice(session.cardsLogged)) {
    session.log.write("card", { t: e.t, card: e.card, hand: session.round.hand.length });
  }
  session.cardsLogged = session.round.cardEvents.length;
}

/**
 * The daily is the same for everyone, so it's built once per New York date: the round,
 * and the panoramas for the spot and the exit photo (up to twelve Street View lookups).
 * Only panorama IDs are kept. Google's coordinates aren't cached (spot.ts), so each
 * round looks the spot up again by its ID: one lookup.
 */
interface DailySetup {
  /** The day's round, with its exit photo, before the hider is placed at the spot. */
  round: SoloRound;
  spotPano: string | null;
}
let daily: { date: string; setup: Promise<DailySetup> } | null = null;

function dailySetup(date: string): Promise<DailySetup> {
  if (daily?.date !== date) {
    const setup = buildDaily(date);
    daily = { date, setup };
    // A failed build isn't kept: the next connection tries again.
    setup.catch(() => {
      if (daily?.setup === setup) daily = null;
    });
  }
  return daily.setup;
}

async function buildDaily(date: string): Promise<DailySetup> {
  // Each daily starts somewhere different (same for everyone that day).
  const hub = stationIndex(pickHubId(dailyRandom(`${date}|hub`, DAILY_SECRET)));
  // The daily is Normal for everyone; difficulty is a practice setting.
  const round = createSoloRound(idx, {
    hub,
    hideStart: HIDE_START,
    random: dailyRandom(date, DAILY_SECRET),
    daily: { date, number: dailyNumber(date) },
  });
  // Separate seeds, so the exit doesn't change with how many tries the spot took.
  const [spot, photoExit] = await Promise.all([
    pickSpot(dataset, round.hider, dailyRandom(`${date}|spot`, DAILY_SECRET)),
    pickExitPano(dataset, round.hider, dailyRandom(`${date}|exit`, DAILY_SECRET)),
  ]);
  if (!spot && process.env.GOOGLE_STREETVIEW_SERVER_KEY) {
    console.warn(`daily ${date}: no hiding spot found, so no street endgame today`);
  }
  return { round: { ...round, photoExit }, spotPano: spot?.pano ?? null };
}

async function newRound(
  mode: RoundMode,
  difficulty: Difficulty = "normal",
): Promise<{ round: SoloRound; clock: GameClock; log: MatchLog }> {
  let round: SoloRound;
  // The exact hiding spot for the Street View endgame (same spot all day for the daily).
  let spot: HidingSpot | null;
  if (mode === "daily") {
    const date = nyDate(new Date());
    let setup = await dailySetup(date);
    if (setup.spotPano === null && process.env.GOOGLE_STREETVIEW_SERVER_KEY) {
      // The day's first build found no spot (a lookup can fail). Same seed, so a retry
      // that works gives everyone the same spot; keep it for the rest of the day.
      const retry = await pickSpot(
        dataset,
        setup.round.hider,
        dailyRandom(`${date}|spot`, DAILY_SECRET),
      );
      if (retry) {
        setup = { ...setup, spotPano: retry.pano };
        if (daily?.date === date) daily = { date, setup: Promise.resolve(setup) };
        console.log(`daily ${date}: hiding spot found on retry`);
      }
    }
    round = setup.round;
    spot = setup.spotPano ? await spotFromPano(setup.spotPano) : null;
  } else {
    const hub = stationIndex(pickHubId(Math.random));
    round = createSoloRound(idx, { hub, hideStart: HIDE_START, difficulty });
    // The view outside one of its exits, for "photo from your station's exit".
    const [picked, photoExit] = await Promise.all([
      pickSpot(dataset, round.hider, Math.random),
      pickExitPano(dataset, round.hider, Math.random),
    ]);
    spot = picked;
    round = { ...round, photoExit };
  }
  if (spot) round = placeHider(round, spot, idx);
  const log = new MatchLog();
  log.write("round_start", {
    mode,
    difficulty: round.difficulty,
    daily: round.daily,
    hub: dataset.stations[round.hub]?.id,
    hider: dataset.complexes[round.hider]?.name,
    spot: spot ? { lat: spot.lat, lon: spot.lon } : null,
    photoExit: round.photoExit !== null,
    reachable: round.reachable.length,
    seekStart: round.seekStart,
  });
  return { round, clock: startClock(round.seekStart, SPEED, Date.now()), log };
}

function sync(clock: GameClock, now: number): ClockSync {
  return {
    gameTime: gameTime(clock, now),
    speed: clock.speed,
    serverNow: now,
    paused: clock.pausedAt !== null,
  };
}

function send(socket: WebSocket, msg: ServerMessage) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}

function logEnd(session: Session) {
  const { round } = session;
  if (!round.result) return;
  const elapsed = round.result.at - round.seekStart;
  session.log.write("round_end", {
    result: round.result.kind,
    hider: dataset.complexes[round.hider]?.name,
    elapsedMin: Math.round(elapsed / 60),
    questions: round.asked.length,
    bonusMin: bonusSeconds(round) / 60,
    hiderScoreMin: Math.round((elapsed + bonusSeconds(round)) / 60),
    hiderHand: round.hand,
    cardsPlayed: round.cardEvents.map((e) => e.card),
    stationFoundMin:
      round.stationFoundAt === null
        ? null
        : Math.round((round.stationFoundAt - round.seekStart) / 60),
  });
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", async (socket) => {
  const session: Session = { ...(await newRound("daily")), lastSeq: -1, cardsLogged: 0 };
  /** The seeker's view right now (the hider's marker shows only when they're close). */
  const viewNow = (now: number) => soloView(session.round, gameTime(session.clock, now), idx);
  const answered = (v: SoloView) => v.asked.filter(isAnswered).length;
  let markerShown = false;
  let answersShown = 0;
  let stationLogged = false;
  /** Sends the view the moment the next answer lands (the 1 s tick could be a second late). */
  let answerTimer: ReturnType<typeof setTimeout> | undefined;
  const remember = (now: number) => {
    const v = viewNow(now);
    markerShown = v.spotNearby !== null;
    answersShown = answered(v);
    clearTimeout(answerTimer);
    const next = nextAnswerAt(session.round, gameTime(session.clock, now));
    const ms = next === null ? Number.POSITIVE_INFINITY : realMsUntil(session.clock, next, now);
    if (Number.isFinite(ms)) {
      answerTimer = setTimeout(() => sendState(session.lastSeq, Date.now()), ms + 10);
    }
    return v;
  };
  const sendState = (seq: number, now: number) =>
    send(socket, { type: "state", seq, clock: sync(session.clock, now), view: remember(now) });

  send(socket, {
    type: "hello",
    serviceDate: dataset.meta.serviceDate,
    clock: sync(session.clock, Date.now()),
    view: remember(Date.now()),
  });

  // Rides and walks resolve lazily, so once a second: has the seeker reached the
  // hider's station, come within sight of their spot, had an answer land, or run out
  // of time?
  const timer = setInterval(() => {
    const now = Date.now();
    const next = advanceSolo(session.round, gameTime(session.clock, now), idx);
    const changed = next !== session.round;
    session.round = next;
    logCards(session);
    if (changed) logEnd(session);
    if (session.round.stationFoundAt !== null && !stationLogged) {
      stationLogged = true;
      session.log.write("station_found", { t: session.round.stationFoundAt });
    }
    const v = viewNow(now);
    if (changed || (v.spotNearby !== null) !== markerShown || answered(v) !== answersShown) {
      sendState(session.lastSeq, now);
    }
  }, 1000);
  socket.on("close", () => {
    clearInterval(timer);
    clearTimeout(answerTimer);
    session.log.write("disconnect", {});
  });

  socket.on("message", async (raw) => {
    let json: unknown;
    try {
      json = JSON.parse(String(raw));
    } catch {
      return;
    }
    const parsed = clientMessageSchema.safeParse(json);
    const now = Date.now();
    if (!parsed.success) {
      send(socket, {
        type: "rejected",
        seq: -1,
        error: "Malformed message.",
        clock: sync(session.clock, now),
        view: viewNow(now),
      });
      return;
    }
    const { seq, intent } = parsed.data;
    if (seq <= session.lastSeq) {
      // A retry of something already handled: just restate the round.
      sendState(seq, now);
      return;
    }
    session.lastSeq = seq;

    if (intent.type === "newRound") {
      Object.assign(session, await newRound(intent.mode, intent.difficulty), { cardsLogged: 0 });
      stationLogged = false;
      sendState(seq, Date.now());
      return;
    }

    const t = gameTime(session.clock, now);
    const reject = (error: string) => {
      session.log.write("rejected", { t, type: intent.type, error });
      send(socket, {
        type: "rejected",
        seq,
        error,
        clock: sync(session.clock, now),
        view: viewNow(now),
      });
    };

    // Clock controls. Score is game time, so skipping ahead never helps — it just saves
    // waiting. Pausing would give free thinking time, so it's practice-only.
    if (intent.type === "pause" || intent.type === "resume" || intent.type === "skip") {
      if (session.round.result) return reject("This round is over.");
      if (intent.type === "skip") {
        const target = nextEventTime(session.round.seeker, t, idx, intent.to);
        if (target === null) return reject("Nothing to skip to.");
        // Stops early if the hider plays a card on the way.
        const skipped = skipSolo(session.round, t, Math.min(target, session.round.seekEnd), idx);
        session.round = skipped.round;
        session.clock = jumpClock(session.clock, skipped.t, now);
      } else if (session.round.mode !== "practice") {
        return reject("Pausing is for practice rounds.");
      } else {
        session.clock = (intent.type === "pause" ? pauseClock : resumeClock)(session.clock, now);
      }
      session.log.write("clock", { t, type: intent.type, to: gameTime(session.clock, now) });
      session.round = advanceSolo(session.round, gameTime(session.clock, now), idx);
      logCards(session);
      logEnd(session);
      sendState(seq, now);
      return;
    }
    if (session.clock.pausedAt !== null) return reject("Paused — resume first.");

    const result = applySoloIntent(session.round, intent, t, idx);
    if (result.ok) {
      const before = session.round.asked.length;
      session.round = result.round;
      const asked = session.round.asked;
      if (asked.length > before) {
        const q = asked.at(-1);
        session.log.write("question", { t, q: q?.q, answer: q?.answer, remaining: q?.remaining });
      } else {
        session.log.write("intent", { t, type: intent.type });
      }
      logCards(session);
      logEnd(session);
      sendState(seq, now);
    } else {
      reject(result.error);
    }
    console.log(
      `${formatServiceTime(t)} ${intent.type} → ${result.ok ? "ok" : `rejected: ${result.error}`}`,
    );
  });
});

console.log(
  `listening on ws://localhost:${PORT} · daily #${dailyNumber(nyDate(new Date()))} + practice rounds, ${SPEED}×`,
);
