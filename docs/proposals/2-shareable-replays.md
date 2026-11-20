# Proposal 2: replays you can send as a link

*Proposed 2026-11-20, for Charlie's review. Nothing built.*

## The idea

Every finished round gets a short link, `/r/<id>`, that opens its replay for anyone: the hider's ride and the seeker's, the questions as they landed, and the find, in about 25 seconds. The daily's share text carries the link.

## Why

- **It shows the game in 25 seconds** to someone who will never play 20 minutes of it. The replay is the clearest picture of what the engine does (see the README's capture). A link to one round is the quickest way to show someone the game.
- **It's what makes a daily spread.** Today's share line says "found in 57 min, 1 question". A link that shows how is something people open.
- **The work is mostly done.** The replay view and its log exist, and the server already writes every round's log. After the round, both routes are public by the rules (`DESIGN.md`, Hidden information: every round reveals the hider when it ends).

## What it needs

1. **Server.** At a round's end, store the replay the client already builds: trails, questions with their answers and remaining counts, cards played, result. Use the same reduction You hide replays use today: street positions snap to the nearest public MTA exit, and no Google coordinates are stored (Google's terms; `docs/street-view-spike.md`).
   - Key it by a random 10-character id.
   - Serve it from `GET /replay/<id>`, cached for good once written.
   - Store it in the SQLite file on the volume. It grows by a few KB per round.
2. **Client.** A `/r/<id>` route that loads that JSON into the existing replay view, with "Play today's daily" as the one action. The link card can stay the static `og.png`.
3. **Daily rule.** A daily replay mustn't be shareable while the day is live: it shows the answer. Hold the link until the day ends in New York, or show the seeker's route only until then. Charlie to choose; holding it is simpler.
4. **Retention.** Keep 90 days, then delete. No accounts, no personal data. One sentence in `/terms.html`.

## Size

About three days: the store and endpoint with tests (one), the route and the daily hold (one), share text, terms and a deploy (one). Tests:
- a replay stores no coordinates but MTA exits;
- a daily replay is refused before midnight in New York;
- the visibility property test extends to the stored replay.
