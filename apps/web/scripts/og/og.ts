/**
 * Paints the game's name tablet (src/brand.json) for the link-preview image with the game's own mosaic
 * renderer (src/ui/tablet.ts), so the card matches the homepage's wall. render.mjs waits
 * for `data-ready` on <html> before it takes the screenshot.
 */
import "@fontsource/josefin-sans/latin-700.css";
import "@fontsource/libre-franklin/latin-800.css";
import { GAME_NAME } from "../../src/brand.ts";
import { fontsReady, paintAt, tablet } from "../../src/ui/tablet.ts";

const canvas = document.getElementById("tablet") as HTMLCanvasElement;
const width = Number(new URLSearchParams(location.search).get("w") ?? 980);

await Promise.all([fontsReady(), document.fonts.load('800 50px "Libre Franklin"')]);
paintAt(canvas, tablet(GAME_NAME, "irt", 14), width);
document.documentElement.dataset.ready = "1";
