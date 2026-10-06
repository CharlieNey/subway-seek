import { describe, expect, it } from "vitest";
import { keyAction } from "./keys.ts";

describe("keys", () => {
  it("Esc disarms the armed question, and does nothing with none armed", () => {
    expect(keyAction("Escape", { armed: true, canAsk: true, onControl: false })).toBe("disarm");
    expect(keyAction("Escape", { armed: false, canAsk: false, onControl: false })).toBeNull();
    // Even from a focused control.
    expect(keyAction("Escape", { armed: true, canAsk: false, onControl: true })).toBe("disarm");
  });

  it("Enter asks the armed question only when it can be asked", () => {
    expect(keyAction("Enter", { armed: true, canAsk: true, onControl: false })).toBe("ask");
    expect(keyAction("Enter", { armed: true, canAsk: false, onControl: false })).toBeNull();
    expect(keyAction("Enter", { armed: false, canAsk: false, onControl: false })).toBeNull();
  });

  it("leaves Enter to a focused button, which would otherwise fire twice", () => {
    expect(keyAction("Enter", { armed: true, canAsk: true, onControl: true })).toBeNull();
  });

  it("ignores other keys", () => {
    expect(keyAction("a", { armed: true, canAsk: true, onControl: false })).toBeNull();
  });
});
