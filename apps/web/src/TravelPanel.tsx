/**
 * The Travel tab (DESIGN.md, Sidebar; the Deck page, parts four and five): where you are
 * as the station's name tablet, the departures as the platform's countdown clock, the stop
 * list on a train with your stop in the express band and the connections there, and the
 * exit on the street. Each state's one main action sits on the wainscot (travelAction).
 */
import {
  ENTER_SECONDS,
  EXIT_SECONDS,
  lastStation,
  type OnPlatform,
  type OnStreet,
  type OnTrain,
  resolve,
  type SoloView,
  streetPoint,
  type Walking,
  walkSeconds,
} from "@stand-clear/engine";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { hhmm } from "./ask.ts";
import { type CountdownLine, connectionsBoard, platformBoard } from "./boards.ts";
import { cn } from "./cn.ts";
import { useGame, useGamePick, type World } from "./game.ts";
import { isHider, ownTransit } from "./hide.ts";
import { displayName } from "./names.ts";
import { routesFor } from "./routes.ts";
import { play } from "./sound.ts";
import { NameTablet } from "./ui/NameTablet.tsx";
import {
  Bullets,
  Button,
  CountdownBoard,
  CountdownHeader,
  CountdownRow,
  Line,
  RouteBullet,
  Rule,
  TileTimer,
  WainscotText,
} from "./ui/vocab.tsx";
import { LINES, lineFor, roundKey } from "./voice.ts";

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));
/** Where-you-are tablets share one tile size, so a short name makes a short tablet. */
export const TABLET_TILE = 3.1;

/** Where you are: the station's mosaic name tablet on a tile field, with its bullets. */
function Where({
  world,
  complex,
  sub,
  routes,
  line,
}: {
  world: World;
  complex: number;
  sub: ReactNode;
  routes?: string[];
  /** The conductor's line for this moment, if it has one (Voice). */
  line?: string | null;
}) {
  const c = world.ds.complexes[complex];
  if (!c) return null;
  return (
    <div className="sc-tilefield mx-4 mt-3 flex flex-col items-center gap-2 px-2.5 pt-3 pb-2.5 shadow-[inset_0_0_0_1px_var(--color-grout)]">
      <NameTablet text={displayName(c.name)} tile={TABLET_TILE} maxWidth={320} />
      <div className="flex flex-wrap items-center justify-center gap-2 text-[12.5px] text-ink-2">
        {routes && <Bullets routes={routesFor(world, routes)} size={18} />}
        <span>{sub}</span>
      </div>
      {line && <Line>{line}</Line>}
    </div>
  );
}

function Row({
  line,
  onBoard,
  keys,
}: {
  line: CountdownLine;
  onBoard?: () => void;
  keys?: string;
}) {
  return (
    <CountdownRow
      route={line.route}
      dest={line.dest}
      time={line.note ? `${hhmm(line.first.dep)} · ${line.note}` : hhmm(line.first.dep)}
      minutes={line.minutes}
      then={line.thenMinutes}
      reason={line.reason}
      struck={line.struck}
      onBoard={onBoard}
      keys={keys}
    />
  );
}

// --- Platform -------------------------------------------------------------------------

function PlatformView({
  world,
  state,
  t,
  view,
}: {
  world: World;
  state: OnPlatform;
  t: number;
  view: SoloView;
}) {
  const { send, busy } = useGamePick("send", "busy");
  const st = world.ds.stations[state.station];
  if (!st) return null;
  const groups = platformBoard(world.idx, state, t, isHider(view) ? [] : view.curses);
  const transfers = world.idx.transfersFrom[state.station] ?? [];
  const firstBoardable = groups.flatMap((g) => g.lines).find((l) => !l.reason);
  // The round opens: the daily's line, or in practice the trains' (Voice).
  const opening =
    !isHider(view) &&
    view.asked.length === 0 &&
    state.station === view.hub &&
    t < view.seekStart + 15 * 60;
  const openLine = view.daily ? "dailyOpens" : "trainsOpen";
  return (
    <>
      <Where
        world={world}
        complex={st.complex}
        sub="On the platform"
        routes={st.routes}
        line={opening && lineFor(roundKey(view), openLine, "start") ? LINES[openLine] : null}
      />
      {groups.length === 0 ? (
        <p className="mx-4 mt-3 text-[13px] text-ink-2">No trains in the next 30 min.</p>
      ) : (
        <div className="mx-4 mt-2.5">
          <CountdownBoard label="Departures">
            {groups.map((g, i) => (
              <div key={g.dir}>
                <CountdownHeader note={i === 0 ? "Next two" : undefined}>
                  {g.dir === 0 ? "↑" : "↓"} {g.label}
                </CountdownHeader>
                {g.lines.map((l) => (
                  <Row
                    key={`${l.route.id}|${l.dir}`}
                    line={l}
                    keys={l === firstBoardable ? "B" : undefined}
                    onBoard={
                      busy
                        ? undefined
                        : () => send({ type: "board", trip: l.first.trip, stop: l.first.stop })
                    }
                  />
                ))}
              </div>
            ))}
          </CountdownBoard>
        </div>
      )}
      {transfers.length > 0 && (
        <section className="px-4 pt-4">
          <Rule>Change on foot</Rule>
          {transfers.map((x) => {
            const to = world.ds.stations[x.to];
            if (!to) return null;
            // Lead with the lines: most platforms in a complex share the station's name.
            const sameName = displayName(to.name) === displayName(st?.name ?? "");
            const letters = to.routes.join(" ");
            return (
              <div
                key={x.to}
                className="flex items-center gap-2.5 border-b border-dashed border-grout py-1.5 text-[13.5px]"
              >
                <Bullets routes={routesFor(world, to.routes)} size={18} />
                <span className={cn("min-w-0 flex-1", sameName ? "text-ink-2" : "font-semibold")}>
                  {sameName ? "platform" : displayName(to.name)}
                </span>
                <span className="text-[12px] text-ink-2 tabular-nums">
                  {minutes(x.seconds)} min
                </span>
                <Button
                  small
                  disabled={busy || (isHider(view) && t + x.seconds > view.seekStart)}
                  reason={
                    isHider(view) && t + x.seconds > view.seekStart
                      ? "That transfer arrives after 10:20."
                      : undefined
                  }
                  label={`Walk to the ${letters} platform${sameName ? "" : ` at ${displayName(to.name)}`}`}
                  onClick={() => send({ type: "transfer", to: x.to })}
                >
                  Walk
                </Button>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

/** The exit nearest the platform: where "Up to the street" comes up. */
function nearestExit(world: World, station: number): number {
  const st = world.ds.stations[station];
  const complex = st ? world.ds.complexes[st.complex] : undefined;
  if (!st || !complex) return 0;
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  complex.exits.forEach(([lat, lon], i) => {
    const d = (lat - st.lat) ** 2 + (lon - st.lon) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// --- Train ----------------------------------------------------------------------------

/** The next stop the train will reach, or is standing at. */
function nextStop(world: World, state: OnTrain, t: number): number {
  const trip = world.ds.trips[state.trip];
  if (!trip) return state.to;
  const last = trip.stops.length - 1;
  let next = state.from + 1;
  while (next < last && (trip.arr[next] as number) <= t) next++;
  return next;
}

function TrainView({ world, state, t }: { world: World; state: OnTrain; t: number }) {
  const { send, busy } = useGamePick("send", "busy");
  const speed = useGame((s) => s.sync?.speed ?? 6);
  const view = useGame((s) => s.view);
  const deadline = isHider(view) ? view.seekStart : null;
  const deadlineStation = deadline === null ? null : lastStation(state, deadline, world.idx);
  const [allStops, setAllStops] = useState(false);
  const trip = world.ds.trips[state.trip];
  const route = trip && world.ds.routes[trip.route];
  // The chime, if it's on, as your own train leaves (not when a refresh finds you riding).
  const depAt = trip?.dep[state.from];
  const departed = depAt !== undefined && t >= depAt;
  const heardDep = useRef(departed);
  useEffect(() => {
    if (departed && !heardDep.current) play("chime");
    heardDep.current = departed;
  }, [departed]);
  if (!trip || !route) return null;
  const nameOf = (k: number) => displayName(world.ds.stations[trip.stops[k] as number]?.name ?? "");
  const waiting = t < (trip.dep[state.from] as number);
  const next = nextStop(world, state, t);
  const from = world.ds.stations[trip.stops[state.from] as number];
  const dirLabel = trip.dir === 0 ? from?.northLabel : from?.southLabel;
  const status = waiting
    ? `leaves in ${minutes((trip.dep[state.from] as number) - t)} min`
    : (trip.arr[next] as number) - t < 60
      ? `arriving at ${nameOf(next)}`
      : `next: ${nameOf(next)} in ${minutes((trip.arr[next] as number) - t)} min`;
  const connections = connectionsBoard(world.idx, state);
  // Arrive and depart (Motion): the platform's tablet brakes in from the right over the
  // last 900 ms before the train stops, and accelerates out to the left as it leaves.
  const realMs = (gameSeconds: number) => (gameSeconds * 1000) / speed;
  const sinceDep = realMs(t - (trip.dep[state.from] as number));
  const toArr = realMs((trip.arr[state.to] as number) - t);
  const fromSt = world.ds.stations[trip.stops[state.from] as number];
  const toSt = world.ds.stations[trip.stops[state.to] as number];
  const last = trip.stops.length - 1;
  // The stops up to yours and three after, so the connections stay in view; the rest fold.
  const first = waiting ? state.from + 1 : next;
  const shownTo = Math.min(last, Math.max(state.to === last ? first + 5 : state.to + 3, first + 3));
  const stops: number[] = [];
  for (let k = first; k <= (allStops ? last : shownTo); k++) stops.push(k);
  const folded = last - shownTo;
  return (
    <div className="relative">
      {waiting && fromSt ? (
        <>
          {/* Still at the platform: its tablet, and the train you boarded as the express band. */}
          <Where world={world} complex={fromSt.complex} sub="On the train" routes={fromSt.routes} />
          <div className="sc-express-ink sc-grid-lines sc-anim-unroll mx-4 mt-2.5">
            <div className="flex items-center gap-2.5">
              <RouteBullet route={route} size={22} />
              <b className="min-w-0 flex-1 truncate font-text text-[13.5px] font-semibold tracking-normal normal-case">
                {displayName(trip.headsign)}
              </b>
              <span className="font-display text-[12px] font-bold tracking-[0.08em] uppercase">
                Boarded · {status}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 px-4 pt-3.5">
          <RouteBullet route={route} size={30} />
          <div className="min-w-0">
            <b className="block truncate text-[17px] leading-tight font-bold">
              {displayName(trip.headsign)}
            </b>
            <span className="text-[12px] text-ink-2">
              {dirLabel} · {status}
            </span>
          </div>
        </div>
      )}
      {!waiting && sinceDep >= 0 && sinceDep < 600 && fromSt && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
          <div className="sc-anim-depart" style={{ animationDelay: `-${Math.round(sinceDep)}ms` }}>
            <Where
              world={world}
              complex={fromSt.complex}
              sub="On the train"
              routes={fromSt.routes}
            />
          </div>
        </div>
      )}
      {toArr > 0 && toArr <= 900 && toSt && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
          <div
            className="sc-anim-brake"
            style={{ animationDelay: `-${Math.round(900 - toArr)}ms` }}
          >
            <Where
              world={world}
              complex={toSt.complex}
              sub="On the platform"
              routes={toSt.routes}
            />
          </div>
        </div>
      )}
      <section className="px-4 pt-3">
        <Rule>Stops</Rule>
        {stops.map((k) => {
          const st = world.ds.stations[trip.stops[k] as number];
          const time = hhmm(trip.arr[k] as number);
          if (deadline !== null && (trip.arr[k] as number) > deadline) {
            const firstLate = k === first || (trip.arr[k - 1] as number) <= deadline;
            return (
              <div key={k}>
                {firstLate && <div className="sc-hide-deadline">10:20 · Time’s up</div>}
                <div className="flex gap-3 border-b border-dashed border-grout py-2 text-[13px] text-ink-3">
                  <span>{time}</span>
                  {nameOf(k)}
                </div>
              </div>
            );
          }
          if (k === state.to) {
            // The stop you're getting off at is the one express band.
            return (
              <div
                key={k}
                className="sc-grid-lines -mx-1.5 my-1.5 flex min-h-9 items-center gap-2.5 bg-ink px-2.5 py-3 text-[13.5px] text-glaze-hi shadow-[0_-4px_0_var(--color-buff-deep),0_4px_0_var(--color-buff-deep)] [--grid:0.12]"
              >
                <span className="w-[38px] flex-none text-[12px] text-[#cfc6b4] tabular-nums">
                  {time}
                </span>
                <b className="font-semibold">{nameOf(k)}</b>
                <span className="ml-auto font-display text-[12px] font-bold tracking-[0.08em] uppercase">
                  {k === last ? "Last stop" : "Getting off"}
                </span>
              </div>
            );
          }
          return (
            <div
              key={k}
              className="flex min-h-9 items-center gap-2.5 border-b border-dashed border-grout py-1.5 text-[13.5px]"
            >
              <span className="w-[38px] flex-none text-[12px] text-ink-2 tabular-nums">{time}</span>
              <b className="min-w-0 truncate font-semibold">{nameOf(k)}</b>
              <span className="flex-1 [&_.sc-rbs]:flex-nowrap">
                {st && <Bullets routes={routesFor(world, st.routes)} size={18} />}
              </span>
              <Button
                small
                disabled={busy}
                label={`Get off at ${nameOf(k)}`}
                onClick={() => send({ type: "alightAt", stop: k })}
              >
                Get off
              </Button>
            </div>
          );
        })}
        {folded > 0 && (
          <button
            type="button"
            className="sc-focus w-full py-2 text-left text-[12.5px] text-ink-2 underline decoration-grout underline-offset-2"
            onClick={() => setAllStops(!allStops)}
          >
            {allStops
              ? "Fewer stops"
              : `${folded} more ${folded === 1 ? "stop" : "stops"} to ${nameOf(last)}`}
          </button>
        )}
      </section>
      {deadline !== null && deadlineStation !== null && (
        <p className="px-4 pt-3 text-[12px] text-ink-2">
          Stay on past 10:20 and your station is{" "}
          <b>{displayName(world.ds.stations[deadlineStation]?.name ?? "")}</b>.
        </p>
      )}
      {connections && connections.lines.length > 0 && (
        <div className="mx-4 mt-3">
          <CountdownBoard label={`Connections at ${nameOf(state.to)}`}>
            <CountdownHeader note={`around ${hhmm(connections.arrival)}`}>
              Connections at {nameOf(state.to)}
            </CountdownHeader>
            {connections.lines.map((l) => (
              <Row key={`${l.route.id}|${l.dir}|${l.first.stop}`} line={l} />
            ))}
          </CountdownBoard>
        </div>
      )}
    </div>
  );
}

// --- Walking --------------------------------------------------------------------------

/** Stair treads that fill one per 10 game-s while you go up or down (Motion: Up to the street). */
function Treads({ state, t }: { state: Walking; t: number }) {
  const total = Math.max(1, Math.round((state.end - state.start) / 10));
  const done = Math.min(total, Math.floor((t - state.start) / 10));
  return <TileTimer total={total} left={done} size={11} />;
}

function WalkingView({ world, state, t }: { world: World; state: Walking; t: number }) {
  // Seconds count down in real time, like the walking band and the answer window.
  const speed = useGame((s) => s.sync?.speed ?? 6);
  const view = useGame((s) => s.view);
  const stairs =
    state.reason === "exit" && view && lineFor(roundKey(view), "upToStreet", state.start);
  const left = Math.max(0, Math.ceil((state.end - t) / speed));
  const dest = state.dest;
  const complex = dest.kind === "street" ? dest.complex : world.ds.stations[dest.station]?.complex;
  const title =
    state.reason === "exit"
      ? "Up to the street"
      : state.reason === "enter"
        ? "Back down"
        : state.reason === "street"
          ? "Walking"
          : `Walking to ${displayName(dest.kind === "platform" ? (world.ds.stations[dest.station]?.name ?? "") : "")}`;
  return (
    <>
      {complex !== undefined && (
        <Where
          world={world}
          complex={complex}
          sub={dest.kind === "street" ? `Exit ${dest.exit + 1}` : "Heading in"}
          line={stairs ? LINES.upToStreet : null}
        />
      )}
      <section className="px-4 pt-4">
        <Rule>{title}</Rule>
        <div className="flex items-center justify-between gap-2.5 text-[13px]">
          {state.reason === "street" ? (
            <span className="text-ink-2">Every step is timed at walking speed.</span>
          ) : (
            <Treads state={state} t={t} />
          )}
          <span className="text-ink-2 tabular-nums">{left} s</span>
        </div>
      </section>
    </>
  );
}

// --- Street ---------------------------------------------------------------------------

/** Back down: the walk to the nearest exit and the 2 minutes in. */
function backDownMinutes(world: World, state: OnStreet): number {
  const complex = world.ds.complexes[state.complex];
  if (!complex) return minutes(ENTER_SECONDS);
  const here = streetPoint(state, world.idx);
  const walk = Math.min(...complex.exits.map(([lat, lon]) => walkSeconds(here, { lat, lon })));
  return minutes(walk + ENTER_SECONDS);
}

/** The platform to go back down to: the nearest one to where you stand. */
function nearestStation(world: World, state: OnStreet): number | null {
  const complex = world.ds.complexes[state.complex];
  if (!complex) return null;
  const here = streetPoint(state, world.idx);
  let best: number | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const s of complex.stations) {
    const st = world.ds.stations[s];
    if (!st) continue;
    const d = (st.lat - here.lat) ** 2 + (st.lon - here.lon) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function StreetPanel({ world, state, view }: { world: World; state: OnStreet; view: SoloView }) {
  const { send, busy } = useGamePick("send", "busy");
  const complex = world.ds.complexes[state.complex];
  if (!complex) return null;
  const others = complex.stations.length > 1 ? complex.stations : [];
  return (
    <>
      <Where world={world} complex={state.complex} sub={`On the street · Exit ${state.exit + 1}`} />
      <p className="px-4 pt-3 text-[13px] leading-[1.45] text-ink-2">
        {view.hasSpot
          ? "Pick a direction on Street View, or click the map, to walk. Every step is timed at walking speed. The hider appears once you pass within 40 m, and you catch them within 25 m."
          : "Look around in Street View. Walk with the direction tiles or by clicking the map."}
      </p>
      {others.length > 0 && (
        <section className="px-4 pt-4">
          {/* One time for all: going down is the walk to the nearest entrance plus the stairs, whichever platform. */}
          <Rule>Back down to · {backDownMinutes(world, state)} min</Rule>
          {others.map((s) => {
            const st = world.ds.stations[s];
            if (!st) return null;
            return (
              <div
                key={s}
                className="flex items-center gap-2.5 border-b border-dashed border-grout py-1.5 text-[13.5px]"
              >
                <span className="flex-1">
                  <Bullets routes={routesFor(world, st.routes)} size={18} />
                </span>
                <Button
                  small
                  disabled={busy}
                  label={`Back down to the ${st.routes.join(" ")} platform`}
                  onClick={() => send({ type: "enter", station: s })}
                >
                  Enter
                </Button>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

/** The Travel tab: whatever you can do from where you are right now. */
export function TravelPanel({ world, t }: { world: World; t: number }) {
  const view = useGame((s) => s.view);
  if (!view) return null;
  const s = resolve(ownTransit(view), t, world.idx);
  switch (s.kind) {
    case "platform":
      return <PlatformView world={world} state={s} t={t} view={view} />;
    case "train":
      return <TrainView world={world} state={s} t={t} />;
    case "walking":
      return <WalkingView world={world} state={s} t={t} />;
    case "street":
      return <StreetPanel world={world} state={s} view={view} />;
  }
}

/**
 * The one main action for where you are, for the wainscot: Up to the street, Get off at
 * the next stop (or Stay on past it), Back down. Back down is white, because staying up
 * is usually the point.
 */
export function TravelAction({ world, t }: { world: World; t: number }) {
  const { view, send, busy } = useGamePick("view", "send", "busy");
  if (!view) return null;
  const s = resolve(ownTransit(view), t, world.idx);
  switch (s.kind) {
    case "platform":
      if (isHider(view)) return <WainscotText>Exits open at 10:20.</WainscotText>;
      return (
        <>
          <Button
            kind="ink"
            disabled={busy}
            onClick={() => send({ type: "exit", exit: nearestExit(world, s.station) })}
          >
            Up to the street
          </Button>
          <WainscotText>{minutes(EXIT_SECONDS)} min</WainscotText>
        </>
      );
    case "train": {
      const trip = world.ds.trips[s.trip];
      if (!trip) return null;
      const nameOf = (k: number) =>
        displayName(world.ds.stations[trip.stops[k] as number]?.name ?? "");
      const last = trip.stops.length - 1;
      if (t < (trip.dep[s.from] as number)) {
        return (
          <>
            <Button disabled={busy} onClick={() => send({ type: "cancelBoard" })}>
              Get off
            </Button>
            <WainscotText>
              It leaves in {minutes((trip.dep[s.from] as number) - t)} min
            </WainscotText>
          </>
        );
      }
      const next = nextStop(world, s, t);
      if (s.to === next && next < last) {
        return (
          <Button disabled={busy} onClick={() => send({ type: "alightAt", stop: last })}>
            Stay on past {nameOf(next)}
          </Button>
        );
      }
      if (s.to === next) return <WainscotText>Last stop: {nameOf(next)}</WainscotText>;
      return (
        <Button kind="ink" disabled={busy} onClick={() => send({ type: "alightAt", stop: next })}>
          Get off at {nameOf(next)}
        </Button>
      );
    }
    case "walking":
      // The panel and the pane count the seconds; the wainscot only names the walk.
      return (
        <WainscotText>
          {s.reason === "exit"
            ? "Up to the street"
            : s.reason === "enter"
              ? "Back down"
              : s.reason === "street"
                ? "Walking"
                : "Changing on foot"}
        </WainscotText>
      );
    case "street": {
      const station = nearestStation(world, s);
      return (
        <>
          <Button
            disabled={busy || station === null}
            onClick={() => station !== null && send({ type: "enter", station })}
          >
            Back down
          </Button>
          <WainscotText>{backDownMinutes(world, s)} min</WainscotText>
        </>
      );
    }
  }
}
