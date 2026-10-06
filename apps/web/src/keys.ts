/**
 * Keys (DESIGN.md, Interaction: Keyboard): Esc disarms, Enter confirms the armed question.
 * Each key is printed small on its control. A key typed into a control that already
 * answers it (a focused button's Enter) is left to the control; a focused question chip
 * doesn't count, so Enter after clicking a chip asks rather than disarming it.
 */
export type KeyAction = "disarm" | "ask" | null;

export function keyAction(
  key: string,
  { armed, canAsk, onControl }: { armed: boolean; canAsk: boolean; onControl: boolean },
): KeyAction {
  if (key === "Escape") return armed ? "disarm" : null;
  if (key === "Enter") return armed && canAsk && !onControl ? "ask" : null;
  return null;
}
