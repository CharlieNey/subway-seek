import type { Direction, Route } from "@stand-clear/data";
import {
  departures,
  type OnPlatform,
  type OnStreet,
  type OnTrain,
  resolve,
  type Walking,
} from "@stand-clear/engine";
import type { ReactNode } from "react";
import { cn } from "./cn.ts";
import { useGame, type World } from "./game.ts";
import { RouteBullet } from "./RouteBullet.tsx";
import { formatClock, formatIn, useGameTime } from "./useGameTime.ts";

const routesFor = ({ ds }: World, letters: string[]): Route[] =>
  letters.map((l) => ds.routes.find((r) => r.letter === l)).filter((r) => r !== undefined);

function Bullets({ routes }: { routes: Route[] }) {
  return (
    <span className="inline-flex gap-0.5">
      {routes.map((r) => (
        <RouteBullet key={r.id} route={r} size="sm" />
      ))}
    </span>
  );
}

function StationName({ world, station }: { world: World; station: number }) {
  const st = world.ds.stations[station];
  if (!st) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{st.name}</span>
      <Bullets routes={routesFor(world, st.routes)} />
    </span>
  );
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-stone-200 px-4 py-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  quiet,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        quiet
          ? "border border-stone-300 text-stone-700 hover:bg-stone-100"
          : "bg-stone-900 text-white hover:bg-stone-700",
      )}
    >
      {children}
    </button>
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
  const status = waiting
    ? `leaves in ${formatIn(trip.dep[state.from] as number, t)}`
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
      <div className="mt-1 text-xs text-stone-500">{Math.ceil(left / 60)} game min left</div>
    </div>
  );
}

function StreetView({ world, state }: { world: World; state: OnStreet }) {
  const { send, busy } = useGame();
  const complex = world.ds.complexes[state.complex];
  if (!complex) return null;
  return (
    <>
      <div className="px-4 pb-3">
        <div className="text-xs text-stone-500">On the street at</div>
        <div className="text-lg font-semibold">{complex.name}</div>
        <p className="mt-1 text-xs text-stone-500">
          Walking around the neighborhood arrives with Street View (M4).
        </p>
      </div>
      <Section title="Go back down">
        <ul className="space-y-1.5">
          {complex.stations.map((s) => (
            <li key={s} className="flex items-center gap-2 text-sm">
              <span className="flex-1">
                <StationName world={world} station={s} />
              </span>
              <span className="text-xs text-stone-500">2 min</span>
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

// --- Panel ------------------------------------------------------------------------

export function Panel() {
  const { status, error, world, state, notice, dismissNotice, follow, setFollow } = useGame();
  const t = useGameTime(4);

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-stone-200 bg-white">
      <header className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1">
          <div className="text-sm font-bold tracking-tight">Stand Clear</div>
          <div className="text-xs text-stone-500">
            Transit sandbox · {world?.ds.meta.serviceDate}
          </div>
        </div>
        {t !== null && (
          <div className="text-right">
            <div className="font-mono text-lg font-semibold tabular-nums">{formatClock(t)}</div>
            <div className="text-[11px] text-stone-500">6× real time</div>
          </div>
        )}
      </header>
      <div className="flex items-center gap-2 px-4 pb-3">
        <ActionButton quiet onClick={() => setFollow(!follow)}>
          {follow ? "Following you" : "Follow me"}
        </ActionButton>
      </div>
      {notice && (
        <button
          type="button"
          onClick={dismissNotice}
          className="mx-4 mb-3 rounded-md bg-red-50 px-3 py-2 text-left text-sm text-red-800"
        >
          {notice}
        </button>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {status === "loading" && (
          <p className="px-4 text-sm text-stone-500">Loading the timetable…</p>
        )}
        {status === "connecting" && <p className="px-4 text-sm text-stone-500">Connecting…</p>}
        {status === "error" && <p className="px-4 text-sm text-red-700">{error}</p>}
        {status === "ready" &&
          world &&
          state &&
          t !== null &&
          (() => {
            const s = resolve(state, t, world.idx);
            switch (s.kind) {
              case "platform":
                return <PlatformView world={world} state={s} t={t} />;
              case "train":
                return <TrainView world={world} state={s} t={t} />;
              case "walking":
                return <WalkingView world={world} state={s} t={t} />;
              case "street":
                return <StreetView world={world} state={s} />;
            }
          })()}
      </div>
    </aside>
  );
}
