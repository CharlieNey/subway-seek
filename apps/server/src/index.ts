/**
 * The game server. Every session is a solo round: the daily or a practice round (a bot
 * hides from one of 13 hubs at 10:00 and the player seeks from 10:20) or You hide (the
 * player hides and a bot seeks). The server holds the whole round, the secret parts
 * included, and only ever sends a player the engine's view for their side (soloView,
 * hiderView). Two-player rooms aren't built yet (DESIGN.md).
 *
 * A session outlives its connection (sessions.ts): the round's clock runs on through a
 * drop, and a reconnect with the session token within the grace period picks it up again.
 */
import "./env.ts";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatServiceTime } from "@subway-seek/data";
import { loadDataset } from "@subway-seek/data/node";
import {
  advanceSolo,
  applyHiderIntent,
  applySoloIntent,
  bonusSeconds,
  buildIndex,
  CLOSE_FULL,
  CLOSE_TAKEN_OVER,
  CLOSE_TOO_MANY_MESSAGES,
  CLOSE_TOO_MANY_ROUNDS,
  type ClockSync,
  clientMessageSchema,
  createDailyRound,
  createHideRound,
  createSeekerDriver,
  createSoloRound,
  type Difficulty,
  dailyNumber,
  dailyRandom,
  type GameClock,
  gameTime,
  type HiderView,
  type HidingSpot,
  hiderIntentSchema,
  hiderView,
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
  runSeeker,
  SEEKER_LEVELS,
  type SeekerDriver,
  type ServerMessage,
  SOLO_PAUSES_ON_DROP,
  type SoloIntent,
  type SoloRound,
  type SoloView,
  sessionFromProtocols,
  skipSolo,
  soloView,
  startClock,
  stationOnly,
  WS_PROTOCOL,
} from "@subway-seek/engine";
import { type WebSocket, WebSocketServer } from "ws";
import { restoreHideRound } from "./hidePersistence.ts";
import { exitSpot, prepareHiderExit, seekerStreetTarget, verifyHideSpot } from "./hideSpots.ts";
import {
  clientAddress,
  MAX_SESSIONS,
  MESSAGE_WINDOW_MS,
  MESSAGES_PER_WINDOW,
  NEW_ROUNDS_PER_HOUR,
  originAllowed,
  parseOrigins,
  RateLimiter,
  WALKS_PER_MINUTE,
} from "./limits.ts";
import { scheduleLogSweep } from "./logSweep.ts";
import { LOG_DIR, MatchLog } from "./matchLog.ts";
import { createSessionPersistence } from "./persistence.ts";
import { type Session, SessionStore } from "./sessions.ts";
import { withPhotoUrls } from "./sign.ts";
import { isStreetPoint, officialSpot, pickExitPano, pickSpot, spotFromPano } from "./spot.ts";
import { scoresFromLogs } from "./standings.ts";
import { restorable, type SavedSession, SessionDb } from "./store.ts";
import { tick as tickGame } from "./tick.ts";

const PORT = Number(process.env.PORT ?? 8787);
const HIDE_START = 10 * 3600;
const SPEED = 6;
// Mixed into the daily seed so players can't compute today's answer from the client code.
// The dev default is in this public repo, so a production server refuses to start without one.
if (!process.env.DAILY_SECRET && process.env.NODE_ENV === "production") {
  console.error("DAILY_SECRET is required in production (docs/DEPLOY-PLAN.md)");
  process.exit(1);
}
const DAILY_SECRET = process.env.DAILY_SECRET || "dev-only-daily-secret";
if (!process.env.DAILY_SECRET) console.warn("DAILY_SECRET not set — using a dev secret");
// The one forwarding header the proxy in front sets (limits.ts); unset, the socket address.
const CLIENT_IP_HEADER = process.env.CLIENT_IP_HEADER;
// The pages that may open rounds (limits.ts, originAllowed). Production must name them:
// otherwise any site could open rounds from its visitors' browsers.
const ALLOWED_ORIGINS = parseOrigins(process.env.ALLOWED_ORIGINS);
if (!ALLOWED_ORIGINS && process.env.NODE_ENV === "production") {
  console.error("ALLOWED_ORIGINS is required in production (docs/DEPLOY-PLAN.md)");
  process.exit(1);
}
/** Client messages are a few hundred bytes; anything near this is not the game's client. */
const MAX_MESSAGE_BYTES = 16 * 1024;

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
  driver?: SeekerDriver;
  exitRetryAt?: number;
  lastSeq: number;
  log: MatchLog;
  /** How many of the hider's card plays are already in the log. */
  cardsLogged: number;
  stationLogged: boolean;
  /**
   * The last view sent, as JSON. The 1 s tick pushes a frame only when the view differs,
   * so a frame's arrival never says more than its contents (reaching the hider's station
   * changes the round, not the view).
   */
  shown: string;
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
  // Each daily starts somewhere different (same for everyone that day), and is Normal for
  // everyone; a Saturday may carry a theme (themes.ts).
  const round = createDailyRound(idx, date, DAILY_SECRET, HIDE_START);
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
  streetAsked = true,
  replay = false,
): Promise<{ round: SoloRound; clock: GameClock; log: MatchLog }> {
  let round: SoloRound;
  // The exact hiding spot for the Street View endgame (same spot all day for the daily).
  let spot: HidingSpot | null;
  // A round on the free map ends at the station: asked by the client (no Google there),
  // or forced by this server (no key, or STREET_ENDGAME=off on a heavy day).
  const street = streetAsked && STREET_ENDGAME;
  if (!street) {
    if (mode === "daily") round = (await dailySetup(today())).round;
    else if (mode === "hide") {
      const hub = stationIndex(pickHubId(Math.random));
      round = createHideRound(idx, {
        hub,
        hideStart: HIDE_START,
        difficulty,
        roundId: randomUUID(),
      });
    } else {
      const hub = stationIndex(pickHubId(Math.random));
      round = createSoloRound(idx, { hub, hideStart: HIDE_START, difficulty });
    }
    round = stationOnly(round);
    spot = null;
  } else if (mode === "daily") {
    const date = today();
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
  } else if (mode === "hide") {
    const hub = stationIndex(pickHubId(Math.random));
    round = createHideRound(idx, { hub, hideStart: HIDE_START, difficulty, roundId: randomUUID() });
    spot = null;
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
  // A daily played again in this browser: a copy, so the day's shared round isn't marked.
  if (replay && round.daily) round = { ...round, daily: { ...round.daily, replay: true } };
  if (spot) round = placeHider(round, spot, idx);
  const log = new MatchLog();
  log.write("round_start", {
    mode,
    difficulty: round.difficulty,
    daily: round.daily,
    hub: dataset.stations[round.hub]?.id,
    hider: dataset.complexes[round.hider]?.name,
    hiderComplex: round.hider,
    // The panorama ID, never its coordinates: Google's terms allow storing IDs, not their places.
    spot: spot?.pano ?? null,
    photoExit: round.photoExit !== null,
    stationOnly: !!round.stationOnly,
    reachable: round.reachable.length,
    seekStart: round.seekStart,
  });
  return {
    round,
    clock: startClock(round.human ? round.hideStart : round.seekStart, SPEED, Date.now()),
    log,
  };
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

/**
 * New York's date for the daily. Dev only: DEV_DAILY_DATE=YYYY-MM-DD plays another day's
 * daily, to check a themed Saturday locally (themes.ts). Production ignores it.
 */
const DEV_DAILY_DATE =
  process.env.NODE_ENV !== "production" &&
  /^\d{4}-\d{2}-\d{2}$/.test(process.env.DEV_DAILY_DATE ?? "")
    ? (process.env.DEV_DAILY_DATE as string)
    : null;
if (DEV_DAILY_DATE) console.warn(`DEV_DAILY_DATE: the daily is ${DEV_DAILY_DATE}'s`);
function today(): string {
  return DEV_DAILY_DATE ?? nyDate(new Date());
}

/** Today's finished dailies, for the result's percentile (standings.ts); from the logs at boot. */
const dailyScores = scoresFromLogs(LOG_DIR, new Date());
// Match logs older than 90 days go, at boot and daily (logSweep.ts). Production only: a
// laptop's apps/server/logs are playtest records for `pnpm metrics`, kept on purpose.
if (process.env.NODE_ENV === "production") scheduleLogSweep(LOG_DIR);

function logEnd(game: Game) {
  const { round } = game;
  if (!round.result) return;
  const elapsed = Math.max(0, round.result.at - round.seekStart);
  if (
    round.mode === "daily" &&
    round.daily &&
    !round.daily.replay &&
    !round.human &&
    (round.result.kind === "found" || round.result.kind === "timeout")
  )
    dailyScores.add(round.daily.date, (elapsed + bonusSeconds(round)) / 60, game.log.id);
  game.log.write("round_end", {
    result: round.human?.incomplete ? "incomplete" : round.result.kind,
    incomplete: round.human?.incomplete ?? null,
    hider: dataset.complexes[round.hider]?.name,
    elapsedMin: Math.round(elapsed / 60),
    questions: round.asked.length,
    bonusMin: bonusSeconds(round) / 60,
    hiderScoreMin: round.human?.incomplete
      ? null
      : Math.round((elapsed + bonusSeconds(round)) / 60),
    hiderHand: round.hand,
    cardsPlayed: round.cardEvents.map((e) => e.card),
    stationFoundMin:
      round.stationFoundAt === null
        ? null
        : Math.round((round.stationFoundAt - round.seekStart) / 60),
  });
}

/** A fresh game for a session: a new round with its own log, nothing sent yet. */
async function newGame(mode: RoundMode, difficulty?: Difficulty, street = true, replay = false) {
  return {
    ...(await newRound(mode, difficulty, street, replay)),
    cardsLogged: 0,
    stationLogged: false,
    shown: "",
    driver: mode === "hide" ? createSeekerDriver() : undefined,
    exitRetryAt: undefined,
  };
}

/**
 * Live sessions on disk (store.ts), so a deploy or a crash doesn't end the rounds in
 * progress. SESSION_DB is a file on the host's persistent volume in production; locally it's
 * apps/server/data/sessions.sqlite (gitignored).
 */
const SESSION_DB =
  process.env.SESSION_DB ?? fileURLToPath(new URL("../data/sessions.sqlite", import.meta.url));
if (SESSION_DB !== ":memory:" && !existsSync(dirname(SESSION_DB))) {
  mkdirSync(dirname(SESSION_DB), { recursive: true });
}
const db = new SessionDb(SESSION_DB);

const sessions = new SessionStore<Game>({
  graceMs: RECONNECT_GRACE_MS,
  // Every round is solo today, and a solo round's clock runs through a drop.
  pauseOnDrop: SOLO_PAUSES_ON_DROP,
  onExpire: ({ token, game }) => {
    clearTimeout(game.answerTimer);
    db.delete(token);
    const t = gameTime(game.clock, Date.now());
    game.log.write("abandoned", { t, over: game.round.result !== null });
    console.log(`${formatServiceTime(t)} session dropped after the grace period`);
  },
});

/** Save a session's game, so it survives a restart. Called whenever the round or clock changes. */
const persist = createSessionPersistence(dataset, (saved) => db.save(saved));

// Failed metadata rehydrations keep their saved IDs for a reconnect retry. A single
// unavailable panorama must neither crash startup nor silently replace someone's round.
const pendingRestores = new Map<string, SavedSession>();
async function restoreSession(s: SavedSession) {
  const game: Game = {
    round:
      "storage" in s.game.round ? await restoreHideRound(s.game.round, officialSpot) : s.game.round,
    driver: "storage" in s.game.round ? createSeekerDriver(s.game.seekerLastActionAt) : undefined,
    clock: s.game.clock,
    lastSeq: s.game.lastSeq,
    log: new MatchLog(s.game.logId),
    cardsLogged: s.game.cardsLogged,
    stationLogged: s.game.stationLogged,
    shown: "",
    answerTimer: undefined,
  };
  const session = sessions.restore(game, s.token, s.droppedAt ?? s.updatedAt, Date.now());
  pendingRestores.delete(s.token);
  game.log.write("restored", { t: gameTime(game.clock, Date.now()) });
  return session;
}
{
  const now = Date.now();
  const saved = db.all();
  const keep = restorable(saved, now, RECONNECT_GRACE_MS);
  for (const s of saved) if (!keep.includes(s)) db.delete(s.token);
  for (const s of keep) {
    try {
      await restoreSession(s);
    } catch {
      pendingRestores.set(s.token, s);
    }
  }
  if (saved.length) console.log(`restored ${sessions.size} of ${saved.length} saved session(s)`);
}

// Rate limits (limits.ts): new rounds per address, street walks per session, sessions kept.
const newRounds = new RateLimiter(NEW_ROUNDS_PER_HOUR, 60 * 60 * 1000);
const walks = new RateLimiter(WALKS_PER_MINUTE, 60 * 1000);
const messages = new RateLimiter(MESSAGES_PER_WINDOW, MESSAGE_WINDOW_MS);
setInterval(
  () => {
    const now = Date.now();
    newRounds.sweep(now);
    walks.sweep(now);
    messages.sweep(now);
  },
  10 * 60 * 1000,
);
/** The address each session connected from, for the new-round limit. */
const addressOf = new WeakMap<Session<Game>, string>();

/**
 * Photo answers carry a signed Street View Static URL when the browser key and the URL
 * signing secret are set (docs/DEPLOY.md). Then the Static API's unsigned quota can be 0
 * and the browser key alone can't fetch images.
 */
const PHOTO_SIGNING =
  process.env.GOOGLE_MAPS_BROWSER_KEY && process.env.STREETVIEW_SIGNING_SECRET
    ? { key: process.env.GOOGLE_MAPS_BROWSER_KEY, secret: process.env.STREETVIEW_SIGNING_SECRET }
    : null;
if (!PHOTO_SIGNING)
  console.warn("photo URLs unsigned — set GOOGLE_MAPS_BROWSER_KEY and STREETVIEW_SIGNING_SECRET");

/**
 * Street steps are checked against Street View metadata (spot.ts, hideSpots.ts). Without
 * the server key, or with STREET_ENDGAME=off (the switch for a day when Google's quota
 * runs low), every round ends at the station: SoloRound.stationOnly.
 */
const STREET_VIEW = Boolean(process.env.GOOGLE_STREETVIEW_SERVER_KEY);
const STREET_ENDGAME = STREET_VIEW && process.env.STREET_ENDGAME !== "off";
if (!STREET_ENDGAME)
  console.warn(
    STREET_VIEW
      ? "STREET_ENDGAME=off — every round ends at the station"
      : "GOOGLE_STREETVIEW_SERVER_KEY not set — every round ends at the station",
  );

/** The seeker's view right now (the hider's marker shows only when they're close). */
const viewNow = (game: Game, now: number) =>
  game.round.human
    ? hiderView(game.round, gameTime(game.clock, now), idx)
    : soloView(game.round, gameTime(game.clock, now), idx);

/** The view to send, noting what it shows and timing the push for the next answer. */
function remember(session: Session<Game>, now: number): SoloView | HiderView {
  const { game } = session;
  const v = viewNow(game, now);
  game.shown = JSON.stringify(v);
  clearTimeout(game.answerTimer);
  const next = nextAnswerAt(game.round, gameTime(game.clock, now));
  const ms = next === null ? Number.POSITIVE_INFINITY : realMsUntil(game.clock, next, now);
  if (Number.isFinite(ms)) {
    game.answerTimer = setTimeout(() => queueTick(session), ms + 10);
  }
  // Off the Google map there are no Street View images on screen (Google's terms).
  return withPhotoUrls(v, game.round.stationOnly ? null : PHOTO_SIGNING);
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
 * station, come within sight of their spot, had an answer land, or run out of time? A
 * dropped session too: its clock runs on, and the hider still plays. The frame goes out
 * only if what the seeker may see has changed.
 */
async function tick(session: Session<Game>, now: number) {
  await tickGame(session, now, {
    idx,
    exitSpot,
    seekerStreetTarget,
    persist,
    sendState,
    viewNow,
    logCards,
    logEnd,
  });
}

/** Yesterday's hider, revealed once its day is over (the homepage's "Yesterday's hider"). */
const pastHiders = new Map<string, number>();
function hiderOn(date: string): number {
  let hider = pastHiders.get(date);
  if (hider === undefined) {
    // The same round as buildDaily: the station doesn't need the Street View lookups.
    hider = createDailyRound(idx, date, DAILY_SECRET, HIDE_START).hider;
    pastHiders.set(date, hider);
  }
  return hider;
}

/**
 * Yesterday's daily as the bot seeker played it, for anyone to watch: phone visitors, who
 * can't play a round, and anyone who missed the day (DESIGN.md, Phones). Its day is over,
 * so the hider is public. It runs at the station only, as on the free map: no spot, so no
 * Google coordinates, and the replay is the same whatever keys this server has. Built
 * once per date, in well under a second (runSeeker skips the waits).
 */
const botReplays = new Map<string, unknown>();
function yesterdayReplay(): { date: string; number: number; view: SoloView } | null {
  const y = new Date(`${today()}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  const date = y.toISOString().slice(0, 10);
  const number = dailyNumber(date);
  if (number < 1) return null;
  let kept = botReplays.get(date) as { date: string; number: number; view: SoloView } | undefined;
  if (!kept) {
    const round = createDailyRound(idx, date, DAILY_SECRET, HIDE_START);
    const played = runSeeker(stationOnly(round), idx, SEEKER_LEVELS.normal).round;
    const end = played.result?.at ?? played.seekEnd;
    kept = { date, number, view: soloView(played, end, idx) };
    botReplays.clear();
    botReplays.set(date, kept);
  }
  return kept;
}

/**
 * What the homepage shows before a round starts: today's daily, where it starts and the
 * stations its hider could reach (public: every seeker sees them when the round begins),
 * and yesterday's hider, now that its day is over. Never today's hider.
 */
async function dailyInfo() {
  const date = today();
  const { round } = await dailySetup(date);
  const y = new Date(`${date}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  return {
    date,
    number: dailyNumber(date),
    theme: round.daily?.theme ?? null,
    start: dataset.stations[round.hub]?.complex ?? null,
    hideStart: round.hideStart,
    seekStart: round.seekStart,
    reachable: round.reachable,
    yesterday:
      dailyNumber(yesterday) >= 1
        ? { date: yesterday, number: dailyNumber(yesterday), hider: hiderOn(yesterday) }
        : null,
  };
}

const httpServer = createServer((req, res) => {
  // Public facts only, so any page may read them.
  res.setHeader("Access-Control-Allow-Origin", "*");
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  // For the container's health check and a load balancer's: up, and how many rounds it holds.
  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(
      JSON.stringify({ ok: true, sessions: sessions.size, serviceDate: dataset.meta.serviceDate }),
    );
    return;
  }
  if (req.method === "GET" && pathname === "/replay/yesterday") {
    try {
      const replay = yesterdayReplay();
      if (!replay) {
        res.writeHead(404).end();
        return;
      }
      // The same for everyone all day; a CDN or browser may keep it for ten minutes.
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600",
      });
      res.end(JSON.stringify(replay));
    } catch (err) {
      console.error("yesterday's replay failed:", err);
      res.writeHead(500).end();
    }
    return;
  }
  // How today's finished dailies scored, minute by minute: no station, no player.
  if (req.method === "GET" && pathname === "/daily/scores") {
    const date = today();
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ date, ...dailyScores.histogram(date) }));
    return;
  }
  if (req.method === "GET" && pathname === "/daily") {
    dailyInfo().then(
      (info) => {
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify(info));
      },
      (err) => {
        console.error("daily info failed:", err);
        res.writeHead(500).end();
      },
    );
    return;
  }
  res.writeHead(404).end();
});
const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_MESSAGE_BYTES,
  // Only pages the deploy names may open rounds; scripts send no Origin (limits.ts).
  verifyClient: ({ origin }: { origin?: string }) => originAllowed(origin, ALLOWED_ORIGINS),
  // The game's subprotocol; the session token rides beside it (protocol.ts).
  handleProtocols: (protocols: Set<string>) => (protocols.has(WS_PROTOCOL) ? WS_PROTOCOL : false),
});
httpServer.listen(PORT);

const tickPending = new WeakSet<Session<Game>>();
function queueTick(session: Session<Game>) {
  if (tickPending.has(session)) return;
  tickPending.add(session);
  const task = (queues.get(session) ?? Promise.resolve()).then(() => tick(session, Date.now()));
  queues.set(
    session,
    task
      .catch((err) => console.error("tick failed", err))
      .finally(() => tickPending.delete(session)),
  );
}
setInterval(() => {
  for (const session of sessions.all()) queueTick(session);
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
  // A malformed or oversized frame is an `error` on the socket, then a close. Without a
  // listener Node treats it as unhandled and the process exits, ending every round.
  socket.on("error", (err) => console.warn(`socket error: ${err.message}`));
  alive.set(socket, true);
  socket.on("pong", () => alive.set(socket, true));
  const params = new URL(req.url ?? "/", "http://localhost").searchParams;
  // In the Sec-WebSocket-Protocol header, not the URL (protocol.ts, SESSION_PROTOCOL_PREFIX).
  const token = sessionFromProtocols(req.headers["sec-websocket-protocol"]);
  const address = clientAddress(req.headers, req.socket.remoteAddress, CLIENT_IP_HEADER);
  let session = sessions.get(token);
  if (!session && token && pendingRestores.has(token)) {
    try {
      session = await restoreSession(pendingRestores.get(token) as SavedSession);
    } catch {
      socket.close(1013, "That spot couldn't be checked. Try again.");
      return;
    }
  }
  const resumed = session !== undefined;
  if (!session) {
    // A new session is a new round: turned away when the server is full or this address
    // has started too many lately (limits.ts). The client shows the close reason.
    if (sessions.size >= MAX_SESSIONS) {
      socket.close(CLOSE_FULL, "The server is full right now. Try again in a few minutes.");
      return;
    }
    if (!newRounds.allow(address, Date.now())) {
      socket.close(CLOSE_TOO_MANY_ROUNDS, "Too many new rounds from here. Try again later.");
      return;
    }
    // A new session starts the round its link asked for: the daily unless it says practice.
    const mode: RoundMode =
      params.get("mode") === "hide"
        ? "hide"
        : params.get("mode") === "practice"
          ? "practice"
          : "daily";
    const d = params.get("difficulty");
    const difficulty = d === "easy" || d === "normal" || d === "hard" ? d : undefined;
    // The free map: the page has no Google, so the round ends at the station.
    const street = params.get("street") !== "off";
    const game: Game = {
      ...(await newGame(mode, difficulty, street, params.get("replay") === "1")),
      lastSeq: -1,
      answerTimer: undefined,
    };
    // It may have gone while the round was being built.
    if (socket.readyState !== socket.OPEN) return;
    session = sessions.create(game);
  }
  const s = session;
  addressOf.set(s, address);
  const now = Date.now();
  const replaced = sessions.attach(s, socket, now);
  if (replaced) replaced.close(CLOSE_TAKEN_OVER, "Opened somewhere else");
  if (resumed)
    s.game.log.write("reconnect", { t: gameTime(s.game.clock, now), replaced: !!replaced });
  persist(s, now);

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
    persist(s, at);
  });

  // One message at a time per session, in order: a walk waits on a Street View lookup and
  // a new round on several, and nothing may overtake them.
  socket.on("message", (raw) => {
    // Faster than any player: close before queueing, so a flood can't pile up in memory.
    if (!messages.allow(s.token, Date.now())) {
      socket.close(CLOSE_TOO_MANY_MESSAGES, "Too many messages at once. Reconnecting…");
      return;
    }
    const queued = (queues.get(s) ?? Promise.resolve()).then(() => handleMessage(s, socket, raw));
    queues.set(
      s,
      queued.catch((err: unknown) => console.error("message failed:", err)),
    );
  });
});

/** Each session's messages, chained so they're handled in the order they came. */
const queues = new WeakMap<Session<Game>, Promise<void>>();

/** The seq a message carries, even one the schema refused: its rejection answers it. */
function seqOf(json: unknown): number {
  const seq = (json as { seq?: unknown } | null)?.seq;
  return typeof seq === "number" && Number.isInteger(seq) && seq >= 0 ? seq : -1;
}

async function handleMessage(s: Session<Game>, socket: WebSocket, raw: unknown) {
  // A connection whose session moved to another tab no longer plays it.
  if (s.conn !== socket) return;
  let json: unknown;
  try {
    json = JSON.parse(String(raw));
  } catch {
    return;
  }
  const parsed = clientMessageSchema.safeParse(json);
  if (!parsed.success) {
    const seq = seqOf(json);
    if (seq > s.game.lastSeq) s.game.lastSeq = seq;
    const now = Date.now();
    send(socket, {
      type: "rejected",
      seq,
      error: "That didn't go through. Try again.",
      clock: sync(s.game.clock, now),
      view: remember(s, now),
    });
    return;
  }
  const { seq } = parsed.data;
  let { intent } = parsed.data;
  if (seq <= s.game.lastSeq) {
    // A retry of something already handled (a resend after a reconnect): restate the round.
    sendState(s, seq, Date.now());
    return;
  }

  if (intent.type === "newRound") {
    if (!newRounds.allow(addressOf.get(s) ?? "unknown", Date.now())) {
      s.game.lastSeq = seq;
      const now = Date.now();
      send(socket, {
        type: "rejected",
        seq,
        error: "Too many new rounds from here in the last hour. Try again later.",
        clock: sync(s.game.clock, now),
        view: remember(s, now),
      });
      return;
    }
    let fresh: Awaited<ReturnType<typeof newGame>>;
    try {
      fresh = await newGame(
        intent.mode,
        intent.difficulty,
        intent.street !== false,
        intent.replay === true,
      );
    } catch (err) {
      console.error("new round failed:", err);
      s.game.lastSeq = seq;
      const now = Date.now();
      send(socket, {
        type: "rejected",
        seq,
        error: "The new round didn't start. Try again.",
        clock: sync(s.game.clock, now),
        view: remember(s, now),
      });
      return;
    }
    clearTimeout(s.game.answerTimer);
    Object.assign(s.game, fresh);
    // Only now: until the new round is in place, the tick's frames are the old round's,
    // and they mustn't answer this intent.
    s.game.lastSeq = seq;
    const started = Date.now();
    persist(s, started);
    sendState(s, seq, started);
    return;
  }

  // A walk must end on a real street (solo today: its target, not its path). Checked
  // before the clock is read, so the walk starts when it's accepted. Each check is a
  // Street View lookup, so walks are limited per session (limits.ts).
  let offStreet = false;
  let tooManyWalks = false;
  // At the station only, nothing to look up: the engine refuses a hider's street steps.
  const atStation = Boolean(s.game.round.stationOnly);
  if (!atStation && (intent.type === "walkTo" || intent.type === "hideHere")) {
    tooManyWalks = !walks.allow(s.token, Date.now());
    if (!tooManyWalks) {
      if (s.game.round.human) {
        const verified = intent.pano
          ? await verifyHideSpot(intent.lat, intent.lon, intent.pano)
          : null;
        offStreet = !verified;
        if (verified) intent = { ...intent, ...verified };
      } else offStreet = (await isStreetPoint(intent.lat, intent.lon, intent.pano)) === false;
      if (s.conn !== socket) return;
    }
  }

  if (
    !atStation &&
    intent.type === "exit" &&
    s.game.round.human &&
    s.game.clock.pausedAt === null
  ) {
    const prepared = await prepareHiderExit(
      s.game.round,
      intent.exit,
      gameTime(s.game.clock, Date.now()),
      idx,
      () => walks.allow(s.token, Date.now()),
    );
    if (s.conn !== socket) return;
    s.game.round = prepared.round;
    tooManyWalks = prepared.limited;
  }
  const game = s.game;
  game.lastSeq = seq;
  const now = Date.now();
  const t = gameTime(game.clock, now);
  const reject = (error: string) => {
    game.log.write("rejected", { t, type: intent.type, error });
    send(socket, {
      type: "rejected",
      seq,
      error,
      clock: sync(game.clock, now),
      view: remember(s, now),
    });
  };
  if (tooManyWalks) return reject("That's a lot of walking at once. Give it a moment.");
  if (offStreet)
    return reject(
      game.round.human
        ? "That spot couldn't be checked. Try again."
        : "No street to walk to there. Click closer to a street.",
    );

  // Clock controls. Score is game time, so skipping ahead never helps — it just saves
  // waiting. Pausing would give free thinking time, so it's practice-only.
  if (intent.type === "pause" || intent.type === "resume" || intent.type === "skip") {
    if (game.round.result) return reject("This round is over.");
    if (intent.type === "skip") {
      if (game.round.human && t >= game.round.seekStart)
        return reject("Fast-forward is only available while hiding.");
      const target = nextEventTime(
        game.round.human?.transit ?? game.round.seeker,
        t,
        idx,
        intent.to,
      );
      if (target === null) return reject("Nothing to skip to.");
      // Stops early if the hider plays a card on the way.
      const skipped = skipSolo(
        game.round,
        t,
        Math.min(target, game.round.human ? game.round.seekStart : game.round.seekEnd),
        idx,
      );
      game.round = skipped.round;
      game.clock = jumpClock(game.clock, skipped.t, now);
    } else if (game.round.mode !== "practice" && game.round.mode !== "hide") {
      return reject("Pausing is for practice rounds.");
    } else {
      game.clock = (intent.type === "pause" ? pauseClock : resumeClock)(game.clock, now);
    }
    game.log.write("clock", { t, type: intent.type, to: gameTime(game.clock, now) });
    game.round = advanceSolo(game.round, gameTime(game.clock, now), idx);
    logCards(game);
    logEnd(game);
    persist(s, now);
    sendState(s, seq, now);
    return;
  }
  if (game.clock.pausedAt !== null && intent.type !== "leaveHide")
    return reject("Paused. Resume first.");

  const hiderIntent = hiderIntentSchema.safeParse(intent);
  if (game.round.human && !hiderIntent.success) return reject("That didn't go through. Try again.");
  if (
    !game.round.human &&
    ["hideHere", "answer", "keepCards", "playCard", "redraw", "leaveHide"].includes(intent.type)
  )
    return reject("That didn't go through. Try again.");
  const result =
    game.round.human && hiderIntent.success
      ? applyHiderIntent(game.round, hiderIntent.data, t, idx)
      : applySoloIntent(game.round, intent as SoloIntent, t, idx);
  if (result.ok) {
    const before = game.round.asked.length;
    game.round = result.round;
    const asked = game.round.asked;
    if (asked.length > before) {
      const q = asked.at(-1);
      game.log.write("question", { t, q: q?.q, answer: q?.answer, remaining: q?.remaining });
    } else {
      game.log.write("intent", {
        t,
        side: game.round.human ? "hider" : "seeker",
        type: intent.type,
      });
    }
    logCards(game);
    logEnd(game);
    persist(s, now);
    sendState(s, seq, now);
  } else {
    reject(result.error);
  }
  console.log(
    `${formatServiceTime(t)} ${intent.type} → ${result.ok ? "ok" : `rejected: ${result.error}`}`,
  );
}

console.log(
  `listening on ws://localhost:${PORT} · daily #${dailyNumber(today())} + practice rounds, ${SPEED}×`,
);
