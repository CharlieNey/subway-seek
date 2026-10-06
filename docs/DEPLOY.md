# Deploying Stand Clear

Two pieces: the client is static files on Vercel; the server is one long-lived Node process on Fly.io in Newark. The engine and the dataset ship inside both.

## The server (Fly.io)

Files: `fly.toml` at the repo root, `apps/server/Dockerfile`. Deploy from the repo root.

First time:

```sh
brew install flyctl && fly auth login
fly apps create stand-clear-server
fly volumes create match_logs --region ewr --size 1          # playtest logs survive deploys
fly secrets set DAILY_SECRET="$(openssl rand -base64 32)"       # mixed into the daily's seed
fly secrets set GOOGLE_STREETVIEW_SERVER_KEY=…                  # the server key, Street View API only
fly deploy
```

Every deploy after that is `fly deploy`. The machine stays on (`auto_stop_machines = "off"`): rounds live in memory and the daily is cached per New York date, so stopping the machine would end everyone's round.

What to know:

- **Changing `DAILY_SECRET` changes every future daily**, and a redeploy mid-day restarts the server, which rebuilds the day's cache from the same seed, so the daily stays the same. Sessions in flight are lost on deploy until there's a store for them; deploy when nobody's playing.
- **Logs:** `MATCH_LOG_DIR=/data/logs` on the volume. `fly ssh console -C "ls /data/logs"` to look, `fly sftp get /data/logs/<file>` to fetch.
- **Health:** the server speaks WebSocket only, so Fly's HTTP checks are off. `fly logs` shows `listening on ws://…` and each intent.
- **Cost:** one shared-cpu-1x with 512 MB and a 1 GB volume is a few dollars a month.

## The client (Vercel)

File: `vercel.json` at the repo root (build command, output dir, the SPA rewrite, immutable caching for hashed assets, a few security headers). Import the repo in Vercel with the root directory left at the repo root; Vercel reads the `packageManager` field for pnpm.

Environment variables, for Production and Preview:

| Variable | Value |
|---|---|
| `VITE_SERVER_URL` | `wss://stand-clear-server.fly.dev` |
| `VITE_GOOGLE_MAPS_API_KEY` | the browser key from `stand-clear-nyc` |

The dataset (5 MB) is imported with a content hash into `assets/`, so it's cached for a year and refetched only when it changes; Vercel serves it compressed. The loading board's bytes bar reads the real transfer.

`pnpm --filter @stand-clear/web build` locally produces `apps/web/dist` for a check before pushing. `apps/web/public/terms.html` is served as-is at `/terms.html`.

## Google Cloud (`stand-clear-nyc`)

Before anything is public, in this order. `gcloud auth login` first; the commands assume `--project stand-clear-nyc`.

1. **Browser key restrictions.** Referrers: `https://<your domain>/*` (and `https://*.vercel.app/*` while previews matter), plus `http://localhost:5173/*` for dev. APIs: Maps JavaScript API and Street View Static API only. `gcloud services api-keys list` shows the current state; edit in the console under APIs & Services → Credentials.
2. **Sign Street View Static URLs.** In Credentials, generate a URL signing secret for the project. Put it in the server (`fly secrets set STREETVIEW_SIGNING_SECRET=…`), and the browser key too (`GOOGLE_MAPS_BROWSER_KEY`), so the server can build and sign photo URLs with `apps/server/src/sign.ts`. Then set the Street View Static API's **unsigned requests quota to 0** (Quotas page). Wiring note: the server should attach the signed URL to the photo answer and the client should use it instead of building its own; see the launch checklist.
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
5. `fly logs` shows the round's events; a new file appears under `/data/logs`.

## Rollback

Client: Vercel → Deployments → Promote the previous one. Server: `fly releases` then `fly deploy --image <previous image>`; the in-memory rounds are lost either way, so roll back between rounds if you can.
