/**
 * What `pnpm rename` changes in a file, as pure functions (scripts/rename.ts does the
 * files, the install and the preview image). The inventory it follows is in DESIGN.md's
 * decision log, 2026-11-21, "The game's name in one place".
 */

export interface Brand {
  name: string;
  slug: string;
  formerSlugs: string[];
}

/** "Subway Seek" → "subway-seek": the package scope, storage prefix and Fly app name. */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Letters, digits, spaces and a few marks the tablet can set and HTML needs no escaping
 * for (index.html takes the name raw through `%VITE_GAME_NAME%`). Null if it's fine.
 */
export function nameProblem(name: string): string | null {
  if (name.trim() !== name) return "The name has spaces at its ends.";
  if (name.length < 2 || name.length > 32) return "The name should be 2 to 32 characters.";
  if (!/^[A-Za-z0-9][A-Za-z0-9 '’.-]*$/.test(name))
    return "Use letters, digits, spaces, apostrophes, periods and hyphens only.";
  if (!/[a-z]/.test(slugOf(name))) return "The name needs at least one letter.";
  return null;
}

/** The next brand.json: the old slug joins formerSlugs so storage.ts moves its keys over. */
export function nextBrand(from: Brand, name: string): Brand {
  const slug = slugOf(name);
  const formerSlugs = [...from.formerSlugs, from.slug].filter(
    (s, i, all) => s !== slug && all.indexOf(s) === i,
  );
  return { name, slug, formerSlugs };
}

/** A line with this anywhere in it is left alone: `<!-- keep-name -->`, `// keep-name`. */
export const KEEP_MARK = "keep-name";

/**
 * Files never rewritten. The old AWS setup is deleted, not renamed (DEPLOY-PLAN, Retire
 * the old setup); storage.ts and its test name the old keys on purpose; brand.json is
 * written whole; the rename's own files are its rules.
 */
export function skipFile(path: string): boolean {
  return (
    path.startsWith("infra/aws/") ||
    path.startsWith("apps/server/logs/") ||
    path === "apps/web/src/brand.json" ||
    path === "apps/web/src/storage.ts" ||
    path === "apps/web/src/storage.test.ts" ||
    path.startsWith("scripts/rename")
  );
}

const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The replacements, in order. What is deliberately not here:
 * - the daily seed `<slug>-daily|` (packages/engine/src/daily.ts): changing it changes
 *   every day's station;
 * - the Google Cloud project id `stand-clear-nyc`, which can't be renamed;
 * - "Stand clear of the closing doors", the announcement, which isn't the name;
 * - the folder `~/stand-clear` and the GitHub repo path, until Charlie renames the repo.
 */
export function rules(from: Brand, to: Brand, path: string): [RegExp, string][] {
  const out: [RegExp, string][] = [
    [new RegExp(`@${literal(from.slug)}/`, "g"), `@${to.slug}/`],
    [new RegExp(`\\b${literal(from.slug)}-server\\b`, "g"), `${to.slug}-server`],
    [new RegExp(`\\b${literal(from.slug)}-dataset-build\\b`, "g"), `${to.slug}-dataset-build`],
    [new RegExp(`(tmpdir\\(\\), ")${literal(from.slug)}-`, "g"), `$1${to.slug}-`],
    [
      new RegExp(`(?<![A-Za-z])${literal(from.name)}(?![A-Za-z]| of the closing doors)`, "g"),
      to.name,
    ],
    [
      new RegExp(`(?<![A-Za-z])${literal(from.name.toUpperCase())}(?![A-Z]| OF THE CLOSING)`, "g"),
      to.name.toUpperCase(),
    ],
  ];
  if (path === "package.json")
    out.push([new RegExp(`"name": "${literal(from.slug)}"`), `"name": "${to.slug}"`]);
  return out;
}

/** One file's text after the rename, and how many replacements it took. */
export function renameText(
  text: string,
  from: Brand,
  to: Brand,
  path: string,
): { text: string; count: number } {
  const list = rules(from, to, path);
  let count = 0;
  const lines = text.split("\n").map((line) => {
    if (line.includes(KEEP_MARK)) return line;
    let next = line;
    for (const [re, sub] of list)
      next = next.replace(re, (...m) => {
        count++;
        // `$1` in the substitute: put the captured group back.
        return sub.replace("$1", typeof m[1] === "string" ? m[1] : "");
      });
    return next;
  });
  return { text: lines.join("\n"), count };
}
