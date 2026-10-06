# Endgame balance

The street search once the seeker comes up at a station. Target (DESIGN.md): **a third
to half of the seeking time**. Re-run with `pnpm sim:endgame` after changing any rule here;
try others with `SIM_RULES='{"onFoot":{"bonusSeconds":300,"cooldownSeconds":180}}'`
or `--reveal 30`.

## Rules (2026-10-05)

- **Search area:** the map frames the 400 m circle around the station *you* came up at
  (never the hider's real zone) and shades where the hider could still be. A cell drops out
  when it:
  - is outside every still-possible station's zone,
  - disagrees with an on-foot answer, or
  - is within sight of anywhere you've walked or stood.
- **You see them as you pass.** A walk that comes within 40 m of the hider stops there and
  shows their marker. So clicking the map to cross the zone is a real way to search, and
  everywhere you walk counts as searched. Walking *away* from a marker you can already see
  doesn't stop you. You still catch within 25 m.
- **On-foot questions**, about the hider's exact spot, asked standing on the street:
  - **Street radar:** is your spot within 50 / 100 / 200 m of me?
  - **Walking hotter/colder:** start it (free), walk at least 30 m, ask "am I closer?".
  - Each costs **+3 min**, with a **5-minute cooldown**. They skip the 5-minute gap between
    station questions, since the street search wants quick questions.
  - **Range:** from more than 600 m away, every one answers **"Not near you"**. That rules
    out stations within 200 m of you, and any other answer rules out stations more than
    1 km away (the spot is within 400 m of its station). So they can't be fired across the
    city to find the station.

## Tuning (`pnpm sim:endgame`)

The simulation plays 480 endgames: 120 stations a hider can reach from the 13 start
stations, with 4 random spots each, 60–360 m from the station as the server picks them.
The seeker comes up at a random exit and walks in 10 m steps toward the nearest place the
hider could still be. The "asker" asks whenever a question's expected search time saved
beats its price. Walking is straight-line at the game's pace (it's optimistic: real
streets go around blocks), and spot photos aren't modelled.

| Rules | Median endgame | Share of seeking¹ | Questions | Notes |
|---|---|---|---|---|
| No questions (just sweep) | 56 game-min (p90 120) | 65–69% | – | a slog: the problem |
| +3 min / 3 min cooldown, with a compass² | 12 | 29–32% | 3.4 | compass 61% of questions |
| +3 / 5, with a compass | 16 | 35–39% | 3.0 | compass 55% |
| +3 / 3, no compass | 14.5 | 33–37% | 4.0 | |
| **+3 / 5, no compass (chosen)** | **17–18 (p25 11, p90 27)** | **37–41%** | **3.3** | radar 64%, hotter/colder 36%; hider +10 min |
| +5 / 5, no compass | 18 | 38–42% | 3.0 | hider +15 min |

¹ With the station found in 25–30 game-min, as in real rounds so far.
² "Is your spot north or south of me? / east or west?" It halves the area for free every
time, so it crowded out the walking thermometer. Dropped.

Re-run 2026-10-06, after every distance moved to the questions' great-circle metric (the
walking distance had been flat-earth, up to 0.6% off): unchanged. Walker 56.8 game-min,
asker 17.9 (p25 11.2, p90 27.3), 3.3 questions (radar 64%), 37–42% of seeking.

A real player sweeps less efficiently than the simulation, so real endgames should run
longer than 17 min, toward the top of the third-to-half target. If they run past half,
the levers are, in order: the on-foot cooldown, the reveal distance (40 m), and the price.
