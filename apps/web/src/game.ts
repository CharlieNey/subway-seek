/**
 * Client game state: the dataset (loaded once), the server connection, and the
 * seeker's view of the round. The server is authoritative (and alone knows where the
 * hider is); the client derives positions and boards from the shared clock + timetable.
 */
import type { Dataset } from "@stand-clear/data";
import datasetUrl from "@stand-clear/data/dataset.json?url";
import {
  buildIndex,
  type ClientIntent,
  type ClockSync,
  Geometry,
  type ServerMessage,
  type SoloView,
  syncedGameTime,
  type TimetableIndex,
} from "@stand-clear/engine";
import { create } from "zustand";
import { type DailyResult, loadResults, saveResult } from "./history.ts";
import { shareText } from "./share.ts";

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
  view: SoloView | null;
  tab: "travel" | "ask";
  /** This daily was already finished in this browser: a replay doesn't count. */
  replay: boolean;
  results: Record<string, DailyResult>;
  /** Last rejection, shown as a toast. */
  notice: string | null;
  /** An intent is in flight (disable buttons until the server answers). */
  busy: boolean;
  follow: boolean;
  send: (intent: ClientIntent) => void;
  dismissNotice: () => void;
  setFollow: (follow: boolean) => void;
  setTab: (tab: "travel" | "ask") => void;
}

let socket: WebSocket | null = null;
let seq = 0;
/** The next state answers a "newRound": recentre and reset the panel. */
let awaitingNewRound = false;

export const useGame = create<GameStore>((set) => ({
  status: "loading",
  error: null,
  world: null,
  sync: null,
  view: null,
  tab: "travel",
  replay: false,
  results: loadResults(),
  notice: null,
  busy: false,
  follow: true,
  send: (intent) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    seq += 1;
    socket.send(JSON.stringify({ type: "intent", seq, intent }));
    if (intent.type === "newRound") awaitingNewRound = true;
    set({ busy: true, notice: null });
  },
  dismissNotice: () => set({ notice: null }),
  setFollow: (follow) => set({ follow }),
  setTab: (tab) => set({ tab }),
}));

/** Current game time from the last clock sync. */
export function nowGameTime(): number | null {
  const { sync } = useGame.getState();
  return sync ? syncedGameTime(sync, Date.now()) : null;
}

/** Bookkeeping when a round's view arrives: replay flag at the start, history at the end. */
function onView(view: SoloView): Partial<GameStore> {
  if (!view.result) {
    return { replay: !!(view.daily && loadResults()[view.daily.date]) };
  }
  if (view.daily && !useGame.getState().replay) saveResult(view, shareText(view));
  return { results: loadResults() };
}

function handle(msg: ServerMessage) {
  switch (msg.type) {
    case "hello":
      useGame.setState({ status: "ready", sync: msg.clock, view: msg.view, ...onView(msg.view) });
      break;
    case "state": {
      // A fresh round: follow the seeker again.
      const fresh = awaitingNewRound;
      awaitingNewRound = false;
      useGame.setState({
        sync: msg.clock,
        view: msg.view,
        busy: false,
        ...onView(msg.view),
        ...(fresh ? { follow: true, tab: "travel" as const } : {}),
      });
      break;
    }
    case "rejected":
      useGame.setState({
        sync: msg.clock,
        view: msg.view,
        busy: false,
        notice: msg.error,
        ...onView(msg.view),
      });
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
