import { useState } from "react";
import { AskPanel, QuestionLog } from "./AskPanel.tsx";
import { cn } from "./cn.ts";
import { hubName, useGame, type World } from "./game.ts";
import { dailyStats } from "./history.ts";
import { useReplay } from "./replay.ts";
import { formatMinutes, shareText } from "./share.ts";
import { TravelPanel } from "./TravelPanel.tsx";
import { ActionButton, Bullets, routesFor } from "./ui.tsx";
import { formatClock, useGameTime } from "./useGameTime.ts";

const formatDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

function RoundBar({ t }: { t: number }) {
  const { view, send, busy, sync } = useGame();
  if (!view || view.result) return null;
  const left = Math.max(0, view.seekEnd - t);
  const giveUp = () => {
    const note = view.daily ? " It counts as not found for today." : "";
    if (window.confirm(`Give up and see where the hider was?${note}`)) send({ type: "giveUp" });
  };
  const paused = sync?.paused ?? false;
  return (
    <div className="mx-4 mb-3">
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-stone-100 px-3 py-2 text-center">
        <div>
          <div className="text-lg font-semibold tabular-nums">{view.candidates.length}</div>
          <div className="text-[11px] text-stone-500">stations possible</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums">{formatMinutes(left)}</div>
          <div className="text-[11px] text-stone-500">left to find it</div>
        </div>
        <div>
          <div className="text-lg font-semibold tabular-nums">+{view.bonusSeconds / 60}</div>
          <div className="text-[11px] text-stone-500">hider bonus (min)</div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-end gap-3">
        {paused && <span className="mr-auto text-xs font-semibold text-amber-700">Paused</span>}
        {view.mode === "practice" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ type: paused ? "resume" : "pause" })}
            className="text-xs text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-stone-800"
          >
            {paused ? "Resume" : "Pause"}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={giveUp}
          className="text-xs text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-stone-800"
        >
          Give up
        </button>
      </div>
    </div>
  );
}

/** Start a daily or practice round; confirms before abandoning one in progress. */
function useNewRound() {
  const { view, send } = useGame();
  return (mode: "daily" | "practice") => {
    const inProgress = view && !view.result && view.asked.length > 0;
    if (inProgress && !window.confirm("Leave this round? It won't count.")) return;
    send({ type: "newRound", mode });
  };
}

function ShareButton() {
  const { view, world } = useGame();
  const [copied, setCopied] = useState(false);
  if (!view?.result) return null;
  return (
    <ActionButton
      onClick={() => {
        navigator.clipboard
          .writeText(shareText(view, hubName(world, view)))
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => window.prompt("Copy your result:", shareText(view, hubName(world, view))));
      }}
    >
      {copied ? "Copied!" : "Share result"}
    </ActionButton>
  );
}

function ResultCard({ world }: { world: World }) {
  const { view, busy, results, alreadyPlayed } = useGame();
  const newRound = useNewRound();
  if (!view?.result || view.hider === null) return null;
  const hider = world.ds.complexes[view.hider];
  const elapsed = view.result.at - view.seekStart;
  const found = view.result.kind === "found";
  const stats = dailyStats(results);
  return (
    <div className={cn("mx-4 mb-3 rounded-lg px-4 py-3", found ? "bg-amber-50" : "bg-stone-100")}>
      <div className="text-lg font-semibold">
        {view.daily ? `Daily #${view.daily.number}: ` : ""}
        {found ? "Found it!" : view.result.kind === "gaveUp" ? "You gave up" : "Time's up"}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
        The hider was at <span className="font-semibold">{hider?.name}</span>
        {hider && <Bullets routes={routesFor(world, hider.routes)} />}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[11px] text-stone-500">{found ? "found in" : "searched"}</dt>
          <dd className="font-semibold">{formatMinutes(elapsed)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-stone-500">questions</dt>
          <dd className="font-semibold">
            {view.asked.length} (+{view.bonusSeconds / 60} min)
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-stone-500">hider score</dt>
          <dd className="font-semibold">{formatMinutes(elapsed + view.bonusSeconds)}</dd>
        </div>
      </dl>
      {view.daily && (
        <p className="mt-2 text-xs text-stone-600">
          {alreadyPlayed
            ? "Played again: your first result today is the one that counts."
            : `Daily stats: ${stats.played} played · ${stats.found} found · streak ${stats.streak}`}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {view.replay && (
          <ActionButton onClick={() => useReplay.getState().open(world, view)}>
            Watch replay
          </ActionButton>
        )}
        <ShareButton />
        <ActionButton quiet disabled={busy} onClick={() => newRound("practice")}>
          {view.daily ? "Practice round" : "Play again"}
        </ActionButton>
        {!view.daily && (
          <ActionButton quiet disabled={busy} onClick={() => newRound("daily")}>
            Today's daily
          </ActionButton>
        )}
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

function ModeLine() {
  const { view, busy, alreadyPlayed, world } = useGame();
  const startName = hubName(world, view);
  const newRound = useNewRound();
  if (!view) return <div className="text-xs text-stone-500">Find the hider's station</div>;
  return (
    <div className="flex items-center gap-1.5 text-xs text-stone-500">
      <span>
        {view.daily
          ? `Daily #${view.daily.number} · ${formatDay(view.daily.date)}${alreadyPlayed ? " · played" : ""}`
          : "Practice round"}
        {startName ? ` · from ${startName}` : ""}
      </span>
      {!view.result && (
        <button
          type="button"
          disabled={busy}
          className="underline decoration-stone-300 underline-offset-2 hover:text-stone-800"
          onClick={() => newRound(view.daily ? "practice" : "daily")}
        >
          {view.daily ? "practice instead" : "today's daily"}
        </button>
      )}
    </div>
  );
}

export function Panel() {
  const { status, error, world, view, notice, dismissNotice, tab, alreadyPlayed } = useGame();
  const t = useGameTime(4);
  const ready = status === "ready" && world && view && t !== null;

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-stone-200 bg-white">
      <header className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1">
          <div className="text-sm font-bold tracking-tight">Stand Clear</div>
          <ModeLine />
        </div>
        {t !== null && (
          <div className="text-right">
            <div className="font-mono text-lg font-semibold tabular-nums">{formatClock(t)}</div>
            <div className="text-[11px] text-stone-500">6× real time</div>
          </div>
        )}
      </header>
      {ready && alreadyPlayed && !view.result && (
        <p className="mx-4 mb-3 rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-600">
          You've already played today's challenge. Playing again won't change your result.
        </p>
      )}
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
