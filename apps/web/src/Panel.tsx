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
  SOLO_PAUSES_ON_DROP,
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
import { useMotion } from "./clearings.ts";
import { cn } from "./cn.ts";
import { useGame, useGamePick, type World } from "./game.ts";
import { CurseChips } from "./HiderCards.tsx";
import { keyAction } from "./keys.ts";
import { stillStanding } from "./map/eliminate.ts";
import { formatDay } from "./names.ts";
import { arrivedPhotos, Lightbox, LookingFor } from "./Photos.tsx";
import { ReplayPanel } from "./ReplayPanel.tsx";
import { hm, ResultCard } from "./Result.tsx";
import { useReplay } from "./replay.ts";
import { searchScene } from "./searchArea.ts";
import { SOUNDS, useSound } from "./sound.ts";
import { onStreet } from "./street.ts";
import { TravelAction, TravelPanel } from "./TravelPanel.tsx";
import { useLeaving } from "./ui/useLeaving.ts";
import {
  Button,
  ClockTile,
  type FastForward,
  FollowToggle,
  Line,
  Notice,
  TabRow,
  Wainscot,
  WainscotText,
} from "./ui/vocab.tsx";
import { useGameTime } from "./useGameTime.ts";
import { LINES, lineFor, roundKey } from "./voice.ts";

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
        key: "Space",
        title: waiting
          ? "Skip to the departure · Space"
          : "Skip to 30 s before the next stop · Space",
        disabled: busy || nextEventTime(view.seeker, t, world.idx, "next") === null,
        onClick: go("next"),
      },
      {
        glyph: "▸▸",
        key: "Shift+Space",
        title: "Skip to your stop · Shift+Space",
        disabled: busy,
        onClick: go("end"),
      },
    ];
  }
  if (s.kind === "walking") {
    return [
      { glyph: "▸", title: "On a walk, ▸▸ arrives", disabled: true },
      {
        glyph: "▸▸",
        key: "Shift+Space",
        title: "Arrive · Shift+Space",
        disabled: busy,
        onClick: go("end"),
      },
    ];
  }
  const why = s.kind === "platform" ? "Board a train first" : "Nothing to skip to on foot";
  return [
    { glyph: "▸", title: why, disabled: true },
    { glyph: "▸▸", title: why, disabled: true },
  ];
}

function PanelTop({ t, world }: { t: number | null; world: World | null }) {
  const { view, alreadyPlayed, busy, send } = useGamePick("view", "alreadyPlayed", "busy", "send");
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

/** While an elimination is in flight, re-render every frame so the count steps with it. */
function useClearingCount(): number {
  const clearing = useMotion((s) => s.clearing);
  const [, setFrame] = useState(0);
  const now = performance.now();
  const flying = clearing !== null && now - clearing.start < clearing.end + 50;
  useEffect(() => {
    if (!flying) return;
    const id = requestAnimationFrame(() => setFrame((n) => n + 1));
    return () => cancelAnimationFrame(id);
  });
  return stillStanding(clearing, now);
}

/**
 * The round as three numbers on a 2 px rule: the hero (stations possible, or on foot the
 * share of your circle left), the time left, and the minutes the questions added to their
 * score. "Give up" is a quiet link.
 */
function RoundNumbers({ world, view, t }: { world: World; view: SoloView; t: number }) {
  const { send, alreadyPlayed, busy } = useGamePick("send", "alreadyPlayed", "busy");
  const [soundOpen, setSoundOpen] = useState(false);
  // The count steps down one per square as an answer clears them (Motion: Ask → answer).
  const standing = useClearingCount();
  const onFoot = view.hasSpot && onStreet(view, t, world);
  const search = onFoot ? searchScene(world, view, t) : null;
  const center = search ? world.ds.complexes[search.complex] : undefined;
  const pct =
    search && center
      ? Math.round((search.possible.length / searchGrid(center).length) * 100)
      : null;
  const n = view.candidates.length + standing;
  const giveUp = () => {
    const ask = view.daily
      ? `Give up and see where the hider was?${alreadyPlayed ? "" : " Today counts as not found."}`
      : "Give up and see where the hider was?";
    if (window.confirm(ask)) send({ type: "giveUp" });
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
      <div className="flex justify-end gap-3 px-4 pt-0.5 text-[12px] text-ink-2">
        <button
          type="button"
          aria-expanded={soundOpen}
          onClick={() => setSoundOpen(!soundOpen)}
          className="underline decoration-grout underline-offset-2 hover:text-ink"
        >
          Sound
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={giveUp}
          className="underline decoration-grout underline-offset-2 hover:text-ink"
        >
          Give up
        </button>
      </div>
      {soundOpen && <SoundSettings />}
    </>
  );
}

/**
 * Which moments make a sound (DESIGN.md, Interaction: Sound is events). "Someone's here"
 * is on unless you turn it off; the chime and the tock are yours to turn on.
 */
function SoundSettings() {
  const { on, set } = useSound();
  return (
    <div className="mx-4 mt-1.5 flex flex-col items-start gap-1.5 bg-glaze px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--color-grout)]">
      {SOUNDS.map((s) => (
        <FollowToggle
          key={s.id}
          on={on[s.id]}
          onToggle={() => set(s.id, !on[s.id])}
          label={s.label}
        />
      ))}
    </div>
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
function useHint(view: SoloView | null, onFoot: boolean) {
  const [seen, setSeen] = useState(loadSeen);
  // On the first arrival at the street, "What counts" comes first.
  const hint: HintId | null = onFoot && !seen.has("counts") ? "counts" : currentHint(seen, view);
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
function NoticeRow({ view, onFoot }: { view: SoloView; onFoot: boolean }) {
  const { notice, dismissNotice, alreadyPlayed } = useGamePick(
    "notice",
    "dismissNotice",
    "alreadyPlayed",
  );
  const { hint, dismiss } = useHint(view, onFoot);
  const [playedSeen, setPlayedSeen] = useState(false);
  const text = notice ?? (hint ? HINTS[hint] : null);
  if (text) {
    return (
      <div key={text} className="sc-anim-set mx-4 mt-2.5">
        <Notice onDismiss={notice ? dismissNotice : dismiss}>
          <span className="whitespace-pre-line">{text}</span>
        </Notice>
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
  const { armed, send, busy } = useGamePick("armed", "send", "busy");
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
        <span key={askLabel(armed)} className="sc-anim-step">
          {askLabel(armed)}
        </span>
      </Button>
      <WainscotText>{blocker ?? priceText(armed)}</WainscotText>
    </>
  );
}

/** The control printed with `key`, if it's on screen and can be pressed. */
function pressable(key: string): HTMLButtonElement | null {
  const el = document.querySelector<HTMLButtonElement>(`[data-key="${CSS.escape(key)}"]`);
  return el && !el.disabled && el.getAttribute("aria-disabled") !== "true" ? el : null;
}

/**
 * The keyboard (keys.ts): Esc disarms, Enter asks, and the rest press their printed
 * control, switching to its tab first when it lives on the other one.
 */
function useKeys(world: World | null, view: SoloView | null, t: number | null) {
  const latest = useRef({ world, view, t });
  latest.current = { world, view, t };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { world: w, view: v, t: now } = latest.current;
      const { armed, arm, send, busy, link, setTab } = useGame.getState();
      if (!w || !v || now === null || link.kind !== "open" || e.defaultPrevented) return;
      // A dialog over the game (the photo lightbox) owns the keyboard.
      if (document.querySelector('[aria-modal="true"]')) return;
      // The replay has its own keys, and typing stays typing.
      if (useReplay.getState().active || v.result) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      // A focused question chip doesn't own Enter: Enter asks what's armed.
      const onControl =
        !!target?.closest("button, a, [role=slider]") && !target?.closest("[data-chip]");
      const canAsk = !!armed && !busy && askBlocker(armed, v, now, w.idx) === null;
      const action = keyAction(e, { armed: !!armed, canAsk, onControl });
      if (!action) return;
      if (action.kind === "disarm") arm(null);
      else if (action.kind === "ask" && armed) send({ type: "ask", question: armed });
      else if (action.kind === "press") {
        const now = pressable(action.key);
        if (now) now.click();
        else if (action.tab && useGame.getState().tab !== action.tab) {
          // It lives on the other tab: open it, then press once React has drawn it (a key
          // is a discrete event, so the switch commits before the next task).
          setTab(action.tab);
          setTimeout(() => pressable(action.key)?.click(), 0);
        } else return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * Each drop of the link, numbered, and the conductor's "moving again" for 6 s once it's
 * back (Voice). A drop has its number only once it's counted, so the lines can tell one
 * drop from the next: both belong to the round's first drop only.
 */
function useDrops(lostNow: boolean) {
  const count = useRef(0);
  const was = useRef(lostNow);
  const [drop, setDrop] = useState<number | null>(null);
  const [back, setBack] = useState<{ drop: number; until: number } | null>(null);
  useEffect(() => {
    if (lostNow && !was.current) {
      count.current += 1;
      setDrop(count.current);
      setBack(null);
    }
    if (!lostNow && was.current) {
      setDrop(null);
      setBack({ drop: count.current, until: Date.now() + 6000 });
    }
    was.current = lostNow;
  }, [lostNow]);
  useEffect(() => {
    if (!back) return;
    const id = setTimeout(() => setBack(null), Math.max(0, back.until - Date.now()));
    return () => clearTimeout(id);
  }, [back]);
  return { drop: lostNow ? drop : null, back: lostNow ? null : (back?.drop ?? null) };
}

export function Panel() {
  const { status, world, view, tab, setTab, everOpen, armed, hover, alreadyPlayed } = useGamePick(
    "status",
    "world",
    "view",
    "tab",
    "setTab",
    "everOpen",
    "armed",
    "hover",
    "alreadyPlayed",
  );
  const replaying = useReplay((s) => s.active);
  const t = useGameTime(4);
  const now = useNow(4);
  const screen = useLinkScreen();
  const [zoom, setZoom] = useState<number | null>(null);
  const lost = useLeaving(screen.kind === "lost" ? screen : null, 280);
  const drops = useDrops(screen.kind === "lost");
  // The answered band collapses into the log rather than vanishing.
  const band = useLeaving(view && !view.result ? liveQuestion(view, now) : null, 280);
  useKeys(world, view, t);
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

  // The replay takes the panel: its own header, the summary and the log.
  if (replaying) {
    return (
      <aside className={aside}>
        <ReplayPanel world={world} roundLine={roundLine(view, alreadyPlayed)} />
      </aside>
    );
  }

  // Mid-round with the link down: the round is paused, the controls dim, one band explains.
  const down = screen.kind !== "none";
  const over = view.result !== null;
  const onFoot = view.hasSpot && onStreet(view, t, world);
  const photos = arrivedPhotos(view);
  const lookingFor = onFoot ? [...photos].reverse().find((p) => p.q.from === "spot") : undefined;
  const asking = tab === "ask" && armed !== null && !over;
  return (
    <aside className={aside}>
      {/* Another tab has the round, and its clock: this one doesn't know the time. */}
      <PanelTop t={screen.kind === "takenOver" ? null : t} world={world} />
      {lost.value && (
        <div className={lost.leaving ? "sc-anim-collapse" : undefined}>
          <LostBand screen={lost.value} />
          {/* The dispatcher's lines say the round is held: only where a drop pauses it. */}
          {SOLO_PAUSES_ON_DROP &&
            drops.drop !== null &&
            lineFor(roundKey(view), "lost", drops.drop) && (
              <div className="mx-4 mt-1.5">
                <Line>{LINES.lost}</Line>
              </div>
            )}
        </div>
      )}
      {SOLO_PAUSES_ON_DROP &&
        drops.back !== null &&
        lineFor(roundKey(view), "back", drops.back) && (
          <div className="sc-anim-set mx-4 mt-2.5">
            <Line>{LINES.back}</Line>
          </div>
        )}
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
        <NoticeRow view={view} onFoot={onFoot && !over} />
        <CurseChips world={world} t={t} view={view} />
        {lookingFor && (
          <LookingFor
            key={lookingFor.at}
            p={lookingFor}
            onOpen={() => setZoom(photos.indexOf(lookingFor))}
          />
        )}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-6">
          {over ? (
            <>
              <ResultCard world={world} />
              <QuestionLog world={world} />
            </>
          ) : (
            <>
              {band.value && (
                <div data-land="question" className={band.leaving ? "sc-anim-collapse" : undefined}>
                  <QuestionBand
                    key={`${band.value.at}|${questionKey(band.value.q)}`}
                    a={band.value}
                    world={world}
                    t={t}
                  />
                </div>
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
