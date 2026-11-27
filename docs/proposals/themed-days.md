# Proposal: themed days

*Proposed 2026-11-27 (fun round 1), for Charlie to decide. Nothing here is built. Themes change the daily's seed inputs and its difficulty, so each one needs its own `pnpm sim` and `pnpm sim:hide` run, and the numbers written into `docs/question-balance.md`, before it ships (CLAUDE.md: simulate before pricing).*

## The idea

One day a week the daily carries a theme: the same game, one rule bent. It gives a regular a reason to come back on that day, and gives the share line something to talk about ("Subway Seek #61 · Rush hour"). Every theme has to work on the one pinned service day (Wednesday 2027-03-03), with no new data.

**What the timetable allows.** The dataset holds every trip of the service day, 00:00 to 28:03 (4:03 the next morning). The 10:00–13:00 play window is used only to classify express stops (`build-dataset.ts`, `EXPRESS_MIN_CALLS`). So other start times need no new data, but "Same kind of stop?" answers by the midday pattern unless the express list is rebuilt for each start time.

## Four themes

| Theme | The bent rule | Search space vs a normal daily | What it needs | Risk |
|---|---|---|---|---|
| **Outer boroughs** | The daily starts from one of the five hubs outside Manhattan (Atlantic Av–Barclays Ctr, Jackson Hts–Roosevelt Av, Broadway Junction, 161 St–Yankee Stadium, Jay St–MetroTech), and the bot hider's station is never in Manhattan. It may ride through Manhattan. | Smaller: Manhattan's stations drop out of the shading. "Same borough?" gets sharper | A hub list for the theme; the bot picks from non-Manhattan stations in its hardness band; the seeker's shading starts without Manhattan. Bot-only (the daily has no human hider), so no new hider rule | Lowest. The hardness table already rates every reachable station |
| **Rush hour** | The hide starts at 08:00 instead of 10:00. | Larger: more trains, short headways, the Z and rush-only express runs. Expect par to rise by about one question | Start time as a round parameter wherever 10:00 or 10:20 is written (the clock, "Exits open at 10:20", the conductor's lines), a hardness table per start, and the express list for 07:00–10:00 | Medium: copy that says 10:00 in many places |
| **One line** ("A 7 day") | The bot hider rides only one line, named in the morning, from a hub on it, and the seeker's shading shows only that line's stations. | Much smaller: 10–20 stations. "Does the 7 stop there?" becomes useless and is hidden. Par falls to 2–4, so the theme picks the line's hardest station (twins first) | Lines with 12+ stations reachable in 20 minutes from a hub on them; a route filter on the bot's moves and on the candidates | Medium: easy if the band isn't pushed up. Sim it per line |
| **Last train** | The hide starts at 00:30, when trains run every 15–20 minutes. | Smaller and slower: fewer stations reachable, and waits dominate | A night express list (nights run local almost everywhere) and a hardness table at 00:30. Waits are already skippable: a solo seeker can fast-forward to the train's departure (DESIGN.md, Time & transit model) | Highest: the round becomes waiting and skipping, which changes how it feels. Try it as a practice option before it's a daily |

Considered and left out:
- **Express stops only.** It just deletes "Same kind of stop?", and the search space barely changes.
- **Two hubs** (hider and seeker start apart). It breaks "both start at the same hub", which keeps the timetable fair.

## How it would run

- **Cadence.** Saturdays only, so the other six dailies stay the game people learned. The homepage names next Saturday's theme from Monday, and the round line says it all day ("Daily #61 · Outer boroughs").
- **Seed.** A themed day draws its hub and station with the theme in the seed (`dailyRandom(\`${date}|theme\`, …)`), so it never changes another day's daily. The daily's number keeps counting.
- **Difficulty.** Each theme keeps the daily's Normal band (5–6 questions) where its search space allows. One line can't reach that, so it says "a short one" on the homepage.
- **Records.** A themed result counts in days running and the found streak like any other. The percentile compares only that day's dailies, so it's fair as it stands.
- **Hidden information.** The theme is public by design, and its rule tells the seeker no more than the shading already shows. The bot's station stays secret until the round ends, as today.

## Smallest version worth shipping

**Outer boroughs** alone, on Saturdays: a hub list and a station filter for the bot, no new copy beyond the round line, and one `pnpm sim` run from the five hubs to set its band. **Rush hour** next, since it adds only a start time. One line and Last train wait for playtests.

## Questions for Charlie

1. Saturdays, or a theme every day of the week?
2. Start with Outer boroughs alone?
3. Should a themed day's share line say the theme? (It makes the post more interesting, and it gives away the rule, which is public anyway.)
