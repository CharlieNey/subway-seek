# How Stand Clear is built

Stand Clear is hide and seek on the real New York subway timetable. A hider rides for 20 game-minutes and gets off somewhere. The seeker rides the same timetable at 6× real time, asks questions that rule stations out, then comes up and searches the street around the station. Today every round is solo: you seek a bot (the daily, practice) or a bot seeks you (You hide).

This page is the five-minute version. The full design, with every rule and a dated decision log, is [`DESIGN.md`](../DESIGN.md) (180 KB). Balance write-ups are in [`docs/`](.).

```
   MTA GTFS + data.ny.gov ──► packages/data ──► nyc-subway.json (5 MB, one pinned weekday)
                                                    │
                       ┌────────────────────────────┼─────────────────────────────┐
                       ▼                            ▼                             ▼
                 packages/engine  ◄── pure rules, shared by everything below ──►  scripts/ (sims)
                 (state, intent, t) → state                                    pnpm sim, sim:match…
                       │                            │
                       ▼                            ▼
              apps/server (Node, ws)  ── JSON over WebSocket ──►  apps/web (Vite, React)
              holds the whole round,     intents in, views out    derives trains and clock
              sends each side its view                             from the same timetable
```

| Package | Source lines | Test lines | What it is |
|---|---:|---:|---|
| `packages/data` | 1.1k | 0.2k | GTFS to dataset pipeline |
| `packages/engine` | 6.6k | 3.3k | Rules, bots, the visibility filter |
| `apps/server` | 2.2k | 1.1k | Sessions, limits, persistence, Street View lookups |
| `apps/web` | 16.4k | 1.5k | Client |

Strict TypeScript everywhere, Biome, Vitest. 305 tests in 49 files.

## 1. The dataset

`pnpm data:build` turns the MTA's regular subway GTFS feed (not the "supplemented" one, which layers in this week's planned work) and two data.ny.gov tables (stations, entrances and exits) into one JSON file for a single pinned weekday. Why one day: a daily puzzle must be the same for everyone, and the bot and the simulations need a fixed world.

What it keeps: 28 routes, 475 stations in 424 complexes, 8,349 trips and 236k stop times, 613 transfers, 222 simplified track shapes, 2,047 street exits. Staten Island Railway is dropped (you can't reach it without the ferry). Derived facts are computed here, not in the game: "express stop" means some train serving the station skips a station elsewhere on its run (patterns flip by borough and time of day, so route letters can't tell you). The pure helpers are unit-tested (`src/build.ts`); the dataset has its own sanity tests.

The pin expires in the sense that a past date no longer matches any real schedule. `pnpm data:check` runs in CI and warns a week ahead; re-pinning is one command plus the balance re-runs (`docs/DEPLOY.md`). Landmarks for the questions (parks, museums, libraries, hospitals, zoos, airports) come from OpenStreetMap and NYC Parks via `build-landmarks`.

## 2. The engine: rules as pure functions

`packages/engine` has no sockets, timers or I/O. Every rule is a function of (state, intent, game time) that returns a new state or an error. The server, both bots, four simulations and the tests run this one implementation, so a balance number measured by `pnpm sim:match` is a number about the game players play.

Two ideas keep it small and deterministic:

- **State is lazy.** A ride is stored as (trip, boarding stop, alighting stop). `resolve(state, t)` works out whether you're waiting, riding or arrived at time t. Nothing ticks; any party with the public timetable and the clock derives the same answer.
- **Time is game time.** Seconds since service-day midnight, the dataset's own unit. The clock is an anchor plus a speed, so pause, resume and fast-forward are re-anchoring, not loops.

Main modules: `transit.ts` (platforms, trains, transfers, exits, walking), `reach.ts` (a connection-scan search for "where could the hider get by 10:20"), `questions.ts` (six families, each an evaluation plus a partition of the candidates), `solo.ts` (a round: questions and cooldowns, the answer window, cards, the street endgame, scoring), `hider.ts` (the same round when a person hides), `cards.ts`, and the two bots.

## 3. The server is authoritative

The seeker must never learn where the hider is except through answers. Clients can't be trusted with that, so the server holds the whole round, secret parts included, and runs every intent through the engine itself.

**Protocol.** One WebSocket per player. The client sends `{ type: "intent", seq, intent }`; zod validates it, and type-level checks keep the schemas in lockstep with the engine's types. The server answers with `hello`, `state` or `rejected`, each carrying a clock sync and the player's full view. Every intent has an increasing `seq`, so a resend after a reconnect can't charge a question twice.

**One visibility filter.** Everything a player receives is `soloView(round, t)` or `hiderView(round, t)`. The seeker's view has the candidates, landed answers, played cards and their own trail, never the hider's station, spot or hand. A question's answer is held until its one-minute window ends. The hider's marker is sent only within 40 m of a seeker on the street. A frame is pushed only when the view changes: an earlier version pushed on any change to the round, so a frame arriving with no visible change said "you just reached the right station". The decision log has several fixes like that one. A property test (`visibility.test.ts`) checks every frame of 39 bot-played rounds against these rules, and fails if any of them is broken.

**Anti-cheat beyond hiding state.** The engine rejects anything off the menu (a radar of any distance but the five allowed, a line that doesn't stop where you are, a question on cooldown). With a Street View key configured, street walks are checked against Google's free metadata endpoint, so you can't stand inside a building. Limits: 30 new rounds per address per hour, 40 walks per session per minute, 40 messages per session in any 10 s (past that the socket closes with 4004), 500 sessions, 16 KiB per message. The upgrade checks the page's Origin against `ALLOWED_ORIGINS`, so another site's page can't open rounds; a production server won't start without the list.

**The daily is deterministic and secret.** A day's hub, hider, spot and exit photo come from separate seeds of `FNV-1a("stand-clear-daily|" + secret + "|" + date)` through mulberry32. Separate seeds mean a retried Street View lookup can't shift the hider. The secret matters because the engine also ships to the browser: a date-only seed would let anyone compute today's answer from the page. A production server refuses to start without one.

**Sessions survive drops and deploys.** A session token in the browser picks the round back up for 3 minutes after a drop. It travels as a second WebSocket subprotocol (`session.<token>`, beside `game.v1`), not in the URL, so it stays out of access logs. A solo clock keeps running through a drop, since a pause would be free thinking time on the daily. Sessions are saved to SQLite (Node's built-in) on every change and restored at boot, so a deploy shorter than three minutes ends no rounds. Google's coordinates are never stored, only panorama IDs, which the terms allow; coordinates are looked up again on restore.

**Rounds that end at the station.** Without Street View (no key on the server, `STREET_ENDGAME=off`, or the client reporting that Google refused) a round is `stationOnly`: no spot, no photos, no street curses, and reaching the hider's station is the find. A round can switch mid-way through the `streetOff` intent. The client's side is `apps/web/src/streetMode.ts`: it watches for Google's refusals, remembers one until Google's quotas reset at midnight Pacific, and rebuilds the map as MapLibre. `GET /replay/yesterday` plays yesterday's daily this way with the bot seeking, once per date, for the phone replay.

## 4. The client derives, the server decides

The client holds the same 5 MB timetable (about 600 KB compressed, cached for a year by content hash) and the clock sync. It works out every train's position, the departure boards and your own movement locally, and animates them, while the server only sends discrete changes. Motion that stands for transit time moves linearly at the clock's rate, so what you see is where you are. The map is Google Maps with deck.gl layers in production (Google's terms require a Google map beside Street View) and MapLibre with OpenFreeMap in development, so working on the UI costs nothing.

## 5. Bots and simulations

Both bots are search and scoring, not learned models: the daily must be deterministic and free to run, and with about 80 candidate stations the best question can be computed outright.

- **The question policy.** For each question it can ask, the seeker computes how the answer would split the remaining candidates, and picks the most expected information per game-minute spent, counting the hider's time bonus. `hardness.ts` runs this policy from each hub to count how many questions each station takes to pin. That table is the `/hardest` page.
- **The bot hider** picks uniformly from a band of that table: Easy 3–4 questions, Normal 5–6, Hard 7–8. It plays Veto and Randomize from public information only. If it looked at the true answer, a veto would tell the seeker "that one would have helped". Curses use what a real hider would see: where the seeker is and which way they're heading.
- **The bot seeker** gets only a `SoloView`, by type, so it can't cheat. It asks when a question is ready, rides toward the candidates, and with a few left comes up and sweeps the street, asking on foot when the expected saving beats the price.

Four simulations run those bots on the real timetable:

| Command | Question | Result (fall 2026 timetable) |
|---|---|---|
| `pnpm sim` | How many questions find the station? | A strong seeker pins it in all 1,028 games, mean 5.4 questions. A seeker that never moves pins only 780: riding matters. Prices and cooldowns were set here. When every question cost a flat +10 min, a strong seeker spent over 90% of its questions on radar and "does this line stop here", so the set grew to six families with their own prices. |
| `pnpm sim:endgame` | How long is the street search? | 58 game-min median walking alone, 17.5 with on-foot questions (3.3 asked). That puts the endgame at a third to half of seeking, the design's target. |
| `pnpm sim:match` | Whole rounds, bot vs bot, with cards | Normal (the daily's level): found 98%, station at 39 min, endgame 37% of seeking, hider score 174 min. Easy 100% found, Hard 96%. The deck mix and curse prices came from this run. |
| `pnpm sim:hide` | You hide: is any hiding trick unbeatable? | 52 paired hides per seeker level: caught 50, 51 and 51. Waiting on platforms and never locking a spot didn't escape the end conditions. With `--station-only` (no Street View), 52 of 52 at each level, median 34.5 game-min, once the bot hunts station by station. |

The results are written up in `docs/question-balance.md`, `endgame-balance.md` and `match-balance.md`, and a rule change isn't done until its simulation has been re-run and the write-up updated.

## 6. Tests and CI

CI (`.github/workflows/ci.yml`) runs Biome, `tsc` in every package, Vitest, the timetable freshness check and the web build on every push to any branch and on pull requests. `sims.yml` runs the four simulations (smaller match and hide runs) whenever the engine or the timetable changes, and keeps their output for 30 days. Tests that would be embarrassing to lack: the visibility property test; "never rules out the hider, whatever is asked"; answer windows; resume after a restart, through a real socket and a restarted server process (`hideSocket.test.ts`); a malformed frame not crashing the server (`socketErrors.test.ts`); the daily seed being the same for everyone and different with another secret; Street View URL signing against Google's documented example.

## 7. Deliberately not built

- **Two-player rooms.** The engine and protocol are built for sides with one or more players, but rooms, matchmaking and a two-player disconnect rule aren't (M3 in `DESIGN.md`). Solo comes first because it needs no playtesters.
- **Curated Street View zones.** Walks are checked one target at a time, and the catch is straight-line distance. Validating moves against a panorama graph waits for two-player rounds.
- **Accounts and server-side records.** The daily record lives in the browser, on the honor system, until there is a record worth protecting.
- **A phone round.** Map, Street View and board need about 860 px side by side. Phones get replays (yesterday's daily played by the bot, and their own), the hardest-stations page, and a notice with a "try anyway" for rounds. What a phone round needs is a proposal in `DESIGN.md` (Phones).
- **Three cards** (Move, Signal problems, Local only), and real-time delays (a GTFS-RT replay of a real day).
- **An LLM opponent.** Decided against on 2026-10-06: the bot's choices are small exact searches that must be deterministic, reproducible in tests and free (section 5).

## Read next

- [`DESIGN.md`](../DESIGN.md): the rules, the Mosaic look and motion, open questions, and the decision log at the end.
- [`docs/street-view-spike.md`](street-view-spike.md): how Google's terms shaped the architecture.
- [`docs/match-balance.md`](match-balance.md): the bot-vs-bot rounds and what they changed.
- [`docs/DEPLOY-PLAN.md`](DEPLOY-PLAN.md): how to host it.
