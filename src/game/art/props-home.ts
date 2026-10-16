// Home interior props.

import { PAL, type Ramp } from './palette';
import { type Ctx, px, rect, hline, vline, ellipse, line, sprite, mix, hash2, rrect } from './draw';
import { block, grain, drawer, books, eveningSky, glass, leafBall } from './kit';
import { drawPixelText } from './pixelFont';
import type { PropDef } from './props';

const WD = PAL.wood;
const OK = PAL.oak;
const WH = PAL.white;

// ------------------------------------------------------------------ beds ---

function bedFrame(ctx: Ctx, wood: Ramp) {
  // headboard
  rect(ctx, 0, 0, 16, 6, wood[2]);
  hline(ctx, 0, 0, 16, wood[4]);
  hline(ctx, 0, 1, 16, wood[3]);
  rect(ctx, 2, 3, 12, 2, wood[1]);
  hline(ctx, 2, 3, 12, wood[0]);
  px(ctx, 0, 0, wood[3]);
  // side rails
  vline(ctx, 0, 6, 26, wood[2]);
  vline(ctx, 15, 6, 26, wood[1]);
  // mattress / sheet
  rect(ctx, 1, 6, 14, 24, WH[3]);
  hline(ctx, 1, 6, 14, WH[1]);
  // footboard
  rect(ctx, 0, 29, 16, 3, wood[2]);
  hline(ctx, 0, 29, 16, wood[3]);
  hline(ctx, 0, 31, 16, wood[0]);
}

function pillow(ctx: Ctx, x: number, y: number, w: number, tilt = 0) {
  rrect(ctx, x, y, w, 5, WH[3]);
  hline(ctx, x + 1, y, w - 2, WH[4]);
  hline(ctx, x + 1, y + 4, w - 2, WH[1]);
  vline(ctx, x + w - 1, y + 1, 3, WH[1]);
  px(ctx, x + 2, y + 1, '#ffffff');
  if (tilt) px(ctx, x + w - 2, y + 1 + tilt, WH[2]);
  px(ctx, x + Math.floor(w / 2), y + 2, WH[2]);
}

function bedUnmade(ctx: Ctx) {
  bedFrame(ctx, WD);
  pillow(ctx, 2, 7, 10, 1);
  const b = PAL.teal;
  // rumpled blanket, pulled back at the top-right
  for (let y = 12; y < 29; y++)
    for (let x = 1; x < 15; x++) {
      if (y < 15 && x > 15 - (15 - y) * 2) continue;
      let c = b[2];
      const fold = (x * 2 + y * 3) % 11;
      if (fold === 0 || fold === 1) c = b[3];
      if (fold === 2) c = b[1];
      if (x === 14) c = b[1];
      px(ctx, x, y, c);
    }
  // crumpled edge + bunched folds
  line(ctx, 3, 18, 8, 15, b[4]);
  line(ctx, 6, 24, 12, 19, b[1]);
  line(ctx, 2, 26, 6, 22, b[3]);
  hline(ctx, 1, 28, 14, b[0]);
  // corner of blanket flipped
  sprite(ctx, 10, 12, ['....##', '...###', '..####'], { '#': b[4] });
  // sock dropped on the sheet
  px(ctx, 12, 9, PAL.red[2]);
  px(ctx, 13, 9, PAL.red[2]);
}

function bedMade(ctx: Ctx) {
  bedFrame(ctx, WD);
  pillow(ctx, 2, 7, 12);
  const b = PAL.blue;
  rect(ctx, 1, 13, 14, 16, b[2]);
  // folded sheet band
  rect(ctx, 1, 13, 14, 2, WH[3]);
  hline(ctx, 1, 15, 14, b[1]);
  hline(ctx, 1, 16, 14, b[3]);
  // quilting diamonds
  for (let y = 17; y < 28; y++)
    for (let x = 1; x < 15; x++) if ((x + y) % 6 === 0 || (x - y + 60) % 6 === 0) px(ctx, x, y, b[3]);
  vline(ctx, 14, 16, 13, b[1]);
  hline(ctx, 1, 28, 14, b[1]);
}

function bedKid(ctx: Ctx) {
  bedFrame(ctx, PAL.pink);
  pillow(ctx, 2, 7, 12);
  // teddy on the pillow
  sprite(ctx, 9, 6, ['#.#', '###', '.#.'], { '#': PAL.oak[3] });
  px(ctx, 10, 7, PAL.dark[2]);
  const b = PAL.blue;
  rect(ctx, 1, 13, 14, 16, b[3]);
  rect(ctx, 1, 13, 14, 2, PAL.pink[3]);
  hline(ctx, 1, 15, 14, b[2]);
  vline(ctx, 14, 15, 14, b[2]);
  // stars + toy rockets pattern
  const star = (x: number, y: number, c: string) => {
    px(ctx, x, y, c);
    px(ctx, x - 1, y, c);
    px(ctx, x + 1, y, c);
    px(ctx, x, y - 1, c);
    px(ctx, x, y + 1, c);
  };
  star(4, 18, PAL.yellow[3]);
  star(10, 22, PAL.yellow[3]);
  star(5, 26, PAL.pink[3]);
  px(ctx, 11, 17, '#ffffff');
  px(ctx, 8, 20, '#ffffff');
  px(ctx, 3, 22, '#ffffff');
  px(ctx, 12, 26, '#ffffff');
  hline(ctx, 1, 28, 14, b[1]);
}

// -------------------------------------------------------------- tables ---

function desk(ctx: Ctx) {
  // legs
  rect(ctx, 1, 18, 2, 6, OK[1]);
  rect(ctx, 29, 18, 2, 6, OK[0]);
  // top + front
  block(ctx, 0, 8, 32, 12, 6, OK);
  grain(ctx, 1, 9, 30, 4, OK[2], 4, 0.1);
  drawer(ctx, 18, 15, 11, 4, OK);
  hline(ctx, 2, 16, 14, OK[1]);
  // lamp (green desk lamp)
  rect(ctx, 3, 11, 5, 2, PAL.green[1]);
  hline(ctx, 3, 11, 5, PAL.green[2]);
  line(ctx, 5, 10, 5, 5, PAL.metal[3]);
  line(ctx, 5, 5, 8, 2, PAL.metal[3]);
  rect(ctx, 7, 1, 5, 3, PAL.green[2]);
  hline(ctx, 7, 1, 5, PAL.green[3]);
  hline(ctx, 7, 4, 5, '#ffe9a8');
  // warm light pool on desk
  for (let x = 6; x < 15; x++) if (x % 2 === 0) px(ctx, x, 9, mix(OK[3], '#fff2c0', 0.6));
  px(ctx, 9, 10, mix(OK[3], '#fff2c0', 0.5));
  // notebook + pencil
  rect(ctx, 11, 9, 6, 3, '#fbf8f0');
  hline(ctx, 11, 11, 6, PAL.paper[1]);
  hline(ctx, 12, 10, 4, PAL.blue[3]);
  line(ctx, 17, 9, 19, 11, PAL.yellow[3]);
  // book stack
  rect(ctx, 22, 5, 8, 2, PAL.red[2]);
  hline(ctx, 22, 5, 8, PAL.red[3]);
  rect(ctx, 23, 7, 7, 2, PAL.blue[2]);
  hline(ctx, 23, 7, 7, PAL.blue[3]);
  rect(ctx, 22, 9, 8, 2, PAL.yellow[2]);
  hline(ctx, 22, 9, 8, PAL.yellow[3]);
  vline(ctx, 29, 5, 6, PAL.paper[2]);
}

function chair(ctx: Ctx) {
  // back legs
  vline(ctx, 3, 9, 7, WD[1]);
  vline(ctx, 12, 9, 7, WD[0]);
  // backrest
  rect(ctx, 3, 0, 10, 7, WD[2]);
  hline(ctx, 3, 0, 10, WD[4]);
  rect(ctx, 5, 2, 6, 3, WD[1]);
  vline(ctx, 7, 2, 3, WD[3]);
  vline(ctx, 9, 2, 3, WD[3]);
  // seat
  block(ctx, 2, 7, 12, 6, 4, WD);
  rect(ctx, 4, 8, 8, 2, PAL.red[2]);
  hline(ctx, 4, 8, 8, PAL.red[3]);
  // front legs
  rect(ctx, 2, 13, 2, 3, WD[2]);
  rect(ctx, 12, 13, 2, 3, WD[1]);
}

function coffeeTable(ctx: Ctx) {
  rect(ctx, 2, 12, 2, 4, WD[1]);
  rect(ctx, 28, 12, 2, 4, WD[0]);
  block(ctx, 0, 2, 32, 11, 8, WD);
  grain(ctx, 1, 3, 30, 6, WD[2], 9);
  // lace doily + tea
  ellipse(ctx, 6, 3, 10, 6, WH[4]);
  ellipse(ctx, 9, 4, 4, 3, WH[2]);
  px(ctx, 10, 5, '#a0603a');
  px(ctx, 13, 5, WH[2]);
  // magazine
  rect(ctx, 19, 4, 8, 5, PAL.pink[3]);
  hline(ctx, 20, 5, 5, '#ffffff');
  rect(ctx, 20, 6, 3, 2, PAL.blue[3]);
}

function diningTable(ctx: Ctx) {
  const chairBack = (x: number, y: number) => {
    rect(ctx, x, y, 8, 7, WD[2]);
    hline(ctx, x, y, 8, WD[4]);
    rect(ctx, x + 2, y + 2, 4, 3, WD[1]);
    vline(ctx, x + 3, y + 2, 3, WD[3]);
  };
  // top chairs (behind table)
  chairBack(4, 0);
  chairBack(20, 0);
  // table
  rect(ctx, 2, 21, 2, 6, WD[1]);
  rect(ctx, 28, 21, 2, 6, WD[0]);
  block(ctx, 0, 6, 32, 17, 13, WD);
  grain(ctx, 1, 7, 30, 11, WD[2], 13, 0.08);
  // table runner + plates
  rect(ctx, 13, 6, 6, 13, PAL.red[2]);
  vline(ctx, 13, 6, 13, PAL.red[3]);
  for (let y = 7; y < 19; y += 3) px(ctx, 15, y, PAL.yellow[3]);
  for (const [x, y] of [
    [5, 8],
    [21, 8],
    [5, 14],
    [21, 14],
  ]) {
    ellipse(ctx, x, y, 6, 4, WH[3]);
    ellipse(ctx, x + 1, y + 1, 4, 2, WH[4]);
  }
  // steel water jug
  rect(ctx, 15, 11, 2, 4, PAL.metal[3]);
  px(ctx, 15, 11, PAL.metal[4]);
  // bottom chairs (in front, seen from behind)
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

// ------------------------------------------------------------- storage ---

function shelfFrame(ctx: Ctx, fill: number, seed: number) {
  // top
  rect(ctx, 0, 0, 16, 3, WD[3]);
  hline(ctx, 0, 0, 16, WD[4]);
  // body
  rect(ctx, 0, 3, 16, 29, WD[2]);
  vline(ctx, 15, 3, 29, WD[1]);
  hline(ctx, 0, 31, 16, WD[0]);
  const rows = [4, 11, 18, 25];
  rows.forEach((y, i) => {
    rect(ctx, 2, y, 12, 6, WD[0]);
    hline(ctx, 2, y, 12, PAL.dark[2]);
    books(ctx, 2, y + 1, 12, 5, seed + i * 3, fill);
    hline(ctx, 1, y + 6, 14, WD[3]);
  });
  if (fill < 0.8) {
    // a lone plant and trophy in the gaps
    px(ctx, 11, 9, PAL.yellow[3]);
    px(ctx, 11, 8, PAL.yellow[4]);
    px(ctx, 12, 8, PAL.yellow[3]);
  }
}

function wardrobe(ctx: Ctx) {
  rect(ctx, 0, 0, 16, 3, WD[3]);
  hline(ctx, 0, 0, 16, WD[4]);
  hline(ctx, 0, 2, 16, WD[1]);
  rect(ctx, 0, 3, 16, 29, WD[2]);
  // doors
  for (const x of [1, 8]) {
    rect(ctx, x, 4, 7, 20, WD[2]);
    vline(ctx, x, 4, 20, WD[3]);
    rect(ctx, x + 2, 6, 3, 7, WD[1]);
    rect(ctx, x + 2, 15, 3, 7, WD[1]);
    px(ctx, x + 2, 6, WD[0]);
    px(ctx, x + 2, 15, WD[0]);
  }
  vline(ctx, 8, 4, 20, WD[0]);
  px(ctx, 7, 14, PAL.yellow[3]);
  px(ctx, 9, 14, PAL.yellow[3]);
  // drawer
  drawer(ctx, 1, 25, 14, 4, WD);
  vline(ctx, 15, 3, 29, WD[1]);
  hline(ctx, 0, 30, 16, WD[0]);
  rect(ctx, 1, 31, 2, 1, WD[0]);
  rect(ctx, 13, 31, 2, 1, WD[0]);
}

function basket(ctx: Ctx, full: boolean) {
  const w = PAL.wicker;
  // body
  rect(ctx, 2, 6, 12, 9, w[2]);
  rect(ctx, 3, 15, 10, 1, w[1]);
  for (let y = 7; y < 15; y++)
    for (let x = 2; x < 14; x++) {
      if ((x + (y % 2 ? 1 : 0)) % 2 === 0) px(ctx, x, y, w[3]);
      if (x === 13 || y === 14) px(ctx, x, y, w[1]);
    }
  // rim + opening
  ellipse(ctx, 1, 3, 14, 6, w[3]);
  ellipse(ctx, 3, 4, 10, 4, full ? w[2] : w[0]);
  hline(ctx, 3, 3, 10, w[4]);
  if (full) {
    // heap of clothes
    ellipse(ctx, 3, 0, 9, 6, PAL.blue[2]);
    ellipse(ctx, 4, 0, 5, 3, PAL.blue[3]);
    ellipse(ctx, 8, 1, 6, 5, PAL.red[2]);
    px(ctx, 9, 2, PAL.red[3]);
    rect(ctx, 5, 4, 4, 2, WH[3]);
    px(ctx, 12, 5, PAL.yellow[3]);
    px(ctx, 13, 6, PAL.yellow[3]);
    vline(ctx, 2, 5, 3, PAL.green[2]);
  }
}

function bin(ctx: Ctx, full: boolean) {
  const m = PAL.metal;
  rect(ctx, 3, 5, 10, 10, m[2]);
  vline(ctx, 4, 5, 10, m[4]);
  vline(ctx, 5, 5, 10, m[3]);
  vline(ctx, 11, 5, 10, m[1]);
  vline(ctx, 12, 5, 10, m[1]);
  hline(ctx, 3, 14, 10, m[1]);
  rect(ctx, 6, 15, 4, 1, m[0]); // pedal
  if (full) {
    // lid propped open behind, rubbish poking out
    ellipse(ctx, 3, 0, 10, 3, m[2]);
    ellipse(ctx, 2, 3, 12, 4, PAL.dark[2]);
    ellipse(ctx, 4, 1, 4, 4, PAL.paper[3]);
    px(ctx, 5, 2, PAL.paper[1]);
    rect(ctx, 8, 2, 3, 3, PAL.pink[2]);
    px(ctx, 9, 2, PAL.pink[4]);
    px(ctx, 11, 3, PAL.green[3]);
    px(ctx, 6, 4, PAL.yellow[3]);
  } else {
    ellipse(ctx, 2, 3, 12, 4, m[3]);
    hline(ctx, 4, 3, 8, m[4]);
    rect(ctx, 7, 2, 2, 1, m[1]);
  }
}

function toybox(ctx: Ctx, full: boolean) {
  const r = PAL.red;
  rect(ctx, 1, 6, 14, 10, r[2]);
  hline(ctx, 1, 15, 14, r[1]);
  vline(ctx, 14, 6, 10, r[1]);
  vline(ctx, 1, 6, 10, r[3]);
  // painted stripe + star
  rect(ctx, 1, 9, 14, 2, PAL.yellow[3]);
  hline(ctx, 1, 10, 14, PAL.yellow[2]);
  sprite(ctx, 6, 11, ['.#.', '###', '.#.'], { '#': PAL.blue[3] });
  if (full) {
    // lid tipped back, toys peeking
    rect(ctx, 1, 0, 14, 3, r[3]);
    hline(ctx, 1, 0, 14, r[4]);
    rect(ctx, 1, 3, 14, 3, PAL.dark[2]);
    ellipse(ctx, 2, 1, 5, 5, PAL.blue[3]); // ball
    px(ctx, 3, 2, '#ffffff');
    sprite(ctx, 7, 1, ['#..#', '####', '#.##'], { '#': PAL.oak[3] }); // teddy ears
    rect(ctx, 11, 2, 3, 3, PAL.green[3]); // block
    px(ctx, 12, 3, PAL.green[1]);
  } else {
    rect(ctx, 1, 3, 14, 4, r[3]);
    hline(ctx, 1, 3, 14, r[4]);
    hline(ctx, 1, 6, 14, r[1]);
    px(ctx, 7, 5, PAL.yellow[3]);
    px(ctx, 8, 5, PAL.yellow[3]);
  }
}

function cabinet(ctx: Ctx) {
  // vase + photo on top
  rect(ctx, 3, 0, 3, 4, PAL.blue[3]);
  px(ctx, 3, 0, PAL.blue[4]);
  px(ctx, 4, -1, PAL.leaf[3]);
  rect(ctx, 15, 0, 5, 4, PAL.yellow[2]);
  rect(ctx, 16, 1, 3, 2, PAL.glass[3]);
  block(ctx, 0, 3, 24, 19, 3, WD);
  drawer(ctx, 2, 7, 9, 4, WD);
  drawer(ctx, 13, 7, 9, 4, WD);
  drawer(ctx, 2, 12, 9, 8, WD);
  drawer(ctx, 13, 12, 9, 8, WD);
  rect(ctx, 1, 22, 2, 2, WD[0]);
  rect(ctx, 21, 22, 2, 2, WD[0]);
}

function shoeRack(ctx: Ctx, full: boolean) {
  rect(ctx, 0, 2, 16, 2, OK[3]);
  hline(ctx, 0, 2, 16, OK[4]);
  vline(ctx, 0, 4, 12, OK[2]);
  vline(ctx, 15, 4, 12, OK[1]);
  rect(ctx, 1, 4, 14, 12, OK[0]);
  hline(ctx, 1, 9, 14, OK[3]);
  hline(ctx, 1, 15, 14, OK[2]);
  if (full) {
    const shoe = (x: number, y: number, c: Ramp) => {
      rect(ctx, x, y, 3, 2, c[2]);
      px(ctx, x, y, c[3]);
      px(ctx, x + 2, y + 1, c[1]);
    };
    shoe(2, 7, PAL.dark);
    shoe(5, 7, PAL.dark);
    shoe(9, 7, PAL.red);
    shoe(12, 7, PAL.red);
    shoe(2, 13, PAL.oak);
    shoe(5, 13, PAL.oak);
    shoe(9, 13, WH);
    px(ctx, 13, 14, PAL.blue[2]);
  }
}

// ------------------------------------------------------------- kitchen ---

const GRANITE = ['#2a2433', '#3a3346', '#4d4560', '#6a6280', '#8e86a4'] as const;

function counterBase(ctx: Ctx, topper?: (ctx: Ctx) => void) {
  // granite top
  rect(ctx, 0, 0, 16, 10, GRANITE[2]);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 16; x++) {
      const v = hash2(x, y, 88);
      if (v < 0.15) px(ctx, x, y, GRANITE[1]);
      else if (v > 0.9) px(ctx, x, y, GRANITE[4]);
    }
  hline(ctx, 0, 0, 16, GRANITE[3]);
  hline(ctx, 0, 9, 16, GRANITE[4]);
  // cabinet front (pastel mint)
  const c = ['#2f4f4a', '#4d7a70', '#77a89a', '#a6cdbf', '#d2ece2'] as const;
  rect(ctx, 0, 10, 16, 14, c[2]);
  hline(ctx, 0, 10, 16, c[0]);
  drawer(ctx, 1, 11, 14, 3, c, PAL.metal[4]);
  drawer(ctx, 1, 15, 7, 8, c, PAL.metal[4]);
  drawer(ctx, 8, 15, 7, 8, c, PAL.metal[4]);
  hline(ctx, 0, 23, 16, c[0]);
  if (topper) topper(ctx);
}

function counter(ctx: Ctx) {
  counterBase(ctx, () => {
    // spice tin (masala dabba) + jars
    ellipse(ctx, 2, 2, 6, 5, PAL.metal[3]);
    px(ctx, 3, 3, PAL.red[2]);
    px(ctx, 5, 3, PAL.yellow[3]);
    px(ctx, 4, 4, PAL.orange[2]);
    px(ctx, 3, 2, PAL.metal[4]);
    rect(ctx, 10, 1, 3, 5, PAL.glass[3]);
    rect(ctx, 10, 3, 3, 3, PAL.orange[2]);
    hline(ctx, 10, 1, 3, PAL.red[2]);
  });
}

function sink(ctx: Ctx) {
  counterBase(ctx, () => {
    const m = PAL.metal;
    rect(ctx, 2, 2, 12, 7, m[3]);
    rect(ctx, 3, 3, 10, 5, m[1]);
    hline(ctx, 3, 3, 10, m[0]);
    rect(ctx, 4, 4, 8, 3, m[2]);
    px(ctx, 8, 6, m[0]);
    hline(ctx, 2, 8, 12, m[4]);
    // tap
    vline(ctx, 8, 0, 3, m[4]);
    px(ctx, 7, 0, m[3]);
    px(ctx, 8, 3, PAL.glass[4]);
    // steel tumbler
    rect(ctx, 12, 0, 2, 2, m[4]);
  });
}

function stove(ctx: Ctx) {
  counterBase(ctx, () => {
    const m = PAL.metal;
    rect(ctx, 1, 1, 14, 8, m[1]);
    hline(ctx, 1, 1, 14, m[3]);
    hline(ctx, 1, 8, 14, m[0]);
    for (const x of [2, 9]) {
      ellipse(ctx, x, 2, 5, 5, PAL.dark[1]);
      ellipse(ctx, x + 1, 3, 3, 3, m[2]);
      px(ctx, x + 2, 4, PAL.dark[1]);
    }
    // pressure cooker on the left burner
    ellipse(ctx, 2, 0, 6, 6, m[3]);
    ellipse(ctx, 3, 1, 4, 3, m[4]);
    rect(ctx, 4, -1, 2, 2, PAL.dark[2]);
    line(ctx, 7, 2, 9, 1, PAL.dark[2]);
    // blue flame on right
    px(ctx, 11, 3, '#6ab0ff');
    px(ctx, 10, 4, '#6ab0ff');
    px(ctx, 12, 4, '#6ab0ff');
    px(ctx, 11, 5, '#6ab0ff');
  });
  // knobs
  for (const x of [3, 6, 9, 12]) px(ctx, x, 12, PAL.dark[2]);
}

function fridge(ctx: Ctx) {
  const f = ['#7d8896', '#a8b3bf', '#d3dbe2', '#e8eef2', '#fafdff'] as const;
  rect(ctx, 0, 0, 16, 2, f[3]);
  hline(ctx, 0, 0, 16, f[4]);
  rect(ctx, 0, 2, 16, 30, f[2]);
  vline(ctx, 1, 2, 29, f[4]);
  vline(ctx, 2, 2, 29, f[3]);
  vline(ctx, 15, 2, 30, f[1]);
  hline(ctx, 0, 11, 16, f[0]);
  hline(ctx, 0, 12, 16, f[3]);
  hline(ctx, 0, 31, 16, f[0]);
  // handles
  vline(ctx, 12, 5, 5, PAL.metal[1]);
  vline(ctx, 12, 14, 8, PAL.metal[1]);
  vline(ctx, 13, 14, 8, PAL.metal[3]);
  // magnets + drawing
  px(ctx, 5, 5, PAL.red[2]);
  px(ctx, 8, 7, PAL.yellow[3]);
  rect(ctx, 4, 15, 5, 6, '#fffcf5');
  px(ctx, 6, 15, PAL.blue[2]);
  px(ctx, 5, 18, PAL.green[3]);
  px(ctx, 7, 17, PAL.red[3]);
  px(ctx, 6, 19, PAL.yellow[3]);
  // feet
  rect(ctx, 1, 30, 2, 1, f[0]);
}

// ---------------------------------------------------------- living room ---

function sofa(ctx: Ctx) {
  const s = ['#1d3d3f', '#2a5c5c', '#3a807a', '#5aa596', '#8ccab4'] as const;
  // backrest
  rect(ctx, 3, 0, 42, 9, s[2]);
  hline(ctx, 3, 0, 42, s[4]);
  rect(ctx, 3, 1, 42, 2, s[3]);
  // back cushions
  for (const x of [6, 19, 32]) {
    rect(ctx, x, 3, 11, 6, s[2]);
    hline(ctx, x, 3, 11, s[3]);
    vline(ctx, x + 10, 3, 6, s[1]);
    px(ctx, x + 5, 5, s[1]);
  }
  // seat cushions
  for (const x of [6, 19, 32]) {
    rect(ctx, x, 9, 11, 7, s[3]);
    hline(ctx, x, 9, 11, s[4]);
    vline(ctx, x + 10, 9, 7, s[2]);
    hline(ctx, x, 15, 11, s[2]);
  }
  // front skirt
  rect(ctx, 3, 16, 42, 5, s[1]);
  hline(ctx, 3, 16, 42, s[2]);
  hline(ctx, 3, 20, 42, s[0]);
  // arms
  for (const x of [0, 42]) {
    rect(ctx, x, 3, 6, 18, s[2]);
    rect(ctx, x, 3, 6, 3, s[3]);
    hline(ctx, x, 3, 6, s[4]);
    vline(ctx, x + 5, 6, 15, s[1]);
    hline(ctx, x, 20, 6, s[0]);
  }
  // throw pillows
  rect(ctx, 7, 5, 6, 6, PAL.yellow[3]);
  hline(ctx, 7, 5, 6, PAL.yellow[4]);
  px(ctx, 9, 7, PAL.orange[2]);
  px(ctx, 10, 8, PAL.orange[2]);
  rect(ctx, 35, 5, 6, 6, PAL.pink[3]);
  hline(ctx, 35, 5, 6, PAL.pink[4]);
  px(ctx, 37, 7, PAL.purple[3]);
  px(ctx, 38, 8, PAL.purple[3]);
  // legs
  for (const x of [2, 44]) rect(ctx, x, 21, 2, 3, WD[1]);
}

function tv(ctx: Ctx) {
  // stand cabinet
  block(ctx, 0, 13, 32, 11, 3, WD);
  drawer(ctx, 2, 17, 13, 5, WD);
  rect(ctx, 17, 17, 13, 5, WD[0]);
  rect(ctx, 19, 18, 8, 2, PAL.dark[2]);
  px(ctx, 25, 18, '#5aff8a');
  // TV
  rect(ctx, 3, 0, 26, 14, PAL.dark[1]);
  rect(ctx, 4, 1, 24, 11, '#1e2a44');
  for (let y = 1; y < 12; y++)
    for (let x = 4; x < 28; x++) {
      const d = x - 4 + y;
      if (d > 3 && d < 7) px(ctx, x, y, '#2e3d5e');
      if (d === 8) px(ctx, x, y, '#283656');
    }
  hline(ctx, 4, 12, 24, PAL.dark[3]);
  px(ctx, 27, 12, '#ff5a5a');
  rect(ctx, 13, 13, 6, 1, PAL.dark[2]);
}

function plant(ctx: Ctx) {
  const l = PAL.leaf;
  // big leaves
  leafBall(ctx, 1, 4, 8, 7, l, 3);
  leafBall(ctx, 7, 3, 8, 7, l, 5);
  leafBall(ctx, 3, 0, 10, 8, l, 7);
  leafBall(ctx, 4, 8, 8, 7, l, 9);
  line(ctx, 8, 10, 8, 15, l[0]);
  // pot
  rect(ctx, 3, 15, 10, 2, PAL.terra[3]);
  hline(ctx, 3, 15, 10, PAL.terra[4]);
  rect(ctx, 4, 17, 8, 7, PAL.terra[2]);
  vline(ctx, 4, 17, 7, PAL.terra[3]);
  vline(ctx, 11, 17, 7, PAL.terra[1]);
  hline(ctx, 5, 23, 6, PAL.terra[1]);
  hline(ctx, 4, 19, 8, PAL.yellow[2]);
}

function floorLamp(ctx: Ctx) {
  // base
  ellipse(ctx, 4, 21, 8, 3, PAL.dark[2]);
  hline(ctx, 5, 21, 6, PAL.dark[3]);
  // pole
  vline(ctx, 8, 7, 15, PAL.metal[2]);
  vline(ctx, 7, 7, 15, PAL.metal[4]);
  // shade (trapezoid, glowing)
  const sh = ['#a8742a', '#d9a85a', '#f2cf8a', '#fbe6b4', '#fff8e0'] as const;
  for (let j = 0; j < 7; j++) {
    const half = 3 + Math.floor(j / 2);
    for (let i = -half; i < half; i++) {
      let c: string = sh[2];
      if (i < -half + 2) c = sh[3];
      if (i >= half - 2) c = sh[1];
      px(ctx, 8 + i, 1 + j, c);
    }
  }
  hline(ctx, 5, 1, 6, sh[4]);
  hline(ctx, 3, 7, 10, sh[0]);
}

// ------------------------------------------------------------ bathroom ---

function toilet(ctx: Ctx) {
  const w = WH;
  // tank
  rect(ctx, 3, 0, 10, 5, w[3]);
  hline(ctx, 3, 0, 10, w[4]);
  hline(ctx, 3, 4, 10, w[1]);
  rect(ctx, 7, 1, 2, 1, PAL.metal[3]);
  // bowl
  ellipse(ctx, 2, 4, 12, 11, w[2]);
  ellipse(ctx, 2, 4, 11, 10, w[3]);
  ellipse(ctx, 4, 6, 8, 6, w[1]);
  ellipse(ctx, 5, 7, 6, 4, PAL.glass[3]);
  px(ctx, 6, 8, PAL.glass[4]);
  hline(ctx, 4, 14, 8, w[1]);
}

function shower(ctx: Ctx) {
  // tiled back wall
  rect(ctx, 0, 0, 16, 10, '#c6dfe9');
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 16; x++) if (x % 4 === 0 || y % 4 === 0) px(ctx, x, y, '#9fbccb');
  // shower head + pipe
  vline(ctx, 12, 0, 4, PAL.metal[3]);
  rect(ctx, 9, 3, 4, 2, PAL.metal[4]);
  hline(ctx, 9, 5, 4, PAL.metal[1]);
  // water streaks
  for (const x of [9, 11]) for (let y = 7; y < 18; y += 3) px(ctx, x, y, '#e0f4ff');
  // tray
  rect(ctx, 0, 10, 16, 14, '#e8f2f6');
  hline(ctx, 0, 10, 16, '#a9bfcc');
  rect(ctx, 1, 11, 14, 11, '#d0e4ec');
  ellipse(ctx, 7, 15, 3, 2, PAL.metal[1]);
  hline(ctx, 0, 23, 16, '#8fa8b6');
  // glass screen edge
  vline(ctx, 0, 0, 24, PAL.metal[4]);
  for (let y = 2; y < 22; y += 5) px(ctx, 1, y, '#ffffff');
}

function washer(ctx: Ctx) {
  const w = WH;
  rect(ctx, 0, 0, 16, 24, w[3]);
  rect(ctx, 0, 0, 16, 4, w[4]);
  hline(ctx, 0, 4, 16, w[1]);
  vline(ctx, 15, 0, 24, w[1]);
  hline(ctx, 0, 23, 16, w[0]);
  // controls
  ellipse(ctx, 10, 1, 3, 3, PAL.metal[2]);
  rect(ctx, 2, 1, 5, 2, PAL.dark[2]);
  px(ctx, 3, 1, '#5aff8a');
  // door
  ellipse(ctx, 2, 7, 12, 12, PAL.metal[3]);
  ellipse(ctx, 3, 8, 10, 10, PAL.metal[1]);
  ellipse(ctx, 4, 9, 8, 8, PAL.glass[2]);
  ellipse(ctx, 5, 12, 6, 4, PAL.blue[3]);
  px(ctx, 6, 13, PAL.red[3]);
  px(ctx, 9, 14, PAL.yellow[3]);
  px(ctx, 5, 10, PAL.glass[4]);
  px(ctx, 6, 10, PAL.glass[4]);
}

// ---------------------------------------------------------- wall decor ---

function coatHook(ctx: Ctx) {
  rect(ctx, 0, 4, 16, 4, WD[2]);
  hline(ctx, 0, 4, 16, WD[3]);
  hline(ctx, 0, 7, 16, WD[1]);
  for (const x of [3, 8, 13]) {
    px(ctx, x, 6, PAL.metal[4]);
    px(ctx, x, 8, PAL.metal[3]);
    px(ctx, x, 9, PAL.metal[2]);
    px(ctx, x - 1, 9, PAL.metal[2]);
  }
  px(ctx, 1, 5, PAL.yellow[3]);
  px(ctx, 14, 5, PAL.yellow[3]);
}

function hookBag(ctx: Ctx) {
  px(ctx, 6, 0, PAL.metal[3]);
  px(ctx, 6, 1, PAL.metal[2]);
  sprite(ctx, 3, 1, ['.####.', '#....#', '#....#'], { '#': PAL.wicker[2] });
  rect(ctx, 1, 4, 10, 8, '#e8dcc0');
  vline(ctx, 1, 4, 8, '#f6efdc');
  vline(ctx, 10, 4, 8, '#b8a888');
  hline(ctx, 1, 11, 10, '#b8a888');
  sprite(ctx, 4, 6, ['.##', '###', '##.'], { '#': PAL.green[2] });
}

function hookUmbrella(ctx: Ctx) {
  px(ctx, 4, 0, PAL.metal[3]);
  sprite(ctx, 2, 1, ['.##.', '#..#', '#...'], { '#': PAL.wood[2] });
  vline(ctx, 5, 3, 2, PAL.metal[2]);
  // folded canopy tapering down
  for (let j = 0; j < 10; j++) {
    const half = j < 2 ? 1 : j < 7 ? 2 : j < 9 ? 1 : 0;
    for (let i = -half; i <= half; i++) px(ctx, 5 + i, 5 + j, i <= -1 ? PAL.blue[3] : i === 0 ? PAL.blue[2] : PAL.blue[1]);
  }
  px(ctx, 5, 15, PAL.metal[2]);
  px(ctx, 4, 8, PAL.blue[4]);
}

function timetable(ctx: Ctx) {
  rect(ctx, 1, 1, 14, 14, '#fbf8f0');
  vline(ctx, 14, 1, 14, PAL.paper[1]);
  hline(ctx, 1, 14, 14, PAL.paper[1]);
  rect(ctx, 1, 1, 14, 3, PAL.blue[2]);
  hline(ctx, 3, 2, 8, '#ffffff');
  for (let y = 5; y < 14; y += 2) hline(ctx, 2, y, 12, PAL.paper[2]);
  for (let x = 5; x < 14; x += 3) vline(ctx, x, 4, 10, PAL.paper[2]);
  const cells: [number, number, string][] = [
    [6, 6, PAL.red[3]],
    [9, 8, PAL.green[3]],
    [12, 6, PAL.yellow[3]],
    [6, 10, PAL.purple[3]],
    [12, 12, PAL.blue[3]],
    [9, 12, PAL.orange[2]],
  ];
  for (const [x, y, c] of cells) hline(ctx, x, y, 2, c);
  // tape
  rect(ctx, 6, 0, 4, 2, 'rgba(250,240,200,0.85)');
}

function noticeBoard(ctx: Ctx) {
  rect(ctx, 0, 0, 24, 16, WD[2]);
  hline(ctx, 0, 0, 24, WD[4]);
  hline(ctx, 0, 15, 24, WD[0]);
  rect(ctx, 1, 1, 22, 13, PAL.cork[3]);
  for (let y = 1; y < 14; y++)
    for (let x = 1; x < 23; x++) if (hash2(x, y, 44) < 0.15) px(ctx, x, y, PAL.cork[2]);
  const note = (x: number, y: number, w: number, h: number, c: string, pin: string) => {
    rect(ctx, x, y, w, h, c);
    hline(ctx, x + 1, y + 2, w - 2, 'rgba(60,40,60,0.35)');
    hline(ctx, x + 1, y + 4, w - 3, 'rgba(60,40,60,0.35)');
    px(ctx, x + Math.floor(w / 2), y, pin);
  };
  note(2, 2, 6, 6, PAL.yellow[4], PAL.red[2]);
  note(9, 3, 6, 8, '#fbf8f0', PAL.blue[2]);
  note(16, 2, 6, 5, PAL.pink[4], PAL.green[2]);
  note(16, 8, 5, 5, PAL.teal[4], PAL.yellow[2]);
  note(3, 9, 5, 4, '#cfe8ff', PAL.red[2]);
}

function schoolBag(ctx: Ctx) {
  const b = PAL.blue;
  // top handle
  sprite(ctx, 6, 0, ['.##.', '#..#'], { '#': b[1] });
  rrect(ctx, 3, 2, 10, 13, b[2], 2);
  vline(ctx, 4, 3, 11, b[3]);
  vline(ctx, 12, 4, 10, b[1]);
  hline(ctx, 4, 14, 8, b[1]);
  // flap
  rect(ctx, 3, 2, 10, 4, b[3]);
  hline(ctx, 4, 2, 8, b[4]);
  hline(ctx, 3, 6, 10, b[1]);
  // front pocket
  rrect(ctx, 5, 9, 6, 5, PAL.red[2]);
  hline(ctx, 5, 9, 6, PAL.red[3]);
  px(ctx, 8, 10, PAL.yellow[3]);
  // strap buckles
  px(ctx, 5, 7, PAL.metal[4]);
  px(ctx, 10, 7, PAL.metal[4]);
}

function wallWindow(ctx: Ctx) {
  rect(ctx, 1, 1, 14, 13, WH[3]);
  hline(ctx, 1, 1, 14, WH[4]);
  eveningSky(ctx, 2, 2, 12, 10);
  // tiny moon + distant rooftops
  px(ctx, 11, 3, '#fff6d0');
  px(ctx, 12, 3, '#fff6d0');
  px(ctx, 11, 4, '#fff6d0');
  rect(ctx, 2, 10, 4, 2, '#3b3266');
  rect(ctx, 7, 9, 3, 3, '#3b3266');
  px(ctx, 8, 10, PAL.yellow[3]);
  rect(ctx, 11, 10, 3, 2, '#3b3266');
  vline(ctx, 8, 2, 10, WH[2]);
  hline(ctx, 2, 7, 12, WH[2]);
  // curtains
  rect(ctx, 0, 0, 3, 14, PAL.red[2]);
  vline(ctx, 1, 0, 14, PAL.red[3]);
  rect(ctx, 13, 0, 3, 14, PAL.red[2]);
  vline(ctx, 14, 0, 14, PAL.red[1]);
  hline(ctx, 0, 0, 16, PAL.wood[2]);
  // sill
  rect(ctx, 1, 13, 14, 2, WH[3]);
  hline(ctx, 1, 14, 14, WH[1]);
}

function picture(ctx: Ctx) {
  rect(ctx, 1, 2, 14, 12, PAL.yellow[2]);
  hline(ctx, 1, 2, 14, PAL.yellow[4]);
  vline(ctx, 1, 2, 12, PAL.yellow[3]);
  hline(ctx, 1, 13, 14, PAL.yellow[1]);
  vline(ctx, 14, 2, 12, PAL.yellow[1]);
  // photo: family on a sunny day
  rect(ctx, 3, 4, 10, 8, '#9fd4ec');
  rect(ctx, 3, 9, 10, 3, PAL.grass[3]);
  px(ctx, 11, 5, PAL.yellow[4]);
  const fig = (x: number, h: number, c: string) => {
    px(ctx, x, 11 - h, '#c98e62');
    vline(ctx, x, 12 - h, h - 1, c);
  };
  fig(5, 4, PAL.red[2]);
  fig(7, 4, PAL.blue[2]);
  fig(9, 3, PAL.pink[2]);
  // nail string
  px(ctx, 8, 0, PAL.metal[2]);
  px(ctx, 7, 1, PAL.metal[2]);
  px(ctx, 9, 1, PAL.metal[2]);
}

function wallClock(ctx: Ctx) {
  ellipse(ctx, 0, 0, 12, 12, WD[2]);
  ellipse(ctx, 1, 1, 10, 10, '#fbf8f0');
  ellipse(ctx, 2, 2, 8, 8, '#ffffff');
  px(ctx, 6, 1, PAL.dark[2]);
  px(ctx, 6, 10, PAL.dark[2]);
  px(ctx, 1, 6, PAL.dark[2]);
  px(ctx, 10, 6, PAL.dark[2]);
  vline(ctx, 6, 3, 3, PAL.dark[1]);
  hline(ctx, 6, 6, 3, PAL.red[2]);
  px(ctx, 6, 6, PAL.dark[1]);
  px(ctx, 3, 2, PAL.wood[4]);
}

function doorFront(ctx: Ctx) {
  // door frame
  rect(ctx, 0, 0, 16, 12, WH[3]);
  hline(ctx, 0, 0, 16, WH[4]);
  // door
  rect(ctx, 2, 1, 12, 11, WD[2]);
  vline(ctx, 2, 1, 11, WD[3]);
  vline(ctx, 13, 1, 11, WD[1]);
  rect(ctx, 4, 2, 8, 4, WD[1]);
  rect(ctx, 5, 3, 6, 2, WD[3]);
  rect(ctx, 4, 7, 8, 4, WD[1]);
  rect(ctx, 5, 8, 6, 2, WD[3]);
  px(ctx, 12, 7, PAL.yellow[3]);
  // toran (festive door garland)
  for (let x = 2; x < 14; x += 2) {
    px(ctx, x, 1, PAL.orange[2]);
    px(ctx, x + 1, 1, PAL.leaf[3]);
  }
  px(ctx, 4, 2, PAL.orange[3]);
  px(ctx, 8, 2, PAL.orange[3]);
  px(ctx, 12, 2, PAL.orange[3]);
  // mat
  rect(ctx, 1, 12, 14, 4, PAL.dirt[3]);
  for (let x = 1; x < 15; x += 2) px(ctx, x, 13, PAL.dirt[2]);
  hline(ctx, 1, 15, 14, PAL.dirt[1]);
  hline(ctx, 2, 14, 12, PAL.red[2]);
}

export const HOME_PROPS: Record<string, PropDef> = {
  bed: { w: 16, h: 32, draw: bedUnmade },
  'bed-made': { w: 16, h: 32, draw: bedMade },
  'bed-kid': { w: 16, h: 32, draw: bedKid },
  desk: { w: 32, h: 24, draw: desk },
  chair: { w: 16, h: 16, draw: chair },
  bookshelf: { w: 16, h: 32, draw: (ctx) => shelfFrame(ctx, 0.45, 11) },
  'bookshelf-full': { w: 16, h: 32, draw: (ctx) => shelfFrame(ctx, 1, 17) },
  wardrobe: { w: 16, h: 32, draw: wardrobe },
  laundry: { w: 16, h: 16, draw: (ctx) => basket(ctx, false) },
  'laundry-full': { w: 16, h: 16, draw: (ctx) => basket(ctx, true) },
  bin: { w: 16, h: 16, draw: (ctx) => bin(ctx, false) },
  'bin-full': { w: 16, h: 16, draw: (ctx) => bin(ctx, true) },
  toybox: { w: 16, h: 16, draw: (ctx) => toybox(ctx, false) },
  'toybox-full': { w: 16, h: 16, draw: (ctx) => toybox(ctx, true) },
  sofa: { w: 48, h: 24, draw: sofa },
  tv: { w: 32, h: 24, draw: tv },
  'coffee-table': { w: 32, h: 16, draw: coffeeTable },
  'dining-table': { w: 32, h: 32, draw: diningTable },
  fridge: { w: 16, h: 32, draw: fridge },
  stove: { w: 16, h: 24, draw: stove },
  sink: { w: 16, h: 24, draw: sink },
  counter: { w: 16, h: 24, draw: counter },
  plant: { w: 16, h: 24, draw: plant },
  lamp: { w: 16, h: 24, draw: floorLamp },
  toilet: { w: 16, h: 16, draw: toilet },
  shower: { w: 16, h: 24, draw: shower },
  washer: { w: 16, h: 24, draw: washer },
  'shoe-rack': { w: 16, h: 16, draw: (ctx) => shoeRack(ctx, true) },
  'shoe-rack-empty': { w: 16, h: 16, draw: (ctx) => shoeRack(ctx, false) },
  'coat-hook': { w: 16, h: 16, draw: coatHook },
  'hook-bag': { w: 12, h: 12, draw: hookBag },
  'hook-umbrella': { w: 8, h: 16, draw: hookUmbrella },
  timetable: { w: 16, h: 16, draw: timetable },
  'notice-board': { w: 24, h: 16, draw: noticeBoard },
  'school-bag': { w: 16, h: 16, draw: schoolBag },
  cabinet: { w: 24, h: 24, draw: cabinet },
  window: { w: 16, h: 16, draw: wallWindow },
  picture: { w: 16, h: 16, draw: picture },
  'wall-clock': { w: 12, h: 12, draw: wallClock },
  'door-front': { w: 16, h: 16, draw: doorFront },
};

// keep tree-shakers honest about helpers only used conditionally
void glass;
void drawPixelText;
