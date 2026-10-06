import {
  DIFFICULTIES,
  type Difficulty,
  dailyNumber,
  nyDate,
  questionBonusSeconds,
  type SoloView,
} from "@stand-clear/engine";
import { useState } from "react";
import { AskPanel, QuestionLog } from "./AskPanel.tsx";
import {
  BootBoard,
  BootWainscot,
  LoadFailed,
  LostBand,
  ServerPlaque,
  TakenOverPlaque,
  useLinkScreen,
} from "./Connection.tsx";
import { cn } from "./cn.ts";
import { hubName, useGame, type World } from "./game.ts";
import { HandReveal, HiderStrip } from "./HiderCards.tsx";
import { dailyStats } from "./history.ts";
import { useReplay } from "./replay.ts";
import { formatMinutes, shareText } from "./share.ts";
import { TravelPanel } from "./TravelPanel.tsx";
import { Caption, Notice, Num, Wainscot, WainscotText } from "./ui/vocab.tsx";
import { ActionButton, Bullets, routesFor } from "./ui.tsx";
import { formatClock, useGameTime } from "./useGameTime.ts";

const formatDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

function RoundBar({ t }: { t: number }) {
  const { view, send, busy, sync, alreadyPlayed } = useGame();
  if (!view || view.result) return null;
  const left = Math.max(0, view.seekEnd - t);
  const giveUp = () => {
    const note = view.daily && !alreadyPlayed ? " It counts as not found for today." : "";
    if (window.confirm(`Give up and see where the hider was?${note}`)) send({ type: "giveUp" });
  };
  const paused = sync?.paused ?? false;
  return (
    <div className="mx-4 mb-3">
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-stone-100 px-3 py-2 text-center">
        <div>
          <div className="text-lg font-semibold tabular-nums">{view.candidates.length}</div>
          <div className="text-[11px] text-stone-500">
            {view.candidates.length === 1 ? "station possible" : "stations possible"}
          </div>
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

/**
 * Start a daily or practice round; confirms before abandoning one in progress. Practice
 * takes a difficulty (the band of stations the bot hides in, and how hard it plays its
 * cards; DESIGN.md "Bot hider difficulty"); the daily is always Normal.
 */
function useNewRound() {
  const { view, send } = useGame();
  return (mode: "daily" | "practice", difficulty?: Difficulty) => {
    const inProgress = view && !view.result && view.asked.length > 0;
    if (inProgress && !window.confirm("Leave this round? It won't count.")) return;
    send(mode === "practice" ? { type: "newRound", mode, difficulty } : { type: "newRound", mode });
  };
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};
const DIFFICULTY_HINT: Record<Difficulty, string> = {
  easy: "A station 3–4 good questions find, and the hider plays no curses.",
  normal: "5–6 questions, like the daily. Curses once you're closing in.",
  hard: "7–8 questions, often a station with a look-alike. Curses from the first ride.",
};

/** Easy · Normal · Hard for the next practice round. */
function DifficultyPicker({
  value,
  onChange,
  disabled,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
  disabled?: boolean;
}) {
  return (
    <div className="text-xs text-stone-600">
      <div className="inline-flex overflow-hidden rounded-md border border-stone-300">
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            disabled={disabled}
            aria-pressed={d === value}
            onClick={() => onChange(d)}
            className={cn(
              "px-2.5 py-1 font-semibold transition-colors disabled:opacity-40",
              d === value ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100",
            )}
          >
            {DIFFICULTY_LABEL[d]}
          </button>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-stone-500">{DIFFICULTY_HINT[value]}</div>
    </div>
  );
}

function ShareButton() {
  const { view, world, results, alreadyPlayed } = useGame();
  const [copied, setCopied] = useState(false);
  if (!view?.result) return null;
  // A replayed daily doesn't count, so share the result that does.
  const counted = view.daily && alreadyPlayed ? results[view.daily.date]?.share : undefined;
  const text = counted ?? shareText(view, hubName(world, view));
  return (
    <ActionButton
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => window.prompt("Copy your result:", text));
      }}
    >
      {copied ? "Copied!" : counted ? "Share today's result" : "Share result"}
    </ActionButton>
  );
}

function ResultCard({ world }: { world: World }) {
  const { view, busy, results, alreadyPlayed } = useGame();
  const newRound = useNewRound();
  const [difficulty, setDifficulty] = useState<Difficulty>(view?.difficulty ?? "normal");
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
            {view.asked.length} (+{questionBonusSeconds(view.asked) / 60} min)
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-stone-500">hider score</dt>
          <dd className="font-semibold">{formatMinutes(elapsed + view.bonusSeconds)}</dd>
        </div>
      </dl>
      {view.hiderHand && <HandReveal hand={view.hiderHand} />}
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
        <ActionButton quiet disabled={busy} onClick={() => newRound("practice", difficulty)}>
          {view.daily ? "Practice round" : "Play again"}
        </ActionButton>
        {!view.daily && (
          <ActionButton quiet disabled={busy} onClick={() => newRound("daily")}>
            Today's daily
          </ActionButton>
        )}
      </div>
      <div className="mt-2">
        <DifficultyPicker value={difficulty} onChange={setDifficulty} disabled={busy} />
      </div>
    </div>
  );
}

function Tabs() {
  const { tab, setTab, view, follow, setFollow, mapFailed } = useGame();
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
      <ActionButton quiet disabled={!!mapFailed} onClick={() => setFollow(!follow)}>
        {mapFailed ? "No map" : follow ? "Following you" : "Follow me"}
      </ActionButton>
    </div>
  );
}

function ModeLine() {
  const { view, busy, world } = useGame();
  const startName = hubName(world, view);
  const newRound = useNewRound();
  if (!view) return <div className="text-xs text-stone-500">Find the hider's station</div>;
  return (
    // The round on one line; where it starts and the mode switch on the next, so
    // neither wraps mid-name in the narrow header.
    <div className="text-xs text-stone-500">
      <div className="flex flex-wrap items-center gap-x-1.5">
        {startName && <span>from {startName}</span>}
        {!view.result && (
          <button
            type="button"
            disabled={busy}
            className="whitespace-nowrap underline decoration-stone-300 underline-offset-2 hover:text-stone-800"
            onClick={() => newRound(view.daily ? "practice" : "daily")}
          >
            {view.daily ? "practice instead" : "today's daily"}
          </button>
        )}
      </div>
    </div>
  );
}

/** The round on one line: before the server answers, today's daily from the date. */
function roundLine(view: SoloView | null, alreadyPlayed: boolean): string {
  if (!view) {
    const date = nyDate(new Date());
    return `Daily #${dailyNumber(date)} · ${formatDay(date)}`;
  }
  return view.daily
    ? `Daily #${view.daily.number} · ${formatDay(view.daily.date)}${alreadyPlayed ? " · played" : ""}`
    : `Practice round${view.difficulty === "normal" ? "" : ` · ${DIFFICULTY_LABEL[view.difficulty]}`}`;
}

/** The time as a caption tile, nothing under it: blank until the server answers, "Paused" while stopped. */
function ClockTile({ t }: { t: number | null }) {
  const paused = useGame((s) => s.sync?.paused ?? false);
  if (t === null) {
    return (
      <div className="sc-clock off" title="The clock starts when the server answers">
        <Caption>
          <Num>--:--</Num>
        </Caption>
      </div>
    );
  }
  return (
    <div className={cn("sc-clock", paused && "paused")}>
      <Caption>
        <Num>{paused ? "Paused" : formatClock(t).slice(0, 5)}</Num>
      </Caption>
    </div>
  );
}

function PanelTop({ t }: { t: number | null }) {
  const { view, alreadyPlayed } = useGame();
  return (
    <header className="flex items-center justify-between gap-2.5 px-4 pt-3 pb-2.5">
      <div className="min-w-0">
        <div className="font-display text-[12.5px] font-bold uppercase tracking-[0.12em]">
          Stand Clear
        </div>
        <div className="text-[12px] text-ink-2">{roundLine(view, alreadyPlayed)}</div>
        {view && <ModeLine />}
      </div>
      <ClockTile t={t} />
    </header>
  );
}

export function Panel() {
  const {
    status,
    world,
    view,
    notice,
    dismissNotice,
    cardNotice,
    dismissCardNotice,
    tab,
    alreadyPlayed,
    everOpen,
  } = useGame();
  const t = useGameTime(4);
  const screen = useLinkScreen();
  const ready = status === "ready" && world && view && t !== null;

  // Before the round: the loading board, or a plaque if something's wrong.
  if (!everOpen || !ready) {
    return (
      <aside className="flex h-full w-[380px] shrink-0 flex-col bg-glaze-hi shadow-[inset_1px_0_0_var(--color-grout)]">
        <PanelTop t={null} />
        {status === "error" ? (
          <LoadFailed />
        ) : screen.kind === "unreachable" ? (
          <ServerPlaque screen={screen} />
        ) : screen.kind === "takenOver" ? (
          <TakenOverPlaque />
        ) : (
          <>
            <BootBoard />
            <div className="flex-1" />
            <BootWainscot />
          </>
        )}
      </aside>
    );
  }

  // Mid-round with the link down: the round is paused, the controls dim, one band explains.
  const down = screen.kind !== "none";
  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col bg-glaze-hi shadow-[inset_1px_0_0_var(--color-grout)]">
      {/* Another tab has the round, and its clock: this one doesn't know the time. */}
      <PanelTop t={screen.kind === "takenOver" ? null : t} />
      {screen.kind === "lost" && <LostBand screen={screen} />}
      {screen.kind === "unreachable" && <ServerPlaque screen={screen} />}
      {screen.kind === "takenOver" && <TakenOverPlaque />}
      <div className={cn("flex min-h-0 flex-1 flex-col", down && "sc-frozen")} aria-hidden={down}>
        {alreadyPlayed && !view.result && (
          <p className="mx-4 mb-3 rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-600">
            You've already played today's challenge. Playing again won't change your result.
          </p>
        )}
        <RoundBar t={t} />
        <HiderStrip world={world} t={t} />
        <ResultCard world={world} />
        <Tabs />
        {cardNotice && !view.result && (
          <button
            type="button"
            onClick={dismissCardNotice}
            className="mx-4 mt-3 rounded-md bg-orange-50 px-3 py-2 text-left text-sm text-orange-900"
          >
            {cardNotice}
          </button>
        )}
        {notice && (
          <div className="mx-4 mt-3">
            <Notice onDismiss={dismissNotice}>{notice}</Notice>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto pt-3 pb-6">
          {view.result ? (
            <QuestionLog world={world} />
          ) : tab === "travel" ? (
            <TravelPanel world={world} t={t} />
          ) : (
            <AskPanel world={world} t={t} />
          )}
        </div>
      </div>
      {down && screen.kind !== "takenOver" && (
        <Wainscot>
          <WainscotText>
            Buttons come back when you reconnect. Nothing you pressed is lost.
          </WainscotText>
        </Wainscot>
      )}
    </aside>
  );
}
