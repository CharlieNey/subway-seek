# Stand Clear

Online 1v1 hide and seek on the real NYC subway timetable and Google Street View. Design, rules and build plan: [DESIGN.md](DESIGN.md).

**Playable now (M2):** solo rounds against a bot hider. Ride the real subway at 6×, ask map questions (radar, thermometer, routes, borough, express, more routes) and watch the possible stations shrink, then get off at the hider's station to win.

## Quickstart

```sh
pnpm install
pnpm dev:server     # game server on ws://localhost:8787
pnpm dev:web        # client on http://localhost:5173
```

## Commands

| Command | What it does |
|---|---|
| `pnpm data:build` | Rebuild `packages/data/dataset/nyc-subway.json` from cached MTA downloads (`--refresh` re-downloads) |
| `pnpm test` | Vitest across all packages |
| `pnpm sim` | Balance check: how many questions it takes to find the hider's station |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm lint` / `pnpm format` | Biome check / fix |

## Layout

- `packages/data`: MTA open data → the game's dataset (one pinned weekday)
- `packages/engine`: pure game rules (no I/O)
- `apps/server`: authoritative WebSocket game server
- `apps/web`: Vite + React client

## Data attribution

Timetable and station data from the [MTA](https://new.mta.info/developers) (subway GTFS) and [data.ny.gov](https://data.ny.gov) (MTA Subway Stations; MTA Subway Entrances and Exits). Map data © OpenStreetMap contributors.
