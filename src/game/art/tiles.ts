// 16x16 floor / ground / wall tiles, rendered into a single horizontal strip.

import { PAL } from './palette';
import { type Ctx, makeCanvas, hash2, px, rect, hline, vline, ellipse, dither, mix } from './draw';

export const TILE = 16;

export const TILE_NAMES = [
  'void',
  'wood',
  'kitchen',
  'bath',
  'wallTop',
  'wallFace',
  'grass',
  'grassFlowers',
  'road',
  'roadLine',
  'sidewalk',
  'storeFloor',
  'doormat',
  'crosswalk',
  'path',
  'clinicFloor',
  'rug',
  'hedge',
  'fence',
  'water',
] as const;

export type TileName = (typeof TILE_NAMES)[number];

export const TILE_INDEX = Object.fromEntries(TILE_NAMES.map((n, i) => [n, i])) as Record<TileName, number>;

const T = TILE;

/** Seamless low-frequency value noise (period 16). */
function lowNoise(x: number, y: number, seed: number, cell = 4): number {
  const n = T / cell;
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const v = (i: number, j: number) => hash2(((i % n) + n) % n, ((j % n) + n) % n, seed);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
  const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

function each(fn: (x: number, y: number) => void) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) fn(x, y);
}

// ---------------------------------------------------------------- tiles ---

function tVoid(ctx: Ctx) {
  rect(ctx, 0, 0, T, T, '#120d1a');
  each((x, y) => {
    if (hash2(x, y, 1) < 0.06) px(ctx, x, y, '#1b1325');
  });
}

function tWood(ctx: Ctx) {
  // four 4px planks, honey-teak
  const tones = ['#b0703f', '#a8673f', '#b57a48', '#a26340'];
  for (let p = 0; p < 4; p++) {
    const y0 = p * 4;
    const base = tones[p];
    rect(ctx, 0, y0, T, 4, base);
    hline(ctx, 0, y0, T, mix(base, PAL.wood[4], 0.45));
    hline(ctx, 0, y0 + 3, T, mix(base, PAL.wood[1], 0.6));
    // grain streaks
    for (let x = 0; x < T; x++) {
      const h = hash2(x, p, 7);
      if (h < 0.22) px(ctx, x, y0 + 1 + (h < 0.11 ? 0 : 1), mix(base, PAL.wood[1], 0.35));
      else if (h > 0.9) px(ctx, x, y0 + 1, mix(base, PAL.wood[4], 0.35));
    }
    // plank seam
    const sx = (p * 7 + 3) % T;
    vline(ctx, sx, y0, 3, mix(base, PAL.wood[1], 0.7));
    vline(ctx, (sx + 1) % T, y0, 3, mix(base, PAL.wood[4], 0.3));
    // knot
    if (p === 1 || p === 3) {
      const kx = (sx + 6 + p) % T;
      px(ctx, kx, y0 + 1, PAL.wood[2]);
      px(ctx, (kx + 1) % T, y0 + 1, mix(base, PAL.wood[1], 0.5));
    }
  }
}

function tKitchen(ctx: Ctx) {
  const cream = ['#f2e6cf', '#e6d6b8'];
  const terra = ['#c86e52', '#a85740'];
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      const c = (tx + ty) % 2 === 0 ? cream : terra;
      const x0 = tx * 8;
      const y0 = ty * 8;
      rect(ctx, x0, y0, 8, 8, c[0]);
      hline(ctx, x0, y0 + 7, 8, c[1]);
      vline(ctx, x0 + 7, y0, 8, c[1]);
      // gloss
      px(ctx, x0 + 2, y0 + 2, '#fffaf0');
      px(ctx, x0 + 3, y0 + 2, mix(c[0], '#ffffff', 0.5));
      px(ctx, x0 + 2, y0 + 3, mix(c[0], '#ffffff', 0.5));
      if (c === terra) {
        // tiny star motif
        px(ctx, x0 + 4, y0 + 4, '#e9b48e');
      }
    }
  // grout
  for (let i = 0; i < T; i++) {
    px(ctx, i, 0, '#cbbba0');
    px(ctx, i, 8, '#cbbba0');
    px(ctx, 0, i, '#cbbba0');
    px(ctx, 8, i, '#cbbba0');
  }
}

function tBath(ctx: Ctx) {
  each((x, y) => {
    const gx = x % 4 === 0;
    const gy = y % 4 === 0;
    if (gx || gy) {
      px(ctx, x, y, '#a9bfcc');
      return;
    }
    const tile = Math.floor(x / 4) + Math.floor(y / 4) * 4;
    const accent = tile === 5 || tile === 15;
    let c = accent ? '#6fa7c4' : '#dceef4';
    if (x % 4 === 1 && y % 4 === 1) c = accent ? '#9ccbe0' : '#ffffff';
    if (x % 4 === 3 || y % 4 === 3) c = accent ? '#5a92b0' : '#c6dfe9';
    px(ctx, x, y, c);
  });
}

function tWallTop(ctx: Ctx) {
  const r = PAL.plaster;
  each((x, y) => {
    const n = lowNoise(x, y, 11, 8);
    let c = n > 0.55 ? r[2] : r[1];
    if (dither(x, y, Math.abs(n - 0.55) < 0.06 ? 0.5 : n > 0.55 ? 1 : 0)) c = r[2];
    const h = hash2(x, y, 12);
    if (h < 0.08) c = r[0];
    else if (h > 0.95) c = r[3];
    px(ctx, x, y, c);
  });
}

function tWallFace(ctx: Ctx) {
  const c = PAL.cream;
  rect(ctx, 0, 0, T, 13, c[3]);
  // vertical damask stripes
  for (let y = 0; y < 13; y++) {
    px(ctx, 0, y, mix(c[3], c[2], 0.55));
    px(ctx, 8, y, mix(c[3], c[2], 0.55));
  }
  // small diamond motifs
  const motif = (cx: number, cy: number) => {
    px(ctx, cx, cy - 1, c[2]);
    px(ctx, cx - 1, cy, c[2]);
    px(ctx, cx + 1, cy, c[2]);
    px(ctx, cx, cy + 1, c[2]);
    px(ctx, cx, cy, '#e8a98a');
  };
  motif(4, 4);
  motif(12, 9);
  px(ctx, 12, 2, c[2]);
  px(ctx, 4, 10, c[2]);
  // ambient occlusion under the wall top
  hline(ctx, 0, 0, T, c[1]);
  hline(ctx, 0, 1, T, c[2]);
  // skirting board
  hline(ctx, 0, 12, T, mix(c[2], c[1], 0.5));
  hline(ctx, 0, 13, T, PAL.wood[4]);
  hline(ctx, 0, 14, T, PAL.wood[3]);
  hline(ctx, 0, 15, T, PAL.wood[1]);
  px(ctx, 5, 14, PAL.wood[2]);
  px(ctx, 13, 14, PAL.wood[2]);
}

function grassBase(ctx: Ctx, seed: number) {
  const g = PAL.grass;
  each((x, y) => {
    const n = lowNoise(x, y, seed, 8);
    let c = g[2];
    if (dither(x, y, (n - 0.25) * 1.6)) c = g[3];
    if (n < 0.3 && dither(x + 1, y, (0.3 - n) * 3)) c = g[1];
    const h = hash2(x, y, seed + 3);
    if (h < 0.05) c = g[1];
    px(ctx, x, y, c);
  });
  // blade tufts: highlight over shadow
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(hash2(i, 1, seed + 9) * T);
    const y = Math.floor(hash2(i, 2, seed + 9) * (T - 1));
    px(ctx, x, y + 1, g[1]);
    px(ctx, x, y, g[4]);
    if (i % 3 === 0) px(ctx, (x + 1) % T, y + 1, g[3]);
  }
}

function tGrass(ctx: Ctx) {
  grassBase(ctx, 21);
}

function tGrassFlowers(ctx: Ctx) {
  grassBase(ctx, 23);
  const flower = (x: number, y: number, petal: string, centre: string) => {
    px(ctx, x, y + 2, PAL.grass[1]);
    px(ctx, x, y - 1, petal);
    px(ctx, x - 1, y, petal);
    px(ctx, x + 1, y, petal);
    px(ctx, x, y + 1, petal);
    px(ctx, x, y, centre);
  };
  flower(3, 3, '#fffcf5', PAL.yellow[3]);
  flower(11, 6, PAL.pink[3], PAL.yellow[4]);
  flower(6, 11, PAL.yellow[3], PAL.orange[2]);
  flower(13, 13, '#fffcf5', PAL.yellow[3]);
  px(ctx, 9, 2, PAL.purple[3]);
  px(ctx, 1, 9, PAL.pink[3]);
}

function asphalt(ctx: Ctx, seed: number) {
  const a = PAL.asphalt;
  each((x, y) => {
    const h = hash2(x, y, seed);
    let c = a[2];
    if (h < 0.18) c = a[1];
    else if (h > 0.9) c = a[3];
    else if (h > 0.985) c = a[4];
    px(ctx, x, y, c);
  });
  px(ctx, 5, 9, a[4]);
  px(ctx, 12, 3, a[4]);
}

function tRoad(ctx: Ctx) {
  asphalt(ctx, 31);
  // faint crack
  px(ctx, 9, 12, PAL.asphalt[0]);
  px(ctx, 10, 13, PAL.asphalt[0]);
  px(ctx, 11, 13, PAL.asphalt[0]);
}

function tRoadLine(ctx: Ctx) {
  asphalt(ctx, 33);
  rect(ctx, 3, 7, 10, 2, '#ece6d4');
  hline(ctx, 3, 8, 10, '#c9c2b0');
  px(ctx, 6, 7, '#d6cfbd');
  px(ctx, 10, 8, '#a8a294');
}

function tSidewalk(ctx: Ctx) {
  const p = PAL.paver;
  const paver = (x0: number, y0: number, w: number, tint: number) => {
    const base = tint > 0.5 ? p[3] : mix(p[3], p[2], 0.35);
    rect(ctx, x0, y0, w, 8, base);
    hline(ctx, x0, y0, w, p[4]);
    vline(ctx, x0, y0, 8, mix(base, p[4], 0.5));
    hline(ctx, x0, y0 + 7, w, p[1]);
    vline(ctx, x0 + w - 1, y0, 8, p[1]);
    for (let j = 1; j < 7; j++)
      for (let i = 1; i < w - 1; i++) if (hash2(x0 + i, y0 + j, 41) < 0.08) px(ctx, x0 + i, y0 + j, p[2]);
  };
  paver(0, 0, 8, 0.7);
  paver(8, 0, 8, 0.2);
  // row 2 offset by 4 (wraps)
  paver(4, 8, 8, 0.6);
  paver(12, 8, 8, 0.3);
  paver(-4, 8, 8, 0.3);
}

function tStoreFloor(ctx: Ctx) {
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      const x0 = tx * 8;
      const y0 = ty * 8;
      const base = (tx + ty) % 2 ? '#eef0ec' : '#f6f6f1';
      rect(ctx, x0, y0, 8, 8, base);
      hline(ctx, x0 + 1, y0 + 6, 6, '#e0e2dc');
      // diagonal shine
      px(ctx, x0 + 5, y0 + 2, '#ffffff');
      px(ctx, x0 + 4, y0 + 3, '#ffffff');
      px(ctx, x0 + 6, y0 + 2, '#fdfdfb');
    }
  for (let i = 0; i < T; i++) {
    px(ctx, i, 7, '#c9cdc6');
    px(ctx, i, 15, '#c9cdc6');
    px(ctx, 7, i, '#c9cdc6');
    px(ctx, 15, i, '#c9cdc6');
  }
}

function tDoormat(ctx: Ctx) {
  const d = PAL.dirt;
  rect(ctx, 0, 0, T, T, PAL.wood[2]);
  rect(ctx, 1, 1, 14, 14, PAL.wood[0]);
  rect(ctx, 2, 2, 12, 12, d[3]);
  each((x, y) => {
    if (x < 2 || y < 2 || x > 13 || y > 13) return;
    if ((x + y) % 3 === 0) px(ctx, x, y, d[2]);
    else if (hash2(x, y, 51) > 0.85) px(ctx, x, y, d[4]);
  });
  // inner red border stripe
  for (let i = 3; i < 13; i++) {
    px(ctx, i, 3, PAL.red[2]);
    px(ctx, i, 12, PAL.red[2]);
    px(ctx, 3, i, PAL.red[2]);
    px(ctx, 12, i, PAL.red[2]);
  }
  hline(ctx, 1, 15, 14, PAL.dark[2]);
}

function tCrosswalk(ctx: Ctx) {
  asphalt(ctx, 61);
  for (const sx of [2, 10]) {
    rect(ctx, sx, 0, 4, T, '#ece6d4');
    vline(ctx, sx + 3, 0, T, '#cfc8b6');
    for (let y = 0; y < T; y++) if (hash2(sx, y, 62) < 0.12) px(ctx, sx + 1 + (y % 2), y, '#b5ae9e');
  }
}

function tPath(ctx: Ctx) {
  const d = PAL.dirt;
  each((x, y) => {
    const n = lowNoise(x, y, 71, 8);
    let c = d[3];
    if (dither(x, y, (0.5 - n) * 2)) c = d[2];
    const h = hash2(x, y, 72);
    if (h > 0.93) c = d[4];
    px(ctx, x, y, c);
  });
  const pebble = (x: number, y: number) => {
    px(ctx, x, y, PAL.stone[3]);
    px(ctx, x + 1, y, PAL.stone[4]);
    px(ctx, x, y + 1, PAL.stone[1]);
    px(ctx, x + 1, y + 1, PAL.stone[2]);
  };
  pebble(3, 4);
  pebble(11, 10);
  px(ctx, 8, 2, PAL.stone[3]);
  px(ctx, 5, 13, PAL.stone[3]);
  px(ctx, 14, 5, PAL.stone[2]);
}

function tClinicFloor(ctx: Ctx) {
  each((x, y) => {
    const h = hash2(x, y, 81);
    let c = '#d4e6df';
    if (h < 0.08) c = '#b9d3ca';
    else if (h > 0.94) c = '#eef7f3';
    px(ctx, x, y, c);
  });
  hline(ctx, 0, 15, T, '#b2cbc2');
  vline(ctx, 15, 0, T, '#b2cbc2');
  px(ctx, 3, 3, '#ffffff');
  px(ctx, 4, 3, '#f4fbf8');
}

function tRug(ctx: Ctx) {
  const base = PAL.red[1];
  each((x, y) => {
    const dx = Math.abs(x - 7.5);
    const dy = Math.abs(y - 7.5);
    const d = dx + dy;
    let c = base;
    if (dither(x, y, 0.15)) c = mix(base, PAL.red[0], 0.4);
    if (Math.abs(d - 7) < 0.6) c = PAL.yellow[2];
    else if (Math.abs(d - 6) < 0.6) c = PAL.red[2];
    else if (d <= 1.1) c = '#f4e2c0';
    else if (Math.abs(d - 3) < 0.6) c = PAL.yellow[3];
    else if (Math.abs(d - 2) < 0.6) c = PAL.teal[1];
    px(ctx, x, y, c);
  });
}

function tHedge(ctx: Ctx) {
  const l = PAL.leaf;
  rect(ctx, 0, 0, T, T, l[1]);
  each((x, y) => {
    if (hash2(x, y, 91) < 0.2) px(ctx, x, y, l[0]);
  });
  const clusters: [number, number][] = [
    [3, 3],
    [11, 2],
    [7, 8],
    [15, 9],
    [2, 13],
    [11, 14],
  ];
  for (const [cx, cy] of clusters)
    for (const ox of [-16, 0, 16])
      for (const oy of [-16, 0, 16]) {
        const x = cx + ox;
        const y = cy + oy;
        ellipse(ctx, x - 3, y - 2, 7, 6, l[0]);
        ellipse(ctx, x - 3, y - 3, 7, 6, l[2]);
        ellipse(ctx, x - 2, y - 3, 4, 3, l[3]);
        px(ctx, x - 1, y - 2, l[4]);
      }
}

function tFence(ctx: Ctx) {
  grassBase(ctx, 25);
  const w = PAL.white;
  // shadow on grass
  for (let x = 0; x < T; x++) {
    px(ctx, x, 14, PAL.grass[1]);
    if (x % 4 !== 3) px(ctx, x, 15, PAL.grass[1]);
  }
  // rails behind
  for (const ry of [5, 10]) {
    hline(ctx, 0, ry, T, PAL.oak[2]);
    hline(ctx, 0, ry + 1, T, PAL.oak[1]);
  }
  // pickets
  for (let i = 0; i < 4; i++) {
    const x0 = i * 4;
    rect(ctx, x0, 3, 3, 11, w[3]);
    px(ctx, x0 + 1, 2, w[4]);
    vline(ctx, x0, 3, 11, w[4]);
    vline(ctx, x0 + 2, 3, 11, w[1]);
    px(ctx, x0, 3, w[2]);
    px(ctx, x0 + 2, 3, w[0]);
    hline(ctx, x0, 13, 3, w[1]);
    px(ctx, x0 + 1, 6, w[2]);
    px(ctx, x0 + 1, 11, w[2]);
  }
}

function tWater(ctx: Ctx) {
  const wa = PAL.water;
  each((x, y) => {
    const n = lowNoise(x, y, 101, 8);
    let c = wa[2];
    if (dither(x, y, (0.45 - n) * 2.2)) c = wa[1];
    px(ctx, x, y, c);
  });
  const wave = (x: number, y: number) => {
    px(ctx, x, y + 1, wa[3]);
    px(ctx, (x + 1) % T, y, wa[4]);
    px(ctx, (x + 2) % T, y, wa[4]);
    px(ctx, (x + 3) % T, y + 1, wa[3]);
  };
  wave(2, 3);
  wave(9, 8);
  wave(4, 13);
  wave(13, 1);
  px(ctx, 12, 12, wa[4]);
}

const DRAWERS: Record<TileName, (ctx: Ctx) => void> = {
  void: tVoid,
  wood: tWood,
  kitchen: tKitchen,
  bath: tBath,
  wallTop: tWallTop,
  wallFace: tWallFace,
  grass: tGrass,
  grassFlowers: tGrassFlowers,
  road: tRoad,
  roadLine: tRoadLine,
  sidewalk: tSidewalk,
  storeFloor: tStoreFloor,
  doormat: tDoormat,
  crosswalk: tCrosswalk,
  path: tPath,
  clinicFloor: tClinicFloor,
  rug: tRug,
  hedge: tHedge,
  fence: tFence,
  water: tWater,
};

let cached: HTMLCanvasElement | null = null;

/** One horizontal strip: TILE_NAMES.length * 16 wide, 16 tall. */
export function drawTileset(): HTMLCanvasElement {
  if (cached) return cached;
  const [c, ctx] = makeCanvas(TILE_NAMES.length * T, T);
  TILE_NAMES.forEach((name, i) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(i * T, 0, T, T);
    ctx.clip();
    ctx.translate(i * T, 0);
    DRAWERS[name](ctx);
    ctx.restore();
  });
  cached = c;
  return c;
}

/** Convenience: a single tile as its own 16x16 canvas. */
export function drawTile(name: TileName): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(T, T);
  ctx.drawImage(drawTileset(), TILE_INDEX[name] * T, 0, T, T, 0, 0, T, T);
  return c;
}
