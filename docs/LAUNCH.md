# Launch checklist

The blocking items from the launch-prep review of 2026-10-06, what's done, and what still needs a hand. Tick as you go.

## Hosting

- [x] `apps/server/Dockerfile`; `infra/aws` (one EC2 instance in us-east-1 behind Caddy, image in ECR, deploys over SSM; a GitHub Action deploys on push). Fly kept in `infra/fly` as an alternative.
- [x] `vercel.json` (build, SPA rewrite, immutable hashed assets, security headers).
- [x] `docs/DEPLOY.md`: first deploy, env vars, re-pin routine, smoke test, rollback.
- [ ] `infra/aws/setup.sh` (needs the AWS CLI signed in), point the A record at the Elastic IP, then `infra/aws/deploy.sh --first`. Add the four repository secrets for the deploy Action.
- AWS status checked 2026-10-12: CLI signed in; ECR, the instance IAM role/profile, and the security group exist. GitHub OIDC and three deploy secrets are configured by `infra/aws/setup-github.sh`. EC2 is blocked by AWS account verification; no instance/IP or `INSTANCE_ID` yet. Resolve the account block, rerun both setup scripts, then set DNS and deploy. Details and the support link: `docs/DEPLOY.md`.
- [ ] Import the repo in Vercel; set `VITE_SERVER_URL` and `VITE_GOOGLE_MAPS_API_KEY`.
- [ ] A domain, and the server's `wss://` URL behind it.

## Google

- [x] URL signing implemented and tested against Google's documented example (`apps/server/src/sign.ts`).
- [x] Wired in: the server attaches a signed URL to every photo answer when `GOOGLE_MAPS_BROWSER_KEY` and `STREETVIEW_SIGNING_SECRET` are set, and the client uses it. Unsigned until then (it warns at startup).
- [ ] Generate the signing secret; it and the browser key go into the instance's `.env` (`deploy.sh --first` asks for them). Then set the Static API's unsigned quota to 0.
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
- [x] Re-pinned to 2027-03-03 on 2026-11-20 (feed `20261028-fall-2026-pick-with-long-term-supplements`, valid to 2027-05-15; the weekday schedule is identical to the 2026-12-02 pin, only the date moved). Earlier: 2026-12-02 (set 2026-11-12), 2026-10-28 (set 2026-10-08). Next re-pin when the MTA publishes a new feed, or by 2027-02-24, when `pnpm data:check` starts warning.

## Before the first share

- [x] S4 bot-vs-bot balance run; deck mix and curse prices set from it (2026-10-07, `docs/match-balance.md`).
- [x] The share text ends with a link carrying the daily's number and the sharer's minutes, for the "a friend found…" band (2026-10-06).
- [x] Open Graph title, description and card image, favicon and touch icon; `VITE_SITE_URL` makes the URLs absolute (2026-10-07).
- [ ] Name check: trademark and app-store search for "Stand Clear" before buying the domain.
- [x] Limits: 30 new rounds per address per hour, 40 walks per session per minute, 500 live sessions; a refused connection shows the server's reason (2026-10-07).
- [x] Live sessions on disk: rounds survive a deploy or crash, restored with the rest of their grace period (2026-10-07). `SESSION_DB` on the instance's volume.
- [ ] Play a full daily, practice seeking and You hide on the deployed site, on Chrome, Safari and Firefox.
- [x] S3 role-filtered sockets, paced seeker, panorama-ID persistence, hider results and separate browser history (2026-10-08). Photo screens use fixtures; the bot has no photo perception.

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
- [ ] The launch post, per `docs/community-read.md`: not an app post. One data post into the Season 20 rules conversation (the sim, the vetoes, /hardest), mods asked first, timed before the season airs; the game a footnote; an honest AI answer ready; /changelog as the longevity signal. What the first week measures: station-finding time, endgame share of seeking, questions per round, give-up rate, real seconds between decisions. `pnpm metrics` over the instance's logs prints them against the bot's line (2026-10-08).
