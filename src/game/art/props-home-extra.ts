// Extra home props: keys, laundry, cooking states, table setting, small decor.

import { PAL, OUTLINE, type Ramp } from './palette';
import { type Ctx, px, rect, hline, vline, ellipse, line, sprite, hash2, outlineInner } from './draw';
import { block, grain, drawer } from './kit';
import type { PropDef } from './props';

const WD = PAL.wood;
const WH = PAL.white;
const M = PAL.metal;
const D = PAL.dark;

// ------------------------------------------------------------------ keys ---

function keyHook(ctx: Ctx, keys: boolean) {
  // wooden plate with a little house roof
  rect(ctx, 1, 2, 10, 5, WD[2]);
  hline(ctx, 1, 2, 10, WD[4]);
  hline(ctx, 1, 6, 10, WD[1]);
  sprite(ctx, 3, 0, ['..##..', '.####.'], { '#': WD[3] });
  px(ctx, 5, 0, WD[4]);
  // pegs
  for (const x of [3, 8]) {
    px(ctx, x, 4, M[4]);
    px(ctx, x, 7, M[2]);
  }
  if (!keys) {
    px(ctx, 3, 8, M[1]);
    px(ctx, 8, 8, M[1]);
    return;
  }
  // chunky key bunch hanging from the left peg: ring + big brass key + silver key
  rect(ctx, 1, 7, 3, 3, M[3]);
  px(ctx, 2, 8, M[1]);
  rect(ctx, 4, 6, 5, 4, PAL.yellow[3]);
  hline(ctx, 4, 6, 5, PAL.yellow[4]);
  px(ctx, 6, 7, PAL.yellow[1]);
  rect(ctx, 5, 10, 3, 2, PAL.yellow[2]);
  px(ctx, 6, 10, PAL.yellow[4]);
  rect(ctx, 0, 10, 3, 2, M[4]);
}

// --------------------------------------------------------------- laundry ---

function rod(ctx: Ctx, x: number, y: number, w: number) {
  // 3 rows: the outline pass darkens top/bottom, middle stays bright
  rect(ctx, x, y, w, 3, M[2]);
  hline(ctx, x, y + 1, w, M[4]);
}

function thickLine(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, c: string, hi: string) {
  line(ctx, x0 - 1, y0, x1 - 1, y1, c);
  line(ctx, x0 + 1, y0, x1 + 1, y1, c);
  line(ctx, x0, y0, x1, y1, hi);
}

function dryingRack(ctx: Ctx, full: boolean) {
  // X legs at both ends
  thickLine(ctx, 3, 12, 8, 23, M[2], M[4]);
  thickLine(ctx, 8, 12, 3, 23, M[1], M[3]);
  thickLine(ctx, 28, 12, 23, 23, M[1], M[3]);
  thickLine(ctx, 23, 12, 28, 23, M[2], M[4]);
  // end frames + rails
  rect(ctx, 1, 2, 3, 13, M[2]);
  vline(ctx, 2, 2, 13, M[4]);
  rect(ctx, 28, 2, 3, 13, M[1]);
  vline(ctx, 29, 2, 13, M[3]);
  for (const y of [2, 7, 12]) rod(ctx, 1, y, 30);
  if (!full) return;
  // clothes draped over the rails
  const drape = (x: number, y: number, w: number, h: number, c: Ramp, kind: 'shirt' | 'towel' | 'sock') => {
    if (kind === 'shirt') {
      rect(ctx, x, y, w, h, c[2]);
      rect(ctx, x - 1, y, 1, 3, c[2]);
      rect(ctx, x + w, y, 1, 3, c[1]);
      hline(ctx, x, y, w, c[3]);
      vline(ctx, x, y, h, c[3]);
      vline(ctx, x + w - 1, y, h, c[1]);
      px(ctx, x + Math.floor(w / 2), y + 1, c[0]);
    } else if (kind === 'towel') {
      rect(ctx, x, y, w, h, c[3]);
      vline(ctx, x + w - 1, y, h, c[1]);
      hline(ctx, x, y + h - 2, w, c[1]);
      for (let i = x; i < x + w; i += 2) px(ctx, i, y + h - 1, c[2]);
    } else {
      rect(ctx, x, y, 2, h, c[3]);
      px(ctx, x + 2, y + h - 1, c[3]);
      hline(ctx, x, y, 2, WH[4]);
    }
  };
  // top tier hangs from the top rail (folded over it), lower tier from the bottom rail
  drape(5, 1, 6, 10, PAL.red, 'shirt');
  drape(14, 1, 6, 9, PAL.teal, 'towel');
  drape(22, 1, 5, 8, PAL.yellow, 'shirt');
  drape(4, 11, 2, 6, PAL.pink, 'sock');
  drape(8, 11, 2, 5, PAL.pink, 'sock');
  drape(13, 11, 7, 6, PAL.purple, 'towel');
  drape(23, 11, 4, 7, PAL.blue, 'shirt');
}

function washerRunning(ctx: Ctx) {
  const w = WH;
  // body shifted 1px (it's shaking) with motion ticks either side
  const bx = 2;
  rect(ctx, bx, 1, 12, 23, w[3]);
  rect(ctx, bx, 1, 12, 4, w[4]);
  hline(ctx, bx, 5, 12, w[1]);
  vline(ctx, bx + 11, 1, 23, w[1]);
  hline(ctx, bx, 23, 12, w[0]);
  rect(ctx, bx + 1, 2, 4, 2, D[2]);
  px(ctx, bx + 2, 2, '#5aff8a');
  px(ctx, bx + 3, 3, '#5aff8a');
  ellipse(ctx, bx + 7, 2, 3, 3, M[2]);
  // door with sudsy drum
  ellipse(ctx, bx, 8, 12, 12, M[3]);
  ellipse(ctx, bx + 1, 9, 10, 10, M[1]);
  ellipse(ctx, bx + 2, 10, 8, 8, PAL.water[3]);
  ellipse(ctx, bx + 2, 13, 8, 5, PAL.water[2]);
  for (const [x, y] of [
    [bx + 3, 11],
    [bx + 5, 10],
    [bx + 7, 12],
    [bx + 4, 13],
    [bx + 6, 14],
    [bx + 8, 11],
  ])
    px(ctx, x, y, '#ffffff');
  px(ctx, bx + 4, 15, PAL.red[3]);
  px(ctx, bx + 7, 16, PAL.yellow[3]);
  // motion lines
  for (const y of [8, 13, 18]) {
    vline(ctx, 0, y, 2, D[3]);
    vline(ctx, 15, y + 1, 2, D[3]);
  }
}

function clothesPile(ctx: Ctx, cols: Ramp[]) {
  // mound of folded / crumpled garments
  ellipse(ctx, 1, 6, 14, 10, cols[0][1]);
  ellipse(ctx, 1, 5, 14, 9, cols[0][2]);
  ellipse(ctx, 3, 3, 9, 7, cols[1 % cols.length][2]);
  ellipse(ctx, 3, 3, 7, 4, cols[1 % cols.length][3]);
  ellipse(ctx, 8, 6, 7, 6, cols[2 % cols.length][2]);
  ellipse(ctx, 8, 6, 5, 3, cols[2 % cols.length][3]);
  // sleeve hanging off
  rect(ctx, 11, 11, 4, 2, cols[3 % cols.length][2]);
  hline(ctx, 11, 11, 4, cols[3 % cols.length][3]);
  // sock
  sprite(ctx, 1, 11, ['##.', '###'], { '#': cols[4 % cols.length][3] });
  // folds
  px(ctx, 5, 9, cols[0][1]);
  px(ctx, 9, 4, cols[1 % cols.length][1]);
  px(ctx, 6, 5, cols[1 % cols.length][4]);
}

// --------------------------------------------------------------- kitchen ---

const GRANITE = ['#2a2433', '#3a3346', '#4d4560', '#6a6280', '#8e86a4'] as const;

/** Counter + gas hob (same as `stove`), drawn at a y offset. */
function hob(ctx: Ctx, oy: number) {
  rect(ctx, 0, oy, 16, 10, GRANITE[2]);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 16; x++) {
      const v = hash2(x, y, 88);
      if (v < 0.15) px(ctx, x, oy + y, GRANITE[1]);
      else if (v > 0.9) px(ctx, x, oy + y, GRANITE[4]);
    }
  hline(ctx, 0, oy, 16, GRANITE[3]);
  hline(ctx, 0, oy + 9, 16, GRANITE[4]);
  const c = ['#2f4f4a', '#4d7a70', '#77a89a', '#a6cdbf', '#d2ece2'] as const;
  rect(ctx, 0, oy + 10, 16, 14, c[2]);
  hline(ctx, 0, oy + 10, 16, c[0]);
  drawer(ctx, 1, oy + 11, 14, 3, c, M[4]);
  drawer(ctx, 1, oy + 15, 7, 8, c, M[4]);
  drawer(ctx, 8, oy + 15, 7, 8, c, M[4]);
  hline(ctx, 0, oy + 23, 16, c[0]);
  rect(ctx, 1, oy + 1, 14, 8, M[1]);
  hline(ctx, 1, oy + 1, 14, M[3]);
  hline(ctx, 1, oy + 8, 14, M[0]);
  for (const x of [2, 9]) {
    ellipse(ctx, x, oy + 2, 5, 5, D[1]);
    ellipse(ctx, x + 1, oy + 3, 3, 3, M[2]);
  }
  for (const x of [3, 6, 9, 12]) px(ctx, x, oy + 12, D[2]);
}

function puff(ctx: Ctx, x: number, y: number, d: number, c: string, hi: string) {
  ellipse(ctx, x, y, d, d, c);
  if (d >= 4) ellipse(ctx, x + 1, y + 1, Math.max(2, d - 3), Math.max(2, d - 3), hi);
}

function stovePot(ctx: Ctx, burnt: boolean) {
  hob(ctx, 8);
  // flame under the pot
  for (const x of [5, 7, 9, 11]) px(ctx, x, 16, burnt ? PAL.orange[3] : '#6ab0ff');
  // steel pot on the hob
  const p = burnt ? (['#16121c', '#241d2c', '#3a3242', '#544a5c', '#6e6478'] as const) : M;
  rect(ctx, 3, 9, 10, 7, p[2]);
  vline(ctx, 3, 9, 7, p[3]);
  vline(ctx, 4, 9, 7, p[4]);
  vline(ctx, 12, 9, 7, p[1]);
  hline(ctx, 3, 15, 10, p[0]);
  ellipse(ctx, 2, 7, 12, 4, p[3]);
  ellipse(ctx, 3, 8, 10, 2, burnt ? '#1a120e' : PAL.orange[2]);
  if (!burnt) px(ctx, 6, 8, PAL.orange[4]);
  else {
    px(ctx, 5, 8, PAL.orange[2]);
    px(ctx, 9, 8, '#ff5a2a');
  }
  // handles
  px(ctx, 1, 10, D[2]);
  px(ctx, 14, 10, D[2]);
  // outline the solid part, then soft puffs on top (no heavy outline)
  outlineInner(ctx.canvas, OUTLINE);
  if (!burnt) {
    const c = 'rgba(255,252,245,0.75)';
    const hi = 'rgba(255,255,255,0.9)';
    puff(ctx, 4, 3, 4, c, hi);
    puff(ctx, 7, 0, 5, c, hi);
    puff(ctx, 10, 3, 3, c, hi);
  } else {
    const c = 'rgba(42,34,54,0.85)';
    const hi = 'rgba(77,67,96,0.9)';
    puff(ctx, 3, 3, 5, c, hi);
    puff(ctx, 7, 0, 6, c, hi);
    puff(ctx, 10, 3, 5, c, hi);
    px(ctx, 12, 1, 'rgba(42,34,54,0.6)');
  }
}

function choppingBoard(ctx: Ctx) {
  const o = PAL.oak;
  rect(ctx, 0, 2, 12, 6, o[3]);
  hline(ctx, 0, 2, 12, o[4]);
  hline(ctx, 0, 7, 12, o[1]);
  vline(ctx, 11, 2, 6, o[2]);
  grain(ctx, 0, 3, 11, 4, o[2], 5, 0.12);
  // carrot coins + onion bits
  for (const [x, y] of [
    [2, 4],
    [4, 5],
  ])
    px(ctx, x, y, PAL.orange[3]);
  px(ctx, 3, 3, PAL.orange[2]);
  px(ctx, 6, 4, '#efe0f0');
  px(ctx, 7, 5, '#d8c0e0');
  // knife: blade on the board, handle off the edge
  hline(ctx, 7, 3, 6, M[4]);
  hline(ctx, 7, 4, 6, M[2]);
  rect(ctx, 13, 3, 3, 2, D[3]);
  px(ctx, 14, 3, PAL.wood[3]);
}

function tableSet(ctx: Ctx) {
  const chairBack = (x: number, y: number) => {
    rect(ctx, x, y, 8, 7, WD[2]);
    hline(ctx, x, y, 8, WD[4]);
    rect(ctx, x + 2, y + 2, 4, 3, WD[1]);
    vline(ctx, x + 3, y + 2, 3, WD[3]);
  };
  chairBack(4, 0);
  chairBack(20, 0);
  rect(ctx, 2, 21, 2, 6, WD[1]);
  rect(ctx, 28, 21, 2, 6, WD[0]);
  block(ctx, 0, 6, 32, 17, 13, WD);
  // tablecloth
  rect(ctx, 1, 7, 30, 11, '#f4efe4');
  for (let y = 7; y < 18; y++) for (let x = 1; x < 31; x++) if ((x + y) % 4 === 0 && (x - y + 64) % 4 === 0) px(ctx, x, y, PAL.red[4]);
  hline(ctx, 1, 18, 30, '#d8d0c0');
  // four places: plate + soup bowl + glass
  for (const [x, y] of [
    [3, 8],
    [21, 8],
    [3, 13],
    [21, 13],
  ]) {
    ellipse(ctx, x, y, 8, 5, WH[2]);
    ellipse(ctx, x + 1, y, 6, 4, WH[4]);
    ellipse(ctx, x + 2, y + 1, 4, 3, PAL.orange[2]);
    px(ctx, x + 3, y + 1, PAL.orange[4]);
    px(ctx, x + 4, y + 2, PAL.green[3]);
    const gx = x < 16 ? x + 8 : x - 2;
    rect(ctx, gx, y, 2, 3, PAL.glass[3]);
    px(ctx, gx, y, '#ffffff');
  }
  // centre: bread basket + jug
  ellipse(ctx, 13, 9, 6, 4, PAL.wicker[2]);
  px(ctx, 14, 9, '#e6b06a');
  px(ctx, 16, 10, '#c98a4a');
  rect(ctx, 15, 13, 2, 4, M[3]);
  px(ctx, 15, 13, M[4]);
  const chairFront = (x: number) => {
    rect(ctx, x, 24, 8, 2, WD[3]);
    rect(ctx, x, 26, 8, 4, WD[2]);
    hline(ctx, x, 26, 8, WD[4]);
    rect(ctx, x + 2, 27, 4, 2, WD[1]);
    vline(ctx, x, 30, 2, WD[1]);
    vline(ctx, x + 7, 30, 2, WD[0]);
  };
  chairFront(4);
  chairFront(20);
}

// ----------------------------------------------------------------- decor ---

function piggyBank(ctx: Ctx) {
  const p = PAL.pink;
  // legs
  for (const x of [4, 10]) rect(ctx, x, 12, 2, 3, p[1]);
  // body
  ellipse(ctx, 2, 4, 12, 10, p[2]);
  ellipse(ctx, 3, 4, 8, 6, p[3]);
  px(ctx, 5, 5, p[4]);
  px(ctx, 6, 5, p[4]);
  // ear + snout + eye + tail
  sprite(ctx, 9, 2, ['.#', '##'], { '#': p[2] });
  px(ctx, 10, 3, p[1]);
  rect(ctx, 13, 7, 2, 3, p[3]);
  px(ctx, 14, 8, p[0]);
  px(ctx, 11, 6, D[1]);
  sprite(ctx, 0, 6, ['#.', '.#'], { '#': p[2] });
  // coin slot + coin
  hline(ctx, 6, 4, 3, p[0]);
  rect(ctx, 6, 1, 3, 3, PAL.yellow[3]);
  px(ctx, 6, 1, PAL.yellow[4]);
  ellipse(ctx, 3, 14, 10, 2, 'rgba(27,19,37,0.2)');
}

function calendar(ctx: Ctx) {
  rect(ctx, 1, 1, 10, 11, '#fbf8f0');
  vline(ctx, 10, 1, 11, PAL.paper[1]);
  hline(ctx, 1, 11, 10, PAL.paper[1]);
  rect(ctx, 1, 1, 10, 3, PAL.red[2]);
  hline(ctx, 1, 1, 10, PAL.red[3]);
  px(ctx, 3, 0, M[2]);
  px(ctx, 8, 0, M[2]);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) px(ctx, 2 + c * 2, 5 + r * 2, M[2]);
  // circled date
  sprite(ctx, 5, 6, ['.#.', '#.#', '.#.'], { '#': PAL.red[2] });
}

function doorbell(ctx: Ctx) {
  rect(ctx, 1, 0, 6, 8, WH[3]);
  hline(ctx, 1, 0, 6, WH[4]);
  vline(ctx, 6, 0, 8, WH[1]);
  ellipse(ctx, 2, 2, 4, 4, PAL.yellow[2]);
  px(ctx, 3, 3, PAL.yellow[4]);
  px(ctx, 4, 6, PAL.orange[3]);
}

export const HOME_EXTRA_PROPS: Record<string, PropDef> = {
  'key-hook': { w: 12, h: 12, draw: (ctx) => keyHook(ctx, true) },
  'key-hook-empty': { w: 12, h: 12, draw: (ctx) => keyHook(ctx, false) },
  'drying-rack': { w: 32, h: 24, draw: (ctx) => dryingRack(ctx, false) },
  'drying-rack-full': { w: 32, h: 24, draw: (ctx) => dryingRack(ctx, true) },
  'washer-running': { w: 16, h: 24, draw: washerRunning },
  'stove-pot': { w: 16, h: 32, draw: (ctx) => stovePot(ctx, false) },
  'stove-pot-burnt': { w: 16, h: 32, draw: (ctx) => stovePot(ctx, true) },
  'chopping-board': { w: 16, h: 8, draw: choppingBoard },
  'table-set': { w: 32, h: 32, draw: tableSet },
  'laundry-whites': { w: 16, h: 16, draw: (ctx) => clothesPile(ctx, [WH, PAL.paper, WH, PAL.cream, WH]) },
  'laundry-colors': { w: 16, h: 16, draw: (ctx) => clothesPile(ctx, [PAL.blue, PAL.red, PAL.yellow, PAL.green, PAL.pink]) },
  'piggy-bank': { w: 16, h: 16, draw: piggyBank },
  calendar: { w: 12, h: 12, draw: calendar },
  doorbell: { w: 8, h: 8, draw: doorbell },
};

/** Keys that run their own outline pass (so soft steam/smoke stays soft). */
export const HOME_EXTRA_NO_OUTLINE = ['stove-pot', 'stove-pot-burnt'];

