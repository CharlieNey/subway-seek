# Link preview image

`og.html` is the source of `public/og.png` (1200×630, the Open Graph and Twitter card image) and `icon.html` the source of `public/apple-touch-icon.png` (180×180, from `public/favicon.svg`). The tablet is painted by the game's own renderer, `src/ui/tablet.ts`, so the card stays in step with the homepage's wall.

Regenerate from `apps/web`, with `puppeteer-core` installed somewhere (it isn't a dependency of the repo) and Google Chrome on the machine:

```sh
PUPPETEER_FROM=/path/to/folder/with/node_modules node scripts/og/render.mjs
```

`CHROME=/path/to/chrome` overrides the browser. Open `http://localhost:5173/scripts/og/og.html` under `pnpm dev:web` to see the page itself; `?w=820` changes the tablet's width.
