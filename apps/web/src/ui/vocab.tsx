/**
 * The Mosaic vocabulary as React components (DESIGN.md, Interaction; the Deck page, part
 * thirteen). One shape per role. Styles live in mosaic.css.
 */
import type { LandmarkKind, Route } from "@stand-clear/data";
import { type CSSProperties, type ReactNode, useState } from "react";
import { cn } from "../cn.ts";
import type { Family } from "./family.ts";
import { pictCells } from "./pict.ts";
import { tileStates } from "./tiles.ts";

/** A black tile with white tracked caps: live information. Light is for map legends only. */
export function Caption({
  children,
  tone = "ink",
  className,
}: {
  children: ReactNode;
  tone?: "ink" | "light" | "terra";
  className?: string;
}) {
  return <span className={cn("sc-cap", tone !== "ink" && tone, className)}>{children}</span>;
}

/** Figures that line up: every time and count. */
export function Num({ children }: { children: ReactNode }) {
  return <span className="sc-num">{children}</span>;
}

export type ButtonKind = "ink" | "white" | "terra";

/**
 * Ink for the default action, white with a 2 px rule for the alternative, terra cotta
 * only for an action that fixes where you are. Presses 2 px. A disabled button carries
 * its reason in words beside it (`reason`), never a silent grey.
 */
export function Button({
  children,
  kind = "white",
  small,
  disabled,
  reason,
  keys,
  onClick,
  title,
  label,
  className,
}: {
  children: ReactNode;
  kind?: ButtonKind;
  small?: boolean;
  disabled?: boolean;
  reason?: string;
  /** The key that fires it, printed small on the control. */
  keys?: string;
  onClick?: () => void;
  title?: string;
  /** What a screen reader hears, when the visible text repeats down a list ("Get off"). */
  label?: string;
  className?: string;
}) {
  const button = (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={label}
      data-key={keys === "⏎" ? undefined : keys}
      className={cn("sc-btn", kind !== "white" && kind, small && "sm", className)}
    >
      {children}
      {keys && <Kbd>{keys}</Kbd>}
    </button>
  );
  if (!(disabled && reason)) return button;
  return (
    <span className="inline-flex items-center gap-2">
      {button}
      <span className="text-[12px] text-ink-2">{reason}</span>
    </span>
  );
}

/** A key, printed small in a hollow tile on the control it fires. */
export function Kbd({ children }: { children: ReactNode }) {
  return <span className="sc-kbd">{children}</span>;
}

/**
 * One tile per unit in its label, lifting as time runs out. With `lastTerra`, the last
 * tile standing turns terra cotta.
 */
export function TileTimer({
  total,
  left,
  size,
  onDark,
  lastTerra,
  className,
}: {
  total: number;
  left: number;
  /** Tile size in px. */
  size?: number;
  onDark?: boolean;
  lastTerra?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("sc-tiles", onDark && "on-dark", className)}
      style={size ? ({ "--t": `${size}px` } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      {tileStates(total, left, lastTerra).map((state, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tiles are positional
        <i key={i} className={state === "lit" ? undefined : state} />
      ))}
    </span>
  );
}

/** A section heading: small caps over a 2 px ink line, no fill. */
export function Rule({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("sc-rule", className)}>{children}</span>;
}

/** A light row with a terra cotta square; optional actions keep confirmation in the game. */
export function Notice({
  children,
  onDismiss,
  actions,
  dismissLabel = "Dismiss",
}: {
  children: ReactNode;
  onDismiss: () => void;
  actions?: ReactNode;
  dismissLabel?: string;
}) {
  if (actions)
    return (
      <div className="sc-notice cursor-default" role="alert">
        <span>
          {children}
          <span className="mt-2 flex gap-2">
            {actions}
            <Button small onClick={onDismiss}>
              {dismissLabel}
            </Button>
          </span>
        </span>
      </div>
    );
  return (
    <button type="button" className="sc-notice sc-focus" onClick={onDismiss}>
      <span>{children}</span>
      <small>{dismissLabel}</small>
    </button>
  );
}

/** The one main action for the state, on buff brick, with its cost in plain text beside it. */
export function Wainscot({ children }: { children: ReactNode }) {
  return <div className="sc-wains">{children}</div>;
}

export function WainscotText({ children }: { children: ReactNode }) {
  return <span className="sc-wains-text">{children}</span>;
}

/** The conductor's voice: a fixed moment's line, small and italic. */
export function Line({ children }: { children: ReactNode }) {
  return <p className="sc-line">{children}</p>;
}

/**
 * An error says three things: what happened, what's safe, and what to do. The header is
 * ink with a terra cotta square; the safe line has the locked-spot glyph; details for bug
 * reports sit in small monospace at the bottom.
 */
export function Plaque({
  title,
  children,
  safe,
  actions,
  details,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  safe?: ReactNode;
  actions?: ReactNode;
  details?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("sc-err", className)} role="alert">
      <div className="sc-err-h">{title}</div>
      <div className="sc-err-b">
        <div>{children}</div>
        {safe && <p className="sc-safe">{safe}</p>}
        {actions}
        {details && <p className="sc-det">{details}</p>}
      </div>
    </div>
  );
}

// --- Game information: squares ------------------------------------------------------

/** A family's square; hollow when its question was vetoed. Squares are game information. */
export function FamilySquare({
  family,
  vetoed,
  size,
  title,
}: {
  family: Family;
  vetoed?: boolean;
  size?: number;
  title?: string;
}) {
  return (
    <span
      className={cn("sc-sq", `fam-${family}`, vetoed && "vetoed")}
      style={size ? ({ "--s": `${size}px` } as CSSProperties) : undefined}
      title={title}
      aria-hidden={title ? undefined : true}
    />
  );
}

// --- Tabs and toggles ---------------------------------------------------------------

/** Square tiles in a row, the active one ink, never more than three. */
export function TabRow<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: T; label: ReactNode }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  if (tabs.length > 3) throw new Error("A tab row holds three tabs at most");
  return (
    <div className="sc-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          className="sc-tab sc-focus"
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** "Following you": a square toggle that lives on the map, beside the zoom buttons. */
export function FollowToggle({
  on,
  onToggle,
  disabled,
  label = "Following you",
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="sc-follow sc-focus"
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
    >
      <i />
      {label}
    </button>
  );
}

// --- Chips --------------------------------------------------------------------------

export type ChipState = "ready" | "armed" | "cooling" | "closed";

/**
 * A question's chip: a light tile, a 2 px rule, a family square at its left edge (or a
 * landmark's pictogram). Ready; armed (ink); cooling (dimmed, still previews on hover);
 * closed for the round after a veto (hollow, struck through, a hollow square).
 */
export function Chip({
  family,
  state = "ready",
  pict,
  count,
  keys,
  children,
  onClick,
  onHover,
  hover,
  title,
}: {
  family?: Family;
  state?: ChipState;
  /** A landmark chip carries its pictogram instead of the square. */
  pict?: LandmarkKind;
  /** Quiet trailing detail: "· 8 within 2 mi". */
  count?: ReactNode;
  keys?: string;
  children: ReactNode;
  onClick?: () => void;
  /** Hover previews the question without arming it. */
  onHover?: (on: boolean) => void;
  /** Show the hover state (for the component sheet). */
  hover?: boolean;
  title?: string;
}) {
  const closed = state === "closed";
  return (
    <button
      type="button"
      className={cn("sc-chip sc-focus", pict && "lm")}
      data-chip=""
      data-key={keys}
      data-state={state}
      data-hover={hover || undefined}
      aria-pressed={state === "armed"}
      aria-disabled={closed || undefined}
      title={closed ? (title ?? "Vetoed · closed this round") : title}
      onClick={closed ? undefined : onClick}
      onMouseEnter={onHover && (() => onHover(true))}
      onMouseLeave={onHover && (() => onHover(false))}
      onFocus={onHover && (() => onHover(true))}
      onBlur={onHover && (() => onHover(false))}
    >
      {pict ? (
        <Pict kind={pict} size={15} />
      ) : (
        family && <FamilySquare family={family} vetoed={closed} />
      )}
      {children}
      {count && <span className="sc-chip-n">{count}</span>}
      {keys && !closed && <Kbd>{keys}</Kbd>}
    </button>
  );
}

/**
 * A landmark's plaque: a buff-framed tile with its pictogram. Never a circle (trains) or a
 * bare square (game information). `nearest` frames it in ink.
 */
export function Pict({
  kind,
  size = 15,
  nearest,
}: {
  kind: LandmarkKind;
  size?: number;
  nearest?: boolean;
}) {
  return (
    <svg className="sc-pict" width={size} height={size} viewBox="0 0 13 13" aria-hidden="true">
      <rect
        x=".6"
        y=".6"
        width="11.8"
        height="11.8"
        fill="#FBF8F1"
        stroke={nearest ? "#24201B" : "#A9874F"}
        strokeWidth="1.1"
      />
      <g fill="#24201B">
        {pictCells(kind).map(([c, r]) => (
          <rect key={`${c}-${r}`} x={2 + c} y={2 + r} width="1.02" height="1.02" />
        ))}
      </g>
    </svg>
  );
}

// --- Lamps --------------------------------------------------------------------------

/** A 10 px square dot and a plain label. Lit is ink or the family color; unlit an outline. */
export function Lamp({
  lit,
  family,
  children,
}: {
  lit: boolean;
  family?: Family;
  children: ReactNode;
}) {
  return <span className={cn("sc-lamp", lit && "lit", family && `fam-${family}`)}>{children}</span>;
}

export function Lamps({ children }: { children: ReactNode }) {
  return <span className="sc-lamps">{children}</span>;
}

// --- Bands --------------------------------------------------------------------------

/** A local band (2 tiles) heads a ready category, in its family color, with its price. */
export function LocalBand({
  family,
  title,
  price,
}: {
  family: Family;
  title: ReactNode;
  price?: ReactNode;
}) {
  return (
    <div className={cn("sc-band-local sc-grid-lines", `fam-${family}`)}>
      <span>{title}</span>
      {price && <span className="sc-band-price">{price}</span>}
    </div>
  );
}

/**
 * The express band (3 tiles, with trim): the one thing that matters now. A question while
 * it's asked and answered; it collapses into its log row when it stops mattering.
 */
export function ExpressBand({
  family,
  label,
  children,
  role,
}: {
  family: Family | "ink";
  label: ReactNode;
  children?: ReactNode;
  role?: "status";
}) {
  return (
    <div
      className={cn("sc-band-express sc-grid-lines sc-anim-unroll", `fam-${family}`)}
      role={role}
    >
      <small>{label}</small>
      {children}
    </div>
  );
}

/**
 * The answer window: ten tiles, one a game-second's worth of real seconds, "Answer in 6 s".
 * It sits in the question's live band, so the count is hidden from screen readers (they'd
 * hear every second); they get one line that doesn't change, and the answer when it lands.
 */
export function AnswerWindow({ secondsLeft, total = 10 }: { secondsLeft: number; total?: number }) {
  const s = Math.max(0, Math.ceil(secondsLeft));
  return (
    <div className="sc-answer-window">
      <span aria-hidden="true">
        Answer in <b className="sc-num">{s}</b> s
      </span>
      <span className="sr-only">The answer comes in about {total} seconds.</span>
      <TileTimer total={total} left={s} size={9} onDark />
    </div>
  );
}

/** A cooling category, collapsed to one rule-row with its next time; it opens for planning. */
export function CoolRow({
  family,
  label,
  next,
  open,
  onToggle,
}: {
  family: Family;
  label: ReactNode;
  next: ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button type="button" className="sc-cool sc-focus" aria-expanded={open} onClick={onToggle}>
      <FamilySquare family={family} />
      <b>{label}</b>
      <span>{next}</span>
    </button>
  );
}

// --- The countdown clock ------------------------------------------------------------

/** The departure board as the real countdown clock: a black field with glaze type. */
export function CountdownBoard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="sc-cc sc-grid-lines" aria-label={label}>
      {children}
    </section>
  );
}

/** Small caps on the board: "↑ Uptown & Queens", with a note at the right ("Next two"). */
export function CountdownHeader({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="sc-cc-h">
      <span>{children}</span>
      <span>{note}</span>
    </div>
  );
}

/**
 * A row: bullet · destination · minutes, the minutes largest, the clock time small under
 * the destination, the next train after it. The whole row boards; "Board" shows on hover.
 * A row you can't make is disabled, with its reason in words.
 */
export function CountdownRow({
  route,
  dest,
  time,
  minutes,
  then,
  reason,
  struck,
  onBoard,
  hover,
  keys,
}: {
  route: Route;
  dest: string;
  /** "10:49". */
  time: string;
  minutes: number;
  /** The next train's minutes, "then 9 min". */
  then?: number | null;
  /** Why the row can't be boarded: dims it. */
  reason?: string | null;
  /** A curse rules it out: struck through as well as dimmed. */
  struck?: boolean;
  onBoard?: () => void;
  /** Show the hover state (for the component sheet). */
  hover?: boolean;
  keys?: string;
}) {
  return (
    <button
      type="button"
      className={cn("sc-cc-row", struck && "struck")}
      disabled={!!reason}
      data-key={keys}
      data-hover={hover || undefined}
      onClick={onBoard}
      aria-label={`${route.display} to ${dest}, ${minutes} min${reason ? `, ${reason}` : ""}`}
    >
      <RouteBullet route={route} size={22} />
      <div>
        <b className="sc-cc-dest">{dest}</b>
        <small>
          {time}
          {reason && ` · ${reason}`}
        </small>
      </div>
      <span className="sc-cc-go">Board{keys && <Kbd>{keys}</Kbd>}</span>
      <div className="sc-cc-min">
        <b>{minutes}</b>
        <em>min</em>
        {then !== undefined && then !== null && <small>then {then} min</small>}
      </div>
    </button>
  );
}

// --- Route bullets ------------------------------------------------------------------

/** An MTA route bullet: a circle (trains are circles), or a diamond for express variants. */
export function RouteBullet({ route, size = 22 }: { route: Route; size?: number }) {
  return (
    <span
      className={cn("sc-rb", route.diamond && "diamond")}
      style={
        {
          "--b": `${size}px`,
          backgroundColor: `#${route.color}`,
          color: `#${route.textColor}`,
        } as CSSProperties
      }
      title={route.name}
    >
      <span>{route.display}</span>
    </span>
  );
}

export function Bullets({ routes, size = 18 }: { routes: Route[]; size?: number }) {
  return (
    <span className="sc-rbs">
      {routes.map((r) => (
        <RouteBullet key={r.id} route={r} size={size} />
      ))}
    </span>
  );
}

// --- The clock ----------------------------------------------------------------------

export interface FastForward {
  /** "▸" or "▸▸". */
  glyph: string;
  /** What it skips to, said on hover: "Skip to the departure · Space". */
  title: string;
  /** Its key ("Space", "Shift+Space"): said in the title, as the buttons are one glyph wide. */
  key?: string;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * The time as a caption tile, nothing under it. Blank ("--:--") until the server answers;
 * "Paused" while stopped. In solo rounds, square fast-forward buttons to its right, and in
 * practice rounds Pause on its left. Digits step; nothing moves faster than the timetable.
 */
export function ClockTile({
  time,
  paused,
  ff,
  onPause,
}: {
  /** "10:47", or null before the server has said. */
  time: string | null;
  paused?: boolean;
  ff?: FastForward[];
  /** Practice rounds: pause or resume. */
  onPause?: () => void;
}) {
  const state = time === null ? "off" : paused ? "paused" : "";
  return (
    <div className={cn("sc-clock", state)}>
      {onPause && time !== null && (
        <button
          type="button"
          className={cn("sc-ff sc-focus", !paused && "pause")}
          title={paused ? "Resume" : "Pause"}
          aria-label={paused ? "Resume" : "Pause"}
          onClick={onPause}
        >
          {paused ? "▸" : null}
        </button>
      )}
      <span className="sc-cap">
        {/* The minutes flip (step) once per game minute; a fast-forward steps them too. */}
        <span
          key={time === null ? "off" : paused ? "paused" : time}
          className="sc-num sc-anim-step"
        >
          {time === null ? "--:--" : paused ? "Paused" : time}
        </span>
      </span>
      {time !== null &&
        !paused &&
        ff?.map((b) => (
          <button
            key={b.glyph}
            type="button"
            className="sc-ff sc-focus"
            data-key={b.key}
            title={b.title}
            aria-label={b.title}
            disabled={b.disabled}
            onClick={b.onClick}
          >
            {b.glyph}
          </button>
        ))}
    </div>
  );
}

// --- Photos -------------------------------------------------------------------------

/**
 * A photo in its plaque: a glaze mat with an ink edge, and a violet caption saying where
 * it's from and which way it faces. The image carries no location data, so the frame does
 * the explaining.
 */
export function PhotoPlaque({
  src,
  from,
  facing,
  onZoom,
  failed,
  onRetry,
  onError,
  small,
  reveal,
}: {
  /** Null: the empty frame (waiting, or vetoed). */
  src: string | null;
  from: string;
  facing: string;
  onZoom?: () => void;
  failed?: boolean;
  onRetry?: () => void;
  /** The image didn't load: the caller shows the failed frame. */
  onError?: () => void;
  small?: boolean;
  /** It just arrived: it sets into the plaque from the top edge down once it has loaded. */
  reveal?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <figure className="sc-plq" style={small ? { padding: 4 } : undefined}>
      {failed ? (
        <div className="sc-plq-fail">
          <span>The photo didn't load</span>
          {onRetry && (
            <Button small onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      ) : src ? (
        <div className="relative overflow-hidden">
          <img
            src={src}
            alt={`${from}, facing ${facing}`}
            onError={onError}
            onLoad={() => setLoaded(true)}
          />
          {reveal && (
            <i
              aria-hidden="true"
              className={cn("sc-plq-empty absolute inset-0", loaded && "sc-anim-reveal")}
            />
          )}
        </div>
      ) : (
        <div className="sc-plq-empty" />
      )}
      {src && !failed && onZoom && (
        <button type="button" className="sc-plq-zoom" aria-label="Enlarge" onClick={onZoom} />
      )}
      <figcaption className="sc-plq-c sc-grid-lines">
        <span>{from}</span>
        <span>Facing {facing}</span>
      </figcaption>
    </figure>
  );
}
