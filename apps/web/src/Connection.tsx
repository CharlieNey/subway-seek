/**
 * Loading, connecting and errors (DESIGN.md; the Deck page, part eleven): the loading
 * board, the plaques for a server that can't be reached or a round open in another tab,
 * and the express band while a dropped link reconnects. Each says what's happening,
 * what's safe, and what to do.
 */
import { RECONNECT_GRACE_MS, SOLO_PAUSES_ON_DROP } from "@stand-clear/engine";
import { useEffect, useState } from "react";
import { type LinkScreen, LOST_TRIES, linkScreen, refused } from "./connection.ts";
import { useGame } from "./game.ts";
import { NameTablet } from "./ui/NameTablet.tsx";
import { Button, Plaque, TileTimer, Wainscot, WainscotText } from "./ui/vocab.tsx";

/** Real time, re-rendering `hz` times a second, for countdowns that don't follow the game clock. */
export function useNow(hz = 4): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return now;
}

/** What the link shows right now. */
export function useLinkScreen(): LinkScreen {
  const link = useGame((s) => s.link);
  const everOpen = useGame((s) => s.everOpen);
  const now = useNow(4);
  return linkScreen(link, everOpen, now);
}

const clockTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const fmtCount = (n: number) => n.toLocaleString("en-US");

type RowState = "done" | "now" | "wait";

function BootRow({
  state,
  name,
  status,
  note,
  children,
}: {
  state: RowState;
  name: string;
  status: string;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`sc-boot-row ${state}`}>
      <i />
      <b>{name}</b>
      <em>{status}</em>
      <small>{note}</small>
      {children}
    </div>
  );
}

/**
 * Getting ready: a four-row departures board. The timetable's twenty tiles fill with
 * bytes downloaded; the other rows show their status only.
 */
export function BootBoard() {
  const boot = useGame((s) => s.boot);
  const screen = useLinkScreen();
  const { timetable: tt, landmarks, network } = boot;
  const share = tt.total ? Math.min(1, tt.loaded / tt.total) : null;
  const ttStatus = tt.done
    ? "Done"
    : share !== null
      ? `${Math.floor(share * 100)}%`
      : tt.loaded > 0
        ? `${(tt.loaded / 1e6).toFixed(1)} MB`
        : "Loading";
  const server = serverRow(screen, network.state === "done");
  return (
    <div className="flex flex-col">
      <div className="sc-tilefield flex justify-center px-4 pt-3.5 pb-2">
        <NameTablet text="Stand Clear" width={300} />
      </div>
      <div className="flex flex-col px-4 pt-1.5">
        <BootRow
          state={tt.done ? "done" : "now"}
          name="Timetable"
          status={ttStatus}
          note={tt.trips ? `Weekday service · ${fmtCount(tt.trips)} trips` : "Weekday service"}
        >
          {!tt.done && share !== null && <TileTimer total={20} left={share * 20} size={12} />}
        </BootRow>
        <BootRow
          state={landmarks.done ? "done" : "now"}
          name="Landmarks"
          status={landmarks.done ? "Done" : "Loading"}
          note={
            landmarks.places
              ? `${fmtCount(landmarks.places)} places, for landmark questions`
              : "Places, for landmark questions"
          }
        />
        <BootRow
          state={network.state === "done" ? "done" : network.state === "now" ? "now" : "wait"}
          name="The network"
          status={network.state === "done" ? "Done" : network.state === "now" ? "Building" : "Next"}
          note={
            network.stations
              ? `${fmtCount(network.stations)} stations and their transfers`
              : "Stations and their transfers"
          }
        />
        <BootRow
          state={server.state}
          name="Game server"
          status={server.status}
          note={server.note}
        />
      </div>
    </div>
  );
}

function serverRow(screen: LinkScreen, networkDone: boolean) {
  if (screen.kind === "board" && screen.status === "slow") {
    return {
      state: "now" as const,
      status: `${screen.seconds} s`,
      note: "Still connecting. The server can take a few seconds to wake up.",
    };
  }
  const connecting = screen.kind === "board" && screen.status === "connecting" && networkDone;
  return {
    state: connecting ? ("now" as const) : ("wait" as const),
    status: connecting ? "Connecting" : "Waiting",
    note: "Today's round starts when it answers",
  };
}

/** The board's wainscot: what happens next, and a way to hurry a slow server. */
export function BootWainscot() {
  const screen = useLinkScreen();
  const retryNow = useGame((s) => s.retryNow);
  if (screen.kind === "board" && screen.status === "slow") {
    return (
      <Wainscot>
        <Button onClick={retryNow}>Try again now</Button>
        <WainscotText>It keeps trying on its own.</WainscotText>
      </Wainscot>
    );
  }
  return (
    <Wainscot>
      <WainscotText>Your round opens as soon as this finishes.</WainscotText>
    </Wainscot>
  );
}

/** The timetable or landmarks didn't download. */
export function LoadFailed() {
  const boot = useGame((s) => s.boot);
  const retryLoad = useGame((s) => s.retryLoad);
  return (
    <Plaque
      className="mx-4 mt-3"
      title="The timetable didn't load"
      safe="Nothing is lost. Your round hasn't started yet."
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button kind="ink" onClick={retryLoad}>
            Try again
          </Button>
        </div>
      }
      details={boot.failed}
    >
      <p>The game's data didn't finish downloading.</p>
    </Plaque>
  );
}

/**
 * Can't reach the game server. Before the round: nothing is lost, and the daily will be
 * the same round. Mid-round, after five tries: the round is paused on the server, for the
 * grace period.
 */
export function ServerPlaque({ screen }: { screen: Extract<LinkScreen, { kind: "unreachable" }> }) {
  const retryNow = useGame((s) => s.retryNow);
  const now = useNow(1);
  const keptUntil = screen.firstTryAt + RECONNECT_GRACE_MS;
  const safe = !screen.midRound
    ? "Nothing is lost. Today's daily hasn't started, and it'll be the same round when you get in."
    : now < keptUntil
      ? SOLO_PAUSES_ON_DROP
        ? `Your round is paused on the server and kept until ${clockTime(keptUntil)}.`
        : `Your round is kept on the server until ${clockTime(keptUntil)}. Its clock keeps running.`
      : "The server kept your round for 3 minutes. When you get in, a new one starts.";
  const online = navigator.onLine;
  const close = screen.lastClose;
  return (
    <Plaque
      className="mx-4 mt-3"
      title="Can't reach the game server"
      safe={safe}
      actions={
        <>
          <div className="sc-retry">
            <span>
              {screen.inSeconds === null ? (
                <>Trying now · try {screen.attempt}</>
              ) : (
                <>
                  Trying again in <b className="sc-num">{screen.inSeconds}</b> s · try{" "}
                  {screen.attempt}
                </>
              )}
            </span>
            <TileTimer total={10} left={screen.tilesLeft} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button kind="ink" onClick={retryNow}>
              Try now
            </Button>
          </div>
        </>
      }
      details={`${close ? `${close.opened ? "Dropped" : "Closed before it opened"} · code ${close.code} · ` : ""}${screen.tries} ${screen.tries === 1 ? "try" : "tries"} since ${clockTime(screen.firstTryAt)}`}
    >
      <p>
        {refused(close) && close?.reason
          ? close.reason
          : online
            ? "You're online, but the server isn't answering. It may be restarting."
            : "This device is offline. The game picks up again when it's back."}
      </p>
    </Plaque>
  );
}

/** The round is open in another tab or window. */
export function TakenOverPlaque() {
  const playHere = useGame((s) => s.playHere);
  return (
    <Plaque
      className="mx-4 mt-3"
      title="Playing in another tab"
      safe="Nothing is lost. The round carries on there."
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button kind="ink" onClick={playHere}>
            Play here
          </Button>
        </div>
      }
    >
      <p>This round was opened in another tab or window.</p>
    </Plaque>
  );
}

/** Mid-round, reconnecting: the screen's one express band. */
export function LostBand({ screen }: { screen: Extract<LinkScreen, { kind: "lost" }> }) {
  return (
    <div className="sc-express-ink sc-grid-lines" role="status">
      <b>Connection lost · reconnecting</b>
      <span>
        {SOLO_PAUSES_ON_DROP
          ? "The round is paused on the server until you're back."
          : "The clock keeps running, and the server keeps your round for 3 minutes."}{" "}
        Try {screen.attempt} of {LOST_TRIES}.
      </span>
      <TileTimer total={10} left={screen.tilesLeft} size={9} onDark className="self-start" />
    </div>
  );
}
