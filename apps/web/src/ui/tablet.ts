/**
 * Mosaic name tablets: Josefin capitals set as tesserae, with grout and a frame, as on
 * the IRT's station walls. Ported from the Deck page's tile renderer. A model is in tile
 * units; `paintAt` draws it into a canvas at a CSS width.
 *
 * Text is sampled from a canvas render of the font, so Josefin Sans must be loaded first
 * (`fontsReady`). Models are cached per text and style: there are 424 complexes.
 */

/** Sampling pixels per tile. */
export const K = 8;

export const MOSAIC = {
  glaze: "#F4EFE3",
  glazeHi: "#FBF8F1",
  grout: "#D8CFBC",
  buff: "#C9A877",
  buffDeep: "#A9874F",
  ink: "#24201B",
  faience: "#24479A",
  faienceDeep: "#172F6B",
  terra: "#B9532F",
  gold: "#C99A3A",
  goldDeep: "#8E6A14",
  green: "#3D6B4E",
  greenDeep: "#28483A",
} as const;
const C = MOSAIC;

const FONT = (px: number) => `700 ${px}px "Josefin Sans", "Futura", "Century Gothic", sans-serif`;

type Pt = [number, number];
export interface Tile {
  kind: "q" | "t";
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** A random number per tile, for staggered reveals. */
  r: number;
  role: string;
  color: string;
  poly: Pt[];
}
export interface MosaicModel {
  W: number;
  H: number;
  tiles: Tile[];
  grout: string;
}

export interface Ring {
  t: number;
  kind: "solid" | "zig" | "checker";
  c: string[];
}

export function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
};

export function canvas2d(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) throw new Error("2D canvas unavailable");
  return [c, x] as const;
}

/** Which quarter of a cell (u, v in 0–1) a point is in: top, right, bottom, left. */
export const quarterOf = (u: number, v: number) =>
  v < u && v < 1 - u ? 0 : v > u && v > 1 - u ? 2 : u < v && u < 1 - v ? 3 : 1;

export function builder(seed: number) {
  const rnd = mulberry(seed);
  const tiles: Tile[] = [];
  const tint = (hex: string, amt: number) => {
    const f = 1 + (rnd() - 0.5) * 2 * amt;
    return `rgb(${rgb(hex)
      .map((v) => Math.max(0, Math.min(255, Math.round(v * f))))
      .join(",")})`;
  };
  const jt = (m: number) => (rnd() - 0.5) * 2 * 0.06 * m;
  const quad = (
    x: number,
    y: number,
    w: number,
    h: number,
    col: string,
    amt = 0.045,
    role = "field",
  ) => {
    const m = Math.min(w, h);
    tiles.push({
      kind: "q",
      w,
      h,
      cx: x + w / 2,
      cy: y + h / 2,
      r: rnd(),
      role,
      color: tint(col, amt),
      poly: [
        [x + jt(m), y + jt(m)],
        [x + w + jt(m), y + jt(m)],
        [x + w + jt(m), y + h + jt(m)],
        [x + jt(m), y + h + jt(m)],
      ],
    });
  };
  const tri = (
    x: number,
    y: number,
    w: number,
    h: number,
    which: "UR" | "LL" | "UL" | "LR",
    cin: string,
    cout: string,
    role = "field",
    roleIn = "letter",
  ) => {
    const A: Pt = [x, y];
    const B: Pt = [x + w, y];
    const Cc: Pt = [x + w, y + h];
    const D: Pt = [x, y + h];
    const halves: Record<typeof which, [Pt[], Pt[]]> = {
      UR: [
        [A, B, Cc],
        [A, Cc, D],
      ],
      LL: [
        [A, Cc, D],
        [A, B, Cc],
      ],
      UL: [
        [A, B, D],
        [B, Cc, D],
      ],
      LR: [
        [B, Cc, D],
        [A, B, D],
      ],
    };
    const [pin, pout] = halves[which];
    const r = rnd();
    const base = { kind: "t" as const, w, h, cx: x + w / 2, cy: y + h / 2, r };
    tiles.push({ ...base, role: roleIn, color: tint(cin, 0.05), poly: pin });
    tiles.push({ ...base, role, color: tint(cout, 0.04), poly: pout });
  };
  return { tiles, quad, tri };
}

export function addRings(
  b: ReturnType<typeof builder>,
  W: number,
  H: number,
  rings: Ring[],
): number {
  let d = 0;
  for (const ring of rings) {
    const t = ring.t;
    let k = 0;
    const put = (x: number, y: number, w: number, h: number) => {
      const n = k++;
      const [c0 = C.ink, c1 = C.ink] = ring.c;
      if (ring.kind === "zig") b.tri(x, y, w, h, n % 2 ? "UL" : "UR", c0, c1, "ring", "ring");
      else if (ring.kind === "checker") b.quad(x, y, w, h, n % 2 ? c1 : c0, 0.04, "ring");
      else b.quad(x, y, w, h, c0, 0.035, "ring");
    };
    for (let x = d; x < W - d - 1e-6; x += 1) put(x, d, Math.min(1, W - d - x), t);
    k = 0;
    for (let x = d; x < W - d - 1e-6; x += 1) put(x, H - d - t, Math.min(1, W - d - x), t);
    k = 0;
    for (let y = d + t; y < H - d - t - 1e-6; y += 1) {
      put(d, y, t, Math.min(1, H - d - t - y));
      put(W - d - t, y, t, Math.min(1, H - d - t - y));
    }
    d += t;
  }
  return d;
}

function textCells(text: string, rows: number, track: number) {
  const [, x0] = canvas2d(4, 4);
  x0.font = FONT(100);
  const capRatio = (x0.measureText("H").actualBoundingBoxAscent || 72) / 100;
  const fpx = (rows * K) / capRatio;
  x0.font = FONT(fpx);
  const chars = [...text];
  const adv = chars.map((ch) => x0.measureText(ch).width);
  const tr = track * fpx;
  const w = adv.reduce((a, b) => a + b, 0) + tr * Math.max(0, chars.length - 1);
  const cols = Math.ceil(w / K) + 2;
  const trows = rows + 2;
  const [c, x] = canvas2d(cols * K, trows * K);
  x.font = FONT(fpx);
  x.fillStyle = "#000";
  x.textBaseline = "alphabetic";
  let px = K;
  chars.forEach((ch, i) => {
    x.fillText(ch, px, (rows + 1) * K);
    px += (adv[i] ?? 0) + tr;
  });
  const data = x.getImageData(0, 0, c.width, c.height).data;
  const cells: number[][][] = [];
  for (let cy = 0; cy < trows; cy++) {
    const row: number[][] = [];
    for (let cx = 0; cx < cols; cx++) {
      const q = [0, 0, 0, 0];
      const n = [0, 0, 0, 0];
      for (let py = 0; py < K; py++)
        for (let pp = 0; pp < K; pp++) {
          const a = (data[((cy * K + py) * c.width + cx * K + pp) * 4 + 3] ?? 0) / 255;
          const i = quarterOf((pp + 0.5) / K, (py + 0.5) / K);
          q[i] = (q[i] ?? 0) + a;
          n[i] = (n[i] ?? 0) + 1;
        }
      row.push(q.map((s, i) => s / (n[i] ?? 1)));
    }
    cells.push(row);
  }
  return { cols, trows, cells };
}

type Cut = "full" | "none" | "UR" | "LL" | "UL" | "LR";

function classify([t = 0, r = 0, b = 0, l = 0]: number[]): Cut {
  const tot = (t + r + b + l) / 4;
  if (tot > 0.62) return "full";
  if (tot < 0.16) return "none";
  const halves: [Cut, number, number][] = [
    ["UR", (t + r) / 2, (b + l) / 2],
    ["LL", (b + l) / 2, (t + r) / 2],
    ["UL", (t + l) / 2, (b + r) / 2],
    ["LR", (b + r) / 2, (t + l) / 2],
  ];
  let best: Cut = "none";
  let bs = -1;
  for (const [k, i, o] of halves)
    if (i - o > bs) {
      bs = i - o;
      best = k;
    }
  if (bs > 0.42) return best;
  return tot >= 0.45 ? "full" : "none";
}

interface Preset {
  field: string;
  letter: string;
  rings: Ring[];
}

/** Frames: IRT faience for stations, gold for Found, terra cotta teeth for curses. */
export const TABLET_STYLES = {
  irt: {
    field: C.glazeHi,
    letter: C.ink,
    rings: [
      { t: 0.5, kind: "solid", c: [C.faienceDeep] },
      { t: 1, kind: "zig", c: [C.terra, C.buff] },
      { t: 1, kind: "solid", c: [C.faience] },
      { t: 0.5, kind: "solid", c: [C.buff] },
    ],
  },
  "irt-gold": {
    field: C.glazeHi,
    letter: C.ink,
    rings: [
      { t: 0.5, kind: "solid", c: [C.goldDeep] },
      { t: 1, kind: "zig", c: [C.gold, C.glazeHi] },
      { t: 0.5, kind: "solid", c: [C.goldDeep] },
    ],
  },
  "irt-curse": {
    field: C.glazeHi,
    letter: C.ink,
    rings: [
      { t: 0.5, kind: "solid", c: [C.ink] },
      { t: 1, kind: "zig", c: [C.terra, C.ink] },
      { t: 0.5, kind: "solid", c: [C.ink] },
    ],
  },
  bare: { field: C.glazeHi, letter: C.ink, rings: [] },
} satisfies Record<string, Preset>;

export type TabletStyle = keyof typeof TABLET_STYLES;

const cache = new Map<string, MosaicModel>();

/** A name set in tesserae, framed. `rows` is the cap height in tiles. */
export function tablet(text: string, style: TabletStyle = "irt", rows = 9): MosaicModel {
  const key = `${style}|${rows}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { field, letter, rings } = TABLET_STYLES[style] as Preset;
  const padX = 3;
  const padY = 2;
  const upper = (text || " ").toUpperCase();
  const L = textCells(upper, rows, 0.13);
  const pY = Math.max(0, padY - 1);
  const fw = L.cols + 2 * padX;
  const fh = L.trows + 2 * pY;
  const T = rings.reduce((a, r) => a + r.t, 0);
  const W = fw + 2 * T;
  const H = fh + 2 * T;
  const b = builder(hash(upper + style));
  addRings(b, W, H, rings);
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++) {
      const cx = x - padX;
      const cy = y - pY;
      const cell = cy >= 0 && cy < L.trows && cx >= 0 && cx < L.cols ? L.cells[cy]?.[cx] : null;
      const kind = cell ? classify(cell) : "none";
      const X = T + x;
      const Y = T + y;
      if (kind === "full") b.quad(X, Y, 1, 1, letter, 0.05, "letter");
      else if (kind === "none") b.quad(X, Y, 1, 1, field, 0.035, "field");
      else b.tri(X, Y, 1, 1, kind, letter, field, "field", "letter");
    }
  const model = { W, H, tiles: b.tiles, grout: C.grout };
  cache.set(key, model);
  return model;
}

export interface DrawOptions {
  x?: number;
  y?: number;
  /** Canvas units per tile. */
  tile?: number;
  /** Per-tile reveal, 0–1, for tiles that set one by one. */
  reveal?: ((t: Tile) => number) | null;
  /** The grout bed's opacity, 0–1, so a setting tablet's bed can come in first. */
  groutAlpha?: number;
  /** Grout width in canvas units. */
  gpx?: number | null;
}

export function draw(ctx: CanvasRenderingContext2D, model: MosaicModel, opts: DrawOptions = {}) {
  const { x = 0, y = 0, tile = 6, reveal = null, gpx = null, groutAlpha = 1 } = opts;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(tile, tile);
  ctx.globalAlpha = groutAlpha;
  ctx.fillStyle = model.grout;
  ctx.fillRect(0, 0, model.W, model.H);
  ctx.globalAlpha = 1;
  const g = (gpx ?? Math.max(0.75, tile * 0.13)) / tile;
  for (const t of model.tiles) {
    let v = 1;
    if (reveal) {
      v = Math.min(1, reveal(t));
      if (v <= 0) continue;
    }
    const sc = reveal ? 0.55 + 0.45 * v : 1;
    const p = t.poly;
    let cx = 0;
    let cy = 0;
    for (const q of p) {
      cx += q[0];
      cy += q[1];
    }
    cx /= p.length;
    cy /= p.length;
    let sx: number;
    let sy: number;
    if (t.kind === "q") {
      sx = (1 - g / t.w) * sc;
      sy = (1 - g / t.h) * sc;
    } else {
      sx = sy = (1 - (1.7 * g) / Math.min(t.w, t.h)) * sc;
    }
    ctx.beginPath();
    p.forEach(([px, py], i) => {
      const X = cx + (px - cx) * sx;
      const Y = cy + (py - cy) * sy;
      if (i) ctx.lineTo(X, Y);
      else ctx.moveTo(X, Y);
    });
    ctx.closePath();
    ctx.globalAlpha = v;
    ctx.fillStyle = t.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Paint a model into a canvas at a CSS width, crisp at any device pixel ratio. */
export function paintAt(
  canvas: HTMLCanvasElement,
  model: MosaicModel,
  cssW: number,
  reveal: DrawOptions["reveal"] = null,
  groutAlpha = 1,
) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const tile = cssW / model.W;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(model.H * tile * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.aspectRatio = `${model.W} / ${model.H}`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  draw(ctx, model, {
    tile: tile * dpr,
    reveal,
    groutAlpha,
    gpx: Math.max(0.75, tile * 0.13) * dpr,
  });
}

/**
 * A tablet setting tile by tile, left to right, over `ms` (DESIGN.md, Motion › Found: set,
 * 900 ms): the grout bed comes in over its first 120 ms, then each tile sets in 160 ms as
 * the sweep reaches its center. Returns a stop function.
 */
export function setIn(canvas: HTMLCanvasElement, model: MosaicModel, cssW: number, ms: number) {
  const start = performance.now();
  const span = Math.max(0, ms - 160);
  const decel = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
  let id = 0;
  const frame = () => {
    const u = performance.now() - start;
    paintAt(
      canvas,
      model,
      cssW,
      (tl) => decel((u - (tl.cx / model.W) * span) / 160),
      Math.min(1, u / 120),
    );
    if (u < ms) id = requestAnimationFrame(frame);
  };
  frame();
  return () => cancelAnimationFrame(id);
}

let fonts: Promise<void> | null = null;

/** Resolves once Josefin Sans can be measured (tablets sample it). */
export function fontsReady(): Promise<void> {
  fonts ??= document.fonts
    .load(FONT(100))
    .then(() => undefined)
    .catch(() => undefined);
  return fonts;
}
