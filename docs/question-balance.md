# Question balance

How the questions are priced, and why. Re-run with `pnpm sim` after changing any question
or rule; try other rules without editing the game with
`SIM_RULES='{"radar":{"bonusSeconds":480,"cooldownSeconds":900}}' pnpm sim`.

## The problem (2026-10-05)

With only radar, "does the ___ stop at your station", borough, express and more-lines,
a strong seeker spent **91–94% of its questions on radar and route**. That is the
narrowing fans criticised in Jet Lag's UK season of Hide + Seek (see
`docs/jet-lag-research.md`): the same two questions every round.

## What changed

Questions now come in Jet Lag Japan's six categories, each with its own price (minutes
added to the hider's score) and cooldown, plus a 5-minute gap between any two questions:

| Category | Questions | Price | Cooldown |
|---|---|---|---|
| Matching | Is your nearest park / museum / library / hospital / zoo / airport the same as mine? · same borough? · same kind of stop (express/local)? · does this line stop there? | +10 | 15 min |
| Measuring | Are you closer to a park / museum / … than me? · more lines than mine? | +10 | 15 min |
| Radar | Within ¼, ½, 1, 2 or 5 miles of me? | +10 | 15 min |
| Thermometer | Am I closer than where I started it? | +10 | 10 min |
| Tentacles | Of the museums / libraries (1 mi) or hospitals / big parks (2 mi) near me, which is nearest you? | +20 | 40 min |
| Photos | A Street View view from their exit or their spot | +15 | 15 min |

- **"Does the ___ stop there" only asks about lines that stop where you are**, like the
  show's transit-line question (asked while riding). You have to travel to ask about a line.
- **Express is now relative** ("an express stop, like mine?"), so it reads as matching.
- **Landmarks** (`packages/data/dataset/nyc-landmarks.json`, built by `build-landmarks`):
  60 big parks (NYC Parks, 20+ acres), 83 notable museums, 190 public library branches,
  51 hospitals with an ER, 5 zoos and the aquarium, JFK and LaGuardia. Staten Island and
  anything outside the city is left out. Each landmark is one pin and distances are
  measured to it (the show's "to the map icon" rule). Credit: OpenStreetMap contributors
  (ODbL, shown in the Ask tab) and NYC Parks.

## How the rules were tuned

`pnpm sim` plays every hiding station reachable from all 13 start stations (1,028 games)
with three seekers: **greedy** (most information, ignores price), **thrifty** (most
information per minute of price + time) and **static** (never moves, a pessimistic bound).

| Rules tried | What happened |
|---|---|
| Matching/measuring +5, radar +10 | Thrifty seeker used **no radar** (matching + measuring 83%) |
| Thermometer +5 | Thrifty seeker: thermometer **29–33%** |
| Tentacles cooldown 30 min, slower play (a question every 8–12 min) | Tentacles up to 28% |
| **Final (table above)** | See below |

Final rules, a question every 5 / 8 / 12 game minutes:

- No category above **29%** for either moving seeker at any pace (radar ~24–28%, route ~15%).
- Every category used; thermometer is the least used (~5–6%).
- Pinning the station takes ~5.3–5.5 questions (it was ~7) and earns the hider **~64 min**
  of bonus (it was ~68), so hider scores stay comparable.

The simulation is optimistic about travel (it teleports), so real rounds take longer;
the point is the mix of questions, not the times.

Re-run 2026-10-06, after a vetoed question became closed for the round and every station
answer started waiting out a 1-min window: unchanged (5.4–5.5 questions to pin, ~64 min,
no category above 28%). The simulated seeker faces no cards, and a minute's wait doesn't
change which questions it asks. The veto's new weight is for the S4 bot-vs-bot run.

Re-run 2026-11-21 on the 2027-03-03 timetable (brief W32): thrifty 1,028 of 1,028, mean
5.4 questions (p90 7), ~64 min of bonus; greedy 5.5; static 780 of 1,028. No category
above 28%; thermometer 6%. Unchanged.

Re-run 2026-11-27 (fun round 1, with the themed-day changes on `fun-round-1`): thrifty
1,028 of 1,028, mean 5.4 questions (p90 7), ~64 min; greedy 5.5; static 780 of 1,028.
Unchanged: an ordinary day draws exactly as before (`themes.test.ts`).

## Outer boroughs Saturdays (2026-11-27)

`pnpm sim --theme outerBoroughs`: the Saturday daily starts from a hub outside
Manhattan, and the bot never hides in Manhattan, so the seeker's search space drops it
too (`packages/engine/src/themes.ts`; DESIGN.md, Coming back).

First run, all five outer hubs. 161 St–Yankee Stadium reaches only 25 stations without
Manhattan, and the daily's Normal band (5–6 questions from a strong seeker,
`hardness.ts`) holds just 4 of them, all at 5. A regular would soon know all four, so it
is left out. Final run, the other four hubs:

| Hub | Reachable, themed (ordinary) | Normal band, themed (ordinary) |
|---|---|---|
| Atlantic Av–Barclays Ctr | 53 (74) | 34 stations, 5–6 q, mean 5.6 (25, mean 5.7) |
| Jackson Hts–Roosevelt Av | 41 (53) | 37 stations, mean 5.3 (44, mean 5.5) |
| Jay St–MetroTech | 45 (77) | 34 stations, mean 5.2 (48, mean 5.6) |
| Broadway Junction | 52 (52) | 36 stations, mean 5.4 (36, mean 5.4) |

Every station is pinnable from every hub. Across all reachable stations the moving seekers pin
in 5.0 (greedy) and 4.9 (thrifty) questions, p90 6, ~58–60 min of bonus, against 5.5 and 5.4
on an ordinary day; static pins 152 of 191 games. The mean is lower because the search space
is smaller, but the daily always hides in the Normal band, which holds at 5–6 questions at all
four hubs, so a themed Saturday is about as hard as any other day. Categories stay within
the goal: radar 27–28%, matching 26%, measuring 21–27%, Nearest 18–20%. Broadway Junction
reaches no Manhattan station in 20 minutes, so its Saturday differs only in its seed.
