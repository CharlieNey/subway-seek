/**
 * Client game state: the dataset (loaded once), the server connection, and the
 * player's transit state. The server is authoritative; the client only derives
 * positions and boards from the shared clock + public timetable.
 */
import type { Dataset } from "@stand-clear/data";
import datasetUrl from "@stand-clear/data/dataset.json?url";
import {
  buildIndex,
  type ClockSync,
  Geometry,
  type ServerMessage,
  syncedGameTime,
  type TimetableIndex,
  type Transit,
  type TransitIntent,
} from "@stand-clear/engine";
import { create } from "zustand";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:8787";

export interface World {
  ds: Dataset;
  idx: TimetableIndex;
  geo: Geometry;
}

interface GameStore {
  status: "loading" | "connecting" | "ready" | "error";
  error: string | null;
  world: World | null;
  sync: ClockSync | null;
  state: Transit | null;
  /** Last rejection, shown as a toast. */
  notice: string | null;
  /** An intent is in flight (disable buttons until the server answers). */
  busy: boolean;
  follow: boolean;
  send: (intent: TransitIntent) => void;
  dismissNotice: () => void;
  setFollow: (follow: boolean) => void;
}

let socket: WebSocket | null = null;
let seq = 0;

export const useGame = create<GameStore>((set) => ({
  status: "loading",
  error: null,
  world: null,
  sync: null,
  state: null,
  notice: null,
  busy: false,
  follow: true,
  send: (intent) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    seq += 1;
    socket.send(JSON.stringify({ type: "intent", seq, intent }));
    set({ busy: true, notice: null });
  },
  dismissNotice: () => set({ notice: null }),
  setFollow: (follow) => set({ follow }),
}));

/** Current game time from the last clock sync. */
export function nowGameTime(): number | null {
  const { sync } = useGame.getState();
  return sync ? syncedGameTime(sync, Date.now()) : null;
}

function handle(msg: ServerMessage) {
  switch (msg.type) {
    case "hello":
      useGame.setState({ status: "ready", sync: msg.clock, state: msg.state });
      break;
    case "state":
      useGame.setState({ sync: msg.clock, state: msg.state, busy: false });
      break;
    case "rejected":
      useGame.setState({ sync: msg.clock, state: msg.state, busy: false, notice: msg.error });
      break;
  }
}

let started = false;

export async function startGame() {
  if (started) return;
  started = true;
  try {
    const ds = (await (await fetch(datasetUrl)).json()) as Dataset;
    const idx = buildIndex(ds);
    useGame.setState({ world: { ds, idx, geo: new Geometry(idx) }, status: "connecting" });
  } catch (err) {
    useGame.setState({ status: "error", error: `Couldn't load the timetable: ${String(err)}` });
    return;
  }
  socket = new WebSocket(SERVER_URL);
  socket.onmessage = (e) => handle(JSON.parse(e.data as string) as ServerMessage);
  socket.onerror = () =>
    useGame.setState({ status: "error", error: `Can't reach the game server at ${SERVER_URL}.` });
  socket.onclose = () => {
    if (useGame.getState().status === "ready") {
      useGame.setState({ status: "error", error: "Disconnected from the game server." });
    }
  };
}
