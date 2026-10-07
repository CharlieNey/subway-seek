/**
 * Renders public/og.png (1200×630) and public/apple-touch-icon.png (180×180) from og.html
 * and icon.html with headless Chrome. Serves this folder through Vite so og.ts can use
 * the game's tablet renderer and its bundled fonts. See README.md here.
 *
 *   PUPPETEER_FROM=<a folder with node_modules/puppeteer-core> node scripts/og/render.mjs
 *
 * CHROME overrides the browser path (default: Google Chrome on macOS).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../..");
const from = process.env.PUPPETEER_FROM
  ? path.join(process.env.PUPPETEER_FROM, "x")
  : import.meta.url;
const puppeteer = createRequire(from)("puppeteer-core");
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const shots = [
  { page: "og.html", out: "og.png", width: 1200, height: 630 },
  { page: "icon.html", out: "apple-touch-icon.png", width: 180, height: 180 },
];

const server = await createServer({ root: web, configFile: path.join(web, "vite.config.ts") });
await server.listen();
const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
if (!origin) throw new Error("Vite gave no local URL");

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
try {
  for (const s of shots) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: 1 });
    await page.goto(`${origin}/scripts/og/${s.page}`, { waitUntil: "networkidle0" });
    await page.waitForSelector("html[data-ready]", { timeout: 20_000 });
    const out = path.join(web, "public", s.out);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: s.width, height: s.height } });
    console.log(
      `${out} ${s.width}×${s.height}${errors.length ? ` errors: ${errors.join(" | ")}` : ""}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
