*Facts for a Show HN post, checked against the repo on 2026-11-21. Not a post: HN wants posts written by the person posting, not generated or edited by an LLM (the guidelines as read for the market research, §4), so Charlie writes the post from this sheet. Don't paste from it. Name-agnostic: "the game" and `<site>` stand for whatever it's called on the day. Source: `~/personal_projects/market-research/stand-clear.md` §4, with every figure re-read from the files named.*

# Show HN: the fact sheet

## Rules that apply (news.ycombinator.com/showhn.html)

- It must be playable on the day, with no signup. It is: no accounts at all.
- Link the site, not the repo. Link the repo in the text only if it's public by then.
- Be around to answer for the first three hours. Don't ask anyone to upvote or comment.
- Weekdays noon–2 pm ET, or Sunday morning or evening ET; the differences are small (market research §4).

## Title options

Plain, no "vibe coded", no name needed:

- `Show HN: Hide and seek on the real NYC subway timetable`
- `Show HN: NYC subway hide and seek, balanced by bot-vs-bot simulation`

## What it is (one sentence's worth)

- You seek a bot, or hide from one, on the real weekday subway timetable at 6×.
- The hider rides for 20 minutes from 10:00 and gets off somewhere. The seeker asks questions ("within 2 miles of me?", "does the A stop there?", "is your nearest hospital the same as mine?") that rule stations out.
- With Google keys the seeker then comes up and searches the street in Street View; without them the round ends at the station. **Say which one the live site does on the day** (`docs/GO-PUBLIC.md`, step "Keys or keyless").
- A daily (everyone hunts the same station from the same start), practice at Easy, Normal and Hard, and You hide.
- Phones play too: below 860 px the map stacks over the panel, and a phone round ends at the station, since Street View needs the map beside it. Yesterday's daily also plays as a 25-second replay.

## The data

- `packages/data`: the MTA's GTFS feed and station tables, one pinned weekday (2027-03-03): 424 station complexes, 8,349 trips, 2,047 street exits, in one 5 MB JSON file (about 600 KB compressed). README, How it is built.
- Landmarks for the "nearest" questions: OpenStreetMap and NYC Open Data.

## Hard part 1: balancing with no players

- `pnpm sim` plays every hiding station reachable from 13 start stations in a 20-minute hide: **1,028 games** (`docs/question-balance.md`).
- When every question cost the same (+10 minutes to the hider's score), a strong seeker spent **91–94%** of its questions on radar and "does this line stop at your station" (`question-balance.md`, line 10).
- The set grew to six families with their own prices and cooldowns. Now **no family is above 29%** for a moving seeker at any pace; every family is used (`question-balance.md`, Final rules).
- A strong seeker pins the station in all 1,028 games, mean 5.4 questions. **A seeker that never moves pins only 780**: riding matters (`docs/ARCHITECTURE.md`, section 5).
- Whole rounds, bot against bot, with cards (`pnpm sim:match`, 780 rounds): on Normal the station is found in 98% of rounds, at 39 game-minutes; Easy 100%, Hard 96%. **A veto is worth about 9–10 minutes** to the hider (`docs/match-balance.md`).
- Caveat to say: the question simulation teleports between stations, so its times are optimistic; the question mix is the point.

## Hard part 2: hidden information

- The server holds the round. Everything a player receives passes through one visibility filter (`soloView` / `hiderView`), so the seeker learns the hider's station only through answers.
- An earlier server pushed a frame on any change to the round. A frame arriving with nothing visibly new said "you just reached the right station". Now a frame is pushed only when that player's view changes.
- A property test (`packages/engine/src/visibility.test.ts`) checks every frame of 39 bot-played rounds against the rules (`ARCHITECTURE.md`, One visibility filter).
- The daily's answer comes from a server secret, so the page's code can't reveal it.

## Hard part 3: Google's terms shaped the architecture

- Street View may not share a screen with a non-Google map, may not be relayed through a server, and Google's returned coordinates may not be cached. So the game moved to Google Maps for the street endgame, and the server stores only panorama IDs (`docs/street-view-spike.md`).
- The same rule is why a round without Google keys ends at the station on the free map (MapLibre with OpenFreeMap): no Street View beside a non-Google map.
- Cost is capped by daily quotas, not alerts (`docs/DEPLOY-PLAN.md`, Capping cost). When the day's quota runs out, rounds switch to ending at the station instead of failing.

## How it was built (say it plainly, matching the README)

- Charlie designed the rules, the balance method and the look (`DESIGN.md`, with a dated decision log). Claude Code wrote most of the code under Charlie's direction. The tests and the simulations are the check.
- Strict TypeScript; Biome; Vitest. The engine is pure functions of (state, intent, time), so the server, the bots, the simulations and the tests run the same code.
- Fill in on the day: the test count from `pnpm test` (333 on 2026-11-21).

## What's missing (say it before a commenter does)

- The street endgame on a phone (`DESIGN.md`, Phones).
- Two-player rooms: rounds are against a bot.
- One weekday's timetable, pinned, not live trains.

A question back to readers, for example "which question feels mispriced?"

## Expect in the comments

Timetable nitpicks; "not mobile friendly"; "add my city"; "is this vibe coded"; Street View cost. Answers are in the docs above. Put `/hardest` and `/changelog` in a reply, not the post.
