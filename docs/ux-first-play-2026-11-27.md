# First play by a stranger, 2026-11-27

*Why:* Charlie played the live game and found it hard to play, "especially working out how to ask a question" (brief: playability round). This file records where a newcomer gets stuck, worst first, before anything was redesigned. The fixes are proposed in `DESIGN.md` (Interaction: the playable round) and built on branch `playable-1`.

Before and after screenshots at phone and desktop size, and the report for Charlie: [Playable Round 1](https://claude.ai/artifact/BjmLA5TStKRbzRpX3in8G1) (private link).

**Decided by Charlie, 2026-11-27, after the third cold play** (DESIGN.md decision log):
- **No counts before asking.** Questions say only what they ask; no line under them says what Yes or No would rule out, and the map's legend shows no count while one is chosen. "I think that would take the fun out of it." Several testers asked for counts (items below); that's now a settled no.
- **The good next question is teaching only:** in the guided first round, never in the daily or in later practice. The testers' wish for it in the daily is a settled no; a pause on the daily is still open.

## How it was run

- **Cold play, yes.** Two fresh Claude sessions, each started from an empty folder with no project files or instructions, so neither had seen this repo or its docs. Each was given only the local address and a headed Chrome, and told to play today's daily, then a practice round, narrating what it thought each control did. One played at phone size (390×844), one at desktop size (1440×900). Neither read the source.
- The build was `main` (fun round 1 included), keyless as on the live site: every round ends at the station, on the free map.
- **My walk:** the first two minutes of a practice round at both sizes, listing every word a newcomer wouldn't know and every moment with no obvious next move.
- **Discard these:** for about five minutes mid-test, my own edits reached both testers' pages through the dev server's live reload. That caused a blank panel, a fall back to the loading board, clicks that stopped working (Vite's error overlay), and two lines from the new design seen after a reload. None of these is a bug in the game, and none is listed below. The rounds came back after a reload each time, which is the game working as designed.

## Where a newcomer gets stuck, most blocking first

1. **Asking takes a second press that nobody sees.** Clicking a question only chooses it. The Ask button then appears in the strip at the very bottom of the panel, away from the question, with "+10 min to their score" beside it. The desktop tester "nearly waited for an answer" before finding it. On a phone it sits below the whole list of questions. Charlie's complaint, "hard to figure out how to use a question", is this.
2. **After an answer, nothing says what to do.** The line "Ride toward what's left. Get off anywhere." appears while you're on the Ask tab; the trains are on the other tab, and nothing says which train goes toward the stations still possible. Both testers stopped and guessed. The desktop tester "knew I'd picked the right direction only AFTER boarding." Neither knew whether to keep asking or start riding.
3. **A wrong station gives no feedback.** *Both testers' answer to "the one change that would have helped most".* In a round that ends at the station, getting off at a station that could be theirs, and isn't, does nothing. The count doesn't drop, the square stays black, and no message appears. Both testers hit this at every stop ("I did NOT know: have I checked Bryant Pk or not?"; "the game never tells me that and doesn't clear the station. I have to keep that in my head").
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

15. **There's no list of the stations left, and the squares have no names.** "6 stations possible" means six small unlabelled squares. The phone tester found by accident that tapping one shows its name, and wanted "a tappable list of the six names".
16. **You can't tell where a train goes before boarding.** The board shows only the last stop ("Whitehall St–South Ferry"). The desktop tester boarded a 2 that skips the stations it wanted and "only saw that from the stop list after boarding."
17. **The hider's cards arrive unexplained.**
    - A Randomize card flashed for about 2 seconds and turned the phone tester's "Same kind of stop?" into a park question: "I paid +10 for a question I didn't choose."
    - A Wrong way card struck out every downtown train, and "nothing said what this was or why."
    - Neither tester knew the hider was the computer, or that it holds cards.
18. **The strip button contradicts the stop you chose.** After choosing Times Sq as the stop, the button at the foot read "Get off at 5 Av" (the next stop).
19. **A 0-min train silently becomes the next one.** Pressing a train that's leaving now boards the next one ("leaves in 8 min") without saying so, or does nothing visible.
20. **The daily can't be paused**, and the clock starts while you're still reading the list. Practice can be paused.
21. **"Following you"** reads the same whether or not the map is following.
22. **"Ruled out" and "Cleared"** are two words for the same square.

### How the rounds went

| Tester | Daily #54 | Practice |
|---|---|---|
| Phone, 390×844 | Found at 34 St–Penn Station, 6 questions, about 11 min real | Found at 50 St (Normal), 5 questions, about 5½ min real |
| Desktop, 1440×900 | Found at 34 St–Penn Station, 5 questions, about 12–13 min real (two reloads, from my edits) | Found at Houston St, 6 questions, about 8–9 min real |

Both finished both rounds without giving up, and both understood the core loop within a minute: "Someone is at a station, and I ask yes/no questions to rule stations out, then ride there." What they never worked out was how a round is won (arriving), how to read the score, and the hider's cards.

## What worked

- The hover preview on a computer: the ring drawn on the map with "1 mi round you: Yes keeps inside", the thermometer's halfway line, and the Nearest lines to each museum. "The preview saved me 10 min."
- The answer itself: "YES · 99 stations → 22", with the cleared squares turning hollow. "Very satisfying and clear."
- A reload brings the round back where it was.
- "Too soon to change platforms" on a departure you can't make.
- "Resume daily" on the homepage.
- The connections at your stop, while on a train.

## What the cold play suggests for the order of fixes

Items 1 to 4 decide whether a stranger finishes a round at all; 5 to 7 decide whether they understand it. The brief's order holds: one obvious next move (1, 2, 4), questions as sentences (5, 6), not here (3), less at first and plain words (7, 11), then the rest. Item 8 is the next trap after those.

*The testers' full narration and 144 screenshots stayed in the session's scratch folder; the quotes above are from them.*

## The second cold play, on `playable-1`

Run the same way, by two new fresh sessions, on a production build of the branch served apart from the dev server, so no edit could reach them. This time they were told to start where the homepage points, then play the daily.

| Tester | First round (Easy practice, guided) | Daily #54 |
|---|---|---|
| Desktop | Found at Nevins St, 3 questions, about 5½ min real | Found at 34 St–Penn Station, 4 questions, about 7 min real |
| Phone | Found at Wall St, 10 questions, about 12 min real | Their test browser restarted itself mid-round and lost the round; on a second start, found in about 1½ min (knowing roughly where by then) |

Against the first cold play: no one stalled, no reload was needed, and both understood the loop ("ask, ride, ask, ride") within the first round. The desktop tester "was never stuck for five minutes" and "mostly obeyed the hint line". Both used Not here, the suggested question, and the outlined next control.

### What it still found, and what happened to each

Fixed on the branch after their build, so they didn't see these fixes:

1. **The ride advice changed its mind and made U-turns.** It aimed at the middle of what's left, which moves after every answer, and once pointed at the R platform just after "the R doesn't stop there". It now keeps heading for the same station while that's possible, checks the nearest one with 12 or fewer left, names it and why ("the nearest of the 4 left"), and holds the train it named while that train is still to come.
2. **The map didn't show what an answer did,** at its opening zoom, and − did nothing while following. An answer now frames the stations still possible and you; a too-big ring is framed when chosen; the zoom buttons work while following.
3. **Counts disagreed** ("34 → 24" on the band, 23 at the top) because the band didn't know Not here; and for 5 seconds after arriving the count hadn't dropped yet. The band now leaves out stations you've stood in, and the line says "Checking this station…" until it counts.
4. **"You can ask now" while most kinds were greyed out**: now "Ask any question that isn't greyed out".
5. **A veto on Easy, which says "the hider plays no curses"**, and a first-card sentence pointing at a "tile" no one found. Easy now says "may veto a question"; the levels say "cards against you", not "curses"; the sentence says each card says what it did, where it landed.
6. **The guide went from 3 of 4 back to 2 of 4**, and "board the marked train" didn't fit a marked Walk button. It only goes forward, and step 3 names a walk too.
7. **Two stations named 34 St–Penn Station**, and "Get off at 34 St–Penn Station, for 34 St–Penn Station". The 57 repeated names now carry their lines.
8. **Three instructions at once on the first screen.** The opening voice line stays off in a guided round; on Ask with nothing chosen, the strip says "Choose a question, then press Ask here."
9. **"More questions" folded itself** at every station, and hid the tester's best question (hotter or colder). It stays open.

Still open, for Charlie or a later round:

- **The daily has no suggested question and no pause.** "In practice I leaned on that box completely; now I have to choose alone." *Decided: no suggestion in the daily. A pause is still open.*
- **Questions that can't rule anything out** can be asked and paid for ("18 stations → 18"). *Decided: no warning. It would be an outcome count.*
- **On a phone the list you work in is a strip about 260 px tall,** under the map and the header. The sheet already folds ("Map ▴"), but no one found that.
- **▸ and ▸▸ are unlabelled.** Both testers found by pressing that ▸▸ skips to your stop, which makes rounds much shorter.
- **The end of a round is easy to miss** on a phone: the result appears while the replay starts on the map.
- **Station squares are a few pixels wide,** and tapping one for its name is found by accident.
- **The hider's cards** are still only half explained: which card vetoed, and what Sidewalk shed or Planned work did.
- **The jump from the guided round to the daily is steep:** prices, every question kind and no suggestion arrive at once.

## The third cold play, after the second round of fixes

Charlie's orchestrator asked for the second cold play's remaining findings to be fixed (none needed a rule change), then a third cold play. Same method: two new fresh sessions, a separate production build and its own server.

**Fixed before it:**
- A phone's list grows from about 260 px to 362 px at 844 px high (240 px at Safari's 659), because:
  - the sheet opens to 66%;
  - the numbers sit beside the clock;
  - the answered band drops the question it repeats.
- The clock's skip buttons carry words. Unusable ones are hidden.
- A round's end opens the sheet at the result, under "You found the hider at …".
- Squares still possible are larger. With 12 or fewer left, every one is named.
- Each card is explained in the seeker's words the first time it lands, and the result says what kept cards added.

| Tester | First round (Easy practice, guided) | Daily #54 |
|---|---|---|
| Phone | Found at Chauncey St, 3 questions, about 4 min real | Found at 34 St–Penn Station (A C E), 3 questions, about 3–4 min real |
| Desktop | Found at 7 Av (B Q), 6 questions, about 8½ min real | Found at 34 St–Penn Station (A C E), 4 questions, about 5 min real |

Neither was stuck at any point, and no one gave up. Against the first cold play (11–13 minutes a daily, with long stalls), a daily took 3–5 minutes.

### What it still found, and what happened to each

Fixed on the branch after their build:

1. **Stations sharing a name on the stop list.** "Two 7 Avs, one row apart; only the (B Q) in the hint stopped me." The stop list now marks stations still possible with the map's square and names repeated ones with their lines. Each departure row says how many stations still possible it calls at further on ("4 still possible ahead"). This was the desktop tester's one change.
2. **The ride advice, again.**
   - The line said "this train heads away" on a train with stations still possible ahead. It now says to get off at the first of them.
   - "Get off at 7 Av (B Q), for 7 Av (B Q)" no longer repeats the name.
   - A platform change at Times Sq now names its platform: "the A C E platform at 42 St–Port Authority".
3. **The daily's guide pointed at a marked question the daily doesn't have.** It now says "choose a question".
4. **Everything greyed out, with no reason in words.** It now reads "Ready now: Matching, Measuring … Each kind of question rests after you ask it (Radar later)."
5. **Two competing get-off buttons.** The strip now offers the stop the line recommends.
6. **The skip buttons read like travel commands,** and ▸▸ with no stop chosen ran to the end of the line. They now say "Skip…". ▸▸ only shows once you've chosen a stop.
7. **Smaller things:**
   - the guide counting 2 of 4 on one tab and 3 of 4 on the other;
   - the clock running on after the end;
   - "Not here" repeated after changing platform;
   - "Walking to" the station you're in;
   - the map not following again after an answer framed it;
   - a new round's list opening scrolled down;
   - the recommended Walk button off screen.

Still open, for Charlie (rule or product calls):

- **The daily has no suggested question and no pause.** Both phone testers asked for the suggestion there. "Always show the good next question box, including in the daily" was the phone tester's one change. *Decided: no. The suggestion is teaching only, in the guided first round; a pause is still open.*
- **Questions can't be judged before paying.** "I expected a count such as inside 22 / outside 77." *Decided: no. That's the game ("I think that would take the fun out of it"); the Yes/No lines under questions went too.*
- **Stations a block apart can't be walked between** unless they're linked as transfers; the desktop tester rode back to Times Sq to reach one.
- **A first round hides the price of a question.** The desktop tester wanted it taught there ("the first round taught me the buttons but not the thinking").
- **In the guided round the hints play for you.** "It felt like luck." The suggestion and the ride advice together leave little to deduce; Charlie may want less in practice after the first round.
- **The hider's cards** are now explained as they land, but a tester who met none still found the result's list of kept cards opaque.
