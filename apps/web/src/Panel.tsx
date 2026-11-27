/**
 * The seeker's panel (DESIGN.md, Sidebar; the Deck page, part four). It reads top to
 * bottom like a platform wall: who and when, the round, where you are, what you can do,
 * then the one main action on the wainscot.
 */

import {
  type Difficulty,
  dailyNumber,
  dailyTheme,
  nextEventTime,
  nyDate,
  questionKey,
  resolve,
  SOLO_PAUSES_ON_DROP,
  type SoloView,
  searchGrid,
  THEME_NAMES,
} from "@subway-seek/engine";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AskPanel, liveQuestion, QuestionBand, QuestionLog } from "./AskPanel.tsx";
import { askBlocker, askLabel, hhmm, priceText, WHAT_COUNTS } from "./ask.ts";
import { GAME_NAME } from "./brand.ts";
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
import { cardNote, loadSeenCards, saveSeenCards } from "./cardNotes.ts";
import { useMotion } from "./clearings.ts";
import { cn } from "./cn.ts";
import { Guide } from "./Guide.tsx";
import { openingRound, useGame, useGamePick, type World } from "./game.ts";
import { CurseChips } from "./HiderCards.tsx";
import { HiderPanel } from "./HiderPanel.tsx";
import { HiderResult } from "./HiderResult.tsx";
import { isHider, ownTransit } from "./hide.ts";
import { keyAction } from "./keys.ts";
import { sheetToggle, tapTab, usePlayLayout, useSheet } from "./layout.ts";
import { useFirstRound } from "./learn.ts";
import { stillStanding } from "./map/eliminate.ts";
import { NextTargetContext, NO_TARGET, useNextMove, useNextTarget } from "./NextMove.tsx";
import { complexLabel, displayName, formatDay } from "./names.ts";
import { endLineText, type NextMove } from "./nextMove.ts";
import { checkedNow, stillPossible, useNotHere, useNotHereList } from "./notHere.ts";
import { arrivedPhotos, Lightbox, LookingFor } from "./Photos.tsx";
import { ReplayPanel } from "./ReplayPanel.tsx";
import { ResultCard } from "./Result.tsx";
import { useReplay } from "./replay.ts";
import { searchScene } from "./searchArea.ts";
import { SOUNDS, useSound } from "./sound.ts";
import { storageKey } from "./storage.ts";
import { onStreet } from "./street.ts";
import { streetOffLine, useStreet } from "./streetMode.ts";
import { TravelAction, TravelPanel } from "./TravelPanel.tsx";
import { useLeaving } from "./ui/useLeaving.ts";
import {
  Button,
  ClockTile,
  type FastForward,
  FollowToggle,
  Line,
  NextLine,
  Notice,
  TabRow,
  Wainscot,
  WainscotText,
} from "./ui/vocab.tsx";
import { useGameTime } from "./useGameTime.ts";
import { LINES, lineFor, roundKey } from "./voice.ts";

const DIFFICULTY_LABEL = { easy: "Easy", normal: "Normal", hard: "Hard" } as const;

const practiceLine = (d: Difficulty | undefined) =>
  `Practice round${!d || d === "normal" ? "" : ` · ${DIFFICULTY_LABEL[d]}`}`;

/** The round on one line: before the server answers, the round the page is opening. */
function roundLine(view: SoloView | null, alreadyPlayed: boolean): string {
  if (!view) {
    const opening = openingRound();
    if (opening.kind === "practice") return practiceLine(opening.difficulty);
    if (opening.kind === "hide")
      return `You hide · ${DIFFICULTY_LABEL[opening.difficulty ?? "normal"]}`;
    const date = nyDate(new Date());
    const theme = dailyTheme(date);
    return `Daily #${dailyNumber(date)} · ${formatDay(date)}${theme ? ` · ${THEME_NAMES[theme]}` : ""}`;
  }
  if (isHider(view)) return `You hide · ${DIFFICULTY_LABEL[view.difficulty]}`;
  return view.daily
    ? `Daily #${view.daily.number} · ${formatDay(view.daily.date)}${view.daily.theme ? ` · ${THEME_NAMES[view.daily.theme]}` : ""}${alreadyPlayed ? " · played" : ""}`
    : practiceLine(view.difficulty);
}

/**
 * Fast-forward on the clock, in solo rounds: ▸ to the departure or 30 s before the next
 * stop, ▸▸ to your stop or the end of a walk. The clock is later, not faster.
 */
function fastForward(
  world: World,
  view: SoloView,
  t: number,
  busy: boolean,
  /** A phone: shorter words, so the clock fits its row. */
  short = false,
): FastForward[] {
  const send = useGame.getState().send;
  if (isHider(view) && t >= view.seekStart) return [];
  const s = resolve(ownTransit(view), t, world.idx);
  const go = (to: "next" | "end") => () => send({ type: "skip", to });
  if (s.kind === "train") {
    const trip = world.ds.trips[s.trip];
    const waiting = trip ? t < (trip.dep[s.from] as number) : false;
    const next = nextEventTime(ownTransit(view), t, world.idx, "next");
    const end = nextEventTime(ownTransit(view), t, world.idx, "end");
    // Your stop is the last stop until you pick one, so say which: a skip to the end of
    // the line can be most of an hour. One that lands after time's up would end the round.
    const stop = displayName(world.ds.stations[trip?.stops[s.to] as number]?.name ?? "");
    const toEnd = trip && s.to === trip.stops.length - 1 ? "the last stop" : "your stop";
    const late = (at: number | null) => !isHider(view) && at !== null && at >= view.seekEnd;
    return [
      {
        glyph: "▸",
        key: "Space",
        label: waiting ? (short ? "Leave" : "Leave now") : short ? "Next" : "Next stop",
        title: late(next)
          ? "The next stop is after time's up"
          : waiting
            ? "Skip to the departure · Space"
            : "Skip to 30 s before the next stop · Space",
        disabled: busy || next === null || late(next),
        onClick: go("next"),
      },
      {
        glyph: "▸▸",
        key: "Shift+Space",
        label: toEnd === "the last stop" ? "Last stop" : "Your stop",
        title: late(end) ? `${stop} is after time's up` : `Skip to ${toEnd}, ${stop} · Shift+Space`,
        disabled: busy || late(end),
        onClick: go("end"),
      },
    ];
  }
  if (s.kind === "walking") {
    return [
      {
        glyph: "▸▸",
        key: "Shift+Space",
        label: "Arrive",
        title: "Arrive · Shift+Space",
        disabled: busy,
        onClick: go("end"),
      },
    ];
  }
  // Nothing to skip to on a platform or on foot: no buttons, rather than two greyed glyphs
  // whose reason was only in a tooltip (the playable round, 2026-11-27).
  return [];
}

function PanelTop({
  t,
  world,
  numbers,
}: {
  t: number | null;
  world: World | null;
  /** On a phone, the round's numbers sit here, beside the clock (the playable round). */
  numbers?: ReactNode;
}) {
  const { view, alreadyPlayed, busy, send } = useGamePick("view", "alreadyPlayed", "busy", "send");
  const paused = useGame((s) => s.sync?.paused ?? false);
  const live = view && !view.result && world && t !== null;
  // On a phone the line about the station runs the panel's width, under the clock.
  const stack = usePlayLayout() === "stack";
  const stationLine = view?.stationOnly && !view.result && (
    <StationOnlyLine hiding={isHider(view)} />
  );
  return (
    <header className="sc-ptop flex flex-wrap items-center justify-between gap-2.5 px-4 pt-3 pb-2.5">
      {/* The clock's worded skip buttons drop to their own row rather than squeeze this. */}
      <div className="min-w-[180px] flex-1">
        {/* On a phone every line here costs the list room (the playable round). */}
        {!stack && (
          <div className="font-display text-[12.5px] font-bold tracking-[0.12em] uppercase">
            {GAME_NAME}
          </div>
        )}
        <div className="text-[12px] text-ink-2">{roundLine(view, alreadyPlayed)}</div>
        {numbers}
        {!stack && stationLine}
      </div>
      <ClockTile
        // Once the round is over the clock shows when it ended, not a time still running.
        time={t === null ? null : hhmm(view?.result ? view.result.at : t)}
        paused={paused}
        ff={live ? fastForward(world, view, t, busy, stack) : undefined}
        onPause={
          live && (view.mode === "practice" || view.mode === "hide")
            ? () => send({ type: paused ? "resume" : "pause" })
            : undefined
        }
      />
    </header>
  );
}

/**
 * The round ends at the station (DESIGN.md, Playable without Google): said once, under the
 * round line, for as long as the round runs.
 */
function StationOnlyLine({ hiding }: { hiding: boolean }) {
  const off = useStreet((s) => s.off);
  // On a phone, only what ends the round.
  const short = usePlayLayout() === "stack";
  const line = hiding
    ? "This round ends at the station: you stay below, and the seeker finds you by reaching it."
    : ((short ? null : streetOffLine(off)) ?? "The round ends when you reach the hider's station.");
  return (
    <div className="sc-station-only mt-1 max-w-[250px] text-[11.5px] leading-[1.35] text-ink-2">
      {line}
    </div>
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
/** The round's numbers as [value, label] pairs, in plain words. */
function useRoundCells(world: World, view: SoloView, t: number): [string, string][] {
  // The count steps down one per square as an answer clears them (Motion: Ask → answer).
  const standing = useClearingCount();
  const notHere = useNotHereList(view);
  const first = useFirstRound();
  const onFoot = view.hasSpot && onStreet(view, t, world);
  const search = onFoot ? searchScene(world, view, t) : null;
  const center = search ? world.ds.complexes[search.complex] : undefined;
  const pct =
    search && center
      ? Math.round((search.possible.length / searchGrid(center).length) * 100)
      : null;
  const n = stillPossible(view, notHere).length + standing;
  return [
    pct !== null
      ? [`${pct}%`, "of your circle left"]
      : [String(n), n === 1 ? "station it could be" : "stations it could be"],
    [String(Math.max(0, Math.ceil((view.seekEnd - t) / 60))), "min left"],
    ...(first
      ? []
      : [[`+${view.bonusSeconds / 60}`, "min added to their score"] as [string, string]]),
  ];
}

/** On a phone: the numbers as one line under the round's name, beside the clock. */
function CompactNumbers({ world, view, t }: { world: World; view: SoloView; t: number }) {
  const cells = useRoundCells(world, view, t);
  return (
    <p className="sc-numbers-line">
      {cells.map(([value, label], i) => (
        <span key={label}>
          {i > 0 && " · "}
          <b>{value}</b> {label}
        </span>
      ))}
    </p>
  );
}

function RoundNumbers({
  world,
  view,
  t,
  links,
}: {
  world: World;
  view: SoloView;
  t: number;
  /** Sound and Give up under the numbers; on a phone they sit in the tab row instead. */
  links: boolean;
}) {
  // Plain words (the playable round): what each number is. A first round leaves out the
  // hider's score minutes until they matter, on the result.
  const cells = useRoundCells(world, view, t).map(([v, l]): [string, string] =>
    l === "min left" ? [v, "min left to find them"] : [v, l],
  );
  return (
    <>
      <div
        className={cn(
          "sc-numbers mx-4 grid border-t-2 border-ink",
          cells.length === 3 ? "grid-cols-3" : "grid-cols-2",
        )}
      >
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
      {links && <RoundLinks view={view} />}
    </>
  );
}

/**
 * "Sound" and "Give up", quiet links: under the numbers, or on a phone in the tab row
 * (`inline`), where the sound settings open as a drop-down under them.
 */
function RoundLinks({ view, inline = false }: { view: SoloView; inline?: boolean }) {
  const { send, alreadyPlayed, busy } = useGamePick("send", "alreadyPlayed", "busy");
  const [soundOpen, setSoundOpen] = useState(false);
  const { master, setMaster } = useSound();
  const giveUp = () => {
    const ask = view.daily
      ? `Give up and see where the hider was?${alreadyPlayed ? "" : " Today counts as not found."}`
      : "Give up and see where the hider was?";
    if (window.confirm(ask)) send({ type: "giveUp" });
  };
  const link = "whitespace-nowrap underline decoration-grout underline-offset-2 hover:text-ink";
  return (
    <>
      <div
        className={cn(
          "sc-numbers-links flex text-[12px] text-ink-2",
          // On a phone the tab row also holds the tabs and the sheet's toggle: tighter there.
          inline ? "relative ml-auto items-center gap-2 px-1.5" : "justify-end gap-3 px-4 pt-0.5",
        )}
      >
        {/* The one-tap mute, kept in this browser (DESIGN.md, Sound). */}
        <button
          type="button"
          aria-pressed={!master}
          onClick={() => setMaster(!master)}
          className={cn(link, inline && "min-w-[44px]")}
        >
          {master ? "Mute" : "Unmute"}
        </button>
        {/* On a phone the tab row is tight: the sound list opens from a caret by Mute. */}
        <button
          type="button"
          aria-expanded={soundOpen}
          aria-label={inline ? "Choose sounds" : undefined}
          onClick={() => setSoundOpen(!soundOpen)}
          className={inline ? "-ml-2 min-w-[32px] hover:text-ink" : link}
        >
          {inline ? "▾" : "Sound"}
        </button>
        <button type="button" disabled={busy} onClick={giveUp} className={link}>
          Give up
        </button>
        {inline && soundOpen && (
          // Six 44 px toggles outgrow the sheet below the tab row on a phone, so the list
          // opens upward over the numbers and the map, and scrolls if it must.
          <div className="absolute right-0 bottom-full z-30 max-h-[45dvh] w-[230px] overflow-y-auto">
            <SoundSettings />
          </div>
        )}
      </div>
      {!inline && soundOpen && <SoundSettings />}
    </>
  );
}

/**
 * Which sounds play (DESIGN.md, Interaction: Sound), under the one-tap mute. All start
 * on; with reduced motion asked for, the rumble and the pulse start off.
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

// --- The notice row ------------------------------------------------------------------

const COUNTS_KEY = storageKey("hints");

/** Whether "What counts" has been shown (kept with the old hints' key, so it stays seen). */
function countsSeen(): boolean {
  try {
    return (JSON.parse(localStorage.getItem(COUNTS_KEY) ?? "[]") as string[]).includes("counts");
  } catch {
    return false;
  }
}

/** "What counts", on the first arrival at the street: shown once, remembered here. */
function useWhatCounts(onFoot: boolean) {
  const [seen, setSeen] = useState(countsSeen);
  const show = onFoot && !seen;
  const markSeen = () => {
    setSeen(true);
    try {
      const old = JSON.parse(localStorage.getItem(COUNTS_KEY) ?? "[]") as string[];
      localStorage.setItem(COUNTS_KEY, JSON.stringify([...new Set([...old, "counts"])]));
    } catch {
      // Storage refused: it may show again next time.
    }
  };
  const was = useRef(false);
  useEffect(() => {
    // Shown, then the street left behind: it counts as seen.
    if (was.current && !show) markSeen();
    was.current = show;
  });
  return { show, dismiss: markSeen };
}

/** Each card the hider plays on you, explained the first time it lands (cardNotes.ts). */
function useCardNote(view: SoloView) {
  const t = useGameTime(1);
  const [seen, setSeen] = useState(loadSeenCards);
  const note = t === null || isHider(view) ? null : cardNote(view.cardEvents, t, seen);
  return {
    note,
    dismiss: () => {
      if (!note) return;
      const next = new Set(seen).add(note.card);
      setSeen(next);
      saveSeenCards(next);
    },
  };
}

function EndLine({ world, view }: { world: World; view: SoloView }) {
  const name = view.hider === null ? "" : complexLabel(world.ds, view.hider);
  return (
    <div className="mx-4 mt-2.5">
      <NextLine>{endLineText(view, name)}</NextLine>
    </div>
  );
}

/**
 * The notice row: a refused action, "What counts" at the street, then the next-move line,
 * which is always there while the round runs (nextMove.ts).
 */
function NoticeRow({
  view,
  onFoot,
  move,
}: {
  view: SoloView;
  onFoot: boolean;
  move: NextMove | null;
}) {
  const { notice, dismissNotice, alreadyPlayed } = useGamePick(
    "notice",
    "dismissNotice",
    "alreadyPlayed",
  );
  const counts = useWhatCounts(onFoot);
  const cards = useCardNote(view);
  const [playedSeen, setPlayedSeen] = useState(false);
  const text = notice ?? (counts.show ? WHAT_COUNTS : (cards.note?.text ?? null));
  return (
    <>
      {text && (
        <div key={text} className="sc-anim-set mx-4 mt-2.5">
          <Notice onDismiss={notice ? dismissNotice : counts.show ? counts.dismiss : cards.dismiss}>
            <span className="whitespace-pre-line">{text}</span>
          </Notice>
        </div>
      )}
      {!text && alreadyPlayed && !view.result && !playedSeen && (
        <div className="mx-4 mt-2.5">
          <Notice onDismiss={() => setPlayedSeen(true)}>
            You've played today's daily. This round won't change your result.
          </Notice>
        </div>
      )}
      {move && (
        <div className="mx-4 mt-2.5">
          <NextLine>
            <span key={move.line} className="sc-anim-step inline-block">
              {move.line}
            </span>
          </NextLine>
        </div>
      )}
    </>
  );
}

/** The wainscot's confirm for the armed question: "Ask · Radar 1 mi" and its price. */
function AskConfirm({ world, view, t }: { world: World; view: SoloView; t: number }) {
  const { armed, send, busy } = useGamePick("armed", "send", "busy");
  const next = useNextTarget();
  const first = useFirstRound();
  if (!armed) return null;
  const blocker = askBlocker(armed, view, t, world.idx);
  return (
    <>
      <Button
        kind="ink"
        keys="⏎"
        disabled={!!blocker || busy}
        next={next.kind === "askButton"}
        onClick={() => send({ type: "ask", question: armed })}
      >
        <span key={askLabel(armed)} className="sc-anim-step">
          {askLabel(armed)}
        </span>
      </Button>
      <WainscotText>
        {blocker ?? (first ? "The answer comes back in about 10 seconds." : priceText(armed))}
      </WainscotText>
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
      // A focused question chip doesn't own Enter: Enter asks what's armed. Nor does the
      // tab you're on, which you just clicked: Enter asks and Space skips ahead.
      const onControl =
        !!target?.closest("button, a, [role=slider]") &&
        !target?.closest('[data-chip], [role=tab][aria-selected="true"]');
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
  // The end-of-round reveal plays on the map only; the result card keeps the panel.
  const replaying = useReplay((s) => s.active && !s.reveal);
  const stack = usePlayLayout() === "stack";
  const { sheet, setSheet } = useSheet();
  const t = useGameTime(4);
  const now = useNow(4);
  const screen = useLinkScreen();
  const [zoom, setZoom] = useState<number | null>(null);
  const lost = useLeaving(screen.kind === "lost" ? screen : null, 280);
  const drops = useDrops(screen.kind === "lost");
  // The answered band collapses into the log rather than vanishing.
  const band = useLeaving(view && !view.result ? liveQuestion(view, now) : null, 280);
  useKeys(world, view, t);
  // The round just ended: open the sheet and show the result from its top, so the end
  // can't be missed under a scrolled list or a folded sheet (the playable round).
  const sheetBody = useRef<HTMLDivElement>(null);
  const ended = !!view?.result;
  // biome-ignore lint/correctness/useExhaustiveDependencies: on the round ending only
  useEffect(() => {
    if (!ended) return;
    if (stack) setSheet("open");
    sheetBody.current?.scrollTo({ top: 0 });
  }, [ended]);
  // The next move, worked out once for the line and the outline it draws (nextMove.ts).
  const live = !!(world && view && t !== null && !view.result && !isHider(view));
  const armedReady =
    live && armed !== null && world && view && t !== null
      ? askBlocker(armed, view, t, world.idx) === null
      : false;
  const move = useNextMove(live ? world : null, view, t, tab, armed, armedReady);
  // Stations you've stood in, in a round that ends at the station (notHere.ts).
  useEffect(() => {
    if (world && view && t !== null)
      useNotHere.getState().sync(view, checkedNow(view, t, world.idx));
  });
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

  if (isHider(view) && !view.result)
    return <HiderPanel world={world} view={view} t={t} top={<PanelTop t={t} world={world} />} />;

  // Mid-round with the link down: the round is paused, the controls dim, one band explains.
  const down = screen.kind !== "none";
  const over = view.result !== null;
  const onFoot = view.hasSpot && onStreet(view, t, world);
  const photos = arrivedPhotos(view);
  const lookingFor = onFoot ? [...photos].reverse().find((p) => p.q.from === "spot") : undefined;
  const asking = tab === "ask" && armed !== null && !over;
  // On a phone the tab row is the sheet's handle (layout.ts).
  const selectTab = (id: "travel" | "ask") => {
    if (!stack) return setTab(id);
    const next = tapTab({ tab, sheet }, id);
    setTab(next.tab);
    setSheet(next.sheet);
  };
  const toggle = sheetToggle(sheet);
  return (
    <NextTargetContext.Provider value={move?.target ?? NO_TARGET}>
      {/* A finished round's result never folds away: the sheet is for the round. */}
      <aside className={cn(aside, !over && "sc-sheet")}>
        {/* Another tab has the round, and its clock: this one doesn't know the time. */}
        <PanelTop
          t={screen.kind === "takenOver" ? null : t}
          world={world}
          numbers={stack && !over ? <CompactNumbers world={world} view={view} t={t} /> : undefined}
        />
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
              {!stack && <RoundNumbers world={world} view={view} t={t} links />}
              <div className="sc-tabrow flex items-center justify-between border-b border-grout px-4 pt-2 pb-2.5">
                <TabRow
                  tabs={[
                    { id: "travel", label: "Travel" },
                    { id: "ask", label: view.asked.length ? `Ask · ${view.asked.length}` : "Ask" },
                  ]}
                  active={tab}
                  onSelect={selectTab}
                  next={
                    move?.target.kind === "askTab"
                      ? "ask"
                      : move?.target.kind === "travelTab"
                        ? "travel"
                        : null
                  }
                />
                {stack && <RoundLinks view={view} inline />}
                {stack && (
                  <button
                    type="button"
                    className="sc-sheet-toggle sc-focus"
                    aria-expanded={sheet === "open"}
                    onClick={() => setSheet(toggle.next)}
                  >
                    {toggle.label}
                  </button>
                )}
              </div>
            </>
          )}
          <NoticeRow view={view} onFoot={onFoot && !over} move={over ? null : move} />
          {over && !isHider(view) && <EndLine world={world} view={view} />}
          {/* The question in its window, then its answer: above the list, so it's never
              scrolled out of view (the playable round; on a phone it was, 2026-11-27). */}
          {!over && band.value && (
            <div data-land="question" className={band.leaving ? "sc-anim-collapse" : undefined}>
              <QuestionBand
                key={`${band.value.at}|${questionKey(band.value.q)}`}
                a={band.value}
                world={world}
                t={t}
              />
            </div>
          )}
          <div className="sc-sheet-body contents">
            <CurseChips world={world} t={t} view={view} />
          </div>
          {lookingFor && (
            <LookingFor
              key={lookingFor.at}
              p={lookingFor}
              onOpen={() => setZoom(photos.indexOf(lookingFor))}
            />
          )}
          <div
            ref={sheetBody}
            className="sc-sheet-body min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-6"
          >
            {over ? (
              <>
                {isHider(view) ? (
                  <HiderResult world={world} view={view} />
                ) : (
                  <ResultCard world={world} />
                )}
                <QuestionLog world={world} />
              </>
            ) : (
              <>
                {/* The guide scrolls with the list, so a phone keeps room for the list; on
                    Ask it follows the marked question, which is what it points at. */}
                {tab === "travel" ? (
                  <>
                    {!onFoot && <Guide world={world} view={view} t={t} tab={tab} />}
                    <TravelPanel world={world} t={t} />
                  </>
                ) : (
                  <AskPanel
                    world={world}
                    t={t}
                    guide={!onFoot && <Guide world={world} view={view} t={t} tab={tab} />}
                  />
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
                  <TravelAction world={world} t={t} tab={tab} />
                )}
              </Wainscot>
            )}
        {zoom !== null && (
          <Lightbox photos={photos} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />
        )}
      </aside>
    </NextTargetContext.Provider>
  );
}
