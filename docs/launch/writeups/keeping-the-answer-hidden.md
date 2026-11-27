*Outline and facts only, for Charlie to write from. Checked against the repo on 2026-11-27. Every figure is followed by the file it comes from.*

# Keeping a hidden answer hidden

## Title options

- Keeping a hidden answer hidden in a browser game
- The frame that said "right station"
- One visibility filter, and the leak it didn't catch

## The argument

1. **The answer lives only on the server, and the rules ship to the browser too.** The engine is the same pure code on both sides, so a daily seeded by the date alone could be computed from the page. The seed mixes in a server secret, and a production server won't start without it (`docs/ARCHITECTURE.md` §3, "The daily is deterministic and secret"; `packages/engine/src/daily.ts:64-66`).
2. **Everything a player receives passes one filter.** The seeker gets `soloView(round, t)`: the candidates, landed answers, played cards and their own trail. They never get the hider's station, spot or hand until the round ends (`docs/ARCHITECTURE.md` §3, "One visibility filter"; `packages/engine/src/solo.ts`, `soloView` and `revealsHider`).
3. **Timing is information too.** An answer is held until its one-minute window ends (`ANSWER_WINDOW_SECONDS = 60`, `solo.ts:102`). The hider's marker is sent only within 40 m (`SPOT_REVEAL_METERS = 40`, `solo.ts:108`).
4. **The leak the filter didn't catch.** The pre-launch review found that the server's 1-second tick pushed a frame on any change to the round. Reaching the hider's station is a change, so a frame arriving with nothing visibly new meant "you're at the right station". Now a frame goes out only when that player's view differs from the last one sent (`DESIGN.md` decision log, 2026-10-06; `docs/LAUNCH.md`, Pre-launch review; `apps/server/src/tick.ts:111`).
5. **A property test checks it on whole rounds, not hand-picked states.** A bot seeker plays a full round from each of the 13 hubs at each of the 3 difficulties: 39 rounds. Every frame it sees is checked against the rules, and the test fails if any rule breaks anywhere (`packages/engine/src/visibility.test.ts`; `docs/ARCHITECTURE.md` §3).
6. **Some secrets are a product decision, not a bug.** A daily that ends without a find first kept its station secret until the next day, then the reveal was restored. The give-up-and-replay exploit only fools the cheater's own browser (`DESIGN.md` decision log, 2026-10-06 and 2026-10-07).

## Figures, with sources

- 13 start hubs: `packages/engine/src/hubs.ts`, `HUB_STATION_IDS`.
- 3 difficulties: `packages/engine/src/hardness.ts`, `DIFFICULTIES`.
- 39 bot-played rounds in the property test (13 × 3). The test asserts the count, and asserts more than 10 frames per round on average: `visibility.test.ts:92-94`.
- Answer window 60 game-seconds: `solo.ts:102`. Reveal distance 40 m: `solo.ts:108`. Catch distance 25 m: `solo.ts:106`.
- Session grace 3 minutes; the session token travels as a WebSocket subprotocol, not in the URL, so access logs never record it: `docs/ARCHITECTURE.md` §3, "Sessions survive drops and deploys".
- Limits that bound probing: 30 new rounds per address per hour, 40 messages per session in any 10 s, 16 KiB per message: `docs/ARCHITECTURE.md` §3, "Anti-cheat beyond hiding state".

## Worth showing

1. **The rules a mid-round frame must not break.** `packages/engine/src/visibility.test.ts:49-71`, the `leaks()` function: the hider, their hand, the replay, the find time, the candidates still including the truth, no early answer, no future card, the spot only within sight.
2. **The fix in two lines.** `apps/server/src/tick.ts:111`: a frame is sent only if `JSON.stringify(viewNow(game, now)) !== game.shown`. `apps/server/src/index.ts:478` records what was last shown.
3. **The seed.** `packages/engine/src/daily.ts:64-66`: `seededRandom(hashString("stand-clear-daily|" + secret + "|" + date))`, with the comment at the top of the file on why the secret is there.

## What went wrong along the way

- **2026-10-06, the side channel.** The frame's arrival leaked what its contents didn't. Found by review, not by the filter's tests, which checked contents (`DESIGN.md` decision log, 2026-10-06).
- **2026-10-06, Google's coordinates in the browser.** The homepage's saved replay kept a view with the spot's coordinates, which Google's terms don't allow to be stored. It now keeps the trails and the station only (`docs/LAUNCH.md`, Pre-launch review).
- **2026-10-06, then reversed on 2026-10-07: hiding an unfound daily's answer until the next day.** It cost every honest player the answer at the moment Wordle shows it, and stopped no one who opens a private window (`DESIGN.md` decision log).
- **2026-11-27, the same ideas applied to new features.** A review of fun round 1 checked that the ending, par and the stamp book read only what the server sends after the round ends, and that `GET /daily/scores` serves a minute histogram and nothing else (`apps/server/src/standings.ts`; DESIGN.md, Ending, "Hidden information").

## Caveats to say

- The property test covers the bot seeker's frames. It doesn't model a human opening devtools to time messages; the push-on-change rule is what covers that.
- The daily's integrity is an honor system: there are no accounts, so a second browser can replay it (`DESIGN.md` decision log, 2026-10-07).
