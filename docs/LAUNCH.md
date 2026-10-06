# Launch checklist

The blocking items from the launch-prep review of 2026-10-06, what's done, and what still needs a hand. Tick as you go.

## Hosting

- [x] `apps/server/Dockerfile` and `fly.toml` (Newark, always on, logs on a volume).
- [x] `vercel.json` (build, SPA rewrite, immutable hashed assets, security headers).
- [x] `docs/DEPLOY.md`: first deploy, env vars, re-pin routine, smoke test, rollback.
- [ ] Create the Fly app, volume and secrets; first `fly deploy`.
- [ ] Import the repo in Vercel; set `VITE_SERVER_URL` and `VITE_GOOGLE_MAPS_API_KEY`.
- [ ] A domain, and the server's `wss://` URL behind it.

## Google

- [x] URL signing implemented and tested against Google's documented example (`apps/server/src/sign.ts`).
- [x] Wired in: the server attaches a signed URL to every photo answer when `GOOGLE_MAPS_BROWSER_KEY` and `STREETVIEW_SIGNING_SECRET` are set, and the client uses it. Unsigned until then (it warns at startup).
- [ ] Generate the signing secret; `fly secrets set STREETVIEW_SIGNING_SECRET=… GOOGLE_MAPS_BROWSER_KEY=…`. Then set the Static API's unsigned quota to 0.
- [ ] Restrict the browser key's referrers to the production domain (and previews), APIs to Maps JavaScript + Street View Static.
- [ ] Check the vector Map ID in Safari; fall back to the raster ID if the overlay fails.
- [ ] Confirm the budget alert and daily caps against the expected first-week traffic.

## Terms, attribution and privacy

- [x] `apps/web/public/terms.html`: what the game is, data and attribution (MTA, Google with the required links, OpenStreetMap, NYC Parks), privacy (browser storage, server match logs, Google's own requests, no analytics or cookies), sharing, fair play.
- [ ] **Put a contact address in** (search the file for `CONTACT-ADDRESS`).
- [x] Linked from the homepage footer.
- [ ] If the game is ever monetised or gets accounts, have a lawyer read the page first.

## Timetable freshness

- [x] `pnpm data:build --date=YYYY-MM-DD` re-pins; `pnpm data:check` reports the pin's age and warns in CI within a week of it.
- [ ] Re-pin before 2026-10-14 passes (the current pin), then monthly.

## Before the first share

- [ ] S4 bot-vs-bot balance run; deck mix and curse prices set from it (`docs/hider-bot.md`).
- [ ] Open Graph title, description and image on the homepage, so a shared link unfurls; the share link carries the sharer's time for the "a friend found…" band.
- [ ] Name check: trademark and app-store search for "Stand Clear" before buying the domain.
- [ ] A per-IP limit on new rounds (each practice round makes up to twelve free Street View metadata calls).
- [ ] Play a full daily and a practice round on the deployed site, on Chrome, Safari and Firefox.

## Later

- [ ] A status page, so the error screen's link can return.
- [ ] Server-side daily results, streak repair, a playable archive.
- [ ] The launch post: where (r/JetLagTheGame and the fan Discords), and what the first week measures: station-finding time, endgame share of seeking, questions per round, give-up rate.
