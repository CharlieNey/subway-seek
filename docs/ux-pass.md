# UI/UX pass — 2026-10-06

A deep pass over everything proposed so far: `DESIGN.md` (Look and motion, Sidebar, Street endgame, Homepage, Hider screens, Waiting, Replay, Questions, Photos, Loading and errors, Motion) and the mocks on the Deck page (parts one to twelve) and the homepage page. The brief: the game should feel smooth, intuitive and clean, with personality, and not like generated UI. Sources for the outside input are in the last section.

The proposals are written into `DESIGN.md` under **Look and motion › Interaction** and as small edits to the screens they touch. This file is the reasoning.

**Charlie's review, 2026-10-06.** Decided: the vocabulary of tiles (1), the caption budget (2), departure rows like the countdown clocks, drawn to look like the real ones (3), select-see-confirm asking (4) **without outcome counts**, the seeker's answer window (5), riding has a job (6), the fast-forward control (7) and the three simple hints (11). Everything else below stays proposed. The tension in the Outside input section is resolved: option B, shape only. The Deck page's mocks were redrawn to the decided rules the same day (parts four, seven, nine, ten and eleven).

## What already works

- One idea carries the whole look: IRT tile for identity, IND bands for information, squares for game data, circles for trains. That is a real design system, not a theme, and it is what will keep the game from looking generated.
- Motion follows the timetable. Nothing eases or bounces, and every token is named. That is rare and worth protecting.
- Copy says what to do, not what went wrong. Disabled rows carry their reason. Errors say what's safe.
- Hidden information is designed, not patched: fixed-time photos, the same answer window for every question, the status board that never leaks a stop.
- The hider's incoming-question band shows the true answer and what it would leave. That turns Veto into a decision.

## Where it falls short

The mocks are clean, but they are **even**. Almost every element is a small rectangle of similar weight, labelled in the same tracked caps. Tabs, lamps, chips, buttons and captions all look like the same tile, so the eye has to read to tell them apart, and the black caption tile, which is meant to mark information, is used so often (STOPS, THE HIDER, OPENING QUESTIONS, ASKED, PLAY A CURSE, ASKING FROM) that nothing is marked. The effect is documentary rather than lively: handsome, quiet, and a little flat. Personality is concentrated in the name tablets and the conductor's lines on cards; the moment-to-moment play has little of it.

Smoothness has two gaps. First, asking a question is a one-click act with no arming step, although it costs +10 min and locks a category for 15, and the player can't see what a question will do before paying for it. Second, the seeker's idle time on a train, which is most of a round, has nothing to do, and solo fast-forward exists in the engine but has no designed control.

## Findings and proposals

### 1. One vocabulary of tiles

Give each role one shape, and never let two roles share one:

| Role | Shape | Example |
|---|---|---|
| Caption | black tile, white tracked caps | the clock, "Facing N", a band's label |
| Button | ink fill (default) or white with a 2 px ink rule (alternative), tracked caps, presses 2 px | Board, Ask, Back down |
| Tab | square tiles in a row, the active one ink; never more than three | Travel, Ask |
| Chip | light tile with a 2 px rule and a family square at its left edge; dims with a reason | Radar ½ mi, Hospitals · 8 within 2 mi |
| Lamp | a 10 px square dot with a plain label; lit = family or ink, unlit = outline | Riding · Changing trains · Walking |
| Band | local (2 tiles) or express (3 tiles) in a family color | an incoming question, the stop you're getting off at |
| Rule | a 2 px ink rule with small caps above it, no fill | section headings in the panel |
| Notice | a light row with a terra cotta square, dismissed by clicking | "You can ask Radar again at 10:51" |

Consequences in the mocks: the status board's three lamps stop looking like tabs; **Following you** stops looking like a third tab and becomes a map control (a square toggle at the map's bottom-right, like the zoom buttons); section headings in the panel become rules, not black tiles.

### 2. A caption budget and one hero number

- **At most two black caption tiles per panel** besides the clock. Captions mark live information (an incoming band's label, a timer's label). Section headings use the rule.
- **One hero number.** The three equal numbers at the top (stations possible, time left, hider bonus) flatten the thing that matters. For the seeker, stations possible is the hero: largest, with the other two as a secondary line. For the hider, it's their score. When the seeker is on foot, the hero becomes "21% of your circle left". The three numbers still sit on one rule; only the size changes.
- **Drop "6× real time" from under the clock** after the first minute of a round. Say it once on the homepage and the loading board. Under the clock, the useful line is the round ("Daily #23") or nothing.
- "hider bonus, min" reads as a database column. Say "+20 min to their score".

### 3. Departure boards like the real ones

The MTA's countdown clocks read bullet, destination, **minutes**, and nothing else; the minutes are the biggest thing on the sign. The mocked rows read bullet, destination, "10:50 · in 3 min", BOARD. Charlie wants the board to look like the real one too: a black field with glaze type, as on the platform, which is also the IND caption idiom. Change to:

- Bullet · destination · **3 min**, with the clock time small after the minutes. The minutes are tabular and right-aligned so a column of them reads as a board.
- **The whole row is the button.** Clicking a row boards; the "Board" label appears on hover and focus only. Rows you can't make are dimmed with their reason, as now.
- **Group by route, show the next two:** "Q · Coney Island–Stillwell Av · 2 min, then 9 min", as the real boards do. Fewer rows, more information.
- On a train, the stop list stays as mocked. The stop you're getting off at keeps the express band.

### 4. Asking is two steps, and nothing is asked blind

Questions are the game's most expensive click, so asking becomes **select, see, confirm**:

- Clicking a chip **arms** it: the chip sets ink, the map draws the question's shape (the radar ring, the thermometer's halfway line, the matching cells, the measuring rings, the tentacles), and a one-sentence hint says what it does. Hover previews the same thing without arming.
- **The shape, not the counts.** The first draft showed both outcomes as counts ("Yes keeps 23 · No keeps 36"). Charlie turned that off: the map draws the shape and the player judges what it would leave, so reading the map stays the skill. The partition remains an engine function for the bot and the simulator. See the tension in Outside input.
- The wainscot becomes the confirm: **"Ask · Radar 1 mi · +10 min to their score"**. Esc or clicking elsewhere disarms. The wainscot, which had no job on the Ask tab, now has the one main action for that tab too.
- While a category cools down, its block collapses to one rule-row: "Radar · next 10:40". Only ready categories show chips, so the tab is short and the eye lands on what can be asked.
- The route question offers only the lines at your origin, which is the engine's rule. The current mock shows all 26 bullets; it should show "Lines here: N Q R W" and nothing else.
- Thermometer: say how far you've moved since you started it ("1.9 km from Times Sq–42 St", or "Move 400 m to another station first · 210 m so far"). Today the disabled "Am I closer?" gives no reason in distance.

### 5. The seeker's side of the answer window

Every question gets the same 1 game-min window so the hider's hand can't be read from timing. On the seeker's screen that is a 10-second wait that looks like lag unless it's drawn. The question band shows a ten-tile timer, "Answer in 6 s", and the band's answer word sets when the window ends. A bot answers at the same moment a human would. This belongs in the motion catalog's Ask → answer row.

### 6. Idle time has a job

Most of a round is riding. Two things to do while riding:

- **Connections at your stop.** On a train, the Travel tab shows the departure board of the stop you're getting off at, around your arrival time, so a transfer is planned before the doors open. Transit apps do this ("next step"); the data is already on the client.
- **Plan the next question.** Hover previews work while categories cool down, and the armed chip stays armed across stops until you confirm, so a question can be set up on the ride and fired on arrival. Only one question can be armed at a time.

### 7. A fast-forward control

Solo rounds can skip to the departure, to 30 s before the next stop, to your stop, or to the end of a walk, but no screen shows it. Propose: on a train or a walk, the clock tile grows two square buttons to its right, **▸ Next stop** and **▸▸ Your stop** (or **▸▸ Arrive** on a walk). On a platform the first becomes **▸ Departure**. Pressing one makes the clock's digits step to the new time (step token); trains and dots jump, because the clock jumped, which keeps rule 1 (the clock is never animated faster than the timetable; it is simply later). Keyboard: Space for the first, Shift+Space for the second. Practice rounds get Pause as a square button on the clock tile's left.

### 8. Status lamps, and what the hider sees

The lamps row (Riding, Changing trains, Walking) uses the lamp shape from the vocabulary, not three tiles, so it can't be mistaken for tabs. On the hider's screen, the "The seeker sees only this" copy stays as a small board in the same shape.

### 9. The homepage has one door

The hero has two buttons and the departures board below repeats both modes with Play buttons. Keep one door in the hero, **Play today's daily**, with Practice as a text link beside it, and let the departures board be the only place modes are listed. The "How it plays" strip says "Get within 25 m and they appear"; it should say "They appear within 40 m; get within 25 m to catch them."

### 10. Copy and voice

The copy is plain and good. Personality should come from the subway's own register at a few fixed moments, and nowhere else, so it stays a voice rather than a gimmick:

- **Rules:** second person, present tense; digits for numbers; say what to do, not what went wrong; no exclamation marks; no emoji in the UI (only in the share text); the subway's own words for states (Now boarding, Not in service, Delayed, Held, Last stop, Stand clear).
- **Moments that get a line**, each original, each one sentence: the daily opening ("Now boarding"), time's up for the hider ("This is your station"), the first question fired, the find ("Found" tablet), time's up for the seeker ("Time's up · the hider was at …"), a disconnect ("We are being held momentarily"). Conductor's lines already exist on the cards; this extends the same voice to the round. Twelve lines in total, written once, reviewed once.
- **Never** a cheerful empty state, a "Oops", or a "Great job".

### 11. Onboarding by hints, not a tutorial

Solo rounds start at 10:20 with the bot already hidden, so a first-time player lands on a platform with a departure board and an Ask tab. The homepage's strip map explains the shape of a round; the first round needs three hints, shown once each, in the notice row, dismissed by clicking and remembered in the browser:

1. On the platform, before anything: "Hover a question to see what it would do. Ask one before you ride."
2. After the first answer: "Watch the squares clear. Ride toward what's left; you can get off anywhere."
3. When ≤ 3 stations are left: "Few enough to go and look. Get off, come up, and search the streets."

Nothing else. A player who already knows the show never sees a tutorial.

### 12. Keyboard

Accessibility is deferred, but a few shortcuts make the game feel smooth on a desktop and cost nothing: **1–5** arm the radar distances, **Enter** confirms an armed question, **Esc** disarms or closes, **B** boards the first row, **Space** fast-forwards in solo, arrows walk on the street. Each is printed small on the control it fires.

### 13. Motion catalog gaps

Add rows for: **Board** (the chosen row becomes the express band, band token; the tablet departs at the scheduled time); **Arm a question** (chip sets ink, the shape draws, the wainscot's label steps to the question); **Fast-forward** (digits step, dots jump, no catch-up); **Copied** (Share result sets a notice row "Copied" for 2 s). Everything else in the catalog stands.

### 14. Small fixes

- "Check the status page" in the server error: there is no status page. Drop it until there is.
- The legend boxes at the map's top-left (Where the hider could be, Your trail) are the right idea, but collapse to one caption line once the map has been read; a legend that stays is clutter over the map.
- Uppercase labels at 10–11 px with tracking are at the edge of legibility on a 380 px panel. Minimum 12 px and 0.08 em for any caps that carry information.
- Terra cotta means the other player, the irreversible action, the error square and the curse. That is four jobs. Keep three (other player, irreversible, curse) and let errors use ink with the terra cotta square only, as the plaques already do.
- Time formats: the panel uses h:mm for durations and the clock HH:MM for times. Keep both, but never show a duration without its label.
- Share result shows "Copied" in the notice row; today there's no feedback.

## Outside input

A research pass over game feel, daily-puzzle UX, transit wayfinding, map games, critiques of generated UI, color accessibility and onboarding. What it confirmed, what it changed, and what it adds. Every claim has its source.

**What it confirmed**

- **Spend motion on information, not decoration.** Pichlmair and Johansen's survey of juice finds heavy feedback "makes it hard to learn what aspects of interactivity have mechanical importance" ([arXiv 2011.09201](https://arxiv.org/abs/2011.09201)), and a controlled study found a middle amount of juice beat both none and a lot ([arXiv 2506.17011](https://arxiv.org/abs/2506.17011)). The motion spec's rule 8 and its catalog of informational moments are the right shape. Folmer Kelly's GDC counter-talk makes the same point from a designer's side ([Game Developer](https://www.gamedeveloper.com/design/video-indies-resist-the-urge-to-juice-it-or-lose-it-)).
- **The biggest thing on a transit screen is the countdown.** Transit's redesign made the ETA dominant and grouped everything under it ([Transit blog](https://blog.transitapp.com/the-big-5-0-transit-gets-a-makeover-eb169ecee240/)); real departure boards set destination and time largest, calling points one per line with right-justified times ([Now Let's Be Clear](https://nowletsbeclear.substack.com/p/designing-to-inform-departure-boards)). Finding 3 stands.
- **Information at the point of decision, never before, never after.** Vignelli's rule for the 1970 signage manual ([Second Ave Sagas](https://secondavenuesagas.com/2013/05/15/a-glimpse-inside-transits-graphics-standards-manual/)). It backs collapsing cooling categories to one row, collapsing map legends once read, and showing a question's cost and shape only when it can be asked.
- **A hard grammar is what makes a system feel designed, not generated.** Teenage Engineering binds shape to color ("a triangle is always yellow, a square is blue, a circle is red") and says sticking to rules is what lets them "become free again" ([SFMOMA](https://www.sfmoma.org/read/stay-curious-stay-naive-an-interview-with-teenage-engineering-jesper-kouthoofd/)). Linear's redesign cut noise, aligned labels and icons on both axes and lowered chroma ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)). Mosaic's squares-for-data, circles-for-trains is the same kind of rule; finding 1 turns it into a complete vocabulary.
- **The tells of generated UI** are an unchosen typeface, the indigo-to-purple gradient, three rounded cards in a row, glowing borders, emoji as icons and weightless copy ([925 Studios](https://www.925studios.co/blog/ai-slop-design-tells), [vibecodekit](https://vibecodekit.dev/ai-slop-design)). The mocks have none of them. The remaining risk is the opposite: uniformity, which is what the caption budget and the hero number address.
- **Personality lives in micro-moments and copy**, not decoration: Playdate's lock-screen eyes, games "gift-wrapped", "Crank to buy" ([Clip Content](https://clipcontent.substack.com/p/the-playful-design-details-of-the), [Panic](https://blog.panic.com/the-story-of-playdate/)). That is the Voice section's argument: twelve fixed lines in the conductor's register, nowhere else.
- **Wardle's one-a-day:** avoiding endless play, notifications and sign-ups is what made Wordle "feel really human", and the emoji grid was a player's spoiler-free invention ([Slate](https://slate.com/culture/2022/01/wordle-game-creator-wardle-twitter-scores-strategy-stats.html)). The daily's design and the share text already follow this.
- **Reduce motion, don't remove it:** swap translations for fades and shorten durations under `prefers-reduced-motion` ([web.dev](https://web.dev/articles/prefers-reduced-motion), [Comeau](https://www.joshwcomeau.com/react/prefers-reduced-motion/)). The catalog's reduced-motion column does this.

**What it changed**

- **Hints get shorter.** George Fan's rule for Plants vs. Zombies: at most eight words on screen at a time, visuals over words, escalate hints only after a missed action ([UX Collective](https://uxdesign.cc/lessons-in-onboarding-from-plants-vs-zombies-d936d58c10c), [GDC Vault](https://www.gdcvault.com/play/1015541/How-I-Got-My-Mom)). The three onboarding hints are now "Hover a question to see what it does.", "Ride toward what's left. Get off anywhere." and "Three left. Go up and look."
- **Durations get a ceiling, with one exception.** Kowalski's standards: press feedback 100–160 ms, panel changes 150–250, nothing over 300 ms, never ease-in, animate only transform and opacity, and no animation on controls used dozens of times ([Kowalski](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md)). Freiberg adds that the budget should scale with novelty, so command-like controls appear instantly ([rauno.me](https://rauno.me/craft/interaction-design)). The tokens press (100), step (160) and band (280) fit. Brake (900) and depart (600) don't, and shouldn't: they are tied to the timetable, which is the one thing that moves at its own speed. Chips armed by keyboard get the step token or nothing.
- **One sound, one hold.** Nijman's screenshake talk: a hit-stop of one to three frames and effects only on events that matter ([Blue Tengu](https://www.bluetengu.com/2014/12/12/art-of-screenshake-experiments/)). Mini Metro's audio is entirely generated by game events and won the IGF audio award ([Game Developer](https://www.gamedeveloper.com/audio/road-to-the-igf-dinosaur-polo-club-s-i-mini-metro-i-)). Proposal: "Someone's here" is the one moment with a hard sound and a two-frame hold on the catch band, and the only sound that defaults on. The departure chime and the answer tock stay optional. Every sound is an event; there is no soundtrack.
- **Contrast is checked at the boundary, not the swatch.** WCAG 1.4.11 asks 3:1 for meaningful graphics against adjacent colors ([W3C](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)), and color may never be the only carrier (1.4.1). The six family colors are fixed by heritage, so the check is: each family's ring, line or cell against the base map's land, water and parks, and each chip's square against its tile. Shape already encodes the family on the map (ring, line, cell, rings, view, tentacles), and chips carry text, so the redundancy rule is met. Okabe–Ito is the fallback if a hue fails ([reference](https://conceptviz.app/blog/okabe-ito-palette-hex-codes-complete-reference)).

**A tension to decide, not paper over**

Board Game Arena's long debate over confirm buttons ends with a caveat: the pre-confirm state must not *preview outcomes*, or players probe for free ([BGA forum](https://forum.boardgamearena.com/viewtopic.php?t=24530)). Finding 4 proposes showing "Yes keeps 23 · No keeps 36" before paying. The difference from BGA's case: those counts are a deterministic function of public information (the stations still possible and the question's geometry), not a peek at hidden state, and the show's seekers do this exact analysis on their phones. But it does change the skill. With counts, the game stops rewarding the eye for the map and starts rewarding the choice between a cheap weak question and an expensive strong one, and the choice of when to stop asking and go look. Two options:

- **A. Counts shown.** Faster, teaches every question's effect every time, fits a 20-minute daily. The deduction skill moves from arithmetic to judgment.
- **B. Shape only.** The ring, line or cells draw, the player estimates. Slower, more "reading the map", closer to the show.

The pass recommended A. **Charlie chose B** on 2026-10-06: the map is drawn, the player reads it. The engine keeps the partition for the bot and the simulator, so A stays one flag away if playtests show players counting squares instead of playing.

**What it adds (parked, not proposed yet)**

- **Streaks by New York date, with a repair.** Losing a streak to a timezone, a cache clear or a device switch is the loudest daily-game complaint ([Tom's Guide](https://www.tomsguide.com/features/i-lost-my-wordle-streak-without-losing-or-missing-a-game-heres-what-happened)). The daily already runs on New York time; results are browser-local. When there's a server record, offer one streak repair a month.
- **Scarce daily, abundant archive.** An archive of past dailies was Wordle players' top request ([Fast Company](https://www.fastcompany.com/91116731/wordle-archive-new-york-times-1000-puzzles-subscribers)). Practice rounds absorb some of this; a "yesterday's daily" replay already exists on the homepage. A playable archive is a later mode.
- **A rank, not just a time.** Spelling Bee's percent-of-par ranks give a "done for today" short of perfection ([Beebom](https://beebom.com/puzzle/spelling-bee-ranks-explained/)). A result tier in the subway's words (Express, Local, Shuttle…) would add personality, but the card names already use Delays and Planned work, so the tier names need care.
- **Express stops in the stop list.** IND bands change color family at express stops and widen there ([Wikipedia](https://en.wikipedia.org/wiki/New_York_City_Subway_tiles), [Gothamist](https://gothamist.com/arts-entertainment/map-these-color-tiles-in-the-subway-system-used-to-mean-something)). The on-train stop list could mark express stops with a wider rule, which is both heritage and useful (where to change).
- **A terse FAQ at the endgame moment.** Jet Lag home players reach for house rules exactly at the zone and endgame ([awesome-jetlag-hide-and-seek](https://github.com/jltg-community/awesome-jetlag-hide-and-seek)). A three-line "What counts" on first arrival at the street: the circle, seeing them at 40 m, catching at 25 m.
- **Fidgetability.** Frequently handled controls should feel good to idle with ([rauno.me](https://rauno.me/craft/interaction-design)): the hider's hand fanning on hover, the replay scrubber's drag.

**Gaps in the research:** Paul Tol's palette site was unreachable (Okabe–Ito stands in); Nijman's full list of tricks is video-only; no primary thread of GeoGuessr daily complaints was found, so GeoGuessr informed interaction only ([Plonk It guide](https://www.plonkit.net/beginners-guide)).
