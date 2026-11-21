# Handoff: brief W25, stopped partway (2026-11-21, about 01:30 New York time)

Brief: `the W25 brief` (seven tasks: the name as one constant plus `pnpm rename`, playable without Google keys, phones, review items, route bullets, launch drafts, verify and write GO-PUBLIC). It was run on the Omen (Linux) and stopped there when the orchestrator moved the work back to the laptop. Branch `showcase/polish`, five commits on top of `a6fc7bd`, plus this file. Nothing pushed, deployed or published.

**Charlie has chosen the new name: "Subway Seek".** The rename script isn't written yet (below). When it is, run `pnpm rename "Subway Seek"`. Its slug would be `subway-seek`: package scope `@subway-seek/…`, storage prefix `subway-seek:`.

## Commits

| Commit | What |
|---|---|
| `22a2625` | The name in one place (`apps/web/src/brand.json`, `brand.ts`); storage keys under the slug with a one-time migration (`storage.ts`); `terms.html` moved to a Vite page with bundled fonts |
| `f34ef92` | Server: Origin check, per-session message limit, session token out of the URL |
| `e361049` | Engine and server: rounds that end at the station (`stationOnly`), the `streetOff` intent, the bot's station-by-station hunt, `sim:hide --station-only` |
| `c0e8b34` | Web: the free map when Google is missing or refuses, and all the station-only copy |
| `2638444` | **WIP** phones: `/replay/yesterday`, replay pages on phones, homepage phone block. Lint, web typecheck and web tests passed. Not yet checked in a browser |

Last full run (at `c0e8b34`): `pnpm lint`, `pnpm typecheck`, `pnpm test` pass, 322 tests in 51 files. The WIP commit adds `replay.test.ts` (passes on its own) and two door tests. The full suite wasn't re-run after the WIP changes.

## Decisions, and why

All decided overnight under the brief. None has a DESIGN.md decision-log row yet; each needs one (see the plan).

1. **Storage keys are renamed, with a one-time migration** (brief: "yes"). All keys are now `<slug>:<name>`. `migrateStorage()` runs at the top of `main.tsx`, before any page reads storage. It moves the four old `standClear.*` keys and any key under a slug listed in `brand.json`'s `formerSlugs`. A key already under the new name wins. `storage.test.ts` covers it, including two renames in a row.
2. **The daily seed stays `stand-clear-daily|`** (brief: keep). Changing it would change every daily's station. The rename script must skip it.
3. **The name lives in `apps/web/src/brand.json`** (`name`, `slug`, `formerSlugs`). Only the web app shows the name. `vite.config.ts` sets `process.env.VITE_GAME_NAME` from it, so `index.html`, `terms.html`, `scripts/og/og.html` and `icon.html` use `%VITE_GAME_NAME%`. The share-text tests read `GAME_NAME`, so they pass under any name. The Maps callback is now a neutral `__gameMapsReady`.
4. **`terms.html` is now a Vite page** (`apps/web/terms.html` and `src/terms.css`, second entry in `build.rollupOptions.input`). Its fonts come from `@fontsource`, so the page loads nothing from Google, as its privacy text says. Its hosting line now names Fly.io and Cloudflare, not AWS and Vercel, and it gains a line on the free map. Docs that say `apps/web/public/terms.html` are stale: DEPLOY-PLAN, DEPLOY, LAUNCH.
5. **Origin check:** `ALLOWED_ORIGINS` (comma-separated). Production refuses to start without it, as with `DAILY_SECRET`. Unset in dev, local and private-network origins are allowed (a phone on the same Wi-Fi, a container). A connection with no Origin header is allowed: that's a script, not a browser, and the rate limits cover it. A refusal is a 401 at the handshake.
6. **Message limit:** 40 messages per session in any 10 s. Past that the server closes with `CLOSE_TOO_MANY_MESSAGES` (4004) before queueing, and the client waits 10 s before reconnecting.
7. **The session token is out of the URL.** It travels as a second WebSocket subprotocol, `session.<token>`, beside `game.v1` (`clientProtocols`, `sessionFromProtocols` in `protocol.ts`). The server no longer reads `?session=`.
8. **Without Google, a round ends at the station** (proposal 1, built). `SoloRound.stationOnly`, set:
   - at creation, when the server has no Street View key or `STREET_ENDGAME=off` is set (the launch-day switch);
   - when the client asks, with `street=off` on connect or `street: false` on `newRound`;
   - mid-round, by the `streetOff` intent, when Google refuses.

   In such a round there's no spot, photos are refused, and Tourist and Fog (which act on the street) can't be played. A seeker who has already reached the hider's station when `streetOff` arrives is found at that moment.
9. **You hide without Google: option (a), the hider freezes at the station.** No exits and no automatic exit at 10:35; the seeker finds the hider by standing in the station. A hider can switch to station-only only while still underground.
10. **The bot hunts station by station when there's no spot.** It remembers candidates it stood in without the round ending, and never starts a street sweep. Without this, the bot caught only 26 of 52; with it and the street curses off, 52 of 52 at each level, median 34.5 game-min (`pnpm sim:hide -- --station-only --rounds 52`). In this mode the three seeker levels play the same, because they differ only in when the street sweep starts. That's an open question for Charlie.
11. **Client fallback** (`apps/web/src/streetMode.ts`). The street endgame is off for:
    - a build with no key, `VITE_STREET=off`, or `VITE_MAP_PROVIDER=maplibre` ("demo");
    - a refusal remembered from earlier today: stored until the next midnight Pacific, when Google's quotas reset ("refusedToday");
    - a refusal on this page ("refused"): `gm_authFailure`, Google's in-map `.gm-err-container` box (seen by a MutationObserver), or the Street View library failing to load;
    - replay pages ("replay").

    When it goes off mid-page, the map is rebuilt as MapLibre and the client sends `streetOff` once. A failing panorama offers "End at the station" (seekers only).

    Copy: a line under the round, the result card, a homepage line under the doors, and the share line ("Found the station in 41 min"). Photo images are hidden on the free map, which Google's terms require.
12. **Replays use the free map**, on every screen. That saves a billed map load per replay, and replays keep no Street View positions anyway.
13. **Phones get yesterday's daily, replayed by the bot.** `GET /replay/yesterday` runs `runSeeker` on yesterday's daily at the station only, caches it per date and serves it with a 10-minute cache. Yesterday's hider is already public on the homepage. `/play?replay=yesterday` opens it. Replay pages open below 860 px with the map stacked over the log (`playLayout.css`, `.sc-play-stack`). Rounds keep the computer notice. Brief W14 and the market research call this "the 25-second replay" for phones.

## Learned the hard way (the Omen)

- **OpenSnitch blocks Node** (`/home/charlie/.nvm/.../node`), even on loopback. curl, Python and dockerd are allowed. pnpm, corepack and the socket tests can't run on the host.
  - Every Node job ran in a `node:22-bookworm-slim` container, with the repo mounted at its host path. The helper script is in the session scratchpad, `dk`; the pnpm store is at `~/.cache/stand-clear-docker/`. Container traffic isn't filtered.
  - On the laptop none of this applies.
  - Cleanup if wanted: `rm -rf ~/.cache/stand-clear-docker`; `docker rmi node:22-bookworm-slim`.
- **pnpm puts its store in `<mount root>/.pnpm-store`** when the home store is on another mount, which meant inside the repo. Fixed with `npm_config_store_dir`; that folder was deleted and never committed.
- **The Tourist curse can't be served without Street View.** A bot told to walk 200 m retries forever. Any rule that needs the street must be checked against station-only rounds.
- **`streetOffSentFor`** in `game.ts` keys on `seekStart`, which is 10:20 in every round. In practice it sends `streetOff` once per page. That's enough, because later rounds are created station-only.

## Half-done, and where

- **Phones (WIP commit `2638444`).** Not yet seen in a browser. Check at 390 px:
  - `/` (the phone block);
  - `/play?replay=yesterday` (stacked layout, the replay bar fitting a 390 px map, the bot-replay header and actions);
  - `/play?replay` (your own replay);
  - `/hardest` (not yet looked at; the brief asks for it at 390 px).
  - Files: `apps/server/src/index.ts` (`yesterdayReplay`, the `/replay/yesterday` route), `apps/web/src/{game.ts,doors.ts,PlayPage.tsx,App.tsx,playLayout.css,ReplayPanel.tsx,streetMode.ts}`, `home/Home.tsx`, `ui/CopyButton.tsx`, `ui/useNarrow.ts`.
- **Browser check of the fallback.** Not done. Play keyless a daily, a practice round and You hide to the end at desktop and 390 px widths. Check the station-only line, the hidden photo family, "Staying below", the result and share text. For a forced refusal, set a bad `VITE_GOOGLE_MAPS_API_KEY` and confirm the map swaps to MapLibre and the round ends at the station.

## Remaining plan, in order

1. **Phones:** finish the browser check above and fix what it shows. Write "what a playable phone round still needs" into DESIGN.md as a proposal: the stacked layout for a live round, touch walking on the map, board and Ask as bottom sheets, no Street View on small screens or a full-screen toggle, and the 40-minute length against phone sessions.
2. **CI** (review item): run `.github/workflows/ci.yml` on pushes to every branch, and add a job that runs `pnpm sim`, `sim:endgame`, `sim:match` and `sim:hide` (time-boxed, or with smaller `--rounds`) and uploads their output.
3. **Route bullets** (`apps/web/src/ui/vocab.tsx` ~line 580, `Bullets`): restyle so they're clearly the game's own and still readable to riders. A suggestion: square tiles (Mosaic's squares-for-data rule), Josefin Sans letters, colour as a band or edge rather than an MTA-style filled circle, and no express diamonds. Update `terms.html`'s "Route colors follow the MTA's published GTFS palette" line. In the docs, note the option of applying for the MTA's free app licence (market research §3.4).
4. **`scripts/rename.ts` and `pnpm rename "<New Name>"`** (root `package.json` script, run with tsx). Inventory: `~/personal_projects/market-research/stand-clear-rename.md` §5. It should:
   - rewrite `brand.json` and push the old slug onto `formerSlugs`;
   - replace `@stand-clear/` with `@<slug>/` in tracked text files, the lockfile included; the root package name; `infra/fly/fly.toml`'s app name and the Fly commands in the docs;
   - replace "Stand Clear" in the docs and README, `favicon.svg`'s title, test temp-dir prefixes and the OSM User-Agent;
   - skip: `stand-clear-daily` (the seed), `stand-clear-nyc` (the Google Cloud project id, which can't be renamed), `infra/aws/**` and the old AWS resource names in DEPLOY-PLAN's "Retire the old setup" (delete those, don't rename), `standclear.io` and other mentions of the other site, the phrase "Stand clear of the closing doors", and lines marked with a keep comment such as `<!-- keep-name -->`;
   - run `pnpm install`;
   - regenerate `og.png`: `node scripts/og/render.mjs` needs `PUPPETEER_FROM` and `CHROME`. Consider `pipe: true` in its `puppeteer.launch` so it needs no socket;
   - print the external steps: `gh repo rename`, the domain, the Cloud project display name, the Map IDs and style names, the three private artifact titles, the Fly app name, and the charlie-site folders listed in §5.

   Test it on two throwaway copies, "Hidden Stop" and "Step Lively" (brief), with lint, typecheck and tests after each. Then run it for real with **"Subway Seek"** if Charlie wants that done now; the brief said not to leave the repo renamed, but the name is now chosen.
5. **Docs** (CLAUDE.md "keep the docs truthful"):
   - **DESIGN.md:** decision-log rows for decisions 1–13 above, dated 2026-11-21; update "Format" (phones) and the "Fallback" line in Phase 3 (station-only).
   - **ARCHITECTURE.md:** the limits line; the token subprotocol; the origin check; station-only rounds; the phone replay; CI.
   - **DEPLOY-PLAN.md:** add `ALLOWED_ORIGINS` (Fly secret or `[env]`) and `STREET_ENDGAME=off` (the launch-day switch) to the env table; fix the terms path; add a keyless first deploy.
   - **README:** keyless play now ends at the station; `VITE_MAP_PROVIDER=maplibre` now also makes rounds station-only.
   - **`docs/hider-bot.md` or `match-balance.md`:** add the `sim:hide --station-only` result.
   - **`docs/proposals/1-demo-without-google.md`:** mark it built, with option (a).
6. **Review items not yet done:** none of the five is left except CI. Origin, rate limit, token and fonts are done.
7. **Launch drafts in `docs/launch/`** (name-agnostic; HN text must be written by Charlie): a Show HN fact sheet, a Jet Lag subreddit data-post outline, and the "hardest stations" post for an NYC transit community. Source: `~/personal_projects/market-research/stand-clear.md` §4, with numbers from `docs/question-balance.md`, `match-balance.md` and `apps/web/src/home/hardness.json`.
8. **Verify:** lint, typecheck, all tests, all four sims (`pnpm sim`, `sim:endgame`, `sim:match`, `sim:hide`, plus `sim:hide --station-only`), and full keyless rounds in a browser at desktop and 390 px widths.
9. **`docs/GO-PUBLIC.md`:** one ordered checklist from "pick the name" (done: Subway Seek) to "it's live", each step with its command or click and how to undo it. The old cloud-account cleanup goes first: the AWS repo secrets and resources, and the Cloud billing owner.
10. **Report:** `the W25 report` (the brief's last step): commits, what was verified and how, what still needs keys or Charlie, and the rename command.

## Stopped

The dev container (`sc-dev`) was removed. No browser was launched, and no other server, container or background job is running from this session. A Python registry relay used briefly at the start was stopped.
