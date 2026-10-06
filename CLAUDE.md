# Stand Clear

Online 1v1 hide and seek on the real NYC subway timetable and Google Street View. A solo hobby project by Charlie; nothing is public yet.

## Read first

- `DESIGN.md` is the design and the build plan: rules, the Mosaic look, motion, screens, open questions, and a decision log. Read the relevant section before changing a rule or a screen.
- `docs/` holds the rules the game already enforces and how they were tuned: `question-balance.md` (categories, prices, cooldowns), `endgame-balance.md` (street search, on-foot questions, the 40 m reveal), `hider-bot.md` (the solo deck and the bot's play), `street-view-spike.md` (Google terms and billing), `jet-lag-research.md` (the show's design, with sources), `ux-pass.md` (the UI/UX review, its sources, and which proposals Charlie accepted).
- UI work follows `DESIGN.md › Look and motion › Interaction`. Its decided rules win over the older screen mocks; its proposed rules need Charlie's review first.
- `README.md` has the commands and env vars.

## How Charlie works

- **Design before build.** For a new system (a rule, a screen, motion), write it into `DESIGN.md` first, in its terse style, grounded in an existing rule or a source, flagged as a proposal, and show it for review. Build only what was asked for. Make a visual artifact only when the visual itself is the deliverable.
- **Simulate before pricing.** A rule change that touches questions or the endgame gets `pnpm sim` or `pnpm sim:endgame` re-run, and the doc in `docs/` updated with the result.
- **Log decisions.** Any rule or design decision gets a dated row in the decision log at the end of `DESIGN.md`, with the why. Mark finished milestones and open questions in the same file.
- **Keep the docs truthful.** When code changes a number the design states, change the design (or note "solo today: …") in the same change.

## Engineering rules (from DESIGN.md)

- `packages/engine` is pure: (state, intent, time) → (new state, events). No sockets or timers. Server, bot, simulations and tests share it.
- Events, not ticks. Clients hold the public timetable plus the shared 6× clock and derive positions; the server sends discrete events.
- One visibility filter. Everything sent to a player passes through the engine's view for that player. The seeker never learns the hider's station or spot except through answers.
- Motion is presentation, never state. Anything that stands for transit time moves linearly at the clock's rate.

## Look

The visual language is **Mosaic** (DESIGN.md, Look and motion): IRT tile for identity, IND color bands for information, squares for game data and circles only for trains, Josefin Sans for captions and Libre Franklin for text, no rounded corners or shadows. Family colors: Radar blue, Thermometer red, Matching green, Measuring ochre, Photo violet, Tentacles teal. Design pages are private claude.ai artifacts linked from `DESIGN.md`.

## Don'ts

- No Jet Lag card text, art or names, and no MTA logos. Mechanics are fair to reuse; attribute MTA, OpenStreetMap and Google data.
- Don't put Street View beside a non-Google map, relay Street View images through the server, or cache Google's returned coordinates (Google terms; see the spike doc).
- Don't recreate the Google map or panorama in a hot-reload loop while developing: loads are billed and the daily quota caps are low. Use `VITE_MAP_PROVIDER=maplibre` when the map isn't what you're working on.
- Don't commit `.env.local` files or the server's `logs/`.

## Commands

`pnpm dev:server` and `pnpm dev:web` run the game; `pnpm test`, `pnpm typecheck`, `pnpm lint` before committing; `pnpm sim` and `pnpm sim:endgame` for balance. Node ≥ 22, pnpm 10.
