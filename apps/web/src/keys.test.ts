import { describe, expect, it } from "vitest";
import { keyAction } from "./keys.ts";

const idle = { armed: false, canAsk: false, onControl: false };

describe("keys", () => {
  it("Esc disarms the armed question, and does nothing with none armed", () => {
    expect(keyAction({ key: "Escape" }, { armed: true, canAsk: true, onControl: false })).toEqual({
      kind: "disarm",
    });
    expect(keyAction({ key: "Escape" }, idle)).toBeNull();
    // Even from a focused control.
    expect(keyAction({ key: "Escape" }, { armed: true, canAsk: false, onControl: true })).toEqual({
      kind: "disarm",
    });
  });

  it("Enter asks the armed question only when it can be asked", () => {
    expect(keyAction({ key: "Enter" }, { armed: true, canAsk: true, onControl: false })).toEqual({
      kind: "ask",
    });
    expect(
      keyAction({ key: "Enter" }, { armed: true, canAsk: false, onControl: false }),
    ).toBeNull();
    expect(keyAction({ key: "Enter" }, idle)).toBeNull();
  });

  it("leaves Enter and Space to a focused button, which would otherwise fire twice", () => {
    expect(keyAction({ key: "Enter" }, { armed: true, canAsk: true, onControl: true })).toBeNull();
    expect(keyAction({ key: " " }, { ...idle, onControl: true })).toBeNull();
  });

  it("presses the control printed with the key", () => {
    expect(keyAction({ key: "3" }, idle)).toEqual({ kind: "press", key: "3", tab: "ask" });
    expect(keyAction({ key: "6" }, idle)).toBeNull();
    expect(keyAction({ key: "b" }, idle)).toEqual({ kind: "press", key: "B", tab: "travel" });
    expect(keyAction({ key: " " }, idle)).toEqual({ kind: "press", key: "Space" });
    expect(keyAction({ key: " ", shiftKey: true }, idle)).toEqual({
      kind: "press",
      key: "Shift+Space",
    });
    expect(keyAction({ key: "ArrowUp" }, idle)).toEqual({ kind: "press", key: "ArrowUp" });
  });

  it("ignores other keys and the browser's shortcuts", () => {
    expect(keyAction({ key: "a" }, idle)).toBeNull();
    expect(keyAction({ key: "b", metaKey: true }, idle)).toBeNull();
    expect(keyAction({ key: "1", ctrlKey: true }, idle)).toBeNull();
  });
  it.each(["H", "U", "K", "V", "R"])(
    "presses the hider's printed %s control without switching tabs",
    (key) => {
      expect(keyAction({ key }, idle)).toEqual({ kind: "press", key });
      expect(keyAction({ key: key.toLowerCase() }, idle)).toEqual({ kind: "press", key });
      expect(keyAction({ key, metaKey: true }, idle)).toBeNull();
    },
  );
});
