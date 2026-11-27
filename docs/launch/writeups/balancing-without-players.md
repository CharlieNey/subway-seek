*Outline and facts only, for Charlie to write from. Checked against the repo on 2026-11-27.*

# Balancing without players: outline

## Title options

- Balancing a hide-and-seek game before anyone has played it
- Pricing subway questions with 1,028 simulated games
- What simulated rounds can and can't balance

## The argument

1. With no players, the evidence is the rules played by bots. The engine is pure, so the server, bots and sims run one implementation (`docs/ARCHITECTURE.md` §2).
2. At one flat price, a strong seeker used two question kinds almost exclusively. The sim showed it the day that price was decided, and the decision was reversed the same day.
3. Pricing became an experiment: change a price, replay every game, read the mix. The overcorrections were as informative as the final table.
4. The measuring seeker became the difficulty setting: a station's hardness is the number of questions it needs, and the bot hides in bands of that.
5. A bot-vs-bot sim with real travel and cards priced the deck and found engine bugs.
6. The sims are optimistic and perceive nothing, so they set the mix and the ordering, not the clock.

## Figures, with sources

**Before**
- The M2 set: a flat +10 min, one 5-min cooldown (`DESIGN.md` line 93).
- 91–94% of a strong seeker's questions were radar and route (`docs/question-balance.md` line 10). `DESIGN.md` line 93 says "over 90%".
- M2 from Times Sq: 97 stations; static pinned 49/97, moving 91/97 (`DESIGN.md` lines 444–449).
- ~7 questions and ~68 min of bonus to pin (`question-balance.md` line 55). `DESIGN.md` line 453 says ~70 min.

**Tuning** (`question-balance.md` lines 44–48)
- Matching/measuring at +5: no radar at all (matching + measuring 83%).
- Thermometer at +5: thermometer 29–33%.
- Tentacles cooldown 30 min, slower play: Tentacles up to 28%.

**Final rules**
- +10 / 15 min for matching, measuring and radar; thermometer +10 / 10; Tentacles (now Nearest) +20 / 40; photos +15 / 15; a 5-min gap (`question-balance.md` lines 19–26).
- No category above 29%; ~5.3–5.5 questions and ~64 min to pin (lines 53–56).
- 2026-11-27: thrifty 1,028/1,028, mean 5.4 (p90 7); greedy 5.5; static 780/1,028 (lines 70–72).
- **Run here** (`pnpm sim`, 2026-11-27): same figures. Thrifty's mix: matching 28%, radar 25%, measuring 24%, tentacles 18%, thermometer 6%. Radar plus route: 39%.

**Difficulty bands** (`docs/hider-bot.md` lines 50–66)
- Questions to pin over 1,028 pairs: 3 or fewer: 7%; 4: 17%; 5: 26%; 6: 25%; 7: 23%; 8: 2%.
- Easy 3–4 (23%), Normal 5–6 (51%), Hard 7–8 (25%). Ride time correlates with hardness at 0.39.

**Match sim** (780 rounds, seed 1, `docs/match-balance.md`)
- Found, Easy/Normal/Hard: 99/96/95% first; 100/96/94% after the card changes; 100/98/96% on today's timetable (lines 51, 185, 316).
- Normal: station at 39 min, endgame 37% of seeking, hider score 174 (lines 317–321).
- Veto: "about 9–10 min of hider score", measured on the old 38-card deck (lines 102–106).
- **Run here** (`pnpm sim:match`): reproduces lines 316–322.
- **Run here** (`SIM_DECK='{"veto":0}' pnpm sim:match`): on Normal, question bonus fell 75 → 68 min over 0.72 vetoes a round, ≈9.7 min per veto (derived here). The median score barely moved (174 → 173), because held bonuses rose 36 → 41.

**Endgame** (`docs/endgame-balance.md` lines 47 and 51)
- Sweeping alone: 56 game-min. With questions at +3 / 5: 17–18 min, 37–41% of seeking.

**Outer boroughs Saturdays** (`question-balance.md` lines 80–97)
- 161 St: 25 stations, only 4 in the Normal band, so it is left out. The other four hubs: 34–37.
- The moving seekers pin in 4.9–5.0 questions; static pins 152/191. Radar 27–28%.

**Where files disagree**
- `show-hn-facts.md` line 41 cites `question-balance.md` line 10 for the flat +10; that line gives no price. `DESIGN.md` line 93 and `ARCHITECTURE.md` line 81 do.
- `show-hn-facts.md` line 44 says "station is found in 98%". The 98% is hiders caught (`match-sim.ts` line 169); the station was reached in 100%.
- The category goal is ~35% in `simulate.ts` line 19 but 30% in `match-balance.md` line 71.

## Worth showing

1. The thrifty choice, `packages/engine/src/hardness.ts:66–77`:

```ts
  for (const { q, ctx } of pool) {
    const category = categoryOf(q);
    if (t < askReadyAt(asked, category)) continue;
    const parts = partition(ds, q, cands, ctx);
    if (parts.size < 2) continue;
    let bits = 0;
    for (const k of parts.values()) bits += (k / cands.length) * Math.log2(cands.length / k);
    const price = QUESTION_RULES[category].bonusSeconds / 60;
    const score = policy === "greedy" ? bits : bits / (price + paceSeconds / 60);
    if (!best || score > best.score) best = { q, ctx, score };
  }
  return best;
```

2. The "move", a teleport, `packages/engine/scripts/simulate.ts:133–136`:

```ts
    if (policy !== "static") {
      baseline = origin;
      origin = nearestToCentre(ds, cands);
    }
```

## What went wrong along the way

- **2026-10-05.** "Keep +10 min per question" was logged (`DESIGN.md` line 1228) and superseded the same day (line 455).
- **2026-10-06.** The veto kill shot was proposed at ≤ 3 stations. No such question exists above 30 stations, so it was set at ≤ 10 (`DESIGN.md` line 1190).
- **2026-10-07.** The first bot-vs-bot run (`match-balance.md` lines 82–106 and 153–169) found three things:
  - Wrong way cost a median 0 min.
  - Held bonuses added a constant 35–42 min to every score.
  - `stationFoundAt` was null in 22–25% of catches.

  The fixes are in `DESIGN.md` lines 1163–1164.
- **Drift.**
  - After the 2026-11-12 re-pin, `sim:match` waited until 2026-11-20 (`match-balance.md` line 312).
  - "Hard caught two more paired hides than Easy" no longer holds (line 331).
  - Normal Wrong way is 1.6 min on line 197; today's run gives 5.2 (n=23).

## Caveats to say

- The question sim teleports ("free travel, so optimistic", `simulate.ts` line 17).
- No sim asks photos (`questions.ts` line 142), so the +15 photo price is unsimulated.
- Fog and Signal loss cost a bot nothing (`match-balance.md` lines 44–45).
- Straight streets and a perfect sweep: real endgames run longer (`endgame-balance.md` lines 67–68).
- One seed; a second moves medians 1–2 min and scores up to 10 (`match-balance.md` lines 41–42).
- The You-hide checks are virtual-clock rounds, not playtests (`match-balance.md` lines 289–295).
