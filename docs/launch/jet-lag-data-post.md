*An outline for one data post on r/JetLagTheGame, 2026-11-21. Outline only: Charlie writes the message and the post in their own voice, because the sub spots and punishes AI-sounding text (`docs/community-read.md`). Name-agnostic: the game is a footnote and needs no name. Figures re-read from the repo files named; facts about the show and the sub come from `docs/community-read.md` (read 2026-10-09) and `~/personal_projects/market-research/stand-clear.md` §4, and should be rechecked on the day.*

# r/JetLagTheGame: a data post, not an app post

## Why this shape

- The mods said in August they'd be "limiting these kinds of posts" (app announcements), and a "Stop with the apps please" thread drew ▲478 in October (`community-read.md`).
- What the sub upvotes is rules and data talk: "the seekers have gotten too good" ▲673; the team asking for home-game rule feedback ▲765.
- So: findings from the simulation, in the rules conversation; the game in a comment at most, if the mods agree.

## Timing

Before the Season 20 premiere (Hide and Seek Italy; 2026-12-05 per the market research, recheck), while rule changes are being discussed. Message the mods a week ahead.

## 1. Message to the mods (send it yourself)

Points, in order:

- Read the note on limiting app posts, so asking first.
- The post would be a data write-up: which Hide + Seek questions a min-maxing seeker leans on, from 1,028 simulated seeker games on the NYC subway. No link in the body.
- The simulation lives in a solo NYC game: original card text, no show cards, logos or rules text; most of the code written with Claude Code, said up front.
- Ask: is the post allowed, and would they rather the link go in a comment or nowhere?

## 2. The post

**Title idea:** which Hide + Seek questions are "the most powerful"? 1,028 simulated seeker games on the NYC subway.

**Opening:** the season's rule changes are said to target the strongest questions (market research §4 calls it Expert Mode; check the wording the show uses). A simulation built for a side project can say which questions a min-maxing seeker actually relies on.

**Setup** (`docs/question-balance.md`):

- The six categories of the Japan season, plus prices as minutes added to the hider's score. (The game calls tentacles "Nearest"; in the sub, use the show's word.)
- A hider gets 20 minutes from one of 13 big stations. Every station they could reach: 1,028 games.
- The seeker picks whichever question gives the most information per minute it hands the hider ("thrifty"); a greedy and a never-moving seeker are the bounds.

**Findings** (each a short paragraph or a bullet):

1. With fewer question types, all at +10 minutes, the seeker spent **91–94%** of its questions on radar and "does this line stop at your station". Every run looked the same. Tie it to the sub's own "every run is the same" complaint (▲673 thread).
2. Prices move the meta a lot. Matching and measuring at +5 with radar at +10: **no radar at all** (matching and measuring 83%). Thermometer at +5: thermometer **29–33%** of questions. (`question-balance.md`, Rules tried.)
3. With per-category prices and cooldowns, **no category above 29%**, every one used; thermometer least (~5–6%).
4. Moving matters: a seeker who never leaves the start pins only **780 of 1,028** (`docs/ARCHITECTURE.md`, section 5).
5. A veto was worth **about 9–10 minutes** to the hider in 780 bot-vs-bot rounds with cards (`docs/match-balance.md`).
6. Stations differ a lot (`apps/web/src/home/hardness.json`): from Grand Central, Wall St (4/5) takes 7 questions; Graham Av and Bedford Av (L) average 6.8 across the hubs that reach them; 28 St (6) averages 2.6.

**Caveats** (say them; the sub will):

- NYC subway, not Italy.
- Prices are minutes on the hider's score, not the home game's card draws.
- The question simulation teleports between stations, so its times are optimistic; the mix is the point.

**Footnote:** a solo NYC game where you seek or hide against a bot. No show cards, logos or rules text; the cards are written from scratch. Most of the code was written with Claude Code; the rules and the balance are Charlie's. Link in a comment if the mods are fine with it. Point people to the official home game.

## 3. In the comments

- **"Is this AI?"** Answer plainly, once: Charlie decided the design, rules, balance and look (a public decision log, if the repo is public); Claude Code did most of the implementation (`community-read.md`, What it means, 3).
- **"Why not Worldboard?"** It has no US coverage (as of 2026-10-06; recheck). This is one city, a 40-minute round, a daily.
- **Lead with You hide** if people ask what it's like: the sub's diagnosis is that the hider has no agency, and You hide gives the hider the cards and the choices.
- A screenshot of the Mosaic look in the comment with the link, not a stock map.

## Don't

- No "I made a game" title or body.
- No show logo, card names or card text in screenshots.
- No upvote or share requests.
