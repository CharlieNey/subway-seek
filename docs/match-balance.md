# Match balance (S4: bot vs bot)

Whole solo rounds played by a bot seeker against the bot hider, on the real timetable with
real travel time, so the deck mix, the curse prices and the bot's thresholds can be set
from data. Re-run with `pnpm sim:match` (about 30 s); try other rules without editing the
game with `SIM_RULES` (question prices, as `pnpm sim`), `SIM_DECK='{"veto":2}'` (deck
counts) and `SIM_COST='{"tourist":1}'` (curse costs), and `--endgame-at 2`, `--rounds`,
`--hub 127`, `--difficulty hard`, `--seed`, `--failures`, `--trace 127:normal:5`.

The numbers below are the first run's measurements, on the deck as it stood (38 cards). The
recommendations at the end were all taken on 2026-10-07; **Decisions and re-run** at the
bottom has the numbers after.

## Method

- **The seeker** (`packages/engine/src/seekerBot.ts`, driven by `runSeeker`) plays through
  `applySoloIntent`, `advanceSolo` and `skipSolo` like the server does, and sees only its
  `SoloView`: by type it can't read the hider's station, spot or hand. Its policy:
  - **Hunt:** ask the thrifty question whenever one is ready (`chooseQuestion`, the policy
    the difficulty bands are measured with; vetoed questions skipped), wait out the 1-min
    answer window before choosing a train, ride toward the candidate nearest their centre
    between answers (`earliestJourney`; re-planned at every answer, also mid-ride).
  - **Endgame, at 3 or fewer stations:** ride to the one reached soonest, come up at the
    exit nearest the candidates, sweep toward the nearest place the hider could still be
    (the same 8 m grid and 39 m sight as the map's shading, reaching the 600 m you may
    walk, so a neighbouring candidate's zone can be swept from here), ask on foot when a
    question's expected saving beats its +3 min (as `pnpm sim:endgame`), and leave a
    station when the expected cost of finishing it first beats going to the others first.
  - **Curses:** Wrong way by boarding the first useful train the required way and getting
    off within three stops; Tourist by going up, walking 210 m and coming back down.
    A refused platform change (the planner is optimistic, like `reachableComplexes`) moves
    the plan's start past the change time.
- **The hider** is the engine's bot, unchanged. The spot is a seeded point 60–360 m from
  its station (no Street View in the sim), so the street is straight-line.
- **Curse cost:** every round with a curse is replayed from the same seed with curses off
  (the round's difficulty set to Easy after the hider is placed, the only thing Easy changes
  at play time); the difference in the seeker's time is the cost. Reported for rounds where
  that was the only curse.
- **Veto worth:** candidates in play when it was asked, less what the true answer would
  have left.
- **Run:** 13 hubs × 20 rounds × Easy/Normal/Hard = 780 rounds, seed 1. A second seed moves
  the medians below by 1–2 game-min and the hider score by up to 10.
- **Optimistic, like the other sims:** straight streets, a perfect sweep, no photos (a bot
  can't read one), the bot never gives up, and Fog and Signal loss cost it nothing (it has
  no screen). A person will be slower, so real rounds run longer than these.

## Headline numbers (game minutes from the start of seeking)

| | Easy | Normal (the daily) | Hard |
|---|---|---|---|
| Found | 99% | 96% | 95% |
| Station found: median (p25–p90) | 26 (17–49) | 38 (27–72) | 50 (38–84) |
| Endgame: median (p25–p90) | 23 (17–35) | 22 (15–35) | 22 (16–35) |
| Endgame share of seeking (median) | 47% | **36%** | 32% |
| Seeking in all: median (p25–p90) | 49 (40–71) | **62 (49–99)** | 72 (61–112) |
| Hider score: median (p25–p90) | 139 (123–183) | **178 (151–235)** | 202 (178–256) |
| of which questions / held cards (mean) | 57 / 35 | 75 / 39 | 86 / 42 |
| Station questions a round | 3.5 | 5.3 | 6.4 |
| On-foot questions a round | 3.8 | 3.8 | 3.9 |
| Wrong stations visited a round | 0.44 | 0.63 | 0.78 |
| Caught from a neighbouring station's street | 25% | 22% | 25% |

Against the targets in DESIGN.md:

- **Round length.** A Normal round is 62 game-min of seeking (10 real min) plus the 3.5-min
  hide: about **14 real minutes, 28 for a match**, under the 40-minute target with room
  for a human seeker being slower than this one. Only 4% of Normal rounds reach the
  2-hour cap; a person will time out more often, so the cap is not too tight.
- **Endgame share** is 36% on Normal (target a third to half), 32% on Hard, 47% on Easy. The
  endgame takes the same ~22 min at every level; the share moves because the hunt does.
- **No category above 30%.** Normal: matching 27%, measuring 29%, radar 20%, tentacles 19%,
  thermometer 6%. Hard: measuring 30%. Easy: tentacles 28% (the first question of nearly
  every round is a Tentacles from the hub) and no thermometer (rounds end before the
  seeker has moved 400 m between readings).
- **Hider scores across difficulties are not comparable:** 139 / 178 / 202. Hard is ~45%
  more than Easy, nearly all of it question bonus (57 → 86) and hunt time (26 → 50). A match
  plays both rounds at one level, so this is fair within a match; it matters only if
  scores are ever compared across levels.

## Cards

Normal, a round: 17.4 cards drawn, 1.58 played: Veto 0.74, Randomize 0.26, Discard 2 draw 3
0.01, Sidewalk shed 0.20, Tourist 0.16, Wrong way 0.13, Fog 0.07, Signal loss 0.02. The
hand is full (6) after two or three answers, and "keep the best" makes the hand at the end
about the six most valuable cards drawn, so **held time bonuses add 35–42 min to every
score** and barely vary: they are a fifth of the hider's score and not a decision.

Curses, as the only curse in the round (Normal / Hard, mean, median in brackets):

| Curse | Played in | Cost to the seeker | Cards paid |
|---|---|---|---|
| Tourist | 16% / 23% of rounds | **8.0 (8.5) / 9.7 (8) min** | 2 |
| Wrong way | 13% / 16% | 6.7 **(0)** / 6.0 **(0.5)** min | 2 |
| Sidewalk shed | 20% / 17% | 1.3 (4) / 1.7 (1.9) min | 1 |
| Fog | 6% / 5% | 0 (no screen) | 1 |
| Signal loss | 2% / 4% | 0 (no screen) | 2 |

Wrong way's cost is bimodal: in half the rounds it costs nothing. On Normal it waits for 20
or fewer candidates, by which time the seeker's next move is usually to come up on the
street, and the curse lapses unused.

Vetoes: 0.74 a round on Normal, each keeping a median 7 stations in play (Easy 4, Hard 8).
Without Veto in the deck (`SIM_DECK='{"veto":0}'`): the station is found in the same
median 38 min, with 4.7 station questions instead of 5.3, and the hider scores 172 instead
of 178; the hand then holds 44 min of bonuses instead of 39. **A veto is worth about 9–10
min of hider score**, mostly as the extra question it forces.

Variants tried:

| Variant | Normal: station / seeking / hider score / timeouts | Notes |
|---|---|---|
| As built (`--endgame-at 3`) | 38 / 62 / 178 / 4% | wrong stations 0.63 a round |
| `--endgame-at 2` (go and look at 2 or fewer) | 38 / 61 / 184 / 2% | 0.6 more questions, wrong stations 0.35; Hard timeouts 5% → 2% |
| `--endgame-at 4` | 38 / 65 / 176 / 6% | wrong stations 0.88 |
| `SIM_COST` Tourist and Wrong way at 1 card | 43 / 67 / 182 / 4% | both played in 2–3× as many rounds; +5 min of seeking, +4 of score |
| `SIM_DECK` 4 Tourist, 4 Wrong way, no Shed or Fog | 38 / 62 / 175 / 3% | played no more often: the bot's conditions bind, not the supply |
| `SIM_DECK` no Veto | 38 / 62 / 172 / 3% | see above |
| `--min-bits 0` (no floor on a question's worth) | identical | the thrifty chooser never picks a question under 0.25 bits anyway |

## Recommendations, ranked

1. **Wrong way: cost 2 → 1 card, or let Normal play it earlier.** Median cost 0; the mean
   6–7 min comes from the minority of rounds where it lands mid-journey. At 1 card the
   bot played it in 28% of Normal rounds and seeking rose 5 min. Alternatively keep the
   price and drop the Normal hold from ≤ 20 candidates to ≤ 40, so it lands while the
   seeker still rides. Either way `CARD_VALUE.wrongWay` 10 → 6 reflects what it does.
2. **Tourist is priced right at 2 cards** (8–10 min, the design's "one card per 5 min"), and
   `CARD_VALUE.tourist` 10 is right.
3. **Sidewalk shed isn't worth a card as it stands.** 1.3–1.7 min measured (its 10 minutes
   usually run out before the seeker is on the street for long), while playing it discards
   a card worth ≥ 5 min. Either lengthen it (20 min, or "until you next ride") or set
   `CARD_VALUE.shed` 6 → 2 so the bot stops keeping it over a time bonus. At 1 card the
   cost can't go lower.
4. **Time bonuses: fewer, or a smaller hand.** They add a near-constant 35–42 min to every
   score (19 of 38 cards; 13–20 draws into a hand of 6). Suggested: 10/6/3 → 6/4/2 (deck
   38 → 31), which keeps the "still holding it when caught" tension but leaves room for
   draws to matter. Check with `SIM_DECK='{"late5":6,"delays10":4,"work15":2}'`.
5. **Veto: keep the thresholds** (30 candidates, kill shot at 10); it plays 0.7–0.8 times a
   round and buys ~9–10 min each. `CARD_VALUE.veto` 12 → 10 matches the measurement; not
   urgent.
6. **Endgame crossover: 3 is right, 2 is safer for the clock.** The design's "with 2–3 left
   it's cheaper to go and look" holds: at 2 the hider gains 6 min of bonus and the seeker
   halves the wrong-station visits and timeouts. Worth a hint in the UI rather than a rule.
7. **Question prices and cooldowns: no change.** The mix stays under 30% at every level.
8. **Difficulty bands: leave them.** If scores are ever ranked across levels, Hard needs a
   scale factor (~0.7) or the bands need rebalancing toward similar scores; within a match
   they're fair.
9. **Fog and Signal loss: no evidence either way** from a bot with no screen. Keep the
   design's reasoning (Signal loss hides the deduction, so 2 cards). Signal loss is played in
   only 2–4% of rounds: its window (≤ 15 candidates, underground, two spare cards) rarely
   opens.

## What the simulation showed in the engine (fixed 2026-10-07, see the end)

- **A catch from a neighbouring station's street leaves `stationFoundAt` null** (22–25% of
  catches: the spot is inside the 400 m zone but the seeker came up one stop over). The
  result card and any "station at X min" stat have nothing to show for those rounds. The
  sim counts the last exit instead.
- **Seen but out of reach.** With the spot 614 m from the station the seeker came up at
  (4 Av–9 St, a neighbour's zone), the marker showed within 40 m but `walkTo` refused
  ("too far to walk"). The seeker now walks to the nearest allowed point and catches from
  within 25 m, or goes round by the hider's station. A rule to consider: a walk toward a
  visible marker could be allowed past the 600 m limit.
- **"Not near you" at a big complex rules little out.** It excludes stations whose centre is
  within 200 m of the asker; at 5 Av–Bryant Pk the exit is 250 m from the complex centre,
  so the station stays a candidate while the map shades only a far sliver. Not a bug; the
  explanation in the UI should say the station is "probably not here" rather than "cleared".
- **The planner's optimism** (`earliestJourney` has no platform-change time) means ~0.8
  `board` intents a round are refused "Not enough time to change platforms" and re-planned.
  Harmless for a bot; anything that suggests routes to players should add `selfTransfer`.
- **Tourist landing on a `board` + `alightAt` pair** (the departure instant) refuses the
  `alightAt` (3 rounds in 260): benign, the engine has already set the stop.
- **Wrong way lapses unused in half its plays** (see Cards), a bot-policy finding more than
  an engine one.

## Decisions and re-run (2026-10-07)

Charlie took every recommendation: time bonuses 10/6/3 → **6/4/2** (deck 38 → 31), Wrong way
**2 → 1 card**, Sidewalk shed **10 → 20 min**, `CARD_VALUE` Veto 12 → 10 and Wrong way
10 → 6. Tourist, the Veto thresholds, Normal's ≤ 20 hold on movement curses, question
prices, cooldowns and the difficulty bands are unchanged. Same 780 rounds, seed 1:

| | Easy | Normal (the daily) | Hard |
|---|---|---|---|
| Found | 100% | 96% | 94% |
| Station found: median (p25–p90) | 26 (17–46) | 38 (29–72) | 49 (38–82) |
| Endgame: median (p25–p90) | 23 (17–36) | 25 (16–38) | 24 (18–37) |
| Endgame share of seeking (median) | 47% | **38%** | 32% |
| Seeking in all: median (p25–p90) | 48 (40–73) | **65 (51–98)** | 74 (60–108) |
| Hider score: median (p25–p90) | 137 (118–178) | **176 (151–241)** | 204 (175–261) |
| of which questions / held cards (mean) | 57 / 31 | 75 / 37 | 88 / 41 |
| Wrong stations visited a round | 0.45 | 0.62 | 0.80 |
| Caught from a neighbouring station's street | 24% | 19% | 20% |

- **Cards (Normal):** Sidewalk shed is now played in 27% of rounds and costs the seeker
  6 min (median 7) as the only curse; Hard 5.6 (median 9.8). Its hold value of 6 now
  matches. Wrong way at 1 card is played in 11% (Hard 13%) and costs 1.6 min (median 4.5;
  Hard mean 8.7). Tourist unchanged at 6.3 (median 8). Held bonuses fell by 2–4 min a
  round; the hand still fills to its best six.
- **Round shape unchanged:** station time, endgame share and the score are within the
  seed-to-seed spread of the first run. The deck change took 4 min off the held bonus and
  the longer shed gave 3 back in the endgame.
- **Refused boards halved** (107 in 260 Normal rounds, from ~0.8 a round) now that the
  seeker's planner counts platform-change time mid-journey; the rest are at the start
  station, which the bot already re-plans.

Engine fixes from the findings above, in the same change: a hider in sight can be walked to
past the 600 m radius (to within 40 m of them); `stationFoundAt` is set at the catch, from
the time the seeker came up, when they never stood in the hider's station (the sim now reads
the neighbour catch from where the seeker stood); `earliestJourney(…, changes = true)`
counts `selfTransfer` mid-journey while `reachableComplexes` stays optimistic; the on-foot
help in the client says what "Not near you" clears. The Tourist `board` + `alightAt`
refusal is left as it is (benign).

## S3 seeker on the clock (2026-10-08)

Charlie approved a starting seeker mapping: Easy goes up at ≤ 4 candidates, Normal at ≤ 3, Hard at ≤ 2; all use 0.25 minimum bits and a 45-game-minute journey horizon. The headline difficulty columns above vary the **bot hider**, not these seeker settings. Step 6 re-measures the mapping with pacing, and changes the mapping, not prices, if Hard does not catch more than Easy.

`SeekerDriver` receives only `SoloView`. Each action is at least 3 real running seconds after the last (18 game-seconds at 6×), including the separate board and alight-selection actions. It respects `waitUntil`, re-plans on public answers/curses, and backs off after refusals. A pause advances neither the game nor this floor. After a restart memory is rebuilt from the view; only the last action time is persisted, so there is no catch-up burst. The full-speed `runSeeker` and existing bot-hider policy remain unchanged.

Both the Step 1 and final `pnpm sim:match` regression runs matched the working-tree baseline on all 780 rounds, including every reported card and outcome metric (excluding runtime). This baseline includes the other session's landmark correction; it differs slightly from the older headline table.

**Known S3 limitations, carried to M3:** Fog and Signal loss cost this bot nothing, and it never asks photos. Human-hider photo screens are exercised by fixtures. The bot never reads a photo's panorama ID as a location. A human seeker in M3 will ask photos and experience the visual curses. Watch dead time while the bot rides in Step 6; event-by-event skipping is the fix if it bores.


## S3 paced human-hide checks (2026-10-08)

`pnpm sim:hide` is a reproducible **automated** playcheck: ten paired scenarios per
seeker level, identical human routes and deck seeds, one-second virtual server ticks
at 6×, the production `SeekerDriver` and its three-real-second action floor. Human
choices go through `applyHiderIntent`; the seeker receives only `SoloView`. There are
no seeking skips in the game. Virtual simulation advances the test clock.

Five human strategies rotate through the hubs: alight early and wait on a platform for
the rest of hiding; stay underground until the latest exit; never lock and keep moving
away from the public seeker position until zone entry freezes you; lock about 320 m
out; lock about 100 m out. Every route starts by boarding an actual departure. Keep
choices time out to the shared value table; the human policy vetoes strong answers,
randomizes when useful and explicitly pays for movement curses or Sidewalk shed.
It does not use the bot's private plan or the true candidate location to guide the seeker.

The first 10 per level all finished in catches. Median seeking was Easy 82.2, Normal
81.5, Hard 71.9 game-minutes; a ceiling of 10/10 cannot establish catch-rate ordering.
The expanded paired run, **52 per level / 156 rounds**, seed 1, gives:

| Seeker level | Crossover | Caught | Median seeking, game-min | Median hider score, min | Longest quiet ride, real s |
|---|---:|---:|---:|---:|---:|
| Easy | 4 | 48/52 (92.3%) | 71.8 | 182.3 | 166 |
| Normal | 3 | 48/52 (92.3%) | 71.4 | 187.3 | 303 |
| Hard | 2 | 50/52 (96.2%) | 68.1 | 188.0 | 303 |

Every measured action gap was at least 3 real seconds. **Keep 4/3/2 and 0.25 bits**:
Hard caught two more paired hides than Easy and was faster at the median. This is a
small difference, not a claim of statistical certainty. No prices, deck counts, curse
limits or bot-hider decisions changed. Per-round results: [`s3-playchecks.csv`](s3-playchecks.csv).
Reproduce with `pnpm sim:hide --rounds 52 --seed 1 --json /tmp/s3.json`.

Platform waiting and never locking did not bypass the end conditions: platform hides
still selected their actual station, late underground hides froze at the nearest allowed
exit, and mobile hides froze on zone entry. Engine tests separately cover not leaving
the starting complex (incomplete), an underground station catch before 10:35, and the
nearer-endpoint mid-walk freeze. These freedoms increase the range of human choices;
they do not demonstrate a balance-breaking escape in this sample.

**Riding dead time is real:** one quiet ride lasted 303 real seconds. Pause is available;
there is still no seeking skip. Event-by-event skipping, stopping before a human answer
or keep decision, remains the fix to consider if watching those rides bores players.

### Browser and integration checks

- Read the eight supplied design PNGs before building the client. MapLibre fixture checks
  covered all eight live screen states, Veto, photo Move first / Lock & answer, and private
  keep choices; no browser errors.
- Live Google check: board, skip only the hide to 10:20, choose an exit, climb the stairs,
  load official imagery and lock. The bot asked during this sequence.
- A separate, explicitly seeded **endgame fixture** at 59 St–Columbus Circle used two
  verified Google panoramas 76 m apart. The real server restored IDs, the paced bot asked
  an on-foot radar, took two verified walks and caught the hider. Result, both replay
  trails and held-card score displayed with no browser errors. This was a final-phase
  integration fixture, not a newly played full round.
- Found, timeout and incomplete result fixtures rendered; a saved incomplete replay opened
  from Hide history with no server connection. Incomplete rounds have no score or share.
- Socket tests cover ordering/deduplication, role isolation, pause, capped hiding skip,
  restart, opaque round identity and Play again. Persistence tests cover the seeker's
  partial walk when a hider comes into sight. Saved replay question origins and thermometer
  baselines are reduced to MTA station coordinates too, including station questions asked
  from the street. Older replay caches are cleared; scored history remains.

**Limits:** these are automated virtual-clock rounds plus the live checks above, not
thirty real-time manual browser playtests. The street simulation uses synthetic panoramas,
straight walks and conservative candidate-circle deductions, not a connected Google
panorama graph. The actual Google endgame check covers one location. A full human
pacing pass, especially long quiet rides, and deployed Chrome/Safari/Firefox checks
remain before launch. Fog and Signal loss still cost the bot nothing; photos are fixtures,
and no photo panorama ID is used to locate the hider. Those perception gaps carry to M3.
