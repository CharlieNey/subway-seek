/**
 * M2 server: every session plays solo rounds against a bot hider. The bot leaves
 * Times Sq at 10:00 and hides somewhere it could reach in 20 minutes; the seeker's
 * clock starts at 10:20. The server holds the round (including the secret hider) and
 * only ever sends the seeker's view of it. Rooms and a human hider come in M3.
 *
 * A session outlives its connection (sessions.ts): a drop pauses the clock, and a
 * reconnect with the session token within the grace period picks the round up again.
 */
import "./env.ts";
import { formatServiceTime } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import {
  advanceSolo,
  applySoloIntent,
  bonusSeconds,
  buildIndex,
  CLOSE_TAKEN_OVER,
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
  RECONNECT_GRACE_MS,
  type RoundMode,
  realMsUntil,
  resumeClock,
  SESSION_PARAM,
  type ServerMessage,
  type SoloRound,
  type SoloView,
  skipSolo,
  soloView,
  startClock,
} from "@stand-clear/engine";
import { type WebSocket, WebSocketServer } from "ws";
import { MatchLog } from "./matchLog.ts";
import { type Session, SessionStore } from "./sessions.ts";
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

/** One session's round, clock and bookkeeping. */
interface Game {
  clock: GameClock;
  round: SoloRound;
  lastSeq: number;
  log: MatchLog;
  /** How many of the hider's card plays are already in the log. */
  cardsLogged: number;
  stationLogged: boolean;
  /** What the client last saw, to tell when the 1 s tick has news. */
  markerShown: boolean;
  answersShown: number;
  /** Sends the view the moment the next answer lands (the 1 s tick could be a second late). */
  answerTimer: ReturnType<typeof setTimeout> | undefined;
}

/** Log any cards the hider has played since last time. */
function logCards(game: Game) {
  for (const e of game.round.cardEvents.slice(game.cardsLogged)) {
    game.log.write("card", { t: e.t, card: e.card, hand: game.round.hand.length });
  }
  game.cardsLogged = game.round.cardEvents.length;
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
    hiderComplex: round.hider,
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

function logEnd(game: Game) {
  const { round } = game;
  if (!round.result) return;
  const elapsed = round.result.at - round.seekStart;
  game.log.write("round_end", {
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

/** A fresh game for a session: a new round with its own log, nothing sent yet. */
async function newGame(mode: RoundMode, difficulty?: Difficulty) {
  return {
    ...(await newRound(mode, difficulty)),
    cardsLogged: 0,
    stationLogged: false,
    markerShown: false,
    answersShown: 0,
  };
}

const sessions = new SessionStore<Game>({
  graceMs: RECONNECT_GRACE_MS,
  onExpire: ({ game }) => {
    clearTimeout(game.answerTimer);
    const t = gameTime(game.clock, Date.now());
    game.log.write("abandoned", { t, over: game.round.result !== null });
    console.log(`${formatServiceTime(t)} session dropped after the grace period`);
  },
});

/** The seeker's view right now (the hider's marker shows only when they're close). */
const viewNow = (game: Game, now: number) => soloView(game.round, gameTime(game.clock, now), idx);
const answered = (v: SoloView) => v.asked.filter(isAnswered).length;

/** The view to send, noting what it shows and timing the push for the next answer. */
function remember(session: Session<Game>, now: number): SoloView {
  const { game } = session;
  const v = viewNow(game, now);
  game.markerShown = v.spotNearby !== null;
  game.answersShown = answered(v);
  clearTimeout(game.answerTimer);
  const next = nextAnswerAt(game.round, gameTime(game.clock, now));
  const ms = next === null ? Number.POSITIVE_INFINITY : realMsUntil(game.clock, next, now);
  if (Number.isFinite(ms)) {
    game.answerTimer = setTimeout(() => sendState(session, game.lastSeq, Date.now()), ms + 10);
  }
  return v;
}

function sendState(session: Session<Game>, seq: number, now: number) {
  const socket = session.conn as WebSocket | null;
  if (!socket) return;
  send(socket, {
    type: "state",
    seq,
    clock: sync(session.game.clock, now),
    view: remember(session, now),
  });
}

/**
 * Rides and walks resolve lazily, so once a second: has the seeker reached the hider's
 * station, come within sight of their spot, had an answer land, or run out of time?
 * Only connected sessions: a dropped one's clock is paused.
 */
function tick(session: Session<Game>, now: number) {
  const { game } = session;
  const next = advanceSolo(game.round, gameTime(game.clock, now), idx);
  const changed = next !== game.round;
  game.round = next;
  logCards(game);
  if (changed) logEnd(game);
  if (game.round.stationFoundAt !== null && !game.stationLogged) {
    game.stationLogged = true;
    game.log.write("station_found", { t: game.round.stationFoundAt });
  }
  const v = viewNow(game, now);
  if (
    changed ||
    (v.spotNearby !== null) !== game.markerShown ||
    answered(v) !== game.answersShown
  ) {
    sendState(session, game.lastSeq, now);
  }
}

const wss = new WebSocketServer({ port: PORT });

setInterval(() => {
  const now = Date.now();
  for (const session of sessions.connected()) tick(session, now);
}, 1000);

// A connection that stops answering pings is dead (a laptop lid shut, a train tunnel):
// end it, so its session pauses now rather than when TCP gives up.
const alive = new WeakMap<WebSocket, boolean>();
setInterval(() => {
  for (const socket of wss.clients) {
    if (alive.get(socket) === false) {
      socket.terminate();
      continue;
    }
    alive.set(socket, false);
    socket.ping();
  }
}, 10_000);

wss.on("connection", async (socket, req) => {
  alive.set(socket, true);
  socket.on("pong", () => alive.set(socket, true));
  const token = new URL(req.url ?? "/", "http://localhost").searchParams.get(SESSION_PARAM);
  let session = sessions.get(token);
  const resumed = session !== undefined;
  if (!session) {
    const game: Game = { ...(await newGame("daily")), lastSeq: -1, answerTimer: undefined };
    // It may have gone while the round was being built.
    if (socket.readyState !== socket.OPEN) return;
    session = sessions.create(game);
  }
  const s = session;
  const now = Date.now();
  const replaced = sessions.attach(s, socket, now);
  if (replaced) replaced.close(CLOSE_TAKEN_OVER, "Opened somewhere else");
  if (resumed)
    s.game.log.write("reconnect", { t: gameTime(s.game.clock, now), replaced: !!replaced });

  send(socket, {
    type: "hello",
    session: s.token,
    resumed,
    seq: s.game.lastSeq,
    serviceDate: dataset.meta.serviceDate,
    clock: sync(s.game.clock, now),
    view: remember(s, now),
  });

  socket.on("close", () => {
    const at = Date.now();
    if (!sessions.detach(s, socket, at)) return;
    clearTimeout(s.game.answerTimer);
    s.game.log.write("disconnect", { t: gameTime(s.game.clock, at) });
  });

  socket.on("message", async (raw) => {
    // A connection whose session moved to another tab no longer plays it.
    if (s.conn !== socket) return;
    const game = s.game;
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
        clock: sync(game.clock, now),
        view: viewNow(game, now),
      });
      return;
    }
    const { seq, intent } = parsed.data;
    if (seq <= game.lastSeq) {
      // A retry of something already handled (a resend after a reconnect): restate the round.
      sendState(s, seq, now);
      return;
    }
    game.lastSeq = seq;

    if (intent.type === "newRound") {
      clearTimeout(game.answerTimer);
      Object.assign(game, await newGame(intent.mode, intent.difficulty));
      sendState(s, seq, Date.now());
      return;
    }

    const t = gameTime(game.clock, now);
    const reject = (error: string) => {
      game.log.write("rejected", { t, type: intent.type, error });
      send(socket, {
        type: "rejected",
        seq,
        error,
        clock: sync(game.clock, now),
        view: viewNow(game, now),
      });
    };

    // Clock controls. Score is game time, so skipping ahead never helps — it just saves
    // waiting. Pausing would give free thinking time, so it's practice-only.
    if (intent.type === "pause" || intent.type === "resume" || intent.type === "skip") {
      if (game.round.result) return reject("This round is over.");
      if (intent.type === "skip") {
        const target = nextEventTime(game.round.seeker, t, idx, intent.to);
        if (target === null) return reject("Nothing to skip to.");
        // Stops early if the hider plays a card on the way.
        const skipped = skipSolo(game.round, t, Math.min(target, game.round.seekEnd), idx);
        game.round = skipped.round;
        game.clock = jumpClock(game.clock, skipped.t, now);
      } else if (game.round.mode !== "practice") {
        return reject("Pausing is for practice rounds.");
      } else {
        game.clock = (intent.type === "pause" ? pauseClock : resumeClock)(game.clock, now);
      }
      game.log.write("clock", { t, type: intent.type, to: gameTime(game.clock, now) });
      game.round = advanceSolo(game.round, gameTime(game.clock, now), idx);
      logCards(game);
      logEnd(game);
      sendState(s, seq, now);
      return;
    }
    if (game.clock.pausedAt !== null) return reject("Paused — resume first.");

    const result = applySoloIntent(game.round, intent, t, idx);
    if (result.ok) {
      const before = game.round.asked.length;
      game.round = result.round;
      const asked = game.round.asked;
      if (asked.length > before) {
        const q = asked.at(-1);
        game.log.write("question", { t, q: q?.q, answer: q?.answer, remaining: q?.remaining });
      } else {
        game.log.write("intent", { t, type: intent.type });
      }
      logCards(game);
      logEnd(game);
      sendState(s, seq, now);
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
