// Grocery store + clinic interior props.

import { PAL, type Ramp } from './palette';
import { type Ctx, px, rect, hline, vline, ellipse, sprite, mix, hash2, rrect } from './draw';
import { leafBall } from './kit';
import { drawPixelText, measurePixelText } from './pixelFont';
import type { PropDef } from './props';

const WH = PAL.white;
const M = PAL.metal;

function centredText(ctx: Ctx, text: string, x: number, w: number, y: number, c: string, scale = 1) {
  drawPixelText(ctx, text, x + Math.floor((w - measurePixelText(text, scale)) / 2), y, c, scale);
}

// ---------------------------------------------------------------- dairy ---

function milkPouch(ctx: Ctx, x: number, y: number) {
  rect(ctx, x, y, 4, 4, WH[3]);
  hline(ctx, x, y, 4, WH[4]);
  rect(ctx, x, y + 2, 4, 1, PAL.blue[2]);
  px(ctx, x + 3, y + 3, WH[1]);
}

function bottle(ctx: Ctx, x: number, y: number, liquid: string, cap: string) {
  px(ctx, x + 1, y, cap);
  rect(ctx, x, y + 1, 3, 4, liquid);
  px(ctx, x, y + 1, mix(liquid, '#ffffff', 0.5));
}

function tetra(ctx: Ctx, x: number, y: number, c: Ramp) {
  rect(ctx, x, y, 3, 5, WH[3]);
  rect(ctx, x, y + 2, 3, 2, c[2]);
  px(ctx, x + 1, y - 1, WH[2]);
}

function shelfDairy(ctx: Ctx) {
  // cabinet body
  rect(ctx, 0, 0, 48, 32, M[2]);
  // header
  rect(ctx, 0, 0, 48, 6, PAL.blue[2]);
  hline(ctx, 0, 0, 48, PAL.blue[4]);
  hline(ctx, 0, 5, 48, PAL.blue[0]);
  centredText(ctx, 'DAIRY', 0, 48, 1, '#ffffff');
  // doors
  for (let d = 0; d < 3; d++) {
    const x = 1 + d * 16;
    rect(ctx, x, 6, 15, 23, M[3]);
    rect(ctx, x + 1, 7, 13, 21, '#dff3fb'); // lit interior
    for (const sy of [13, 20, 27]) {
      hline(ctx, x + 1, sy, 13, M[4]);
      hline(ctx, x + 1, sy + 1 > 27 ? 27 : sy + 1, 13, mix('#dff3fb', M[2], 0.4));
    }
    // products
    for (let i = 0; i < 3; i++) milkPouch(ctx, x + 1 + i * 4, 9);
    if (d === 0) {
      for (let i = 0; i < 4; i++) bottle(ctx, x + 1 + i * 3, 15, PAL.pink[3], PAL.red[2]);
      for (let i = 0; i < 4; i++) tetra(ctx, x + 1 + i * 3, 22, PAL.blue);
    } else if (d === 1) {
      for (let i = 0; i < 4; i++) bottle(ctx, x + 1 + i * 3, 15, '#7a4a2c', PAL.yellow[2]);
      for (let i = 0; i < 3; i++) milkPouch(ctx, x + 1 + i * 4, 23);
    } else {
      for (let i = 0; i < 4; i++) tetra(ctx, x + 1 + i * 3, 16, PAL.green);
      // curd cups
      for (let i = 0; i < 3; i++) {
        rect(ctx, x + 1 + i * 4, 23, 3, 3, WH[3]);
        hline(ctx, x + 1 + i * 4, 23, 3, PAL.red[2]);
      }
    }
    // glass reflections
    for (let j = 0; j < 21; j++) {
      const rx = x + 1 + ((j * 1) % 13);
      if (j < 13) px(ctx, x + 12 - j, 7 + j, 'rgba(255,255,255,0.55)');
      void rx;
    }
    // handle
    vline(ctx, x + 13, 14, 6, M[1]);
  }
  // base grille
  rect(ctx, 0, 29, 48, 3, M[1]);
  for (let x = 1; x < 47; x += 2) px(ctx, x, 30, M[0]);
}

function shelfDairyEmptySlot(ctx: Ctx) {
  // empty lit gap
  rect(ctx, 0, 0, 16, 16, '#dff3fb');
  hline(ctx, 0, 0, 16, mix('#dff3fb', M[2], 0.5));
  hline(ctx, 0, 1, 16, mix('#dff3fb', M[2], 0.25));
  // shelf lip
  hline(ctx, 0, 2, 16, M[4]);
  // red SOLD OUT tag hanging from the shelf lip
  rect(ctx, 0, 3, 16, 13, PAL.red[2]);
  hline(ctx, 0, 3, 16, PAL.red[3]);
  hline(ctx, 0, 15, 16, PAL.red[0]);
  drawPixelText(ctx, 'SOLD', 1, 4, PAL.red[0]);
  drawPixelText(ctx, 'SOLD', 0, 4, '#ffffff');
  centredText(ctx, 'OUT', 0, 16, 10, '#ffffff');
}

// ------------------------------------------------------------ vegetables ---

function crate(ctx: Ctx, x: number, y: number, w: number, fill: (cx: number, cy: number) => void) {
  const wd = PAL.oak;
  // contents heap (drawn first, crate front overlaps)
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < w - 2; i += 2) fill(x + 1 + i + (j % 2), y + j);
  // crate front slats
  rect(ctx, x, y + 4, w, 6, wd[2]);
  hline(ctx, x, y + 4, w, wd[4]);
  hline(ctx, x, y + 7, w, wd[1]);
  hline(ctx, x, y + 9, w, wd[0]);
  vline(ctx, x, y + 4, 6, wd[3]);
  vline(ctx, x + w - 1, y + 4, 6, wd[1]);
}

function shelfVeg(ctx: Ctx) {
  const wd = PAL.wood;
  // back board + header
  rect(ctx, 0, 0, 48, 32, wd[1]);
  rect(ctx, 0, 0, 48, 6, PAL.green[2]);
  hline(ctx, 0, 0, 48, PAL.green[4]);
  hline(ctx, 0, 5, 48, PAL.green[0]);
  centredText(ctx, 'FRESH VEG', 0, 48, 1, '#ffffff');
  const tomato = (cx: number, cy: number) => {
    px(ctx, cx, cy, PAL.red[2]);
    px(ctx, cx + 1, cy, PAL.red[1]);
    if (hash2(cx, cy, 1) > 0.5) px(ctx, cx, cy, PAL.red[3]);
  };
  const potato = (cx: number, cy: number) => {
    px(ctx, cx, cy, PAL.dirt[3]);
    px(ctx, cx + 1, cy, PAL.dirt[2]);
    if (hash2(cx, cy, 2) > 0.6) px(ctx, cx, cy, PAL.dirt[4]);
  };
  const greens = (cx: number, cy: number) => {
    px(ctx, cx, cy, PAL.leaf[3]);
    px(ctx, cx + 1, cy, PAL.leaf[2]);
    if (hash2(cx, cy, 3) > 0.6) px(ctx, cx, cy, PAL.leaf[4]);
  };
  const onion = (cx: number, cy: number) => {
    px(ctx, cx, cy, PAL.purple[3]);
    px(ctx, cx + 1, cy, PAL.purple[2]);
  };
  const lemon = (cx: number, cy: number) => {
    px(ctx, cx, cy, PAL.yellow[3]);
    px(ctx, cx + 1, cy, PAL.yellow[2]);
  };
  const carrot = (cx: number, cy: number) => {
    px(ctx, cx, cy, PAL.orange[3]);
    px(ctx, cx + 1, cy, PAL.orange[2]);
  };
  const fills = [tomato, potato, greens, onion, lemon, carrot];
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 3; i++) {
      crate(ctx, 1 + i * 16, 7 + row * 12, 14, fills[row * 3 + i]);
      // price tag
      rect(ctx, 6 + i * 16, 15 + row * 12, 5, 3, '#fbf8f0');
      px(ctx, 7 + i * 16, 16 + row * 12, PAL.red[2]);
      px(ctx, 9 + i * 16, 16 + row * 12, PAL.dark[2]);
    }
  rect(ctx, 0, 30, 48, 2, wd[0]);
}

// ---------------------------------------------------------------- snacks ---

function shelfSnacks(ctx: Ctx) {
  rect(ctx, 0, 0, 48, 32, M[1]);
  rect(ctx, 0, 0, 48, 6, PAL.orange[2]);
  hline(ctx, 0, 0, 48, PAL.orange[4]);
  hline(ctx, 0, 5, 48, PAL.orange[0]);
  centredText(ctx, 'SNACKS', 0, 48, 1, '#ffffff');
  const cols = [PAL.red, PAL.yellow, PAL.green, PAL.blue, PAL.purple, PAL.orange, PAL.pink, PAL.teal];
  const levels = [6, 14, 22];
  levels.forEach((ly, li) => {
    rect(ctx, 1, ly, 46, 7, M[0]);
    let x = 2;
    let k = li * 3;
    while (x < 45) {
      const c = cols[k % cols.length];
      const boxy = (k + li) % 3 === 0;
      const w = boxy ? 4 : 3;
      if (x + w > 46) break;
      if (boxy) {
        rect(ctx, x, ly + 1, w, 6, c[2]);
        hline(ctx, x, ly + 1, w, c[3]);
        px(ctx, x + 1, ly + 3, '#ffffff');
        vline(ctx, x + w - 1, ly + 1, 6, c[1]);
      } else {
        // puffy packet
        rect(ctx, x, ly + 2, w, 5, c[2]);
        hline(ctx, x, ly + 2, w, c[1]);
        px(ctx, x + 1, ly + 3, c[4]);
        px(ctx, x + 1, ly + 4, PAL.yellow[3]);
      }
      x += w + 1;
      k++;
    }
    // shelf lip with price strip
    hline(ctx, 0, ly + 7, 48, M[4]);
    for (let px0 = 4; px0 < 46; px0 += 9) px(ctx, px0, ly + 7, PAL.yellow[3]);
  });
  rect(ctx, 0, 30, 48, 2, M[0]);
}

// ---------------------------------------------------------------- bakery ---

function shelfBakery(ctx: Ctx) {
  const wd = PAL.oak;
  rect(ctx, 0, 0, 32, 32, wd[1]);
  rect(ctx, 0, 0, 32, 6, PAL.yellow[2]);
  hline(ctx, 0, 0, 32, PAL.yellow[4]);
  hline(ctx, 0, 5, 32, PAL.yellow[0]);
  centredText(ctx, 'BAKERY', 0, 32, 1, PAL.wood[0]);
  const crust = ['#6b3a1c', '#9c5a2a', '#c98a4a', '#e6b06a', '#f6d9a0'];
  const loaf = (x: number, y: number) => {
    rect(ctx, x, y + 1, 7, 4, crust[2]);
    hline(ctx, x + 1, y, 5, crust[3]);
    hline(ctx, x + 1, y + 1, 5, crust[3]);
    px(ctx, x + 2, y, crust[4]);
    hline(ctx, x, y + 4, 7, crust[1]);
    px(ctx, x + 2, y + 2, crust[1]);
    px(ctx, x + 4, y + 2, crust[1]);
  };
  const bun = (x: number, y: number) => {
    ellipse(ctx, x, y + 1, 4, 3, crust[2]);
    px(ctx, x + 1, y + 1, crust[4]);
    px(ctx, x + 2, y + 1, crust[3]);
  };
  for (const y of [6, 14, 22]) {
    rect(ctx, 1, y, 30, 7, wd[0]);
    hline(ctx, 0, y + 7, 32, wd[3]);
  }
  for (let i = 0; i < 4; i++) loaf(2 + i * 7, 8);
  for (let i = 0; i < 6; i++) bun(2 + i * 5, 17);
  // cake + cookies
  rect(ctx, 3, 25, 9, 4, PAL.pink[3]);
  hline(ctx, 3, 25, 9, '#ffffff');
  px(ctx, 7, 24, PAL.red[2]);
  for (let i = 0; i < 4; i++) {
    ellipse(ctx, 15 + i * 4, 26, 3, 3, crust[3]);
    px(ctx, 16 + i * 4, 27, crust[0]);
  }
  rect(ctx, 0, 30, 32, 2, wd[0]);
}

// -------------------------------------------------------------- checkout ---

function checkout(ctx: Ctx) {
  const g = PAL.green;
  // counter front
  rect(ctx, 0, 13, 48, 11, g[2]);
  hline(ctx, 0, 13, 48, g[0]);
  hline(ctx, 0, 23, 48, g[0]);
  vline(ctx, 47, 13, 11, g[1]);
  rect(ctx, 14, 16, 20, 5, g[1]);
  centredText(ctx, 'PAY', 14, 20, 16, '#ffffff');
  // counter top
  rect(ctx, 0, 6, 48, 7, PAL.stone[3]);
  hline(ctx, 0, 6, 48, PAL.stone[4]);
  hline(ctx, 0, 12, 48, PAL.stone[1]);
  // conveyor belt
  rect(ctx, 1, 7, 27, 5, PAL.dark[2]);
  for (let x = 2; x < 28; x += 3) vline(ctx, x, 7, 5, PAL.dark[3]);
  hline(ctx, 1, 7, 27, M[3]);
  // items on belt
  rect(ctx, 5, 8, 3, 3, PAL.red[2]);
  rect(ctx, 11, 8, 4, 3, WH[3]);
  hline(ctx, 11, 9, 4, PAL.blue[2]);
  rect(ctx, 19, 8, 3, 3, PAL.yellow[3]);
  // divider bar
  rect(ctx, 24, 8, 1, 3, PAL.orange[2]);
  // register
  rect(ctx, 31, 4, 14, 8, M[1]);
  hline(ctx, 31, 4, 14, M[3]);
  rect(ctx, 33, 0, 9, 5, PAL.dark[2]); // screen
  rect(ctx, 34, 1, 7, 3, '#1f4a3a');
  drawPixelText(ctx, '₹', 34, 0, '#6aff9a');
  px(ctx, 39, 2, '#6aff9a');
  px(ctx, 40, 2, '#6aff9a');
  for (let y = 6; y < 11; y += 2) for (let x = 33; x < 43; x += 2) px(ctx, x, y, M[4]);
  // card machine
  rect(ctx, 44, 7, 3, 4, PAL.dark[3]);
  px(ctx, 45, 8, '#6aff9a');
}

function basketStack(ctx: Ctx) {
  const r = PAL.red;
  for (let i = 0; i < 3; i++) {
    const y = 9 - i * 3;
    rect(ctx, 2, y, 12, 6, r[2]);
    hline(ctx, 2, y, 12, r[3]);
    for (let x = 3; x < 13; x += 2) px(ctx, x, y + 2, r[1]);
    for (let x = 4; x < 13; x += 2) px(ctx, x, y + 4, r[1]);
    vline(ctx, 13, y, 6, r[1]);
  }
  // handles
  rect(ctx, 3, 0, 1, 5, PAL.dark[3]);
  rect(ctx, 12, 0, 1, 5, PAL.dark[3]);
  hline(ctx, 3, 0, 10, PAL.dark[3]);
  rect(ctx, 2, 15, 12, 1, r[0]);
}

function storeBanner(ctx: Ctx) {
  // strings
  px(ctx, 3, 0, M[2]);
  px(ctx, 44, 0, M[2]);
  px(ctx, 3, 1, M[2]);
  px(ctx, 44, 1, M[2]);
  rect(ctx, 0, 2, 48, 11, PAL.red[2]);
  hline(ctx, 0, 2, 48, PAL.red[4]);
  hline(ctx, 0, 3, 48, PAL.red[3]);
  hline(ctx, 0, 12, 48, PAL.red[0]);
  // pennant tails
  for (let x = 0; x < 48; x += 4) {
    px(ctx, x + 1, 13, PAL.red[1]);
    px(ctx, x + 2, 13, PAL.red[1]);
    px(ctx, x + 2, 14, PAL.red[0]);
  }
  centredText(ctx, 'FRESH SALE', 0, 48, 6, PAL.red[0]);
  centredText(ctx, 'FRESH SALE', 0, 48, 5, PAL.yellow[3]);
}

function queueSign(ctx: Ctx) {
  // base + post
  ellipse(ctx, 6, 21, 12, 3, M[1]);
  rect(ctx, 11, 12, 2, 10, M[3]);
  vline(ctx, 11, 12, 10, M[4]);
  // sign
  rect(ctx, 0, 0, 24, 13, PAL.yellow[3]);
  hline(ctx, 0, 0, 24, PAL.yellow[4]);
  hline(ctx, 0, 12, 24, PAL.yellow[1]);
  vline(ctx, 23, 0, 13, PAL.yellow[2]);
  centredText(ctx, 'QUEUE', 0, 24, 1, PAL.dark[1]);
  centredText(ctx, 'HERE', 0, 24, 7, PAL.red[1]);
}

// ---------------------------------------------------------------- clinic ---

function reception(ctx: Ctx) {
  const t = PAL.teal;
  // desk front
  rect(ctx, 0, 12, 48, 12, t[2]);
  hline(ctx, 0, 12, 48, t[0]);
  hline(ctx, 0, 23, 48, t[0]);
  vline(ctx, 47, 12, 12, t[1]);
  for (let x = 4; x < 46; x += 8) vline(ctx, x, 14, 8, t[3]);
  // cross logo
  rect(ctx, 21, 15, 6, 6, '#ffffff');
  rect(ctx, 23, 16, 2, 4, PAL.red[2]);
  rect(ctx, 22, 17, 4, 2, PAL.red[2]);
  // countertop
  rect(ctx, 0, 6, 48, 6, WH[3]);
  hline(ctx, 0, 6, 48, WH[4]);
  hline(ctx, 0, 11, 48, WH[1]);
  // monitor
  rect(ctx, 28, 0, 14, 9, PAL.dark[2]);
  rect(ctx, 29, 1, 12, 6, '#7ab4e8');
  hline(ctx, 30, 2, 8, '#ffffff');
  hline(ctx, 30, 4, 6, '#cfe8ff');
  rect(ctx, 34, 9, 2, 2, PAL.dark[3]);
  // keyboard
  rect(ctx, 29, 10, 10, 1, PAL.dark[3]);
  // papers + bell + pen holder
  rect(ctx, 6, 7, 8, 4, '#fbf8f0');
  hline(ctx, 7, 8, 5, PAL.metal[3]);
  hline(ctx, 7, 9, 6, PAL.metal[3]);
  ellipse(ctx, 17, 6, 4, 4, PAL.yellow[3]);
  px(ctx, 18, 6, PAL.yellow[4]);
  hline(ctx, 16, 9, 6, PAL.metal[2]);
  rect(ctx, 44, 7, 2, 3, PAL.blue[2]);
  px(ctx, 44, 6, PAL.red[2]);
}

function waitingChairs(ctx: Ctx) {
  const b = PAL.blue;
  // beam + legs
  rect(ctx, 1, 11, 46, 2, M[2]);
  hline(ctx, 1, 11, 46, M[4]);
  for (const x of [3, 23, 43]) rect(ctx, x, 13, 2, 3, M[1]);
  for (let i = 0; i < 3; i++) {
    const x = 1 + i * 16;
    rrect(ctx, x, 0, 14, 7, b[2], 2);
    hline(ctx, x + 1, 0, 12, b[3]);
    px(ctx, x + 2, 1, b[4]);
    rrect(ctx, x, 6, 14, 5, b[3], 1);
    hline(ctx, x + 1, 6, 12, b[4]);
    hline(ctx, x + 1, 10, 12, b[1]);
  }
}

function tokenDisplay(ctx: Ctx) {
  rect(ctx, 0, 0, 32, 16, PAL.dark[2]);
  hline(ctx, 0, 0, 32, PAL.dark[4]);
  rect(ctx, 2, 2, 28, 12, '#120d1a');
  drawPixelText(ctx, 'TOKEN', 4, 3, '#a03a3a');
  // ghost segments + lit digits
  drawPixelText(ctx, '88', 22, 3, '#3a1418');
  drawPixelText(ctx, '12', 22, 3, '#ff4a4a');
  hline(ctx, 4, 10, 24, '#3a1418');
  drawPixelText(ctx, 'NOW', 4, 9, '#ff8a5a');
  px(ctx, 28, 13, '#5aff8a');
}

function posterHealth(ctx: Ctx) {
  rect(ctx, 0, 0, 24, 24, '#fbf8f0');
  hline(ctx, 0, 0, 24, '#ffffff');
  vline(ctx, 23, 0, 24, PAL.paper[1]);
  hline(ctx, 0, 23, 24, PAL.paper[1]);
  rect(ctx, 0, 0, 24, 7, PAL.teal[2]);
  centredText(ctx, 'WASH', 0, 24, 1, '#ffffff');
  centredText(ctx, 'HANDS', 0, 24, 17, PAL.teal[1]);
  // tap + drops + hands
  rect(ctx, 6, 8, 6, 2, M[3]);
  vline(ctx, 11, 10, 1, M[2]);
  px(ctx, 11, 12, PAL.water[3]);
  px(ctx, 11, 14, PAL.water[3]);
  sprite(ctx, 13, 10, ['.##.', '####', '####', '.##.'], { '#': '#e8b48a' });
  sprite(ctx, 8, 12, ['.##', '###', '##.'], { '#': '#c98e62' });
  // bubbles
  px(ctx, 18, 9, PAL.glass[4]);
  px(ctx, 19, 11, PAL.glass[3]);
  px(ctx, 5, 13, PAL.glass[4]);
  // tape
  rect(ctx, 10, 0, 4, 1, 'rgba(250,240,200,0.9)');
}

function waterCooler(ctx: Ctx) {
  // bottle
  rect(ctx, 4, 0, 8, 9, PAL.water[3]);
  hline(ctx, 4, 0, 8, PAL.water[4]);
  vline(ctx, 5, 1, 7, '#cfeefc');
  vline(ctx, 11, 0, 9, PAL.water[2]);
  hline(ctx, 4, 3, 8, PAL.water[2]);
  rect(ctx, 6, 9, 4, 1, PAL.water[1]);
  // body
  rect(ctx, 2, 10, 12, 14, WH[3]);
  hline(ctx, 2, 10, 12, WH[4]);
  vline(ctx, 13, 10, 14, WH[1]);
  hline(ctx, 2, 23, 12, WH[0]);
  // taps
  rect(ctx, 4, 13, 2, 2, PAL.blue[2]);
  rect(ctx, 10, 13, 2, 2, PAL.red[2]);
  rect(ctx, 3, 17, 10, 2, WH[1]);
  for (let x = 4; x < 12; x += 2) px(ctx, x, 17, WH[0]);
  // cup holder
  rect(ctx, 14, 12, 2, 5, PAL.metal[3]);
  void leafBall;
}

export const SHOP_PROPS: Record<string, PropDef> = {
  'shelf-dairy': { w: 48, h: 32, draw: shelfDairy },
  'shelf-dairy-empty-slot': { w: 16, h: 16, draw: shelfDairyEmptySlot },
  'shelf-veg': { w: 48, h: 32, draw: shelfVeg },
  'shelf-snacks': { w: 48, h: 32, draw: shelfSnacks },
  'shelf-bakery': { w: 32, h: 32, draw: shelfBakery },
  checkout: { w: 48, h: 24, draw: checkout },
  'basket-stack': { w: 16, h: 16, draw: basketStack },
  'store-banner': { w: 48, h: 16, draw: storeBanner },
  'queue-sign': { w: 24, h: 24, draw: queueSign },
  reception: { w: 48, h: 24, draw: reception },
  'waiting-chairs': { w: 48, h: 16, draw: waitingChairs },
  'token-display': { w: 32, h: 16, draw: tokenDisplay },
  'poster-health': { w: 24, h: 24, draw: posterHealth },
  'water-cooler': { w: 16, h: 24, draw: waterCooler },
};
