import { formatServiceTime } from "@stand-clear/data";
import { useEffect, useState } from "react";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:8787";

interface Hello {
  type: "hello";
  serviceDate: string;
  complexes: number;
  trips: number;
  clock: { gameTime: number; speed: number; serverNow: number };
}

/** M0 shell: proves dataset → server → browser. M1 replaces this with the map. */
export function App() {
  const [hello, setHello] = useState<Hello | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const ws = new WebSocket(SERVER_URL);
    ws.onmessage = (e) => setHello(JSON.parse(e.data) as Hello);
    ws.onerror = () => setError(`Can't reach the game server at ${SERVER_URL}`);
    return () => ws.close();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // The client runs the clock itself from one sync point — no per-tick messages.
  const game = hello
    ? hello.clock.gameTime + ((now - hello.clock.serverNow) / 1000) * hello.clock.speed
    : null;

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Stand Clear</h1>
      {error && <p>{error}</p>}
      {hello && game !== null && (
        <p>
          {hello.serviceDate} timetable · {hello.complexes} stations · {hello.trips} trips · game
          clock <strong>{formatServiceTime(game)}</strong> at {hello.clock.speed}×
        </p>
      )}
      {!hello && !error && <p>Connecting…</p>}
    </main>
  );
}
