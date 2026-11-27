# Deploy plan: personal accounts, about $4 a month

*Written 2026-11-20, updated 2026-11-21 (keyless deploys, `ALLOWED_ORIGINS`). Prices were read from each vendor's own pricing or docs page on the 20th; sources at the end. Nothing here has been run yet. The ordered go-public checklist, with an undo for each step, is [`GO-PUBLIC.md`](GO-PUBLIC.md). The runbook for day-to-day operation is [`DEPLOY.md`](DEPLOY.md).*

## The recommendation

| Piece | Where | Monthly cost |
|---|---|---|
| Game server (one Node process, WebSockets, a 1 GB volume for SQLite and match logs) | **Fly.io**, one `shared-cpu-1x` machine with 512 MB in `ewr` (Newark) | $3.69 machine + $0.15 volume = **$3.84**. Fly waives a personal organization's bill under $5, so likely $0 billed |
| Web client (static files, 5 MB dataset served compressed) | **Cloudflare Pages**, free plan | **$0**. No bandwidth limit, 25 MiB per file |
| Map, Street View, photos | **Google Maps Platform**, your own project and billing account | **$0** while daily quotas keep each API under its free monthly cap |
| Domain | Optional. `*.fly.dev` and `*.pages.dev` work with TLS | $0, or about $10–15 a year |

**Ceiling: under $5 a month,** with every piece capped by size or quota rather than by an alert (see [Capping cost](#capping-cost)).

### Don't use the earlier AWS setup

The plan before this one (`infra/aws`, and `docs/DEPLOY.md` up to 2026-11-20) ran in an AWS account that someone else administers, not one Charlie owns. Don't deploy a personal project there:

- the owner can see, change or delete it;
- its bills and security findings land on someone else;
- access ends when the relationship does.

Section [Retire the old setup](#retire-the-old-setup) lists what to remove. `infra/aws` still works in a personal AWS account and is kept as an alternative. At about $20–25 a month for a `t3.small` it is five times this plan.

## Why these hosts

The server needs four things:

- one process that never stops, because rounds live in memory and the daily is cached per day;
- WebSockets held for 20–40 minutes;
- a small disk that survives deploys, so rounds survive a restart;
- a region near New York.

| Host | Monthly for this app | WebSockets | Persistent disk | Verdict |
|---|---|---|---|---|
| **Fly.io** | $3.84 (shared-cpu-1x 512 MB $3.69, volume $0.15/GB, shared IPv4 free). Under-$5 bills waived for personal orgs | Fly's proxy doesn't close idle WebSockets. A deploy or proxy restart does, and rounds come back from SQLite (3-minute grace) | Volumes | **Recommended.** `infra/fly/fly.toml` is already written for it |
| Railway (Hobby) | About $5 ($5 plan including $5 of usage; RAM about $10/GB-month) | Exempt from duration and idle limits | Volumes up to 5 GB on Hobby. A volume means brief downtime on each deploy | Good second choice. US East region not confirmed |
| Render (Starter) | $7 + $0.25/GB disk | No maximum duration. A deploy closes them | Disks. One instance, no zero-downtime deploys | Works, costs more. **The free tier sleeps after 15 minutes and can't have a disk: unusable** |
| DigitalOcean droplet | $4 (512 MiB, IPv4 included) or $6 (1 GiB) | No proxy, so no limits | The droplet's disk | Cheapest VPS. `infra/aws/docker-compose.yml` with Caddy runs on it nearly unchanged. You patch the OS yourself |
| AWS Lightsail | $5 (0.5 GB, IPv4) | No proxy | Instance disk | Fine in a personal AWS account, same upkeep as a VPS |
| Hetzner (US) | €17.99 (CPX11, the smallest US plan after the 2026 price rises) | No proxy | Local disk | No: no longer cheap in the US, and new-customer server creation was restricted at the time of writing |

For the client:

| Host | Free limits | Fit |
|---|---|---|
| **Cloudflare Pages** | No bandwidth limit, 20,000 files, 25 MiB per file, 500 builds a month; SPA fallback is automatic; `_headers` for headers | **Recommended.** A traffic spike costs nothing and can't switch the site off |
| Vercel Hobby | 100 GB transfer and 1M requests a month; over that, you wait out 30 days. "Personal or non-commercial use" only | Already configured (`vercel.json`). Fine for a free game, but a spike past 100 GB takes the site down for the rest of the month |
| Netlify Free | Credit-based since 2025-09: 300 credits a month, about 15 GB, and each deploy costs credits | No |

## Environment and secrets

| Where | Name | Value | Secret? |
|---|---|---|---|
| Fly (`fly secrets set`) | `DAILY_SECRET` | 32+ random bytes (`openssl rand -hex 32`). The server refuses to start in production without it. Changing it changes every future daily | Yes |
| Fly | `ALLOWED_ORIGINS` | The site's origin(s), comma-separated: `https://<project>.pages.dev`, your domain. The server refuses to start in production without it and closes sockets from any other page | No |
| Fly | `GOOGLE_STREETVIEW_SERVER_KEY` | Server key (below). **Optional:** without it every round ends at the station (Phase 3, Fallback) | Yes |
| Fly | `GOOGLE_MAPS_BROWSER_KEY` | The browser key, used to sign photo URLs. Optional, as above | Not secret (it ships to browsers), but set it with the signing secret |
| Fly | `STREETVIEW_SIGNING_SECRET` | The project's URL signing secret. Optional, as above | Yes |
| Fly (optional) | `STREET_ENDGAME` | `off` ends every round at the station even with keys: the switch for a day Google's quota runs out. Unset otherwise | No |
| Fly (`fly.toml [env]`, already set) | `PORT`, `SESSION_DB`, `MATCH_LOG_DIR`, `CLIENT_IP_HEADER=fly-client-ip`, `NODE_OPTIONS` | As committed | No |
| Cloudflare Pages (build env) | `VITE_SERVER_URL` | `wss://<fly app>.fly.dev` or your API host | No |
| Cloudflare Pages | `VITE_GOOGLE_MAPS_API_KEY` | The browser key. **Optional:** without it the site draws the free map (OpenFreeMap) and rounds end at the station | No (referrer-restricted) |
| Cloudflare Pages | `VITE_SITE_URL` | `https://<project>.pages.dev` or your domain, no trailing slash | No |
| Cloudflare Pages | `NODE_VERSION` | `22` | No |
| GitHub (optional, for deploys from Actions) | `FLY_API_TOKEN` | `fly tokens create deploy` | Yes |

## Google keys

Use a Google Cloud project on a billing account Charlie owns. The docs name the project `stand-clear-nyc`; check that it is on a personal billing account before relying on it.

1. **Browser key** (`VITE_GOOGLE_MAPS_API_KEY`):
   - Application restriction: Websites (HTTP referrers) `https://<project>.pages.dev/*`, your domain if any, and `http://localhost:5173/*` for development.
   - API restriction: Maps JavaScript API and Street View Static API only.
2. **Server key** (`GOOGLE_STREETVIEW_SERVER_KEY`):
   - API restriction: Street View Static API only (the metadata endpoint is part of it and is free).
   - Application restriction: an IP address if the server has a fixed outbound IP. Fly doesn't give one by default, so otherwise rely on the API restriction, the secret store and the quota.
3. **URL signing.** Generate the signing secret (Credentials, Street View Static API, "URL signing secret") and set the Static API's **unsigned requests per day to 0**. Then a copied browser key can't fetch images on its own. *Check the server's metadata lookups still work after this.* If they don't, the server must sign them too (`apps/server/src/sign.ts` already signs URLs).
4. **One key per job.** Don't reuse these keys for anything else, and disable the APIs the project doesn't use.

## Capping cost

Google budgets only alert; they don't stop billing. What caps spend is a per-day quota on each API (Google Cloud console, APIs & Services, the API's Quotas page). Set these so a whole month stays under each free cap:

| API (SKU) | Free per month | Then per 1,000 | Daily quota | What one round uses |
|---|---|---|---|---|
| Maps JavaScript API (Dynamic Maps) | 10,000 | $7 | **300 map loads** | 1 per page load of `/play` |
| Street View in the JS API (Dynamic Street View, a Pro SKU) | 5,000 | $14 | **150 panoramas** | 1 per round with a street endgame, if the panorama object is reused (check in the console after the first rounds) |
| Street View Static API (images) | 10,000 | $7 | **300 images** | 0–2 photo questions |
| Street View metadata | Unlimited, free | — | — | A few per round, server-side |

At those quotas Google refuses further loads for the rest of the day instead of billing. The client handles a refused map: the round carries on without it (`DESIGN.md`, Loading, connecting and errors). A refused panorama shows Try again and, since 2026-11-21, "End at the station", which finishes the round on the free map. If the quota runs out early in a day, `fly secrets set STREET_ENDGAME=off` ends every round at the station until you unset it (`fly secrets unset STREET_ENDGAME`). Raise the quotas as players turn up (past the free caps they cost money), and keep a $5 budget alert as a second signal.

- **Fly:** cost is bounded by size. Keep one machine (`fly scale count 1`, never `--ha`), no autoscaling.
- **The volume:** match logs run about 30 KB a round, so 1 GB holds some 30,000. The server deletes logs older than 90 days at boot and daily (`apps/server/src/logSweep.ts`; built 2026-11-27 on `fun-round-1`, it ships with the fun round). Copy logs down with `fly ssh sftp` before then if you want them for `pnpm metrics`.
- **Cloudflare:** the free plan has no overage billing.

## Exact steps

From a laptop, in the repo root on `main`, after the branch is merged.

**0. Before anything public**
- Set `DAILY_SECRET` and `ALLOWED_ORIGINS`. Without them production won't boot.
- Replace `CONTACT-ADDRESS` in `apps/web/terms.html` with a real address.
- Choose a license (`docs/proposals/license.md`).

**1. Fly account and app**
```sh
brew install flyctl
fly auth signup        # or: fly auth login. Use a personal email and a personal card.
fly apps create subway-seek-server         # if the name is taken, pick another and change `app` in infra/fly/fly.toml
fly volumes create match_logs --app subway-seek-server --region ewr --size 1
```

**2. Server secrets**
```sh
fly secrets set --app subway-seek-server --stage \
  DAILY_SECRET="$(openssl rand -hex 32)" \
  ALLOWED_ORIGINS="https://<project>.pages.dev"
# Later, for the Street View endgame (step 5 first):
fly secrets set --app subway-seek-server \
  GOOGLE_STREETVIEW_SERVER_KEY=… GOOGLE_MAPS_BROWSER_KEY=… STREETVIEW_SIGNING_SECRET=…
```
Keep a copy of `DAILY_SECRET` in a password manager. Losing it changes every future daily.

**A keyless first deploy works.** Without the three Google values the server logs that Street View is off and every round ends at the station; without `VITE_GOOGLE_MAPS_API_KEY` the site draws the free map. That is a complete game, and nothing on Google can bill. Add the keys once the quotas in step 5 are set.

**3. First deploy**, one machine, built from the repo root:
```sh
fly deploy . --config infra/fly/fly.toml --dockerfile apps/server/Dockerfile --ha=false
fly scale count 1 --app subway-seek-server
curl https://subway-seek-server.fly.dev/health      # {"ok":true,"sessions":0,"serviceDate":"2027-03-03"}
curl https://subway-seek-server.fly.dev/daily       # today's start and reachable stations
```
`--ha=false` matters: by default Fly creates two machines, and a volume can mount on only one.

**4. Cloudflare Pages**
- In the dashboard: Workers & Pages, Create, Pages, Connect to Git, choose the repo.
- Build command `pnpm --filter @subway-seek/web build`, output directory `apps/web/dist`, root directory empty (the repo root).
- Add the four build variables above (three for a keyless site: leave out `VITE_GOOGLE_MAPS_API_KEY`).
- Deploy, and open `https://<project>.pages.dev`.
- If the Git build fails on pnpm, build locally and upload instead: `pnpm --filter @subway-seek/web build && npx wrangler pages deploy apps/web/dist --project-name <project>`.

Headers and caching come from `apps/web/public/_headers`. Unknown paths fall back to `index.html` automatically.

**5. Google** (section above): restrict both keys, add the signing secret, set the unsigned quota to 0 and the three daily quotas, and set a $5 budget alert.

**6. Smoke test** (`DEPLOY.md`): load the site, play a daily to an answer, come up on an Easy practice round and catch, reload mid-round, and check `fly logs` shows the round.

**7. Optional: deploys from GitHub.** Add the `FLY_API_TOKEN` secret (`gh secret set FLY_API_TOKEN`). `.github/workflows/deploy-server.yml` runs the checks and deploys when started by hand (Actions, Deploy server, Run workflow). To deploy on every push to `main`, uncomment the `push:` block in it.

**8. Optional: a domain.** `fly certs add play-api.<domain>` with a CNAME to the app, a Pages custom domain for the site, then update `VITE_SERVER_URL`, `VITE_SITE_URL`, `ALLOWED_ORIGINS` and the browser key's referrers.

## Retire the old setup

Before or right after the repo goes public:
- **GitHub repository secrets:** `gh secret delete AWS_ROLE_ARN`, `gh secret delete AWS_REGION`, `gh secret delete ECR_REPOSITORY` (and `INSTANCE_ID` if present).
- **In the other AWS account**, ask its administrator to delete:
  - the `stand-clear-server-github` role, which trusts this repo's `main` branch through GitHub OIDC; <!-- keep-name -->
  - the `stand-clear-server` ECR repository and its images; <!-- keep-name -->
  - the `stand-clear-server-instance` role and profile; <!-- keep-name -->
  - the security group;
  - the IAM user's access key if it was created for this.

## Sources (read 2026-11-20)

- Fly.io: [pricing](https://docs.fly.io/about/pricing), [WebSockets and the proxy](https://fly.io/learn/websockets-workers-cron/), [fly.toml reference](https://docs.fly.io/reference/configuration/)
- Railway: [pricing](https://railway.com/pricing), [volumes](https://docs.railway.com/reference/volumes), [network limits](https://docs.railway.com/networking/public-networking/specs-and-limits)
- Render: [pricing](https://render.com/pricing), [free instances](https://render.com/docs/free), [WebSockets](https://render.com/docs/websocket), [disks](https://render.com/docs/disks)
- DigitalOcean: [droplets](https://www.digitalocean.com/pricing/droplets). AWS: [Lightsail](https://aws.amazon.com/lightsail/pricing/). Hetzner: [cloud plans](https://www.hetzner.com/cloud/regular-performance/), [2026 price statement](https://www.hetzner.com/pressroom/statement-price-adjustment)
- Cloudflare: [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/). Vercel: [Hobby plan](https://vercel.com/docs/plans/hobby), [terms](https://vercel.com/legal/terms). Netlify: [credit plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)
- Google Maps Platform: [pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [March 2025 changes](https://developers.google.com/maps/billing-and-pricing/march-2025), [SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details/maps), [managing costs](https://developers.google.com/maps/billing-and-pricing/manage-costs), [API security](https://developers.google.com/maps/api-security-best-practices), [URL signing](https://developers.google.com/maps/documentation/streetview/digital-signature), [metadata](https://developers.google.com/maps/documentation/streetview/metadata)
