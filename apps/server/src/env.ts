/** Load apps/server/.env.local (gitignored) before other modules read process.env. */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("../.env.local", import.meta.url));
// In production there's no file and secrets come from the environment; a file that
// exists but can't be read (a copied symlink, wrong owner) shouldn't stop the server either.
if (existsSync(file)) {
  try {
    process.loadEnvFile(file);
  } catch (err) {
    console.warn(`couldn't read ${file}: ${String(err)}`);
  }
}
