# Stand Clear

Online 1v1 hide and seek on the real NYC subway timetable and Google Street View. Design, rules and build plan: [DESIGN.md](DESIGN.md).

**Playable now:** a daily challenge (same hidden station for everyone, shareable result) plus practice rounds against a bot hider. Find the station with map questions, then search the streets around it in Google Street View and catch the hider. Ride the real subway at 6×, ask map questions (radar, thermometer, routes, borough, express, more routes) and watch the possible stations shrink, then get off at the hider's station to win.

## Quickstart

```sh
pnpm install
pnpm dev:server     # game server on ws://localhost:8787
pnpm dev:web        # client on http://localhost:5173
```

Optional env:
- `GOOGLE_STREETVIEW_SERVER_KEY` in `apps/server/.env.local` (gitignored): server key (Street View API only) used to pick the bot hider's exact Street View spot. Without it, rounds fall back to "find the station".
- `DAILY_SECRET` (server): mixed into the daily seed so players can't compute the answer. A dev default is used if unset; set a real one anywhere public.
- `VITE_GOOGLE_MAPS_API_KEY` in `apps/web/.env.local` (gitignored): browser key from the `stand-clear-nyc` Google Cloud project, restricted to the Maps JavaScript + Street View Static APIs and `http://localhost:5173/*`. The game's map uses it (Google Maps; one billed map load per page).
- `VITE_MAP_PROVIDER=maplibre` (web): use the free MapLibre/OpenFreeMap base map instead of Google, e.g. while iterating locally. Google's terms require the Google map once Street View is on screen.

## Commands

| Command | What it does |
|---|---|
| `pnpm data:build` | Rebuild `packages/data/dataset/nyc-subway.json` from cached MTA downloads (`--refresh` re-downloads) |
| `pnpm --filter @stand-clear/data build-landmarks` | Rebuild `nyc-landmarks.json` (parks, museums, libraries, hospitals, zoos, airports) from OpenStreetMap + NYC Open Data |
| `pnpm test` | Vitest across all packages |
| `pnpm sim` | Balance check: questions to find the hider's station, and which kinds a strong seeker uses (`--pace 8`, `SIM_RULES=…`; see `docs/question-balance.md`) |
| `pnpm sim:endgame` | Balance check: how long the street search takes, with and without on-foot questions (see `docs/endgame-balance.md`) |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm lint` / `pnpm format` | Biome check / fix |

## Layout

- `packages/data`: MTA open data → the game's dataset (one pinned weekday), plus landmarks for questions
- `packages/engine`: pure game rules (no I/O)
- `apps/server`: authoritative WebSocket game server
- `apps/web`: Vite + React client

## Data attribution

Timetable and station data from the [MTA](https://new.mta.info/developers) (subway GTFS) and [data.ny.gov](https://data.ny.gov) (MTA Subway Stations; MTA Subway Entrances and Exits). Map data © OpenStreetMap contributors.
