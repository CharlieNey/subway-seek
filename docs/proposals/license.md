# Proposal: a license (for Charlie's decision)

*Proposed 2026-11-20. Nothing is licensed yet: without a LICENSE file the repo is "all rights reserved", so a public repo could be read but not reused.*

## What a license can and can't protect here

- **Rules can't be owned.** Game mechanics aren't protected by copyright, so no license stops someone building the same rules. What a license covers is the expression: the code, `DESIGN.md` and the docs, the art.
- **The value is in three different kinds of thing,** and they need different terms: the code (engine, server, client, the data pipeline), the writing and art (the design doc, balance write-ups, the Mosaic tiles and `og.png`), and the data, which isn't Charlie's to license.
- **The data comes with terms already.**
  - `packages/data/dataset/nyc-subway.json` is derived from MTA data. The [MTA data feed terms](https://www.mta.info/developers/terms-and-conditions) (updated 2024-03-13) allow hosting it on your own server and saying you got it from the MTA, forbid implying an MTA license, and say "You will not modify or delete any of the data." A processed subset sits awkwardly with that last sentence. Every transit app transforms GTFS, and the risk for a free hobby game is low, but it is Charlie's call. The cautious option is to stop committing the built file and build it at deploy time, though the browser still receives it.
  - `nyc-landmarks.json` is derived from OpenStreetMap, so it is a derivative database under the [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). Distributing it publicly, in the repo or to browsers, means offering it under the ODbL with attribution. That holds whatever license the code gets.
  - data.ny.gov's terms of use couldn't be read automatically on 2026-11-20 (the PDF redirects). Read them once before the public flip.

## Options for the code

| License | What it means for Stand Clear | For someone reading the code |
|---|---|---|
| **MIT** | Anyone may use, host or sell it, closed or open, with a copyright notice. A competitor could add NYC from this engine and keep their changes private. | The most familiar choice. Reads as generous. |
| **AGPL-3.0** | Anyone may use and modify it, but anyone who runs a modified version as a network service must publish their source under the AGPL too. Closed commercial reuse is effectively off the table. | A recognised, deliberate choice for a hosted game. Some companies won't use AGPL code internally, which doesn't matter for a hobby project. |
| **PolyForm Noncommercial 1.0** | Source-available: anyone may read, run and modify it for non-commercial purposes only. | Not open source by the OSI definition. GitHub shows it as "Other". Some engineers see that as a negative. |

## Recommendation

1. **Code: AGPL-3.0-only.** It keeps the work open and readable, which is the point of publishing it, while stopping a commercial service (Worldboard is the obvious one) from taking the engine and data pipeline closed. If Charlie would rather maximise reuse and goodwill, MIT is the alternative. Choose it knowing that it gives the pipeline away.
2. **Writing and art (`DESIGN.md`, `docs/`, the tile art, `og.png`): CC BY-NC 4.0.** People can quote and adapt the design with credit but not sell it.
3. **Data:** a `DATA-LICENSES.md` (or a section of the LICENSE file) that says the dataset is derived from MTA data under the MTA's terms, the landmarks are ODbL with "© OpenStreetMap contributors", and NYC Parks and data.ny.gov data are under their own terms.
4. **Jet Lag:** nothing to license, since no show text, art or names of curses are used. Keep the credit line in the README and on `/terms.html`.

## If Charlie agrees

- Add `LICENSE` (the AGPL text unchanged), `docs/LICENSE` or a `LICENSE-docs` file (CC BY-NC 4.0), and `DATA-LICENSES.md`.
- Set `"license": "AGPL-3.0-only"` in the root `package.json`, and in each workspace package if they are ever published (they're `private` today).
- Replace the README's License section with three lines pointing at those files.
- Log the decision in `DESIGN.md`.
