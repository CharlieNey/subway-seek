# Match balance (S4: bot vs bot)

Whole solo rounds played by a bot seeker against the bot hider, on the real timetable with
real travel time, so the deck mix, the curse prices and the bot's thresholds can be set
from data. Re-run with `pnpm sim:match` (about 30 s); try other rules without editing the
game with `SIM_RULES` (question prices, as `pnpm sim`), `SIM_DECK='{"veto":2}'` (deck
counts) and `SIM_COST='{"tourist":1}'` (curse costs), and `--endgame-at 2`, `--rounds`,
`--hub 127`, `--difficulty hard`, `--seed`, `--failures`, `--trace 127:normal:5`.

**Nothing in `src` was changed by this pass.** The numbers below are measurements; the
recommendations at the end are for Charlie to decide.

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

## What the simulation showed in the engine

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
