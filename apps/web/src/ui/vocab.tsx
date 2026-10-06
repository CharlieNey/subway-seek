/**
 * The Mosaic vocabulary as React components (DESIGN.md, Interaction; the Deck page, part
 * thirteen). One shape per role. Styles live in mosaic.css.
 */
import type { ReactNode } from "react";
import { cn } from "../cn.ts";

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
  className?: string;
}) {
  const button = (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
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
  const lit = Math.max(0, Math.min(total, Math.ceil(left)));
  return (
    <span
      className={cn("sc-tiles", onDark && "on-dark", className)}
      style={size ? ({ "--t": `${size}px` } as React.CSSProperties) : undefined}
      aria-hidden="true"
    >
      {Array.from({ length: total }, (_, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: tiles are positional
          key={i}
          className={cn(i >= lit && "gone", lastTerra && lit === 1 && i === 0 && "last")}
        />
      ))}
    </span>
  );
}

/** A section heading: small caps over a 2 px ink line, no fill. */
export function Rule({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("sc-rule", className)}>{children}</span>;
}

/** A light row with a terra cotta square, dismissed by clicking. */
export function Notice({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  return (
    <button type="button" className="sc-notice sc-focus" onClick={onDismiss}>
      <span>{children}</span>
      <small>Dismiss</small>
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
