import { AskPanel, QuestionLog } from "./AskPanel.tsx";
import { cn } from "./cn.ts";
import { useGame, type World } from "./game.ts";
import { TravelPanel } from "./TravelPanel.tsx";
import { ActionButton, Bullets, routesFor } from "./ui.tsx";
import { formatClock, useGameTime } from "./useGameTime.ts";

/** "47 min" or "1 h 27 min". */
function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  return min < 60
    ? `${min} min`
    : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

function RoundBar({ t }: { t: number }) {
  const view = useGame((s) => s.view);
  if (!view || view.result) return null;
  const left = Math.max(0, view.seekEnd - t);
  return (
    <div className="mx-4 mb-3 grid grid-cols-3 gap-2 rounded-lg bg-stone-100 px-3 py-2 text-center">
      <div>
        <div className="text-lg font-semibold tabular-nums">{view.candidates.length}</div>
        <div className="text-[11px] text-stone-500">stations possible</div>
      </div>
      <div>
        <div className="text-lg font-semibold tabular-nums">{formatDuration(left)}</div>
        <div className="text-[11px] text-stone-500">left to find it</div>
      </div>
      <div>
        <div className="text-lg font-semibold tabular-nums">+{view.bonusSeconds / 60}</div>
        <div className="text-[11px] text-stone-500">hider bonus (min)</div>
      </div>
    </div>
  );
}

function ResultCard({ world }: { world: World }) {
  const { view, send, busy } = useGame();
  if (!view?.result || view.hider === null) return null;
  const hider = world.ds.complexes[view.hider];
  const elapsed = view.result.at - view.seekStart;
  const found = view.result.kind === "found";
  return (
    <div className={cn("mx-4 mb-3 rounded-lg px-4 py-3", found ? "bg-amber-50" : "bg-stone-100")}>
      <div className="text-lg font-semibold">{found ? "Found it!" : "Time's up"}</div>
      <div className="mt-1 flex items-center gap-1.5 text-sm">
        The hider was at <span className="font-semibold">{hider?.name}</span>
        {hider && <Bullets routes={routesFor(world, hider.routes)} />}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[11px] text-stone-500">{found ? "found in" : "searched"}</dt>
          <dd className="font-semibold">{formatDuration(elapsed)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-stone-500">questions</dt>
          <dd className="font-semibold">
            {view.asked.length} (+{view.bonusSeconds / 60} min)
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-stone-500">hider score</dt>
          <dd className="font-semibold">{formatDuration(elapsed + view.bonusSeconds)}</dd>
        </div>
      </dl>
      <div className="mt-3">
        <ActionButton disabled={busy} onClick={() => send({ type: "newRound" })}>
          Play again
        </ActionButton>
      </div>
    </div>
  );
}

function Tabs() {
  const { tab, setTab, view, follow, setFollow } = useGame();
  const tabClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1 text-sm font-semibold",
      active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100",
    );
  return (
    <div className="flex items-center gap-1 border-b border-stone-200 px-4 pb-2">
      <button type="button" className={tabClass(tab === "travel")} onClick={() => setTab("travel")}>
        Travel
      </button>
      <button type="button" className={tabClass(tab === "ask")} onClick={() => setTab("ask")}>
        Ask{view?.asked.length ? ` (${view.asked.length})` : ""}
      </button>
      <span className="flex-1" />
      <ActionButton quiet onClick={() => setFollow(!follow)}>
        {follow ? "Following you" : "Follow me"}
      </ActionButton>
    </div>
  );
}

export function Panel() {
  const { status, error, world, view, notice, dismissNotice, tab } = useGame();
  const t = useGameTime(4);
  const ready = status === "ready" && world && view && t !== null;

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-stone-200 bg-white">
      <header className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1">
          <div className="text-sm font-bold tracking-tight">Stand Clear</div>
          <div className="text-xs text-stone-500">Find the hider's station · solo vs bot</div>
        </div>
        {t !== null && (
          <div className="text-right">
            <div className="font-mono text-lg font-semibold tabular-nums">{formatClock(t)}</div>
            <div className="text-[11px] text-stone-500">6× real time</div>
          </div>
        )}
      </header>
      {ready && <RoundBar t={t} />}
      {ready && <ResultCard world={world} />}
      {ready && <Tabs />}
      {notice && (
        <button
          type="button"
          onClick={dismissNotice}
          className="mx-4 mt-3 rounded-md bg-red-50 px-3 py-2 text-left text-sm text-red-800"
        >
          {notice}
        </button>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pt-3 pb-6">
        {status === "loading" && (
          <p className="px-4 text-sm text-stone-500">Loading the timetable…</p>
        )}
        {status === "connecting" && <p className="px-4 text-sm text-stone-500">Connecting…</p>}
        {status === "error" && <p className="px-4 text-sm text-red-700">{error}</p>}
        {ready &&
          (view.result ? (
            <QuestionLog world={world} />
          ) : tab === "travel" ? (
            <TravelPanel world={world} t={t} />
          ) : (
            <AskPanel world={world} t={t} />
          ))}
      </div>
    </aside>
  );
}
