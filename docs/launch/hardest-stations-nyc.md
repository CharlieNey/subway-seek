*An angle for an NYC transit community, built around `/hardest`. 2026-11-21. Outline only: Charlie writes the post. Name-agnostic. Figures from `apps/web/src/home/hardness.json` (computed 2026-11-20 on the pinned weekday 2027-03-03), re-counted for this file; community facts from `~/personal_projects/market-research/stand-clear.md` §4.*

# The hardest stations to find: an NYC transit post

## Where

- r/nycrail or a similar transit sub: **confirm it exists and allows a post with a link to your own site** before writing. The market research couldn't read its rules.
- Not r/nyc: an NYC game was removed there under the self-promotion rule after 77 upvotes, and reposts to r/newyorkcity were caught by an automated check (market research §4, Skip for now).
- After the Show HN post and before the Jet Lag post (market research §4, ranking).

## Why it works on a phone

`/hardest` is a table, and it works at 390 px (checked headless 2026-11-21). Yesterday's daily also plays as a replay on a phone (`/play?replay=yesterday`), and a round plays on a phone too, ending at the station (`DESIGN.md`, Phones).

## The angle

A hider leaves a big station at 10:00 on a real weekday timetable, rides for 20 minutes and gets off. A strong seeker asks yes/no and nearest-thing questions. How many questions does each station take to pin down? Every station reachable from 13 hubs, ranked: **1,028 hub-and-station pairs, 295 stations**, mean 5.4 questions.

## The figures (re-counted 2026-11-21)

- **Easiest:** 28 St (6), 2.6 questions on average from the 7 hubs that reach it. 34 St–Herald Sq, 4.4 from 9 hubs.
- **Hardest on average** (reached from 5 or more hubs): Graham Av and Bedford Av (L), 6.8. Bowling Green and Wall St (4/5), 6.6. Canal St (1), 6.4. 116 St (B/C) and 79 St (1), 6.4.
- **The only 8-question finds, 14 of them:** 135 St (2/3) and 81 St–Museum of Natural History (B/C) from Times Sq; Houston St (1) and Spring St (C/E) from Grand Central; Grand St (L), Broad St (J), Rector St (1) and Morgan Av (L) from Union Sq; 15 St–Prospect Park (F/G) and Kingston–Throop Avs (C) from Fulton St; both Canal Sts (1, and A/C/E) from Herald Sq; York St (F) and Lafayette Av (C) from W 4 St.
- **Twins:** 248 of the 1,028 pairs (24%) have at least one "twin", a station that no question asked from the start tells apart from it. Which pairs are twins hasn't been checked by hand, so the post shouldn't name any.
- Reach varies: 102 stations from 14 St–Union Sq, 46 from 161 St–Yankee Stadium.

## Before posting

- Look on `/hardest` at *why* the hardest are hard (the L's long Brooklyn run of similar stops? the Financial District's tight cluster?) and say only what the table shows.
- Say it's a game you made, computer-only for rounds, built with Claude Code, with the rules and the counting method yours.
- Say "not affiliated with the MTA". The route symbols on the site are the game's own hexagons, not the MTA's bullets (`DESIGN.md`, Route tiles).
- The timetable is one pinned weekday, not live service; transit people will check.
