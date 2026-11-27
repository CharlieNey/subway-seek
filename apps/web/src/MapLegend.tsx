/**
 * The map's legend, top left (DESIGN.md, Interaction: legends on the map collapse to one
 * caption line once read). A light caption names what the map is showing; its key sits
 * under it until it's been read, then folds away. Clicking the caption opens it again.
 */
import {
  isAnswered,
  LANDMARK_WORDS,
  landmarksWithin,
  milesText,
  type Question,
  searchGrid,
  TENTACLE_MILES,
} from "@subway-seek/engine";
import { type ReactNode, useEffect, useState } from "react";
import { answerWord, radarLabel } from "./ask.ts";
import { useNow } from "./Connection.tsx";
import { useGame, type World } from "./game.ts";
import { shapeQuestion } from "./MapView.tsx";
import { useReplay } from "./replay.ts";
import { searchScene } from "./searchArea.ts";
import { storageKey } from "./storage.ts";
import { FAMILY_COLORS, type Family, familyOf } from "./ui/family.ts";
import { Caption, FamilySquare, Pict } from "./ui/vocab.tsx";
import { useGameTime } from "./useGameTime.ts";

/** How long a legend's key shows before it folds into its caption. */
const READ_MS = 6000;
const READ_KEY = storageKey("legends-read");

function loadRead(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

const swatch = (bg: string, shadow?: string) => (
  <i className="inline-block h-2.5 w-2.5 flex-none" style={{ background: bg, boxShadow: shadow }} />
);
const line = (color: string) => (
  <i className="inline-block h-[2.5px] w-3 flex-none" style={{ background: color }} />
);
const POSSIBLE = swatch("var(--color-ink)", "0 0 0 1.5px var(--color-glaze-hi)");
const OUT = swatch("var(--color-glaze-hi)", "inset 0 0 0 1.2px #B5AB97");

function questionTitle(q: Question): string {
  switch (q.kind) {
    case "radar":
      return `Radar · ${radarLabel(q.miles)} round you`;
    case "thermometer":
      return "Thermometer · the halfway line";
    case "matching":
      return `Matching · your nearest ${LANDMARK_WORDS[q.landmark].one}`;
    case "measuring":
      return `Measuring · ${LANDMARK_WORDS[q.landmark].many}`;
    case "tentacles":
      return `Nearest · ${LANDMARK_WORDS[q.landmark].many} within ${radarLabel(TENTACLE_MILES[q.landmark] ?? 0)}`;
    case "route":
      return `Matching · the ${q.letter}`;
    case "spotRadar":
      return `Street radar · ${q.meters} m round you`;
    case "spotThermometer":
      return "Hotter or colder · the halfway line";
    default:
      return "";
  }
}

/** The replay's key: the two players, and the questions as family squares. */
function ReplayKey() {
  // Terra is the other player, ink is you (map/layers.ts); yesterday's bot is neither.
  const { humanHider, botSeeker } = useReplay();
  const dot = (bg: string) => (
    <i
      className="inline-block h-2.5 w-2.5 flex-none rounded-full"
      style={{
        background: bg,
        boxShadow: "0 0 0 2px var(--color-glaze-hi), 0 0 0 3px var(--color-grout)",
      }}
    />
  );
  return (
    <div className="pointer-events-auto absolute top-3 left-3 z-10 flex flex-col gap-1 bg-glaze-hi px-2.5 py-[7px] text-[12px] text-ink-2 shadow-[inset_0_0_0_1px_var(--color-grout)] [&>span]:flex [&>span]:items-center [&>span]:gap-[7px]">
      <span>
        {dot("var(--color-terra)")} {humanHider ? "Seeker" : "Hider"}
      </span>
      <span>
        {dot("var(--color-ink)")} {botSeeker ? "Seeker" : "You"}
      </span>
      <span>
        <FamilySquare family="radar" size={10} /> Questions, by family
      </span>
      <span>
        <FamilySquare family="radar" size={10} vetoed /> Vetoed
      </span>
    </div>
  );
}

export function MapLegend({ world }: { world: World }) {
  const replaying = useReplay((s) => s.active);
  if (replaying) return <ReplayKey />;
  return <RoundLegend world={world} />;
}

function RoundLegend({ world }: { world: World }) {
  const view = useGame((s) => s.view);
  useGame((s) => s.hovered);
  useGame((s) => s.armed);
  const t = useGameTime(2);
  useNow(2);
  const [read, setRead] = useState(loadRead);
  const [open, setOpen] = useState<string | null>(null);
  if (!view || t === null) return null;

  const n = view.candidates.length;
  const possible = `${n} ${n === 1 ? "station" : "stations"} still possible`;
  const search = view.hasSpot ? searchScene(world, view, t) : null;
  const sq = view.result ? null : shapeQuestion(view, t, world);
  let id = "stations";
  let title: string = view.result ? "The hider's station" : "Stations";
  let keys: ReactNode[] = [
    <span key="p">{POSSIBLE} Still possible</span>,
    <span key="o">{OUT} Ruled out</span>,
  ];
  if (search) {
    const c = world.ds.complexes[search.complex];
    const pct = c ? Math.round((search.possible.length / searchGrid(c).length) * 100) : 0;
    id = "search";
    title = `Search area · ${pct}% left`;
    keys = [
      <span key="t">{swatch("rgb(36 32 27 / 0.47)")} Where they could still be</span>,
      <span key="r">
        {swatch("transparent", "inset 0 0 0 2px var(--color-ink)")} 400 m round your station
      </span>,
    ];
  }
  if (sq) {
    const f: Family = familyOf(sq.q);
    const color = FAMILY_COLORS[f].fill;
    const answer = sq.answer;
    if (answer && isAnswered({ ...sq, answer } as never)) {
      id = "answered";
      title = `${answerWord(answer, sq.q, world.idx)} · ${n} left`;
      keys = [<span key="p">{POSSIBLE} Still possible</span>, <span key="o">{OUT} Cleared</span>];
    } else if (questionTitle(sq.q)) {
      id = sq.q.kind;
      title = questionTitle(sq.q);
      const q = sq.q;
      keys =
        q.kind === "matching" || q.kind === "measuring" || q.kind === "tentacles"
          ? [
              <span key="l">
                <Pict kind={q.landmark} size={13} />{" "}
                {q.kind === "tentacles"
                  ? `${landmarksWithin(world.ds, q.landmark, sq.ctx.origin, TENTACLE_MILES[q.landmark] ?? 0).length} in range`
                  : LANDMARK_WORDS[q.landmark].many.replace(/^./, (c) => c.toUpperCase())}
              </span>,
              <span key="s">
                {line(color)}{" "}
                {q.kind === "matching"
                  ? "Where each one is nearest"
                  : q.kind === "measuring"
                    ? "Your distance, round each one"
                    : `Within ${milesText(TENTACLE_MILES[q.landmark] ?? 0)} of you`}
              </span>,
              <span key="p">
                {POSSIBLE} {possible}
              </span>,
            ]
          : [
              <span key="s">
                {line(color)}{" "}
                {q.kind === "route"
                  ? `The ${q.letter}'s line`
                  : q.kind === "radar"
                    ? `${radarLabel(q.miles)} round you: Yes keeps inside`
                    : q.kind === "spotRadar"
                      ? `${q.meters} m round you: Yes keeps inside`
                      : q.kind === "thermometer" || q.kind === "spotThermometer"
                        ? "Halfway between your readings"
                        : "No shape: the answer is about their station"}
              </span>,
              <span key="p">
                {POSSIBLE} {possible}
              </span>,
            ];
    }
  }
  const unread = !read.has(id);
  const expanded = open === id || unread;
  return (
    <LegendBox
      key={id}
      title={title}
      expanded={expanded}
      unread={unread}
      onRead={() =>
        setRead((r) => {
          const next = new Set(r).add(id);
          try {
            localStorage.setItem(READ_KEY, JSON.stringify([...next]));
          } catch {
            // Storage refused: the key shows again next time.
          }
          return next;
        })
      }
      onToggle={() => setOpen(open === id ? null : id)}
    >
      {keys}
    </LegendBox>
  );
}

function LegendBox({
  title,
  expanded,
  unread,
  onRead,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  unread: boolean;
  onRead: () => void;
  onToggle: () => void;
  children: ReactNode;
}) {
  // Once it's been on screen long enough to read, it folds into its caption.
  useEffect(() => {
    if (!unread) return;
    const id = setTimeout(onRead, READ_MS);
    return () => clearTimeout(id);
  }, [unread, onRead]);
  return (
    <div className="pointer-events-auto absolute top-3 left-3 z-10 flex max-w-[calc(100%-24px)] flex-col items-start gap-1.5">
      <button
        type="button"
        className="sc-focus sc-legend-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <Caption tone="light">{title}</Caption>
      </button>
      {expanded && (
        <div className="flex flex-col gap-1 bg-glaze-hi px-2.5 py-[7px] text-[12px] text-ink-2 shadow-[inset_0_0_0_1px_var(--color-grout)] [&>span]:flex [&>span]:items-center [&>span]:gap-[7px]">
          {children}
        </div>
      )}
    </div>
  );
}
