# Proposal: a two-minute daily

*Proposed 2026-11-27, for Charlie to decide. Nothing here is built. It adds a round with no transit and a second daily seed, so it needs a yes, a name, and a simulation run before any code (CLAUDE.md: simulate before pricing).*

## The idea

A second daily that anyone can finish in about two minutes, on a phone, standing on a platform. It's the same hidden station for everyone that day, with no riding and no clock. You get **six turns**. A turn is a question, asked from any station you tap, or a guess. Find the station in six or fewer, then share a grid. It's the game's deduction with the waiting taken out, sized for the people who'll never sit through a 30-minute round, and it brings them to the full daily.

Working name: **The Shuttle**, the short line that runs back and forth. Other names: *Two-minute daily*, *The Short Line*.

## How a round goes

1. **The map opens on today's start hub,** with every station the hider could reach in 20 minutes shaded, exactly as the full daily opens.
2. **Each turn, tap a station on the map, then a question.** The question is asked *from that station*, as if you'd ridden there. The answer comes back at once, with no answer window, and the shading clears just as it does today. Every family is open: Matching, Measuring, Radar, Nearest. Thermometer takes two turns, its start and its "Am I closer?", which is what makes it a choice.
3. **To guess, tap a station and press Guess.** That uses a turn too. Right, and the round ends found. Wrong, and that station is ruled out and play goes on.
4. **Six turns.** Found by the sixth: "Found in 4/6". Otherwise: "X/6", and the station is revealed with both the shading and the answers that should have led there.
5. **No cards.** No veto, no curses, no time bonuses. Every player meets the same six answers for the same six questions, which is what makes the grid comparable.

## The result

- **Share line**, using the question emoji the game already uses (`apps/web/src/share.ts`), plus one for the guess:
  ```
  Subway Seek · The Shuttle #54 · 4/6
  🗽📡🧭🎯
  https://subway-seek.pages.dev/?s=54
  ```
  It's one emoji per turn, so it shows the route to the answer and never the station: 🎯 a right guess, ⬛ a wrong one.
- **The result card** reuses the ending (DESIGN.md, Ending): the turning point callout ("Radar 2 mi, No: 72 → 22") and par. There's nothing to replay, since nobody rode anywhere.
- **"Now ride it"**: a button into today's full daily, which is how the short one feeds the long one.

## How it sits beside the full daily

| | Full daily | The Shuttle |
|---|---|---|
| Time | 20–40 min | about 2 min |
| Station | Seeded by the date | Seeded by the date with its own salt, never the full daily's station, so neither spoils the other |
| Start hub | By date | The same hub, so the map is familiar and the full daily is one tap away |
| Moving | Real timetable, 6× clock | None: ask from any station |
| Budget | 2 game-hours | 6 turns |
| Cards | Bot hider's hand | None |
| Score | Hider score (time) | Turns, 1–6 or X |
| Records | Results, days running, found streak, stamp book | Its own results and streak, kept in this browser beside the daily's. It doesn't stamp the stamp book, since stamps are for stations you rode to |
| Homepage | The main door | A second door under it: "Or the two-minute one" |

## What it reuses

- **Answers** come from the engine's `evaluate` and the shading from `filterCandidates` (`packages/engine/src/questions.ts`). These are the same functions the daily uses, so a Shuttle answer can never disagree with a daily answer.
- **Hidden information.** The server holds the station, and the client gets answers through a view filter like `soloView`. Mid-round the client never holds the station, as today.
- **Station choice and par.** The station comes from the hardness table (`hardness.ts`), from a band picked by simulation (below), and par is shown the same way.
- **Server.** The daily seeding (`dailyRandom` with its own salt) and the in-memory, log-rebuilt standings (`standings.ts`) for a "better than 70% of today's" line, keyed by turns instead of minutes.
- **Client.** The map, the shading, the question chips, the share and copy flow, and the result card.

New:
- an engine round with no transit, holding a turn budget, an `ask from station` intent and a `guess` intent;
- one sheet layout for it (map on top, chips under it, a turn counter in place of the clock);
- the homepage door;
- its storage keys.

## The number that needs a simulation

The full daily's par assumes a seeker who has to *ride* toward what's left. Asking from anywhere is much stronger: the best origin for each radar is always available. Before choosing the band and the six, `pnpm sim` needs a mode where the strong seeker may ask from any station. The target is a good player finding it in 4–5 turns and a new one in 6 or X about one day in three. If the Normal band falls to 2–3 turns from anywhere, the Shuttle takes the Hard band (twins first), or drops to five turns.

## Smallest version worth shipping

1. The Shuttle, daily only, no practice: six turns, ask from any station, guess, no cards.
2. The share line with the grid, and a result card with the turning point and "Now ride it".
3. Its own result and streak in this browser, and a homepage door.
4. The simulation run first, with its band and turn count written into `docs/question-balance.md`.
5. Not in the first version: a percentile (add it once the full daily's has proved itself), a practice Shuttle, or the Shuttle on its own page.

About three days: the engine round and its tests, plus the simulation (one); the server intents, seed and view (one); the screen, the share and the homepage door, checked on a phone (one).

## Questions for Charlie

1. Build it? And the name: The Shuttle, or another?
2. Six turns with guesses counting as turns, or a free final guess after six questions?
3. Should it stamp the stamp book, or stay out of it as proposed?
