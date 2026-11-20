# Deploying Stand Clear

The runbook. Why these hosts, what they cost and the first-time steps are in [`DEPLOY-PLAN.md`](DEPLOY-PLAN.md).

There are two pieces. The client is static files on Cloudflare Pages. The server is one long-lived Node process on one Fly.io machine in `ewr`, with a volume. The engine and the dataset ship inside both.

## The server (Fly.io)

Config: `infra/fly/fly.toml`, image from `apps/server/Dockerfile`. One `shared-cpu-1x` machine with 512 MB, always on (`auto_stop_machines = "off"`, `min_machines_running = 1`), and the `match_logs` volume mounted at `/data`. That volume holds the live-sessions database (`/data/sessions.sqlite`) and the match logs (`/data/logs`), so both survive deploys. Fly terminates TLS and proxies WebSockets, and doesn't close idle ones.

**Deploy** from the repo root:

```sh
fly deploy . --config infra/fly/fly.toml --dockerfile apps/server/Dockerfile --ha=false
```

or run the **Deploy server** workflow in GitHub Actions (`.github/workflows/deploy-server.yml`). It runs lint, typecheck, the tests and the timetable check first, so a red commit never deploys. It needs the `FLY_API_TOKEN` repository secret. It is manual until its `push:` block is uncommented.

**Secrets** (`fly secrets set --app stand-clear-server NAME=value`):

- `DAILY_SECRET`: required. The server exits at boot without it in production.
- `GOOGLE_STREETVIEW_SERVER_KEY`
- `GOOGLE_MAPS_BROWSER_KEY` and `STREETVIEW_SIGNING_SECRET`, together.

The plain settings are in `fly.toml [env]`, including `CLIENT_IP_HEADER = "fly-client-ip"`, which the per-address limit reads.

What to know:

- **Changing `DAILY_SECRET` changes every future daily.** A redeploy mid-day rebuilds the day's cache from the same seed, so the daily itself doesn't change.
- **Rounds survive a deploy.** Live sessions are saved to `SESSION_DB` whenever they change and restored at boot with whatever is left of their 3-minute grace period. A solo clock runs on through the downtime, as through any drop. Players see "Connection lost", then their round again. A deploy that takes longer than three minutes ends the rounds.
- **Limits:**
  - 30 new rounds per address per hour, 40 street walks per session per minute, 500 live sessions, 16 KiB per message.
  - A turned-away connection gets a close reason the client shows.
  - Behind a different proxy, set `CLIENT_IP_HEADER` to the header that proxy sets. Unset, the server uses the socket address.
- **Looking at it:**
  - `GET https://<app>.fly.dev/health` returns `{ ok, sessions, serviceDate }`.
  - `fly logs` follows the round log, and `fly ssh console` opens a shell.
  - To read the match logs on a laptop: `fly ssh console -C "tar czf - -C /data logs" > logs.tgz`, unpack, then `pnpm metrics -- --dir=logs` prints the week's numbers against the sim's.
- **Cost:** about $3.84 a month (machine $3.69, 1 GB volume $0.15). Fly waives a personal organization's bill under $5. Keep one machine: `fly scale count 1`.
- **Later:** two-player rooms on more than one machine would need sessions in a shared store instead of SQLite on one volume. Nothing else in the app assumes a single host beyond the two file paths.

## The client (Cloudflare Pages)

Pages builds from the repo root with `pnpm --filter @stand-clear/web build` and serves `apps/web/dist`. `apps/web/public/_headers` sets the headers:
- immutable caching for the hashed files in `assets/`;
- `nosniff`, a referrer policy and `X-Frame-Options: DENY` everywhere.

With no `404.html`, Pages serves `index.html` for unknown paths, which is the SPA fallback the client's router expects.

Build variables, for production and preview:

| Variable | Value |
|---|---|
| `VITE_SERVER_URL` | `wss://<app>.fly.dev`, or the server's own host |
| `VITE_GOOGLE_MAPS_API_KEY` | the referrer-restricted browser key |
| `VITE_SITE_URL` | the site's origin, no trailing slash. It becomes the absolute `og:url` and `og:image` in `index.html`, so link previews can fetch `/og.png`. Unset, the build uses `http://localhost:5173` |
| `NODE_VERSION` | `22` |

The dataset (5 MB) is imported with a content hash into `assets/`, so browsers cache it for a year and fetch it again only when it changes, compressed to about 600 KB. `apps/web/public/terms.html` is served as-is at `/terms.html`, and so are the favicon, `apple-touch-icon.png` and `og.png` (the link-preview card; `apps/web/scripts/og/README.md` says how to regenerate it). Every link gets the same card, since the SPA serves one `index.html` for all of them.

`pnpm --filter @stand-clear/web build` locally produces `apps/web/dist` for a check before pushing.

**Vercel instead:** `vercel.json` at the repo root has the same build, rewrite and headers. Import the repo with the root directory at the repo root and set the same variables. Hobby is for non-commercial use and stops serving for the month past 100 GB (`DEPLOY-PLAN.md`).

## Google Cloud

Before anything is public, in this order (details and quotas in `DEPLOY-PLAN.md`, Google keys):

1. **Browser key:**
   - Referrers: the site's origin, `https://<project>.pages.dev/*` while previews matter, and `http://localhost:5173/*` for development.
   - APIs: Maps JavaScript API and Street View Static API only.
2. **Server key:** Street View Static API only.
3. **Sign Street View Static URLs.**
   - Generate a URL signing secret for the project.
   - Set it and the browser key as the server's `STREETVIEW_SIGNING_SECRET` and `GOOGLE_MAPS_BROWSER_KEY`. The server then signs every photo URL (`apps/server/src/sign.ts`) and the client uses the signed one.
   - Set the Street View Static API's **unsigned requests quota to 0**, then check that the server's metadata lookups still work.
4. **Daily quotas** under each API's free monthly cap, and a budget alert. Budgets only alert; quotas cap.
5. **Vector Map ID on Safari.** Load the game in Safari with the vector Map ID before switching production to it. The raster ID is the fallback if deck.gl's overlay misbehaves there.
6. **Attribution and terms.** Google's logo and attribution stay visible on the map and on Street View. The terms page links Google's Maps Additional Terms and Privacy Policy, as required.

## Re-pinning the timetable

The game runs one pinned weekday (`meta.serviceDate` in the dataset, 2027-03-03 today). The MTA replaces its GTFS feed from time to time (the current one runs 2026-11-01 to 2027-05-15), and a pinned day in the past stops matching any real schedule. Re-pin when the MTA publishes a new feed, or when `pnpm data:check` warns:

```sh
pnpm data:build --refresh --date=2027-03-03     # a plain Wednesday inside the feed's validity (feed_info.txt)
pnpm --filter @stand-clear/data build-landmarks  # only if OSM/Parks data should refresh too
pnpm data:hardness                               # the /hardest page's table; a test fails if it's stale
pnpm test && pnpm sim && pnpm sim:endgame && pnpm sim:match   # the balance docs quote these; update them if the numbers move
git add packages/data/dataset apps/web/src/home/hardness.json && git commit -m "Data: re-pin the timetable to 2027-03-03"
```

Without `--date`, `pnpm data:build` rebuilds the current pin. Pick a Wednesday with no holiday, at least a week ahead, so the daily's archive of results isn't cut off mid-week. If the new feed's `Weekday` service is unchanged, the rebuild only moves the date; diff the dataset's sections to see. `pnpm data:check` runs in CI and warns (never fails) when the pin is within a week or in the past. The loading board and the footer show the service day to players.

## Smoke test after a deploy

1. Open the site. The loading board reaches the server row and the clock starts.
2. Start the daily: board a train, ask a radar, and see the answer land after its window.
3. On an Easy practice round, get off at the hider's station, come up and walk. See the marker at 40 m, and catch at 25 m.
4. Reload mid-round. The round resumes with the same clock.
5. `fly logs` shows the round's events, and a new file appears under `/data/logs`.

## Rollback

- **Client:** in Cloudflare Pages, open Deployments and roll back to the previous one. On Vercel, promote the previous deployment.
- **Server:** `fly releases --app stand-clear-server` lists the images. Redeploy one with `fly deploy --config infra/fly/fly.toml --image <that image> --ha=false`.

Live rounds come back from the sessions database either way.

## Other hosts

`infra/aws` runs the same image behind Caddy on an EC2 instance, set up and deployed with the AWS CLI over SSM. Use it only in an AWS account you own (`DEPLOY-PLAN.md`). Its `docker-compose.yml` and `Caddyfile` also run on any VPS with Docker.
