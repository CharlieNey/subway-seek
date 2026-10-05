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
  dailyNumber,
  dailyRandom,
  type GameClock,
  gameTime,
  nyDate,
  placeHider,
  type RoundMode,
  type ServerMessage,
  type SoloRound,
  soloViewAt,
  startClock,
} from "@stand-clear/engine";
import { type WebSocket, WebSocketServer } from "ws";
import { MatchLog } from "./matchLog.ts";
import { pickExitPano, pickSpot } from "./spot.ts";

const PORT = Number(process.env.PORT ?? 8787);
const HIDE_START = 10 * 3600;
const SPEED = 6;
const HUB_STATION_ID = "127"; // Times Sq-42 St (1/2/3)
// Mixed into the daily seed so players can't compute today's answer from the client code.
const DAILY_SECRET = process.env.DAILY_SECRET ?? "dev-only-daily-secret";
if (!process.env.DAILY_SECRET) console.warn("DAILY_SECRET not set — using a dev secret");

const t0 = performance.now();
const dataset = loadDataset();
const idx = buildIndex(dataset);
const hub = dataset.stations.findIndex((s) => s.id === HUB_STATION_ID);
if (hub < 0) throw new Error(`Hub ${HUB_STATION_ID} missing from dataset`);
console.log(
  `dataset ${dataset.meta.serviceDate}: ${dataset.complexes.length} complexes, ` +
    `${dataset.trips.length} trips (ready in ${Math.round(performance.now() - t0)} ms)`,
);

interface Session {
  clock: GameClock;
  round: SoloRound;
  lastSeq: number;
  log: MatchLog;
}

async function newRound(
  mode: RoundMode,
): Promise<{ round: SoloRound; clock: GameClock; log: MatchLog }> {
  const date = nyDate(new Date());
  let round =
    mode === "daily"
      ? createSoloRound(idx, {
          hub,
          hideStart: HIDE_START,
          random: dailyRandom(date, DAILY_SECRET),
          daily: { date, number: dailyNumber(date) },
        })
      : createSoloRound(idx, { hub, hideStart: HIDE_START });
  // The exact hiding spot for the Street View endgame (same spot all day for the daily).
  const spotRandom = mode === "daily" ? dailyRandom(`${date}|spot`, DAILY_SECRET) : Math.random;
  const spot = await pickSpot(dataset, round.hider, spotRandom);
  if (spot) round = placeHider(round, spot, idx);
  // The view outside one of its exits, for "photo from your station's exit".
  round = { ...round, photoExit: await pickExitPano(dataset, round.hider, spotRandom) };
  const log = new MatchLog();
  log.write("round_start", {
    mode,
    daily: round.daily,
    hub: dataset.stations[hub]?.id,
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
    stationFoundMin:
      round.stationFoundAt === null
        ? null
        : Math.round((round.stationFoundAt - round.seekStart) / 60),
  });
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", async (socket) => {
  const session: Session = { ...(await newRound("daily")), lastSeq: -1 };
  /** The seeker's view right now (the hider's marker shows only when they're close). */
  const viewNow = (now: number) => soloViewAt(session.round, gameTime(session.clock, now), idx);
  let markerShown = false;
  let stationLogged = false;
  const remember = (now: number) => {
    const v = viewNow(now);
    markerShown = v.spotNearby !== null;
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
  // hider's station, come within sight of their spot, or run out of time?
  const timer = setInterval(() => {
    const now = Date.now();
    const next = advanceSolo(session.round, gameTime(session.clock, now), idx);
    const changed = next !== session.round;
    session.round = next;
    if (changed) logEnd(session);
    if (session.round.stationFoundAt !== null && !stationLogged) {
      stationLogged = true;
      session.log.write("station_found", { t: session.round.stationFoundAt });
    }
    if (changed || (viewNow(now).spotNearby !== null) !== markerShown) {
      sendState(session.lastSeq, now);
    }
  }, 1000);
  socket.on("close", () => {
    clearInterval(timer);
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
      Object.assign(session, await newRound(intent.mode));
      stationLogged = false;
      sendState(seq, Date.now());
      return;
    }

    const t = gameTime(session.clock, now);
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
      logEnd(session);
      sendState(seq, now);
    } else {
      session.log.write("rejected", { t, type: intent.type, error: result.error });
      send(socket, {
        type: "rejected",
        seq,
        error: result.error,
        clock: sync(session.clock, now),
        view: viewNow(now),
      });
    }
    console.log(
      `${formatServiceTime(t)} ${intent.type} → ${result.ok ? "ok" : `rejected: ${result.error}`}`,
    );
  });
});

console.log(
  `listening on ws://localhost:${PORT} · daily #${dailyNumber(nyDate(new Date()))} + practice rounds from Times Sq, ${SPEED}×`,
);
