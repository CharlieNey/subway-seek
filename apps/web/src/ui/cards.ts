/**
 * Card faces in tile (DESIGN.md, Cards › Card faces; the Deck page, part one), ported from
 * the Deck page's renderer: a frame whose kind is told by pattern as well as color
 * (cobalt double rule for powerups, terra cotta teeth for curses) and a 28 × 28 mosaic
 * emblem of a real thing from the subway and the street above. Only the cards a seeker
 * sees land are here: Veto, Randomize and the five curses in the solo deck.
 */
import type { CardId } from "@stand-clear/engine";
import {
  addRings,
  builder,
  MOSAIC as C,
  canvas2d,
  hash,
  K,
  type MosaicModel,
  quarterOf,
  type Ring,
} from "./tablet.ts";

const P = {
  fog: "#AEB8BD",
  steam: "#FBF8F1",
  greyDark: "#5C5852",
  grey: "#8E8A80",
  sky: "#C9D7DC",
  stone: "#BFA88A",
  patina: "#5E9C8B",
  patinaDeep: "#3F7366",
  limestone: "#D9C7A5",
};
const FAIENCE = "#24479A";
const FAIENCE_DEEP = "#172F6B";

type Draw = (c: CanvasRenderingContext2D) => void;
const G = {
  rect: (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) =>
    c.fillRect(x, y, w, h),
  circ: (c: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  },
  ring: (c: CanvasRenderingContext2D, x: number, y: number, r: number, w: number) => {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.lineWidth = w;
    c.stroke();
  },
  poly: (c: CanvasRenderingContext2D, pts: [number, number][]) => {
    c.beginPath();
    pts.forEach(([x, y], i) => {
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    });
    c.closePath();
    c.fill();
  },
  line: (
    c: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    w: number,
  ) => {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.lineWidth = w;
    c.lineCap = "butt";
    c.stroke();
  },
};

interface EmblemSpec {
  field: string;
  layers: [string, Draw][];
}

/** The emblems, drawn in a 100 × 100 space; the top layer wins per pixel. */
const EMBLEMS: Partial<Record<CardId, () => EmblemSpec>> = {
  // Veto: a brass folding gate.
  veto: () => ({
    field: C.glazeHi,
    layers: [
      ["#3A332B", (c) => G.rect(c, 8, 8, 84, 92)],
      [
        "#B08A3E",
        (c) => {
          for (const x of [8, 47, 86]) G.rect(c, x, 8, 6.5, 92);
          G.rect(c, 8, 8, 85, 7);
          G.rect(c, 8, 90, 85, 7);
          for (const [a, b] of [
            [15, 47],
            [54, 86],
          ] as const) {
            G.line(c, a, 15, b, 90, 5.2);
            G.line(c, a, 90, b, 15, 5.2);
          }
        },
      ],
    ],
  }),
  // Randomize: the old Y-cut subway token.
  randomize: () => ({
    field: C.glazeHi,
    layers: [
      [C.goldDeep, (c) => G.circ(c, 50, 50, 45)],
      [C.gold, (c) => G.circ(c, 50, 50, 39)],
      [C.goldDeep, (c) => G.ring(c, 50, 50, 31, 3.5)],
      [
        C.glazeHi,
        (c) => {
          G.rect(c, 44.5, 50, 11, 27);
          G.poly(c, [
            [50, 58],
            [27, 27],
            [36, 21],
            [50, 42],
            [64, 21],
            [73, 27],
          ]);
        },
      ],
    ],
  }),
  // Fog: a street steam stack.
  fog: () => ({
    field: P.fog,
    layers: [
      [P.greyDark, (c) => G.rect(c, 0, 86, 100, 14)],
      [C.glazeHi, (c) => G.rect(c, 38, 44, 24, 44)],
      [
        C.terra,
        (c) => {
          for (const y of [44, 58, 72]) G.rect(c, 38, y, 24, 7);
        },
      ],
      [
        P.steam,
        (c) => {
          G.circ(c, 50, 34, 14);
          G.circ(c, 35, 26, 13);
          G.circ(c, 65, 22, 14);
          G.circ(c, 50, 12, 11);
          G.circ(c, 24, 12, 9);
          G.circ(c, 78, 9, 9);
          G.circ(c, 86, 30, 8);
        },
      ],
    ],
  }),
  // Signal loss: a subway map torn in two.
  signalLoss: () => ({
    field: C.ink,
    layers: [
      [
        C.glazeHi,
        (c) => {
          G.poly(c, [
            [8, 12],
            [47, 12],
            [42, 30],
            [51, 47],
            [41, 63],
            [49, 79],
            [44, 90],
            [8, 90],
          ]);
          G.poly(c, [
            [57, 10],
            [93, 10],
            [93, 88],
            [55, 88],
            [60, 74],
            [51, 59],
            [61, 43],
            [53, 27],
          ]);
        },
      ],
      ["#D82233", (c) => clip(c, 8, 34, () => G.line(c, 24, 12, 24, 90, 6))],
      ["#F6BC26", (c) => clip(c, 62, 31, () => G.line(c, 77, 10, 77, 88, 6))],
      ["#009952", (c) => clip(c, 8, 33, () => G.line(c, 8, 70, 40, 46, 6))],
      ["#7C858C", (c) => clip(c, 62, 31, () => G.line(c, 62, 54, 93, 54, 6))],
    ],
  }),
  // Wrong way: a U-turn.
  wrongWay: () => ({
    field: C.glazeHi,
    layers: [
      [
        FAIENCE,
        (c) => {
          c.beginPath();
          c.moveTo(72, 94);
          c.lineTo(72, 42);
          c.arc(50, 42, 22, 0, Math.PI, true);
          c.lineTo(28, 58);
          c.lineWidth = 15;
          c.stroke();
        },
      ],
      [
        FAIENCE,
        (c) =>
          G.poly(c, [
            [10, 54],
            [46, 54],
            [28, 82],
          ]),
      ],
    ],
  }),
  // Tourist: the Statue of Liberty.
  tourist: () => ({
    field: P.sky,
    layers: [
      [
        P.stone,
        (c) => {
          G.rect(c, 28, 84, 44, 16);
          G.rect(c, 24, 82, 52, 5);
        },
      ],
      [
        P.patina,
        (c) => {
          G.poly(c, [
            [34, 82],
            [66, 82],
            [60, 44],
            [40, 44],
          ]);
          G.poly(c, [
            [39, 48],
            [61, 48],
            [59, 36],
            [41, 36],
          ]);
          G.circ(c, 50, 30, 7);
          for (let i = 0; i < 5; i++) {
            const a = ((-60 + i * 30) * Math.PI) / 180;
            G.poly(c, [
              [50 - 3 * Math.cos(a), 27 - 3 * Math.sin(a)],
              [50 + 15 * Math.sin(a), 27 - 15 * Math.cos(a)],
              [50 + 3 * Math.cos(a), 27 + 3 * Math.sin(a)],
            ]);
          }
          G.line(c, 42, 40, 31, 14, 7);
        },
      ],
      [
        P.patinaDeep,
        (c) => {
          G.rect(c, 26, 9, 10, 6);
          G.poly(c, [
            [58, 50],
            [68, 47],
            [70, 62],
            [60, 65],
          ]);
          G.line(c, 45, 56, 55, 80, 3);
        },
      ],
      [
        C.gold,
        (c) =>
          G.poly(c, [
            [25, 9],
            [31, 0],
            [37, 9],
          ]),
      ],
    ],
  }),
  // Sidewalk shed: hunter green, lights on. Every edge lands on the tile grid.
  shed: () => {
    const u = 100 / 28;
    const R = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) =>
      G.rect(c, x * u, y * u, w * u, h * u);
    return {
      field: P.sky,
      layers: [
        [P.limestone, (c) => R(c, 0, 0, 28, 13)],
        [
          "#8E7F66",
          (c) => {
            for (const x of [2, 8, 14, 20]) for (const y of [2, 7]) R(c, x, y, 4, 3);
          },
        ],
        ["#5C5852", (c) => R(c, 0, 17, 28, 8)],
        [
          "#2F5B45",
          (c) => {
            R(c, 0, 13, 28, 3);
            for (const x of [1, 9, 17, 25]) R(c, x, 17, 2, 8);
          },
        ],
        ["#4E7F63", (c) => R(c, 0, 16, 28, 1)],
        [
          C.gold,
          (c) => {
            for (const x of [5, 13, 21]) R(c, x, 18, 2, 1);
          },
        ],
        [P.grey, (c) => R(c, 0, 25, 28, 3)],
      ],
    };
  },
};

function clip(c: CanvasRenderingContext2D, x: number, w: number, draw: () => void) {
  c.save();
  c.beginPath();
  c.rect(x, 0, w, 100);
  c.clip();
  draw();
  c.restore();
}

/** The frames: a powerup's cobalt double rule, a curse's terra cotta teeth. */
export const CARD_RINGS: Record<"power" | "curse" | "nichePower" | "nicheCurse", Ring[]> = {
  power: [
    { t: 1, kind: "solid", c: [FAIENCE] },
    { t: 0.5, kind: "solid", c: [C.glazeHi] },
    { t: 0.5, kind: "solid", c: [FAIENCE_DEEP] },
  ],
  curse: [
    { t: 0.5, kind: "solid", c: [C.ink] },
    { t: 1, kind: "zig", c: [C.terra, C.ink] },
    { t: 0.5, kind: "solid", c: [C.ink] },
  ],
  nichePower: [{ t: 0.5, kind: "solid", c: [FAIENCE_DEEP] }],
  nicheCurse: [{ t: 0.5, kind: "solid", c: [C.ink] }],
};

const emblems = new Map<string, MosaicModel>();

/** A card's emblem as tesserae, `cols` tiles square, in its kind's niche. */
export function emblem(card: CardId, kind: "power" | "curse", cols = 28): MosaicModel | null {
  const key = `${card}|${cols}`;
  const hit = emblems.get(key);
  if (hit) return hit;
  const spec = EMBLEMS[card]?.();
  if (!spec) return null;
  const { field, layers } = spec;
  const rings = CARD_RINGS[kind === "power" ? "nichePower" : "nicheCurse"];
  const w = cols * K;
  const h = cols * K;
  const masks = layers.map(([, fn]) => {
    const [, x] = canvas2d(w, h);
    x.save();
    x.scale(w / 100, h / 100);
    x.fillStyle = "#000";
    x.strokeStyle = "#000";
    x.lineJoin = "round";
    fn(x);
    x.restore();
    return x.getImageData(0, 0, w, h).data;
  });
  const top = (px: number, py: number) => {
    const o = (py * w + px) * 4 + 3;
    for (let i = masks.length - 1; i >= 0; i--)
      if (((masks[i] as Uint8ClampedArray)[o] ?? 0) > 110) return i;
    return -1;
  };
  const colorOf = (i: number) => (i < 0 ? field : (layers[i] as [string, Draw])[0]);
  const T = rings.reduce((a, r) => a + r.t, 0);
  const W = cols + 2 * T;
  const H = cols + 2 * T;
  const b = builder(hash(card));
  addRings(b, W, H, rings);
  for (let cy = 0; cy < cols; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const counts = [new Map<number, number>(), new Map(), new Map(), new Map()];
      const all = new Map<number, number>();
      for (let py = 0; py < K; py++)
        for (let pp = 0; pp < K; pp++) {
          const i = top(cx * K + pp, cy * K + py);
          const q = quarterOf((pp + 0.5) / K, (py + 0.5) / K);
          const m = counts[q] as Map<number, number>;
          m.set(i, (m.get(i) ?? 0) + 1);
          all.set(i, (all.get(i) ?? 0) + 1);
        }
      const maj = (m: Map<number, number>) => {
        let bi = -1;
        let bc = -1;
        for (const [k, v] of m)
          if (v > bc) {
            bc = v;
            bi = k;
          }
        return bi;
      };
      const [qt, qr, qb, ql] = counts.map(maj) as [number, number, number, number];
      const X = T + cx;
      const Y = T + cy;
      const role = (i: number) => (i < 0 ? "field" : "art");
      if (qt === qr && qr === qb && qb === ql)
        b.quad(X, Y, 1, 1, colorOf(qt), qt < 0 ? 0.035 : 0.05, role(qt));
      else if (qt === qr && qb === ql && qt !== qb)
        b.tri(X, Y, 1, 1, "UR", colorOf(qt), colorOf(qb), role(qb), role(qt));
      else if (qt === ql && qb === qr && qt !== qb)
        b.tri(X, Y, 1, 1, "UL", colorOf(qt), colorOf(qb), role(qb), role(qt));
      else {
        const m = maj(all);
        b.quad(X, Y, 1, 1, colorOf(m), 0.045, role(m));
      }
    }
  const model = { W, H, tiles: b.tiles, grout: C.grout };
  emblems.set(key, model);
  return model;
}

const frames = new Map<string, MosaicModel & { inset: number; fill: string }>();

/** A card's frame, 44 × 62 tiles (264 × 372 at 6 px a tile). */
export function cardFrame(kind: "power" | "curse"): MosaicModel & { inset: number; fill: string } {
  const hit = frames.get(kind);
  if (hit) return hit;
  const W = 44;
  const H = 62;
  const b = builder(hash(`frame${kind}`));
  const inset = addRings(b, W, H, CARD_RINGS[kind]);
  const model = { W, H, tiles: b.tiles, grout: C.grout, inset, fill: C.glazeHi };
  frames.set(kind, model);
  return model;
}
