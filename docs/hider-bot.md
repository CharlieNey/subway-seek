# The bot hider's cards (solo)

The solo hider now plays the deck from DESIGN.md ("Cards"), so it has moves of its own
instead of only answering. Code: `packages/engine/src/cards.ts` (the deck),
`hiderBot.ts` (its decisions), `solo.ts` (drawing, playing and enforcing).

## The deck (38 cards)

| Cards | Count | What they do |
|---|---|---|
| Running late / Delays / Planned work | 10 / 6 / 3 | +5 / +10 / +15 min to the hider's score if still held when caught |
| Veto | 3 | No answer; the seeker has still paid for the question |
| Randomize | 3 | Swaps the question for a random one of the same category |
| Discard 2, draw 3 | 3 | Trades two weak cards for three new ones |
| Fog | 2 | Seeker's Street View blurred for 10 min (cost: 1 card) |
| Signal loss | 2 | Seeker's map covered for 10 min; departure boards still work (2) |
| Wrong way | 2 | Seeker's next train must run the opposite way (2) |
| Tourist | 2 | Off at the next stop, walk 200 m before going back in (2) |
| Sidewalk shed | 2 | Seeker walks at half speed for 10 min (1) |

Not in the solo deck yet:
- **Move:** a bot doesn't move.
- **Signal problems and Local only:** both need per-player train timing.

## Drawing

The hider draws when it answers, per DESIGN.md:

| Category | Draw | Keep |
|---|---|---|
| Radar, thermometer | 2 | 1 |
| Matching, measuring | 3 | 1 |
| Photo | 1 | 1 |
| Tentacles | 4 | 2 |
| On foot | 1 | 1 |

The hand limit is 6, and the bot keeps its most valuable cards. A vetoed question draws
nothing. Time bonuses still held count only when the round ends, and the hand is revealed
then. The daily's deck is shuffled from the day's seed, so everyone faces the same deck.

## How the bot plays

- **Veto and Randomize** apply to station questions, and the bot decides from **public
  information only**: whether the question would leave at most 55% of the stations you
  can already see. It never looks at the real answer, because then a veto would tell you
  the answer mattered. It vetoes late in the hunt (30 stations or fewer), and otherwise
  randomizes.
- **Curses use what a real hider sees:** where you are and which way you're heading.
  - **Tourist, then Wrong way:** while you're riding toward its station (within 8 km),
    and never to put you off at its own station.
  - **Signal loss:** when 15 or fewer stations are left and you're underground.
  - **Sidewalk shed** within 600 m of its spot, **Fog** within 300 m.
  - **Limits:** one curse at a time, at least 10 game-min apart. A curse is played only if
    the cards discarded to pay for it are worth no more than 1.5× the curse.
- **Server-enforced:**
  - **Wrong way:** blocks boarding in the old direction, and lapses after 30 min so a
    terminal can't strand you.
  - **Tourist:** forces you off at the next stop, then blocks boarding until you've walked
    200 m on the street.
  - **Sidewalk shed:** doubles street-walk times.
- **Client-side effects:** Fog and Signal loss.

## Not tuned yet

The card economy (deck mix, curse costs, the bot's thresholds) still needs the S4
bot-vs-bot simulation: a bot seeker with real travel time, which can replan around
Tourist and Wrong way. Until then these are reasoned starting values. They're covered by
tests (`cards.test.ts`) but haven't been balanced.
