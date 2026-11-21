/**
 * This browser's storage keys, all under the game's slug (brand.ts): `stand-clear:sound`.
 * A rename moves the slug, so `migrateStorage` runs once per page load, before anything
 * reads storage, and moves keys from older names: the game's former slugs (brand.json's
 * `formerSlugs`) and the four `standClear.…` keys from before 2026-11-21. A key already
 * under the new name wins; the old one is removed either way. Decided 2026-11-21
 * (DESIGN.md, Decision log): rename the keys, with this one-time move.
 */
import { FORMER_SLUGS, GAME_SLUG } from "./brand.ts";

export function storageKey(name: string): string {
  return `${GAME_SLUG}:${name}`;
}

/** Keys that used a different scheme before the slug prefix, and their names now. */
const LEGACY: Record<string, string> = {
  "standClear.legendsRead": "legends-read",
  "standClear.hints": "hints",
  "standClear.session": "session",
  "standClear.sound": "sound",
};

type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** Where an old key goes now, or null if it's current or not ours. */
export function migratedKey(key: string, slug: string, former: readonly string[]): string | null {
  const legacy = LEGACY[key];
  if (legacy) return `${slug}:${legacy}`;
  for (const f of former) {
    if (f !== slug && key.startsWith(`${f}:`)) return `${slug}:${key.slice(f.length + 1)}`;
  }
  return null;
}

/** Move old keys to the current slug. Returns how many it moved or dropped. */
export function migrateStorage(
  store: KeyStore | undefined = safeLocalStorage(),
  slug: string = GAME_SLUG,
  former: readonly string[] = FORMER_SLUGS,
): number {
  if (!store) return 0;
  let moved = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k !== null) keys.push(k);
    }
    for (const key of keys) {
      const to = migratedKey(key, slug, former);
      if (!to) continue;
      const value = store.getItem(key);
      if (value !== null && store.getItem(to) === null) store.setItem(to, value);
      store.removeItem(key);
      moved += 1;
    }
  } catch {
    // Private windows can refuse storage; there is nothing to move then.
  }
  return moved;
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
