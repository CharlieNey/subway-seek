/**
 * Keys (DESIGN.md, Interaction: Keyboard): 1–5 arm radar distances, Enter confirms, Esc
 * disarms or closes, B boards the first row, Space fast-forwards (Shift+Space to your
 * stop), and the arrows walk on the street. Each key is printed small on its control,
 * and a key just presses that control (`data-key`), so it does exactly what a click does.
 * A key typed into a control that already answers it (a focused button's Enter or Space)
 * is left to the control; a focused question chip doesn't count, so Enter after clicking
 * a chip asks rather than disarming it.
 */
export type KeyAction =
  | { kind: "disarm" }
  | { kind: "ask" }
  /** Press the control printed with `key`, on `tab` if it lives there. */
  | { kind: "press"; key: string; tab?: "ask" | "travel" }
  | null;

export interface KeyPress {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
export type Arrow = (typeof ARROWS)[number];

export function keyAction(
  e: KeyPress,
  { armed, canAsk, onControl }: { armed: boolean; canAsk: boolean; onControl: boolean },
): KeyAction {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const { key } = e;
  if (key === "Escape") return armed ? { kind: "disarm" } : null;
  if (key === "Enter") return armed && canAsk && !onControl ? { kind: "ask" } : null;
  if (/^[1-5]$/.test(key)) return { kind: "press", key, tab: "ask" };
  if (key === "b" || key === "B") return { kind: "press", key: "B", tab: "travel" };
  if (/^[hukvr]$/i.test(key)) return { kind: "press", key: key.toUpperCase() };
  if (key === " ") {
    if (onControl) return null;
    return { kind: "press", key: e.shiftKey ? "Shift+Space" : "Space" };
  }
  if ((ARROWS as readonly string[]).includes(key) && !onControl) return { kind: "press", key };
  return null;
}
