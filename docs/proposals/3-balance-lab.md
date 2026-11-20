# Proposal 3: a public page of what the simulations found

*Proposed 2026-11-20, for Charlie's review. Nothing built.*

## The idea

A page at `/lab`, built from the simulations' own output when the site builds, that shows how the game was balanced before anyone played it. It fits the Mosaic look, like `/hardest`. Five panels:

1. **How many questions find a station.** The distribution from `pnpm sim` (1,028 games, mean 5.4), with the "never moves" seeker beside it (only 780 found). Moving matters.
2. **What a strong seeker asks.** The category shares, and the story of the flat-price version, where 90% of questions were radar and route.
3. **Where the time goes.** Station time and endgame share by difficulty from `pnpm sim:match`, against the design's target band (a third to half of seeking).
4. **What a card is worth.** Each curse's measured cost in seeker minutes, from the replay-with-curses-off method in `docs/match-balance.md`.
5. **The hardest stations,** linking to `/hardest`.

## Why

- **It's the most unusual engineering in the project,** and today it's in Markdown files nobody outside will open. A visitor sees in one page that the rules were tested by simulation, not guessed.
- **It's the launch post `docs/community-read.md` recommends:** "one data post into the rules conversation… the game is a footnote." The page is that post's link.
- **It keeps the docs honest.** If the page is built from `--json` output, the numbers on it can't drift from the code the way prose can.

## What it needs

1. `--json` output for `pnpm sim`, `sim:endgame` and `sim:match` (`sim:hide` has it), written to `apps/web/src/lab/*.json` by a `pnpm data:lab` step, like `pnpm data:hardness`.
2. A test that fails when the lab data is older than the dataset or the rules, the way the hardness table's staleness test does.
3. The page: five panels of square-mark charts in the family colors, with short captions. No chart library. The charts are bars and dot strips, drawn the way `/hardest` draws its table.
4. A design pass in `DESIGN.md` first, since it's a new screen.

## Size

About four days: JSON output and the data step (one), the staleness test (half), the page (two), and the design write-up and review (half).
