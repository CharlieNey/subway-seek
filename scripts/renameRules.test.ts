import { describe, expect, it } from "vitest";
import { nameProblem, nextBrand, renameText, skipFile, slugOf } from "./renameRules.ts";

const from = { name: "Stand Clear", slug: "stand-clear", formerSlugs: [] };
const to = nextBrand(from, "Subway Seek");
const run = (text: string, path = "README.md") => renameText(text, from, to, path);

describe("pnpm rename", () => {
  it("makes the slug and keeps the old one for the storage move", () => {
    expect(slugOf("Subway Seek")).toBe("subway-seek");
    expect(slugOf("Rider’s Café")).toBe("riders-cafe");
    expect(to).toEqual({ name: "Subway Seek", slug: "subway-seek", formerSlugs: ["stand-clear"] });
    // Renaming back drops the slug from formerSlugs, and nothing appears twice.
    expect(nextBrand(nextBrand(to, "Step Lively"), "Subway Seek").formerSlugs).toEqual([
      "stand-clear",
      "step-lively",
    ]);
  });

  it("refuses names the pages can't take raw", () => {
    expect(nameProblem("Subway Seek")).toBeNull();
    expect(nameProblem("Track & Seek")).not.toBeNull();
    expect(nameProblem(" Seek")).not.toBeNull();
    expect(nameProblem("<b>")).not.toBeNull();
  });

  it("renames the scope, the display name, the Fly app and the test folders", () => {
    expect(run('import { x } from "@stand-clear/engine";').text).toBe(
      'import { x } from "@subway-seek/engine";',
    );
    expect(run("# Stand Clear\n\nSTAND CLEAR, Stand Clear's daily").text).toBe(
      "# Subway Seek\n\nSUBWAY SEEK, Subway Seek's daily",
    );
    expect(run('app = "stand-clear-server"', "infra/fly/fly.toml").text).toBe(
      'app = "subway-seek-server"',
    );
    expect(run('mkdtempSync(join(tmpdir(), "stand-clear-socket-"))').text).toBe(
      'mkdtempSync(join(tmpdir(), "subway-seek-socket-"))',
    );
    expect(run('  "name": "stand-clear",', "package.json").text).toBe('  "name": "subway-seek",');
    expect(run('  "name": "stand-clear",', "apps/web/package.json").count).toBe(0);
  });

  it("leaves the seed, the cloud project, the phrase and kept lines alone", () => {
    for (const keep of [
      'const SEED = "stand-clear-daily|";',
      "the project `stand-clear-nyc`",
      'No "Stand clear of the closing doors" caption.',
      "STAND CLEAR OF THE CLOSING DOORS",
      "the `stand-clear-server-github` role <!-- keep-name -->",
      "~/stand-clear and github.com/CharlieNey/stand-clear",
    ])
      expect(run(keep)).toEqual({ text: keep, count: 0 });
    expect(skipFile("infra/aws/setup.sh")).toBe(true);
    expect(skipFile("apps/web/src/storage.ts")).toBe(true);
    expect(skipFile("apps/web/src/share.ts")).toBe(false);
  });
});
