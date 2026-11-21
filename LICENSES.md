# What is under what

Subway Seek is by Charlie Ney. Three kinds of thing live here, under three sets of terms.

| What | Terms | Text |
|---|---|---|
| **Code:** `apps/`, `packages/` (engine, server, web client, data pipeline and scripts), `infra/`, tests, build config | [GNU AGPL-3.0-only](https://www.gnu.org/licenses/agpl-3.0.html) | [`LICENSE`](LICENSE) |
| **Writing and art:** `README.md`, `DESIGN.md`, `docs/`, the Mosaic tile and icon art, `apps/web/public/og.png`, `favicon.svg`, `apple-touch-icon.png` | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) | [`LICENSE-docs`](LICENSE-docs) |
| **Landmark data:** `packages/data/dataset/nyc-landmarks.json` and `packages/data/raw/landmarks-osm.json` | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), © OpenStreetMap contributors; the park entries come from NYC Parks open data | [`packages/data/dataset/ODbL-1.0.txt`](packages/data/dataset/ODbL-1.0.txt), [`NOTICE.md`](packages/data/dataset/NOTICE.md) |
| **Timetable and station data:** `packages/data/dataset/nyc-subway.json` and the downloads in `packages/data/raw/` | The sources' own terms, not Charlie's to license (below) | |

## Data sources

- **MTA.** The timetable, routes, shapes and transfers come from the MTA's subway GTFS feed, used under the [MTA data feed terms](https://www.mta.info/developers/terms-and-conditions). The station and entrance records come from the *MTA Subway Stations* and *MTA Subway Entrances and Exits* datasets on [data.ny.gov](https://data.ny.gov), under its terms of use. `nyc-subway.json` is a processed subset. Subway Seek is not licensed, endorsed or sponsored by the MTA and uses no MTA logos.
- **OpenStreetMap.** Museums, libraries, hospitals, zoos and airports in `nyc-landmarks.json` are © OpenStreetMap contributors, available under the ODbL. Anyone who redistributes that file, or a database derived from it, must keep this attribution and offer it under the ODbL.
- **NYC Parks.** The parks in `nyc-landmarks.json` come from NYC Open Data.
- **Maps and Street View.** Google Maps Platform in production, under Google's terms; no Google imagery or coordinates are stored in this repo. In development, [OpenFreeMap](https://openfreemap.org) tiles with map data © OpenStreetMap contributors.

## Other

- **Jet Lag.** The game's format follows the published rules of a TV series, and mechanics aren't licensed. No show text, art or card names are used. Subway Seek is a fan project, not affiliated with Wendover Productions or Nebula.
- **Dependencies** keep their own licenses; see each package's entry in `pnpm-lock.yaml`.
- **Fonts** (Josefin Sans, Libre Franklin) are loaded from Google Fonts and are under the SIL Open Font License.
