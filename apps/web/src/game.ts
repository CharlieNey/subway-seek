/**
 * Client game state: the dataset (loaded once), the server connection, and the
 * seeker's view of the round. The server is authoritative (and alone knows where the
 * hider is); the client derives positions and boards from the shared clock + timetable.
 *
 * The connection carries a session token (as a WebSocket subprotocol, never in the URL),
 * kept in localStorage: a reconnect (a dropped
 * link, a refresh) brings it back and picks the same round up again, its clock paused on
 * the server while the player was away (DESIGN.md, Disconnects).
 */
import { type Dataset, type LandmarkData, type SubwayData, withLandmarks } from "@stand-clear/data";
import datasetUrl from "@stand-clear/data/dataset.json?url";
import landmarksUrl from "@stand-clear/data/landmarks.json?url";
import {
  buildIndex,
  CLOSE_TAKEN_OVER,
  type ClientIntent,
  type ClockSync,
  clientProtocols,
  Geometry,
  type HiderView,
  type Question,
  receivedSync,
  type ServerMessage,
  SOLO_PAUSES_ON_DROP,
  type SoloView,
  syncedGameTime,
  type TimetableIndex,
} from "@stand-clear/engine";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { keepArmed } from "./ask.ts";
import { ATTEMPT_TIMEOUT_MS, attemptFailed, type Link, startAttempt } from "./connection.ts";
import { type Door, doorOf, type StoredSession, tokenFor, withoutDoor } from "./doors.ts";
import { isHider } from "./hide.ts";
import {
  type DailyResult,
  loadHideReplays,
  loadReplay,
  loadResults,
  saveHideResult,
  saveResult,
} from "./history.ts";
import { useReplay } from "./replay.ts";
import { shareText } from "./share.ts";
import { storageKey } from "./storage.ts";
import { streetOn, useStreet } from "./streetMode.ts";

// Dev only: ?server=ws://… points a tab at another server, for headless checks.
const SERVER_URL =
  (import.meta.env.DEV ? new URLSearchParams(location.search).get("server") : null) ??
  import.meta.env.VITE_SERVER_URL ??
  "ws://localhost:8787";

/** The game server's HTTP side, beside its WebSocket (the homepage's GET /daily). */
export function serverHttpUrl(path: string): string {
  const u = new URL(SERVER_URL);
  u.protocol = u.protocol === "wss:" ? "https:" : "http:";
  u.pathname = path;
  u.search = "";
  return u.toString();
}

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
  view: SoloView | HiderView | null;
  tab: "travel" | "ask";
  /** This daily was already finished in this browser: playing it again doesn't count. */
  alreadyPlayed: boolean;
  /** Showing the last daily's replay from this browser, with no round or server. */
  replayOnly: boolean;
  /** The replay is yesterday's daily as the bot played it (the server's /replay/yesterday). */
  botReplay: { date: string; number: number } | null;
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

/** A new view keeps the armed question unless it was just asked or closed (ask.ts). */
function armedFor(view: SoloView, fresh: boolean): Partial<GameStore> {
  const { armed, view: prev } = useGame.getState();
  const next = fresh ? null : keepArmed(armed, prev, view);
  return next === armed ? {} : { armed: next };
}

let socket: WebSocket | null = null;
let seq = 0;
/** Intents sent but not yet answered: resent after a reconnect that resumed the session. */
let pending: { seq: number; msg: string }[] = [];
/**
 * The seq of a "newRound" not yet answered. Only its answer starts the new round in the
 * panel (recentre, clear what's armed): frames the old round pushes meanwhile carry lower
 * seqs.
 */
let newRoundSeq: number | null = null;
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
  replayOnly: false,
  botReplay: null,
  results: loadResults(),
  notice: null,
  busy: false,
  follow: true,
  armed: null,
  hovered: null,
  mapFailed: null,
  send: (intent) => {
    if (!socket || useGame.getState().link.kind !== "open") return;
    // On the free map a new round ends at the station (streetMode.ts).
    if (intent.type === "newRound" && !streetOn()) intent = { ...intent, street: false };
    seq += 1;
    const msg = JSON.stringify({ type: "intent", seq, intent });
    pending.push({ seq, msg });
    socket.send(msg);
    if (intent.type === "newRound") newRoundSeq = seq;
    set({ busy: true, notice: null });
  },
  dismissNotice: () => set({ notice: null }),
  setFollow: (follow) => set({ follow }),
  setTab: (tab) => set({ tab }),
  arm: (armed) => set({ armed }),
  hover: (hovered) => set({ hovered }),
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

/**
 * Just these fields of the store: the component re-renders when one of them changes, not
 * on every change to the store (a hover, a notice, the clock's sync).
 */
export function useGamePick<K extends keyof GameStore>(...keys: K[]): Pick<GameStore, K> {
  return useGame(
    useShallow((s) => {
      const out = {} as Pick<GameStore, K>;
      for (const k of keys) out[k] = s[k];
      return out;
    }),
  );
}

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

const SESSION_KEY = storageKey("session");

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<StoredSession>) : null;
    if (typeof s?.token !== "string") return null;
    return {
      token: s.token,
      live: !!s.live,
      mode: s.mode === "daily" || s.mode === "practice" || s.mode === "hide" ? s.mode : null,
      difficulty: s.difficulty === "easy" || s.difficulty === "hard" ? s.difficulty : "normal",
      daily: typeof s.daily === "number" ? s.daily : null,
      at: typeof s.at === "number" ? s.at : 0,
    };
  } catch {
    return null;
  }
}

function saveSession(s: Omit<StoredSession, "at">) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, at: Date.now() }));
  } catch {
    // Private windows can refuse storage: the round just won't survive a refresh.
  }
}

/** Note the session as the page closes: the homepage offers Resume for the grace period. */
function rememberSession() {
  const { view } = useGame.getState();
  if (!sessionToken || !view) return;
  saveSession({
    token: sessionToken,
    live: !view.result,
    mode: view.mode,
    difficulty: view.difficulty,
    daily: view.daily?.number ?? null,
  });
}
window.addEventListener("pagehide", rememberSession);

/** How this page was opened: today's daily, practice, the last daily's replay, or carry on. */
const door = doorOf(location.search);

/**
 * The round this page is opening, before the server says: its door, or the practice round
 * it carries on. Anything else opens (or resumes) today's daily.
 */
export function openingRound(): Extract<Door, { kind: "practice" | "hide" }> | { kind: "daily" } {
  if (door.kind === "practice" || door.kind === "hide") return door;
  const stored = door.kind === "resume" ? loadSession() : null;
  return stored?.live && (stored.mode === "practice" || stored.mode === "hide")
    ? { kind: stored.mode }
    : { kind: "daily" };
}

let sessionToken: string | null = null;

// --- Messages -----------------------------------------------------------------------

/** Bookkeeping when a round's view arrives: already-played flag at the start, history at the end. */
function onView(view: SoloView): Partial<GameStore> {
  if (sessionToken) {
    saveSession({
      token: sessionToken,
      live: !view.result,
      mode: view.mode,
      difficulty: view.difficulty,
      daily: view.daily?.number ?? null,
    });
  }
  if (!view.result) {
    return { alreadyPlayed: !!(view.daily && loadResults()[view.daily.date]) };
  }
  const { alreadyPlayed, world } = useGame.getState();
  if (isHider(view) && world) saveHideResult(world.ds, view, shareText(view, hubName(world, view)));
  if (view.daily && !alreadyPlayed && world) {
    saveResult(world.ds, view, shareText(view, hubName(world, view), location.origin));
  }
  return { results: loadResults() };
}

/**
 * The server has answered intents up to `upTo`. A refusal with no seq (-1) answers
 * whatever was in flight, so the buttons never stay waiting for an answer that won't come.
 */
function settled(upTo: number): Partial<GameStore> {
  const last = upTo < 0 ? seq : upTo;
  pending = pending.filter((p) => p.seq > last);
  if (newRoundSeq !== null && newRoundSeq <= last) newRoundSeq = null;
  return { busy: pending.length > 0 };
}

/** Whether a frame answering `upTo` brings the new round asked for. */
function bringsNewRound(upTo: number): boolean {
  return newRoundSeq !== null && upTo >= newRoundSeq;
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
      // Not when the door asked for a fresh round.
      const lost = !msg.resumed && stored?.live === true && tokenFor(door, stored) === stored.token;
      // The round is up: drop the door from the address, so a refresh carries on.
      if (location.search !== withoutDoor(location.search)) {
        history.replaceState(null, "", location.pathname + withoutDoor(location.search));
      }
      const { view } = useGame.getState();
      // A fresh session, or the new round asked for before the drop, answered while away.
      const fresh = (!msg.resumed && view !== null) || bringsNewRound(msg.seq);
      if (fresh) useReplay.getState().close();
      if (!msg.resumed || bringsNewRound(msg.seq)) newRoundSeq = null;
      queueMicrotask(syncStreet);
      useGame.setState({
        status: "ready",
        link: { kind: "open" },
        everOpen: true,
        ...armedFor(msg.view, fresh),
        sync: receivedSync(msg.clock, Date.now()),
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
      const fresh = bringsNewRound(msg.seq);
      if (fresh) useReplay.getState().close();
      useGame.setState({
        ...armedFor(msg.view, fresh),
        sync: receivedSync(msg.clock, Date.now()),
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
        sync: receivedSync(msg.clock, Date.now()),
        view: msg.view,
        ...settled(msg.seq),
        notice: msg.error,
        ...onView(msg.view),
      });
      break;
  }
}

// --- The connection -----------------------------------------------------------------

/** The clock stops where it is: the server paused it, or another tab has the round. */
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
function failed(code: number, opened: boolean, reason?: string) {
  const { link, everOpen } = useGame.getState();
  // A solo round's clock runs on through a drop, on the server and here.
  if (link.kind === "open" && SOLO_PAUSES_ON_DROP) freezeClock();
  const next = attemptFailed(
    link,
    { code, opened, reason: reason || undefined },
    Date.now(),
    everOpen,
  );
  useGame.setState({ link: next });
  clearTimeout(retryTimer);
  if (next.kind === "waiting") retryTimer = setTimeout(connect, next.until - Date.now());
}

function connect() {
  clearTimeout(retryTimer);
  dropSocket();
  const url = new URL(SERVER_URL);
  // The token rides as a subprotocol, not in the URL, so access logs never record it.
  const token = sessionToken ?? tokenFor(door, loadSession());
  const stored = loadSession();
  const opening =
    door.kind === "resume" && stored?.mode
      ? { kind: stored.mode, difficulty: stored.difficulty }
      : door;
  if (opening.kind === "practice" || opening.kind === "hide") {
    url.searchParams.set("mode", opening.kind);
    if (opening.difficulty) url.searchParams.set("difficulty", opening.difficulty);
  }
  // The free map: a new round ends at the station (streetMode.ts).
  if (!streetOn()) url.searchParams.set("street", "off");
  const ws = new WebSocket(url, clientProtocols(token));
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
    failed(e.code, opened, e.reason);
  };
}

/**
 * The page went to the free map (Google refused): a round still headed for a street search
 * finishes at the station instead. Sent once per round; the server's answer settles it.
 */
let streetOffSentFor: number | null = null;
function syncStreet() {
  const { view, link } = useGame.getState();
  if (streetOn() || !view || view.result || view.stationOnly || link.kind !== "open") return;
  if (streetOffSentFor === view.seekStart) return;
  streetOffSentFor = view.seekStart;
  useGame.getState().send({ type: "streetOff" });
}
useStreet.subscribe(syncStreet);

// The browser knows before the socket does.
window.addEventListener("offline", () => {
  if (useGame.getState().link.kind !== "open") return;
  dropSocket();
  failed(1006, true);
});
window.addEventListener("online", () => useGame.getState().retryNow());

// --- Loading ------------------------------------------------------------------------

/**
 * Fetch JSON, reporting decoded bytes as they arrive, and the total: `size` when the build
 * knows it, else the server's length if it isn't compressed, else null (the board then
 * counts megabytes without its tiles).
 */
async function fetchJson<T>(
  url: string,
  onProgress?: (loaded: number, total: number | null) => void,
  size?: number,
): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const length = Number(res.headers.get("content-length"));
  // A compressed response's length is the compressed size, so it can't measure progress.
  const total =
    size && size > 0 ? size : length > 0 && !res.headers.get("content-encoding") ? length : null;
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
export async function loadWorld(): Promise<boolean> {
  useGame.setState({ status: "loading", boot: BOOT });
  try {
    let lastPaint = 0;
    const [subway, landmarks] = await Promise.all([
      fetchJson<SubwayData>(
        datasetUrl,
        (loaded, total) => {
          const now = performance.now();
          if (now - lastPaint < 50) return;
          lastPaint = now;
          setBoot((b) => ({ timetable: { ...b.timetable, loaded, total } }));
        },
        Number(import.meta.env.VITE_DATASET_BYTES),
      ),
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
  if (!(await loadWorld())) return;
  if (door.kind === "replay" && door.yesterday) void showBotReplay();
  else if (door.kind === "replay") showStoredReplay();
  else connect();
}

/**
 * Yesterday's daily as the bot played it, from the server (DESIGN.md, Phones): something
 * to watch for anyone who can't play a round here, a phone first of all. Its day is over,
 * so the answer is public.
 */
async function showBotReplay() {
  const { world } = useGame.getState();
  if (!world) return;
  try {
    const res = await fetch(serverHttpUrl("/replay/yesterday"));
    if (!res.ok) throw new Error(`${res.status}`);
    const { date, number, view } = (await res.json()) as {
      date: string;
      number: number;
      view: SoloView;
    };
    showReplay(world, view, { date, number });
  } catch (err) {
    console.warn("yesterday's replay didn't load:", err);
    useGame.setState({
      status: "error",
      boot: {
        ...useGame.getState().boot,
        failed: "Yesterday's replay didn't load from the server.",
      },
    });
  }
}

/**
 * The last daily's replay, from this browser, with no server: the homepage's Watch
 * replay. The round is over, so its view holds everything the replay shows.
 */
function showStoredReplay() {
  const kept =
    door.kind === "replay" && door.hideId ? loadHideReplays()[door.hideId] : loadReplay();
  const { world } = useGame.getState();
  if (!kept?.view.result || !world) {
    location.replace("/");
    return;
  }
  // Kept without Google's coordinates (history.ts, keptView): no street search to measure.
  showReplay(world, kept.view, null);
}

/** A finished round's replay with no round or server behind it. */
function showReplay(world: World, view: SoloView, bot: GameStore["botReplay"]) {
  useGame.setState({
    status: "ready",
    link: { kind: "open" },
    everOpen: true,
    replayOnly: true,
    botReplay: bot,
    view,
    sync: { gameTime: view.result?.at ?? 0, speed: 6, serverNow: Date.now(), paused: true },
    results: loadResults(),
  });
  useReplay.getState().open(world, view, { street: false, botSeeker: bot !== null });
}
