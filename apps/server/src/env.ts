/** Load apps/server/.env.local (gitignored) before other modules read process.env. */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("../.env.local", import.meta.url));
if (existsSync(file)) process.loadEnvFile(file);
