import { describe, expect, it } from "vitest";
import { migratedKey, migrateStorage, storageKey } from "./storage.ts";

/** A Storage stand-in backed by a Map, in insertion order. */
function fakeStore(entries: Record<string, string>) {
  const m = new Map(Object.entries(entries));
  return {
    m,
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("storage keys", () => {
  it("prefixes keys with the game's slug", () => {
    expect(storageKey("sound")).toMatch(/^[a-z0-9-]+:sound$/);
  });

  it("maps the four pre-slug keys and former slugs, and leaves the rest", () => {
    expect(migratedKey("standClear.session", "step-lively", [])).toBe("step-lively:session");
    expect(migratedKey("standClear.legendsRead", "x", [])).toBe("x:legends-read");
    expect(migratedKey("stand-clear:daily-results:v1", "step-lively", ["stand-clear"])).toBe(
      "step-lively:daily-results:v1",
    );
    expect(migratedKey("step-lively:sound", "step-lively", ["stand-clear"])).toBeNull();
    expect(migratedKey("stand-clear-other:x", "step-lively", ["stand-clear"])).toBeNull();
    expect(migratedKey("someone-else", "step-lively", ["stand-clear"])).toBeNull();
  });

  it("moves a renamed game's record once, keeping anything already under the new name", () => {
    const store = fakeStore({
      "stand-clear:daily-results:v1": '{"2026-11-20":1}',
      "stand-clear:sound": '{"chime":true}',
      "step-lively:sound": '{"chime":false}',
      "standClear.hints": '["ask"]',
      unrelated: "keep",
    });
    expect(migrateStorage(store, "step-lively", ["stand-clear"])).toBe(3);
    expect(Object.fromEntries(store.m)).toEqual({
      "step-lively:daily-results:v1": '{"2026-11-20":1}',
      "step-lively:sound": '{"chime":false}',
      "step-lively:hints": '["ask"]',
      unrelated: "keep",
    });
    // A second run finds nothing to move.
    expect(migrateStorage(store, "step-lively", ["stand-clear"])).toBe(0);
  });

  it("chains through two renames", () => {
    const store = fakeStore({ "stand-clear:daily-replay:v3": "a", "hidden-stop:hints": "b" });
    migrateStorage(store, "step-lively", ["stand-clear", "hidden-stop"]);
    expect(Object.fromEntries(store.m)).toEqual({
      "step-lively:daily-replay:v3": "a",
      "step-lively:hints": "b",
    });
  });

  it("survives a store that throws", () => {
    const broken = {
      length: 1,
      key: () => {
        throw new Error("denied");
      },
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    expect(migrateStorage(broken, "x", [])).toBe(0);
  });
});
