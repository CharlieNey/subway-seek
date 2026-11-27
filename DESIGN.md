# Subway Seek — NYC Subway Hide & Seek

*Working title. Design + build plan, as of 2026-10-06. Revised after the Fable and Astra reviews — see the decision log at the end. Rules the game already enforces are documented in `docs/` (question prices, endgame, the bot's cards); this file is the design and the plan.*

## Pitch

Online, 1v1 hide and seek played on the **real NYC subway timetable** and **Google Street View**, inspired by Jet Lag: The Game's Hide + Seek. The hider rides the subway to a station and hides somewhere within a quarter mile of it. The seeker rides the subway asking questions to work out which station it is, then gets off and searches on foot.

Two layers of deduction make it work online:

- **Map questions find the station.** They're answered automatically by the server, so they're instant and can't be lied about.
- **Photos and Street View find the spot.** This is the human, GeoGuessr-like part, and it gives the show's endgame search an online equivalent.

**Where it stands apart.** "Online Jet Lag Hide & Seek" already exists: Worldboard sells it on real timetables with a Street View endgame, for Europe, Japan and Taiwan, in 1–3 hour games (no US coverage as of 2026-10-06; see Prior art). Subway Seek's room is one city known deeply, a match that fits in 40 minutes, a daily everyone plays and shares, and craft: the Mosaic look, motion that follows the timetable, a bot that plays cards. Those are the things to protect when scope is tight.

## Format

- **v1: 1v1.** One hider, one seeker, then swap. Longest hide wins. **Ties stand in v1**; an overtime round is in the parking lot.
- **Platform:** desktop browser first (map + Street View + board side by side: 380 px for the board plus at least 480 px for the map). Resizing an open round keeps its game mounted and its clock running.
  - **Phones** (2026-11-21, brief W32): below 860 px a round stacks the map over the panel, which folds like a sheet, and ends at the station on the free map. Replays stack too. The computer notice is gone. Phones, under Look and motion.
- Build around **two sides (hider / seekers), each with 1+ players**. Every later format is then a config change:
  - 1 hider vs 2 seekers: the show's format; one seeker rides while the other studies photos
  - 2v2 duos: pairs take turns hiding
  - multiple separate hiders: a party mode, parked for later
- **A bot hider** makes the game single-player for solo playtesting, a practice round, and a tutorial.

## A round (1v1)

**Setup.**
- Both players start at the same hub at 10:00 game time on the pinned service date. There are 13 hubs (Times Sq–42 St, Grand Central, Atlantic Av–Barclays Ctr, 14 St–Union Sq, Jackson Hts–Roosevelt Av, Fulton St, 59 St–Columbus Circle, Jay St–MetroTech, 34 St–Herald Sq, 161 St–Yankee Stadium, Broadway Junction, W 4 St, 125 St); the daily picks one by date.
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
  - A wrong station costs about 4 game-min to go back down and come up again: 2 min in, the walk to the exit, 2 min out.
- Moving on the street is **map-driven** ("walk to this corner", or a direction button in Street View), with Street View for looking around on arrival — not step-by-step clicking. Walks are timed at walking speed with a detour factor, and you can't wander more than 600 m from the station you came up at.
- **Searching:** the map frames the 400 m around the station the seeker came up at, never the hider's real zone, and shades where the hider could still be. Everywhere you walk or stand counts as searched. Two **on-foot questions** about the exact spot (street radar 50 / 100 / 200 m, walking hotter or colder) cost +3 min each on a 5-min cooldown. Rules and tuning: `docs/endgame-balance.md`.
- The **hider** gets an alert, "Seeker is in your zone." The **seeker gets nothing**, and nothing in the seeker's UI changes when the hider freezes, so it can't leak.
- **Seeing and catching:** a walk that passes within **40 m** of the hider stops there and shows their marker. The **catch** is within **25 m**, by clicking the marker while standing still. The target is distance **along the street/panorama graph** (no catching through a wall or across an elevated track); the solo game measures straight-line until the curated zones exist. The marker is only sent to the seeker's client within 40 m.
- **Fallback:** without Street View the round **ends at the station**, on the free map: reaching the hider's station is the find. That covers a build with no key, a server with no key or `STREET_ENDGAME=off` (the launch-day switch), and Google refusing mid-round (an auth failure, the quota spent, the library failing to load). *Built 2026-11-21 (`docs/proposals/1-demo-without-google.md`).* In such a round there's no spot, photos are refused, and Tourist and Fog, which act on the street, can't be played; a You-hide hider stays below at their station, and so does the seeker: there's no Up to the street, since walking needs Google's panoramas (decided 2026-11-27). The map-pin endgame (M3) is not built.

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
  - **Solo today:** any reachable complex is a hiding station. The server picks a spot 60–360 m from the station on an outdoor panorama; if it finds none, the round is "find the station" only. Connectivity to the exits isn't checked yet. Curated zones stay parked until two-player rounds (Charlie, 2026-10-06).

### Map questions are about the station, not the spot
The hider may still be walking during Phase 2, so map questions answer about their **station** (the zone center). This keeps answers stable and makes "which station?" the clear mid-game goal.

- **Origin: the last station the seeker's train called at** (or their street position if on foot, or where a walk set off until it arrives), never a position interpolated along the track. That would turn thermometer into a range-finder fired at every stop.
- **Cooldown:** a 5-game-min gap between any two station questions, plus a cooldown per category (15 min for Matching, Measuring, Radar and Photos; 10 for Thermometer; 40 for Tentacles). On-foot questions have their own 5-min cooldown and skip the gap. Repeats are allowed (e.g. radar again at a different distance), except a vetoed question, which is closed for the round (see Veto closes the question).
- **"Line" = a route letter or number** (A, Q, 7, …), not a trunk line (8th Ave, Broadway).

The question set, in Jet Lag Japan's six categories plus the street. Prices and cooldowns were set with `pnpm sim` (`docs/question-balance.md`). The M2 set was the MTA-only questions in the first four rows, at a flat +10 and one 5-min cooldown; a strong seeker spent over 90% of its questions on radar and route, so the set grew.

| Category | Questions | Hider bonus | Cooldown |
|---|---|---|---|
| Matching | Is your nearest park / museum / library / hospital / zoo / airport the same as mine? · Same borough? · Same kind of stop as mine, express or local? · Does this line stop there? (only lines that stop where you are, like the show's rule) | +10 min | 15 min |
| Measuring | Are you closer to a park / museum / … than me? · More lines than mine? | +10 | 15 |
| Radar | Is your station within ¼, ½, 1, 2 or 5 miles of me? | +10 | 15 |
| Thermometer | Start it anywhere, free. Move at least 400 m to another station, then: am I closer? Each reading restarts it where you read it. | +10 | 10 |
| Tentacles | Of the museums / libraries within 1 mile, or hospitals / big parks within 2 miles of me, which is nearest your station? ("Not within range" if none.) | +20 | 40 |
| Photos | A Street View look from one of their station's exits (any time) or from their spot (from 15 min in), facing N, E, S, W or up. They don't narrow the map. | +15 | 15 |
| On foot | About the spot, asked standing on the street: Is your spot within 50 / 100 / 200 m of me? · Walk 30 m, then: am I closer? From more than 600 m away every answer is "Not near you". | +3 | 5, no gap |

Definitions:
- **"Express stop"** is defined from the pinned service day's data: a train serving the station skips a station elsewhere on its run. Not from route letters — express/local patterns flip by borough, direction and time of day. The question is relative ("like mine?") so it reads as matching.
- **Borough** isn't a standard GTFS field: take it from MTA's station list or from borough boundary polygons.
- **"Routes that stop here"** = routes with at least one trip stopping at the station on the pinned service day, within the play window.
- **Landmarks** (`nyc-landmarks.json`, built by `build-landmarks`): 60 big parks, 83 notable museums (the Rubin, closed in 2024, is left out), 190 library branches, 51 hospitals with an ER, the zoos and the aquarium, JFK and LaGuardia. One pin each, with distances to the pin, as the show measures. OpenStreetMap and NYC Parks, credited in the Ask tab. Rivers and the coastline aren't questions yet.

### Photos
Split by what the photo is *of*:

- **Station photos — any time.**
  - **Solo availability:** the seeker's view reports an exit-photo capability without its panorama ID or coordinates. If no exit panorama was picked, every exit direction is disabled with "No exit photo this round." Spot photos keep their independent availability and 15-minute opening time. Human-hide capability stays constant so it never reveals an exit, movement or lock.
  - Taken from **any exit the hider picks** at their station, so they work while the hider is still walking. (Solo today: the server picks one exit per round, seeded, since a bot can't choose.)
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
- **Answer time:** the same 60-game-second window as every station question (10 s real at 6×), card or no card. On timeout send the requested direction; an unlocked hider locks at their panorama. Lock & answer and Move first never send early or restart the window. Veto may close a photo; Randomize swaps to another legal direction from the same source. Decided 2026-10-08; replaces the older ten-minute human-photo timer.
- **Photos should carry no location data.** The aim: the seeker's client never receives a panorama ID or coordinates, because a station photo would leak the station and a spot photo the spot. Google's terms forbid relaying its imagery through our server (`docs/street-view-spike.md`), so today photos are Street View Static images the browser loads from Google, and the URL carries the panorama ID. They run on trust, like the show. Fine against a bot; a known leak for multiplayer.
- **Honesty runs on trust**, as on the show. The server can't verify "tallest building visible."

### Question cost
- Every question adds minutes to the hider's score (table above): +10 for most, +20 for Tentacles because one answer does the work of two, +15 for photos because they can be much more revealing, +3 on foot because the street search wants quick questions.
- **Cards on top:** the hider draws cards on every answer (Cards, below). The bot hider already plays a 31-card deck in solo rounds (`docs/hider-bot.md`); the two-player version brings the same deck.
- Prices come from the simulations (`pnpm sim`, `pnpm sim:endgame`; see Build plan), not guesses.

### Starting numbers (tune in playtests)

All times and speeds are in **game time**; at 6×, walking 400 m takes ~6 game-min ≈ 1 real minute once the detour factor is applied.

| Setting | Game time | Real time at 6× |
|---|---|---|
| Hiding phase | 20 min | ~3.5 min |
| Zone radius | 400 m (¼ mi) | — |
| Seeking limit | 2 h | ~20 min |
| Station entry / exit | 2 min each, plus the walk to the exit | ~20 s each |
| Platform change inside a station | GTFS transfer time, at least 90 s | ≥ 15 s |
| Gap between station questions | 5 min | ~50 s |
| Answer window (station questions, bot or human) | 1 min | 10 s |
| Category cooldowns | 15 min (Matching, Measuring, Radar, Photos) · 10 (Thermometer) · 40 (Tentacles) · 5 (On foot, no gap) | 2.5 / 1.7 / 6.7 / 0.8 min |
| Spot photos open | 15 min into Phase 2 | ~2.5 min |
| Photo answer time (human hider) | Same 1-min station answer window | 10 s |
| Hider seen from | 40 m; a walk stops there | — |
| Catch distance | 25 m, standing still | — |
| Walking speed | 1.4 m/s, with a 1.3× detour on straight-line walks | — |
| Farthest you can walk from your station | 600 m | — |
| Question bonuses | +10 · +20 Tentacles · +15 photos · +3 on foot | — |

## Time & transit model

### Clock
One **shared, server-authoritative game clock** at **6×** real time:

| Game | Real at 6× |
|---|---|
| Train every 5 min | ~50 s wait |
| 2 min between stops | ~20 s |
| 30 min ride | ~5 min |

**Skip ahead in two-player rounds is off in v1.** Later: it needs both players' consent, and the server processes every event in the skipped span (arrivals, freezes, timeouts). **Solo seeking rounds have it:** fast-forward to your train's departure, to 30 s before each next stop (so you can still get off), to your stop, or to the end of a walk, capped at the seeking limit. Pause is for practice seeking and You hide. You hide fast-forward is hiding-only, capped at 10:20; no seeking skip.

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
- The seeker's client only ever receives: the status line, question answers (each when its answer window ends), photo images (see Photos for today's panorama-ID caveat), the hider's card plays that act on them (Veto, Randomize and curses, each when it lands), and the marker (within 40 m). The hider's hand size and their Discard 2, draw 3 plays stay hidden until the round ends (decided 2026-10-06, built the same day).
- **A frame's arrival says no more than its contents.** The server pushes the seeker's view only when it differs from the last one sent. Reaching the hider's station changes the round but not the view, so it sends nothing. *Fixed 2026-10-06: the 1 s tick had pushed on any change to the round, and that frame's arrival, visible in devtools, said "right station".*
- **Every round reveals the hider when it ends,** found or not, daily or practice (reversed 2026-10-07; the 2026-10-06 fix had kept an unfound daily's station secret until the next day). The reveal is the reward for trying, as Wordle shows the word after a miss. Everyone hunts the same daily hider, so a player can give up, learn the station and replay in a fresh browser; that only fools their own browser's record and an honor-system share line, so it's left to the honor system until there's a server-side record worth protecting, when the server will refuse a second daily per recorded result. The homepage still shows yesterday's hider the next day.
- The hider's client receives the seeker's live position, trains and questions (Phase 2+). If the Move card later makes this exploitable, delay the view.
- **Positions snap to real panoramas.**
  - For each hide-eligible zone, the server holds the panorama graph and validates every street move against adjacency.
  - A hider can't claim a spot inside a building or park that the seeker can never reach, and "walk to" can't go through walls.
  - Whether metadata calls are free is part of the pricing check; curating zones ahead of time keeps the count small.
  - *Solo today (2026-10-06):* the server checks each walk's target with a free Street View metadata lookup: it must be the panorama the walk names, within 5 m of the point it gives. Honest walks always pass, since the client walks to panoramas Google's viewer reports; a point inside a building doesn't. The path between stays straight-line, like the reveal and the catch, until the curated graphs exist. A lookup that fails lets the walk through rather than strand the player.
- **Intents are ordered and idempotent:** each has a sequence number, so a retry can't double-charge a question or repeat a move.

### Disconnects
- **Two-player rounds:** the clock pauses when a player drops. They have a 3-minute grace period to rejoin with their room token, then forfeit.
- A refresh restores the authoritative snapshot; it never resets penalties, cooldowns or movement.
- **Solo today (built 2026-10-06):** the server gives each connection a session token in `hello`; the browser keeps it in `localStorage` and sends it back on reconnect. A reconnect within 3 min resumes the same round, and intents the server never got go again under their old sequence numbers, so nothing pressed is lost and nothing applies twice. After 3 min the server forgets the round: with no one to forfeit to, the next visit starts a fresh one (the daily from 10:20 again; a result already saved still counts). Opening the round in a second tab moves it there. The server pings every 10 s and ends a connection that stops answering, so a shut laptop counts as dropped within 20 s.
- **Rounds survive a server restart** (built 2026-10-07). Each session's round, clock and sequence number are saved to a SQLite file on the server's volume whenever they change, and loaded at boot with whatever is left of the 3-minute grace period, as if the connection had dropped at the restart. A solo clock runs on through the downtime. Players see "Connection lost", then their round again; a restart longer than three minutes ends the rounds. This is also the shape two-player rooms will need: one plain object per round, saved and loaded.
- **Limits** (built 2026-10-07): 30 new rounds per address per hour, 40 street walks per session per minute (each walk is a Street View lookup), 500 live sessions per server. A connection turned away gets a close reason, which the client shows on the server plaque and waits a minute before trying again.
- **A drop doesn't pause a solo round** (decided 2026-10-06; it did until then). The pause is there for two-player fairness. In solo it gave the daily a free pause: close the tab, think, reopen within 3 minutes, repeat. The round is deterministic and the server advances it while you're away, the bot hider playing as usual, so a stop missed during a drop is the player's cost. A practice round the player paused stays paused.

## NYC data notes

Built in M0 (`packages/data`). What the data turned out to be:

- **Source:** MTA's **regular** subway GTFS, not the "supplemented" feed — that one layers in this week's planned work. Plus MTA's *Subway Stations* and *Subway Entrances and Exits* datasets on data.ny.gov for borough, official complex IDs, structure and exits.
- **Pinned date:** Wednesday 2027-03-03 (re-pinned 2026-11-20 from feed `20261028-fall-2026-pick-with-long-term-supplements`, valid 2026-11-01 to 2027-05-15; 2026-12-02, 2026-10-28 and 2026-10-14 before) → the single `Weekday` service (8,349 trips, 236k stop times). Times run past 24:00.
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
 │ Google Maps + deck.gl (lines, stations, trails)        │
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
| Map | Google Maps JS (vector Map ID with the Mosaic cloud style) + deck.gl overlays · MapLibre + OpenFreeMap as a dev fallback | Google's terms require a Google map beside Street View (decision B); one map load per session is within the free tier |
| Geo maths | own great-circle helpers in the engine | Distances, zones, radar/measuring questions; no turf dependency so far |
| Street View | Google Maps JS panorama (client) · Street View Static images for photos (browser-loaded) · metadata API on the server, free, for picking spots | Spike done 2026-10-05: walking inside one panorama is free, loads are billed, relay is forbidden (`docs/street-view-spike.md`) |
| Hosting | *Proposed 2026-11-20 (`docs/DEPLOY-PLAN.md`):* client on Cloudflare Pages (static, free) · server on one Fly.io machine in `ewr` with a volume (`infra/fly`), about $4 a month | Long-lived WebSocket process with a disk, on accounts Charlie owns. The EC2 plan (`infra/aws`, 2026-10-07) ran in an account someone else administers; it stays as an alternative for a personal AWS account |
| Persistence | None in v1: rooms in memory, each match appends its action log to a file | The log feeds playtest metrics and, later, replays |

### Repo layout

```
stand-clear/
  packages/
    data/     M0: MTA GTFS → dataset/nyc-subway.json (pnpm data:build)
    engine/   game rules: clock, transit, questions, cards, bot hider, street search, the solo round; pure, no I/O
  apps/
    server/   WebSocket sessions (kept 3 min after a drop), the bot hider's spot, match logs
    web/      Vite + React client
  docs/       rules the game enforces (questions, endgame, bot cards), research, spike findings
```

### Engineering principles

1. **The engine is a pure function:** (state, intent, time) → (new state, events). No sockets, no timers — so the server, the bot, the M2 question simulation and the tests share one implementation.
2. **Events, not ticks.** The timetable is public, so every client holds it plus the shared clock. The server sends discrete events ("you boarded trip X at 10:14") and the client animates; the hider's own trips only ever reach the hider's client.
3. **One visibility filter.** Every outgoing message passes through `viewFor(player, state)`, so the hidden-information rules live in one tested place.
4. **Street View zones are curated in a browser tool.** Google's panorama links come from the JS API, so an admin page walks a zone and saves its graph; the server validates moves against that.

### Notes
- **Transit:** no routing engine — departure boards are `stop_times` filtered by station + time; reachability (initial shaded map, bot hider, question simulation) is an earliest-arrival search over the in-memory timetable.
- **Google terms, answered by the spike** (`docs/street-view-spike.md`): Street View must sit beside a Google map, so the game moved to Google Maps JS. The server can't relay Street View images, so photos are browser-loaded Static images. Panorama IDs may be stored but go stale, so store our own coordinates and re-look them up. Walking inside one panorama object is free; creating a map or panorama is billed.
- **Later:** OSM extract for NYC (POIs for richer questions), MTA GTFS-RT recordings for a "replay a real day with its delays" mode.

## Build plan

The deduction loop is the core and is pure functions over GTFS; Street View is the least core and most uncertain piece, so it comes last.

| # | Milestone | Done when |
|---|---|---|
| M0 ✅ | **Data prep** | Script turns MTA GTFS for the pinned date into a compact dataset (complexes, exits, trips, stop_times, transfers, shapes, boroughs, express flags); it loads in < 1 s. *Done 2026-10-05: 5.1 MB, loads in 12 ms, 23 tests.* |
| M1 ✅ | **Transit sandbox** | One player, 6× clock: departure boards, board, choose exit stop, timed transfers and exits, moving dot on the map. *Riding the subway at 6× feels good.* *Done 2026-10-05: every running train animates along its real track; 35 tests.* |
| M2 ✅ | **Questions vs a bot hider** | Single-player: a bot hides at a random reachable station; the six MVP questions are answered automatically; the map shades ruled-out stations. **Simulate question partitions over the reachable set** (average questions to find the station) and set prices from it. *Finding the station is fun on its own.* *Done 2026-10-05: `pnpm sim`; 46 tests; a played round found Borough Hall in 32 min with 2 questions.* |
| M3 | **Two-player round** | Add rooms and a second human socket, ordered role intents, same-hub/time role swap and two-player disconnect handling. Reuse S3 played transit, lock/freeze, answer/keep/payment rules, deck, role filters, scores and replay. Human-seeker photos and visual curses still need testing; photo-ID leakage and curated connected zones remain open. M6 cards are not included. |
| M4 ◐ | **Street View endgame** | 15–30 curated hide-eligible zones with connected panorama graphs; "walk to"; catch along the graph; fallback to the map endgame on load failure. *Solo version done 2026-10-05: the bot hides at a real Street View spot (server-side metadata lookup) within 400 m of its station; finding the station starts the endgame (recorded, not revealed); you walk by direction buttons or map clicks at 1.4 m/s; the marker appears within 40 m; catch within 25 m. Verified end to end on Daily #1 (station at 27 min, caught at 35). Simplifications for solo: moves are speed-checked, and since 2026-10-06 each walk's target is checked against Street View, rather than validated against a curated panorama graph; the catch is straight-line. The multiplayer version still needs the curated zones. Later the same day: the search area, on-foot questions, and seeing the hider as you pass within 40 m (`docs/endgame-balance.md`); walks take a 1.3× detour factor and stay within 600 m of the station.* |
| M5 ◐ | **Photos** | Station photos (any exit, any time) and spot photos (fixed open time), server-rendered with no metadata; answer timer. *Solo version done 2026-10-05: "photo from their station exit" (any time) and "from where they're hiding" (from 15 min in), looking N/E/S/W/up — directional prompts a bot can answer fairly. The exit is one seeded pick per round. +15 min each, with a 15-min photo cooldown plus the 5-min gap; photos don't narrow the map. Shown as Google Street View Static images loaded from Google (allowed by the terms; the URL contains the panorama ID, so photos run on trust — fine vs a bot). Multiplayer adds human-framed prompts ("tallest building you can see").* |
| M6 ◐ | **Full card deck** | Draw-on-answer, hand of 6, powerups, digital curses (see below). *Solo version done 2026-10-06: the bot hider draws on every answer, keeps its best cards, plays Veto, Randomize and Discard 2 draw 3 from public information only, and pays for Fog, Signal loss, Wrong way, Tourist and Sidewalk shed; the movement curses are server-enforced. Not yet: Move, Signal problems and Local only. The S4 balance pass set the deck and prices on 2026-10-07. The 2026-10-06 decisions are built: a vetoed question closes for the round, every station question waits out the 1-min answer window, and the seeker's view no longer carries the hider's hand size or their Discard 2, draw 3 plays. `docs/hider-bot.md`.* |
| M7 ◐ | **Polish** | Animated end-of-round replay of both routes; spectator view; room-code matchmaking; more formats (1v2, 2v2). *The UI build to the Deck page and the Interaction rules, nine steps, started 2026-10-06. Step 1 done the same day: sessions that survive a disconnect (Disconnects) and the loading, connecting and error screens. Step 2: the component vocabulary and its sheet (Interaction). Step 3: the seeker's panel in every state, select-see-confirm asking (the map drawing comes in step 4), photos, the result; a daily and a practice round played to the catch. Step 4: the map in squares, every question's shape, the elimination with the count stepping down, the search area on foot, the Following toggle, legends. Step 5: the Street View overlays (facing, walk tiles, the walking band, the catch band and gold marker, Fog, What counts) and the map strip's framing and walk target, checked on the real Google map; the daily and a practice round played to the catch again. Step 6: the motion audit (Motion, Implementation notes): card landings, the Signal loss sweep, the search circle and veil, the Found tablet and tally, the photo reveal, and the crossfade on load. Step 7: the replay restyled to part eight (Replay): the bar and its phase scrubber, square-tessera trails, stacked question squares, the zone and the station tablet, and the log that follows the playhead. Step 8: the homepage at `/` (Homepage): one door, the departures board, the live map on the real timetable, How it plays, the record wall, yesterday's hider, the phone note and the states; the game moved to `/play`, and the server answers `GET /daily`. Step 9: the seeker's nine conductor's lines at their moments, the keyboard on every printed key, and the three sounds ("Someone's here" on); the daily and a practice round played to the catch by keyboard (MapLibre, then Google). Not yet: the hider's screens and two-player rounds (M3).* |

**Street View spike (now, before the solo track):** walk one zone in Street View at 6×, count panorama loads per round, and settle the pricing/terms question. Street View is the hook, so confirm early that it feels right and is affordable — but don't build on it until M4. *Done 2026-10-05 — findings in `docs/street-view-spike.md`: Google works and is cheap, but its terms block our side-by-side layout and server-relayed photos; provider decision pending a Mapillary check.*

### Solo track (no playtesters needed)

Charlie is holding off on live playtests, so these come before M3. They make solo play worth returning to, and the bots stand in for playtesters.

| # | Item | Done when |
|---|---|---|
| S1 ✅ | **Daily challenge** | Everyone gets the same bot-hidden station each day (seeded by date), same start and timetable; a shareable result ("Subway Seek #12 · from Times Sq–42 St 🚇 / Found it in 41 min · 3 questions / 📡🗽🐙 / Hider score: 1 h 11 min"); practice rounds stay random; results history kept in the browser. *Done 2026-10-05: Daily #1 verified identical across connections; share text, stats and history unit-tested.* |
| S2 ✅ | **End-of-round replay** | After a round, an animated map replays the bot's hidden route and your route side by side, like the show's map graphics; makes the daily share worth clicking. *Done 2026-10-05: one 10:00 → end timeline in ~25 s, trains rewind with it, question markers appear when asked, play/pause/scrub. Visual polish → design agent.* |
| S3 ✅ | **You hide, a bot seeks** | Built 2026-10-08: played 20-min hide, paced view-only seeker, verified Street View lock/freeze, private answer and hand decisions, hider result, both replay trails and separate hide history. 30 initial + 156 expanded automated paced scenarios and live Google lock/catch checks; full manual pacing pass remains before launch. `docs/match-balance.md`. |
| S4 ◐ | **Bot vs bot balance sim** | The S3 seeker vs a bot hider at full speed, with real travel time: distributions of station-finding time, endgame share and hider score, to tune the hide time, cooldown and prices without playtests. *Simulation built 2026-10-07: `pnpm sim:match` plays 780 rounds in ~30 s with a bot seeker (`seekerBot.ts`) that sees only its SoloView, asks the thrifty question, rides toward the candidates and sweeps the street as `sim:endgame` does. Normal: station in a median 38 game-min, endgame 36% of seeking, hider score 178, a round ~14 real min. Charlie took its recommendations on 2026-10-07: time bonuses 6/4/2 (deck 31), Wrong way costs 1 card, Sidewalk shed lasts 20 min, Veto and Wrong way hold values 10 and 6. Re-run: Normal station 38, endgame 38%, score 176. `docs/match-balance.md`.* |
| S5 ✅ | **Smarter bot hider** | Difficulty levels: Hard picks stations the questions struggle to tell apart. *Done 2026-10-06: the bot hides in a band of station hardness (Easy 3–4 questions, Normal 5–6, Hard 7–8 with twins), the daily plays Normal, Easy plays no curses, Normal holds movement curses until 20 stations are left, Veto also fires on a kill shot. Below, and `docs/hider-bot.md`.* |

### S3: You hide, a bot seeks (decided 2026-10-08)

*Step 0 approved by Charlie on 2026-10-08. Build in the order in `docs/S3_BUILD_PROMPT.md`; rules below are decided; engine, server, screens, result and replay are built. Step 6 measurements are recorded in `docs/match-balance.md`. The PNGs in `docs/design/`, Hider screens, Waiting for the hide and the built vocabulary replace the private artifact reference. Read the PNGs before Step 4. `cards.ts` wins over older mock card values: Sidewalk shed 20 min, Wrong way costs 1 card.*

**Shape.** Practice against a bot seeker, one human socket, starting at 10:00 at one of the existing 13 hubs. Twenty game-minutes to hide, then the existing two-hour seeking limit, at the shared 6× clock. The homepage's You hide row becomes Now boarding and opens `/play?hide`; Normal by default, with Easy / Normal / Hard chosen before a new round. The human chooses the station by riding: the bot hider's hardness bands do not choose it. A daily You hide is a later decision. S3 includes the Street View endgame; the milestone's older map-pin wording does not describe this build.

**Difficulty, starting mapping from the measured variants.**

| Bot seeker | Go up and search at | Minimum station-question information | Journey horizon |
|---|---|---|---|
| Easy | ≤ 4 stations | 0.25 bits | 45 game-min |
| Normal | ≤ 3 | 0.25 | 45 |
| Hard | ≤ 2 | 0.25 | 45 |

`docs/match-balance.md` measured those crossovers at 65 / 62 / 61 game-min of seeking, with 6% / 4% / 2% timeouts against Normal bot hiders on the old deck. Lowering the information floor to zero changed nothing. Its Easy / Normal / Hard headline columns describe **hider** difficulty, with one seeker policy; they are not evidence for three seeker levels. The table above is a decided mapping, to re-measure with pacing and human hiding. At crossover 2 the hider actually earned more question bonus: Hard is more likely to catch, not yet proven to lower the hider's score. No change to prices, cooldowns, deck composition or the existing bot hider.

**Round and intents.** A human-controlled hider uses the same round rules as a bot-controlled hider. Controller choice belongs to setup, not to card or scoring rules. The engine stays pure; the server supplies verified panorama facts and time. Every client command keeps `{type: "intent", seq, intent}`. The socket's role selects its allowed intents.

| Phase | Hider may do | What settles without a click |
|---|---|---|
| Hiding, 10:00–10:20 | `board`, `cancelBoard`, `alightAt`, `transfer`; wait | The real timetable and the full hide deadline. Rule: exits and street walks open at 10:20, as Phase 2 describes; no early Hide here |
| Time's up / finding a spot | Choose `exit`; `walkTo` within the 400 m zone; `hideHere` while standing at a verified Google panorama; answer and play cards | Station and zone are fixed at 10:20; walking and stairs keep their travel time; freeze on the seeker's first on-foot entry into the zone |
| Locked / frozen | Answer decisions, card keeps, curse plays, redraw; watch | No movement or re-entry; pending answers, curse expiry, catch and the two-hour limit |
| Over | Replay, share, start another round | Final score and hand; no more round intents |

- **Deadline.** Use the station occupied at `seekStart`, or the last stop the train called at by that instant, including an arrival exactly at 10:20. Rule: end that ride on that platform at 10:20, trimming the trail there; never let the remaining express ride extend the hide or backdate an exit. A queued train that has not left is still its platform. Rule: refuse a transfer that would still be in progress at the deadline, with its reason shown before selection. The hub remains excluded from `reachableComplexes`; a hider still there at 10:20 ends incomplete, without a score (“You didn’t leave the start”).
- **Zone.** The existing great-circle 400 m radius about the complex's fixed coordinate. Apply it to the hider's whole walk; the seeker's 600 m street limit is not the hider's limit. Keep the same optimistic reach scan, so every legal hiding station remains in the seeker's opening set. A station outside that set cannot silently become a legal hide.
- **Lock and freeze.** Hide here, answering an unlocked spot photo, or the seeker becoming on foot anywhere inside the zone, including walking in from a neighbouring station. Test the boundary crossing at its actual game time, even between ticks. Record the cause and time; stop the hider's movement. Preserve their played trail when enabling the existing 40 m reveal / 25 m catch endgame: `placeHider`'s fabricated bot trip must not replace it. Mid-walk freeze snaps to the nearer endpoint by elapsed walk time; spot and panorama are never separate. A hider still underground when the seeker first enters the zone is caught at that instant. At 10:35 any hider still underground is placed at the exit nearest their platform and frozen. An exit walk is already leaving the underground: neither relocation nor the underground catch interrupts the stairs. If the seeker enters during that walk, freeze at the chosen exit on arrival, keeping the remaining travel time.
- **No false station catch.** Today `spot: null` means finding the station ends the round. In a human round it can mean the hider has not locked yet. Those are separate states; an unlocked human must not be caught merely because the seeker reaches the station.

**What each side sees.** Every hider message, including hello, reconnect and rejection, is made from `hiderView(round, t, idx)`. It contains their own transit and trail, phase, station/zone once assigned, current verified panorama, lock/freeze cause and time, hand, deck **size** (never its order), pending draw choice, active curses, public card plays, score components, questions and answers. An incoming station question includes its true answer and the candidate count it would leave. That preview is private; the map's committed possible stations remain exactly those in `soloView` until the answer lands.

The hider watches the seeker's actual position, trains ridden, completed trail, questions and eliminations. A ride projection needs the trip and boarding event to animate it, not the bot's selected future alighting stop. No planned journey, intended next question, target station, `SeekerMemory` or `SearchBelief` goes to the hider. Positions and the distance line derive locally from public motion and the clock; zone entry is a discrete event, not a distance packet every second.

The bot driver receives only `soloView`, never the round or `hiderView`. During hiding its only hider information is the status board: Riding / Changing trains / Walking; waiting, including a queued departure, is Changing trains. No route-letter variant in S3. The small “The seeker sees only this” board uses that same public status. `hasSpot` and photo availability must describe the mode's capability and fixed opening times, not whether the human has locked, chosen an exit or loaded a panorama. No packet, null field, early answer, card payment or draw reveals that state. The existing near-marker and end-of-round reveal remain the exceptions. The known panorama-ID leak in photo URLs remains an M3 issue.

**Answer window, decided confirmation of the later decision.** Every **station** question, photos included, uses one 60-game-second window (10 real seconds at 6×), whether or not a card is held or played. “Sent in 6 s” is the countdown in progress, not a six-second window. On-foot questions keep their decided immediate answers and +3 price; extending the window to them would be a new rule and balance run.

`answer` identifies the pending question and chooses true / Veto / Randomize. No decision sends the true answer at `answerAt`. Rule: one committed choice; a true answer never sends early, a card is reserved when chosen and cannot also pay for a curse, and its effect is visible only at `answerAt`. Veto still charges the question, closes that exact kind and setting for the round and draws nothing. Randomize uses the seeded legal pool of its category, excluding itself and closed questions; no second choice after seeing the replacement. No replacement means it cannot be played and costs nothing. Map answers keep the seeker's ask-time origin, including the last called station while riding.

The old ten-game-minute human-photo timer is superseded by the uniform station-question window. Rule: S3 keeps the existing directional prompts and the one-minute window. Lock & answer locks now but sends at the same `answerAt`; Move first keeps only the time remaining, never restarts it; expiry sends the default and locks. Use the requested direction. Veto may close a photo; Randomize chooses another legal direction from the same source, without a new window. The bot never asks photos; exercise these screens with fixtures. Do not silently add a ten-minute exception or send the photo when the human clicks.

**The hand.** Same shuffled 31-card deck, empty initial hand, existing draw/keep counts, limit 6; no Move, Signal problems or Local only. A human chooses what the bot's value table chooses today. `keepCards` names the drawn cards retained and any overflow discards; `playCard` names a curse and its payment cards; `redraw` consumes itself and two named other cards, then draws three. Duplicate copies need unambiguous identities within the hand revision. Keep the current one-active-curse limit, ten-game-minute gap, costs and movement enforcement. The bot's strategic conditions (near its station, ≤ 20 candidates, etc.) are not restrictions on a human's card choices; Tourist and Wrong way still need the transit state that makes their effect defined.

Rule for the unhandled human draw: draw when the answer lands, then give a private ten-real-second choice (60 game-seconds at 6×), using the Card draw motion and an ink Keep button. Draw 1 / keep 1 commits automatically if there is room. Other hand-changing intents first settle this choice. On expiry, the next draw, a drop that outlasts it, or round end, the existing value order chooses the keep and overflow discards. The clock and bot keep running; drawn cards are not playable until kept. Empty deck means no refill, as today. Charlie approved this timing and fallback; the existing bot hider keeps its current behavior.

**Bot on the shared clock.** Rule: a minimum **3 real seconds of running time** between bot actions: 18 game-seconds at 6×. `SeekerDriver` takes `SoloView`, memory, game time and last-action time, returning an action or `waitUntil`. It respects both `seekerStep`'s next wake time and the action floor. It does nothing before 10:20, while paused or after the result. The floor delays a decision, never a train, stairs or an answer deadline. A multi-intent plan is revalidated against a fresh seeker view between actions; `board` and `alightAt`, or starting a thermometer and asking, do not all fire in one server tick. New public events can invalidate a pending plan, without bypassing the floor. A rejected action backs off, never loops in the same tick.

The server's one-second tick drives due work and publishes only changed views. The first bot action is due at 10:20; if it initializes a thermometer, its opening question follows at least three real seconds later. It may plan its opening during hiding from public information, but submits no seeking intents then. Save the last-action time and rule deadlines with the round, not the bot's beliefs; rebuild memory from `soloView` on restore and never burst through missed actions. The current solo rule is **no pause on a drop**, despite the build prompt's older summary: the latest decision and `SOLO_PAUSES_ON_DROP` agree. A manual practice pause survives a drop and restart.

Rule for S3 clock controls: Pause throughout; hiding-phase fast-forward to the hider's next event, capped at 10:20; no seeking-phase skip initially. This exception to solo fast-forward is decided: once both sides act, skipping could consume the human's answer window and collapse the bot's watchable pace. Revisit only with event-by-event stopping at human decisions. M3 keeps its already-decided no-skip rule.

**Screens and copy.** Build the six hider screens and the unlocked spot-photo overlay on `ui/vocab.tsx`: Caption, Rule, Button, Chip, Lamp, LocalBand, ExpressBand, TileTimer, Wainscot and the existing tablets/boards. Use the Hider screens and Waiting for the hide copy above. At most two black captions besides the clock; score is the hero number; own dot/trail ink, seeker terra cotta; terra cotta buttons only Hide here and Lock & answer. Keep the decided fonts, square data marks, keyboard behavior, reduced motion and Curse lands choreography. Print working H / U / K / V / R keys on Hide here / Up at Exit / Keep / Veto / Randomize. Zone captions and rule-list squares use neutral ink; leave-round confirmation uses Notice with Leave round / Stay. The Time's up mock's immediate “Answered No for you” becomes the same incoming window as any later question.

Extra copy for these screens, **decided** (values substituted; no street names are available):

| State | Line / control |
|---|---|
| Mode header | “You hide · Normal” |
| Difficulty hints | Easy: “Searches with 4 stations left.” Normal: “Searches with 3 stations left.” Hard: “Searches with 2 stations left.” |
| Live score | “Your score” / “Time bonuses count if you're still holding them” |
| Locked row | “Locked in · since 10:31”; auto-freeze: “Frozen · since 10:48” |
| Neighbouring street entry | “Entered your zone · 10:48” (use “Came up at Exit 4 · 10:48” only when that happened) |
| Distance, until curated graphs | “90 m from you in a straight line. They catch you within 25 m, once they see you.” |
| Pending keep | “Draw 3, keep 1” / “Keep” / “Choose 1 to discard” / “Kept for you in 6 s” |
| Curse payment | “Choose 2 cards to discard” / “Play Tourist · Discards Running late, Delays” |
| Deadline transfer refusal | “That transfer arrives after 10:20.” |
| Invalid start-station hide, if approved | “You didn't leave the start.” / “Play again” |
| Unverified lock | “That spot couldn't be checked. Try again.” |
| Hider result | “Found” / “Not found”; “You hid at”; “Caught at 11:10”; “Your score”; “Seeker's time”; “Questions”; “Cards held”; “Watch replay”; “Share result”; “Play again” |
| Homepage record | “Daily seeking record” |

Use the three existing hider conductor's lines at their decided moments; no new opening announcement. Google imagery stays beside Google Maps, with one reused map/panorama instance. MapLibre development uses no Google imagery. Hider walks and locks require `officialImagery` verification; a failed lock is never accepted as a real panorama. Exits beyond 400 m are shown but disabled (“Outside your zone”); if every exit is outside, allow the nearest. A failed panorama lookup retries once before refusing the lock (“That spot couldn’t be checked. Try again.”). Walks only target Google panoramas.

**Result and replay.** Hero = elapsed **seeking** time + question bonuses (including Veto) + time bonuses still held. The hide phase is not scored; the two-hour cap limits elapsed seeking, not bonuses. Show found / not found, station, spot and catch time where applicable, held hand and the three-part tally. Live score separates held bonuses from banked question bonuses, so spending a bonus card cannot masquerade as lost elapsed time. Watch replay shows both played trails from 10:00, you ink and the seeker terra cotta, with questions, cards, lock/freeze and catch. Play again preserves the selected seeker level.

Decided four-line share (question-family trail stays as today): “Subway Seek (you hide · normal) · from Times Sq–42 St” / “Found in 65 min · 9 questions” (or “Not found · 120 min · 9 questions”) / family trail / “My score: 2 h 56 min”. No daily number. A hider abandoning the round is not a successful unfound hide; leaving early is incomplete with no scored result, but its replay stays inspectable (“Leave this round? It won’t count.”).

Save each completed hide as a separate browser `hide` result with a round ID, time, difficulty, score and share. Rule: the homepage wall, fastest find and streak remain daily seeking only, explicitly labeled “Daily seeking record”; hide results get their own history rather than being mixed with lower-is-better seeking times. Live replay has both full trails. Stored replay follows the current no-Google-coordinates rule (IDs only for later rehydration, or the current reduced street replay). S3 server persistence stores panorama IDs and interpolation recipes, rehydrating coordinates on restore. Browser hide replays use reduced street positions at MTA exits (latest 20); completed score history remains. The older bot-hide snapshot representation is separate.

**Carries into M3.** The hider's played transit/trail, deadline and zone, lock/freeze transitions, answer/keep/payment intents, deck, scores, role filters, screen states and replay events. Replace the seeker driver with the second role's ordered intents; add rooms, same-hub/time role swap and two-player disconnect handling. No second rules engine. Still separate M3/M4 work: curated connected zones, graph distances, map fallback and the acknowledged photo-URL / visual-curse information limits. S3 must not mark those or the unimplemented M6 cards done. After approval, date each decision in the log; after each working build step, run the required checks and commit only that step's own changes.

**Street deductions for a moving hider.** For each candidate zone, exact street constraints and searched cells accumulate only from the seeker's first public entry into that candidate's circle. Before then, keep only conservative station-level range deductions. This never reads the actual lock state; pre-locked bot-hider rounds keep their current search. Verify with `pnpm sim:match`.

**Bot perception.** Fog and Signal loss cost this bot nothing, and it never asks photos or reads a photo's panorama ID as a location. Keep these measured limitations for S3; photo screens use fixtures. Record the gap for M3, where a human seeker asks photos.

**Step 6 measurements.** Thirty initial automated virtual-clock rounds all caught; the expanded paired sample (52 per level) caught Easy 48, Normal 48, Hard 50. Keep 4 / 3 / 2 at 0.25 bits; no price changes. `docs/match-balance.md` states the method and limits. Longest quiet ride: 303 real seconds. Still open: a full manual pacing pass; event-by-event skipping is the fix if the riding dead time bores. Browser tests and the live Google endgame fixture are separate from the simulated rounds.

### Bot hider difficulty (S5)

*Proposed and decided 2026-10-06; built the same day. The numbers measured here are in `docs/hider-bot.md`.*

**Today the bot's station is a lottery.** It hides at a uniformly random reachable station (`createSoloRound`), then plays its cards well. Measured with the `pnpm sim` thrifty seeker over all 1,028 (hub, station) pairs (2026-10-06): 7% of stations fall in 1–3 questions, 17% in 4, 51% in 5–6, 25% in 7–8. One daily is "28 St, found in one question", the next is an 8-question slog across the river. Ride time from the hub explains little of it (correlation 0.39, and every station is ≤ 20 min away); what makes a station hard is how many others answer every question the same way from where the seeker stands.

**The bot picks its station from a difficulty band, and the daily plays Normal.**

- **Hardness of a station = questions a strong seeker needs to pin it**, from the sim's thrifty policy (best bits per minute, moves toward the candidates, honours cooldowns), run inside the engine at round start (up to ~0.2 s per hub the first time, then cached; deterministic). The seeker and the sim share the code, per the engine rule.
- **Bands.** Easy: 3–4 questions (23% of stations). Normal: 5–6 (51%). Hard: 7–8 (25%; ties broken toward stations with a twin, one indistinguishable from it by every question asked from the hub, which 25% of stations have). A band empty for a hub widens by one question on each side. Within the band the pick is uniform, seeded as today, so the daily stays the same for everyone.
- **Why 5–6 for Normal.** The seeker still has to deduce (never a gimme), questions alone take ~25–30 game-min and ~55 min of hider bonus, then 2–3 stations are left and travelling to look is cheaper than asking: the crossover the M2 pricing wanted every round to reach. 7–8 keeps the seeker asking past the point where it's fun; 1–4 ends before the cards matter.
- **Cards.** The bot keeps deciding from public information only (`docs/hider-bot.md`), and curses stay rate-limited (one at a time, 10 min apart, 2 of each in the deck). Three changes:
  - **Veto is a kill-shot card.** It fires late (30 or fewer stations, a strong question) as before, or earlier when the question is expected to leave 10 stations or fewer. Measured along the sim's runs: with more than 30 left no question ever leaves fewer than ~10, so the "3 or fewer" first proposed would never have fired; 10 is the sharpest cut that exists, at ~3% of steps.
  - **Normal holds Tourist and Wrong way until 20 or fewer stations are left.** Early exploration is never punished; a movement curse lands when the seeker is closing in and reads as the hider fighting back. Hard plays them from the first ride.
  - **Easy plays no curses**, for a tutorial round.
  - Not done, on purpose: Randomize picking the weakest replacement (the card says random, and it would be a second Veto), and any card decision that looks at the real answer (it leaks).
- **Hiding spot:** unchanged (a random panorama 60–360 m out). A later knob if the street search needs one: Easy nearer the exit, Hard further.
- **Not an LLM.** The bot's decisions are small, exact search problems over ~100 stations that need to be deterministic for the daily, reproducible in tests, free, and pure in the engine; a model call fits none of that. Prior art agrees: the Scotland Yard hider in Nijssen & Winands ([IEEE TCIAIG 2012](https://dke.maastrichtuniversity.nl/m.winands/documents/TCAIG_ScotlandYard.pdf)) is search with two heuristics (stay far from the nearest seeker; keep the seekers' possible-location set large), and [Absurdle](https://qntm.org/absurdle), the adversarial Wordle, is the pure form of a hard hider: after every guess it keeps the largest bucket of answers. Our hardness measure is the same idea run once, since our hider has to commit to a station. Difficulty-adjustment research (Hunicke, [DDA 2005](https://dl.acm.org/doi/pdf/10.1145/1178477.1178573)) warns that mid-round rubber-banding reads as cheating; a band chosen before the round is honest and keeps the daily shared.
- **Screens:** the result card gets a difficulty picker (Easy · Normal · Hard) under "Practice round", with a one-line hint for the chosen level; the header reads "Practice round · Hard" and the share line "Subway Seek (practice · hard)" when it isn't Normal. Under Interaction's vocabulary it is three Buttons, the chosen one ink and the others white with a rule, not a tab row. The daily has no picker.
- **Where it lives:** `hardness.ts` (the shared seeker, the table, the bands), `createSoloRound` (the pick), `hiderBot.ts` (the kill shot and the Normal hold), `protocol.ts` (practice difficulty), the server's `newRound`, the result card. `pnpm sim` now runs on the engine's seeker and reports the same numbers as before (thrifty: mean 5.4 questions, hider bonus ~64 min).

### M2 results: how many questions find the station (`pnpm sim`)

Hider leaves Times Sq at 10:00 with 20 min → **97 possible stations** (log₂ = 6.6 perfect yes/no questions). A greedy seeker always asks the question that best splits what's left:

| Seeker | To narrow to ≤ 3 | To pin the station | Solvable by questions alone |
|---|---|---|---|
| Static (asks everything from Times Sq) | mean 5.8 (max 8) | mean 7.0 (max 9) | 49 / 97 |
| Moving (free travel toward the candidates) | mean 5.4 (max 7) | mean 6.8 (max 9) | 91 / 97 |

Stations left after 1–8 questions (moving): 49 → 25 → 14 → 7 → 3.7 → 2.0 → 1.3 → 1.1.

**Pricing decision: keep +10 min per question and the 5-min cooldown.** Pinning the station by questions alone costs the seeker ~70 min of hider bonus and ≥ 30 game-min of cooldown, so questions pay early, but with 2–3 stations left it's cheaper to go and look. That crossover is the decision we want players making. Revisit once real playtests log station-finding times.

*Superseded later the same day: with only radar and route questions, a strong seeker spent over 90% of its questions on those two kinds, so the set grew to six categories with per-category prices and cooldowns (Rules detail; `docs/question-balance.md`). The crossover logic above still holds: pinning the station now takes ~5.4 questions and earns the hider ~64 min.*

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
| Tentacles | 4 | 2 |
| Photo | 1 | 1 |
| On foot | 1 | 1 |

Hand limit: 6. A vetoed question draws nothing. The solo deck is 31 cards, listed in `docs/hider-bot.md`, set by the S4 simulation (2026-10-07).

- **Time bonuses** *(M3)*: +5 / +10 / +15 min to the hider's score, if still held when the round ends (caught, time's up or the seeker gave up).
- **Powerups:**
  - **Veto** *(M3)*: refuse a question; the seeker has still spent it, and it's closed for the rest of the round (see Veto closes the question). *Decided and built 2026-10-06.*
  - **Randomize:** swap the question for another of the same type
  - **Discard 2, draw 3**
  - **Move:** unfreeze and choose a new spot in your zone while the seeker is frozen 5 min. *Not in the solo deck: a bot doesn't move.*
- **Curses** (played on the seeker; paid for by discarding cards). Movement curses are server-enforced, which is where online beats the show. Fog and Signal loss are drawn by the client, which is enough against a bot; for multiplayer, either accept that a determined seeker can defeat them or strip the data server-side:
  - **Fog:** seeker's Street View blurred for 10 game-min
  - **Signal loss:** seeker's map hidden for 10 game-min, leaving only departure boards
  - **Local only:** no express trains for 20 min. *Not in the solo deck yet: needs per-train express flags.*
  - **Signal problems:** seeker's train held 5 min at the next station. *Not in the solo deck yet: needs per-player train timing.*
  - **Wrong way:** seeker's next train must go in the opposite direction. Lapses after 30 min so a terminal can't strand the seeker
  - **Tourist:** seeker must get off at the next stop and walk 200 m before going back in
  - **Sidewalk shed:** seeker walks at half speed for 20 game-min (replaced Black & white, which didn't change play; 10 min until S4 measured it at under 2 min of cost)

### Veto closes the question

Today a vetoed question can be asked again once its category cools down. So Veto only delays one answer, by 15 min for most categories, 40 for Tentacles and 5 on foot, and the seeker can ask other categories meanwhile. The show had the same flaw, and it was the main rules complaint after the NYC season: the seekers just ask again ([r/JetLagTheGame](https://www.reddit.com/r/JetLagTheGame/comments/1kd2m9b/), 537 upvotes). The show has since fixed it. In the official expansion rules a vetoed question "is removed from the game for the rest of the round" ([rules](https://rules.jetlagthegame.com/expansion)).

- **Rule, decided 2026-10-06: a vetoed question is closed for the rest of the round.** Built the same day: the engine refuses a re-ask, and the client derives the closed list from the question log.
  - **"The same question" means the same kind and setting, asked from anywhere:** Radar 1 mi, "Does the Q stop there?", Same borough, Matching museums, Tentacles hospitals, a photo looking north from their exit, Street radar 100 m. Closing it only where it was asked would do nothing, because the seeker would ask it again from the next stop.
  - **The rest of its category stays open.** After a vetoed Radar 1 mi, Radar ½ mi is still there once radar cools down. Pushing the seeker onto a worse question is part of what the hider gets.
  - **Unchanged:** the seeker still pays the question's price and its category cooldown, and the hider draws nothing for it.
  - **Randomize never swaps to a closed question.** It's out of the game, and swapping to it would answer what the hider refused.
- **Thermometer and the walking hotter-or-colder are one question each,** so a veto closes the whole category for the round. Accept it for the thermometer, the least-used category (~5–6% of a strong seeker's questions, `docs/question-balance.md`). Watch the walking one in playtests, because the street search leans on it.
- **Seeker:** a closed question's chip stays in its block, hollow like a vetoed question's square in the replay, captioned "Vetoed · closed this round". It can't be chosen, so it never needs a refusal row. *Solo today: the chip is struck through, with that caption as its tooltip.*
- **Hider:** the rule is printed on the card. The incoming-question band already shows the true answer and what it would leave, so the hider sees what closing it is worth.
- **Bot:** a stronger Veto changes when the bot should play it (today: a strong question with 30 or fewer stations left) and what it's worth when choosing which cards to keep (12 min). Re-tune both with the S4 simulation, along with the curse prices.
- **What doesn't change:** a veto still tells the seeker the hider didn't want to answer, so the bot still decides from public information only.

### Card faces (proposed)

Every card is a small plaque in the Mosaic look (see Look and motion). Art and layout: [Subway Seek Deck](https://claude.ai/artifact/FtuLTd6LC7PfkBjNewoY8W) (private link).

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
| Veto | brass folding gate | Refuse a question. The seeker has still spent it, and can't ask it again this round. | "This entrance is closed." | — |
| Randomize | the old Y-cut subway token | Swap the seeker's question for a random one of the same type. | "Good for one fare." | — |
| Discard 2, draw 3 | three cards | Discard two cards, then draw three. | "Transfer is available." | — |
| Move | station stair, arrow up | Unfreeze and choose a new spot in your zone. The seeker is frozen for 5 min while you move. Playable once frozen or locked in. | "Step lively." | — |
| Fog | street steam stack | The seeker's Street View is blurred for 10 min. | "Visibility is limited in the area." | discard 1 |
| Signal loss | a subway map torn in two | The seeker's map is hidden for 10 min. Departure boards still work. | "Please listen for announcements." | discard 2 |
| Local only | a pigeon | The seeker can't board express trains for 20 min. | "This train is now running local." | discard 1 |
| Signal problems | a track signal at red | Holds the seeker's train for 5 min at its next stop, or the next train they board. | "We are being held momentarily by the train dispatcher." | discard 1 |
| Wrong way | a U-turn | The seeker's next train must run the opposite way to their last one. | "Change here for trains in the other direction." | discard 1 |
| Tourist | the Statue of Liberty | At the next stop, the seeker gets off and walks 200 m before going back in. | "Excuse me, which way is uptown?" | discard 2 |
| Sidewalk shed | a hunter-green sidewalk shed, lights on | The seeker walks at half speed for 20 min. | "Pardon our dust." | discard 1 |

- **Curse costs:** about one card per 5 game-min the curse is expected to cost the seeker, minimum one. Signal problems is a certain 5 min, so it costs 1. Signal loss takes the shaded map, which is where the deduction lives, so it costs 2. The S4 simulation (2026-10-07, `docs/match-balance.md`) measured Tourist at 8–10 min (2 cards, as reasoned) and Wrong way at a median 0 (it lands as the seeker comes up and lapses), so Wrong way costs 1; Sidewalk shed cost under 2 min at 10 minutes, so it lasts 20 (6 min measured).
- **Open questions (cards):**
  - [ ] Signal loss had no duration. The card proposes 10 min, to match Fog.
  - [x] Randomize on a thermometer has nothing of the same type to swap to. The bot never randomizes a thermometer, a photo or an on-foot question, and otherwise swaps within the category ("Same borough?" can become "Nearest museum the same as mine?"). Keep that rule for human hiders.
  - [ ] Move is limited to "once frozen or locked in". Played any earlier, it would be a free 5-min freeze on the seeker.
  - [x] Deck composition. The solo deck is 31: 6 / 4 / 2 time bonuses, 3 each of Veto, Randomize and Discard 2 draw 3, 2 of each curse. Set by S4 (2026-10-07): with 19 bonuses in 38 the held bonus was a flat +35–42 min on every score, so draws hardly mattered; at 12 in 31 it's +31–41 with more of the hand decided by what's drawn.

## Look and motion

### Look: Mosaic

The look comes from the subway's own tile, in two layers that never swap jobs:

- **IRT tile (Heins & LaFarge, 1904) carries identity:** name tablets, faience plaques, borders. It's used for where you are, photos, cards and the brand. It never carries game data.
- **IND tile (Squire Vickers, 1932) carries information:** the color bands that changed at every express stop, and white-on-black captions. It's used for questions, importance and time.
- Rules that follow:
  - **IND color families = the question categories:** Radar blue, Thermometer red, Matching green, Measuring ochre, Photo violet, and Tentacles teal, which is ours because the IND had five. On-foot questions use Radar and Thermometer at street scale. A family color never decorates. See Questions.
  - **Band width = importance**, after the IND's wider express bands. A 3-tile "express" band marks the one thing that matters now. Everything else gets a 2-tile "local" band or a plain rule.
  - **Circles are trains, squares are game information, hexagons are routes.** Train dots stay circles. Candidate stations and question chips are square tiles, so a green Matching chip can't be mistaken for the 4.
  - **Route tiles, not route bullets** (2026-11-21, decided overnight under brief W25; Charlie to review). A route is a hexagon, the floor tile of the old stations, in the route's GTFS colour with a glaze rim and its letter in Josefin Sans. Locals lie flat; express variants (6X, 7X) stand on end where the MTA uses a diamond. Letter and colour stay, because riders read routes by them; the circle, the diamond and Helvetica, which make up the MTA's route indicator, go. The MTA licenses its "NYCT subway route indicators", free for approved free apps (`docs/GO-PUBLIC.md`); with a licence the bullets could come back, but the tiles don't need one.
  - **Type:** Josefin Sans for tablets, captions and buttons. Libre Franklin for anything read. Tabular figures for every time.
- **Base map: a quiet tile ground,** so the game's own lines and squares are the only strong marks.
  - **What it shows:** glazed-white land, slightly darker blocks at street zoom, the lightest tile for roads with grout-colored edges, and a faint buff on highways. Water is muted grey-green and parks are faint sage, so neither can be mistaken for Radar blue or Matching green. Street, neighborhood and city names stay, in the Mosaic ink tones, because the endgame needs street names.
  - **What it hides:** points of interest and their labels, Google's transit lines and stations, rail tracks, every icon, and administrative boundaries. POI pins are circles, which the language reserves for trains, so park names go too. Parks stay as shapes.
  - **Google setup, in `stand-clear-nyc`:**
    - **Vector Map ID `d52ea7715ab571c4cf3a43db`** ("Subway Seek Mosaic (vector)"). This is the one to use: it draws the whole design.
    - Raster Map ID `d52ea7715ab571c4d1dc8ae7` ("Subway Seek Mosaic"). On raster maps Google applies only part of a cloud style, so land, urban areas and commercial strips keep Google's greys and creams. It's kept only for comparison.
    - Both use the cloud style "Subway Seek Mosaic", style ID `a45edf63b9a210393eb6e2eb`, on their roadmap variant.
    - **Before switching the game to the vector ID:** check Safari. The game's deck.gl overlay is non-interleaved, and only the interleaved mode failed on Safari, but that's unverified on a vector map. *Until then (2026-10-06) the game's raster Google map takes `mosaicStyle.json`, the same design as a legacy style, in place of the old quiet style, and the MapLibre dev map is recolored to the Mosaic on load.*
    - **Still showing:** one-way arrows and a few bike lanes at street zoom. No style rule has removed them yet.
  - **Sources:**
    - `apps/web/src/map/mosaicCloudStyle.json` is the cloud-styling JSON the Map ID uses.
    - `mosaicStyle.json` is the same design as a legacy style array, for a map created without a Map ID. A Map ID ignores the `styles` option.
    - Change both files together.
    - Push the cloud style with the Map Management API: PATCH `styleConfigs/a45edf63b9a210393eb6e2eb`. It takes OAuth, an `X-Goog-User-Project: stand-clear-nyc` header, and the project number `75066973119` in resource paths.
- Rationale, palette and mocks: [Subway Seek Mosaic](https://claude.ai/artifact/HfQMaNv8REXrPY9qNFjakC) (private link). The four directions it was chosen from: [design directions](https://claude.ai/artifact/RezdNAD5GWRVJW2C18f817) (private link). Both are private artifacts.

### Interaction

From the UX pass of 2026-10-06 (`docs/ux-pass.md`, with the reasoning and sources). The mocks were clean but even: every element a similar rectangle in the same tracked caps, and asking, the most expensive click in the game, had no arming step. Charlie reviewed the proposals on 2026-10-06. The decided rules come first; the screen sections below and the Deck page's mocks (parts four, seven, nine, ten and eleven) were redrawn to them the same day. The rest stay proposed.

**Decided 2026-10-06**

- **One vocabulary of tiles.** Each role has one shape, and no two roles share one.
  - Caption: black tile, white tracked caps. The clock, "Facing N", a band's label.
  - Button: ink fill for the default, white with a 2 px ink rule for the alternative, tracked caps, presses 2 px.
  - Tab: square tiles in a row, the active one ink, never more than three. Travel and Ask only.
  - Chip: a light tile with a 2 px rule and a family square at its left edge; dims with its reason.
  - Lamp: a 10 px square dot with a plain label; lit is the family color or ink, unlit is an outline. The status board is lamps, not tiles.
  - Band: local (2 tiles) or express (3 tiles) in a family color.
  - Rule: a 2 px ink rule with small caps above it and no fill. Section headings in the panel are rules.
  - Notice: a light row with a terra cotta square, dismissed by clicking.
  - "Following you" leaves the tab row and becomes a square toggle on the map, bottom right, beside the zoom buttons. It's a map state, not a panel view.
- **A caption budget.** At most two black caption tiles per panel besides the clock. Captions mark live information, not sections.
- **Departure boards look like the real countdown clocks.** The board is a black field with glaze type, as on the platform, and reads bullet · destination · **3 min**. The minutes are the largest thing on the row, tabular and right-aligned, with the clock time small after them. Each route and direction shows its next two trains, "2 min" then "9 min", as the real boards do. The whole row is the button; "Board" shows on hover and focus. Rows you can't make are dimmed with their reason. On a train the stop list stays as mocked, with the stop you're getting off at in the express band.
- **Asking is select, see, confirm.**
  - Clicking a chip arms it: the chip sets ink, the map draws the question's shape (the radar ring, the thermometer's halfway line, the matching cells, the measuring rings, the tentacles), and a one-sentence hint says what it does. Hover previews the same without arming.
  - **No outcome counts.** The map draws the shape and the player judges what it would leave. Counting the two sides for the player would turn reading the map into a lookup; Charlie wants the map read. The partition stays an engine function for the bot and the simulator only.
  - The wainscot is the confirm: "Ask · Radar 1 mi · +10 min to their score". Esc disarms. One question can be armed at a time, and it stays armed across stops, so a question can be set up on the ride and fired on arrival.
  - A category that's cooling down collapses to one rule-row, "Radar · next 10:40". Only ready categories show chips.
  - The route question offers only the lines at your origin: "Lines here: N Q R W".
  - Thermometer chips say how far you've moved: "1.9 km from Times Sq–42 St", or "Move 400 m to another station first · 210 m so far".
- **The seeker sees the answer window.** The question band carries a ten-tile timer, "Answer in 6 s", and the answer sets when the window ends. A bot answers at the same moment a human would, so the wait never reads as lag.
- **Riding has a job.** On a train, the Travel tab shows **connections at your stop**: the departure board of the stop you're getting off at, around your arrival time, in the same countdown-clock form. Hover previews keep working while categories cool down.
- **Fast-forward is on the clock.** In solo rounds the clock tile grows square buttons to its right: ▸ Next stop and ▸▸ Your stop on a train (▸▸ Arrive on a walk, ▸ Departure on a platform). The digits step to the new time and dots jump, because the clock is later, not faster (rule 1). Practice rounds get Pause as a square button on the tile's left. Space and Shift+Space. *Built 2026-10-07, after the second QA pass: ▸▸'s title names the stop ("Skip to the last stop, 168 St" until you pick one), and a skip that would land after time's up is dimmed ("Ozone Park–Lefferts Blvd is after time's up"), since it would end the round.*
- **Onboarding is three hints,** eight words or fewer each, shown once in the notice row and remembered in the browser: before the first question ("Hover a question to see what it does."), after the first answer ("Ride toward what's left. Get off anywhere.") and at three stations or fewer ("Three left. Go up and look."). No tutorial.

**Decided 2026-10-06, second review.** Charlie took the rest of the pass as written, so these are rules too.

- **One hero number.** The seeker's is stations possible (on foot: the share of the circle left); the hider's is their score. It's set larger, and the other two numbers sit on the same rule as a secondary line.
- **The clock says the time.** "6× real time" is said once, on the homepage and the loading board. Under the clock is nothing. "hider bonus, min" reads "min to their score".
- **The homepage has one door:** Play today's daily in the hero, Practice as a text link beside it, and the departures board as the only list of modes.
- **The answer window is for everyone, bot included.** Every station question waits the same 1 game-minute (10 s real) before its answer lands, in solo rounds too, so the seeker's screen can never tell a hider who holds a card from one who doesn't. The seeker sees it as the ten-tile timer. Playtest the pace; the length is the one knob. *Built 2026-10-06 for every station question, photos included; on-foot questions answer at once. A Veto or Randomize shows when the answer would have landed. Solo today: the log reads "Answer in 6 s".*
- **"What counts" at the street.** A three-line notice on the first arrival at the street: the circle, seen at 40 m, caught at 25 m.
- **Keyboard:** 1–5 arm radar distances, Enter confirms, Esc disarms or closes, B boards the first row, Space fast-forwards (Shift+Space to your stop), arrows walk on the street. Each key is printed small on its control, in a hollow tile. *Built 2026-10-06: a key presses the control printed with it, so it does exactly what a click does. It opens that control's tab first if needed, and it leaves Enter and Space to a focused button, except the tab you're on (2026-10-07: Enter after clicking Ask asks). The arrows work relative to where you face: ↑ is the street ahead and ↓ the one behind, each within 60°. They're printed in the corner of their walk tile and caught before the panorama, so Google never takes a step of its own. The fast-forward squares are one glyph wide, so they say Space and Shift+Space in their titles, as the Deck does.*
- **Motion catalog additions:** Board (the row becomes the express band; the tablet departs at the scheduled time), Arm a question (chip sets ink, shape draws, wainscot label steps), Fast-forward (digits step, dots jump, no catch-up), Copied (Share result sets a 2 s notice).
- **Sound is events, and one of them is on by default.** "Someone's here" gets a hard sound and a two-frame hold on the catch band, and it's the only sound that ships on. The departure chime and the answer tock stay optional. There is no soundtrack. *Built 2026-10-06, synthesized, so there are no audio files: two struck square tones, two falling soft notes, a short woodblock tock. Each sounds only for what happens while you watch, never on a refresh. The toggles sit behind a quiet "Sound" link beside "Give up", as three Following-style toggles kept in this browser, and turning one on plays it once (decided 2026-10-06).*
  - *Proposed 2026-11-27 (fun round 1, on branch `fun-round-1`), reversing "one sound on" and "no soundtrack" for Charlie to hear before it ships:* six sounds, all on, at a quiet master volume. The three above (the chime is now "Doors", on boarding and on getting off), a card sound as a card lands (a filtered noise flick over a low triangle tap), and two continuous ones: a low rumble while your own train moves (brown noise through a 110 Hz low-pass, swaying at 0.7 Hz) and a pulse that starts once half the stations are gone and quickens from every 2.4 s to every 0.7 s (a soft 70 Hz thump). Nothing sounds until the first tap or key on the play page; the home page loads no sound. A one-tap Mute beside Sound, kept in this browser; on a phone the list opens from a caret by it. Reduced motion starts the rumble and the pulse off. A hidden tab goes quiet. Still synthesized, no files; the terms page credits each sound.
- **Durations have a ceiling.** Nothing in the panel runs over 300 ms, nothing eases in, only transform and opacity animate, and a control hit by keyboard gets the step token or nothing. Brake and depart are the exception, because they move with the timetable.
- **Contrast is checked at the boundary.** Each family's ring, line or cell must hold 3:1 against the base map's land, water and parks, and each chip's square against its tile. Shape already carries the family on the map, and chips carry text.
- **Small fixes:** no "status page" link until there is one; legends on the map collapse to one caption line once read; caps that carry information are at least 12 px with 0.08 em tracking; terra cotta keeps three jobs (the other player, the irreversible action, the curse) and errors use ink with the terra cotta square only; Share result confirms with "Copied".
- **The component sheet** on the Deck page (part thirteen) is the reference for every role above, at real size, with its states. Build the components from it, not from the screens. *Built 2026-10-06 in `apps/web/src/ui/` (`vocab.tsx`, `mosaic.css`, `tablet.ts` for name tablets), with a dev-only copy of the sheet at `/sheet` for screenshot comparison. Two places follow the rules above over the sheet's drawing: caps that carry information are 12 px with 0.08 em tracking (the sheet draws 10.5 px), and chips and white buttons take the 2 px rule the text names (the sheet draws 1.5 px). Key hints stay small.*

**Proposed 2026-11-27: the playable round** (branch `playable-1`, for Charlie's review). Charlie played the live game: "it's not that playable, it's hard to figure out how to use a question". A stranger must be able to open the game and play a round without reading anything first. Two cold plays by a fresh tester that had never seen the game, and a walk through the first two minutes, are in `docs/ux-first-play-2026-11-27.md`. Nothing here changes a rule, a price or the balance; it changes what the seeker sees, and when.

- **Always one obvious next move.** One plain line under the tabs, there all round, says what to do now, and the control it means carries a dashed faience outline (a gold rule on the black board; never the focus ring's solid one): "Ask a question to rule stations out." · "Press Ask at the foot of the panel to send it." · "Your answer lands in a few seconds. Watch the map." · "Next question at 10:35. Ride toward the stations still possible: the 6 to Pelham Bay Park." · "Get off at 51 St, nearer the stations still possible." · "One station left. Ride toward 33 St: …". It reads only the seeker's view and the public timetable, through the same planner the bots use (`nextMove.ts`), so it says nothing about the hider. It replaces the three onboarding hints; "What counts" stays at the street. *Reverses "No tutorial" (decided 2026-10-06).*
- **A good next question, in practice rounds.** The question the thrifty seeker would ask now, from the candidates alone, is marked. Not on the daily, which stays a puzzle. *Bends "No outcome counts": nothing is counted, but the choice is made for you; up for Charlie.*
- **Questions as sentences.** The Ask tab lists the questions you can ask, written as the question ("Is your station within 1 mile of me?", "Does the 6 stop at your station?", "Are we in the same borough?"), each group with one line on what Yes and No keep. Family names become small labels. Unavailable questions dim in place with their time in words ("One question every 5 minutes. Next at 10:35."); nothing collapses after you ask.
- **Not here.** In a round that ends at the station, getting off at a station that could be theirs and isn't says so ("Not here. 5 stations left.") and marks it on the map: the round going on is the answer. Derived from your own trail; the engine's candidates are unchanged.
- **A guided first round.** The first time someone plays, four coach steps on the real screen: ask your first question, watch the map change, ride a train, arrive. Skippable, never shown again once finished, replayable from How it plays. A first visit's door is an Easy practice round, with the daily beside it.
- **Less at first.** In a first round the hider's score minutes, the prices and the cards stay out of sight, and each comes in with one sentence the first time it matters.
- **Plain words** on the round screen and the homepage: say what a number is ("99 stations it could be", "2 h 00 min left"), not what the rules call it.
- **Travel and Ask together where the screen allows.** The next-move line points at the tab it needs; the answer lands above the scrolling list on both tabs, so it's never out of view.

### Voice

Plain copy everywhere: second person, present tense, digits for numbers, say what to do, no exclamation marks, no emoji in the UI (the share text keeps its trail), and the subway's own words for states (Now boarding, Not in service, Delayed, Held, Last stop). Never "Oops", never "Great job", never a cheerful empty state.

Personality lives in **twelve fixed moments**, each with one original line in the conductor's register. A line is set small under the moment's band or tablet, in Libre Franklin italic, ink-2. It is never a toast, never repeats within a round, and never tells one side anything the other doesn't know. No real MTA announcement is quoted (the departure keeps no caption, as decided 2026-10-05).

| Moment | Who | Line |
|---|---|---|
| The daily opens | both | "Now boarding. Today's hider went underground at 10:00." |
| Trains open at 10:20 | seeker | "Trains are running. Ride toward what's left." |
| Time's up | hider | "This is your station. Everyone off, please." |
| Locked in | hider | "You're set. Hold on and watch them come." |
| First question fired | seeker | "Your question is on its way. Watch for the answer." *(was "Listen", 2026-11-27: the testers looked for a sound)* |
| A veto arrives | seeker | "This entrance is closed. That question is gone for the round." |
| Up to the street | the walker | "Mind the stairs. Daylight ahead." |
| Seeker is in your zone | hider | "Stay where you are. They're on your block." |
| Found | both | "Last stop. Thank you for riding." |
| Time's up for the seeker | both | "Service has ended. The hider was at …" |
| Connection lost | the one who dropped | "We're being held by the dispatcher. The round is paused." |
| Back online | the one who dropped | "We're moving again. Thank you for your patience." |

Cards keep their own lines (Cards › Card faces). Everything else in the game is plain.

*Built 2026-10-06 (UI build step 9), the seeker's nine.* One call since, from the pre-launch review: while a drop doesn't pause a solo round (Disconnects), "Connection lost" and "Back online" don't show, since nothing is being held. They return with two-player rounds. (Time's up on an unfound daily briefly said only "Service has ended."; the reveal came back on 2026-10-07, so the line names the station again.) Each line shows at its moment and is held by the first moment in the round that shows it, so a second veto or a second drop gets no line. The opening shows under the start's tablet until the first question. "Up to the street" shows under the exit's tablet, "Found" under the Found tablet, and "Service has ended" in place of "The hider was at". "Connection lost" shows under its band, and "moving again" for 6 s where the band was. The hider's three wait for the hider's screens. A solo round opens at 10:20 with no wait, so a daily shows "Now boarding" and a practice round "Trains are running", one line each rather than both (decided 2026-10-06).

### Sidebar

The panel reads top to bottom like a platform wall: who and when, the round, where you are, what you can do, then the main action. Mocks of every state: [Subway Seek Deck](https://claude.ai/artifact/FtuLTd6LC7PfkBjNewoY8W), part four (private link).

- **Top bar:** "Subway Seek" as a small Josefin label, the round on one line ("Daily #1 · Mon, Oct 5"), and the clock as a black caption tile with nothing under it. In solo rounds two square buttons sit beside the clock, ▸ and ▸▸: the departure or the next stop, and your stop.
- **The round:** stations possible, time left and minutes to the hider's score, as three numbers on a 2 px ink rule with grout dividers. Stations possible is the hero, set larger. Tabular figures. "Give up" is a quiet underlined link.
- **Tabs:** Travel and Ask, square tiles with the active one in ink. "Following you" is a toggle on the map, bottom right, because it's a map state.
- **Where you are:** the station's mosaic name tablet, with its bullets, on a tile field.
  - On a train: the route bullet, headsign and "next: Canal St in 2 min".
  - On the street: the exit ("Exit 4 · E 14 St & Union Sq E").
- **Departure boards are the countdown clock:** a black field with glaze type, as on the platform.
  - Direction headings are small caps on the board ("↑ Uptown & Queens").
  - Rows read bullet · destination · **minutes**, the minutes largest and right-aligned, the clock time small under the destination, and each route shows its next two trains ("2 min, then 9 min").
  - The whole row boards; "Board" shows on hover and focus. A row you can't use is dimmed, with the reason in words ("too soon to change platforms").
  - On a train, the stop list keeps its rows and the stop you're getting off at is the one express band. Under it, the same board shows the **connections at that stop** around your arrival, so the change is planned before the doors open.
- **Ask:** select, see, confirm.
  - Each ready category is headed by a local band in its color with its price. A category that's cooling down collapses to one rule-row with its next time ("Matching · next 10:40").
  - Radar distances are square chips, and route choices stay MTA circles, only for the lines at your origin.
  - Clicking a chip arms it: the chip sets ink, the map draws the question's shape, and a hint says what it does without counting the sides. The wainscot confirms: "Ask · Radar 1 mi · +10 min to their score". Esc clears.
  - Once asked, the question sits in an express band with the ten-tile answer window ("Answer in 6 s"), then collapses into the log, which shows each question's family square, its time and origin, and how many stations were left.
- **Wainscot:** the one main action for the state, on buff brick. Up to the street, Get off at the next stop, or Back down.
- **Result:** a gold "Found" tablet (or "Time's up"), the hider's station as its own tablet, the three numbers, and the score tally bar. Then Watch replay in ink, with Share and Practice round in white. A daily that isn't found names no station: "Today's station stays secret until midnight. It's on the homepage tomorrow, as yesterday's hider." (Hidden information.)
- **Rules:** ink for the default action, white for the alternative, terra cotta only for actions that fix where you are (Hide here, Lock & answer). No rounded corners, no shadows. Section headings are rules, not captions, and a panel carries at most two black captions besides the clock. Notices are a light row with a terra cotta square, dismissed by clicking; the first round's three hints use that row.
- **Built 2026-10-06** (UI build step 3). Where the mocks were silent, these calls were made and are up for review:
  - An answered question stays the express band for 10 s, then joins the log. The band shows on both tabs, since it's the one thing that matters now.
  - The armed question's confirm takes the wainscot on the Ask tab; on Travel the wainscot keeps the travel action, and the question stays armed. A cooling question can be armed to plan: the wainscot's Ask is dimmed with "Ready at 10:51" in place of the price. Enter asks from a focused chip too.
  - On a train the stop list runs to your stop and three past it, then "7 more stops to Broad St", so the connections stay in view.
  - The street says "Exit 4" without the street names: the dataset has the exits' coordinates, not their names.
  - Walking transfers to another station sit under the board as "Change on foot". Giving up ends on a "Gave up" tablet. On a platform with no train boarded, ▸ and ▸▸ are both dimmed ("Board a train first"): there's no departure to skip to.
  - The header no longer switches between the daily and practice mid-round; the homepage (step 8) is the door, and the result card starts a practice round.

### Street endgame

Street View takes the top three fifths of the main column and the map the bottom two fifths, with a buff trim band between them, as the game now lays it out. Mock on a real panorama: the Deck page, part five.

- **Walk tiles:** one square tile per street you can take, with an arrow and its compass point ("↑ N"), bottom center. They sit above Google's attribution and never cover it. *Built 2026-10-06:* every overlay on the map and on Street View (the walk tiles and walking band, the Following toggle, the replay bar) measures Google's logo and credit row and sits above them at any size, and Signal loss leaves holes in its tiles for them, still clickable.
- **Walking:** a local band fills along the bottom of Street View at walking speed (linear, rule 1), captioned "Walking north · 14 s". The walk tiles dim until you arrive.
- **Facing:** a black caption in the top-left corner ("Facing N"). It's the only text on the photo, because addresses and road labels stay off.
- **Someone's here:**
  - The catch prompt is the screen's one express band, in ink with gold trim, at the top center: "Someone's here · Click them to catch". *Built 2026-10-07, after the QA pass: a walk stops where they come into view, at 39.5 m, so a click there always met "Not close enough". Clicking them from farther than 25 m now walks you to them, and the line under the band says what a click does: "Click them to walk closer", then "Click them to catch". Mid-walk it reads "Get within 25 m to catch" and a click does nothing. The 40 m reveal and the 25 m catch, standing still, are unchanged.*
  - The hider's marker is a gold square tile with a deep-gold border. It replaces Google's red pin, because squares are game information.
- **Curses:** Fog is a blur on the panorama. Sidewalk shed hatches the walking band like scaffold planks and fills it at half speed (motion spec: Curse lands). The curse chip and its tile timer sit in the panel, never over the photo.
- **Search area (seeker on foot):**
  - The map frames the 400 m around the station the seeker came up at, so the circle nearly fills the strip. Outside the circle the map blurs under a light glaze veil, with an ink ring and the caption "Search area · 400 m".
  - **It's centered on the seeker's own station, never the hider's.** Showing the real zone would hand over the hider's station. This circle only shows where to look if their guess was right.
- **Your zone (hider walking to their spot):** the same treatment around the hider's real zone, with a terra cotta ring and "Your zone". It shows the rule that they can't leave. The blur clears once they're locked in or frozen, so they can watch the seeker come.
- **Map strip:** the Mosaic base map at street zoom, with your dot. Hovering shows a square target and "Walk here · 40 s", so a click is never a surprise.
- **Panel:** where you are is the exit. Back down is the white wainscot action, because staying up is usually the point.
- *Built 2026-10-06 (UI build step 5):* "Facing N" follows the panorama's heading; the walk tiles carry only their ink rule (the mock's 2 px drop shadow breaks "no shadows"); while you go up or down, the pane shows the stair treads on the dark tile field; the gold square replaces Google's pin; Fog ramps a 6 px blur in and out over 600 ms. "What counts" is the notice row's three lines on the first arrival, shown once per browser. The strip frames the search area at once and again when it resizes. On the raster Google map, zoom is whole levels, so the circle fills about two thirds of the strip; the vector Map ID would let it fill. Hovering the strip beyond 600 m from the station says "Too far from your station". The catch band's two-frame hold is motion (step 6).

### Homepage (proposed)

One job: get the visitor into today's daily in one click. Shared result lines are how new players arrive, and they arrive wanting today's puzzle. Full mock, responsive: [Subway Seek Homepage](https://claude.ai/artifact/TLySzn31W8WUSPrapZN7dB) (private link).

- **Hero, on the platform wall:** the Subway Seek mosaic tablet. Below it, "Hide and seek on the real New York subway." Then "Play today's daily · #23" in ink, with "or a practice round" as a text link beside it (decided 2026-10-06: one door), and one line of facts: "Daily #23 · Tue, Oct 27 · everyone hunts the same hidden station · starts at Times Sq–42 St, 10:20".
- **Live map:** today's timetable at 6×, every dot a train, every square a reachable station. Ambient motion that's real data (rule 8). It never hints at today's station.
- **Two pages off the homepage** *(built 2026-10-09; `docs/community-read.md` for why)*: **/hardest**, every station the hider could reach from each hub ranked by the questions the game's own seeker needs to pin it, with its twins and its band, from the engine's hardness table (`pnpm data:hardness` writes it; a test fails if it's older than the timetable's pin); and **/changelog**, what changed for players, newest first, headed by today's daily number and the timetable's day. Both on the homepage's wall-and-wainscot layout with a name tablet, linked from the footer. The footer also says "Daily #N, running since Mon, Oct 5": longevity a reader can check.
- **Departures board, for the modes:**
  - Today's daily is "Now boarding", and Practice is "Any time".
  - You hide (S3) is "Now boarding", with Easy / Normal / Hard before Play. Play a friend (M3) remains "Not in service".
  - The board's header counts down to the next daily, which starts at midnight New York time.
- **How it plays** is the round's strip map, Hide → Seek → Endgame, illustrated with the game's real visuals: the hider's trail, a radar clearing, the gold marker on Street View.
- **Your record:**
  - Stats: played, found, streak and fastest find.
  - A tile wall with one tile per day, built from the browser's existing history. Found days are ink with the time, finds under 45 minutes get a gold edge, misses are struck through in terra cotta, and days off stay blank.
- **Yesterday's hider (new idea):** once a day is over, its station is revealed as a mosaic tablet with your result. The question trail is drawn as family squares, not the share text's emoji.
- **Narrow screens:** below 860 px, the hero has the same door, Play today's daily, and under it "New here?" with yesterday's daily as a 25-second replay and the hardest stations (2026-11-21, brief W32; Phones). Until then it said "Play on a computer", with Copy link as the main action and a quiet Try anyway.
- **States:**
  - First visit: an empty tile wall with today outlined in gold.
  - Daily in progress: "Resume daily #23".
  - Daily done: "Today's done · found in 41 min", with Copy result and Watch replay.
  - Arriving from a share: a light band, "A friend found Daily #23 in 41 min. Your turn." This needs the share link to carry the time, and it can't spoil anything.
- **Footer** (wainscot): MTA, Google and OpenStreetMap attribution, and "isn't affiliated with the MTA". No Jet Lag or MTA marks.
- *Built 2026-10-06 (UI build step 8):* the page as mocked, at `/`, with the game at `/play`. The server starts a round the moment a page connects, so the homepage never connects. Its doors are links: `/play?daily`, `/play?practice`, `/play?replay`. The server answers `GET /daily` with today's start, the stations its hider could reach (every seeker sees them when the round begins), and yesterday's hider. Today's hider never leaves the server.
  - **Live map:** drawn on a canvas from the timetable, with no map tiles and so no billed map load. It's framed on today's reachable stations and runs from 10:20 at 6×. It stops off screen and holds still with reduced motion.
  - **How it plays** uses the game's own lines and stations, on the design's example round (Times Sq–42 St to 14 St–Union Sq).
  - **Resume** shows for the grace period after the page last had the round, without the time left: finding it out would mean connecting, and the homepage never connects.
  - **Today's done:** the ink plate "Today's done · found in 52 min", then Watch replay and Copy result. This browser keeps its last daily's trails and station for the replay, and no coordinate that came from Google, whose terms forbid caching them (2026-10-06). So the kept replay stands at the exit you came up at while you were on the street, keeps the street's times but not its places, and has no spot; on-foot questions sit at their station. The replay right after a round, from the server, is whole. Practice moves to the top of the board, in ink.
  - **Yesterday's hider** draws the question trail from the families each result now keeps. Older results are read back from their share line's emoji.
  - The Endgame frame is the dark tile field with the catch band and the gold marker, not a Street View photo. Google's terms rule out a stored image, and Street View shows only beside the Google map (decided 2026-10-06).
  - The share text ends with a link, `…/?d=23&t=41`, which the band reads ("A friend found Daily #23 in 41 min. Your turn."). Decided and built 2026-10-06: a daily's share ends with the site's address, the daily's number and, on a find, your minutes; a daily not found carries only the number, so no band shows. It never names the station.

### Hider screens

Six screens that follow one round on the real timetable, from Times Sq–42 St at 10:00. The hider changes from the Q to the R at 34 St, hides at 14 St–Union Sq, and locks in on E 15 St. The trains, exits and station counts come from the game's data and engine. Mocks: the Deck page, part six.

- **Player colors:** your own dot and trail are always ink, and the other player's are terra cotta, on live screens and in the replay. A view with no "you", such as a shared replay, shows the hider in terra cotta.
- **Hiding (Phase 1):**
  - Twenty tiles count the hiding minutes, with the rule under them: "At 10:20 your station is where you are. If you're on a train, it's the last stop the train called at."
  - The stop list draws time's up as a terra cotta rule between the stops on either side of the deadline, then says what staying on would mean: "Stay on past 10:20 and your station is 8 St–NYU."
  - "The seeker sees only this" shows a small copy of the seeker's status board, so the hider knows what they're giving away. Their trail is drawn only on their own map.
- **Time's up:**
  - The station's tablet, captioned "Time's up · your station", with its bullets.
  - The zone is a terra cotta ring with the map blurred outside it. The station's real exits are numbered squares on the map and rows in the list. The picked exit is the list's express band, and the wainscot says "Up at Exit 6 · 2 min".
  - The first question gets the same incoming answer window as later questions.
  - “Come up by 10:35 or you’ll be placed at the nearest exit and frozen.”
  - “If the seeker enters your zone while you’re underground, you’re caught.”
- **Finding a spot:** Street View and the map strip, as for the seeker, with the "Your zone" ring.
  - A lock row carries the spot glyph: dashed and hollow while you can move, solid ink in a grout frame once locked.
  - Under it are the three things that lock you: Hide here, the seeker coming up inside your zone, and answering a spot photo. The row says when spot photos open ("They open at 10:35").
  - The wainscot is Hide here, in terra cotta, with "Locks you where you're standing".
- **Locked and watching:**
  - The map takes the whole main column, because Street View is only needed for photos.
  - The stations still possible, as far as the seeker knows, are ink squares, and the panel counts them.
  - The lock row reads "Locked in · E 15 St, near Irving Pl · since 10:31", and the hand sits on the wainscot.
- **A question arrives:**
  - A band in the family's color reads "Incoming · radar · from 23 St". Under it are the question and your true answer, with what it would leave: "Yes · would leave 2 stations, yours among them". The hider decides with the cost in front of them.
  - The window is a tile timer ("Sent in 6 s"), with Play Veto or Randomize when you hold them. It's the same length for every question, card or no card, and the answer goes out when it ends. This is the proposal in the veto-window open question.
- **Seeker is in your zone:**
  - A terra cotta express band with ink trim sits at the top of the map: "Came up at Exit 4 · 10:48". It's the hider's one express band, and it mirrors the seeker's catch prompt.
  - The panel leads with the distance along the streets: "90 m from you along the streets. They catch you within 25 m, once they see you."
  - Below that are your spot's view as a thumbnail, the seeker's position, and the curses you can play with their cost.
- **Spot photo while unlocked:**
  - The photo preview fills Street View inside viewfinder corners, captioned "Spot photo · facing N · what they'll see".
  - Send photo opens the hider-only popup "Answering locks you here", with Lock & answer in terra cotta and Move first in white. It says how long is left and what happens when the time runs out.
- **Buttons:** terra cotta only for Hide here and Lock & answer, the two actions that fix where you are. Card plays stay ink, with the cost next to the button ("Play Sidewalk shed · Discards Running late").

### Waiting for the hide

The seeker's first twenty minutes. Mock at 10:13 of the same round: the Deck page, part seven.

- **The map is honest about the search space.**
  - It shows every station the hider could reach by time's up: 97 from Times Sq at 10:00, computed by the engine's reach scan.
  - Stations reachable so far are ink, and the rest are outlined, with the legend "48 stations reachable by now · 97 by time's up at 10:20". Squares set as the clock reaches them, which is ambient motion that's data (rule 8).
- **Countdown:** "The hider has 7 min" over twenty tiles, then "You start at 10:20, from Times Sq–42 St."
- **Status board:**
  - Three lamps, Riding, Changing trains and Walking: a square dot and a plain label, the lit one ink and the others outlined, so they can't read as tabs. Each change crossfades (step) and is logged with its time.
  - Waiting on a platform counts as Changing trains, so stopping tells the seeker nothing extra.
  - Playtest variant: the lit lamp adds the route letter ("Riding · Q"). It never shows stations.
- **Opening questions:** a queue the seeker can reorder, showing when each fires. The times follow the 5-minute gap and each category's cooldown: this round's radar, borough and hospital Tentacles fire at 10:20, 10:25 and 10:30, and a second radar couldn't go before 10:35. Each is asked from wherever the seeker is when it fires.
- **Wainscot:** Add a question, beside "Trains open at 10:20". Boarding is shown as a time, not as a disabled button.

### Replay

The same round, replayed for the seeker after the find, scrubbed to the Veto at 10:36. Mock: the Deck page, part eight. It restyles the controls the game already has.

- **Controls:** one bar over the map, floating above Google's logo and attribution and clear of the zoom buttons, as it does today.
  - It holds play and pause as an ink square, the clock as a caption tile, the scrubber and Close.
  - The scrubber's band shows the three phases: Hide, Seek and On foot. Questions sit above it as family squares (hollow when vetoed), curses as small terra cotta squares, and the find in gold.
  - The scrubber's is the only clock on the screen.
- **Map:**
  - Both trails are square tesserae, offset side by side where the players rode the same tracks. What has happened is solid and the rest of the round is faint.
  - Questions stack like tiles at the place they were asked from, each labeled with its answer. The zone and the spot are revealed.
- **Panel:**
  - The hider's station tablet, then "on E 15 St, near Irving Pl · found at 11:10", then found in, hider bonus and hider score.
  - The log follows the playhead. The current event is the express band, later events are dimmed, and clicking a row jumps there.
  - Hider moves get a terra cotta dot and yours an ink dot. Questions get their family square and curses a terra cotta square.
- **Wainscot:** in a match, "Round 2 · you hide" and Share. In a daily, Share and Practice round.
- *Built 2026-10-06 (UI build step 7):* the bar, the trails, the stacked squares, the panel and the log, as mocked. The log is worked out from both trails once the round is over: "Hider boards the 6 downtown", "changes at", "gets off at", "comes up at Exit 3", and "uptown" or "downtown" when the platform's sign says so, otherwise "to Crown Hts–Utica Av". A change inside one complex is one row. On-foot answers say what share of the circle they left. Three calls, flagged for review:
  - No street names (decided 2026-10-06). The dataset has none, and Google's reverse geocoding can't be cached, so the panel reads "Found at 11:10" and the log "Hider reaches their spot". OSM street names in the dataset would give "on E 15 St, near Irving Pl".
  - The zone ring draws out when the hider reaches their spot, as in the mock (scrubbed to 10:36, ring drawn), rather than at the end as the Motion row says (decided 2026-10-06). The station tablet sets on the map at the end.
  - The gold spot waits for the find; the map frames both trails and the zone, clear of the legend and the bar. The scrubber drags, and ← → step a game minute (Shift for ten).

### Ending

*Proposed 2026-11-27 (fun round 1), built on branch `fun-round-1` for Charlie to play before it ships.* A round that ends at the station ends flat: the tablet sets and the card waits. The reveal becomes the payoff, from facts the round already logged.
- **Verdict:** one line under the result's tablet, set in Libre Franklin bold, worth a screenshot. It's picked from the callouts below and the numbers, never invented:
  - found after riding through their station: "You rode right past them, and came back."
  - found after a close call: "Within 0.3 mi at 11:16. Found at 11:57."
  - found with neither, within 45 game-min and 6 questions: "Straight to them in 0:38."; a longer hunt: "Found in 1:37, after 9 questions."
  - not found, ended within 1 mi of them: "Service ended 0.3 mi short."; otherwise "They were 2.1 mi from where you ended."
- **How it went:** up to three callouts under the numbers, each a time tile and one sentence. Four detectors read the replay's trails and answers, in this priority:
  - *Rode through:* a ride called at the hider's station after 10:20 and you stayed on. "10:42 · You rode straight through their station."
  - *Express past:* a ride went between two stops that a local trip on the same timetable runs with the hider's station between them. "10:44 · Your A ran express past their station."
  - *Closest call:* the nearest station you stood in or got off at, for a find 10 game-min or more before it (for a round not found, any time), within 1 mi of theirs and not theirs. "11:16 · 0.3 mi from them, at Lexington Av/53 St."
  - *Turning point:* the answer that cut the most, if it cut at least half. "10:30 · Radar 2 mi, No: 72 → 22."
  - A callout is a button: it moves the map's replay to that minute.
- **Reveal:** when the round ends while you watch, the map plays both routes once in 12 s after the tally sets. The result card stays in the panel, and the replay bar shows over the map. Watch replay opens the full replay as before (25 s, the log, the scrubber). Reduced motion skips the reveal.
- **You hide:** the same, about the bot's hunt for you: "The seeker rode straight through your station", "The seeker's closest call", their turning point. Verdicts: "They rode right past you once." / "You held them for 1:10." / "They got within 0.3 mi and never found you."
- **Hidden information:** everything here reads `view.replay`, which the server sends only when the round ends (every round reveals the hider then, an unfound daily included: decided 2026-10-07). Nothing here exists mid-round.
- **The share text is unchanged:** a verdict can give the station away to a friend who hasn't played today.

### Coming back

*Proposed 2026-11-27 (fun round 1), built on branch `fun-round-1` for Charlie to play.* Reasons to play tomorrow, all without accounts.
- **Par:** the questions a strong seeker needs for that station from that hub, from the hardest-stations table (`/hardest`), shown under the result's numbers: "Par 6 · 3 over". It counts the questions that pin the station: on-foot and vetoed ones don't. Daily and practice; a station the table doesn't rate gets none, and so does a themed Saturday, whose narrower search space the table doesn't describe. A round not found shows "Par 6" alone. The table loads only when a result needs it.
- **Percentile, daily only:** "better than 64% of today's 213 other finished dailies". A finished daily is found or timed out; give-ups don't count, and neither does a daily played again in a browser that already has today's result: the browser says so when it starts the round (`DailyInfo.replay`), and the server leaves it out, after a restart too, since the flag is in the round's log. A replay in a fresh browser still counts; there are no accounts to tell. The server keeps today's hider scores in memory, rebuilt from the match logs at boot, and serves `GET /daily/scores`: a histogram of minutes, nothing else. It shows once **20** others have finished today, because a rank among a handful says little; before that the line reads "your standing shows once 20 others finish today (12 so far)". A daily played twice in two browsers counts twice: there are no accounts to tell.
- **Days running:** days in a row you played the daily (found, timed out or given up), kept in this browser with the daily record. Yesterday still counts, since today's may not be played yet; a missed day ends the run at 0. The homepage's "day streak" tile becomes "days running"; the result keeps the found streak beside it ("6 days running · found streak 4").
- **Stamp book** at `/stamps`, linked from the homepage footer: all 424 station complexes as squares by borough, of which the 295 a hider can reach (13 hubs at 10:00, 20 minutes, from the hardest-stations table) can be stamped and the rest are faded, ink where you found the hider as the seeker (daily or practice, not a give-up's reveal), terra cotta where you finished a hide, both as ink in a terra cotta edge. Totals for the stampable book, each borough and each line, and "lines found end to end". Kept in this browser (`stamps:v1`), keyed by the complex's GTFS id so a re-pinned timetable keeps it, read through a parser that drops anything malformed, and moved with the other keys on a rename. The page gets the station list from a 20 KB build-time module, not the 5 MB timetable. No export yet: none of the browser records has one.
- **Themed days: Outer boroughs on Saturdays** (decided 2026-11-27, built on `fun-round-1`). From 2026-12-05 (`OUTER_BOROUGHS_FROM`: a Saturday after the deploy, so no Saturday already played changes), the Saturday daily starts from one of four hubs outside Manhattan (Atlantic Av–Barclays Ctr, Jackson Hts–Roosevelt Av, Jay St–MetroTech, Broadway Junction). The bot never hides in Manhattan, though it may ride through, and the seeker's shading starts without Manhattan. Themed days salt their seeds, so every other day draws exactly as before. One shared `createDailyRound` builds today's daily, yesterday's hider and yesterday's replay. The round line, the result and the homepage say "Outer boroughs"; the share line is unchanged. Numbers in `docs/question-balance.md`: the Normal band holds 34–37 stations at 5–6 questions at each hub. Rush hour, One line and Last train stay proposals (`docs/proposals/themed-days.md`).
- **A two-minute daily, The Shuttle:** approved 2026-11-27, to build after launch (guesses count as turns; it stays out of the stamp book): `docs/proposals/two-minute-daily.md`. Same station for everyone, six turns, each a question asked from any station you tap or a guess, no riding, no cards, and a grid to share. A second door beside the full daily, with its own station so neither spoils the other. Needs a `pnpm sim` mode where the seeker asks from anywhere before its band and turn count are set.
- **Friend challenges:** approved 2026-11-27 as proposed (the smallest version), to build after the launch posts: `docs/proposals/friend-challenges.md`. You hide, send a link, a friend hunts your hide whenever they open it, then hides one back. The smallest version is station only with no cards, stored 30 days on the server.

### Questions

The Ask tab's six categories and the on-foot questions. Mocks from the same round, on the game's real landmark data and its own search code: the Deck page, part nine.

- **Six families.** Each category keeps a family color, and the color stands for the shape its answer draws, so it says what a question will do before you ask it.
  - Radar blue is a ring. Thermometer red is a halfway line. Matching green, "same as mine?", is a region. Measuring ochre, "closer than me?", is rings round every landmark. Photo violet is a view.
  - **Tentacles teal is new:** `#1F6E6B`, with `#0E3A38` trim. Its answer is a cell round each landmark in range. The IND had five families, so the sixth is ours. It's kept clear of radar blue, matching green and the water on the base map.
- **On foot is not a seventh family.** The street radar and the walking hotter-or-colder draw the same shapes as Radar and Thermometer, so they use those colors at street scale. Their price and cooldown sit on an ink caption band: "On foot · their exact spot".
- **Landmarks are plaques.**
  - Each is a small buff-framed plaque with a 9 × 9 tile pictogram: a tree, a museum front, an open book, an H for hospitals, a paw for zoos and aquariums, and a plane.
  - They're never circles, which mean trains, or bare squares, which mean game information. The one nearest you gets an ink frame and its name.
  - Plaques show only while you're choosing or reading a landmark question.
- **The Ask tab:**
  - "Asking from" sits at the top, with the 5-minute gap as a five-tile timer.
  - Each ready category is a block: a local band in its color with its price, then its chips. A category that's cooling down collapses to one rule-row with its next time ("Matching · next 10:40"); opening it shows its dimmed chips, so previews still work for planning.
  - Landmark chips carry their pictogram. Tentacles chips carry their count and range ("Hospitals · 8 within 2 mi"), and dim with the reason when none are in range.
  - Photos are two compasses, one for their exit and one for their spot, with N, E, S and W round the edge and Up in the middle. The spot compass says when it opens.
  - On foot, the tab leads with On foot and Photos. The five station categories fold into one list with their next ready times.
  - "Places © OpenStreetMap contributors · NYC Parks" stays at the foot of the tab.
- **Choosing previews the answer's shape, and clicking arms it.**
  - An armed chip is ink, and the wainscot confirms it with the price ("Ask · Tentacles · Hospitals · +20 min to their score"). Enter asks, Esc clears. The hint never counts the two sides.
  - Hovering a chip draws on the map what the question would do, and a one-sentence hint says it: "Your nearest museum is Madame Tussauds New York, 220 m away. Yes keeps every station whose nearest museum is the same one."
  - Matching draws the city divided by nearest landmark of that kind, in green, with yours outlined. Measuring draws an ochre ring of your distance round every landmark of that kind. Tentacles draws the range ring and a teal line from you to each landmark inside it.
  - Previews still work while a category cools down, so you can plan.
  - *Built 2026-10-06 (UI build step 4).* Matching's cells are a Voronoi of the kind's landmarks (d3-delaunay), computed flat round the city's middle, yours filled faintly and outlined (Charlie chose cells over tinting stations). The shape shows for the hovered or armed question, then for the asked one while its band is up; after that, radar rings, thermometer lines and your matching cell stay on the map, faint. A route question picks its line out and steps the others back. The map's legend names what it shows on a light caption and folds its key into that caption after 6 s.
- **Answers** arrive as the express band in the family's color, with the question, the answer and the count ("59 stations → 6"). Then the band collapses into the log. A Tentacles answer names its landmark beside the plaque. The other tentacles retract, and the named landmark's cell, clipped to the range, stays outlined.
- **The street search is tiles.**
  - Where the hider could still be is drawn on the engine's 8 m search grid, as ink tesserae inside the search circle. It clears tile by tile.
  - A street radar draws a blue ring, and a hotter-or-colder draws a red halfway line clipped to the circle.
  - The panel says what's left: "21% of your circle is left", over a 20-tile bar.

### Photos

Photo questions on both sides. The mocks use the real Street View at the hider's spot: the Deck page, part ten.

- **Asking:** the two compasses. Hovering a direction says what the photo will be and what it costs: "+15 min. A human hider has 10 min to send it." *Solo today: there's no human hider, so the hint says what the photo is and that it clears nothing by itself; the price is on the wainscot.*
- **Waiting, with two players only:** a violet express band holds an empty plaque and a ten-tile timer, "Up to 9 min more". It never shows whether the hider is unlocked or deciding. A bot answers when the 1-min answer window ends, like every station question.
- **Arriving:** the photo sets into its plaque inside the violet band. The plaque is a glaze mat with an ink edge and a violet caption saying where the photo is from and which way it faces. The image carries no location data, so the frame does the explaining.
- **On foot, the newest spot photo is pinned** at the top of the panel as a compact "Looking for" row, so it stays beside Street View while you walk. Clicking it enlarges it.
- **Enlarged:** the photo fills the screen on a dark backdrop with its caption and the question. Esc or Close returns. With several photos it says "1 of 3", and the arrow keys step through them.
- **The hider's station photo:**
  - The seeker sets the direction, and the hider picks the exit from the list or the map.
  - Street View previews exactly what will be sent, inside viewfinder corners, so choosing the least revealing exit is the hider's decision.
  - "Send from Exit 3" is ink, because station photos never lock you. A spot photo while unlocked opens the lock popup (Hider screens).
- **Edge cases:**
  - After 10 minutes the game sends the north view from where the hider stands, captioned "Sent automatically".
  - An image that fails to load shows "The photo didn't load · Try again". Retrying is free, because the question is already spent.
  - A vetoed photo keeps its empty frame and a hollow violet square.

### Loading, connecting and errors

What the game shows while it gets ready, and when something breaks. Mocks: the Deck page, part eleven.

- **Getting ready is a four-row departures board:** Timetable, Landmarks, The network and Game server.
  - Each row has a status word, such as "61%", "Done", "Next", "Waiting" or "Connecting", and done rows turn ink.
  - Progress is real. The timetable's twenty tiles fill with bytes downloaded. The other rows show their status only, never fake progress.
  - *Built 2026-10-06:* hosting compresses the download, so its length can't measure the bytes the browser decodes, and the tiles never showed in production. The build records the timetable's decoded size and the tiles fill against it. Where no size is known the row counts megabytes instead, with no tiles.
  - The base map shows first, because Google loads it on its own. The lines and stations set onto it once the timetable is in.
  - The clock tile stays blank ("--:--") until the server answers, because only the server knows the time.
  - After 8 seconds, the server row says "Still connecting. The server can take a few seconds to wake up." It keeps retrying, and the wainscot offers Try again now.
- **Every error is a plaque that says three things:** what happened, what's safe, and what to do.
  - The header is ink with a terra cotta square. The "safe" line is marked with the locked-spot glyph. The action is ink, and details for bug reports sit in small monospace at the bottom.
  - **Can't reach the server:** "You're online, but the server isn't answering." The safe line is "Today's daily hasn't started, and it'll be the same round when you get in." It retries with growing waits, shown as tiles: "Trying again in 6 s · try 3".
  - **Connection lost mid-round:** the round pauses on the server. The clock tile reads "Paused", trains stop, and the panel dims under an ink express band, "Connection lost · reconnecting · Try 2 of 5". Built 2026-10-06 on the session token (Disconnects). *Solo today:* the clock runs on and trains keep moving, and the band says "The clock keeps running, and the server keeps your round for 3 minutes."
  - **The other player dropped:** the clock pauses for both players. The 3-minute grace period is an 18-tile timer, one tile per 10 s, and the panel says what happens when it runs out: "If they don't come back in time, you win the round."
  - **The map didn't load:** the map pane becomes a plain tile field with the plaque. The round carries on, because the departure boards and questions don't need the map. The "Following you" caption reads "No map".
  - **Street View didn't load:** the pane keeps its place, with a dark tile field and Try again. The walk still counted. If it keeps failing, the round falls back to the map-pin endgame, which isn't designed yet. *Solo today (2026-11-21): a seeker's plaque offers "End at the station", which switches the round to station-only on the free map (Phase 3, Fallback).*
  - **Something in the page breaks** (a thrown error, such as Google's script failing inside Street View). *Built 2026-10-06:* Street View and the map each catch their own and show the plaques above, with Try again and Reload the map, and the round carries on. Anything else shows a whole-page plaque, "This page stopped working", whose safe line says the round is kept on the server, with Reload.
- **Under the clock is nothing** here too (Interaction): the mocks' "clock starts soon" and "at 10:36" are left out. The blank tile and "Paused" say it.
- **Proposed 2026-10-06, from building the states** (for Charlie's review; built this way meanwhile):
  - **Five tries run out mid-round:** the band gives way to the can't-reach plaque. Its safe line says how long the round is kept ("Your round is kept on the server until 15:22:36. Its clock keeps running."), then, once that's passed, "The server kept your round for 3 minutes. When you get in, a new one starts." It keeps trying every 10 s.
  - **Open in another tab:** "Playing in another tab · This round was opened in another tab or window", safe line "Nothing is lost. The round carries on there.", and Play here. The tab doesn't reconnect on its own, so two tabs never fight over the round, and its clock tile is blank, since the round's clock runs in the other tab.
  - **The round wasn't kept** (away more than 3 min, or the server restarted): the fresh round opens with the notice "Your last round wasn't kept, so this one starts fresh."
  - **The timetable didn't load:** "The timetable didn't load · The game's data didn't finish downloading.", safe line "Nothing is lost. Your round hasn't started yet.", and Try again.
  - **Offline:** the can't-reach plaque says "This device is offline. The game picks up again when it's back." instead of "You're online, but…".
- **Refused actions** stay the light notice row with a terra cotta square. They say what to do ("You can ask Radar again at 10:51") and never say "error".
- **Page not found** uses the homepage's look: a "NOT IN SERVICE" tablet, one line of explanation, and two ways back, Play today's daily and Home. *Built 2026-10-07 for any path but `/`, `/play` and the dev `/sheet`: "There's no page at this address."*

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
| **Search area / Your zone** | seeker on foot; hider walking | On reaching the street the circle draws out from its center (ring, 400 ms). Then the outside blurs and takes its glaze veil (600 ms, decelerate). Going back down reverses it. The hider's blur clears when they're locked in or frozen. | circle and blur appear at once |
| **Ask → answer** | seeker; the hider watches it live | The question unrolls as an express band in its family color (band), from its top edge rather than sliding in (rule 5). The answer word sets (set). The boundary draws and stations clear (Elimination). The candidate count counts down one per cleared station. The band collapses into its log row's family chip (band). Under 2 s in total. | answer and count appear together |
| **Elimination** | both | **Radar:** the ring grows from where you asked to its radius (400 ms). Then the ruled-out side clears starting at the ring: inward for No, outward for Yes. **Thermometer:** the line halfway between your last reading and this one draws out from its midpoint (300 ms). The colder side clears away from the line. **Route, borough, express, more routes:** no geometry, so stations clear outward from where you asked. **Matching a landmark:** the cell edges draw out from your landmark's plaque (400 ms), then the stations on the ruled-out side clear. **Measuring a landmark:** the rings grow from each plaque to your distance (400 ms), then the inside or outside clears. **Tentacles:** a line reaches out to each landmark in range (300 ms each, staggered 60 ms). On the answer the others retract (depart), the named cell outlines, and the stations outside it clear. **On foot:** the street ring or halfway line draws, then search tiles lift from the ruled-out side, staggered by distance. Each station's square lifts from ink to outline (160 ms). The stagger is by distance, spread 600–900 ms by count. Boundaries stay on the map, faint. | all clear at once; boundary drawn |
| **Clock and cooldown** | seeker | The clock's minutes flip (step) once per game minute, every 10 s real. The 5-min cooldown shows as 5 tiles, one per game minute, lifting right to left. At zero the question chips step to ready. | digits change; tiles vanish |
| **Timers** (photo answer, veto window) | hider | A row of tiles, one per unit shown in its label, lifting as time runs out. The last tile turns terra cotta. | tiles vanish |
| **Seeker is in your zone** | hider only | A terra cotta express band with ink trim unrolls down from the top edge of the map (band), mirroring the seeker's catch prompt on Street View. It doesn't enter from off-screen (rule 5), and nothing bounces. The panel's distance counts down along the streets as the seeker walks. The seeker's screen does nothing (rule 2). | band appears |
| **Frozen / locked in** | hider only | "Set in grout": four grout bars close around your dot (300 ms), and the dot sets as a square tile, your spot. The Hide here button presses in. The lock row's dashed glyph sets solid and reads "Locked in · E 15 St, near Irving Pl" (or "Frozen"). The map then widens over the Street View pane (band). | frame appears |
| **Card draw** | hider only | After an answer, N face-down cards rise 24 px into place (band, staggered 120 ms). They flip about their centers (rotateY 350 ms, decelerate, faces swap at 90°). The card you pick lifts 8 px. The rest drop (band), and the kept card shrinks into its hand slot (400 ms). Photo (draw 1, keep 1) skips the choice. | cards appear face up |
| **Curse lands** | seeker; the hider sees it played | The card rises 24 px into place at center (band), holds 1.6 s, then shrinks into a status chip with a tile timer (400 ms). Then the effect: **Signal loss:** glazed tiles set across the map in a diagonal sweep (900 ms), leaving the departure boards, and lift in reverse when it ends. **Fog:** Street View blur ramps in over 600 ms. It decelerates, and ramps back out the same way when the curse ends. **Sidewalk shed:** the walking band is hatched like scaffold planks and fills at half speed while it lasts (timetable truth: slower walking is drawn slower). Glazed tiles sit on a grout bed, so nothing of the map shows between them. **Local only, Wrong way:** the affected departure rows dim and strike through. **Signal problems:** the held train's dot simply stops at the platform with a "Held" caption. By rule 1 it stops; it doesn't slow down. | effect applies at once |
| **Photo arrives** | seeker | The violet band unrolls (band). The photo sets into its plaque from the top edge down (set, 600 ms), like daylight in Up to the street. On foot it then shrinks into the "Looking for" row (400 ms). | photo appears |
| **Loading** | everyone | The timetable's tiles set as bytes arrive. Rows step to ink as they finish (step). The lines and stations crossfade onto the map once the timetable is in. | rows update |
| **Connection lost and back** | both | The clock tile steps to "Paused", and trains stop where they are, because the clock has stopped (rule 1). The ink band unrolls (band). On reconnect the band collapses and the screen jumps to the server's state with no catch-up animation. *Solo today: the clock and trains keep going, since a drop doesn't pause the round; only the band shows.* | band appears |
| **Walk a street step** | the walker | The band at the foot of Street View fills tile by tile at walking speed (timetable, linear). The walk tiles dim, then step back to ready on arrival (step). | progress bar fills; no tiles |
| **Someone's here** | the seeker | The catch prompt unrolls from the top of Street View as an express band (band). The hider's gold marker sets (set). | prompt and marker appear |
| **Found** | both | The hider's spot sets gold. A "Found 11:52" tablet sets tile by tile, left to right (set, 900 ms). | tablet appears |
| **Score tally** | both | The score is drawn as a bar of tiles, one tile per 5 game-min. Ink for elapsed time, the question's family color for each question bonus (+10 min = 2 tiles), gold for time-bonus cards held. Tiles set left to right at 40 ms each while the total counts up. Both rounds' bars stack, and the winner's gets an express trim. The bar shows where the score came from, not just the number. | bars appear full |
| **Replay (S2)** | both | Game time is compressed uniformly. That is linear, never eased, per rule 1. Dots travel their real routes and leave trails of square tesserae: ink for you, terra cotta for the other player. Where both rode the same tracks, the trails run side by side. Each question sets as a family-colored square at its origin with its answer, and questions asked from one place stack. At the end, the hider's station tablet sets and the zone ring draws. | trails drawn in full; scrubber only |

**Demo:** every row above plays in the [Subway Seek Deck](https://claude.ai/artifact/FtuLTd6LC7PfkBjNewoY8W) page, part two (private link). Each row has a timeline labeled with its tokens, slow-motion playback, and its reduced-motion version. Building it produced the refinements now written into the rows for Arrive, Up to the street, Ask, Seeker is in your zone, Card draw and Curse lands.

**Implementation notes**

- **Eliminations on the map** fit the deck.gl scene as it stands. The round data stores each cleared station's clear time (answer time + its stagger delay). Color and size accessors read progress from the clock, and an `updateTriggers` frame counter runs only while a clearance is in flight (up to 2 s), so accessors don't re-run every frame forever.
- **Growing boundaries:** rebuild the radar ring at the animated radius each frame for its 400 ms (65 points). The thermometer line is the perpendicular bisector of the two readings, clipped to the view.
- **The blur outside the circle:** an `OverlayView` in a map pane below deck.gl's canvas. It uses `backdrop-filter: blur(3px)` with a circular `mask-image` hole, recomputed when the camera moves, so the game's own layers stay sharp. Fallback: a glaze polygon with a circular hole, which veils without blurring. *Built: on Google in the map pane (deck.gl's canvas is in the overlay layer above it), on MapLibre in the canvas container (deck.gl's is in the control container).*
- **Square station marks:** deck.gl's `ScatterplotLayer` only draws circles. Draw squares as a polygon layer of per-station squares in meters, which keeps today's meter-based sizes, or as an `IconLayer` if they should hold a fixed pixel size. *Built as an `IconLayer` from a canvas atlas: an outline square under every station and an ink one over the possible ones, whose alpha lifts as an answer clears them. Search tiles and landmark plaques use the same atlas approach.*
- **Name tablets** are rendered once per complex to an image and cached. There are 424 complexes.
- **Reduced motion:** `prefers-reduced-motion` switches each moment to the fallback column. Trains, dots and the clock keep moving, because they are data and slow.
- **Frame cost** (2026-10-06, before phones): the map's layers are kept in parts, and a part is rebuilt only when what it draws has changed; a frame with no change doesn't touch deck.gl. Standing still that's the trains' ten updates a second; riding, your dot's every frame. Each layer's data keeps its reference while its inputs do, so it isn't uploaded again. A clearing is dropped once it has played (the search tiles' had run every frame for the rest of the round), and the top of the page re-renders when Street View or Signal loss come and go, not with the clock.
- *Built 2026-10-06 (UI build step 6, the audit):* every row above is wired to the tokens, and only transform and opacity animate. Notes from building it:
  - **Only what arrives while you watch moves.** A card landing, a photo's reveal, the Found tablet and the tally play when they happen in front of you; after a refresh they're simply there, like the elimination.
  - **Curse lands** follows the Deck's timeline: the card rises at the screen's center, holds 1.6 s, then shrinks to its chip's corner at the chip's height. The chip holds its place, empty, until the card is in it, and carries the card's emblem. Signal loss and Fog start once it's in. Wrong way and Tourist strike their board rows at once, because the boards show what the server will accept. Two plays close together queue (rule 7). Signal loss reads "Map hidden · Departure boards still work", as in the Deck; the minutes are on the chip.
  - Veto and Randomize land the same way and shrink into the question's band (decided 2026-10-06). The catalog only named curses, and the build prompt said "card plays". Open: the landing and the answer band play together rather than queue.
  - **Search area:** the circle draws out (400 ms, decelerate), then the veil fades in (600 ms). Going down, the veil fades out.
  - **Loading:** the lines, stations and trains crossfade in over 400 ms once the timetable is in; boot rows step to ink.
  - **Found:** the gold spot sets over your dot, not under it, because you catch within 25 m. The tablet reads "Found", as on the result in part four, and sets tile by tile over 900 ms on its grout bed. The tally follows at 40 ms a tile, and the hider score counts up in 5-min steps to the exact score.
  - **Photo arrives:** a cover slides off the photo top-down (600 ms) once it has loaded. Not built: the on-foot shrink into the "Looking for" row. The row sets in instead.
  - **Someone's here:** the catch band unrolls after a two-frame hold (33 ms). The daylight plays on reaching the street, not after each walk. Going back down, the dark comes in from the top.
  - **Steps:** cooling chips step to ready (opacity, 160 ms); arming sets the chip; the clock's digits and the wainscot label step; notices set.
- **Sound** is optional and off by default. It covers only the two-note chime on your own departure and a soft tile "tock" when an answer lands. *(Proposed 2026-11-27: all on, with more sounds; Interaction, Sound.)*

**Open questions (motion)**

- [x] **Veto needs a window, and the window must not leak the hand.** Decided 2026-10-06: every station question gets the same 1 game-min (10 s real) answer window, whether or not the hider can use it, and in solo rounds too. The answer goes out when the window ends. The hider screens and the seeker's "Asked" panel are mocked this way. Built 2026-10-06.
- [ ] **Replay pace.** Uniform compression keeps rule 1, but squeezing a 2-hour round into 25 s runs trains at about 290× real-world speed. Check it's readable. If not, use speed steps that are still linear within each step, rather than easing.
- [x] **Does the seeker see the hider's hand size?** No, decided 2026-10-06. It would leak the same way as the veto window. The seeker sees only card plays that affect them. The solo client's "The hider holds N cards · played M" row is gone from both the view the server sends and the panel (2026-10-06).
### Phones

*Built 2026-11-21 (brief W25): the replay on a phone.* Below 860 px a replay with no round behind it (yesterday's daily, or your own kept one) stacks the map (44% of the height) over the panel. The bar drops Close, since the foot has Home, so the scrubber keeps its phase labels; the foot read "Copy link for a computer" and Home until phones could play (below): yesterday's replay now ends on Play today's daily and Home, and your own on Practice round and Share, as on a computer. `GET /replay/yesterday` plays yesterday's daily with the bot as the seeker, at the station only, once per date; its log, legend and map label say Seeker, not You. `/hardest` was checked at 390 px and needed nothing.

*Built 2026-11-21 (brief W32 asked for a playable phone round; Charlie to review): a round on a phone.* The proposal W25 wrote is the plan, cut to what a keyless round needs:
- **When:** below 860 px wide, except a phone on its side (under 560 px tall and wider than tall), where the computer layout's map beside the panel fits better than a stack. `apps/web/src/layout.ts` decides, with tests. The computer notice and Try anyway are gone.
- **The round ends at the station.** A page opened below 860 px plays station-only rounds on the free map, keys or not: Street View needs the map beside it, Google's terms keep it beside a Google map, and the free map spends no map load. The round line says so ("On a phone, this round ends when you reach the hider's station."). A computer round narrowed mid-way keeps its street search and stacks.
- **Stacked:** the map on top, the panel under it as a sheet at full width. It reads as the panel does: the round line and the clock with ▸ ▸▸ on one strip, the three numbers on one row, the tabs, the board or the questions, and the wainscot at the bottom, under the thumb.
- **Two heights.** Open, the sheet takes 58% of the screen. Folded, it keeps the strip, the numbers, the tabs, the notice row and the wainscot, and the map gets about two thirds. The tab row is the handle: tapping the tab you're on folds or opens the sheet, tapping the other tab opens it there, and a square at the row's right end says which ("Map ▴" open, "Board ▾" folded). The armed question's confirm stays on the wainscot, so a question can be armed, folded to read its shape on the map, and asked.
- **Touch:** chips, tabs, the clock's squares, board rows and Get off are 44 px tall. A tap arms a chip; there's no hover preview, so the first hint says "Tap a question to see what it does." A tap on a station shows its name and route tiles. Printed keys hide on screens without a pointer that hovers. The three sounds stay.
- **Homepage:** a phone gets the same door as a computer, Play today's daily with "or a practice round", and yesterday's replay and the hardest stations as a second row.
- **Phone pass, 2026-11-27 (on branch `fun-round-1`):** the live site and the fun-round features played at 390×844 and 360×740 with touch emulated (touch points, `hover: none`, `pointer: coarse`), and on a phone turned on its side (844×390). What changed:
  - Touch targets are 44 px on any touch screen, not only in the stacked layout: buttons, chips, tabs, the clock's squares, the map's toggles and zoom, the line hexagons on Ask (they were 26×29, about 10 px apart), the replay's rows and play square, and the ending's callouts (`mosaic.css`, `@media (pointer: coarse)`; the map's zoom in `playLayout.css`, since `mosaic.css` sits in a cascade layer that MapLibre's unlayered sheet outranks).
  - On its side, under 500 px tall, the whole panel scrolls and the wainscot stays pinned; the questions had about 60 px.
  - The homepage's You hide row wraps its three buttons and puts the hint under them: at 360 px the hint ran into Play and the page scrolled sideways (live today).
  - On a phone the sound list opens upward from its caret and scrolls; Mute is 44 px wide and the tab row's links sit closer, so Map ▴ stays on one line at 360 px.
  - Left as they are: footer and inline text links (21–24 px), and the question families' headers, which are full-width and only tappable while cooling.
  - **Notch and home indicator, and Add to Home Screen** (same day): `viewport-fit=cover`, so the page runs edge to edge and `env(safe-area-inset-*)` means something. The round pads the status bar at the top and the notch at either side (`.sc-safe-area` on the play page's `main`), the wainscot pads the home indicator, and the homepage pads its top bar, sides and footer. A web app manifest (`public/manifest.webmanifest`: standalone, the glaze background, icons drawn from the favicon at 192 and 512 px plus a maskable one) makes Add to Home Screen open the game as an app. Checked with Chrome's safe-area override at 47/34 px in portrait and 47/47/21 px on its side; a real iPhone still has to confirm it.
- **Not built:** the street endgame on a phone (a full-screen Street View would still need a Google map beside it); a 12× phone clock; keeping a solo round past the 3-minute grace, which covers a lock screen but not a call (Open questions, "A drop pauses the daily").

## Open questions & risks

- [x] **Does a vetoed question still add its bonus?** Yes. The engine adds every asked question's price, vetoed or not, and the hider mocks follow it.
- [x] **Resume a round after a disconnect.** Built 2026-10-06 for solo rounds: a session token and the 3-minute grace period (Disconnects). The clock paused on a drop until the same day's decision below.
- [x] **A drop pauses the daily.** Decided 2026-10-06: no. A solo round's clock runs through a drop (Disconnects). Still open: the homepage's "Resume daily #23" only shows within the 3-minute grace; keeping a solo round until midnight would make it more useful.
- [x] **Google Maps base map (decision B) — done 2026-10-05.** The game runs on Google Maps with deck.gl's `GoogleMapsOverlay` (non-interleaved) and a quiet JSON style (no POIs or Google transit icons). MapLibre remains a fallback (`VITE_MAP_PROVIDER=maplibre`, or no key) to save map loads in dev. Billing, a $10/month budget alert and daily quota caps are set on `stand-clear-nyc`. Still to do before anything public: a cloud map style + map ID (design agent), Google attribution/terms links in our own terms, and switching the throwaway Street View spike's MapLibre minimap to Google.
- [ ] **Sign Street View Static URLs.** The browser key's localhost referrer restriction is enforced against a wrong referrer (403), but requests with *no* referrer are served, so the key alone could fetch images. Today the 300/day cap bounds it. Fix: a URL signing secret on `stand-clear-nyc`, the server signs each photo URL, and the unsigned quota drops to 0.
- [ ] **Outside-tab research.** The seeker can open Google Maps elsewhere. That's acceptable as long as the **catch requires being near the hider in-game**: outside research only helps deduction, and the show's seekers do exactly that on their phones.
- [ ] **Station-photo framing.** The hider picks any exit and aims; they can choose the least recognisable view. Accepted for v1; playtest whether it needs a rule.
- [ ] **Balance knobs:** hiding time, zone radius, question costs, cooldown, catch distance, clock speed. Set the first prices from the M2 simulation.
- [ ] **Naming / IP:** don't use "Jet Lag" or MTA logos. Attribute OSM and MTA data.
- [ ] **Can seekers split up?** Only matters for 1v2+. Strong in the endgame — maybe require them to ask questions together.
- [ ] **Playtesters** — Charlie is sorting this out.
- [ ] **Seeker levels when the round ends at the station** (2026-11-21). The bot's Easy, Normal and Hard differ only in when the street sweep starts, so in a station-only round they play the same (`pnpm sim:hide -- --station-only`: 52 of 52 caught at each level). A level that means something without Street View would need another knob, such as the minimum information a question must carry.

## Parking lot

- **Overtime round** for ties: e.g. one more round each with a 10-min hide and a 30-min seeking limit.
- **Accessibility:** deferred, past a baseline. *Baseline 2026-10-06:* the answer window's countdown is hidden from screen readers, which hear the question and then its answer rather than every second; departure-board rows show a glaze focus ring on the black board; the photo lightbox holds focus until it closes and owns the keyboard while it's open. Later candidates:
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
- **From the UX pass** (`docs/ux-pass.md`, Outside input): a streak repair once a month when results live on a server; a playable archive of past dailies; a result rank in the subway's words (Express, Local, Shuttle), minding the card names; express stops marked with a wider rule in the on-train stop list, after the IND bands; the hider's hand and the replay scrubber made good to fidget with.

## Prior art & references

**Closest existing products**
- [Worldboard](https://worldboard.games/) — browser games on real timetables, the closest existing product. Checked 2026-10-06:
  - **Hide & Seek:** out of Early Access since 2026-09-15. Solo vs an AI hider and 1v1 multiplayer, cards and curses, a Street View endgame with freeze on zone entry and a 25 m catch. Games run 1–3 hours. The UI is a generic dashboard with AI-video cutscenes.
  - **Coverage:** Europe and Türkiye, Japan, Taiwan (65k stations, 46 countries). No US or NYC anywhere on the site, changelog or subreddit. Re-check before relying on it.
  - **Traction** is small (Discord ~140, trailer ~36 views, best Reddit post ~165 upvotes).
  - Also **Tag** (same-train / same-station tags, roles swap on every tag, clock up to 80×), **GeoRace** (async tournaments on frozen timetables; the Japanorama tournament had 82 entrants) and Wanderlusters.
  - Play it before building more. What it proves: the format works online. What it leaves open: NYC, short matches, a daily, and craft (see the Pitch).
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
| 2026-11-27 | *Proposed, on branch `playable-1`:* one next-move line under the tabs, there all round, says what to do now and outlines the control it means, from the seeker's view and the timetable only (`nextMove.ts`). It replaces the three onboarding hints; "What counts" stays at the street | Charlie found the live game hard to play. Two cold plays by a fresh tester (`docs/ux-first-play-2026-11-27.md`) stalled at the same places: after choosing a question, after an answer, and at every wrong station. Reverses "No tutorial" (2026-10-06) |
| 2026-11-27 | *Proposed, on `playable-1`:* in practice rounds, a good next question (the thrifty bot's pick, from the candidates alone) is offered with a button that chooses it; not on the daily | The testers couldn't judge a question before paying for it. Nothing is counted, but the choice is made for you, so it bends "No outcome counts" (2026-10-06): Charlie's call, including whether the daily should have it |
| 2026-11-27 | *Proposed, on `playable-1`:* the Ask tab lists questions as sentences grouped by subject, each with what Yes and No keep; family names are small labels; a waiting family dims in place with its time, and nothing collapses after you ask | "Same kind of stop?", "Lines here:", "after the gap" and the collapse after asking were where the testers lost the thread |
| 2026-11-27 | *Proposed, on `playable-1`:* Not here. In a round that ends at the station, standing 30 game-seconds in a station that could be theirs, with the round going on, marks it not theirs in the count, the map and the next move. Kept in this browser; the engine's candidates are unchanged | Both testers' "the one change that would have helped most". It's what the round going on already tells the seeker, so it reveals nothing about the hider |
| 2026-11-27 | *Proposed, on `playable-1`:* a guided first round (four steps on the real screen, skippable, shown once, replayable from How it plays), and a first visit's door is an Easy practice round with the daily beside it | The brief's guided first round. Changes "the homepage has one door: Play today's daily" (2026-10-06) for a browser that hasn't finished a round |
| 2026-11-27 | *Proposed, on `playable-1`:* less at first, plain words. A first round hides the score minutes and the prices and folds away places and the thermometer; the first card is explained once. The numbers read "stations it could be" and "min left to find them"; the voice line says "Watch for the answer" | "2:00 left" read as two minutes, "+10 min to their score" never said whose, a card swapped a question unexplained, and the testers looked for a sound |
| 2026-11-27 | *Proposed, on `playable-1`:* on a phone the sheet opens to 66% (was 58%), the numbers sit beside the clock, and an answered band drops the question it repeats; the clock's skip buttons carry words (Next stop, Your stop, Arrive) and go away when there's nothing to skip to; a round's end opens the sheet at the result under "You found the hider at …"; squares still possible are larger and all named with 12 or fewer left; each card is explained in the seeker's words the first time it lands | The second cold play: the list was a 260 px strip, ▸▸ went unused until pressed by chance, the end was missed under the replay, squares were a few pixels, and cards ("VETOED, twice") came unexplained |
| 2026-11-27 | *Proposed, on `playable-1`:* when an answer lands, the map frames the stations still possible and you, and stops following; a computer also frames a chosen question's ring when it's too big to see at the current zoom (a phone already did); the zoom buttons work while following | Both cold plays couldn't see what an answer did at the map's opening zoom, and − did nothing while following. Bends "a computer's map stays put" |
| 2026-11-27 | *Proposed, on `playable-1`:* the ride advice keeps heading for the same station while it's still possible, and with 12 or fewer left goes to check the nearest; stations whose names repeat carry their lines ("34 St–Penn Station (A C E)") | The second cold play was sent back and forth as the middle of what's left shifted after each answer, and told to "get off at 34 St–Penn Station, for 34 St–Penn Station" |
| 2026-11-27 | *Proposed, on `playable-1`:* on a train with a stop chosen, the strip says where you get off and offers the next stop as the change; with none chosen, it names the last stop | The strip's ink "Get off at 5 Av" read as overriding the stop just chosen, and ▸▸ ran to the end of the line |
| 2026-11-27 | The code is public as a new repo, https://github.com/CharlieNey/subway-seek, from a rewrite of the history; `stand-clear` stays private as the archive (`docs/GO-PUBLIC.md`, 0.6) | Charlie. The history check found no key or secret, but a few strings in older commits that shouldn't be public. GitHub keeps rewritten commits viewable by hash after a force-push, so the rewrite went to a new repo instead of over the old one |
| 2026-11-27 | **Outer boroughs Saturdays**, built on `fun-round-1`: from 2026-12-05, Saturday dailies start from four outer-borough hubs and never hide in Manhattan; seeds salted by the theme; 161 St–Yankee Stadium left out | Charlie: "yes, Outer boroughs, Saturdays only". The simulation (`pnpm sim --theme outerBoroughs`) kept the Normal band at 34–37 stations from four hubs, but only 4 from 161 St, too few for a daily that repeats |
| 2026-11-27 | Friend challenges approved as proposed (smallest version: station only, no cards, optional name, 30 days, 10,000 live), built after the launch posts | Charlie |
| 2026-11-27 | The two-minute daily approved, named **The Shuttle**, built after launch; guesses count as turns; it stays out of the stamp book | Charlie |
| 2026-11-27 | Sound defaults (the rumble and the pulse on by default) stay open until Charlie has heard them | Charlie |
| 2026-11-27 | Match logs older than 90 days are deleted, at boot and daily (`logSweep.ts`). A log's age is the later of its start (its name) and its last write, so a running round is never touched. Built on `fun-round-1`; it deploys with the fun round | Charlie approved it with the friend-challenges proposal: at about 30 KB a round the 1 GB volume holds some 30,000 rounds |
| 2026-11-27 | `viewport-fit=cover` with safe-area padding, and a web app manifest so Add to Home Screen opens the game as an app (Phones, phone pass) | Two of the phone pass's own findings: without `cover` the safe-area padding was zero, and without a manifest a Home Screen icon opened a Safari tab |
| 2026-11-27 | Touch screens get 44 px targets in every layout, a phone on its side scrolls the whole panel, and the homepage's You hide row wraps (Phones, phone pass) | Charlie asked for a phone test as far as a computer can go: the stacked layout already met 44 px, but a phone on its side, the homepage and the Ask tab's line hexagons didn't, and the You hide row broke at 360 px |
| 2026-11-27 | *Proposed, on branch `fun-round-1`:* a station stamp book at `/stamps`, kept in this browser by GTFS complex id: found as seeker, hidden in as hider, with borough and line totals | Fun round 1: a long-term reason to ride somewhere new. Ids rather than dataset indexes so a re-pinned timetable keeps everyone's book |
| 2026-11-27 | *Proposed, on branch `fun-round-1`:* par on every result from the hardest-stations table; a daily percentile against today's other finished dailies from 20 finishers, served as a minute histogram by `GET /daily/scores`; "days running" (played) replaces the homepage's found streak tile, which stays on the result | Fun round 1: reasons to come back without accounts. Par is the same table the bot hides by on an ordinary day, so it's fair (themed Saturdays show none). 20 because a rank among fewer is noise. The histogram carries no station or player |
| 2026-11-27 | *Proposed, on branch `fun-round-1`, reversing 2026-10-06:* six synthesized sounds on by default at a quiet volume, with a one-tap Mute: doors, rumble while riding, answer, card, a pulse as the stations fall, and Someone's here. Silent until the first tap; none on the home page; reduced motion starts the continuous two off | Fun round 1 asked for sound as a reason the game feels alive. It reverses "one sound on" and "no soundtrack", so it waits for Charlie to hear it. Web Audio only, so nothing to license, and no MTA recordings |
| 2026-11-27 | *Proposed, on branch `fun-round-1`:* the ending (Ending): a verdict line, up to three callouts from four detectors (rode through, express past, closest call, turning point), and a 12 s reveal of both routes on the map while the result card keeps the panel. Same for You hide. The share text is unchanged | Fun round 1 (Charlie, via the orchestrator): a station-only round ended flat. Every line comes from the round's own trails and answers, so nothing is invented; the share text stays as it was because a verdict can give the station away |
| 2026-11-27 | In a round that ends at the station, the seeker gets no Up to the street: the wainscot reads "Riding below · the round ends at the station", as the hider's does. A seeker already up when the street turns off is told to go back down, and the street pane says Street View is off instead of the developer hint | Charlie, after the live smoke test: up there was a dead end. Walking needs Google's panoramas (`street.ts`), so every map click said "No street to walk to there", and the pane showed "Unset VITE_MAP_PROVIDER" to players. Going up and down only cost 4 game-min |
| 2026-11-21 | **A round plays on a phone** (Phones): below 860 px, unless the phone is on its side, the map stacks over the panel, which is a sheet with two heights (58% of the screen, or folded to the clock, numbers, tabs, notice and wainscot); the tab row is its handle; 44 px targets; the computer notice and Try anyway go. `layout.ts` decides, with tests | Brief W32 asked for a playable phone round; most launch traffic will be phones. Built from W25's proposal, cut to what a keyless round needs; Charlie to review |
| 2026-11-21 | A page opened below 860 px plays station-only rounds on the free map, keys or not (`streetMode.ts`, reason `phone`) | Street View needs the map beside it, Google's terms keep it beside a Google map, and the free map spends no map load |
| 2026-11-21 | On a phone the map opens at zoom 12.6, not 13.5, and arming a radar or nearest question frames its ring; a computer's map is unchanged | The phone's map is a third as wide: at the computer's zoom the 2-mile ring was off screen when armed |
| 2026-11-21 | Touch screens get no hover preview, and printed keys hide where nothing hovers | A tap fires the mouse's enter and focus, so the preview stuck on after a tap |
| 2026-11-21 | First run (brief W32): from Travel the first hint reads "Open Ask and hover a question to start." ("tap" on touch); in station-only rounds the third reads "Three left. Ride to each in turn." and Up to the street is the white alternative on a platform; the homepage's lede and How it plays' third stop say the round ends at the station when it does; a first visit sees "New here?" with yesterday's 25-second replay on any screen | Read as a stranger: the opening hint pointed at questions the Travel tab doesn't show, the ink Up to the street read as the way to win a round that ends below, and a keyless homepage promised a street search |
| 2026-11-21 | The game's new name is **Subway Seek**, applied with `pnpm rename "Subway Seek"` <!-- keep-name --> | Charlie chose it (1 am, 2026-11-21); another site already uses the old name. "Stand clear of the closing doors" stays where it is the announcement <!-- keep-name --> |
| 2026-11-21 | The name lives in `apps/web/src/brand.json` (`name`, `slug`, `formerSlugs`); pages read it through `brand.ts` and `%VITE_GAME_NAME%`; `pnpm rename` (`scripts/rename.ts`) rewrites it with the package scope, the Fly app, the docs and the link preview, and prints the steps outside the repo | Brief W25: renaming should be one step. Tested on throwaway copies as "Hidden Stop", then "Step Lively" on top: lint, typecheck and 331 tests passed after each |
| 2026-11-21 | Browser storage keys move to `<slug>:<name>`, with a one-time migration of the four old `standClear.*` keys and any key under a former slug; a key already under the new name wins | Brief W25 ("yes, with a one-time migration"). Nobody loses a streak across a rename |
| 2026-11-21 | The daily seed stays `stand-clear-daily\|` through any rename | Changing it changes every day's station; it's invisible to players |
| 2026-11-21 | The terms page is a Vite page with its fonts bundled from `@fontsource`; it loads nothing from Google | Its own privacy text said so; the old page fetched Google Fonts (w9 review) |
| 2026-11-21 | The WebSocket upgrade checks Origin against `ALLOWED_ORIGINS` (production won't start without it; dev allows local and private-network origins; no Origin header is allowed, the rate limits cover scripts); a refusal is a 401 | w9 review: another site's page could open rounds |
| 2026-11-21 | 40 messages per session in any 10 s; past that the server closes with 4004 and the client waits 10 s | w9 review: no general message limit |
| 2026-11-21 | The session token travels as a second WebSocket subprotocol, `session.<token>`, not in the URL | w9 review: URLs end up in logs |
| 2026-11-21 | Without Street View a round ends at the station (`SoloRound.stationOnly`): at creation when the server has no key or `STREET_ENDGAME=off`, when the client asks (`street=off`), or mid-round by `streetOff` when Google refuses. No spot, no photos, no Tourist or Fog | Proposal 1; the market research names the Google quota as the launch-day risk |
| 2026-11-21 | You hide without Google: the hider freezes at their station (option a) and the seeker finds them by standing in it; switching is allowed only while still underground | Proposal 1's simplest option; no exit choice to make without panoramas |
| 2026-11-21 | The bot hunts station by station when there's no spot, remembering stations it stood in without the round ending | Without it the bot caught 26 of 52; with it 52 of 52 at each level (`pnpm sim:hide -- --station-only --rounds 52`) |
| 2026-11-21 | The client turns the street off for a keyless or MapLibre build, a refusal remembered until Google's midnight-Pacific reset, a refusal on the page (`gm_authFailure`, Google's error box, the library failing), and replays; the map is rebuilt as MapLibre and photos are hidden | Google's terms: no Street View images beside a non-Google map |
| 2026-11-21 | Replays use the free map on every screen | Saves a billed map load per replay; replays keep no Street View positions |
| 2026-11-21 | Phones get yesterday's daily replayed by the bot (`GET /replay/yesterday`, `/play?replay=yesterday`) and replays stacked below 860 px; rounds keep the computer notice. A playable phone round is a proposal (Phones) | Most launch traffic will be on phones (brief W25); W14 named the 25-second replay |
| 2026-11-21 | Route tiles: hexagons in the route's colour with a Josefin Sans letter, flat for locals and on end for express, in place of the MTA's circle-and-diamond bullets (Look) | Brief W25: the route marks should be clearly the game's own; the MTA licenses its route indicators |
| 2026-11-21 | CI runs on pushes to every branch; a second workflow runs the four simulations when the engine or timetable changes, and keeps their output | w9 review |
| 2026-11-20 | *Proposed:* host the server on one Fly.io machine (`ewr`, 512 MB, 1 GB volume) and the client on Cloudflare Pages; the deploy workflow targets Fly and runs only by hand | The EC2 plan of 2026-10-07 used an AWS account someone else administers, and EC2 was blocked there. Fly is about $4 a month (waived under $5), doesn't cut idle WebSockets and has volumes; Pages has no bandwidth cap. Comparison and sources: `docs/DEPLOY-PLAN.md` |
| 2026-11-20 | Re-pinned to Wednesday 2027-03-03 from the same fall 2026 feed (valid to 2027-05-15) | The 2026-12-02 pin was 12 days out. The weekday schedule is byte-identical, so only the date moved and no balance number can change |
| 2026-11-12 | Easy ranking badges use Matching's deep green trim with glaze text | The 12 px caption had 3.64:1 contrast on the family green; the existing deep green keeps the palette and raises it to 7.03:1 |
| 2026-11-12 | Expose exit-photo capability in the seeker view; disable unavailable exit directions with a reason and guard confirmation | QA found rounds with working spot photos but no exit photo still offered a request the server rejected. Keep the sources independent and human-hide movement private |
| 2026-11-12 | Below 860 px, show a computer notice before starting a round, with a homepage link and quiet Try anyway escape; match the homepage copy | QA found the fixed 380 px board leaves only 13 px of map on a phone. A phone layout is out of scope; reserve 480 px for the map on supported screens |
| 2026-10-08 | S3 built with the approved 4/3/2 crossover retained after pacing checks | Ten paired scenarios per level hit a 10/10 ceiling; expanded 52 per level caught Easy 48, Normal 48, Hard 50. Implements Charlie's instruction to measure before changing mapping or prices. Virtual-clock simulations and live fixtures are labeled separately in match-balance.md; long quiet rides remain a manual playtest question |
| 2026-10-08 | S3 review: stairs are an in-progress exit, exempt from underground catch and 10:35 relocation; zone entry on stairs freezes at the chosen exit upon arrival | Charlie's review; preserve the decided exit travel time and chosen panorama |
| 2026-10-08 | S3 review: neutral zone caption/list markers; H / U / K / V / R on Hide here / Up at Exit / Keep / Veto / Randomize; Notice confirms leaving; homepage Easy / Normal / Hard | Charlie's requested quality pass; reuse printed controls and the built confirmation vocabulary |
| 2026-10-08 | S3 is practice-only, Normal default; seeker crossovers Easy/Normal/Hard = 4/3/2, minBits 0.25 | Charlie approved the starting mapping; Step 6 re-measures with pacing and changes the mapping, not prices, if Hard fails to catch more than Easy |
| 2026-10-08 | Every station question, photos included, has one 60-game-second answer window; on-foot questions stay immediate. Replace the ten-minute human-photo timer. Requested photo direction; Veto closes it; Randomize changes direction within its source, no extra window | Charlie approved the uniform window: timing must not reveal the hand |
| 2026-10-08 | S3 bot actions are at least 3 real seconds apart; Pause throughout; fast-forward only during hiding, capped at 10:20; solo drops keep running, no catch-up burst | Charlie approved watchable pacing; watch riding dead time in Step 6, with event-by-event skip as the possible fix |
| 2026-10-08 | Hider exits open at 10:20; a deadline ride ends at its last-called platform; transfers crossing the deadline are refused. Still at the start ends incomplete. Underground at 10:35: nearest platform exit and freeze. Seeker enters zone while hider underground: immediate station catch | Charlie: a generous latest exit time, and the find-the-station rule when the hider has not left it |
| 2026-10-08 | Mid-walk freeze snaps to the nearer panorama endpoint by time. Failed verification retries once then refuses. Exits outside 400 m are disabled; if all are outside, allow the nearest | Charlie: gameplay spot must remain a Google panorama; never split it from the image location |
| 2026-10-08 | Human draws get a private ten-real-second keep/overflow choice and value-table fallback; explicit curse/redraw payments, one committed answer choice, automatic single-card keep when it fits | Charlie approved; deck, prices and curse limits unchanged |
| 2026-10-08 | For human hiding, candidate street constraints and searched cells start only at the seeker’s first public entry into that candidate circle; earlier evidence keeps only station-level range deductions | Charlie approved the conservative treatment of a moving hider; verify bot-hider simulations unchanged |
| 2026-10-08 | Keep the S3 bot’s perception limits: Fog/Signal loss have no effect, no photo questions; exercise photo screens with fixtures | Charlie: preserve measured behavior and document the M3 gap; never locate a hider through a photo panorama ID |
| 2026-10-08 | Daily seeking record stays separate from hide history. Incomplete hides have no scored result, but retain inspectable replay. Live helper: “Time bonuses count if you’re still holding them” | Charlie approved the result/copy proposal with that helper correction |
| 2026-10-08 | Use docs/design PNGs for Deck parts six, seven and thirteen, with the repository screen text and components; cards.ts wins on current card values | Charlie supplied the references; read before Step 4 |
| 2026-10-09 | Two pages off the homepage, /hardest and /changelog, and the daily number with its start date in the footer | Charlie. The subreddit's read (`docs/community-read.md`): data posts land where app posts don't, and readers check whether a fan project will still exist in six months. The hardness table already existed for the bot; the page is its public face |
| 2026-10-07 | Clicking the hider from farther than 25 m walks you to them; the catch band's line says which click it is ("Click them to walk closer", "Click them to catch") | QA pass: a walk stops at 39.5 m when they come into view, so "Click them to catch" was wrong every time it first showed. The rules stay (seen at 40 m, caught within 25 m by a click while standing). Charlie asked for every QA finding fixed and Claude chose this over changing only the copy; open to review |
| 2026-10-07 | The Rubin Museum of Art is left out of the landmarks (build-landmarks' deny list): 84 museums → 83 | It closed its W 17 St galleries on 2024-10-06, but OpenStreetMap still lists it, and a Matching answer named it as a station's nearest museum |
| 2026-10-07 | The server is hosted on AWS: one EC2 instance in us-east-1 running the Docker image behind Caddy (automatic TLS, WebSockets proxied), the image in ECR, deploys over SSM from a script or the GitHub Action; the client stays on Vercel | Charlie has AWS. One always-on process with a disk is what the server needs, and EC2 is the plain way to get it; Fargate would add a load balancer and move SQLite off a disk. The Fly config is kept as an alternative |
| 2026-10-07 | Live sessions are saved to SQLite on the server's volume on every change and restored at boot with the rest of their grace period, so a deploy or crash doesn't end the rounds in progress | Launch prep: a single process lost every round on deploy. Node's built-in SQLite needs no dependency, and one row per session is the shape two-player rooms will reuse |
| 2026-10-07 | Rate limits: 30 new rounds per address per hour, 40 walks per session per minute, 500 live sessions; refused connections carry a close reason the client shows | Launch prep: each new round costs up to twelve Street View lookups and each walk one, so an unlimited script could exhaust Google's rate limit for everyone |
| 2026-10-07 | S4 decisions: time bonuses 6/4/2 (deck 38 → 31), Wrong way costs 1 card (was 2), Sidewalk shed lasts 20 min (was 10), the bot's hold values Veto 12 → 10 and Wrong way 10 → 6; Tourist, the Veto thresholds, question prices, cooldowns and difficulty bands unchanged | Charlie took every recommendation of the bot-vs-bot run (`docs/match-balance.md`). Wrong way cost the seeker a median 0 min, Sidewalk shed under 2, and the held bonuses were a near-constant 35–42 min of every score. Re-run after: Normal station 38, endgame 38%, score 176; Sidewalk shed now 6 min |
| 2026-10-07 | A hider in sight can be walked to past the 600 m street radius, to within 40 m of them; the hunt's end (stationFoundAt) is dated from coming up when the catch is from a neighbouring station's street; the journey planner can count platform-change time | The S4 sim found a hider seen at 614 m from the station the seeker came up at but "too far to walk", a quarter of catches with no station time, and 0.8 refused boards a round from the optimistic planner. The reachable set stays optimistic |
| 2026-10-07 | Reversed: every round reveals the hider when it ends, an unfound daily included. The replay shows both routes and the station again, and time's up names the station | Charlie. There is no leaderboard or server record yet, so the give-up-and-replay exploit fools only the cheater's own browser and an honor-system share line, while the secret cost every honest player the answer at the moment Wordle shows the word. Revisit when results live on a server: refuse a second daily per recorded result |
| 2026-10-06 | A solo round's clock runs through a dropped connection; two-player rounds will still pause. The dispatcher's two lines wait for two-player rounds | Charlie, from the pre-launch review: the pause is for two-player fairness, and in solo it gave the daily a free pause (close the tab, think, reopen within 3 minutes, repeat). The round is deterministic and the server advances it; a missed stop is the player's cost |
| 2026-10-06 | A daily that ends without a find (gave up or time's up) keeps its station, the hider's route and the spot secret until the next day. Practice rounds reveal everything | Pre-launch review: give up, see the hider, start the daily again, same hider. Of its two fixes, refusing a second daily per session or hiding the station, only hiding holds across browsers and private windows. Time's up is included because fast-forward reaches it in a few clicks |
| 2026-10-06 | The server checks every walk's target against Street View: the panorama it names, within 5 m of the point. The path stays straight-line until the curated zones | Pre-launch review: walkTo took any point within 600 m, so a scripted client could sweep the circle through buildings. The design says the server validates moves, and a metadata lookup is free |
| 2026-10-06 | The server pushes the seeker's view only when it differs from the last one sent | Pre-launch review: the 1 s tick pushed on any change to the round, and reaching the hider's station is one, so the frame's arrival said "right station" though its contents didn't |
| 2026-10-06 | The browser keeps the last daily's trails and station for the homepage's replay, with no coordinate from Google; the old saved view is cleared. The server's match log keeps the spot's panorama ID, not its coordinates | Google's terms forbid caching its coordinates, and the browser had kept the whole finished view, spot and panorama positions included |
| 2026-10-06 | Decided as built: Veto and Randomize land like curses; the replay has no street names; its zone ring draws when the hider settles; the homepage's endgame frame is the dark tile field; a daily's share ends with a link carrying its number and your minutes; a daily opens with "Now boarding" and practice with "Trains are running"; the sound toggles sit behind "Sound" | Charlie took the pre-launch review's recommendations |
| 2026-10-06 | The loading board's timetable tiles fill against its decoded size, recorded at build; with no size known, the row counts megabytes | Pre-launch review: hosting compresses the download, so the tiles never showed in production. It proposed the count-only row, which was already the fallback; the build knows the real size, so the tiles can be real everywhere |
| 2026-10-06 | Pre-launch review, the fixes that change no rule: error boundaries for the page, the map and Street View; a new round recognised by its intent's seq, not the next frame; no game keys under a dialog; a refusal with no seq settles what was in flight; overlays measure Google's credits and keep clear of them; the map rebuilds only the layers that changed; the accessibility baseline (Parking lot) | The review of 2026-10-06, items 3 and 6–9. A duplicate layer id in the replay (the hider's trail and dot) turned up while checking and is fixed too |
| 2026-10-06 | The homepage is at `/` and the game at `/play`; the homepage reads today's public facts from the server's `GET /daily` and never connects | The server starts a round the moment a page connects, so a homepage that connected would start the daily's clock. Links that say which round (`?daily`, `?practice`, `?replay`) keep one door per mode |
| 2026-10-06 | A curse's effect waits for its card to reach its chip; the curses the server enforces (Wrong way, Tourist) strike their board rows at once | The Deck's timeline starts the effect after the landing. The boards show what the server will accept, so they can't lag the rule by 2 s |
| 2026-10-06 | Card landings, the photo reveal, the Found tablet and the tally play only when they happen while you watch; a refresh shows them in place | Same as the elimination. Replaying them on every reload would show an event that isn't happening |
| 2026-10-06 | Countdowns in seconds are real seconds (the answer window, a walk, the stairs); minutes stay game minutes (cooldowns, Back down · 2 min, the clock) | A walk said "22 s" in the panel and "4 s" on Street View. The answer window was already real ("Answer in 6 s" is 10 s at 6×), and seconds are what a player waits through |
| 2026-10-06 | The search area is framed with Google's `moveCamera` at a computed zoom, not `fitBounds` | Following you recenters every frame, which cut Google's animated zoom short: `getZoom()` said 15 while the map still drew 14, so the circle never filled the strip (it hadn't before this build either) |
| 2026-10-06 | Matching draws the city divided by nearest landmark as Voronoi cells (d3-delaunay, ISC, ~10 kB), not a tint on the stations | Charlie. The cells are the question's geometry, which the elimination needs a boundary to draw from, and they read as the answer's region |
| 2026-10-06 | The seeker's panel is rebuilt on the vocabulary, state by state; the screen-level calls the mocks didn't cover are listed under Sidebar › Built 2026-10-06 for review. Station names show the en dash ("Times Sq–42 St"), as on the Deck page; the dataset keeps the MTA's hyphen | UI build step 3. Each call follows an existing rule (the express band is the one thing that matters now, the wainscot is the state's one action) rather than adding a new one |
| 2026-10-06 | The built components set information caps at 12 px / 0.08 em and give chips and white buttons a 2 px rule, where the Deck's sheet draws 10.5 px caps and 1.5 px rules | The small fixes and the vocabulary in Interaction are decided rules and say so; the sheet was drawn before they were applied to it. Key hints stay small, as a hint beside a label |
| 2026-10-06 | Each connection gets a session token in `hello`, kept in `localStorage` and sent back as `?session=` on reconnect. A drop pauses the clock; a reconnect within 3 min resumes the same round and resends the intents the server didn't answer under their old sequence numbers; after 3 min the round is dropped. A second tab takes the round over and the first stops | Every connection started a fresh round, so a refresh or a blip lost the round, and the error screens assumed the server keeps it (Disconnects). A token in the browser survives a refresh without accounts; the sequence numbers already make a resend safe; one tab at a time keeps the clock and the intents in one place |
| 2026-10-06 | The answer window covers every station question, photos included; on-foot questions answer at once. A Veto or Randomize shows when the answer would have landed | The decided rule says every station question, the same set the 5-min gap covers. The street search wants quick questions, and the bot never plays a card on them. A veto shown early would give the card away |
| 2026-10-06 | The seeker doesn't see the hider's Discard 2, draw 3 plays until the round ends; Veto, Randomize and curses stay visible | It told the seeker the hider held two weak cards, and it doesn't act on them: the same leak as the hand size |
| 2026-10-06 | Randomize never swaps to a closed question | A vetoed question is out of the game for the round; swapping to it would answer what the hider refused |
| 2026-10-06 | A question asked mid-walk is asked from where the walk set off, its station and its coordinates both | A walking transfer between complexes took the start's coordinates but the destination's lines |
| 2026-10-06 | Everything measures on one sphere, the questions' great-circle distance. The flat-earth distance used for walking, the zone, the reveal and the search, and the 2–5 m of slack between them, are gone | The two disagreed by up to 0.6% (2.4 m at 400 m), so on-foot answers needed slack to never rule out the hider. North–south walks now take up to 0.6% longer. `pnpm sim:endgame` and `pnpm sim` re-run: unchanged |
| 2026-10-06 | The daily is built once per New York date and shared. Only panorama IDs are kept; each round looks the spot up again by ID. The exit photo has its own seed | Each connection rebuilt it with up to twelve Street View lookups, and the exit depended on how many tries the spot took. Google's terms rule out caching their coordinates (`docs/street-view-spike.md`) |
| 2026-10-06 | The bot hides in a band of station hardness (questions a strong seeker needs: Easy 3–4, Normal 5–6, Hard 7–8 preferring twins), and the daily plays Normal | Charlie: "smart but not too difficult". A uniform pick made 7% of rounds 1–3-question gimmes and 25% 7–8-question slogs; Normal lands every round at the ask-or-go crossover the pricing was built for |
| 2026-10-06 | Veto also fires on a kill shot (a question expected to leave ≤ 10 stations) with more than 30 left; Normal holds Tourist and Wrong way until ≤ 20 stations are left; Easy plays no curses | Charlie approved the proposal. The kill shot was proposed at ≤ 3 and measured never to exist above 30 stations, so it was set at the sharpest cut that does |
| 2026-10-06 | The bot is search and scoring, not a model (Charlie floated TypeSafe's Jev) | The daily must be deterministic and free, the engine pure; a learned scorer can't beat computing the answer over ~100 stations. Scotland Yard's MCTS hider and Absurdle use the same idea |
| 2026-10-06 | Second review of the UX pass: everything still proposed is decided (hero number, nothing under the clock, one door on the homepage, the answer window for bot rounds too, keyboard, "What counts", motion additions, one default sound, the duration ceiling, boundary contrast, the small fixes), and the twelve conductor's lines are written under Voice. The Deck page gets a component sheet (part thirteen) and the closed Veto chip | Charlie: "all yes". The lines were written in one sitting so they sound like one voice |
| 2026-10-06 | The Deck page's mocks were redrawn to the decided Interaction rules: parts four (five sidebar states, including the answer window), seven, nine, ten and eleven. Section headings became rules, tabs lost "Following you" to a map toggle, lamps became dots, boards became the countdown clock, and asking shows an armed chip with its wainscot confirm | Charlie asked for everything affected to be redrawn once the rules were decided |
| 2026-10-06 | UX pass written (`docs/ux-pass.md`); its proposals sit under Look and motion › Interaction, pending Charlie's review | Charlie asked for a deep pass: smooth, intuitive, clean, with personality. The mocks were even and asking had no arming step |
| 2026-10-06 | From the UX pass, decided: one vocabulary of tiles, the caption budget, departure boards drawn like the real countdown clocks, select-see-confirm asking that draws the shape but shows no outcome counts, the seeker's answer-window timer, connections at your stop, the fast-forward control on the clock, and three onboarding hints. The rest of the pass stays proposed | Charlie's review. Outcome counts stay off so the player still reads the map |
| 2026-10-06 | A vetoed question is closed for the rest of the round (same kind and setting, asked from anywhere); the rest of its category stays open | Charlie. Otherwise Veto only delays an answer, the complaint after the show's NYC season; the official expansion rules now do the same |
| 2026-10-06 | The seeker never sees the hider's hand size, only card plays that affect them | Charlie. Hand size would leak the same way as a card-dependent veto window |
| 2026-10-06 | Curated hide-eligible zones stay parked; solo keeps any reachable station with a Street View spot | Charlie. They matter for two-player rounds, which come after the solo track |
| 2026-10-06 | DESIGN.md reconciled with the engine: per-category prices and cooldowns, the 40 m reveal, the detour factor and 600 m walk limit, solo fast-forward, the solo deck, the four-line share. Rules the game enforces are documented in `docs/`; this file keeps the design and the plan | A review found the Rules detail still describing the M2 question set and a 25 m marker |
| 2026-10-06 | The teaser pins Google's logo and attribution at the foot of every map frame | The map captures carry them in a corner the camera pans away, and Google's guidelines for video require them visible |
| 2026-10-06 | Positioning written into the Pitch: not "online Jet Lag", but NYC depth, a 40-minute match, the daily, and craft | Worldboard already ships the generic version for Europe, Japan and Taiwan |
| 2026-10-06 | Tentacles gets a sixth family color, teal `#1F6E6B`. On-foot questions reuse Radar and Thermometer at street scale, under an ink "On foot" caption | Charlie asked for the new question types. A family color stands for the shape its answer draws, and on-foot answers draw the same shapes as Radar and Thermometer |
| 2026-10-06 | Landmarks are small framed plaques with tile pictograms, and the street search area is drawn as tiles on the engine's 8 m grid | Landmarks are places, the IRT's job, and circles and bare squares are taken. The tiles are exactly what the game searches |
| 2026-10-06 | On foot, the newest spot photo stays pinned at the top of the panel as "Looking for" | The photo matters most while walking, so it shouldn't scroll away into the log |
| 2026-10-06 | Errors are plaques that say what happened, what's safe and what to do. A lost connection pauses the round rather than ending it | Charlie asked for loading, connecting and error pages. Pausing matches Disconnects, but needs server support |
| 2026-10-06 | The mocked round was re-planned on the per-category cooldowns. The third opening question is now Tentacles (hospitals), the vetoed question is Radar ½ mi, and the find is at 11:10 | The first version asked two radars ten minutes apart, which the 15-minute radar cooldown forbids. A find at 11:10 matches the endgame simulation |
| 2026-10-05 | Hider screens, the seeker's wait and the replay are designed on one real round (Deck page, parts six to eight). The hider sees each incoming question's true answer and what it would leave, and once locked, the map takes the whole main column | Charlie asked for the hider screens, replay and wait screen. Showing the cost makes a veto a real choice, and a locked hider only needs Street View for photos |
| 2026-10-05 | Your dot and trail are always ink, and the other player's are terra cotta | One rule for both sides. On the hider's screen the threat is terra cotta, which is the color's job |
| 2026-10-05 | Terra cotta buttons only for actions that fix where you are: Hide here and Lock & answer. Card plays stay ink, with their cost beside the button | Designing the hider screens: playing cards is the point of holding them, so they shouldn't read as a warning |
| 2026-10-05 | The seeker's status board reads Changing trains while the hider waits on a platform | A separate "waiting" state would tell the seeker the hider had stopped |
| 2026-10-05 | Route bullets and lines on the design pages use the dataset's colors, the MTA's current GTFS palette | They now match the game's map |
| 2026-10-05 | Sidewalk shed (seeker walks at half speed, 10 min) replaces the Black & white curse | Charlie: Black & white didn't change play. Sidewalk shed costs real time exactly when it matters, in the street search |
| 2026-10-05 | On foot, the map shows a 400 m circle with the outside blurred: the seeker's around their own station, the hider's around their real zone | Charlie. The seeker's circle is never the real zone, which would leak the hider's station |
| 2026-10-05 | No "Stand clear of the closing doors" caption on departure; the tablet simply accelerates away | Charlie, reviewing the motion demo |
| 2026-10-05 | Base map: the "Subway Seek Mosaic" cloud style on vector Map ID `d52ea7715ab571c4cf3a43db`. It's managed through the Map Management API, with the style JSON kept in the repo | Charlie asked for a proper cloud style and Map ID. A raster Map ID was tried first, but Google applies only part of a cloud style on raster maps (verified by render) |
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
| 2026-11-12 | "Tentacles" is called "Nearest" on screen; internal ids (`tentacles`, `tent`) unchanged so replays and the protocol still parse | No Jet Lag names (CLAUDE.md) |
| 2026-11-20 | License: AGPL-3.0-only for the code, CC BY-NC 4.0 for the writing and art, ODbL for the OpenStreetMap-derived landmarks, MTA and data.ny.gov data under their own terms. The README says Claude Code wrote most of the code under Charlie's direction | Charlie: "use whatever license", so `docs/proposals/license.md` was applied as written. AGPL keeps a hosted copy of the engine open; the docs are readable and adaptable but not sellable; the ODbL is required for the landmarks whatever the code uses. Credit for the build is plain: design and decisions are Charlie's, most of the typing was the agent's, and the tests and sims check it |
