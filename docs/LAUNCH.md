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
- [x] The share text ends with a link carrying the daily's number and the sharer's minutes, for the "a friend found…" band (2026-10-06).
- [ ] Open Graph title, description and image on the homepage, so a shared link unfurls.
- [ ] Name check: trademark and app-store search for "Stand Clear" before buying the domain.
- [ ] A per-IP limit on new rounds (each practice round makes up to twelve free Street View metadata calls, and every street walk one more).
- [ ] Play a full daily and a practice round on the deployed site, on Chrome, Safari and Firefox.

## Pre-launch review (2026-10-06)

The ten fixes before anyone plays, from the review of the built game. Details in DESIGN.md's decision log.

- [x] No side channel on the hider's station: the server pushes a frame only when the seeker's view changes.
- [x] No Google coordinates saved in the browser: the homepage's replay keeps the trails and the station; the old saved view is cleared. The match log keeps the spot's panorama ID only.
- [x] Error boundaries: the page, the map and Street View.
- [x] Street walks checked server-side: the target must be the named panorama, within 5 m.
- [x] The daily can be given up and replayed to learn the station: accepted as honor-system for now (reversed 2026-10-07, so an unfound daily still reveals its hider). When results live on a server, refuse a second daily per recorded result.
- [x] Client bugs: a new round recognised by its intent's seq; no game keys under the photo lightbox; a refusal with no seq no longer leaves the buttons waiting.
- [x] Nothing covers Google's credits: overlays measure them, and Signal loss leaves holes. Checked headless on the Google map at 760–1440 px wide.
- [x] Frame cost: map layers rebuilt only when they change, clearings stop once played, no clock-driven re-renders at the top of the page.
- [x] Accessibility baseline: the answer window's countdown kept out of the live region, a visible focus ring on board rows, focus held in the lightbox.
- [x] Loading bar: the timetable's tiles fill against its decoded size, recorded at build.
- [x] A drop no longer pauses a solo round.

## Later

- [ ] A status page, so the error screen's link can return.
- [ ] Server-side daily results, streak repair, a playable archive.
- [ ] The launch post: where (r/JetLagTheGame and the fan Discords), and what the first week measures: station-finding time, endgame share of seeking, questions per round, give-up rate.
