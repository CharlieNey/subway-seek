# Street View spike — 2026-10-05

**Bottom line:** Google Street View is technically excellent and cheap for this game, but its terms rule out two things the design assumed. You can't show Street View on the same screen as our MapLibre/OpenStreetMap map. And you can't relay Street View images from the server as "photos" that hide their location. Decide between **Google with a separate street screen and honor-system photos** and **Mapillary (open imagery) everywhere** before M4. A Mapillary coverage check for NYC is the cheapest next step.

Test page: `apps/web/spike/streetview.html` (`?zone=<complex name>`, `?auto=1` maps the zone, places a marker and does two walks).

## What we measured — zone around 14 St–Union Sq (400 m radius)

| Measure | Result |
|---|---|
| Panoramas in the zone | **911** (one every ~10 m of street) |
| Links between them | 972 |
| Connected components | **1** — every panorama reachable from the station exit |
| Lookups to map the zone | 945 `StreetViewService.getPanorama` calls, **free** (not billed per Google) |
| Time to map the zone | 79 s (6 parallel lookups), from a browser |
| Imagery dates in the zone | 2011-07 → 2026-04, 11 distinct capture dates |
| Start panorama at exit 0 | found, imagery from 2026-04 |
| Walk 390 m at 6× | 38 hops, 46.5 s real |

Not measured yet: the panorama itself didn't render, because **the key's Cloud project has no billing account** ("You must enable Billing on the Google Cloud Project"). Google needs billing on file even within the free tier. Lookups work without it. So these are still open:
- whether moving between panoramas inside one viewer is billed,
- whether the hider marker shows up inside Street View.

**Static API:** not enabled on the project. Calls return `REQUEST_DENIED`.

## Pricing (official, current — developers.google.com/maps/billing-and-pricing/pricing)

| SKU | Free / month | Then per 1,000 |
|---|---|---|
| Dynamic Street View (Pro) | 5,000 | $14.00 |
| Static Street View (Essentials) | 10,000 | $7.00 |
| Street View metadata | unlimited | free |
| `StreetViewService.getPanorama` (JS) | not billed | — |
| Dynamic Maps (if the main map moved to Google) | 10,000 | $7.00 |

- **Billing unit:** "each instantiation of a panorama object". Reusing one viewer and calling `setPano` *appears* not to be billed again, but Google doesn't say so explicitly. Check the billing report once billing is on.
- **Per round:** if one viewer is reused, a round costs about 1–3 loads, and the free tier covers about 2,000 rounds a month. Worst case, every `setPano` is billed: with "walk to" jumping straight to the arrival panorama, a 20–40-walk endgame is about 40 loads, so ~125 free rounds a month, then about $0.56 a round.

## Terms (cloud.google.com/maps-platform/terms, Street View policies, geo guidelines)

| Question | Answer |
|---|---|
| Street View next to our MapLibre/OSM map? | **No.** ToS 3.2.3(e): no Google services "with or near a non-Google Map… (ii) display Street View imagery and non-Google Maps on the same screen." |
| Server fetches a Static image and relays it as a "photo"? | **High risk / effectively no.** 3.2.3(a) bans "reshare, or rehost"; the geo guidelines ban screenshotting or "Downloading Street View images to use separately from Google services"; attribution can't be cropped. |
| Hider marker drawn inside Street View? | **Yes.** Markers, InfoWindows and custom OverlayViews are supported on panoramas. `google.maps.Marker` is deprecated but not scheduled for removal (12 months' notice). `AdvancedMarkerElement` is typed for `Map` only. |
| Store panorama IDs for curated zones? | **Yes**, "indefinitely" per the Street View policies, but IDs go stale. Store our own coordinates and re-look them up. Don't cache Google's returned lat/lng. |
| Hide street names / address? | **Yes**: `addressControl: false`, `showRoadLabels: false` (used in the spike). |
| Games / location-guessing? | No clause bans them. We must keep Google's attribution and link Google's Maps Additional Terms and Privacy Policy from our terms. |
| Google's own imagery only? | JS: `sources: [GOOGLE, OUTDOOR]`. The Static API only has `outdoor`. |

## What it means for the design

1. **The endgame can't be "Street View pane beside the transit map."** Options:
   - **A. Separate street screen (Google).** Getting off at a station switches to a full-screen street mode: Street View plus a small **Google** map for "walk to". The MapLibre transit map is hidden while you're on the street. This is the smallest change. "With or near" is broad, though, so it's a grey area rather than clearly compliant.
   - **B. Move the whole game to Google Maps JS.** Fully compliant. Means rewriting the transit map (trains layer as a WebGL overlay). Dynamic Maps: 10k free loads a month.
   - **C. Mapillary (open, CC BY-SA street imagery) instead of Google.** No conflict with MapLibre. Photos can be relayed by the server with attribution, so they stay location-free. The catch: NYC coverage, image quality and street connectivity are unknown. Mapillary imagery comes in capture sequences, not a clean street graph.
2. **Photos.** With Google, the client has to load the panorama itself, so a determined player can always pull the location out of the page. Photos would run on an honor system, like the show. With Mapillary, the server can send a plain image with no location.
3. **Curated zones work with Google.** The 14 St–Union Sq zone is one connected network of 911 panoramas, mapped for free in 79 s. Storing the panorama IDs is allowed.

## Recommended next steps

1. **Mapillary check** (needs a free Mapillary access token from mapillary.com/developer): run the same zone test with Mapillary imagery. Count images, connectivity, capture dates and look at quality around a few stations.
2. If Mapillary is too thin, pick **A** (cheapest) or **B** (cleanest), and enable billing plus a budget cap to finish the Google measurements (navigation billing, the in-panorama marker).
3. Either way, add Google's/Mapillary's attribution and terms links before anything is public.
