/**
 * M2 server: every session plays solo rounds against a bot hider. The bot leaves
 * Times Sq at 10:00 and hides somewhere it could reach in 20 minutes; the seeker's
 * clock starts at 10:20. The server holds the round (including the secret hider) and
 * only ever sends the seeker's view of it. Rooms and a human hider come in M3.
 *
 * A session outlives its connection (sessions.ts): the round's clock runs on through a
 * drop, and a reconnect with the session token within the grace period picks it up again.
 */
import "./env.ts";
import { createServer } from "node:http";
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
  SOLO_PAUSES_ON_DROP,
  type SoloRound,
  type SoloView,
  skipSolo,
  soloView,
  startClock,
} from "@stand-clear/engine";
import { type WebSocket, WebSocketServer } from "ws";
import { MatchLog } from "./matchLog.ts";
import { type Session, SessionStore } from "./sessions.ts";
import { withPhotoUrls } from "./sign.ts";
import { isStreetPoint, pickExitPano, pickSpot, spotFromPano } from "./spot.ts";

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
    // The panorama ID, never its coordinates: Google's terms allow storing IDs, not their places.
    spot: spot?.pano ?? null,
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
    shown: "",
  };
}

const sessions = new SessionStore<Game>({
  graceMs: RECONNECT_GRACE_MS,
  // Every round is solo today, and a solo round's clock runs through a drop.
  pauseOnDrop: SOLO_PAUSES_ON_DROP,
  onExpire: ({ game }) => {
    clearTimeout(game.answerTimer);
    const t = gameTime(game.clock, Date.now());
    game.log.write("abandoned", { t, over: game.round.result !== null });
    console.log(`${formatServiceTime(t)} session dropped after the grace period`);
  },
});

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

/** The seeker's view right now (the hider's marker shows only when they're close). */
const viewNow = (game: Game, now: number) => soloView(game.round, gameTime(game.clock, now), idx);

/** The view to send, noting what it shows and timing the push for the next answer. */
function remember(session: Session<Game>, now: number): SoloView {
  const { game } = session;
  const v = viewNow(game, now);
  game.shown = JSON.stringify(v);
  clearTimeout(game.answerTimer);
  const next = nextAnswerAt(game.round, gameTime(game.clock, now));
  const ms = next === null ? Number.POSITIVE_INFINITY : realMsUntil(game.clock, next, now);
  if (Number.isFinite(ms)) {
    game.answerTimer = setTimeout(() => sendState(session, game.lastSeq, Date.now()), ms + 10);
  }
  return withPhotoUrls(v, PHOTO_SIGNING);
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
function tick(session: Session<Game>, now: number) {
  const { game } = session;
  if (game.clock.pausedAt !== null || game.round.result) return;
  const next = advanceSolo(game.round, gameTime(game.clock, now), idx);
  const changed = next !== game.round;
  game.round = next;
  logCards(game);
  if (changed) logEnd(game);
  if (game.round.stationFoundAt !== null && !game.stationLogged) {
    game.stationLogged = true;
    game.log.write("station_found", { t: game.round.stationFoundAt });
  }
  if (session.conn && JSON.stringify(viewNow(game, now)) !== game.shown) {
    sendState(session, game.lastSeq, now);
  }
}

/** Yesterday's hider, revealed once its day is over (the homepage's "Yesterday's hider"). */
const pastHiders = new Map<string, number>();
function hiderOn(date: string): number {
  let hider = pastHiders.get(date);
  if (hider === undefined) {
    // The same seeds as buildDaily: the station doesn't need the Street View lookups.
    const hub = stationIndex(pickHubId(dailyRandom(`${date}|hub`, DAILY_SECRET)));
    hider = createSoloRound(idx, {
      hub,
      hideStart: HIDE_START,
      random: dailyRandom(date, DAILY_SECRET),
      daily: { date, number: dailyNumber(date) },
    }).hider;
    pastHiders.set(date, hider);
  }
  return hider;
}

/**
 * What the homepage shows before a round starts: today's daily, where it starts and the
 * stations its hider could reach (public: every seeker sees them when the round begins),
 * and yesterday's hider, now that its day is over. Never today's hider.
 */
async function dailyInfo() {
  const date = nyDate(new Date());
  const { round } = await dailySetup(date);
  const y = new Date(`${date}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  return {
    date,
    number: dailyNumber(date),
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
  if (req.method === "GET" && new URL(req.url ?? "/", "http://localhost").pathname === "/daily") {
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
const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT);

setInterval(() => {
  const now = Date.now();
  for (const session of sessions.all()) tick(session, now);
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
  const params = new URL(req.url ?? "/", "http://localhost").searchParams;
  const token = params.get(SESSION_PARAM);
  let session = sessions.get(token);
  const resumed = session !== undefined;
  if (!session) {
    // A new session starts the round its link asked for: the daily unless it says practice.
    const mode: RoundMode = params.get("mode") === "practice" ? "practice" : "daily";
    const d = params.get("difficulty");
    const difficulty = d === "easy" || d === "normal" || d === "hard" ? d : undefined;
    const game: Game = {
      ...(await newGame(mode, difficulty)),
      lastSeq: -1,
      answerTimer: undefined,
    };
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

  // One message at a time per session, in order: a walk waits on a Street View lookup and
  // a new round on several, and nothing may overtake them.
  socket.on("message", (raw) => {
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
  const { seq, intent } = parsed.data;
  if (seq <= s.game.lastSeq) {
    // A retry of something already handled (a resend after a reconnect): restate the round.
    sendState(s, seq, Date.now());
    return;
  }

  if (intent.type === "newRound") {
    let fresh: Awaited<ReturnType<typeof newGame>>;
    try {
      fresh = await newGame(intent.mode, intent.difficulty);
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
    sendState(s, seq, Date.now());
    return;
  }

  // A walk must end on a real street (solo today: its target, not its path). Checked
  // before the clock is read, so the walk starts when it's accepted.
  let offStreet = false;
  if (intent.type === "walkTo") {
    offStreet = (await isStreetPoint(intent.lat, intent.lon, intent.pano)) === false;
    if (s.conn !== socket) return;
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
  if (offStreet) return reject("No street to walk to there. Click closer to a street.");

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
}

console.log(
  `listening on ws://localhost:${PORT} · daily #${dailyNumber(nyDate(new Date()))} + practice rounds, ${SPEED}×`,
);
