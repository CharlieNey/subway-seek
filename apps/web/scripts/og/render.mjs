/**
 * Renders public/og.png (1200×630) and public/apple-touch-icon.png (180×180) from og.html
 * and icon.html with headless Chrome. Serves this folder through Vite so og.ts can use
 * the game's tablet renderer and its bundled fonts. See README.md here.
 *
 *   RENDER_FROM=<a folder with node_modules/playwright-core or puppeteer-core> \
 *     node scripts/og/render.mjs
 *
 * PUPPETEER_FROM is the old name for RENDER_FROM. CHROME overrides the browser path
 * (default: Google Chrome on macOS); OG_PORT the Vite port (default 5197).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../..");
const folder = process.env.RENDER_FROM ?? process.env.PUPPETEER_FROM;
const require = createRequire(folder ? path.join(folder, "x") : import.meta.url);
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** A page with setViewport/goto/waitForSelector/screenshot, from either library. */
async function launch() {
  try {
    const { chromium } = require("playwright-core");
    const browser = await chromium.launch({ executablePath: chrome, headless: true });
    return {
      close: () => browser.close(),
      page: async (width, height) => {
        const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
        return { page, idle: "networkidle" };
      },
    };
  } catch (err) {
    if (err?.code !== "MODULE_NOT_FOUND") throw err;
  }
  const puppeteer = require("puppeteer-core");
  // pipe: no debugging socket, so nothing listens on a port.
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, pipe: true });
  return {
    close: () => browser.close(),
    page: async (width, height) => {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      return { page, idle: "networkidle0" };
    },
  };
}

const shots = [
  { page: "og.html", out: "og.png", width: 1200, height: 630 },
  { page: "icon.html", out: "apple-touch-icon.png", width: 180, height: 180 },
];

const server = await createServer({
  root: web,
  configFile: path.join(web, "vite.config.ts"),
  server: { port: Number(process.env.OG_PORT ?? 5197) },
});
await server.listen();
const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
if (!origin) throw new Error("Vite gave no local URL");

const browser = await launch();
try {
  for (const s of shots) {
    const { page, idle } = await browser.page(s.width, s.height);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${origin}/scripts/og/${s.page}`, { waitUntil: idle });
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
