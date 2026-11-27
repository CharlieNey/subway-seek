# First play by a stranger, 2026-11-27

*Why:* Charlie played the live game and found it hard to play, "especially working out how to ask a question" (brief: playability round). This file records where a newcomer gets stuck, worst first, before anything was redesigned. The fixes are proposed in `DESIGN.md` (Interaction: the playable round) and built on branch `playable-1`.

## How it was run

- **Cold play, yes.** Two fresh Claude sessions, each started from an empty folder with no project files or instructions, so neither had seen this repo or its docs. Each was given only the local address and a headed Chrome, and told to play today's daily, then a practice round, narrating what it thought each control did. One played at phone size (390×844), one at desktop size (1440×900). Neither read the source.
- The build was `main` (fun round 1 included), keyless as on the live site: every round ends at the station, on the free map.
- **My walk:** the first two minutes of a practice round at both sizes, listing every word a newcomer wouldn't know and every moment with no obvious next move.
- **Discard these:** for about five minutes mid-test, my own edits reached both testers' pages through the dev server's live reload. That caused a blank panel, a fall back to the loading board, clicks that stopped working (Vite's error overlay), and two lines from the new design seen after a reload. None of these is a bug in the game, and none is listed below. The rounds came back after a reload each time, which is the game working as designed.

## Where a newcomer gets stuck, most blocking first

1. **Asking takes a second press that nobody sees.** Clicking a question only chooses it. The Ask button then appears in the strip at the very bottom of the panel, away from the question, with "+10 min to their score" beside it. The desktop tester "nearly waited for an answer" before finding it. On a phone it sits below the whole list of questions. Charlie's complaint, "hard to figure out how to use a question", is this.
2. **After an answer, nothing says what to do.** The line "Ride toward what's left. Get off anywhere." appears while you're on the Ask tab; the trains are on the other tab, and nothing says which train goes toward the stations still possible. Both testers stopped and guessed. The desktop tester "knew I'd picked the right direction only AFTER boarding." Neither knew whether to keep asking or start riding.
3. **A wrong station gives no feedback.** In a round that ends at the station, getting off at a station that could be theirs, and isn't, does nothing. The count doesn't drop, the square stays black, and no message appears. Both testers hit this at every stop ("I did NOT know: have I checked Bryant Pk or not?"; "the game never tells me that and doesn't clear the station. I have to keep that in my head").
4. **On a phone the answer lands out of view.** The answer band appears at the top of the panel's list, which you've usually scrolled down to choose a question. The phone tester "never saw the answer arrive". They found it at the bottom, in the log, after noticing the count had changed.
5. **The question list is a template to assemble, in the show's vocabulary.**
   - Bands in caps: MATCHING · SAME AS MINE?, MEASURING · CLOSER THAN ME?, RADAR · WITHIN …, THERMOMETER, NEAREST.
   - Sentence halves: "Is your nearest … the same as mine?" above chips reading "Big park" and "Museum".
   - "Same kind of stop?": "no idea what kind of stop means". It means express or local.
   - "Lines here:" followed by bare route bullets. "Does the L stop at your station?" exists only in the tooltip.
   - Boxed digits 1–5 on the radar distances: keyboard keys, unexplained.
   - "Start here · free" on the thermometer.
6. **After one question, the whole list collapses into "after the gap".** Every family becomes a one-line row reading "after the gap" or "next 10:39", so the screen you were using disappears. "'After the gap' is an odd phrase; it took me a moment to realise the gap = the cooldown." Also unexplained: why radar's time differs, "Next question: ready" and the five-tile meter.
7. **The numbers assume you know the rules.**
   - "2:00 left to find it" reads as two minutes; it's two game hours.
   - "+10 min to their score" never says whose score, or that it's bad for you.
   - On the result, "1:34 found in · 6 questions, +60 min · 3:19 hider score" doesn't add up. The missing 45 min are cards in small print ("Discard 2, draw 3, Planned work, Tourist…"): "I have NO idea what those are."
   - "Is a high hider score bad for me? I assume yes; never told directly."
   - The tally bar of coloured squares and "Par 5 · 1 over" are unexplained.
8. **▸▸ is a trap.** After boarding, ▸▸ skips to the train's last stop (Flushing, in Queens) unless you've chosen a stop. The button shows only "▸▸", and the reason is in a tooltip. Both ▸ buttons are tiny and unlabeled. On a platform they're disabled, and only the tooltip says why ("Board a train first").
9. **The preview's count reads as an answer.** While a radar question is previewed, the map's legend says "99 stations still possible". The phone tester read it as "how many stations a Yes leaves", then was confused when the answer left 51.
10. **On a phone the map can't be read.** Most of the possible stations are off screen at the start, and at that size a black square (still possible) and a hollow one (ruled out) look the same.
11. **Words from inside the project:**
    - "Riding below · the round ends at the station".
    - "the free map", "the full game", "Street View" on a round that has none.
    - "Curses once you're closing in" (Practice, Normal): "Sounds like something bad will happen to me."
    - The replay's "Vetoed", "Questions, by family", and "HIDESEEK" run together.
    - The replay's labels overlap on a phone.
12. **Hover-only cues on a touch screen.** "Open Ask and hover a question to start." "Board" on a departure row shows only on hover, so on a phone nothing says a row is a button.
13. **One place, two names.** The stop list says "5 Av" and the station's tablet says "42 St–Bryant Pk". The tester guessed they were the same.
14. **"Listen for the answer"** while the answer is on its way: both testers heard nothing, and wondered whether they should.

## What worked

- The hover preview on a computer: the ring drawn on the map with "1 mi round you: Yes keeps inside", the thermometer's halfway line, and the Nearest lines to each museum. "The preview saved me 10 min."
- The answer itself: "YES · 99 stations → 22", with the cleared squares turning hollow. "Very satisfying and clear."
- A reload brings the round back where it was.
- "Too soon to change platforms" on a departure you can't make.
- "Resume daily" on the homepage.
- The connections at your stop, while on a train.

## What the cold play suggests for the order of fixes

Items 1 to 4 decide whether a stranger finishes a round at all; 5 to 7 decide whether they understand it. The brief's order holds: one obvious next move (1, 2, 4), questions as sentences (5, 6), not here (3), less at first and plain words (7, 11), then the rest. Item 8 is the next trap after those.

*Status when written: both testers had finished the daily and were partway through a practice round. Their final reports will be added here, with the second cold play on the fixed branch.*
