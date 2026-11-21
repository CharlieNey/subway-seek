*Written 2026-11-21 (brief W25). The ordered path from "pick the name" to "it's live". Each step has its command or click and its undo; do them in order, because later steps assume the earlier ones. Nothing here has been run: no account was created, nothing deployed, nothing made public. The background for each step is in [`DEPLOY-PLAN.md`](DEPLOY-PLAN.md) (hosting, keys, cost caps) and [`LAUNCH.md`](LAUNCH.md) (the longer checklist).*

# Going public

## 0. Clean up the old cloud setup first

The earlier deploy ran in an AWS account Charlie doesn't own (DEPLOY-PLAN, Don't use the earlier AWS setup). Undo it before anything new exists, so nothing points two ways.

| # | Do | Command or click | Undo |
|---|---|---|---|
| 0.1 | List the repo's Actions secrets | `gh secret list` | — |
| 0.2 | Delete the AWS ones | `gh secret delete AWS_ROLE_ARN`, then the same for `AWS_REGION`, `ECR_REPOSITORY` and `INSTANCE_ID` if listed | `gh secret set <NAME>` with the old value, only if you redeploy to AWS |
| 0.3 | Ask the AWS account's administrator to delete what this repo created there | The role `stand-clear-server-github` (it trusts this repo's `main` through GitHub OIDC), the ECR repository `stand-clear-server` and its images, the role and instance profile `stand-clear-server-instance`, the security group, and any IAM access key made for this <!-- keep-name --> | `infra/aws` recreates them, in an account you own (DEPLOY-PLAN keeps it as an alternative) |
| 0.4 | Check who pays for Google | Google Cloud console, Billing, Account management: project `stand-clear-nyc` must be on a billing account in Charlie's name. If it isn't, create a new project on a personal billing account and make new keys there (the id `stand-clear-nyc` can't be renamed or moved with its keys) | Re-link the project's billing account (Billing, My projects, Change billing) |
| 0.5 | Check the history before it's public | `git log --all -p \| grep -cE "AIza[0-9A-Za-z_-]{35}"` should print 0, and `git ls-files \| grep -E "\.env\|/logs/"` only `infra/aws/.env.example`. Both held on 2026-11-21 | If a key turns up: delete it in Google Cloud (Credentials) first, then rewrite history before going public |

## 1. The name

| # | Do | Command or click | Undo |
|---|---|---|---|
| 1.1 | Pick the name | Decided 2026-11-21: **Subway Seek** (DESIGN.md, decision log) | `pnpm rename "<Other Name>"` |
| 1.2 | **Search the trademark by hand** | USPTO Trademark Search (tmsearch.uspto.gov): the word mark `SUBWAY SEEK`, `SUBWAYSEEK`, then `SUBWAY` alone and `SUBWAY` followed by anything, in classes 9 (software), 28 (games) and 41 (entertainment), live and dead. Then the US App Store, Google Play, Steam and itch.io for "Subway Seek" | — |
| 1.3 | Rename the repo's contents | Done: `pnpm rename "Subway Seek"` was run and committed on 2026-11-21 (`git log --grep "Subway Seek"`) | `git revert <that commit>`, or `pnpm rename` again: a browser's storage keys move on to the new name either way, and the daily's seed never changes |

**Plainly: "Subway" is a registered trademark of the Subway sandwich chain, in other classes than games.** A different class often means no conflict, but it is a famous mark and the name starts with it. Games already use the word too (the mobile game Subway Surfers is the best known). Nobody has searched "Subway Seek": not the overnight work, and not the rename research, which never screened it. Do 1.2 by hand before buying a domain or posting anywhere. If `SUBWAY` or a "Subway …" game mark turns up live in classes 9, 28 or 41, or the result is unclear, ask a trademark lawyer before going on. If the name has to change, `pnpm rename` makes it one commit.

## 2. Accounts and names outside the repo

| # | Do | Command or click | Undo |
|---|---|---|---|
| 2.1 | Rename the GitHub repo | `gh repo rename subway-seek`, then `git remote set-url origin https://github.com/CharlieNey/subway-seek.git`. GitHub redirects the old URL | `gh repo rename stand-clear`. The redirect breaks if another repo ever takes the old name <!-- keep-name --> |
| 2.2 | Domain (optional) | Buy it at a registrar in your own name. `*.fly.dev` and `*.pages.dev` work without one | Let it lapse; the purchase isn't refundable |
| 2.3 | Google Cloud display names | IAM & Admin, Settings: the project's display name. Google Maps Platform, Map management and Map styles: the two Map IDs and the style, to "Subway Seek Mosaic". The ids don't change, so no code changes | Rename them back |
| 2.4 | Retitle the three private design artifacts linked from DESIGN.md | In claude.ai | Retitle back |

## 3. The repo, ready to show

| # | Do | Command or click | Undo |
|---|---|---|---|
| 3.1 | A contact address in the terms | Replace `CONTACT-ADDRESS` in `apps/web/terms.html`; commit | `git revert` |
| 3.2 | Retake the screenshots that show the name | `docs/screenshots/01-home.png`, `05-radar-answered.png`, `06-you-hide.png`, `replay.gif` (the README's captions say how they were made) | `git revert` |
| 3.3 | Checks | `pnpm lint && pnpm typecheck && pnpm test`, then `pnpm --filter @subway-seek/web build` | — |

**The MTA's licence (optional).** The route symbols are the game's own hexagons since 2026-11-21 (DESIGN.md, Route tiles), so none is needed for them. The MTA licenses its "logos, maps, symbols or other intellectual property", lists "NYCT subway route indicators" and station names among them, and charges no fee for approved free apps ([licensing program](https://www.mta.info/doing-business-with-us/licensing-program), read for the market research, §3.4). In 2021 it refused one indie game, which then removed its route indicators. To bring the MTA's bullets back, apply there and wait for a yes before changing `RouteBullet` in `apps/web/src/ui/vocab.tsx`. The game takes station names from the open data feed (its terms are read in `docs/proposals/license.md`); if you apply, ask whether the names need anything more. Undo: nothing to undo; an application commits you to nothing.

## 4. The server (Fly.io)

| # | Do | Command or click | Undo |
|---|---|---|---|
| 4.1 | Account | `brew install flyctl`, `fly auth signup` with a personal email and card | Close the account (dashboard, Account, Settings) |
| 4.2 | App and volume | `fly apps create subway-seek-server`, `fly volumes create match_logs --app subway-seek-server --region ewr --size 1`. If the name is taken, pick another and change `app` in `infra/fly/fly.toml` | `fly apps destroy subway-seek-server` (deletes the volume, its match logs and live rounds) |
| 4.3 | Secrets | `fly secrets set --app subway-seek-server --stage DAILY_SECRET="$(openssl rand -hex 32)" ALLOWED_ORIGINS="https://<project>.pages.dev"`. Save `DAILY_SECRET` in a password manager | `fly secrets unset <NAME>`. A new `DAILY_SECRET` changes every future daily, so don't rotate it after launch |
| 4.4 | Deploy, one machine | `fly deploy . --config infra/fly/fly.toml --dockerfile apps/server/Dockerfile --ha=false`, then `fly scale count 1 --app subway-seek-server` | `fly releases --app subway-seek-server`, then `fly deploy --image <an earlier image>`; or `fly scale count 0` to switch it off |
| 4.5 | Check | `curl https://subway-seek-server.fly.dev/health` prints `{"ok":true,…}`; `curl …/daily` prints today's start | — |

## 5. The site (Cloudflare Pages)

| # | Do | Command or click | Undo |
|---|---|---|---|
| 5.1 | Project | Workers & Pages, Create, Pages, Connect to Git, the repo. Build command `pnpm --filter @subway-seek/web build`, output `apps/web/dist`, root empty | Settings, Delete project (or `npx wrangler pages project delete <project>`) |
| 5.2 | Build variables | `VITE_SERVER_URL=wss://subway-seek-server.fly.dev`, `VITE_SITE_URL=https://<project>.pages.dev`, `NODE_VERSION=22`. Leave out `VITE_GOOGLE_MAPS_API_KEY` for a keyless site | Edit or remove the variable, then Retry deployment |
| 5.3 | Origins agree | `ALLOWED_ORIGINS` on Fly (4.3) must equal the site's origin exactly, no trailing slash, or every socket is refused | `fly secrets set ALLOWED_ORIGINS=…` |
| 5.4 | A domain, if bought | Pages, Custom domains; `fly certs add play-api.<domain>` with a CNAME; then update `VITE_SERVER_URL`, `VITE_SITE_URL` and `ALLOWED_ORIGINS` | Remove the custom domain and cert; set the variables back |

## 6. Keys or keyless

Decide here. **Keyless is a complete game:** every round ends at the station on the free map, and nothing on Google can bill. With keys, rounds go on to the Street View search, and the quotas cap the cost.

| # | Do | Command or click | Undo |
|---|---|---|---|
| 6.1 | Keyless | Nothing: skip to 7 | Add keys later with 6.2–6.5 |
| 6.2 | Restrict the keys | DEPLOY-PLAN, Google keys: the browser key to the site's referrers and two APIs; the server key to the Street View Static API | Edit the restrictions |
| 6.3 | Signing and quotas | Make the URL signing secret; set the Static API's unsigned requests to 0; set the daily quotas (300 map loads, 150 panoramas, 300 images) and a $5 budget alert | Raise or remove the quotas (costs money past the free caps) |
| 6.4 | Server keys | `fly secrets set --app subway-seek-server GOOGLE_STREETVIEW_SERVER_KEY=… GOOGLE_MAPS_BROWSER_KEY=… STREETVIEW_SIGNING_SECRET=…` | `fly secrets unset` the three (rounds end at the station again), or for one day `fly secrets set STREET_ENDGAME=off` |
| 6.5 | Browser key | Pages variable `VITE_GOOGLE_MAPS_API_KEY`, then Retry deployment | Remove it and redeploy |

## 7. Smoke test on the live site

- Chrome, Safari and Firefox on a computer: a daily to the end, an Easy practice round, You hide; reload mid-round and the round comes back.
- A phone: `/`, `/hardest` and `/play?replay=yesterday` (yesterday's daily needs a day of uptime first).
- `fly logs --app subway-seek-server` shows the rounds; `pnpm metrics` reads the match logs once copied down.
- If something is wrong: `fly scale count 0` takes the server down; the site then shows its connection error.

## 8. Public

| # | Do | Command or click | Undo |
|---|---|---|---|
| 8.1 | Make the repo public (optional; the site doesn't need it) | `gh repo edit --visibility public --accept-visibility-change-consequences` | `gh repo edit --visibility private --accept-visibility-change-consequences`. Clones and forks made meanwhile stay out there, and going private drops stars and watchers |
| 8.2 | The personal site | charlie-site, charlie-site-ride3d, charlie-site-demo: the shared name constant to "Subway Seek", the slug to `subway-seek`, the `public/projects/` and `public/og/` names, new screenshots | Revert there |
| 8.3 | Tell people | `docs/launch/`: the Show HN fact sheet (Charlie writes the post), the r/JetLagTheGame data post (mods first), the `/hardest` post for a transit sub | Delete the post; copies and caches remain |

## It's live when

- `https://subway-seek-server.fly.dev/health` answers `ok`, and the site's homepage shows today's daily number.
- A daily played on the live site ends with a share result whose link opens the site's card.
- `fly logs` shows that round, and nothing in 0–6 is left undone except what you chose to skip.
