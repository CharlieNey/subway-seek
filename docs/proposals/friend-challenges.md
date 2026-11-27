# Proposal: friend challenges

*Decided 2026-11-27: approved as proposed, the smallest version: station only, no cards (option a), an optional name, 30 days and 10,000 live challenges. Build it after the launch posts, not before. The original proposal follows.*

*Proposed 2026-11-27 (fun round 1), for Charlie to decide. Nothing here is built. It adds a round mode, server storage and a public link, so it waits for a yes, and the build starts with the smallest version below.*

## The idea

You hide, lock your station and send a link. A friend hunts your hide whenever they open it, and then hides one back for you. No accounts, and you never need to be online together. It turns the solo game into a conversation between two people, and the link is the invitation, which matters more for growth than any share line.

## Why it fits what's built

A bot hider's round is a hub, a station (`SoloRound.hider`) and the route there (`hiderTrail`), and the engine answers every question from the station alone. A friend's recorded hide drops into the same two fields. The seeker's round is then an ordinary solo seeking round: the same visibility filter (`soloView`), the same answers, the same end and replay. Today's You hide already records the human hider's route and station on the server (`hider.ts`).

## How it works

**Hiding (the challenger).**
- A new door, *Hide for a friend*, plays the hide phase of You hide: 20 game-minutes from the daily's hub, fast-forward allowed. At 10:20 your station is where you are, as in You hide. There's no bot seeker afterwards, so it takes about 3 real minutes.
- Station only in the smallest version: no spot and no Street View, as in a keyless You hide (Phase 3, Fallback). A spot comes with the street endgame.
- You may type a name for the link: plain text, 1–24 characters, trimmed, control characters removed. Leave it blank and the link says "a friend".
- The server stores the hide and answers with the link `/play?c=<id>`. Share copies "I hid somewhere on the subway. Find me: …".

**Seeking (the friend).**
- The link opens a solo seeking round against that hide: same hub, same start time, the hider's station and route as recorded. The engine answers every question from the station, as it does for the bot. The hider doesn't need to be there.
- The round line says "Charlie's hide" (or "A friend's hide").

**Veto, Randomize and curses.** Three options:
- **(a) Left out (recommended for the first version).** The friend's round has no cards: a pure station hunt. It's fair, simple to explain, and nobody plays as someone else.
- (b) Played by the bot on the hider's behalf: the hider's dealt hand, played by the bot's policy at Normal (`docs/hider-bot.md`), each card labeled "played for Charlie". It's more fun but muddles whose skill it was.
- (c) Pre-committed by the hider ("veto my first radar"). Too fiddly for a link.

**The end.**
- **Both routes:** the friend gets the ending (DESIGN.md, Ending): the verdict, the callouts and both routes replayed.
- **The name, as plain text:** "Charlie hid at 5 Av/59 St". It's rendered by React as text, never as HTML and never in the page's head or preview card.
- **Two buttons:** *Hide one back* starts a Hide for a friend whose link names the friend, and *Share* copies "Found Charlie's hide in 0:48 · 6 questions" plus the link back.
- **No "you vs them" in the smallest version.** A pair comparison needs the two hides linked; it's in Later.

## Hidden information

- **The link carries an opaque id** (16 random bytes, 22 characters of base64url) and nothing else. Nothing in it is derived from the station, the hub or the time.
- **The page can't leak what it never receives.** The friend's client gets the station and the hider's route only when the round ends, through the same `soloView` filter that keeps the daily's station secret. Mid-round, the network messages hold what a daily's do: the start, the reachable stations, the answers. The page's code holds no challenge data at all.
- **The preview card is generic** ("A friend hid somewhere on the subway"), so a chat app's link preview can't show the name or the station.
- **Lookups don't enumerate:** an unknown or expired id is a plain 404, and opening challenges is rate-limited per address (below).
- **A hide can't be forged:** a challenge is made only from a hide the server ran, never from data the client sends.
- **Tested before shipping:** `packages/engine/src/visibility.test.ts` gets the challenge mode added to its property checks.

## Storage and limits (the 1 GB volume)

| What | Size | Limit |
|---|---|---|
| One challenge: id, hub, start time, station, route (10–40 trail entries), name, created, expires, how many times it's been played | about 5 KB as JSON | — |
| Live challenges | 10,000 × 5 KB ≈ 50 MB | At the cap, creating one says "Challenges are full today. Try again tomorrow." and the oldest expire first |
| Lifetime | 30 days from creation | A daily sweep deletes expired rows |
| Where | A `challenges` table in the existing SQLite file on the volume (`SESSION_DB`) | — |
| Creating, per address | — | 10 a day (`CLIENT_IP_HEADER`, as `limits.ts` counts new rounds) |
| Opening, per address | — | 60 an hour; past that a plain "Too many challenges opened. Wait a few minutes." |
| Friend rounds | Logged like any round: one JSONL file of a few KB | Same as today |

The match logs are the bigger long-run cost: about 30 KB a round on today's evidence (6 MB for 204 rounds in `apps/server/logs`), so 1 GB holds roughly 30,000 rounds. That's true with or without challenges. A sweep that deletes logs older than 90 days should come before any launch push. *Approved and built 2026-11-27 on `fun-round-1` (`apps/server/src/logSweep.ts`), shipping with the fun round.*

## Smallest version worth shipping

1. *Hide for a friend* from the daily's hub, station only, an optional name, no cards.
2. Server: create from a finished hide, store for 30 days, open by id, the limits above.
3. The friend's round: a solo seeking round against the hide, with the ending and replay, *Hide one back*, and *Share*.
4. The visibility test covers the new mode.

About three days: the engine's round from a recorded hide and its tests (one), server storage, limits and routes (one), the screens, the copy and a two-browser check (one).

## Later

- **Pairs:** *Hide one back* links the two hides, so each side sees "Charlie held you 0:48 · you held Charlie 1:12".
- **A results page for the hider:** who played and how they did, behind a private owner token kept in the hider's browser.
- Cards played by the bot on the hider's behalf (option b), once the plain version has been played.
- A spot and the street endgame, with the Google keys.

## Questions for Charlie

1. Build the smallest version as described?
2. Cards: left out (a), or played by the bot for the hider (b)?
3. A name on the link: yes, or "a friend" always?
4. 30 days and 10,000 live challenges: right, or smaller to start?
