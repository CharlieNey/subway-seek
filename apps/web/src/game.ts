/**
 * Client game state: the dataset (loaded once), the server connection, and the
 * seeker's view of the round. The server is authoritative (and alone knows where the
 * hider is); the client derives positions and boards from the shared clock + timetable.
 */
import {
  type Dataset,
  type LandmarkData,
  type LandmarkKind,
  type SubwayData,
  withLandmarks,
} from "@stand-clear/data";
import datasetUrl from "@stand-clear/data/dataset.json?url";
import landmarksUrl from "@stand-clear/data/landmarks.json?url";
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
import { cardNotice } from "./HiderCards.tsx";
import { type DailyResult, loadResults, saveResult } from "./history.ts";
import { useReplay } from "./replay.ts";
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
  /** This daily was already finished in this browser: playing it again doesn't count. */
  alreadyPlayed: boolean;
  results: Record<string, DailyResult>;
  /** Last rejection, shown as a toast. */
  notice: string | null;
  /** The last card the hider played, as a notice. */
  cardNotice: string | null;
  /** An intent is in flight (disable buttons until the server answers). */
  busy: boolean;
  follow: boolean;
  /** Landmarks to show on the map while choosing a question about them. */
  preview: LandmarkPreview | null;
  send: (intent: ClientIntent) => void;
  dismissNotice: () => void;
  dismissCardNotice: () => void;
  setFollow: (follow: boolean) => void;
  setTab: (tab: "travel" | "ask") => void;
  setPreview: (preview: LandmarkPreview | null) => void;
}

/** Which landmarks to pin, and for tentacles the range around you (miles). */
export interface LandmarkPreview {
  kind: LandmarkKind;
  rangeMiles?: number;
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
  alreadyPlayed: false,
  results: loadResults(),
  notice: null,
  cardNotice: null,
  busy: false,
  follow: true,
  preview: null,
  send: (intent) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    seq += 1;
    socket.send(JSON.stringify({ type: "intent", seq, intent }));
    if (intent.type === "newRound") awaitingNewRound = true;
    set({ busy: true, notice: null });
  },
  dismissNotice: () => set({ notice: null }),
  dismissCardNotice: () => set({ cardNotice: null }),
  setFollow: (follow) => set({ follow }),
  setTab: (tab) => set({ tab }),
  setPreview: (preview) => set({ preview }),
}));

if (import.meta.env.DEV) (window as unknown as { __game: typeof useGame }).__game = useGame;

/** Current game time from the last clock sync. */
export function nowGameTime(): number | null {
  const { sync } = useGame.getState();
  return sync ? syncedGameTime(sync, Date.now()) : null;
}

/** The name of the station a round started from. */
export function hubName(world: World | null, view: SoloView | null): string | undefined {
  if (!world || !view) return undefined;
  return world.ds.complexes[world.ds.stations[view.hub]?.complex ?? -1]?.name;
}

/** Bookkeeping when a round's view arrives: already-played flag at the start, history at the end. */
function onView(view: SoloView): Partial<GameStore> {
  if (!view.result) {
    return { alreadyPlayed: !!(view.daily && loadResults()[view.daily.date]) };
  }
  const { alreadyPlayed, world } = useGame.getState();
  if (view.daily && !alreadyPlayed) saveResult(view, shareText(view, hubName(world, view)));
  return { results: loadResults() };
}

/** A notice when the hider plays a card (and none when a new round starts). */
function cardNoticeFor(view: SoloView, fresh: boolean): Partial<GameStore> {
  const before = useGame.getState().view?.cardEvents.length ?? 0;
  if (fresh) return { cardNotice: null };
  const last = view.cardEvents.at(-1);
  return last && view.cardEvents.length > before ? { cardNotice: cardNotice(last) } : {};
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
      if (fresh) useReplay.getState().close();
      useGame.setState({
        sync: msg.clock,
        view: msg.view,
        busy: false,
        ...cardNoticeFor(msg.view, fresh),
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
        ...cardNoticeFor(msg.view, false),
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
    const [subway, landmarks] = await Promise.all([
      fetch(datasetUrl).then((r) => r.json() as Promise<SubwayData>),
      fetch(landmarksUrl).then((r) => r.json() as Promise<LandmarkData>),
    ]);
    const ds = withLandmarks(subway, landmarks);
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
