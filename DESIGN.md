# Stand Clear — NYC Subway Hide & Seek

*Working title. Design + build plan, as of 2026-10-05. Revised after the Fable and Astra reviews — see the decision log at the end.*

## Pitch

Online, 1v1 hide and seek played on the **real NYC subway timetable** and **Google Street View**, inspired by Jet Lag: The Game's Hide + Seek. The hider rides the subway to a station and hides somewhere within a quarter mile of it. The seeker rides the subway asking questions to work out which station it is, then gets off and searches on foot.

Two layers of deduction make it work online:

- **Map questions find the station.** They're answered automatically by the server, so they're instant and can't be lied about.
- **Photos and Street View find the spot.** This is the human, GeoGuessr-like part, and it gives the show's endgame search an online equivalent.

## Format

- **v1: 1v1.** One hider, one seeker, then swap. Longest hide wins. **Ties stand in v1**; an overtime round is in the parking lot.
- **Platform:** desktop browser first (map + Street View + board side by side); responsive phone layout later.
- Build around **two sides (hider / seekers), each with 1+ players**. Every later format is then a config change:
  - 1 hider vs 2 seekers: the show's format; one seeker rides while the other studies photos
  - 2v2 duos: pairs take turns hiding
  - multiple separate hiders: a party mode, parked for later
- **A bot hider** makes the game single-player for solo playtesting, a practice round, and a tutorial.

## A round (1v1)

**Setup.**
- Both players start at the same hub (e.g. Times Sq–42 St) at 10:00 game time on the pinned service date.
- **Both rounds of a match use the same hub and start time**, so neither player gets an easier timetable.
- The seeker's map starts with every station the hider could reach in the hiding time already shaded, which is honest about the real search space.

**Phase 1 — Hide** (20 game-min ≈ 3.5 real min; always runs the full time)
- **Hider:**
  - rides the subway; when the phase ends, they're at a station, which becomes the center of their 400 m (¼ mi) zone
  - if they're still on a train at the deadline, their station is **the last stop the train called at**. This stops a long express ride from stretching the hide.
  - no early declare: it only ever hurt the hider
- **Seeker** stays at the start, but isn't idle:
  - sees a status line only: *riding / changing trains / walking*, with no routes or places
  - plans on the map, and queues opening questions that fire the instant the phase ends
  - optional rule to playtest (Scotland Yard style): reveal the route letters ridden ("Q, then L"), but not stations

**Phase 2 — Seek** (the two players act at the same time)
- **Hider:**
  - comes up at a station exit of their choice and walks to a spot inside the zone
  - presses **"Hide here"** to lock it in
  - otherwise they're frozen wherever they're standing when either:
    - the seeker steps out on foot anywhere inside the zone, or
    - they answer a spot photo while unlocked (see Photos)
  - can't leave the zone
  - **watches the seeker for the whole game:** their live dot, the trains they take, every question as it's asked, and the stations being ruled out. Watching the net close — and, in the endgame, watching the seeker walk the streets around you — is where the hider's tension comes from.
- **Seeker:** rides the subway, asks questions, and works out *which station*. The seeker never sees the hider.

**Phase 3 — Endgame** (target: **a third to half of the seeking time** — a real second half, not a quick finish)
- The seeker gets off where they think the hider is and comes up at a street exit they choose.
  - A wrong station costs about 2 game-min to go back down and out again.
- Moving on the street is **map-driven** ("walk to this corner"), with Street View for looking around on arrival — not step-by-step clicking.
- The **hider** gets an alert, "Seeker is in your zone." The **seeker gets nothing**, and nothing in the seeker's UI changes when the hider freezes, so it can't leak.
- **Catch:** the seeker is within 25 m of the hider **along the street/panorama graph** (not straight-line, so no catching through a wall or across an elevated track) and clicks the marker. The marker is only sent to the seeker's client within that range.
- **Fallback:** if Street View fails to load, the round falls back to the map-pin endgame (M3).

**Scoring.**
- Seeking ends at **2 game-hours elapsed**, or at the catch.
- **Score = elapsed seeking time + bonuses.** Bonuses (questions, cards) are counted separately from the 2-hour limit, so questions never become "free" near the cap.
- The players swap roles, and the higher score wins. A tie stands.
- A match takes about 40 minutes.

## Rules detail

### Zone and freeze
- Zone = a 400 m radius around the hider's station, measured straight-line from the station's coordinates.
  - Station complexes use one fixed coordinate (the Times Sq complex is itself ~300 m long).
- The hider can walk freely inside the zone until any of:
  1. they press "Hide here" (locks the spot)
  2. the seeker is on foot inside the zone (auto-freeze where they stand, even at the station exit)
  3. they answer a spot photo while unlocked (locks them where they stand)
- Why freeze on entering the zone rather than only "exits at the hider's station": NYC stations are often less than 400 m apart, so a seeker could otherwise get off one stop over and walk in while the hider can still move.
- **Hide-eligible zones only.**
  - The Street View endgame starts with a **curated set of 15–30 stations** whose exits have connected outdoor panorama paths.
  - The hider's spot must be in the **same connected panorama network as the station's exits**, so every spot is reachable by the seeker.
  - Some elevated outer-borough stations will fail.

### Map questions are about the station, not the spot
The hider may still be walking during Phase 2, so map questions answer about their **station** (the zone center). This keeps answers stable and makes "which station?" the clear mid-game goal.

- **Origin: the last station the seeker's train called at** (or their street position if on foot), never a position interpolated along the track. That would turn thermometer into a range-finder fired at every stop.
- **Cooldown:** one question per 5 game-min, across all types. Repeats are allowed (e.g. radar again at a different distance).
- **"Line" = a route letter or number** (A, Q, 7, …), not a trunk line (8th Ave, Broadway).

MVP question set — answerable from MTA data alone, no OSM needed:

| Category | Example | Answer |
|---|---|---|
| Radar | Is your station within 1 mile of me? | yes / no |
| Thermometer | Since my last thermometer, am I closer? | hotter / colder (must be at a different station than last time) |
| Matching | Does the [route the seeker picks] stop at your station? | yes / no |
| Matching | Same borough? | yes / no |
| Matching | Does an express train stop at your station? | yes / no |
| Measuring | Do more routes stop at your station than at mine? | yes / no |

Definitions:
- **"Express stops here"** is defined from the pinned service day's data: a train serving the station skips a station elsewhere on its run. Not from route letters — express/local patterns flip by borough, direction and time of day.
- **Borough** isn't a standard GTFS field: take it from MTA's station list or from borough boundary polygons.
- **"Routes that stop here"** = routes with at least one trip stopping at the station on the pinned service day, within the play window.

Later, with OSM data: nearest park / museum / library matching, "closer to a river than me?", tentacles ("which of these within 2 km is your station nearest?").

### Photos
Split by what the photo is *of*:

- **Station photos — any time.**
  - Taken from **any exit the hider picks** at their station, so they work while the hider is still walking.
  - The game opens a temporary Street View at that exit for the hider to aim; the hider doesn't move.
  - **No prompt ever requires station-name signage**, and the hider frames the view, so a station photo is never a free answer.
  - Examples:
    - the tallest building visible from the exit
    - the widest street at the exit
    - any storefront visible from the exit
    - the nearest tree to the exit
    - the view straight up
- **Spot photos — from 15 game-min into Phase 2.**
  - They open at a **fixed time**, not when the hider freezes, so the button appearing tells the seeker nothing.
  - If the hider is still unlocked when they answer one, they're locked where they stand.
    - A **confirmation popup** warns them first: "Answering locks you here." The choices are **Lock & answer** or **Move first**.
    - With **Move first**, they can keep walking and answer later, within the answer timer.
    - The popup is hider-side only, so it tells the seeker nothing.
  - Examples: what you see straight ahead; the nearest tree to you; the tallest building visible from where you are.
- **Answer time:** 10 game-min (~100 s real). On timeout the server sends a default view (facing north); an unlocked hider is locked where they stand.
- **Photos are server-rendered images with no location data.** The seeker's client never receives a panorama ID or coordinates for a photo; otherwise a station photo would leak the station and a spot photo the spot.
- **Honesty runs on trust**, as on the show. The server can't verify "tallest building visible."

### Question cost
- **v1:** map questions add **+10 min** to the hider's score and photos **+15 min**. Photos cost more because they can be much more revealing. All questions share the 5-minute cooldown.
- **Minimal cards in M3:** time bonuses + Veto, so the hider has a decision on every question.
- **Later:** the full card deck replaces the flat cost.
- Prices get set from M2's simulation (see Build plan), not guessed.

### Starting numbers (tune in playtests)

All times and speeds are in **game time**; at 6×, walking 400 m takes ~5 game-min ≈ 50 real seconds.

| Setting | Game time | Real time at 6× |
|---|---|---|
| Hiding phase | 20 min | ~3.5 min |
| Zone radius | 400 m (¼ mi) | — |
| Seeking limit | 2 h | ~20 min |
| Station entry / exit | 2 min | ~20 s |
| Question cooldown | 5 min | ~50 s |
| Spot photos open | 15 min into Phase 2 | ~2.5 min |
| Photo answer time | 10 min | ~100 s |
| Catch distance | 25 m along the graph | — |
| Walking speed | 1.4 m/s | — |
| Map question bonus (v1) | +10 min | — |
| Photo question bonus (v1) | +15 min | — |

## Time & transit model

### Clock
One **shared, server-authoritative game clock** at **6×** real time:

| Game | Real at 6× |
|---|---|
| Train every 5 min | ~50 s wait |
| 2 min between stops | ~20 s |
| 30 min ride | ~5 min |

**Skip ahead is off in v1.** Later: it needs both players' consent, and the server processes every event in the skipped span (arrivals, freezes, timeouts).

### Player states

```
 AT_STATION  ⇄  ON_TRAIN
     ⇅
 ON_STREET (walking / Street View)
```

- **AT_STATION**
  - see the station's real departure board (from the timetable), with route bullets
  - board a train leaving now, or queue a later one ("next downtown 1")
  - go up to the street at a chosen exit (costs the entry/exit time)
- **ON_TRAIN(trip_id)**
  - position is derived from the trip's `stop_times` + game clock
  - set or change your exit stop any time before the train reaches it; you can get off at *any* stop
- **ON_STREET**
  - **"Walk to this point"** is resolved on the server along the street/panorama graph at walking speed; your map dot moves, and only the arrival panorama loads in Street View
  - this keeps panorama loads (and Google cost) down and avoids a flashing slideshow
- **Entering, exiting and transferring are timed** (in-between) states, so nobody boards instantly:
  - entry/exit takes 2 min
  - transfers between platforms take GTFS `transfers.txt` minimums

### Stations, platforms and exits
- Players see **station complexes** (one Times Sq), but boarding is **platform-level**: moving between platforms inside a complex takes the GTFS transfer time. Grouping never creates instant transfers between distant platforms.
- Players surface at a **specific street exit**, from MTA's entrance data. The zone center stays the station coordinate.

### Hidden information and validation
- The server alone knows the hider's route, station and spot.
- The seeker's client only ever receives: the status line, question answers, photo images (no metadata), and the marker (within catch range).
- The hider's client receives the seeker's live position, trains and questions (Phase 2+). If the Move card later makes this exploitable, delay the view.
- **Positions snap to real panoramas.**
  - For each hide-eligible zone, the server holds the panorama graph and validates every street move against adjacency.
  - A hider can't claim a spot inside a building or park that the seeker can never reach, and "walk to" can't go through walls.
  - Whether metadata calls are free is part of the pricing check; curating zones ahead of time keeps the count small.
- **Intents are ordered and idempotent:** each has a sequence number, so a retry can't double-charge a question or repeat a move.

### Disconnects
- The clock pauses when a player drops. They have a 3-minute grace period to rejoin with their room token, then forfeit.
- A refresh restores the authoritative snapshot; it never resets penalties, cooldowns or movement.

## NYC data notes

Built in M0 (`packages/data`). What the data turned out to be:

- **Source:** MTA's **regular** subway GTFS, not the "supplemented" feed — that one layers in this week's planned work. Plus MTA's *Subway Stations* and *Subway Entrances and Exits* datasets on data.ny.gov for borough, official complex IDs, structure and exits.
- **Pinned date:** Wednesday 2026-10-14 → the single `Weekday` service (8,348 trips, 236k stop times). Times run past 24:00 (up to 28:02).
- **Scope:** 475 stations in 424 complexes. Staten Island Railway is excluded: you can't reach it without the ferry.
- **Complexes:** MTA's official complex IDs; e.g. Times Sq = 127 + 725 + 902 + A27 + R16, 12 routes. Each complex's center is its busiest station's coordinate.
- **Transfers:** 613 from GTFS, including same-station ones (min 180 s). Six are real free transfers *between* complexes (e.g. 59 St ↔ Lexington Av/63 St), kept as walkable transfers.
- **Exits:** 2,047 street exits, at the complex level (MTA files each entrance under one constituent station, sometimes several: `"A12; D13"`). Every complex has at least one; median 4.
- **Directions:** `direction_id` 0 = northbound ("N" platforms), 1 = southbound; MTA's per-station labels ("Uptown & The Bronx") for departure boards.
- **Routes:** a route *letter* is the question identity — express variants fold in (6X → 6, 7X → 7, FX → F) and show as a diamond. The three shuttles (GS, FS, H) all display "S" but stay distinct.
- **Express stops (53 stations / 46 complexes):** computed from the timetable, not route names. A station is express if **≥ 6 express trains call there between 10:00 and 13:00**. An "express train" is one whose hop to or from this station skips a station that another train serves. The threshold drops one-off reroutes and the tail of rush hour; real ones like the Pelham 6 express (Parkchester) and the J express (Myrtle Av) stay.
- **Routes at a station:** route letters with at least one stop there between 10:00 and 13:00.
- **Duplicate names:** five 23 Sts, four Canal Sts — always show route bullets next to station names.
- **Still to verify:** part-time routes (B, W) around the play window; whether each complex's center coordinate is a sensible zone center.

## Architecture

```
 ┌──────────── Client (Vite + React + TS) ────────────────┐
 │ MapLibre map (subway lines from GTFS shapes)           │
 │ Departure board · Question panel · Street View pane    │
 └───────────────▲──────────────────────────┬─────────────┘
                 │ events + state (WebSocket)│ intents (board, alight,
                 │ — only what you may see   │ walk, ask, hide here)
 ┌───────────────┴──────────────────────────▼─────────────┐
 │ Game server (Node + TS, authoritative)                 │
 │ rooms · reconnects · bot hider                          │
 │ └─ engine: clock · state machines · questions ·        │
 │            scoring · visibility filter                 │
 └───────────────▲────────────────────────────────────────┘
                 │ loaded at boot (12 ms)
 ┌───────────────┴────────────────────────────────────────┐
 │ packages/data: nyc-subway.json (5.1 MB, pinned date)   │
 │ routes, stations, complexes + exits, transfers,        │
 │ trips, shapes  (+ hide-eligible zones, OSM POIs later) │
 └────────────────────────────────────────────────────────┘
```

### Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict), Node ≥ 22 | One language for client, server, bot and data scripts; shared types |
| Repo | pnpm workspaces · Biome (lint + format) · Vitest | Low overhead for a solo project |
| Game rules | `packages/engine` — pure TS, no I/O | Server, bot, M2 simulation and tests all run the same code |
| Server | Node + `ws`, hand-rolled room manager | Two players a room; full control over what each player is sent |
| Messages | JSON over WebSocket, intents validated with zod | Every player action is checked before the engine sees it |
| Client | Vite + React SPA · Zustand · Tailwind | The game screen is all client-side; Next.js's server rendering would only get in the way |
| Map | MapLibre GL + OpenFreeMap tiles | Free, no key, OSM-based; self-hosted Protomaps if outgrown |
| Geo maths | turf.js | Distances, zones, radar/measuring questions |
| Street View | Google Maps JS API (client) · Street View Static API (server, photos) | Pending the Street View spike |
| Hosting | Client on Vercel (static) · server on Fly.io near NYC | Long-lived WebSocket process, a few dollars a month |
| Persistence | None in v1: rooms in memory, each match appends its action log to a file | The log feeds playtest metrics and, later, replays |

### Repo layout

```
stand-clear/
  packages/
    data/     M0: MTA GTFS → dataset/nyc-subway.json (pnpm data:build)
    engine/   game rules: clock (done), player states, questions, scoring, visibility
  apps/
    server/   WebSocket rooms, reconnects, bot hider
    web/      Vite + React client
  docs/       review prompt, notes
```

### Engineering principles

1. **The engine is a pure function:** (state, intent, time) → (new state, events). No sockets, no timers — so the server, the bot, the M2 question simulation and the tests share one implementation.
2. **Events, not ticks.** The timetable is public, so every client holds it plus the shared clock. The server sends discrete events ("you boarded trip X at 10:14") and the client animates; the hider's own trips only ever reach the hider's client.
3. **One visibility filter.** Every outgoing message passes through `viewFor(player, state)`, so the hidden-information rules live in one tested place.
4. **Street View zones are curated in a browser tool.** Google's panorama links come from the JS API, so an admin page walks a zone and saves its graph; the server validates moves against that.

### Notes
- **Transit:** no routing engine — departure boards are `stop_times` filtered by station + time; reachability (initial shaded map, bot hider, question simulation) is an earliest-arrival search over the in-memory timetable.
- **Google terms the Street View spike must answer**, any of which could change the stack: must Street View sit next to a Google map (→ swap MapLibre for Google Maps JS)? Can the server fetch a Street View image and relay it to another player (photos depend on it)? Can panorama IDs be stored (curated zone graphs)? Cost per load and per metadata call.
- **Later:** OSM extract for NYC (POIs for richer questions), MTA GTFS-RT recordings for a "replay a real day with its delays" mode.

## Build plan

The deduction loop is the core and is pure functions over GTFS; Street View is the least core and most uncertain piece, so it comes last.

| # | Milestone | Done when |
|---|---|---|
| M0 ✅ | **Data prep** | Script turns MTA GTFS for the pinned date into a compact dataset (complexes, exits, trips, stop_times, transfers, shapes, boroughs, express flags); it loads in < 1 s. *Done 2026-10-05: 5.1 MB, loads in 12 ms, 23 tests.* |
| M1 ✅ | **Transit sandbox** | One player, 6× clock: departure boards, board, choose exit stop, timed transfers and exits, moving dot on the map. *Riding the subway at 6× feels good.* *Done 2026-10-05: every running train animates along its real track; 35 tests.* |
| M2 ✅ | **Questions vs a bot hider** | Single-player: a bot hides at a random reachable station; the six MVP questions are answered automatically; the map shades ruled-out stations. **Simulate question partitions over the reachable set** (average questions to find the station) and set prices from it. *Finding the station is fun on its own.* *Done 2026-10-05: `pnpm sim`; 46 tests; a played round found Borough Hall in 32 min with 2 questions.* |
| M3 | **Two-player round, map endgame** | Room with hider + seeker; Phase 1 → 2 → 3; the hider watches the seeker; Hide here + auto-freeze; the hider drops a map pin in the zone, catch = seeker's pin within 25 m; minimal cards (time bonuses + Veto); reconnects; score + swap |
| M4 ◐ | **Street View endgame** | 15–30 curated hide-eligible zones with connected panorama graphs; "walk to"; catch along the graph; fallback to the map endgame on load failure. *Solo version done 2026-10-05: the bot hides at a real Street View spot (server-side metadata lookup) within 400 m of its station; finding the station starts the endgame (recorded, not revealed); you walk by direction buttons or map clicks at 1.4 m/s; the marker appears within 40 m; catch within 25 m. Verified end to end on Daily #1 (station at 27 min, caught at 35). Simplifications for solo: moves are speed-checked rather than validated against a curated panorama graph, and the catch is straight-line. The multiplayer version still needs the curated zones.* |
| M5 ◐ | **Photos** | Station photos (any exit, any time) and spot photos (fixed open time), server-rendered with no metadata; answer timer. *Solo version done 2026-10-05: "photo from their station exit" (any time) and "from where they're hiding" (from 15 min in), looking N/E/S/W/up — directional prompts a bot can answer fairly. +15 min each, shared cooldown; photos don't narrow the map. Shown as Google Street View Static images loaded from Google (allowed by the terms; the URL contains the panorama ID, so photos run on trust — fine vs a bot). Multiplayer adds human-framed prompts ("tallest building you can see").* |
| M6 | **Full card deck** | Draw-on-answer, hand of 6, powerups, digital curses (see below) |
| M7 | **Polish** | Animated end-of-round replay of both routes; spectator view; room-code matchmaking; more formats (1v2, 2v2) |

**Street View spike (now, before the solo track):** walk one zone in Street View at 6×, count panorama loads per round, and settle the pricing/terms question. Street View is the hook, so confirm early that it feels right and is affordable — but don't build on it until M4. *Done 2026-10-05 — findings in `docs/street-view-spike.md`: Google works and is cheap, but its terms block our side-by-side layout and server-relayed photos; provider decision pending a Mapillary check.*

### Solo track (no playtesters needed)

Charlie is holding off on live playtests, so these come before M3. They make solo play worth returning to, and the bots stand in for playtesters.

| # | Item | Done when |
|---|---|---|
| S1 ✅ | **Daily challenge** | Everyone gets the same bot-hidden station each day (seeded by date), same start and timetable; a shareable result line ("Stand Clear #12 · found in 41 min · 3 questions"); practice rounds stay random; results history kept in the browser. *Done 2026-10-05: Daily #1 verified identical across connections; share text, stats and history unit-tested.* |
| S2 ✅ | **End-of-round replay** | After a round, an animated map replays the bot's hidden route and your route side by side, like the show's map graphics; makes the daily share worth clicking. *Done 2026-10-05: one 10:00 → end timeline in ~25 s, trains rewind with it, question markers appear when asked, play/pause/scrub. Visual polish → design agent.* |
| S3 | **You hide, a bot seeks** | The hider half of the game solo: the 20-min hiding phase, watching the seeker close in, the freeze rule, the map-pin endgame. The bot seeker plans journeys toward the remaining stations and asks questions with the M2 simulation's strategy |
| S4 | **Bot vs bot balance sim** | The S3 seeker vs a bot hider at full speed, with real travel time: distributions of station-finding time, endgame share and hider score, to tune the hide time, cooldown and prices without playtests |
| S5 | **Smarter bot hider** | Difficulty levels: Hard picks stations the questions struggle to tell apart |

### M2 results: how many questions find the station (`pnpm sim`)

Hider leaves Times Sq at 10:00 with 20 min → **97 possible stations** (log₂ = 6.6 perfect yes/no questions). A greedy seeker always asks the question that best splits what's left:

| Seeker | To narrow to ≤ 3 | To pin the station | Solvable by questions alone |
|---|---|---|---|
| Static (asks everything from Times Sq) | mean 5.8 (max 8) | mean 7.0 (max 9) | 49 / 97 |
| Moving (free travel toward the candidates) | mean 5.4 (max 7) | mean 6.8 (max 9) | 91 / 97 |

Stations left after 1–8 questions (moving): 49 → 25 → 14 → 7 → 3.7 → 2.0 → 1.3 → 1.1.

**Pricing decision: keep +10 min per question and the 5-min cooldown.** Pinning the station by questions alone costs the seeker ~70 min of hider bonus and ≥ 30 game-min of cooldown, so questions pay early, but with 2–3 stations left it's cheaper to go and look. That crossover is the decision we want players making. Revisit once real playtests log station-finding times.

### Playtest metrics (log from M2 on)

Logged now: one JSONL file per round in `apps/server/logs/` (round start with the hider, every intent and question with candidates remaining, round end with time, questions and score).
- Candidate stations remaining over time
- Questions spent, by type, and their bonus cost
- **Time between meaningful decisions, per player** — the real measure of dead time
- Idle time per player
- **Station-finding time vs spot-finding time**, tracked separately: easy map deduction (seeker-favored) and an obscure Street View spot (hider-favored) don't average into balance
- **Endgame share of seeking time** — target **33–50%**. Rough math: a 400 m zone has ~4–6 km of street, ~50–70 game-min to sweep fully at walking speed, so a search lands around 20–40 game-min before photos help. Levers if it's off:
  - zone radius
  - catch distance
  - when spot photos open and what they cost
  - map question prices (a faster station-find makes the endgame a bigger share)

## Cards (minimal set in M3, full deck in M6)

**An original deck — not the show's.** The Hide + Seek card text and art are Jet Lag's copyrighted product. The **mechanics** (draw-on-answer, hand limit, card types) are fair to reuse.

Draws when answering:

| Question | Draw | Keep |
|---|---|---|
| Radar | 2 | 1 |
| Thermometer | 2 | 1 |
| Matching | 3 | 1 |
| Measuring | 3 | 1 |
| Photo | 1 | 1 |

Hand limit: 6.

- **Time bonuses** *(M3)*: +5 / +10 / +15 min to the hider's score, if still held when caught.
- **Powerups:**
  - **Veto** *(M3)*: refuse a question; the seeker has still spent it
  - **Randomize:** swap the question for another of the same type
  - **Discard 2, draw 3**
  - **Move:** unfreeze and choose a new spot in your zone while the seeker is frozen 5 min
- **Curses** (played on the seeker; paid for by discarding cards). All are server-enforced, which is where online beats the show:
  - **Fog:** seeker's Street View blurred for 10 game-min
  - **Signal loss:** seeker's map hidden, leaving only departure boards
  - **Local only:** no express trains for 20 min
  - **Signal problems:** seeker's train held 5 min at the next station
  - **Wrong way:** seeker's next train must go in the opposite direction
  - **Tourist:** seeker must get off at the next stop and walk 200 m before going back in
  - **Black & white:** seeker's Street View turns greyscale

### Card faces (proposed)

Every card is a small plaque in the Mosaic look (see Look and motion). Art and layout: [Stand Clear Deck](https://claude.ai/artifact/FtuLTd6LC7PfkBjNewoY8W) (private artifact).

- **Anatomy, the same on every card:** a tile frame naming the kind, a kind caption, the value or cost in the corner, a 28 × 28 mosaic emblem, a typeset title, the exact rule, a line in the conductor's voice, and when it can be played.
- **The kind is told by pattern as well as color**, so it survives color blindness and the 52 px hand size:
  - time bonus: gold checker
  - powerup: cobalt double rule
  - curse: terra cotta teeth
- **Three sizes:**
  - full, 264 × 372: drawing, inspecting, and a curse landing on the seeker
  - hand, 52 × 73: six fit across the 380 px panel
  - chip: an active curse on the seeker's screen, with a tile timer
- **Emblems are real things from the subway and the street above,** drawn with squares, 45° triangles and circles. Other angles break up on the tile grid. No logos, no copies of historic plaques, nothing from the show.

| Card | Emblem | Rule on the card | Conductor's line | Proposed cost |
|---|---|---|---|---|
| Running late (+5) | platform clock at 10:05 | Adds 5 min to your score if you're still holding it when you're caught. | "Next train in 5 minutes." | — |
| Delays (+10) | the clock at 10:10 | Adds 10 min, same terms. | "We are delayed because of train traffic ahead." | — |
| Planned work (+15) | the clock at 10:15 | Adds 15 min, same terms. | "Trains are running with delays because of planned work." | — |
| Veto | brass folding gate | Refuse a question. The seeker has still spent it. | "This entrance is closed." | — |
| Randomize | the old Y-cut subway token | Swap the seeker's question for a random one of the same type. | "Good for one fare." | — |
| Discard 2, draw 3 | three cards | Discard two cards, then draw three. | "Transfer is available." | — |
| Move | station stair, arrow up | Unfreeze and choose a new spot in your zone. The seeker is frozen for 5 min while you move. Playable once frozen or locked in. | "Step lively." | — |
| Fog | street steam stack | The seeker's Street View is blurred for 10 min. | "Visibility is limited in the area." | discard 1 |
| Signal loss | a subway map torn in two | The seeker's map is hidden for 10 min. Departure boards still work. | "Please listen for announcements." | discard 2 |
| Local only | a pigeon | The seeker can't board express trains for 20 min. | "This train is now running local." | discard 1 |
| Signal problems | a track signal at red | Holds the seeker's train for 5 min at its next stop, or the next train they board. | "We are being held momentarily by the train dispatcher." | discard 1 |
| Wrong way | a U-turn | The seeker's next train must run the opposite way to their last one. | "Change here for trains in the other direction." | discard 2 |
| Tourist | the Statue of Liberty | At the next stop, the seeker gets off and walks 200 m before going back in. | "Excuse me, which way is uptown?" | discard 2 |
| Black & white | a morning tabloid | The seeker's Street View turns black and white for 10 min. | "Read all about it." | discard 1 |

- **Curse costs (proposed):** about one card per 5 game-min the curse is expected to cost the seeker, minimum one. Signal problems is a certain 5 min, so it costs 1. Tourist (exit, 200 m, entry, a wait) and Wrong way (a stop out, a stop back, two waits) cost about 8–12 min, so they cost 2. Signal loss takes the shaded map, which is where the deduction lives, so it costs 2. Set the real prices with the S4 bot-vs-bot simulation, like question prices.
- **Open questions (cards):**
  - [ ] Signal loss and Black & white had no duration. The cards propose 10 min, to match Fog.
  - [ ] Randomize on a thermometer has nothing of the same type to swap to. Either block it, or roll any type.
  - [ ] Move is limited to "once frozen or locked in". Played any earlier, it would be a free 5-min freeze on the seeker.
  - [ ] Deck composition: how many of each card. Set with the curse prices in S4.

## Look and motion

### Look: Mosaic

The look comes from the subway's own tile, in two layers that never swap jobs:

- **IRT tile (Heins & LaFarge, 1904) carries identity:** name tablets, faience plaques, borders. It's used for where you are, photos, cards and the brand. It never carries game data.
- **IND tile (Squire Vickers, 1932) carries information:** the color bands that changed at every express stop, and white-on-black captions. It's used for questions, importance and time.
- Rules that follow:
  - **Five IND color families = the five question types:** Radar blue, Thermometer red, Matching green, Measuring yellow, Photo purple. A family color never decorates.
  - **Band width = importance**, after the IND's wider express bands. A 3-tile "express" band marks the one thing that matters now. Everything else gets a 2-tile "local" band or a plain rule.
  - **Circles are trains, squares are game information.** Route bullets and train dots stay MTA circles. Candidate stations and question chips are square tiles, so a green Matching chip can't be mistaken for the 4.
  - **Type:** Josefin Sans for tablets, captions and buttons. Libre Franklin for anything read. Tabular figures for every time.
- **Base map: a quiet tile ground,** so the game's own lines and squares are the only strong marks.
  - **What it shows:** glazed-white land, slightly darker blocks at street zoom, the lightest tile for roads with grout-colored edges, and a faint buff on highways. Water is muted grey-green and parks are faint sage, so neither can be mistaken for Radar blue or Matching green. Street, neighborhood and city names stay, in the Mosaic ink tones, because the endgame needs street names.
  - **What it hides:** points of interest and their labels, Google's transit lines and stations, rail tracks, every icon, and administrative boundaries. POI pins are circles, which the language reserves for trains, so park names go too. Parks stay as shapes.
  - **Google setup, in `stand-clear-nyc`:**
    - **Vector Map ID `d52ea7715ab571c4cf3a43db`** ("Stand Clear Mosaic (vector)"). This is the one to use: it draws the whole design.
    - Raster Map ID `d52ea7715ab571c4d1dc8ae7` ("Stand Clear Mosaic"). On raster maps Google applies only part of a cloud style, so land, urban areas and commercial strips keep Google's greys and creams. It's kept only for comparison.
    - Both use the cloud style "Stand Clear Mosaic", style ID `a45edf63b9a210393eb6e2eb`, on their roadmap variant.
    - **Before switching the game to the vector ID:** check Safari. The game's deck.gl overlay is non-interleaved, and only the interleaved mode failed on Safari, but that's unverified on a vector map.
    - **Still showing:** one-way arrows and a few bike lanes at street zoom. No style rule has removed them yet.
  - **Sources:**
    - `apps/web/src/map/mosaicCloudStyle.json` is the cloud-styling JSON the Map ID uses.
    - `mosaicStyle.json` is the same design as a legacy style array, for a map created without a Map ID. A Map ID ignores the `styles` option.
    - Change both files together.
    - Push the cloud style with the Map Management API: PATCH `styleConfigs/a45edf63b9a210393eb6e2eb`. It takes OAuth, an `X-Goog-User-Project: stand-clear-nyc` header, and the project number `75066973119` in resource paths.
- Rationale, palette and mocks: [Stand Clear Mosaic](https://claude.ai/artifact/HfQMaNv8REXrPY9qNFjakC). The four directions it was chosen from: [design directions](https://claude.ai/artifact/RezdNAD5GWRVJW2C18f817). Both are private artifacts.

### Sidebar

The panel reads top to bottom like a platform wall: who and when, the round, where you are, what you can do, then the main action. Mocks of every state: [Stand Clear Deck](https://claude.ai/artifact/FtuLTd6LC7PfkBjNewoY8W), part four (private artifact).

- **Top bar:** "Stand Clear" as a small Josefin label, the round on one line ("Daily #1 · Mon, Oct 5"), and the clock as a black caption tile with "6× real time" under it.
- **The round:** stations possible, time left and hider bonus, as three numbers on a 2 px ink rule with grout dividers. Tabular figures. "Give up" is a quiet underlined link.
- **Tabs:** square tiles, with the active one in ink. "Following you" is a light caption, because it's a state, not an action.
- **Where you are:** the station's mosaic name tablet, with its bullets, on a tile field.
  - On a train: the route bullet, headsign and "next: Canal St in 2 min".
  - On the street: the exit ("Exit 4 · E 14 St & Union Sq E").
- **Boards and lists:**
  - Direction headings are black captions ("↑ Uptown & Queens").
  - Rows are a bullet, headsign and time, with a small ink button.
  - A row you can't use is dimmed, with the reason in words ("too soon to change platforms").
  - The stop you're getting off at is the one express band in the list.
- **Ask:**
  - Each question family is headed by a local band in its color.
  - Radar distances are square tiles, and route choices stay MTA circles.
  - The cooldown is a tile timer, and every control waits it out together.
  - The log shows each question's family square, its time and origin, and how many stations were left.
- **Wainscot:** the one main action for the state, on buff brick. Up to the street, Get off at the next stop, or Back down.
- **Result:** a gold "Found" tablet (or "Time's up"), the hider's station as its own tablet, the three numbers, and the score tally bar. Then Watch replay in ink, with Share and Practice round in white.
- **Rules:** ink for the default action, white for the alternative, terra cotta only for actions that can't be undone. No rounded corners, no shadows. Notices are a light row with a terra cotta square, dismissed by clicking.

### Street endgame

Street View takes the top three fifths of the main column and the map the bottom two fifths, with a buff trim band between them, as the game now lays it out. Mock on a real panorama: the Deck page, part five.

- **Walk tiles:** one square tile per street you can take, with an arrow and its compass point ("↑ N"), bottom center. They sit above Google's attribution and never cover it.
- **Walking:** a local band fills along the bottom of Street View at walking speed (linear, rule 1), captioned "Walking north · 14 s". The walk tiles dim until you arrive.
- **Facing:** a black caption in the top-left corner ("Facing N"). It's the only text on the photo, because addresses and road labels stay off.
- **Someone's here:**
  - The catch prompt is the screen's one express band, in ink with gold trim, at the top center: "Someone's here · Click them to catch".
  - The hider's marker is a gold square tile with a deep-gold border. It replaces Google's red pin, because squares are game information.
- **Curses:** Fog and Black & white are CSS filters on the panorama (motion spec: Curse lands). Their chip and tile timer sit in the panel, never over the photo.
- **Map strip:** the Mosaic base map at street zoom, with your dot. Hovering shows a square target and "Walk here · 40 s", so a click is never a surprise.
- **Panel:** where you are is the exit. Back down is the white wainscot action, because staying up is usually the point.

### Motion

**Motion is presentation, never state.** The engine's state applies the moment it arrives. Animation only catches the screen up, can always be skipped to its end, and a refresh shows the end state, never a replay. This matches "events, not ticks": the client animates events the server has already settled.

**Rules**

1. **Timetable truth.** Anything that stands for transit time moves linearly at the clock's rate: trains, your dot, walking, the clock, the replay. It is never eased or sped up for drama. Players read position as time, and easing would put a train somewhere the timetable says it isn't.
2. **Nothing animates on hidden information.** The seeker's screen moves only on seeker-visible events. The hider freezing, drawing cards or holding a Veto changes nothing on the seeker's screen, not even timing. This is the same principle as fixed-time spot photos.
3. **A question draws its boundary, then the boundary clears the stations.** Ruled-out stations don't vanish at once. They clear in an order that shows the question's geometry, so watching an answer teaches what the question does (see Elimination below).
4. **Width is importance, and it animates.** The thing that matters now arrives as an express band. When it stops mattering, it collapses into a local row in the log.
5. **Tiles set and lift.** New information is set like tiles: staggered and decelerating. Information that leaves lifts off. Only transit moves things in from off-screen (tablets arriving and departing).
6. **Nothing bounces or overshoots.** Tile and trains don't. Every curve is linear, decelerating or accelerating.
7. **One choreography at a time per screen.** A second event queues behind the first, and the longest sequence is under 2 s. The clock, trains and dots never wait, because they are the timetable.
8. **Ambient motion is data.** During waits, what moves is the city: other trains, the clock, countdowns. There's no decorative idle animation, because waiting is when a player is watching hardest.

**Timing tokens**

| Token | Duration | Curve | Used for |
|---|---|---|---|
| timetable | real | linear | trains, dots, walking, clock, replay |
| press | 100 ms | none | buttons sink 2 px |
| step | 160 ms (about 1 game-second) | decelerate | digit flips, chip states, hovers |
| band | 280 ms | decelerate | bands entering or collapsing, panels |
| set | 160 ms per tile, stagger spread ≤ 900 ms | decelerate | answers, eliminations, timers, tablets |
| brake | 900 ms | ease-out quad (constant deceleration) | a name tablet arriving |
| depart | 600 ms | ease-in quad (constant acceleration) | a name tablet leaving |

Decelerate is `cubic-bezier(0.2, 0.7, 0.2, 1)`. Ease-out quad is `cubic-bezier(0.25, 0.46, 0.45, 0.94)`. Ease-in quad is `cubic-bezier(0.55, 0.085, 0.68, 0.53)`. No control point goes above 1, which is what keeps rule 6.

**Catalog**

| Moment | Who sees it | Motion | Reduced motion |
|---|---|---|---|
| **Arrive at a station** | the rider | The name tablet brakes in from the right (brake), as if the platform wall slid into the window. The brake starts 900 ms before the scheduled arrival, so the tablet stops as the train does. The map dot keeps constant speed and stops dead (rule 1). | 160 ms crossfade |
| **Depart** | the rider | At the scheduled departure the tablet accelerates out to the left (depart), and the train dot leaves at constant speed. No "Stand clear" caption. Optional two-note chime. | tablet crossfades |
| **Up to the street / back down** | the walker | Exiting takes 2 game-min (20 s real). The progress is drawn as stair treads that fill one per 10 game-s. On arrival the Street View pane, which shares the screen with the map under decision B, brightens from the top down over 900 ms (decelerate), like daylight at the top of the stairs. Going back down reverses it. | progress bar; view cuts |
| **Ask → answer** | seeker; the hider watches it live | The question unrolls as an express band in its family color (band), from its top edge rather than sliding in (rule 5). The answer word sets (set). The boundary draws and stations clear (Elimination). The candidate count counts down one per cleared station. The band collapses into its log row's family chip (band). Under 2 s in total. | answer and count appear together |
| **Elimination** | both | **Radar:** the ring grows from where you asked to its radius (400 ms). Then the ruled-out side clears starting at the ring: inward for No, outward for Yes. **Thermometer:** the line halfway between your last reading and this one draws out from its midpoint (300 ms). The colder side clears away from the line. **Route, borough, express, more routes:** no geometry, so stations clear outward from where you asked. Each station's square lifts from ink to outline (160 ms). The stagger is by distance, spread 600–900 ms by count. Boundaries stay on the map, faint. | all clear at once; boundary drawn |
| **Clock and cooldown** | seeker | The clock's minutes flip (step) once per game minute, every 10 s real. The 5-min cooldown shows as 5 tiles, one per game minute, lifting right to left. At zero the question chips step to ready. | digits change; tiles vanish |
| **Timers** (photo answer, veto window) | hider | A row of tiles, one per unit shown in its label, lifting as time runs out. The last tile turns terra cotta. | tiles vanish |
| **Seeker is in your zone** | hider only | A terra cotta express band unrolls down from the panel's top edge (band). It doesn't enter from off-screen (rule 5), and nothing bounces. The zone ring turns from dashed to solid. The seeker's screen does nothing (rule 2). | band appears |
| **Frozen / locked in** | hider only | "Set in grout": four grout bars close around your dot (300 ms). The Hide-here button presses in and becomes a caption: "Frozen at E 13 St & 3 Av". | frame appears |
| **Card draw** | hider only | After an answer, N face-down cards rise 24 px into place (band, staggered 120 ms). They flip about their centers (rotateY 350 ms, decelerate, faces swap at 90°). The card you pick lifts 8 px. The rest drop (band), and the kept card shrinks into its hand slot (400 ms). Photo (draw 1, keep 1) skips the choice. | cards appear face up |
| **Curse lands** | seeker; the hider sees it played | The card rises 24 px into place at center (band), holds 1.6 s, then shrinks into a status chip with a tile timer (400 ms). Then the effect: **Signal loss:** glazed tiles set across the map in a diagonal sweep (900 ms), leaving the departure boards, and lift in reverse when it ends. **Fog:** Street View blur ramps in over 600 ms. **Black & white:** it desaturates over 800 ms. Both decelerate, and ramp back out the same way when the curse ends. Glazed tiles sit on a grout bed, so nothing of the map shows between them. **Local only, Wrong way:** the affected departure rows dim and strike through. **Signal problems:** the held train's dot simply stops at the platform with a "Held" caption. By rule 1 it stops; it doesn't slow down. | effect applies at once |
| **Walk a street step** | the walker | The band at the foot of Street View fills tile by tile at walking speed (timetable, linear). The walk tiles dim, then step back to ready on arrival (step). | progress bar fills; no tiles |
| **Someone's here** | the seeker | The catch prompt unrolls from the top of Street View as an express band (band). The hider's gold marker sets (set). | prompt and marker appear |
| **Found** | both | The hider's spot sets gold. A "Found 11:52" tablet sets tile by tile, left to right (set, 900 ms). | tablet appears |
| **Score tally** | both | The score is drawn as a bar of tiles, one tile per 5 game-min. Ink for elapsed time, the question's family color for each question bonus (+10 min = 2 tiles), gold for time-bonus cards held. Tiles set left to right at 40 ms each while the total counts up. Both rounds' bars stack, and the winner's gets an express trim. The bar shows where the score came from, not just the number. | bars appear full |
| **Replay (S2)** | both | Game time is compressed uniformly. That is linear, never eased, per rule 1. Dots travel their real routes and leave trails of square tesserae: terra cotta for the hider, ink for the seeker. Each question pops as a family-colored square at its origin with its answer. At the end, the hider's station tablet sets and the zone ring draws. | trails drawn in full; scrubber only |

**Demo:** every row above plays in the [Stand Clear Deck](https://claude.ai/artifact/FtuLTd6LC7PfkBjNewoY8W) page, part two (private artifact). Each row has a timeline labeled with its tokens, slow-motion playback, and its reduced-motion version. Building it produced the refinements now written into the rows for Arrive, Up to the street, Ask, Seeker is in your zone, Card draw and Curse lands.

**Implementation notes**

- **Eliminations on the map** fit the deck.gl scene as it stands. The round data stores each cleared station's clear time (answer time + its stagger delay). Color and size accessors read progress from the clock, and an `updateTriggers` frame counter runs only while a clearance is in flight (up to 2 s), so accessors don't re-run every frame forever.
- **Growing boundaries:** rebuild the radar ring at the animated radius each frame for its 400 ms (65 points). The thermometer line is the perpendicular bisector of the two readings, clipped to the view.
- **Square station marks:** deck.gl's `ScatterplotLayer` only draws circles. Draw squares as a polygon layer of per-station squares in meters, which keeps today's meter-based sizes, or as an `IconLayer` if they should hold a fixed pixel size.
- **Name tablets** are rendered once per complex to an image and cached. There are 424 complexes.
- **Reduced motion:** `prefers-reduced-motion` switches each moment to the fallback column. Trains, dots and the clock keep moving, because they are data and slow.
- **Sound** is optional and off by default. It covers only the two-note chime on your own departure and a soft tile "tock" when an answer lands.

**Open questions (motion)**

- [ ] **Veto needs a window, and the window must not leak the hand.** Map answers are instant, but Veto and Randomize need a moment to decide. If the window appears only when the hider holds one of those cards, its presence tells the seeker what's in the hand. **Proposal:** every map question gets the same short answer window, about 1 game-min (10 s real), whether or not the hider can use it. Decide before M3.
- [ ] **Replay pace.** Uniform compression keeps rule 1, but squeezing a 2-hour round into 25 s runs trains at about 290× real-world speed. Check it's readable. If not, use speed steps that are still linear within each step, rather than easing.
- [ ] **Does the seeker see the hider's hand size?** Default: no. It would leak the same way as the veto window.

## Open questions & risks

- [x] **Google Maps base map (decision B) — done 2026-10-05.** The game runs on Google Maps with deck.gl's `GoogleMapsOverlay` (non-interleaved) and a quiet JSON style (no POIs or Google transit icons). MapLibre remains a fallback (`VITE_MAP_PROVIDER=maplibre`, or no key) to save map loads in dev. Billing, a $10/month budget alert and daily quota caps are set on `stand-clear-nyc`. Still to do before anything public: a cloud map style + map ID (design agent), Google attribution/terms links in our own terms, and switching the throwaway Street View spike's MapLibre minimap to Google.
- [ ] **Sign Street View Static URLs.** The browser key's localhost referrer restriction is enforced against a wrong referrer (403), but requests with *no* referrer are served, so the key alone could fetch images. Today the 300/day cap bounds it. Fix: a URL signing secret on `stand-clear-nyc`, the server signs each photo URL, and the unsigned quota drops to 0.
- [ ] **Outside-tab research.** The seeker can open Google Maps elsewhere. That's acceptable as long as the **catch requires being near the hider in-game**: outside research only helps deduction, and the show's seekers do exactly that on their phones.
- [ ] **Station-photo framing.** The hider picks any exit and aims; they can choose the least recognisable view. Accepted for v1; playtest whether it needs a rule.
- [ ] **Balance knobs:** hiding time, zone radius, question costs, cooldown, catch distance, clock speed. Set the first prices from the M2 simulation.
- [ ] **Naming / IP:** don't use "Jet Lag" or MTA logos. Attribute OSM and MTA data.
- [ ] **Can seekers split up?** Only matters for 1v2+. Strong in the endgame — maybe require them to ask questions together.
- [ ] **Playtesters** — Charlie is sorting this out.

## Parking lot

- **Overtime round** for ties: e.g. one more round each with a 10-min hide and a 30-min seeking limit.
- **Accessibility:** deferred. Later candidates:
  - keyboard controls
  - reduced-motion option
  - text route labels alongside bullets
  - the map-only endgame (M3) as the accessible mode
- **Europe "Tag" mode on real intercity trains.** The original idea, parked here. Research notes:
  - Data: Transitous (pan-EU, realtime; public API is open-source/non-commercial only) or a self-hosted MOTIS 2 (MIT).
  - Realtime gaps: Italy, Austria, Hungary, Luxembourg.
  - Fares: not open anywhere — use synthetic per-minute pricing.
  - Design lessons from Tag Eur It:
    - constant tracking is too strong online, so use timed reveals or questions
    - price by a leg's actual speed, not train category
    - balance goals by travel time
    - freeze exactly at the overnight cutoff
    - make powerups free once per run
- **Live "slow game"** over real days on live trains (Subterfuge-style queued moves + push notifications).
- **Replay a recorded real day** including its actual delays (record MTA GTFS-RT).
- **Buses** as a card or later mode.
- **Route-letter reveals** during the hide (Scotland Yard rule), if the seeker's wait feels dead.

## Prior art & references

**Closest existing products**
- [Worldboard](https://worldboard.games/) — browser games on real timetables, the closest existing product:
  - **Tag:** same-train / same-station tags, roles swap on every tag, clock up to 80×
  - **Hide & Seek:** vs an AI hider
  - **GeoRace:** async tournaments on frozen timetables
  - Play it before building.
- [Play Jet Lag](https://www.playjetlag.com/) (iOS beta) and [hideandseek.game](https://hideandseek.game/) — companion apps for playing in real life.

**Fan map tools** (question → map elimination logic worth reading)
- [taibeled's map generator](https://taibeled.github.io/JetLagHideAndSeek/)
- [gelbh/jetlag](https://github.com/gelbh/jetlag)
- [JLTG PWA](https://github.com/pachisiav11/JLTG-Hide-and-Seek)
- [awesome-jetlag-hide-and-seek](https://github.com/jltg-community/awesome-jetlag-hide-and-seek)

**Hide + Seek rules**
- [Jet Lag fandom wiki: Hide + Seek](https://jetlag.fandom.com/wiki/Hide_%2B_Seek)
- [Home game rules transcription](https://jetlag.denull.ru/en/rules/) (fan site)
- Home game sizes:

  | Size | Hiding time | Zone radius |
  |---|---|---|
  | Small | 30 min | ¼ mi |
  | Medium | 60 min | ¼ mi |
  | Large | 180 min | ½ mi |

- Zone centered on a station.
- Endgame starts when seekers are in the zone and off transit; caught when spotted within 5 ft.

**Related games**
- [HuntingMrX](https://github.com/Ming-Bao/HuntingMrX) — Scotland Yard over Wellington's transit graph
- [Subterfuge design notes](https://www.gamedeveloper.com/design/quality-of-life-in-subterfuge) — async pacing lessons (queued orders, no twitch actions, push notifications)

**Transit data**
- MTA developer data — static GTFS + GTFS-RT, station list, entrance data. Links and key requirements to verify.
- [Transitous API](https://transitous.org/api/)
- [MOTIS](https://github.com/motis-project/motis)

## Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-10-05 | No "Stand clear of the closing doors" caption on departure; the tablet simply accelerates away | Charlie, reviewing the motion demo |
| 2026-10-05 | Base map: the "Stand Clear Mosaic" cloud style on vector Map ID `d52ea7715ab571c4cf3a43db`. It's managed through the Map Management API, with the style JSON kept in the repo | Charlie asked for a proper cloud style and Map ID. A raster Map ID was tried first, but Google applies only part of a cloud style on raster maps (verified by render) |
| 2026-10-05 | Visual direction: **Mosaic**, built on the subway's own tile (IRT tile for identity, IND tile for information). Motion rules and card faces are written up under Cards and Look and motion as proposals | Charlie picked it from four directions (Wayfinding, Service Change, Night Service, Mosaic) and asked for it to be grounded in real subway design history |
| 2026-10-05 | **B: the whole game moves to Google Maps JS.** Step 1: all game drawing is deck.gl layers over a swappable base map; step 2 (swap the base map) after billing is enabled | Google's terms forbid Street View beside a non-Google map; Mapillary's NYC coverage is too thin. Cost: one Dynamic Maps load per session, 10k free/month |
| 2026-10-05 | Photos (solo): directional prompts (N/E/S/W/up) from one exit of the hider's station or from the hiding spot; Street View Static images loaded by the browser | A bot can't judge "tallest building"; directions are fair and still very readable. Static images straight from Google are within the terms; server relay isn't |
| 2026-10-05 | M4 solo: finding the station starts the endgame but isn't revealed to the seeker; the server records it for metrics (station-finding vs spot-finding time) | Design: the seeker gets no zone confirmation |
| 2026-10-05 | M4 solo: the hiding spot is picked server-side from Street View metadata (free, no quota) with a separate server key; Google's own click-to-move is off and stray panorama moves snap back | Keep the spot secret and every step timed by the server |
| 2026-10-05 | Google base map: deck.gl draws on its own canvas (not interleaved), raster map + JSON styles | Interleaved rendering into Google's vector map drew nothing on WebKit/Safari; JSON styles hide POIs and Google's transit icons without needing a cloud style |
| 2026-10-05 | Station labels skip deck.gl's collision filtering; they're shown for in-play stations from z13.5 and for all stations from z15 | Step 1: the collision shader fails on WebKit/Safari, so no labels rendered at all |
| 2026-10-05 | The bot hider takes the fastest route to its station (connection scan with journey extraction), so the replay shows a real trip | S2: before, the bot just appeared at its station |
| 2026-10-05 | "Give up" ends a round at once and reveals the station + replay; on a daily it counts as not found | S2: lets practice players see the answer, and makes the replay testable without riding to the end |
| 2026-10-05 | The daily follows New York time; #1 = 2026-10-05; its seed mixes in a server secret (`DAILY_SECRET`) | S1: the engine ships to the browser, so a date-only seed would let anyone compute the answer |
| 2026-10-05 | Daily share shows question *types* (📡🌡️🚇🗽⚡➕), not answers; the first finish of the day counts, replays are allowed but don't | S1: Wordle-style — no spoilers, no retrying for a better score |
| 2026-10-05 | Street View can't share a screen with the MapLibre map, and photos can't be server-relayed Google images | Street View spike: Google ToS 3.2.3(e) and 3.2.3(a) + geo guidelines; provider decision pending a Mapillary check |
| 2026-10-05 | Keep +10 min per question and the 5-min cooldown | M2 simulation: ~5.5 questions narrow 97 stations to ≤ 3, ~7 pin it; past that, visiting is cheaper than asking |
| 2026-10-05 | The hider must leave the start complex | M2: otherwise "stay put" is a free hide; the seeker's first look rules it out anyway |
| 2026-10-05 | Solo rounds start at 10:20 (the bot already hid) | M2: no human hider, so the 20-min hiding phase would be pure waiting |
| 2026-10-05 | Thermometer: start it anywhere for free; each reading restarts it from where you read it | M2: makes chained readings possible without a wasted question |
| 2026-10-05 | Radar distances: ¼, ½, 1, 2, 5 miles | M2: covers walking-zone scale up to borough scale |
| 2026-10-05 | Changing platforms within a station takes at least 90 s | M1: MTA lists 0 s at 57 big stations (Times Sq, Grand Central), which allowed instant direction reversals |
| 2026-10-05 | Transit state is lazy: a ride is (trip, board stop, alight stop), resolved against the clock | M1: no timers; server and clients derive the same position from the shared clock + public timetable |
| 2026-10-05 | Your dot is a DOM marker moved every frame; other trains are a map layer refreshed 10×/s | M1: re-tiling map data every frame flooded MapLibre's worker |
| 2026-10-05 | Express stop = ≥ 6 express trains calling 10:00–13:00, computed from the timetable | M0: the single-train rule flagged one-off reroutes and rush-hour tails |
| 2026-10-05 | Exits live on complexes, not stations | M0: MTA files entrances under one constituent station |
| 2026-10-05 | Client is Vite + React, not Next.js | The game screen is all client-side; SSR adds friction (MapLibre, `window`) for no benefit |
| 2026-10-05 | Endgame targets a third to half of the seeking time | Charlie: the street search is the fun part |
| 2026-10-05 | Hider sees the seeker's location for the whole game | Charlie |
| 2026-10-05 | Spot-photo lock confirmed by a hider-side popup (Lock & answer / Move first) | Charlie |
| 2026-10-05 | Spot photos open at a fixed time (15 min into Phase 2); answering one while unlocked locks the hider | Astra: tying spot photos to the freeze leaked "seeker is in your zone" |
| 2026-10-05 | Still on a train at the hide deadline → station = last stop called at | Astra: the old "next stop" rule let a long express stretch the hide |
| 2026-10-05 | Score = elapsed time (2 h limit) + bonuses counted separately | Astra: bonuses inside the cap made late questions free |
| 2026-10-05 | Photos +15 min; prompts never require station-name signage; 10-min answer timer | Astra: name-bearing photos were a cheap shortcut |
| 2026-10-05 | Catch along the panorama graph; spots must be reachable from the exits; curated 15–30 zones first; map fallback | Astra: straight-line catches cross walls; some spots were unreachable |
| 2026-10-05 | Skip-ahead off in v1 | Astra: it squeezed a hider still framing photos or walking |
| 2026-10-05 | Platform-level boarding, timed transfers/exits, pinned service date, MTA exits, borough source | Astra: data semantics were underspecified |
| 2026-10-05 | Ordered idempotent intents; refresh restores the snapshot; same hub + time both rounds | Astra quick wins |
| 2026-10-05 | M2 simulates question partitions before pricing; playtest metrics logged from M2 | Astra: price from data, measure decisions per player |
| 2026-10-05 | Keep minimal cards in M3 (Astra: defer cards) | M2 proves the deduction loop first, which covers Astra's concern; cards give the hider a decision per question |
| 2026-10-05 | Build order: questions vs a bot (M2) before two-player (M3); Street View endgame last (M4) | Fable + Astra: the deduction loop is the core; Street View is the riskiest piece; a solo dev needs a bot to playtest |
| 2026-10-05 | Photos are server-rendered images with no location data | Fable + Astra: a panorama ID in the client leaks the station/spot |
| 2026-10-05 | Street moves snap to the real panorama graph | Fable + Astra: stops unreachable spots and walking through walls |
| 2026-10-05 | Hider watches the seeker from Phase 2 | Fable + Astra: otherwise ~20 real min of hider dead time |
| 2026-10-05 | Hide is always the full 20 min; questions from the last station; 5-min cooldown; +10 per map question | Fable + Astra: the seeker was favored |
| 2026-10-05 | Endgame movement is map-driven, Street View for looking | Fable: step-clicking at 6× is a slideshow and drives panorama cost |
| 2026-10-05 | "Line" = route letter or number | Charlie |
| 2026-10-05 | Ties stand in v1; overtime round later | Charlie |
| 2026-10-05 | Station photos from any exit the hider picks | Charlie |
| 2026-10-05 | Accessibility deferred | Charlie |
