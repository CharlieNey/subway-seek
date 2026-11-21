/**
 * The game's name, in one place. Every page, title, link preview, tablet and share line
 * reads it from here, and `index.html` and `terms.html` get it through Vite
 * (`%VITE_GAME_NAME%`). To rename: `pnpm rename "<New Name>"` (scripts/rename.ts), which
 * rewrites brand.json and the things that can't read it (package scope, docs).
 *
 * `slug` prefixes this browser's storage keys (storage.ts); `formerSlugs` are the prefixes
 * before a rename, moved over once on the next visit so nobody loses a streak.
 */
import brand from "./brand.json";

export const GAME_NAME: string = brand.name;
export const GAME_SLUG: string = brand.slug;
export const FORMER_SLUGS: readonly string[] = brand.formerSlugs;
