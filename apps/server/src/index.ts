import { formatServiceTime } from "@stand-clear/data";
import { loadDataset } from "@stand-clear/data/node";
import { gameTime, startClock } from "@stand-clear/engine";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8787);

const t0 = performance.now();
const dataset = loadDataset();
console.log(
  `dataset ${dataset.meta.serviceDate}: ${dataset.complexes.length} complexes, ` +
    `${dataset.trips.length} trips (loaded in ${Math.round(performance.now() - t0)} ms)`,
);

// Placeholder until M1: one shared clock from 10:00 so clients can see the server is alive.
const clock = startClock(10 * 3600, 6, Date.now());

const wss = new WebSocketServer({ port: PORT });
wss.on("connection", (socket) => {
  const now = Date.now();
  socket.send(
    JSON.stringify({
      type: "hello",
      serviceDate: dataset.meta.serviceDate,
      complexes: dataset.complexes.length,
      trips: dataset.trips.length,
      clock: { gameTime: gameTime(clock, now), speed: clock.speed, serverNow: now },
    }),
  );
});

console.log(
  `listening on ws://localhost:${PORT} · game clock ${formatServiceTime(gameTime(clock, Date.now()))} at ${clock.speed}×`,
);
