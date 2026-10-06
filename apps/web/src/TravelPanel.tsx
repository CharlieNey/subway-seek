import type { Direction } from "@stand-clear/data";
import {
  departures,
  ENTER_SECONDS,
  type OnPlatform,
  type OnStreet,
  type OnTrain,
  resolve,
  streetPoint,
  type Walking,
  walkSeconds,
} from "@stand-clear/engine";
import { cn } from "./cn.ts";
import { useGame, type World } from "./game.ts";
import { RouteBullet } from "./RouteBullet.tsx";
import { ActionButton, Section, StationName } from "./ui.tsx";
import { formatClock, formatIn } from "./useGameTime.ts";

/** Fast-forward to the next thing that happens. Score is game time, so it never helps or hurts. */
function SkipButton({ to, children }: { to: "next" | "end"; children: React.ReactNode }) {
  const { send, busy } = useGame();
  return (
    <ActionButton quiet disabled={busy} onClick={() => send({ type: "skip", to })}>
      ⏩ {children}
    </ActionButton>
  );
}

// --- Platform -------------------------------------------------------------------

function PlatformView({ world, state, t }: { world: World; state: OnPlatform; t: number }) {
  const { send, busy } = useGame();
  const st = world.ds.stations[state.station];
  const complex = st ? world.ds.complexes[st.complex] : undefined;
  if (!st || !complex) return null;
  const board = departures(world.idx, state.station, t, { horizon: 30 * 60, limit: 60 });
  const changeBy = state.since + (world.idx.selfTransfer[state.station] ?? 0);
  const transfers = world.idx.transfersFrom[state.station] ?? [];
  // Nearest exit to this platform.
  let nearestExit = 0;
  let best = Number.POSITIVE_INFINITY;
  complex.exits.forEach(([lat, lon], i) => {
    const d = (lat - st.lat) ** 2 + (lon - st.lon) ** 2;
    if (d < best) {
      best = d;
      nearestExit = i;
    }
  });

  const directionList = (dir: Direction, label: string) => {
    const list = board.filter((d) => d.dir === dir).slice(0, 8);
    return (
      <Section title={label}>
        {list.length === 0 && (
          <p className="text-sm text-stone-500">No trains in the next 30 min.</p>
        )}
        <ul className="space-y-1.5">
          {list.map((d) => {
            const tooSoon =
              state.arrivedDir !== null && state.arrivedDir !== d.dir && d.dep < changeBy;
            return (
              <li key={`${d.trip}-${d.stop}`} className="flex items-center gap-2">
                <RouteBullet route={d.route} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.headsign}</div>
                  <div className="text-xs text-stone-500">
                    {formatClock(d.dep).slice(0, 5)} · {formatIn(d.dep, t)}
                    {tooSoon && " · too soon to change platforms"}
                  </div>
                </div>
                <ActionButton
                  disabled={busy || tooSoon}
                  onClick={() => send({ type: "board", trip: d.trip, stop: d.stop })}
                >
                  Board
                </ActionButton>
              </li>
            );
          })}
        </ul>
      </Section>
    );
  };

  return (
    <>
      <div className="px-4 pb-3">
        <div className="text-xs text-stone-500">On the platform at</div>
        <div className="text-lg font-semibold">
          <StationName world={world} station={state.station} />
        </div>
      </div>
      {directionList(0, st.northLabel)}
      {directionList(1, st.southLabel)}
      {transfers.length > 0 && (
        <Section title="Transfer on foot">
          <ul className="space-y-1.5">
            {transfers.map((x) => (
              <li key={x.to} className="flex items-center gap-2 text-sm">
                <div className="flex-1">
                  <StationName world={world} station={x.to} />
                </div>
                <span className="text-xs text-stone-500">{Math.ceil(x.seconds / 60)} min</span>
                <ActionButton
                  quiet
                  disabled={busy}
                  onClick={() => send({ type: "transfer", to: x.to })}
                >
                  Walk
                </ActionButton>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Street">
        <div className="flex items-center gap-2 text-sm">
          <span className="flex-1">Go up to the street at {complex.name}</span>
          <span className="text-xs text-stone-500">2 min</span>
          <ActionButton
            quiet
            disabled={busy}
            onClick={() => send({ type: "exit", exit: nearestExit })}
          >
            Exit
          </ActionButton>
        </div>
      </Section>
    </>
  );
}

// --- Train ----------------------------------------------------------------------

function TrainView({ world, state, t }: { world: World; state: OnTrain; t: number }) {
  const { send, busy } = useGame();
  const trip = world.ds.trips[state.trip];
  const route = trip && world.ds.routes[trip.route];
  if (!trip || !route) return null;
  const waiting = t < (trip.dep[state.from] as number);
  const last = trip.stops.length - 1;
  // Index of the next stop the train will reach (or is standing at).
  let next = state.from + 1;
  while (next < last && (trip.arr[next] as number) <= t) next++;
  const prev = next - 1;
  const dwelling =
    !waiting &&
    prev > state.from &&
    (trip.arr[prev] as number) <= t &&
    t < (trip.dep[prev] as number);
  const nameOf = (k: number) => world.ds.stations[trip.stops[k] as number]?.name ?? "";
  const leavesIn = formatIn(trip.dep[state.from] as number, t);
  const status = waiting
    ? leavesIn === "now"
      ? "leaves now"
      : `leaves in ${leavesIn}`
    : dwelling
      ? `at ${nameOf(prev)} · doors open`
      : (trip.arr[next] as number) - t < 60
        ? `arriving at ${nameOf(next)}`
        : `next: ${nameOf(next)} in ${formatIn(trip.arr[next] as number, t)}`;
  const dirLabel =
    trip.dir === 0
      ? world.ds.stations[trip.stops[state.from] as number]?.northLabel
      : world.ds.stations[trip.stops[state.from] as number]?.southLabel;

  return (
    <>
      <div className="flex items-center gap-3 px-4 pb-3">
        <RouteBullet route={route} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{trip.headsign}</div>
          <div className="text-xs text-stone-500">
            {dirLabel} · {status}
          </div>
        </div>
        {waiting && (
          <ActionButton quiet disabled={busy} onClick={() => send({ type: "cancelBoard" })}>
            Cancel
          </ActionButton>
        )}
      </div>
      <div className="flex gap-2 px-4 pb-3">
        <SkipButton to="next">{waiting ? "Until it leaves" : "Next stop"}</SkipButton>
        {(waiting || next < state.to) && <SkipButton to="end">My stop</SkipButton>}
      </div>
      <Section title="Stops">
        <ol className="space-y-1">
          {trip.stops.map((s, k) => {
            if (k <= state.from) return null;
            const arr = trip.arr[k] as number;
            const leaves = k === last ? Number.POSITIVE_INFINITY : (trip.dep[k] as number);
            const passed = t >= leaves;
            const getOff = k === state.to;
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a stop's index is its identity within the trip
                key={k}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-sm",
                  passed && "text-stone-400",
                  getOff && "bg-amber-100",
                )}
              >
                <span className="w-11 text-xs tabular-nums text-stone-500">
                  {formatClock(arr).slice(0, 5)}
                </span>
                <span className="flex-1">
                  <StationName world={world} station={s} />
                </span>
                {getOff ? (
                  <span className="text-xs font-semibold text-amber-800">Getting off</span>
                ) : (
                  !passed && (
                    <ActionButton
                      quiet
                      disabled={busy}
                      onClick={() => send({ type: "alightAt", stop: k })}
                    >
                      Get off
                    </ActionButton>
                  )
                )}
              </li>
            );
          })}
        </ol>
      </Section>
    </>
  );
}

// --- Walking / street -------------------------------------------------------------

function WalkingView({ world, state, t }: { world: World; state: Walking; t: number }) {
  const left = Math.max(0, state.end - t);
  const pct = Math.min(100, ((t - state.start) / Math.max(1, state.end - state.start)) * 100);
  const dest = state.dest;
  const what =
    state.reason === "exit" ? (
      "Heading up to the street"
    ) : state.reason === "street" ? (
      "Walking"
    ) : dest.kind === "platform" ? (
      <>
        Walking to <StationName world={world} station={dest.station} />
      </>
    ) : (
      "Walking"
    );
  return (
    <div className="px-4 pb-4">
      <div className="text-lg font-semibold">{what}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded bg-stone-200">
        <div className="h-full bg-stone-900" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-stone-500">
        {Math.ceil(left / 60)} game min left
        <SkipButton to="end">Skip</SkipButton>
      </div>
    </div>
  );
}

function StreetPanel({ world, state }: { world: World; state: OnStreet }) {
  const { send, busy, view, setTab } = useGame();
  const complex = world.ds.complexes[state.complex];
  if (!complex) return null;
  // Going back down means walking to the nearest exit first.
  const here = streetPoint(state, world.idx);
  const backMin = Math.ceil(
    (Math.min(...complex.exits.map(([lat, lon]) => walkSeconds(here, { lat, lon }))) +
      ENTER_SECONDS) /
      60,
  );
  return (
    <>
      <div className="px-4 pb-3">
        <div className="text-xs text-stone-500">On foot near</div>
        <div className="text-lg font-semibold">{complex.name}</div>
        <p className="mt-1 text-sm text-stone-600">
          {view?.hasSpot
            ? "If the hider's here, they're inside the circle on the map, within ¼ mile of the station. Walk with the arrows or by clicking the map: you'll stop as soon as they're in sight (40 m), and the shading shows where they could still be."
            : "Look around in Street View; walk with the arrows or by clicking the map."}
        </p>
        {view?.hasSpot && (
          <div className="mt-2">
            <ActionButton quiet onClick={() => setTab("ask")}>
              Ask about their exact spot
            </ActionButton>
          </div>
        )}
      </div>
      <Section title="Go back down">
        <ul className="space-y-1.5">
          {complex.stations.map((s) => (
            <li key={s} className="flex items-center gap-2 text-sm">
              <span className="flex-1">
                <StationName world={world} station={s} />
              </span>
              <span className="text-xs text-stone-500">{backMin} min</span>
              <ActionButton
                quiet
                disabled={busy}
                onClick={() => send({ type: "enter", station: s })}
              >
                Enter
              </ActionButton>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/** The Travel tab: whatever you can do from where you are right now. */
export function TravelPanel({ world, t }: { world: World; t: number }) {
  const view = useGame((s) => s.view);
  if (!view) return null;
  const s = resolve(view.seeker, t, world.idx);
  switch (s.kind) {
    case "platform":
      return <PlatformView world={world} state={s} t={t} />;
    case "train":
      return <TrainView world={world} state={s} t={t} />;
    case "walking":
      return <WalkingView world={world} state={s} t={t} />;
    case "street":
      return <StreetPanel world={world} state={s} />;
  }
}
