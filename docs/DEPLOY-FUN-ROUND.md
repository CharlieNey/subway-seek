# Deploying fun round 1

*Written 2026-11-27. The steps to take fun round 1 live **once Charlie says go**: he wants to hear the sound and choose its defaults first. Nothing here has been run. The everyday runbook is [`DEPLOY.md`](DEPLOY.md). This page covers only what this deploy adds, and how to undo it.*

## What's live today, and what this adds

| | Live now | After this deploy |
|---|---|---|
| Website (Cloudflare Pages, `subway-seek`) | Deployment `33d6ce93`, built from `a2c6f10` (the phone fixes) | Built from the commit you deploy (`main` once `fun-round-1` is merged) |
| Server (Fly, `subway-seek-server`) | Release v1, image `registry.fly.io/subway-seek-server:deployment-01M8ETYPCKPG15SJ4W190D0Q7X` (built from `409b0d9`) | A new release from the same commit |

What changes for players: the ending (verdict, callouts, the reveal), sound, par, the daily percentile, days running, the stamp book at `/stamps`, and from Saturday 5 December, Outer boroughs Saturdays. On the server: `GET /daily/scores`, daily standings, the replay flag, the 90-day match-log sweep, and the themed daily. Old and new halves work with each other: an old page ignores the new fields, and a new page without `/daily/scores` simply shows no percentile. Either can go first, but deploy the server first so the percentile works from the page's first load.

## Before you start

1. **Sound defaults.** The rumble and the pulse ship on by default. To ship them off, change `defaults()` in `apps/web/src/sound.ts` (`rumble: false, pulse: false`), update DESIGN.md (Interaction, Sound) and its decision row, run the checks and commit.
2. **The first themed Saturday is 2026-12-05** (`OUTER_BOROUGHS_FROM`, `packages/engine/src/themes.ts`). Deploy before then: any day up to Friday 4 December is safe. **If the deploy is on 5 December or later, move the date first** to a Saturday after the deploy day. Otherwise that day's daily changes under anyone who already played it. Moving the date means:
   - the constant;
   - the dates in `packages/engine/src/themes.test.ts`;
   - "5 December" in README.md, DESIGN.md (Coming back), `docs/proposals/themed-days.md` and `docs/question-balance.md`.

   Then run the checks and commit.
3. **Checks** on the commit you'll deploy: `pnpm lint && pnpm typecheck && pnpm test`, and `pnpm sim` and `pnpm sim --theme outerBoroughs` match `docs/question-balance.md`. CI runs the first three on every push.
4. **Fly is logged in to the personal account:** `fly auth whoami`.

## The server

From the repo root, on the commit you're deploying:

```sh
fly deploy . --config infra/fly/fly.toml --dockerfile apps/server/Dockerfile --ha=false --remote-only
fly status --app subway-seek-server            # exactly one machine, started
fly scale count 1 --app subway-seek-server     # never --ha
```

Or run **Deploy server** in GitHub Actions (manual; it runs the checks first).

Rounds in progress survive: sessions are restored from `/data/sessions.sqlite` within their 3-minute grace. A deploy mid-day rebuilds the same daily from the same seed.

**Check the server:**

```sh
curl https://subway-seek-server.fly.dev/health          # {"ok":true,…}
curl https://subway-seek-server.fly.dev/daily           # today's start; "theme": null until 5 December
curl https://subway-seek-server.fly.dev/daily/scores    # {"date":"…","n":…,"counts":[…]}
fly logs --app subway-seek-server --no-tail | tail -20  # the boot line; no "log sweep" line until logs are 90 days old
```

## The website

Build without any Google key and with the production addresses, from the repo root:

```sh
rm -rf apps/web/dist
VITE_GOOGLE_MAPS_API_KEY= VITE_MAP_PROVIDER= VITE_STREET= \
VITE_SERVER_URL=wss://subway-seek-server.fly.dev VITE_SITE_URL=https://subway-seek.pages.dev \
pnpm --filter @subway-seek/web build
grep -rlE 'AIza[0-9A-Za-z_-]{35}' apps/web/dist && echo "KEY FOUND: STOP" || echo "no key"
cd apps/web && npx wrangler pages deploy dist --project-name subway-seek --branch main --commit-hash "$(git rev-parse --short HEAD)"
```

`apps/web/.env.local` holds the real Google key, and Vite reads it in a production build, so the empty `VITE_GOOGLE_MAPS_API_KEY=` on the command line is what keeps the build keyless. Don't upload if the grep finds a key. Don't pass `--force`.

**Check the website** on https://subway-seek.pages.dev:

- `/`, `/hardest`, `/stamps` and `/play?practice` load with no console errors.
- A practice round, given up: the verdict line and "Par N" show. On a computer, both routes replay on the map.
- Sound: nothing plays before the first tap. Board a train and hear the doors and the rumble as it leaves. Mute is remembered after a reload.
- Phones (390×844): the tab row fits, and Mute and the ▾ sound list open upward.
- A finished daily (found or time's up) shows "your standing shows once 20 others finish today (n so far)" until 20 have finished, then "better than N%".
- `/manifest.webmanifest` serves, and the head still has `viewport-fit=cover`.
- **On Saturday 5 December:** `GET /daily` says `"theme":"outerBoroughs"`, the daily starts at Atlantic Av–Barclays Ctr, Jackson Hts–Roosevelt Av, Jay St–MetroTech or Broadway Junction, the round line says "Outer boroughs", and no par shows.

## Rollback

Undo the website first if players see something wrong, and the server if it's misbehaving. They're independent.

- **Website:** in the Cloudflare dashboard, Workers & Pages → `subway-seek` → Deployments, open deployment `33d6ce93` (from `a2c6f10`) and choose *Rollback to this deployment*. Or rebuild `a2c6f10` and upload it with the steps above:

  ```sh
  git worktree add /tmp/ss-a2c6f10 a2c6f10
  cd /tmp/ss-a2c6f10 && pnpm install
  # then the website build and upload steps, here
  ```

- **Server:** deploy the previous image (no rebuild):

  ```sh
  fly releases --app subway-seek-server --image     # find the release before this one
  fly deploy --app subway-seek-server --config infra/fly/fly.toml \
    --image registry.fly.io/subway-seek-server:deployment-01M8ETYPCKPG15SJ4W190D0Q7X --ha=false
  ```

  The old server ignores what the new one added. Today's standings are rebuilt from the logs on the volume, which the old server doesn't read, so nothing is lost by going back.
- **Everything off:** `fly scale count 0 --app subway-seek-server`. The site then shows its connection error.

## After it's live

- Mark the deploy in GO-PUBLIC.md and LAUNCH.md, with the date and the commit.
- Watch `fly logs` the first evening.
- On 5 December, check the themed daily (above).
- The sound defaults stay open until Charlie has heard them on the live site.
