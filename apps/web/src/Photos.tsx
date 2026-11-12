/**
 * Photo questions on the seeker's side (DESIGN.md, Photos; the Deck page, part ten): the
 * two compasses for asking, the photo arriving in its plaque, the newest spot photo pinned
 * as "Looking for" while on foot, and the enlarged view with Esc and the arrow keys.
 */
import {
  type Photo,
  type PhotoLook,
  type Question,
  type SeenQuestion,
  type SoloView,
  syncedGameTime,
} from "@stand-clear/engine";
import { useEffect, useId, useRef, useState } from "react";
import { type ChipState, hhmm, LOOK_WORD } from "./ask.ts";
import { reducedMotion } from "./clearings.ts";
import { cn } from "./cn.ts";
import { useGame } from "./game.ts";
import { photoUrl } from "./street.ts";
import { Button, PhotoPlaque } from "./ui/vocab.tsx";

const GRID: (PhotoLook | "nw" | "ne" | "sw" | "se")[] = [
  "nw",
  "N",
  "ne",
  "W",
  "up",
  "E",
  "sw",
  "S",
  "se",
];
const isLook = (x: string): x is PhotoLook =>
  x === "N" || x === "E" || x === "S" || x === "W" || x === "up";

/**
 * A compass: N, E, S and W round the edge and Up in the middle. Each direction is a chip:
 * hover previews it, a click arms it.
 */
export function Compass({
  label,
  from,
  stateOf,
  onArm,
  onHover,
  dimmed,
  unavailable,
}: {
  label: string;
  from: "exit" | "spot";
  stateOf: (q: Question) => ChipState;
  onArm: (q: Question) => void;
  onHover: (q: Question | null) => void;
  dimmed?: boolean;
  unavailable?: string;
}) {
  const reasonId = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", dimmed && !unavailable && "opacity-40")}>
      <span className="text-[12px] text-ink-2">{label}</span>
      <div
        className={cn(
          "grid grid-cols-[repeat(3,34px)] grid-rows-[repeat(3,30px)] gap-[3px]",
          unavailable && "opacity-40",
        )}
      >
        {GRID.map((look) => {
          if (!isLook(look)) return <i key={look} />;
          const q: Question = { kind: "photo", from, look };
          const state = stateOf(q);
          return (
            <button
              key={look}
              type="button"
              data-chip=""
              aria-label={`Photo from ${from === "exit" ? "their exit" : "their spot"}, facing ${LOOK_WORD[look]}`}
              aria-pressed={state === "armed"}
              disabled={!!unavailable}
              aria-describedby={unavailable ? reasonId : undefined}
              title={unavailable ?? (state === "closed" ? "Vetoed · closed this round" : undefined)}
              onClick={unavailable || state === "closed" ? undefined : () => onArm(q)}
              onMouseEnter={unavailable ? undefined : () => onHover(q)}
              onMouseLeave={() => onHover(null)}
              onFocus={unavailable ? undefined : () => onHover(q)}
              onBlur={() => onHover(null)}
              className={cn(
                "sc-focus flex items-center justify-center font-display text-[12px] font-bold tracking-[0.08em] uppercase",
                "shadow-[inset_0_0_0_1.5px_var(--color-ink)]",
                look === "up" ? "bg-glaze" : "bg-glaze-hi",
                state === "armed" && "bg-ink text-glaze-hi",
                state === "ready" &&
                  "hover:bg-glaze hover:shadow-[inset_0_0_0_3px_var(--color-ink)]",
                state === "closed" && "cursor-not-allowed text-ink-3 line-through",
              )}
            >
              {look === "up" ? "Up" : look}
            </button>
          );
        })}
      </div>
      {unavailable && (
        <p id={reasonId} className="max-w-[130px] text-[12px] leading-[1.4] text-ink-2">
          {unavailable}
        </p>
      )}
    </div>
  );
}

/** Every photo answer that arrived, oldest first, with what it was. */
export interface ArrivedPhoto {
  photo: Photo;
  q: Extract<Question, { kind: "photo" }>;
  at: number;
  answerAt: number;
}

export function arrivedPhotos(view: SoloView): ArrivedPhoto[] {
  const out: ArrivedPhoto[] = [];
  for (const a of view.asked) {
    const ans = a.answer;
    if (a.q.kind === "photo" && ans && typeof ans === "object" && "photo" in ans) {
      out.push({ photo: ans.photo, q: a.q, at: a.at, answerAt: a.answerAt });
    }
  }
  return out;
}

export const photoFrom = (q: { from: "exit" | "spot" }) =>
  q.from === "exit" ? "Their exit" : "Their spot";
export const photoFacing = (look: PhotoLook) => (look === "up" ? "Up" : look);

/** A photo answer's image, with the failed-load frame and a free retry. */
export function PhotoImage({
  p,
  onZoom,
  small,
}: {
  p: ArrivedPhoto;
  onZoom?: () => void;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // It sets into its plaque only as it arrives; after a refresh it's simply there.
  const [reveal] = useState(() => {
    const sync = useGame.getState().sync;
    if (!sync || reducedMotion()) return false;
    return ((syncedGameTime(sync, Date.now()) - p.answerAt) * 1000) / sync.speed < 3000;
  });
  return (
    <div>
      <PhotoPlaque
        src={photoUrl(p.photo)}
        from={photoFrom(p.q)}
        facing={photoFacing(p.q.look)}
        onZoom={onZoom}
        failed={failed}
        onRetry={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
        small={small}
        reveal={reveal && attempt === 0}
        key={attempt}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/**
 * On foot, the newest spot photo is pinned at the top of the panel as a compact row, so
 * it stays beside Street View while you walk. Clicking it enlarges it.
 */
export function LookingFor({ p, onOpen }: { p: ArrivedPhoto; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="sc-focus sc-anim-set mx-4 mt-2.5 flex w-[calc(100%-32px)] items-center gap-2.5 bg-glaze-hi py-[5px] pr-2.5 pl-[11px] text-left shadow-[inset_0_0_0_1.5px_var(--color-ink),inset_5px_0_0_var(--color-photo)]"
    >
      <img
        src={photoUrl(p.photo)}
        alt={`${photoFrom(p.q)}, facing ${photoFacing(p.q.look)}`}
        className="block aspect-[16/10] w-[118px] flex-none object-cover"
      />
      <span className="min-w-0">
        <small className="block font-display text-[12px] font-bold tracking-[0.08em] text-photo uppercase">
          Looking for
        </small>
        <b className="block text-[13.5px] font-semibold">
          {p.q.from === "spot" ? "Spot" : "Exit"} photo · facing {photoFacing(p.q.look)}
        </b>
        <span className="text-[11.5px] text-ink-2">
          Arrived {hhmm(p.answerAt)} · click to enlarge
        </span>
      </span>
    </button>
  );
}

/**
 * The enlarged view: the photo fills the screen on a dark backdrop with its caption and
 * the question. Esc or Close returns; with several photos the arrow keys step through.
 */
export function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: ArrivedPhoto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Focus moves into the dialog and back to where it was when it closes.
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.querySelector<HTMLElement>("button")?.focus();
    return () => back?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") return trapTab(e, box.current);
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
      else if (e.key === "ArrowRight") onIndex(Math.min(photos.length - 1, index + 1));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, photos.length, onIndex, onClose]);
  const p = photos[index];
  if (!p) return null;
  return (
    <div
      ref={box}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(36_32_27/0.82)] p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
    >
      <div className="absolute top-[18px] right-6 left-6 flex items-center justify-between text-[13px] text-glaze-hi">
        <span>
          {p.q.from === "exit" ? "From their station's exit" : "From where they're hiding"}, facing{" "}
          {LOOK_WORD[p.q.look]} · asked {hhmm(p.at)}
          {photos.length > 1 && ` · ${index + 1} of ${photos.length}`}
        </span>
        <Button small onClick={onClose} keys="Esc">
          Close
        </Button>
      </div>
      <div className="w-[760px] max-w-full">
        <PhotoImage p={p} />
      </div>
    </div>
  );
}

/** Tab and Shift+Tab go round the dialog's own controls and never leave it. */
function trapTab(e: KeyboardEvent, dialog: HTMLElement | null) {
  if (!dialog) return;
  const controls = [
    ...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ];
  const first = controls[0];
  const last = controls.at(-1);
  const at = document.activeElement;
  e.preventDefault();
  e.stopPropagation();
  if (!first || !last) return;
  const i = controls.indexOf(at as HTMLElement);
  const next = e.shiftKey
    ? i <= 0
      ? last
      : controls[i - 1]
    : i < 0 || at === last
      ? first
      : controls[i + 1];
  next?.focus();
}

/** The question's band body for a photo: the empty frame while it's on its way. */
export function PendingPhoto({ a }: { a: SeenQuestion }) {
  if (a.q.kind !== "photo") return null;
  return (
    <div className="w-[200px] bg-[rgb(251_248_241/0.12)] p-1 shadow-[inset_0_0_0_1.5px_rgb(251_248_241/0.6)]">
      <div className="sc-plq-empty" style={{ background: "rgb(251 248 241 / 0.12)" }} />
    </div>
  );
}
