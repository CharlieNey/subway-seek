import type { Layer } from "@deck.gl/core";
import { IconLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { type HiderView, type LonLat, sampleTrail } from "@subway-seek/engine";
import type { World } from "../game.ts";
import { stationAtlas } from "./icons.ts";
import { circle, type RGBA } from "./layers.ts";

const INK: RGBA = [36, 32, 27, 255],
  TERRA: RGBA = [185, 83, 47, 255];
/** Own played trail, publicly observed seeker motion, and numbered station exits. */
export function hideLayers(world: World, view: HiderView, t: number): Layer[] {
  const other = world.geo.playerPosition(view.seeker, t);
  const trails = [
    { state: view.ownTrail, color: INK, id: "hider" },
    { state: view.seekerTrail, color: TERRA, id: "seeker" },
  ];
  const layers: Layer[] = trails.map(
    (x) =>
      new PathLayer({
        id: `hide-trail-${x.id}`,
        data: [sampleTrail(world.geo, x.state, view.hideStart, t, 10).map((x) => x.p)],
        getPath: (p: LonLat[]) => p,
        getColor: x.color,
        getWidth: 3,
        widthUnits: "pixels",
      }),
  );
  layers.push(
    new ScatterplotLayer({
      id: "hide-seeker",
      data: [other],
      getPosition: (p: LonLat) => p,
      getFillColor: TERRA,
      getRadius: 7,
      radiusUnits: "pixels",
      stroked: true,
      getLineColor: [251, 248, 241, 255],
      getLineWidth: 2,
      lineWidthUnits: "pixels",
    }),
    new TextLayer({
      id: "hide-seeker-label",
      data: [other],
      getPosition: (p: LonLat) => p,
      getText: () => "Seeker",
      getSize: 12,
      getColor: INK,
      // Left of the dot: "You" is on the right (layers.ts), and both start at the same hub.
      getPixelOffset: [-12, -10],
      getTextAnchor: "end",
      fontFamily: "Libre Franklin",
      fontWeight: 700,
      fontSettings: { sdf: true },
      outlineWidth: 3,
      outlineColor: [251, 248, 241, 255],
    }),
  );
  if (view.zone) {
    layers.push(
      new PathLayer({
        id: "hide-zone",
        data: [circle(view.zone.lat, view.zone.lon, view.zone.radius)],
        getPath: (p: LonLat[]) => p,
        getColor: TERRA,
        getWidth: 2,
        widthUnits: "pixels",
      }),
    );
    if (!view.lock) {
      const atlas = stationAtlas();
      layers.push(
        new IconLayer({
          id: "hide-exit-tiles",
          data: view.exits,
          iconAtlas: atlas.url,
          iconMapping: atlas.mapping,
          getIcon: () => "possible",
          getPosition: (e: HiderView["exits"][number]) => [e.lon, e.lat],
          getSize: 18,
          getColor: INK,
        }),
        new TextLayer({
          id: "hide-exit-numbers",
          data: view.exits,
          getPosition: (e: HiderView["exits"][number]) => [e.lon, e.lat],
          getText: (e: HiderView["exits"][number]) => String(e.exit + 1),
          getSize: 11,
          getColor: [251, 248, 241, 255],
          fontWeight: 700,
        }),
      );
    }
  }
  return layers;
}
