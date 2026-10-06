/**
 * The seeker's panel (DESIGN.md, Sidebar; the Deck page, part four). It reads top to
 * bottom like a platform wall: who and when, the round, where you are, what you can do,
 * then the one main action on the wainscot.
 */
import {
  dailyNumber,
  nextEventTime,
  nyDate,
  questionKey,
  resolve,
  type SoloView,
  searchGrid,
} from "@stand-clear/engine";
import { useEffect, useRef, useState } from "react";
import { AskPanel, liveQuestion, QuestionBand, QuestionLog } from "./AskPanel.tsx";
import { askBlocker, askLabel, currentHint, HINTS, type HintId, hhmm, priceText } from "./ask.ts";
import {
  BootBoard,
  BootWainscot,
  LoadFailed,
  LostBand,
  ServerPlaque,
  TakenOverPlaque,
  useLinkScreen,
  useNow,
} from "./Connection.tsx";
import { cn } from "./cn.ts";
import { useGame, type World } from "./game.ts";
import { CurseChips } from "./HiderCards.tsx";
import { keyAction } from "./keys.ts";
import { arrivedPhotos, Lightbox, LookingFor } from "./Photos.tsx";
import { hm, ResultCard } from "./Result.tsx";
import { searchScene } from "./searchArea.ts";
import { onStreet } from "./street.ts";
import { TravelAction, TravelPanel } from "./TravelPanel.tsx";
import {
  Button,
  ClockTile,
  type FastForward,
  Notice,
  TabRow,
  Wainscot,
  WainscotText,
} from "./ui/vocab.tsx";
import { useGameTime } from "./useGameTime.ts";

const formatDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const DIFFICULTY_LABEL = { easy: "Easy", normal: "Normal", hard: "Hard" } as const;

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

/**
 * Fast-forward on the clock, in solo rounds: ▸ to the departure or 30 s before the next
 * stop, ▸▸ to your stop or the end of a walk. The clock is later, not faster.
 */
function fastForward(world: World, view: SoloView, t: number, busy: boolean): FastForward[] {
  const send = useGame.getState().send;
  const s = resolve(view.seeker, t, world.idx);
  const go = (to: "next" | "end") => () => send({ type: "skip", to });
  if (s.kind === "train") {
    const trip = world.ds.trips[s.trip];
    const waiting = trip ? t < (trip.dep[s.from] as number) : false;
    return [
      {
        glyph: "▸",
        title: waiting
          ? "Skip to the departure · Space"
          : "Skip to 30 s before the next stop · Space",
        disabled: busy || nextEventTime(view.seeker, t, world.idx, "next") === null,
        onClick: go("next"),
      },
      { glyph: "▸▸", title: "Skip to your stop · Shift+Space", disabled: busy, onClick: go("end") },
    ];
  }
  if (s.kind === "walking") {
    return [
      { glyph: "▸", title: "On a walk, ▸▸ arrives", disabled: true },
      { glyph: "▸▸", title: "Arrive · Shift+Space", disabled: busy, onClick: go("end") },
    ];
  }
  const why = s.kind === "platform" ? "Board a train first" : "Nothing to skip to on foot";
  return [
    { glyph: "▸", title: why, disabled: true },
    { glyph: "▸▸", title: why, disabled: true },
  ];
}

function PanelTop({ t, world }: { t: number | null; world: World | null }) {
  const { view, alreadyPlayed, busy, send } = useGame();
  const paused = useGame((s) => s.sync?.paused ?? false);
  const live = view && !view.result && world && t !== null;
  return (
    <header className="flex items-center justify-between gap-2.5 px-4 pt-3 pb-2.5">
      <div className="min-w-0">
        <div className="font-display text-[12.5px] font-bold tracking-[0.12em] uppercase">
          Stand Clear
        </div>
        <div className="text-[12px] text-ink-2">{roundLine(view, alreadyPlayed)}</div>
      </div>
      <ClockTile
        time={t === null ? null : hhmm(t)}
        paused={paused}
        ff={live ? fastForward(world, view, t, busy) : undefined}
        onPause={
          live && view.mode === "practice"
            ? () => send({ type: paused ? "resume" : "pause" })
            : undefined
        }
      />
    </header>
  );
}

/**
 * The round as three numbers on a 2 px rule: the hero (stations possible, or on foot the
 * share of your circle left), the time left, and the minutes the questions added to their
 * score. "Give up" is a quiet link.
 */
function RoundNumbers({ world, view, t }: { world: World; view: SoloView; t: number }) {
  const { send, alreadyPlayed, busy } = useGame();
  const onFoot = view.hasSpot && onStreet(view, t, world);
  const search = onFoot ? searchScene(world, view, t) : null;
  const center = search ? world.ds.complexes[search.complex] : undefined;
  const pct =
    search && center
      ? Math.round((search.possible.length / searchGrid(center).length) * 100)
      : null;
  const n = view.candidates.length;
  const giveUp = () => {
    const note = view.daily && !alreadyPlayed ? " It counts as not found for today." : "";
    if (window.confirm(`Give up and see where the hider was?${note}`)) send({ type: "giveUp" });
  };
  const cells: [string, string][] = [
    pct !== null
      ? [`${pct}%`, "of your circle left"]
      : [String(n), n === 1 ? "station possible" : "stations possible"],
    [hm(Math.max(0, view.seekEnd - t)), "left to find it"],
    [`+${view.bonusSeconds / 60}`, "min to their score"],
  ];
  return (
    <>
      <div className="mx-4 grid grid-cols-3 border-t-2 border-ink">
        {cells.map(([value, label], i) => (
          <div
            key={label}
            className={cn(
              "pt-2 pb-1",
              i > 0 ? "pl-2.5 shadow-[inset_1px_0_0_var(--color-grout)]" : "pr-1.5",
            )}
          >
            <b
              className={cn(
                "block leading-[1.15] font-extrabold tabular-nums",
                i === 0 ? "text-[27px]" : "text-[20px]",
              )}
            >
              {value}
            </b>
            <span className="block text-[11px] leading-[1.3] text-ink-2">{label}</span>
          </div>
        ))}
      </div>
      <div className="px-4 pt-0.5 text-right text-[12px] text-ink-2">
        <button
          type="button"
          disabled={busy}
          onClick={giveUp}
          className="underline decoration-grout underline-offset-2 hover:text-ink"
        >
          Give up
        </button>
      </div>
    </>
  );
}

// --- The onboarding hints -------------------------------------------------------------

const HINTS_KEY = "standClear.hints";

function loadSeen(): Set<HintId> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HINTS_KEY) ?? "[]") as HintId[]);
  } catch {
    return new Set();
  }
}

/** The first round's three hints: shown once each in the notice row, remembered here. */
function useHint(view: SoloView | null) {
  const [seen, setSeen] = useState(loadSeen);
  const hint = currentHint(seen, view);
  const shown = useRef<HintId | null>(null);
  const markSeen = (id: HintId) =>
    setSeen((s) => {
      const next = new Set(s).add(id);
      try {
        localStorage.setItem(HINTS_KEY, JSON.stringify([...next]));
      } catch {
        // Storage refused: the hint may show again next time.
      }
      return next;
    });
  useEffect(() => {
    // A hint that has been on screen and whose moment has passed counts as seen.
    if (shown.current && shown.current !== hint) markSeen(shown.current);
    shown.current = hint;
  });
  return { hint, dismiss: () => hint && markSeen(hint) };
}

/** The notice row: a refused action, then the first round's hints. Dismissed by clicking. */
function NoticeRow({ view }: { view: SoloView }) {
  const { notice, dismissNotice, alreadyPlayed } = useGame();
  const { hint, dismiss } = useHint(view);
  const [playedSeen, setPlayedSeen] = useState(false);
  const text = notice ?? (hint ? HINTS[hint] : null);
  if (text) {
    return (
      <div className="mx-4 mt-2.5">
        <Notice onDismiss={notice ? dismissNotice : dismiss}>{text}</Notice>
      </div>
    );
  }
  if (alreadyPlayed && !view.result && !playedSeen) {
    return (
      <div className="mx-4 mt-2.5">
        <Notice onDismiss={() => setPlayedSeen(true)}>
          You've played today's daily. This round won't change your result.
        </Notice>
      </div>
    );
  }
  return null;
}

/** The wainscot's confirm for the armed question: "Ask · Radar 1 mi" and its price. */
function AskConfirm({ world, view, t }: { world: World; view: SoloView; t: number }) {
  const { armed, send, busy } = useGame();
  if (!armed) return null;
  const blocker = askBlocker(armed, view, t, world.idx);
  return (
    <>
      <Button
        kind="ink"
        keys="⏎"
        disabled={!!blocker || busy}
        onClick={() => send({ type: "ask", question: armed })}
      >
        {askLabel(armed)}
      </Button>
      <WainscotText>{blocker ?? priceText(armed)}</WainscotText>
    </>
  );
}

/** Esc disarms; Enter asks the armed question when it can be asked. */
function useAskKeys(world: World | null, view: SoloView | null, t: number | null) {
  const latest = useRef({ world, view, t });
  latest.current = { world, view, t };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { world: w, view: v, t: now } = latest.current;
      const { armed, arm, send, busy, link } = useGame.getState();
      if (!w || !v || now === null || link.kind !== "open" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      // A focused question chip doesn't own Enter: Enter asks what's armed.
      const onControl =
        !!target?.closest("button, a, input, textarea, select") && !target?.closest("[data-chip]");
      const canAsk = !!armed && !busy && askBlocker(armed, v, now, w.idx) === null;
      const action = keyAction(e.key, { armed: !!armed, canAsk, onControl });
      if (action === "disarm") arm(null);
      else if (action === "ask" && armed) send({ type: "ask", question: armed });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function Panel() {
  const { status, world, view, tab, setTab, everOpen, armed, hover } = useGame();
  const t = useGameTime(4);
  const now = useNow(4);
  const screen = useLinkScreen();
  const [zoom, setZoom] = useState<number | null>(null);
  useAskKeys(world, view, t);
  // Leaving a tab unmounts its chips without a mouseleave: forget the hover.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on tab change only
  useEffect(() => hover(null), [tab]);
  const ready = status === "ready" && world && view && t !== null;
  const aside =
    "flex h-full w-[380px] shrink-0 flex-col bg-glaze-hi shadow-[inset_1px_0_0_var(--color-grout)]";

  // Before the round: the loading board, or a plaque if something's wrong.
  if (!everOpen || !ready) {
    return (
      <aside className={aside}>
        <PanelTop t={null} world={null} />
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
  const over = view.result !== null;
  const live = liveQuestion(view, now);
  const onFoot = view.hasSpot && onStreet(view, t, world);
  const photos = arrivedPhotos(view);
  const lookingFor = onFoot ? [...photos].reverse().find((p) => p.q.from === "spot") : undefined;
  const asking = tab === "ask" && armed !== null && !over;
  return (
    <aside className={aside}>
      {/* Another tab has the round, and its clock: this one doesn't know the time. */}
      <PanelTop t={screen.kind === "takenOver" ? null : t} world={world} />
      {screen.kind === "lost" && <LostBand screen={screen} />}
      {screen.kind === "unreachable" && <ServerPlaque screen={screen} />}
      {screen.kind === "takenOver" && <TakenOverPlaque />}
      <div className={cn("flex min-h-0 flex-1 flex-col", down && "sc-frozen")} aria-hidden={down}>
        {!over && (
          <>
            <RoundNumbers world={world} view={view} t={t} />
            <div className="border-b border-grout px-4 pt-2 pb-2.5">
              <TabRow
                tabs={[
                  { id: "travel", label: "Travel" },
                  { id: "ask", label: view.asked.length ? `Ask · ${view.asked.length}` : "Ask" },
                ]}
                active={tab}
                onSelect={setTab}
              />
            </div>
          </>
        )}
        <NoticeRow view={view} />
        <CurseChips world={world} t={t} view={view} />
        {lookingFor && (
          <LookingFor p={lookingFor} onOpen={() => setZoom(photos.indexOf(lookingFor))} />
        )}
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {over ? (
            <>
              <ResultCard world={world} />
              <QuestionLog world={world} />
            </>
          ) : (
            <>
              {live && (
                <QuestionBand
                  key={`${live.at}|${questionKey(live.q)}`}
                  a={live}
                  world={world}
                  t={t}
                />
              )}
              {tab === "travel" ? (
                <TravelPanel world={world} t={t} />
              ) : (
                <AskPanel world={world} t={t} />
              )}
            </>
          )}
        </div>
      </div>
      {down
        ? screen.kind !== "takenOver" && (
            <Wainscot>
              <WainscotText>
                Buttons come back when you reconnect. Nothing you pressed is lost.
              </WainscotText>
            </Wainscot>
          )
        : !over && (
            <Wainscot>
              {asking ? (
                <AskConfirm world={world} view={view} t={t} />
              ) : (
                <TravelAction world={world} t={t} />
              )}
            </Wainscot>
          )}
      {zoom !== null && (
        <Lightbox photos={photos} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />
      )}
    </aside>
  );
}
