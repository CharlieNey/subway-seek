# Proposal 1: a public demo that needs no Google keys

*Proposed 2026-11-20, for Charlie's review. **Built 2026-11-21** (brief W25), with option (a) for You hide. It grew one step: the same station-only round is the automatic fallback when Google refuses mid-round or the day's quota is spent, so it isn't only a demo mode. What was built, and why, is in DESIGN.md (Phase 3, Fallback; decision log, 2026-11-21). The bot's station-by-station hunt and its `sim:hide --station-only` result are in `docs/hider-bot.md`.*

## The idea

Deploy the game first with the free MapLibre map and no Street View. The daily, practice and You hide play to the station, so a stranger can follow a link and be riding the subway in ten seconds. Add Google once the demo has players.

## Why it matters most

- **A link beats a repo.** A visitor will click a link; few will clone a monorepo and run two dev servers. Today there is no link at all.
- **It can't run up a bill.** With no Google key, there's nothing a crawler, a Reddit spike or a scripted client can spend. The host is about $4 a month (`docs/DEPLOY-PLAN.md`).
- **It's nearly there.** A keyless local run already plays the daily and practice to the station (checked 2026-11-20). The server now says plainly when a hider can't come up without Street View.

## What it needs

1. **One build flag**, `VITE_STREET=off`, set with `VITE_MAP_PROVIDER=maplibre`. The client then says what's off, once, where it matters:
   - The Ask panel hides the photo family.
   - The result says the round ends at the station: "In this demo the round ends when you reach the station. The full game searches the street in Google Street View."
   - The homepage carries one line under the doors saying the same.
2. **You hide without Street View needs a rule.** Today the hider can't come up and is caught underground when the seeker reaches the station. Two options, for Charlie to choose:
   - **(a)** Freeze the hider at the station at 10:20, so the round is a pure station hunt. No new rule, and nothing to come up to.
   - **(b)** Let the hider come up at an MTA exit (public coordinates) and hide there. This needs a decision on how a spot is chosen without panoramas.
   - (a) is smaller and honest about being a demo.
3. **Copy for the share line** so a demo result doesn't claim a street catch.

## Rule check

- Google's terms don't apply when no Google product is on screen. MapLibre and OpenFreeMap need their attribution, which the map already shows.
- The bot's difficulty bands, prices and the daily are unchanged, since the station hunt is the same game. `pnpm sim` already measures exactly this part.

## Size

About two days: the flag and copy (one), option (a) for You hide with tests (half), and the deploy with a smoke test (half).
