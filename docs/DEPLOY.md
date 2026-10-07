# Deploying Stand Clear

Two pieces: the client is static files on Vercel; the server is one long-lived Node process on an EC2 instance in us-east-1. The engine and the dataset ship inside both.

## The server (AWS)

One EC2 instance in us-east-1 (New York's region) runs the Docker image behind Caddy, which gets the TLS certificate from Let's Encrypt and proxies WebSockets straight through. The image lives in ECR. Everything is in `infra/aws`; the Fly.io version of the same plan is kept in `infra/fly` as an alternative.

What's where on the instance: `/opt/stand-clear/docker-compose.yml`, `Caddyfile` and `.env` (the secrets); the match logs and the live-sessions database on a Docker volume on the instance's EBS disk, so they survive deploys. The instance has no SSH key and no port 22: commands go through SSM, and only 80 and 443 are open.

First time, with the AWS CLI installed and signed in (`brew install awscli`, then `aws configure sso` or `aws configure`):

```sh
AWS_REGION=us-east-1 infra/aws/setup.sh
```

It creates the ECR repository, an IAM role for the instance (SSM access and ECR pull), a security group, a `t3.small` with a 16 GB disk from the current Amazon Linux 2023 image, and an Elastic IP, and prints the IP and the instance id. Point the server's DNS A record (say `play-api.<your domain>`) at the IP, wait a minute for Docker to install, then:

```sh
INSTANCE_ID=i-… ECR=…dkr.ecr.us-east-1.amazonaws.com/stand-clear-server AWS_REGION=us-east-1 infra/aws/deploy.sh --first
```

The first deploy asks for the host name and the secrets (`DAILY_SECRET`, generated if blank; the Street View server key; the browser key and signing secret) and writes them to the instance's `.env`, builds the image for `linux/amd64`, pushes it, and starts the stack. Caddy fetches the certificate on first start, which needs the DNS record to resolve already.

Every deploy after that is `infra/aws/deploy.sh` with the same three variables, or nothing at all: `.github/workflows/deploy-server.yml` does it on every push to `main` that touches the server, the engine, the data or `infra/aws`, after lint, typecheck, the tests and the timetable check pass on the runner (a red commit never deploys; `ci.yml` runs the same checks plus the web build on every push and pull request). The Action needs four repository secrets: `AWS_ROLE_ARN` (an IAM role GitHub assumes with OIDC, allowed to push to the repository and to send SSM commands to the instance), `AWS_REGION`, `ECR_REPOSITORY` and `INSTANCE_ID`.

What to know:

- **Changing `DAILY_SECRET` changes every future daily**, and a redeploy mid-day restarts the server, which rebuilds the day's cache from the same seed, so the daily stays the same.
- **Rounds survive a deploy.** Live sessions are saved to `SESSION_DB` (`/data/sessions.sqlite` on the volume) whenever they change and restored at boot with whatever is left of their 3-minute grace period; a solo clock runs on through the downtime, as through any drop. Players see "Connection lost", then their round again. A deploy that takes longer than three minutes ends the rounds.
- **Limits:** 30 new rounds per address per hour, 40 street walks per session per minute, 500 live sessions per server. Caddy sets `X-Forwarded-For`, which the limits read. A turned-away connection gets a close reason the client shows.
- **Looking at it:** `aws ssm start-session --target i-…` opens a shell (no SSH). `GET https://<host>/health` returns `{ ok, sessions, serviceDate }`. `docker compose logs -f server` in `/opt/stand-clear` follows the round log; `/var/lib/docker/volumes/stand-clear_data/_data/logs` holds the match logs.
- **Cost:** a `t3.small` on demand is about $15 a month, the disk about $1, the Elastic IP free while attached. ECR keeps the last ten images (a lifecycle rule from `setup.sh`), well under a dollar. GitHub Actions: a deploy is about six runner minutes, a CI run about four, against 2,000 free a month on a private repo. A `t4g.small` is cheaper if you build the image with `PLATFORM=linux/arm64`. Data transfer is negligible at launch scale.
- **Later:** when there are two-player rooms or a second machine, the step up is an Application Load Balancer in front and sessions in DynamoDB instead of SQLite on the disk; nothing in the app assumes the instance beyond the two file paths.

## The client (Vercel)

File: `vercel.json` at the repo root (build command, output dir, the SPA rewrite, immutable caching for hashed assets, a few security headers). Import the repo in Vercel with the root directory left at the repo root; Vercel reads the `packageManager` field for pnpm.

Environment variables, for Production and Preview:

| Variable | Value |
|---|---|
| `VITE_SERVER_URL` | `wss://play-api.<your domain>` (the server's host behind Caddy) |
| `VITE_GOOGLE_MAPS_API_KEY` | the browser key from `stand-clear-nyc` |
| `VITE_SITE_URL` | the site's origin, `https://<your domain>`, no trailing slash. It becomes the absolute `og:url` and `og:image` in `index.html`, so Discord, Slack, iMessage and X can fetch `/og.png`. Unset, the build uses `http://localhost:5173`, so a preview deploy without it points its card image at localhost. |

The dataset (5 MB) is imported with a content hash into `assets/`, so it's cached for a year and refetched only when it changes; Vercel serves it compressed. The loading board's bytes bar reads the real transfer.

`pnpm --filter @stand-clear/web build` locally produces `apps/web/dist` for a check before pushing. `apps/web/public/terms.html` is served as-is at `/terms.html`, and so are the favicon, `apple-touch-icon.png` and `og.png` (the link-preview card; `apps/web/scripts/og/README.md` says how to regenerate it). The card is one static image for every link, `/`, `/play` and the share link's `/?d=23&t=41`: the SPA rewrite serves the same `index.html` for all of them, and the share's number and minutes are read by the page, not the card.

## Google Cloud (`stand-clear-nyc`)

Before anything is public, in this order. `gcloud auth login` first; the commands assume `--project stand-clear-nyc`.

1. **Browser key restrictions.** Referrers: `https://<your domain>/*` (and `https://*.vercel.app/*` while previews matter), plus `http://localhost:5173/*` for dev. APIs: Maps JavaScript API and Street View Static API only. `gcloud services api-keys list` shows the current state; edit in the console under APIs & Services → Credentials.
2. **Sign Street View Static URLs.** In Credentials, generate a URL signing secret for the project. Put it and the browser key in the server's `.env` as `STREETVIEW_SIGNING_SECRET` and `GOOGLE_MAPS_BROWSER_KEY` (`infra/aws/deploy.sh --first` asks for them); the server then signs every photo URL (`apps/server/src/sign.ts`) and the client uses the signed one. Then set the Street View Static API's **unsigned requests quota to 0** (Quotas page).
3. **Quotas and budget.** The $10/month budget alert and the daily caps set on 2026-10-05 stay. Raise the Maps JavaScript daily cap to the expected player count times one load each; keep Street View Static small (a few hundred a day).
4. **Vector Map ID on Safari.** Load the game in Safari with the vector Map ID `d52ea7715ab571c4cf3a43db` before switching production to it; the raster ID is the fallback if deck.gl's overlay misbehaves there.
5. **Attribution and terms.** Google's logo and attribution stay visible on the map and on Street View. The terms page links Google's Maps Additional Terms and Privacy Policy, as required.

## Re-pinning the timetable

The game runs one pinned weekday (`meta.serviceDate` in the dataset, 2026-10-14 today). The MTA publishes a new GTFS feed every few weeks, and a pinned day in the past stops matching any real schedule. Routine, about monthly, or when `pnpm data:check` warns:

```sh
pnpm data:build --refresh --date=2026-11-11     # a plain Wednesday within the new feed's validity
pnpm --filter @stand-clear/data build-landmarks  # only if OSM/Parks data should refresh too
pnpm test && pnpm sim && pnpm sim:endgame        # the balance docs quote these; update them if the numbers move
git add packages/data/dataset && git commit -m "Data: re-pin the timetable to 2026-11-11"
```

Pick a Wednesday with no holiday and no major planned work, at least a week ahead so the daily's archive of results isn't cut off mid-week. `pnpm data:check` runs in CI and warns (never fails) when the pin is within a week or in the past. The loading board shows the service day to players.

## Smoke test after a deploy

1. Open the site; the loading board reaches the server row and the clock starts.
2. Start the daily: board a train, ask a radar, see the answer land after its window.
3. Get off at the hider's station on a practice round (Easy), come up, walk, see the marker at 40 m, catch at 25 m.
4. Reload mid-round: the round resumes with the same clock.
5. `docker compose logs server` on the instance shows the round's events; a new file appears under the data volume's `logs`.

## Rollback

Client: Vercel → Deployments → Promote the previous one. Server: `TAG=<previous git sha> infra/aws/deploy.sh` (every pushed image is tagged with its commit), or on the instance `sed -i 's#^IMAGE=.*#IMAGE=…:<sha>#' .env && docker compose up -d`. Live rounds come back from the sessions database either way.
