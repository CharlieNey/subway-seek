/**
 * M1 sandbox server: every connection gets its own solo session — a 6× clock from
 * 10:00 and a rider starting on the Times Sq 1/2/3 platform. The server holds the
 * authoritative state and validates every intent with the engine. Rooms come in M3.
 */
import { formatServiceTime } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import {
  applyIntent,
  buildIndex,
  type ClockSync,
  clientMessageSchema,
  type GameClock,
  gameTime,
  type ServerMessage,
  startClock,
  type Transit,
} from "@stand-clear/engine";
import { type WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8787);
const START_TIME = 10 * 3600;
const SPEED = 6;
const START_STATION_ID = "127"; // Times Sq-42 St (1/2/3)

const t0 = performance.now();
const dataset = loadDataset();
const idx = buildIndex(dataset);
const startStation = dataset.stations.findIndex((s) => s.id === START_STATION_ID);
if (startStation < 0) throw new Error(`Start station ${START_STATION_ID} missing from dataset`);
console.log(
  `dataset ${dataset.meta.serviceDate}: ${dataset.complexes.length} complexes, ` +
    `${dataset.trips.length} trips (ready in ${Math.round(performance.now() - t0)} ms)`,
);

interface Session {
  clock: GameClock;
  state: Transit;
  lastSeq: number;
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
  socket.send(JSON.stringify(msg));
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket) => {
  const now = Date.now();
  const session: Session = {
    clock: startClock(START_TIME, SPEED, now),
    state: { kind: "platform", station: startStation, since: START_TIME, arrivedDir: null },
    lastSeq: -1,
  };
  send(socket, {
    type: "hello",
    serviceDate: dataset.meta.serviceDate,
    clock: sync(session.clock, now),
    state: session.state,
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
        state: session.state,
      });
      return;
    }
    const { seq, intent } = parsed.data;
    if (seq <= session.lastSeq) {
      // A retry of something we've already handled: just restate where they are.
      send(socket, { type: "state", seq, clock: sync(session.clock, now), state: session.state });
      return;
    }
    session.lastSeq = seq;
    const t = gameTime(session.clock, now);
    const result = applyIntent(session.state, intent, t, idx);
    if (result.ok) {
      session.state = result.state;
      send(socket, { type: "state", seq, clock: sync(session.clock, now), state: session.state });
    } else {
      send(socket, {
        type: "rejected",
        seq,
        error: result.error,
        clock: sync(session.clock, now),
        state: session.state,
      });
    }
    console.log(
      `${formatServiceTime(t)} ${intent.type} → ${result.ok ? result.state.kind : `rejected: ${result.error}`}`,
    );
  });
});

console.log(`listening on ws://localhost:${PORT} · sessions start at Times Sq, 10:00, ${SPEED}×`);
