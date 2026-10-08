# Stand Clear

Online 1v1 hide and seek on the real NYC subway timetable and Google Street View. Design, rules and build plan: [DESIGN.md](DESIGN.md).

**Playable now:** seek a bot in the daily challenge or practice, or choose **You hide** and let a paced bot seek you. Ride the real timetable at 6×, use questions and cards, and finish on Google Street View. Human hides start at 10:00 with twenty game-minutes to ride; daily and practice seeking start at 10:20.

## Quickstart

```sh
pnpm install
pnpm dev:server     # game server on ws://localhost:8787
pnpm dev:web        # client on http://localhost:5173
```

The homepage is at `/` and the game at `/play`: `/play?daily` (today's daily, or carry on with it), `/play?practice` (with `&difficulty=easy|normal|hard`), `/play?hide` (Normal seeker, with the same difficulty parameter), and `/play?replay` (the last daily's replay, from this browser). Hide history has separate replay links. Plain `/play` carries on with this browser's round. The server answers `GET /daily` beside its WebSocket with today's start and reachable stations and yesterday's hider; the homepage reads it without starting a round.

Optional env:
- `GOOGLE_STREETVIEW_SERVER_KEY` in `apps/server/.env.local` (gitignored): server key (Street View API only) used to pick bot hiding spots and verify human hiding spots, exits and bot walks. Bot-hide rounds can fall back to "find the station" without it; **You hide requires working Google metadata and browser imagery keys** to leave a station and lock a spot.
- `DAILY_SECRET` (server): mixed into the daily seed so players can't compute the answer. A dev default is used if unset; set a real one anywhere public.
- `VITE_GOOGLE_MAPS_API_KEY` in `apps/web/.env.local` (gitignored): browser key from the `stand-clear-nyc` Google Cloud project, restricted to the Maps JavaScript + Street View Static APIs and `http://localhost:5173/*`. The game's map uses it (Google Maps; one billed map load per page).
- `VITE_MAP_PROVIDER=maplibre` (web): use the free MapLibre/OpenFreeMap base map instead of Google, e.g. while iterating locally. Google's terms require the Google map once Street View is on screen.
- `VITE_SITE_URL` (web): the site's origin for the link-preview tags in `index.html` (`og:url`, `og:image`). Defaults to `http://localhost:5173`; set on Vercel (`docs/DEPLOY.md`).
- Dev only, per tab: `?map=maplibre` (or `google`) picks the base map, and `?server=ws://localhost:8788` points the tab at another server, for headless checks without billed map loads.

You hide offers Pause throughout and hiding-phase fast-forward capped at 10:20; seeking has no skip. Its result is seeker time plus question bonuses and time-bonus cards still held. The homepage's **Daily seeking record** counts daily seeking only; **Hide history** is separate. Leaving early keeps an incomplete replay with no score or share result.

A round survives a refresh or a dropped connection: the browser keeps a session token and the server holds the round for 3 minutes. Its clock keeps running meanwhile (solo rounds don't pause on a drop). With `GOOGLE_STREETVIEW_SERVER_KEY` set, the server also checks street-walk targets against Street View metadata; human-hide verification retries a lookup error once.

Human-hide server snapshots store panorama IDs and rehydrate coordinates when restored. Browser hide replays keep the latest twenty rounds with street positions reduced to public MTA exits; completed score history remains. No Google coordinates are saved in those snapshots or replays.

## Commands

| Command | What it does |
|---|---|
| `pnpm data:build` | Rebuild `packages/data/dataset/nyc-subway.json` from cached MTA downloads (`--refresh` re-downloads) |
| `pnpm --filter @stand-clear/data build-landmarks` | Rebuild `nyc-landmarks.json` (parks, museums, libraries, hospitals, zoos, airports) from OpenStreetMap + NYC Open Data |
| `pnpm test` | Vitest across all packages |
| `pnpm sim` | Balance check: questions to find the hider's station, and which kinds a strong seeker uses (`--pace 8`, `SIM_RULES=…`; see `docs/question-balance.md`) |
| `pnpm sim:endgame` | Balance check: how long the street search takes, with and without on-foot questions (see `docs/endgame-balance.md`) |
| `pnpm sim:match` | Balance check: a bot seeker plays whole rounds against the bot hider with real travel time — station time, endgame share, hider score, cards and curse costs per difficulty (`--rounds`, `--hub`, `--difficulty`, `--seed`, `SIM_RULES`, `SIM_DECK`, `SIM_COST`; see `docs/match-balance.md`) |
| `pnpm sim:hide` | Paced human-hide scenarios: ten per seeker level, identical seeds, platform waiting and never-lock cases; virtual clock and synthetic panoramas (`--rounds`, `--difficulty`, `--seed`, `--endgame-at`, `--json`; see `docs/match-balance.md`) |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm lint` / `pnpm format` | Biome check / fix |

## Layout

- `packages/data`: MTA open data → the game's dataset (one pinned weekday), plus landmarks for questions
- `packages/engine`: pure game rules (no I/O)
- `apps/server`: authoritative WebSocket game server
- `apps/web`: Vite + React client

## Data attribution

Timetable and station data from the [MTA](https://new.mta.info/developers) (subway GTFS) and [data.ny.gov](https://data.ny.gov) (MTA Subway Stations; MTA Subway Entrances and Exits). Map data © OpenStreetMap contributors.
