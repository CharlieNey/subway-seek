/**
 * Client game state: the dataset (loaded once), the server connection, and the
 * seeker's view of the round. The server is authoritative (and alone knows where the
 * hider is); the client derives positions and boards from the shared clock + timetable.
 *
 * The connection carries a session token, kept in localStorage: a reconnect (a dropped
 * link, a refresh) brings it back and picks the same round up again, its clock paused on
 * the server while the player was away (DESIGN.md, Disconnects).
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
  CLOSE_TAKEN_OVER,
  type ClientIntent,
  type ClockSync,
  Geometry,
  type Question,
  SESSION_PARAM,
  type ServerMessage,
  type SoloView,
  syncedGameTime,
  TENTACLE_MILES,
  type TimetableIndex,
} from "@stand-clear/engine";
import { create } from "zustand";
import { keepArmed } from "./ask.ts";
import { ATTEMPT_TIMEOUT_MS, attemptFailed, type Link, startAttempt } from "./connection.ts";
import { type DailyResult, loadResults, saveResult } from "./history.ts";
import { useReplay } from "./replay.ts";
import { shareText } from "./share.ts";

// Dev only: ?server=ws://… points a tab at another server, for headless checks.
const SERVER_URL =
  (import.meta.env.DEV ? new URLSearchParams(location.search).get("server") : null) ??
  import.meta.env.VITE_SERVER_URL ??
  "ws://localhost:8787";

export interface World {
  ds: Dataset;
  idx: TimetableIndex;
  geo: Geometry;
}

/** The loading board's rows (DESIGN.md, Loading: progress is real). */
export interface Boot {
  timetable: { loaded: number; total: number | null; done: boolean; trips: number | null };
  landmarks: { done: boolean; places: number | null };
  network: { state: "next" | "now" | "done"; stations: number | null };
  /** Why the timetable or landmarks didn't load. */
  failed: string | null;
}

const BOOT: Boot = {
  timetable: { loaded: 0, total: null, done: false, trips: null },
  landmarks: { done: false, places: null },
  network: { state: "next", stations: null },
  failed: null,
};

interface GameStore {
  status: "loading" | "connecting" | "ready" | "error";
  boot: Boot;
  /** The link to the game server (connection.ts). */
  link: Link;
  /** This page has had a round from the server: a drop now is "connection lost". */
  everOpen: boolean;
  world: World | null;
  sync: ClockSync | null;
  view: SoloView | null;
  tab: "travel" | "ask";
  /** This daily was already finished in this browser: playing it again doesn't count. */
  alreadyPlayed: boolean;
  results: Record<string, DailyResult>;
  /** A refused action, in the notice row until dismissed. */
  notice: string | null;
  /** An intent is in flight (disable buttons until the server answers). */
  busy: boolean;
  follow: boolean;
  /** The question armed for asking: the wainscot confirms it (DESIGN.md, Interaction). */
  armed: Question | null;
  /** The question under the pointer: previewed without arming. */
  hovered: Question | null;
  /** Landmarks to show on the map for the hovered or armed question. */
  preview: LandmarkPreview | null;
  /** Why the base map didn't load, while it hasn't. */
  mapFailed: string | null;
  send: (intent: ClientIntent) => void;
  dismissNotice: () => void;
  setFollow: (follow: boolean) => void;
  setTab: (tab: "travel" | "ask") => void;
  arm: (q: Question | null) => void;
  hover: (q: Question | null) => void;
  /** Try the server now instead of waiting for the next try. */
  retryNow: () => void;
  /** Take the round back from another tab. */
  playHere: () => void;
  /** Load the timetable again after it failed. */
  retryLoad: () => void;
}

/** Which landmarks to pin, and for tentacles the range around you (miles). */
export interface LandmarkPreview {
  kind: LandmarkKind;
  rangeMiles?: number;
}

/** The landmarks a question is about, to pin while it's hovered or armed. */
function previewFor(q: Question | null): LandmarkPreview | null {
  if (!q) return null;
  if (q.kind === "matching" || q.kind === "measuring") return { kind: q.landmark };
  if (q.kind === "tentacles") return { kind: q.landmark, rangeMiles: TENTACLE_MILES[q.landmark] };
  return null;
}

/** A new view keeps the armed question unless it was just asked or closed (ask.ts). */
function armedFor(view: SoloView, fresh: boolean): Partial<GameStore> {
  const { armed, hovered, view: prev } = useGame.getState();
  const next = fresh ? null : keepArmed(armed, prev, view);
  return next === armed ? {} : { armed: next, preview: previewFor(hovered ?? next) };
}

let socket: WebSocket | null = null;
let seq = 0;
/** Intents sent but not yet answered: resent after a reconnect that resumed the session. */
let pending: { seq: number; msg: string }[] = [];
/** The next state answers a "newRound": recentre and reset the panel. */
let awaitingNewRound = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let attemptTimer: ReturnType<typeof setTimeout> | undefined;

export const useGame = create<GameStore>((set) => ({
  status: "loading",
  boot: BOOT,
  link: { kind: "idle" },
  everOpen: false,
  world: null,
  sync: null,
  view: null,
  tab: "travel",
  alreadyPlayed: false,
  results: loadResults(),
  notice: null,
  busy: false,
  follow: true,
  armed: null,
  hovered: null,
  preview: null,
  mapFailed: null,
  send: (intent) => {
    if (!socket || useGame.getState().link.kind !== "open") return;
    seq += 1;
    const msg = JSON.stringify({ type: "intent", seq, intent });
    pending.push({ seq, msg });
    socket.send(msg);
    if (intent.type === "newRound") awaitingNewRound = true;
    set({ busy: true, notice: null });
  },
  dismissNotice: () => set({ notice: null }),
  setFollow: (follow) => set({ follow }),
  setTab: (tab) => set({ tab }),
  arm: (armed) => set((s) => ({ armed, preview: previewFor(s.hovered ?? armed) })),
  hover: (hovered) => set((s) => ({ hovered, preview: previewFor(hovered ?? s.armed) })),
  retryNow: () => {
    const { link } = useGame.getState();
    if (link.kind === "connecting" || link.kind === "waiting") connect();
  },
  playHere: () => {
    if (useGame.getState().link.kind === "takenOver") connect();
  },
  retryLoad: () => {
    if (useGame.getState().status === "error") void loadWorld().then((ok) => ok && connect());
  },
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

// --- The session token ------------------------------------------------------------

const SESSION_KEY = "standClear.session";

/** The session this browser last played, and whether its round was still going. */
interface StoredSession {
  token: string;
  live: boolean;
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<StoredSession>) : null;
    return typeof s?.token === "string" ? { token: s.token, live: !!s.live } : null;
  } catch {
    return null;
  }
}

function saveSession(s: StoredSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // Private windows can refuse storage: the round just won't survive a refresh.
  }
}

let sessionToken: string | null = null;

// --- Messages -----------------------------------------------------------------------

/** Bookkeeping when a round's view arrives: already-played flag at the start, history at the end. */
function onView(view: SoloView): Partial<GameStore> {
  if (sessionToken) saveSession({ token: sessionToken, live: !view.result });
  if (!view.result) {
    return { alreadyPlayed: !!(view.daily && loadResults()[view.daily.date]) };
  }
  const { alreadyPlayed, world } = useGame.getState();
  if (view.daily && !alreadyPlayed) saveResult(view, shareText(view, hubName(world, view)));
  return { results: loadResults() };
}

/** The server has answered intents up to `upTo`. */
function settled(upTo: number): Partial<GameStore> {
  pending = pending.filter((p) => p.seq > upTo);
  return { busy: pending.length > 0 };
}

function handle(msg: ServerMessage) {
  switch (msg.type) {
    case "hello": {
      const stored = loadSession();
      sessionToken = msg.session;
      seq = Math.max(seq, msg.seq);
      if (msg.resumed) {
        // What the server didn't get before the drop goes again; it ignores repeats.
        pending = pending.filter((p) => p.seq > msg.seq);
        for (const p of pending) socket?.send(p.msg);
      } else {
        pending = [];
      }
      // A round in progress that the server didn't keep (away too long, or it restarted).
      const lost = !msg.resumed && stored?.live === true;
      const { view } = useGame.getState();
      const fresh = !msg.resumed && view !== null;
      if (fresh) useReplay.getState().close();
      awaitingNewRound = false;
      useGame.setState({
        status: "ready",
        link: { kind: "open" },
        everOpen: true,
        ...armedFor(msg.view, fresh),
        sync: msg.clock,
        view: msg.view,
        busy: pending.length > 0,
        ...(lost ? { notice: "Your last round wasn't kept, so this one starts fresh." } : {}),
        ...(fresh ? { follow: true, tab: "travel" as const } : {}),
        ...onView(msg.view),
      });
      break;
    }
    case "state": {
      // A fresh round: follow the seeker again.
      const fresh = awaitingNewRound;
      awaitingNewRound = false;
      if (fresh) useReplay.getState().close();
      useGame.setState({
        ...armedFor(msg.view, fresh),
        sync: msg.clock,
        view: msg.view,
        ...settled(msg.seq),
        ...onView(msg.view),
        ...(fresh ? { follow: true, tab: "travel" as const } : {}),
      });
      break;
    }
    case "rejected":
      useGame.setState({
        ...armedFor(msg.view, false),
        sync: msg.clock,
        view: msg.view,
        ...settled(msg.seq),
        notice: msg.error,
        ...onView(msg.view),
      });
      break;
  }
}

// --- The connection -----------------------------------------------------------------

/** The clock stops where it is while the link is down: the server paused it too. */
function freezeClock() {
  const { sync } = useGame.getState();
  if (!sync || sync.paused) return;
  const now = Date.now();
  useGame.setState({
    sync: { ...sync, gameTime: syncedGameTime(sync, now), serverNow: now, paused: true },
  });
}

/** Stop listening to the current socket and close it. */
function dropSocket() {
  clearTimeout(attemptTimer);
  const ws = socket;
  socket = null;
  if (!ws) return;
  ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
  ws.close();
}

/** The link failed or dropped: wait, then try again. */
function failed(code: number, opened: boolean) {
  const { link, everOpen } = useGame.getState();
  if (link.kind === "open") freezeClock();
  const next = attemptFailed(link, { code, opened }, Date.now(), everOpen);
  useGame.setState({ link: next });
  clearTimeout(retryTimer);
  if (next.kind === "waiting") retryTimer = setTimeout(connect, next.until - Date.now());
}

function connect() {
  clearTimeout(retryTimer);
  dropSocket();
  const url = new URL(SERVER_URL);
  const token = sessionToken ?? loadSession()?.token;
  if (token) url.searchParams.set(SESSION_PARAM, token);
  const ws = new WebSocket(url);
  socket = ws;
  let opened = false;
  useGame.setState((s) => ({ link: startAttempt(s.link, Date.now()) }));
  // A socket that hangs before opening is given up and tried again.
  attemptTimer = setTimeout(() => {
    if (socket !== ws || opened) return;
    dropSocket();
    failed(1006, false);
  }, ATTEMPT_TIMEOUT_MS);
  ws.onopen = () => {
    opened = true;
    clearTimeout(attemptTimer);
  };
  ws.onmessage = (e) => {
    if (socket === ws) handle(JSON.parse(e.data as string) as ServerMessage);
  };
  ws.onclose = (e) => {
    if (socket !== ws) return;
    socket = null;
    clearTimeout(attemptTimer);
    if (e.code === CLOSE_TAKEN_OVER) {
      // Another tab has the round now. Don't fight it for the session.
      freezeClock();
      useGame.setState({ link: { kind: "takenOver" } });
      return;
    }
    failed(e.code, opened);
  };
}

// The browser knows before the socket does.
window.addEventListener("offline", () => {
  if (useGame.getState().link.kind !== "open") return;
  dropSocket();
  failed(1006, true);
});
window.addEventListener("online", () => useGame.getState().retryNow());

// --- Loading ------------------------------------------------------------------------

/** Fetch JSON, reporting bytes as they arrive (and the total, when the server says it). */
async function fetchJson<T>(
  url: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const length = Number(res.headers.get("content-length"));
  // A compressed response's length is the compressed size, so it can't measure progress.
  const total = length > 0 && !res.headers.get("content-encoding") ? length : null;
  if (!res.body || !onProgress) return (await res.json()) as T;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  const all = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(all)) as T;
}

/** A painted frame, or 50 ms in a background tab, where frames don't come. */
const nextFrame = () =>
  new Promise<void>((r) => {
    requestAnimationFrame(() => r());
    setTimeout(r, 50);
  });

function setBoot(change: (b: Boot) => Partial<Boot>) {
  useGame.setState((s) => ({ boot: { ...s.boot, ...change(s.boot) } }));
}

/** Loads the timetable and landmarks and builds the network. False if a download failed. */
async function loadWorld(): Promise<boolean> {
  useGame.setState({ status: "loading", boot: BOOT });
  try {
    let lastPaint = 0;
    const [subway, landmarks] = await Promise.all([
      fetchJson<SubwayData>(datasetUrl, (loaded, total) => {
        const now = performance.now();
        if (now - lastPaint < 50) return;
        lastPaint = now;
        setBoot((b) => ({ timetable: { ...b.timetable, loaded, total } }));
      }),
      fetchJson<LandmarkData>(landmarksUrl).then((l) => {
        const places = Object.values(l.kinds).reduce((n, list) => n + list.length, 0);
        setBoot(() => ({ landmarks: { done: true, places } }));
        return l;
      }),
    ]);
    setBoot((b) => ({
      timetable: {
        ...b.timetable,
        loaded: b.timetable.total ?? b.timetable.loaded,
        done: true,
        trips: subway.trips.length,
      },
      network: { state: "now", stations: null },
    }));
    // Let the board show "The network" under way before the build takes the main thread.
    await nextFrame();
    await nextFrame();
    const ds = withLandmarks(subway, landmarks);
    const idx = buildIndex(ds);
    const world = { ds, idx, geo: new Geometry(idx) };
    setBoot(() => ({ network: { state: "done", stations: ds.complexes.length } }));
    useGame.setState({ world, status: "connecting" });
    return true;
  } catch (err) {
    setBoot(() => ({ failed: String(err instanceof Error ? err.message : err) }));
    useGame.setState({ status: "error" });
    return false;
  }
}

let started = false;

export async function startGame() {
  if (started) return;
  started = true;
  if (await loadWorld()) connect();
}
