/**
 * Renames the game in one step:
 *
 *   pnpm rename "Subway Seek"              # rename, reinstall, redraw the link preview
 *   pnpm rename "Subway Seek" --dry-run    # list what would change
 *   pnpm rename "Subway Seek" --no-install --no-og
 *
 * It rewrites apps/web/src/brand.json (the name every page reads, brand.ts), moving the
 * old slug onto `formerSlugs` so each browser's storage keys move over once (storage.ts);
 * then the package scope, the Fly app name and the name in the docs, in every tracked text
 * file (the rules and what they leave alone: renameRules.ts). Then `pnpm install` for the
 * lockfile and links, and the link-preview image (apps/web/scripts/og/render.mjs). Last,
 * it prints what only Charlie can do: the repo, the domain, the cloud consoles.
 *
 * Run it on a clean working tree, so `git diff` shows exactly what it did and
 * `git checkout . && git clean -fd` undoes it.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Brand, nameProblem, nextBrand, renameText, skipFile } from "./renameRules.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((a) => a !== "--");
const flags = new Set(args.filter((a) => a.startsWith("--")));
const name = args.find((a) => !a.startsWith("--"));
const dry = flags.has("--dry-run");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!name) fail('Usage: pnpm rename "<New Name>" [--dry-run] [--no-install] [--no-og]');
const problem = nameProblem(name);
if (problem) fail(problem);

const brandPath = path.join(root, "apps/web/src/brand.json");
const from = JSON.parse(readFileSync(brandPath, "utf8")) as Brand;
const to = nextBrand(from, name);
if (to.name === from.name && to.slug === from.slug) fail(`The game is already called ${name}.`);

const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8" });
if (!dry && !flags.has("--allow-dirty") && git("status", "--porcelain").trim())
  fail("Commit or stash first: the rename should be the only change (or pass --allow-dirty).");

const BINARY = /\.(png|gif|jpe?g|webp|ico|woff2?|ttf|otf|sqlite|pbf|bin|zip|gz|pdf)$/i;
const files = git("ls-files", "-z")
  .split("\0")
  .filter((f) => f && !BINARY.test(f) && !skipFile(f));

console.log(`${from.name} (${from.slug}) → ${to.name} (${to.slug})${dry ? ", dry run" : ""}\n`);
let total = 0;
for (const file of files) {
  const full = path.join(root, file);
  let text: string;
  try {
    text = readFileSync(full, "utf8");
  } catch {
    continue; // deleted in the working tree
  }
  if (text.includes("\0")) continue;
  const out = renameText(text, from, to, file);
  if (!out.count) continue;
  total += out.count;
  console.log(`  ${String(out.count).padStart(4)}  ${file}`);
  if (!dry) writeFileSync(full, out.text);
}
console.log(`\n${total} replacements, and brand.json: ${JSON.stringify(to)}`);
if (dry) process.exit(0);
writeFileSync(brandPath, `${JSON.stringify(to, null, 2)}\n`);

function run(cmd: string, a: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  console.log(`\n$ ${cmd} ${a.join(" ")}`);
  return spawnSync(cmd, a, {
    cwd: opts.cwd ?? root,
    env: opts.env ?? process.env,
    stdio: "inherit",
  }).status;
}

if (!flags.has("--no-install") && run("pnpm", ["install"]) !== 0)
  fail("pnpm install failed; the files are renamed. Fix it and run `pnpm install` again.");

let og = "skipped (--no-og)";
if (!flags.has("--no-og")) {
  // render.mjs needs puppeteer-core or playwright-core somewhere, and Chrome (README there).
  const status = run("node", ["scripts/og/render.mjs"], { cwd: path.join(root, "apps/web") });
  og =
    status === 0
      ? "redrawn: apps/web/public/og.png"
      : "NOT redrawn. Run it by hand: cd apps/web && RENDER_FROM=<folder with node_modules/playwright-core or puppeteer-core> node scripts/og/render.mjs";
}

const slug = to.slug;
console.log(`
Done in the repo. Link preview: ${og}.
Check: pnpm lint && pnpm typecheck && pnpm test, then look at the homepage, /play and /terms.html.

Left for you (outside the repo, in this order):
  1. GitHub: gh repo rename ${slug}   (GitHub redirects the old URL), then
     git remote set-url origin git@github.com:CharlieNey/${slug}.git
  2. Domain: buy it, then set VITE_SITE_URL and ALLOWED_ORIGINS to it (docs/DEPLOY-PLAN.md).
  3. Fly.io: the app is created as ${slug}-server (infra/fly/fly.toml); if one already
     exists under the old name, create the new one and delete the old (fly apps destroy).
  4. Google Cloud: the project id stays; rename its display name (IAM & Admin → Settings),
     the two Map IDs and the cloud map style (Google Maps Platform → Map management and
     Map styles) to "${to.name} Mosaic". Their ids don't change, so no code changes.
  5. The browser key's website restrictions: add the new domain's referrers.
  6. The three private design artifacts linked from DESIGN.md: retitle them.
  7. Retake the README screenshots that show the name: docs/screenshots/01-home.png,
     05-radar-answered.png, 06-you-hide.png, replay.gif.
  8. The personal site (charlie-site, charlie-site-ride3d, charlie-site-demo): set its
     shared name constant to "${to.name}", the project slug to ${slug}, rename
     public/projects/${from.slug}/ and public/og/${from.slug}.png, and retake the game screenshots.
  9. Before going public: a trademark search on the name, by hand.
`);
