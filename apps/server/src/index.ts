/**
 * M2 server: every connection plays solo rounds against a bot hider. The bot leaves
 * Times Sq at 10:00 and hides somewhere it could reach in 20 minutes; the seeker's
 * clock starts at 10:20. The server holds the round (including the secret hider) and
 * only ever sends the seeker's view of it. Rooms and a human hider come in M3.
 */
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
  type GameClock,
  gameTime,
  type ServerMessage,
  type SoloRound,
  soloView,
  startClock,
} from "@stand-clear/engine";
import { type WebSocket, WebSocketServer } from "ws";
import { MatchLog } from "./matchLog.ts";

const PORT = Number(process.env.PORT ?? 8787);
const HIDE_START = 10 * 3600;
const SPEED = 6;
const HUB_STATION_ID = "127"; // Times Sq-42 St (1/2/3)

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

function newRound(): { round: SoloRound; clock: GameClock; log: MatchLog } {
  const round = createSoloRound(idx, { hub, hideStart: HIDE_START });
  const log = new MatchLog();
  log.write("round_start", {
    hub: dataset.stations[hub]?.id,
    hider: dataset.complexes[round.hider]?.name,
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
  });
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket) => {
  const session: Session = { ...newRound(), lastSeq: -1 };
  send(socket, {
    type: "hello",
    serviceDate: dataset.meta.serviceDate,
    clock: sync(session.clock, Date.now()),
    view: soloView(session.round, idx),
  });

  // Rides and walks resolve lazily, so check once a second whether the seeker has
  // reached the hider's station or run out of time.
  const timer = setInterval(() => {
    const now = Date.now();
    const next = advanceSolo(session.round, gameTime(session.clock, now), idx);
    if (next !== session.round) {
      session.round = next;
      logEnd(session);
      send(socket, {
        type: "state",
        seq: session.lastSeq,
        clock: sync(session.clock, now),
        view: soloView(next, idx),
      });
    }
  }, 1000);
  socket.on("close", () => {
    clearInterval(timer);
    session.log.write("disconnect", {});
  });

  socket.on("message", (raw) => {
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
        view: soloView(session.round, idx),
      });
      return;
    }
    const { seq, intent } = parsed.data;
    if (seq <= session.lastSeq) {
      // A retry of something already handled: just restate the round.
      send(socket, {
        type: "state",
        seq,
        clock: sync(session.clock, now),
        view: soloView(session.round, idx),
      });
      return;
    }
    session.lastSeq = seq;

    if (intent.type === "newRound") {
      Object.assign(session, newRound());
      send(socket, {
        type: "state",
        seq,
        clock: sync(session.clock, now),
        view: soloView(session.round, idx),
      });
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
      send(socket, {
        type: "state",
        seq,
        clock: sync(session.clock, now),
        view: soloView(session.round, idx),
      });
    } else {
      session.log.write("rejected", { t, type: intent.type, error: result.error });
      send(socket, {
        type: "rejected",
        seq,
        error: result.error,
        clock: sync(session.clock, now),
        view: soloView(session.round, idx),
      });
    }
    console.log(
      `${formatServiceTime(t)} ${intent.type} → ${result.ok ? "ok" : `rejected: ${result.error}`}`,
    );
  });
});

console.log(`listening on ws://localhost:${PORT} · solo rounds from Times Sq, ${SPEED}×`);
