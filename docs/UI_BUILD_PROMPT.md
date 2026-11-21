*What this is: a prompt given to a coding agent (Claude Code) to build the player UI. It is kept as a record of how this was built.*

# Prompt: build the Subway Seek UI

You're building the player-facing UI of Subway Seek, an online hide-and-seek game on the real NYC subway timetable with a Google Street View endgame. The design is finished and decided; your job is to build it faithfully, in the order below, without inventing anything the design doesn't say. Where the design is silent, stop and ask Charlie rather than guess.

## Read first, in this order

1. `CLAUDE.md`: how this repo is worked on, and the don'ts (Google terms, map-load costs, no Jet Lag or MTA marks).
2. `DESIGN.md`, these sections: **Look and motion** (Look: Mosaic; **Interaction**, every rule there is decided; **Voice**; Sidebar; Street endgame; Homepage; Waiting for the hide; Replay; Questions; Photos; Loading, connecting and errors; **Motion**, with its rules, timing tokens, catalog and implementation notes), then **A round**, **Rules detail** and **Starting numbers** for the game itself. Read the **Decision log** rows dated 2026-10-06.
3. The Deck page, a private claude.ai artifact: https://claude.ai/artifact/FtuLTd6LC7PfkBjNewoY8W (private link). Read it with the Artifact tool. **Part thirteen, "The vocabulary", is the component sheet: build the components from it, at the sizes it shows.** Parts four (sidebar, five states), five (street), seven (wait), nine (questions), ten (photos) and eleven (loading and errors) are the screens, redrawn to the Interaction rules. Part two is the motion demo, which plays every catalog row. The artifact's HTML carries the mocks' CSS; borrow measurements from it freely.
4. The homepage, also private: https://claude.ai/artifact/TLySzn31W8WUSPrapZN7dB (private link).
5. `docs/ux-pass.md` for the reasoning behind the rules, if a rule seems odd.
6. The client as it stands: `apps/web/src` (Vite, React 19, Tailwind 4, Zustand, deck.gl over Google Maps with a MapLibre fallback). `Panel.tsx`, `TravelPanel.tsx`, `AskPanel.tsx`, `StreetView.tsx`, `MapView.tsx`, `map/layers.ts`, `HiderCards.tsx`, `ReplayControls.tsx`, `game.ts`, `street.ts`, `searchArea.ts`. It works and is tested; it does not look like the design yet.
7. The engine's view and helpers: `packages/engine/src/solo.ts` (`SoloView`, `AskedQuestion.answerAt`, `askReadyAt`, `footpathOf`), `questions.ts` (`describeQuestion`, `describeAnswer`, `closedQuestions`), `timetable.ts` (`departures`, `departureBoard`), `search.ts` (`possibleSpots`, the 8 m grid), `protocol.ts` (intents, including `skip`, `pause`, `resume`). The engine is pure and tested; the server sends only what the seeker may see.

## What exists in the engine for you

- Per-category prices and cooldowns, the 5-minute gap, `askReadyAt`.
- A question's answer and count stay hidden for one game-minute (`answerAt`); the server pushes the view when it lands.
- A vetoed question is closed for the round (`closedQuestions(asked)`); the server rejects a re-ask with a message.
- `departureBoard`: the next two trains per route and direction, for the countdown board and for "connections at your stop".
- Fast-forward: `skip` to `next` (departure, 30 s before the next stop, your stop, end of walk) or `end`; `pause`/`resume` in practice.
- The street search: `footpath`, `possibleSpots` on the 8 m grid, `spotNearby` within 40 m, `catch` within 25 m.
- Curses on the seeker (`curses`, `cardEvents`), the hider's hand at the end.
- The replay data (`replay.hider`, `replay.seeker`) once the round is over.

Not in the engine yet, and in your scope as step 1: a session that survives a disconnect.

## Build order

Commit after each step with a clear message, keep `pnpm test`, `pnpm typecheck` and `pnpm lint` green, and don't start the next step until the current one renders correctly.

**Step 1. Session and resume (server + client).** Today every WebSocket connection starts a fresh round. Give each round a session token (sent in `hello`, kept in `localStorage`), keep the session for the 3-minute grace period after a drop with the clock paused, and let a reconnect with the token resume the same round and clock. Then the Loading, connecting and errors screens (part eleven) can be built against real states: loading board, connecting, slow to connect, can't reach the server, connection lost mid-round (paused, dimmed controls, the one express band), map didn't load, Street View didn't load. The other-player-dropped state is two-player and out of scope. Add a decision-log row for the token design.

**Step 2. The component vocabulary.** Tokens first: the palette (glaze, glaze-hi, grout, buff, ink, terra cotta, gold, the six family colors with their trims, the base-map colors), Josefin Sans and Libre Franklin, tabular figures, the tile unit, the timing tokens and the three curves from the Motion section. Then one React component per role on the sheet: Caption (black; light only for map legends), Button (ink, white, terra cotta, disabled with reason, small, with a `Kbd`), Tab row, Chip (ready, armed, dimmed, closed), Lamp, Band (local and express, in a family color, with the answer-window tiles), Rule, Notice, CountdownBoard with CountdownRow (normal, hovered with Board, dimmed with reason), ClockTile with fast-forward (▸, ▸▸, disabled, Paused), TileTimer, FamilySquare (and the hollow vetoed one), Wainscot, Kbd, Line (the Voice line, italic), the mosaic NameTablet (port the tile renderer from the Deck page's script, which is self-contained: it sets Josefin capitals as tesserae with grout and a frame), and the photo Plaque. No rounded corners, no shadows, no emoji as icons. Build a component sheet route (dev only) that renders every role in every state, and compare it against part thirteen by screenshot.

**Step 3. The seeker's panel, state by state** (part four, then five, then nine and ten). Platform: top bar with the hero number larger and nothing under the clock, tabs Travel and Ask only, the station's tablet with bullets, the countdown board, the first-round hint in the notice row, the wainscot. Train: route and next stop, the stop list with the express band on your stop, "Connections at …" as a countdown board around your arrival. Ask: "Asking from" and the gap tiles; ready categories as blocks with their price band and chips; cooling categories collapsed to one rule-row with the next time, openable for planning; the route question offering only the lines at your origin; the thermometer saying how far you've moved; **select, see, confirm**: a clicked chip arms (ink), the map draws its shape, a one-sentence hint says what it does, and the wainscot confirms with the price; Esc clears; one armed question at a time, kept across stops; **no outcome counts, ever**. Asked: the question's express band with the ten-tile answer window, then the collapse into the log. Result: the Found tablet, the hider's tablet, the three numbers, the score tally bar, the daily stats line, Watch replay, Share result (with the "Copied" notice), Practice round. Street (part five): the exit as where you are, the On foot block and photo compasses first with the station categories folded, the pinned "Looking for" photo, curse chips with tile timers, Back down in white. Photos (part ten): compasses, waiting band, arriving plaque, enlarged view with Esc and arrow keys, the failed-load and vetoed frames.

**Step 4. The map.** Squares for stations (ink possible, outline ruled out), MTA circles for trains and route bullets. The question shapes, drawn on hover and on arm: the radar ring, the thermometer's halfway line, matching as the city divided by nearest landmark (ask Charlie whether to draw cells or tint stations by nearest landmark; both are allowed, cells need a small Voronoi dependency), measuring rings round every landmark, tentacle lines to each landmark in range, with landmark plaques shown only while choosing or reading. Elimination per the Motion catalog: boundary draws, then stations clear from it, staggered by distance, under 2 s, with the count stepping down. The search area on foot: the 400 m circle round the station you came up at, blur and glaze veil outside, ink tesserae on the 8 m grid inside, clearing tile by tile. "Following you" as a square toggle on the map, bottom right. Legends collapse to one caption line once read. Google's logo and attribution stay visible everywhere.

**Step 5. Street View overlays.** "Facing N" caption, walk tiles per street, the walking band filling at walking speed (hatched at half speed under Sidewalk shed), the catch prompt as the one express band with gold trim and the two-frame hold, the gold square marker in place of Google's pin, Fog as a blur ramp, "What counts" as a three-line notice on first arrival. Street View always sits beside the Google map, never the MapLibre fallback.

**Step 6. Motion.** Wire the tokens and curves into every component from step 2 onward; this step is the audit. Every catalog row: Arrive and Depart (the tablet brakes in and accelerates out, the dot never eases), Up to the street, Search area, Ask → answer, Elimination, Clock and cooldown, Timers, Card plays landing, Photo arrives, Loading, Connection lost and back, Walk a step, Someone's here, Found, Score tally, Board, Arm a question, Fast-forward, Copied. Durations under 300 ms in the panel, no ease-in, transform and opacity only, brake and depart as the one exception. `prefers-reduced-motion` switches each row to its fallback column. Nothing animates on hidden information.

**Step 7. Replay** (part eight): restyle the existing replay: the bar over the map, the phase scrubber with question squares (hollow when vetoed), both trails as tesserae, the panel log following the playhead.

**Step 8. Homepage** (the homepage artifact): one door (Play today's daily, practice as a text link), the departures board of modes with "Not in service" rows, the live map on real data, How it plays, Your record from browser history, Yesterday's hider, the phone note, and every state listed in the design notes.

**Step 9. Voice, keyboard, sound.** The twelve lines from the Voice table at their moments, set as `Line`. Keys: 1–5, Enter, Esc, B, Space, Shift+Space, arrows, each printed on its control. One sound, on "Someone's here", on by default; the chime and the tock optional and off.

Out of scope: the hider's screens and the two-player round (M3), curated zones, the tiered result rank, archive and streak repair, accessibility beyond the keyboard.

## Rules that are easy to break

- **Design before build.** If a screen needs something the design doesn't specify, write the proposal into `DESIGN.md` in its terse style, flagged as proposed, and ask. Don't ship your own call on a rule.
- **No outcome counts.** The map draws the shape; it never says "Yes keeps 23". The engine's partition is for the bot and the simulator only.
- **One shape per role.** Tabs, lamps, chips, buttons, captions and rules are different things and must look different. At most two black captions per panel besides the clock. Section headings are rules.
- **Squares are game information, circles are trains.** Never a round pin, never a square bullet.
- **Timetable truth.** Trains, dots, walking and the clock move linearly at the clock's rate. Fast-forward jumps the clock; it never speeds the animation.
- **Nothing animates on hidden information.** The seeker's screen reacts only to seeker-visible events, and never shows the hider's hand size.
- **Google.** Street View only beside the Google map. Keep the logo and attribution visible. Don't recreate the map or panorama in a hot-reload loop: use `VITE_MAP_PROVIDER=maplibre` while working on anything that isn't the map or Street View. Never cache Google's coordinates.
- **Don't change engine rules** without a decision-log row and Charlie's yes. Numbers in `DESIGN.md › Starting numbers` are the truth.
- **Don't commit** `.env.local` or `apps/server/logs/`.
- **One session in this repo at a time.** If files change under you, stop and ask.

## Verifying

- `pnpm dev:server` and `pnpm dev:web`; the game runs at `http://localhost:5173` against `ws://localhost:8787`.
- Screenshot each screen headlessly (puppeteer-core with the local Chrome works) and compare against the Deck page part by part before calling a step done.
- Unit-test what has logic: the arm state machine, the closed-chip derivation, the countdown board grouping, the answer-window display, the hint sequence, keyboard handling. The engine's tests stay green.
- Play a full daily and a practice round end to end after steps 3, 5 and 9.

## Report back

After each step: what was built, what the screenshot comparison showed, what you had to ask or assume, and anything in the design that didn't survive contact with the code. Put decisions in the decision log and mark progress in the build plan's M7 row.
