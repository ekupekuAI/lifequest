// Town props: buildings (3/4 view), trees, street furniture, cars.

import { PAL, GLOW, type Ramp } from './palette';
import { type Ctx, px, rect, hline, vline, ellipse, line, sprite, mix, hash2, ramp, rrect } from './draw';
import {
  plaster,
  tiledRoof,
  flatRoof,
  facadeWindow,
  awning,
  signBoard,
  door,
  leafBall,
  pottedPlant,
  glass,
  groundShadow,
} from './kit';
import { drawPixelText, measurePixelText } from './pixelFont';
import { drawFittedText, fitText, signText } from './signs';
import type { PropDef } from './props';

const WH = PAL.white;

/** Clear pixels so roofs get hipped / slanted silhouettes. */
function clear(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.clearRect(x, y, w, h);
}

function hipRoof(ctx: Ctx, x: number, y: number, w: number, h: number, r: Ramp, inset = 8) {
  tiledRoof(ctx, x, y, w, h, r);
  const slope = Math.max(1, Math.floor(h * 0.45));
  for (let j = 0; j < slope; j++) {
    const k = Math.round(inset * (1 - j / slope));
    clear(ctx, x, y + j, k, 1);
    clear(ctx, x + w - k, y + j, k, 1);
    // hip edges catch light on the left, shade on the right
    if (k > 0) {
      px(ctx, x + k, y + j, r[4]);
      px(ctx, x + w - k - 1, y + j, r[1]);
    }
  }
  hline(ctx, x + inset, y, w - inset * 2, r[4]);
}

/** Concrete sunshade (chajja) over a window. */
function chajja(ctx: Ctx, x: number, y: number, w: number) {
  hline(ctx, x, y, w, WH[4]);
  hline(ctx, x, y + 1, w, WH[2]);
  hline(ctx, x + 1, y + 2, w - 2, 'rgba(27,19,37,0.25)');
}

function plinth(ctx: Ctx, x: number, y: number, w: number, h = 3) {
  rect(ctx, x, y, w, h, PAL.stone[2]);
  hline(ctx, x, y, w, PAL.stone[3]);
  hline(ctx, x, y + h - 1, w, PAL.stone[1]);
}

function steps(ctx: Ctx, x: number, y: number, w: number) {
  rect(ctx, x - 2, y, w + 4, 2, PAL.stone[3]);
  hline(ctx, x - 2, y, w + 4, PAL.stone[4]);
  hline(ctx, x - 2, y + 1, w + 4, PAL.stone[2]);
}

function waterTank(ctx: Ctx, x: number, y: number) {
  const d = PAL.dark;
  rect(ctx, x, y + 2, 10, 9, d[2]);
  ellipse(ctx, x, y, 10, 4, d[3]);
  ellipse(ctx, x + 3, y + 1, 4, 2, d[2]);
  vline(ctx, x + 1, y + 3, 7, d[4]);
  hline(ctx, x, y + 5, 10, d[1]);
  hline(ctx, x, y + 8, 10, d[1]);
  hline(ctx, x, y + 10, 10, d[0]);
}

// --------------------------------------------------------------- houses ---

function housePlayer(ctx: Ctx) {
  const wall = ramp('#f2c98e');
  const roof = PAL.terra;
  // facade (two storeys)
  plaster(ctx, 2, 24, 76, 56, wall, 5);
  vline(ctx, 2, 24, 56, wall[3]);
  // floor band between storeys
  rect(ctx, 2, 50, 76, 2, wall[1]);
  hline(ctx, 2, 50, 76, wall[3]);
  // roof
  hipRoof(ctx, 0, 0, 80, 26, roof, 10);
  // dormer / attic window on roof
  rect(ctx, 34, 6, 12, 12, WH[3]);
  tiledRoof(ctx, 32, 2, 16, 5, roof);
  glass(ctx, 36, 9, 8, 7, PAL.glass, true);
  vline(ctx, 40, 9, 7, WH[2]);
  hline(ctx, 33, 17, 14, roof[0]);
  // eave shadow on wall
  hline(ctx, 2, 26, 76, wall[0]);
  hline(ctx, 2, 27, 76, wall[1]);
  // upper windows + balcony
  chajja(ctx, 9, 29, 18);
  facadeWindow(ctx, 11, 32, 14, 14, WH, PAL.red[3]);
  chajja(ctx, 53, 29, 18);
  facadeWindow(ctx, 55, 32, 14, 14, WH, PAL.red[3]);
  // round vent + house name
  ellipse(ctx, 36, 32, 8, 8, WH[3]);
  ellipse(ctx, 37, 33, 6, 6, wall[0]);
  px(ctx, 39, 35, PAL.yellow[3]);
  px(ctx, 40, 35, PAL.yellow[3]);
  // balcony plants along floor band
  for (const x of [12, 19, 56, 63]) pottedPlant(ctx, x, 41, x % 2 ? PAL.pink[3] : PAL.yellow[3]);
  // lower windows
  chajja(ctx, 6, 55, 18);
  facadeWindow(ctx, 8, 58, 14, 12, WH, PAL.teal[3]);
  chajja(ctx, 56, 55, 18);
  facadeWindow(ctx, 58, 58, 14, 12, WH, PAL.teal[3]);
  // door
  const dr = ramp('#2e8a7e');
  chajja(ctx, 31, 58, 18);
  door(ctx, 34, 62, 12, 16, dr);
  // toran over the door
  for (let x = 34; x < 46; x += 2) {
    px(ctx, x, 62, PAL.orange[2]);
    px(ctx, x + 1, 62, PAL.leaf[3]);
  }
  // number plate
  rect(ctx, 48, 64, 7, 6, '#fbf8f0');
  hline(ctx, 48, 69, 7, PAL.paper[1]);
  drawPixelText(ctx, '12', 49, 64, PAL.blue[2]);
  // wall lamp
  rect(ctx, 30, 63, 2, 3, '#ffe9a8');
  px(ctx, 30, 62, PAL.dark[2]);
  plinth(ctx, 2, 77, 76);
  steps(ctx, 34, 78, 12);
  // potted plants by the door
  pottedPlant(ctx, 25, 69, PAL.red[3]);
  pottedPlant(ctx, 49, 70, PAL.yellow[3]);
  // little rangoli dots on the step
  px(ctx, 38, 79, PAL.pink[3]);
  px(ctx, 40, 79, PAL.yellow[3]);
  px(ctx, 42, 79, PAL.pink[3]);
}

function houseFlat(ctx: Ctx, wallHex: string, doorHex: string, accent: Ramp) {
  // flat-roof Indian house with water tank
  const wall = ramp(wallHex);
  plaster(ctx, 0, 16, 64, 56, wall, 9);
  flatRoof(ctx, 0, 0, 64, 18);
  waterTank(ctx, 46, 2);
  // pipes + dish
  vline(ctx, 50, 12, 4, PAL.metal[2]);
  ellipse(ctx, 6, 4, 6, 6, WH[3]);
  px(ctx, 8, 6, PAL.metal[2]);
  hline(ctx, 0, 18, 64, wall[0]);
  // upper storey
  chajja(ctx, 5, 21, 16);
  facadeWindow(ctx, 7, 24, 12, 12, WH, accent[3]);
  chajja(ctx, 43, 21, 16);
  facadeWindow(ctx, 45, 24, 12, 12, WH, accent[3]);
  // balcony with railing
  rect(ctx, 22, 34, 20, 2, WH[3]);
  for (let x = 22; x < 42; x += 2) vline(ctx, x, 28, 6, PAL.metal[1]);
  hline(ctx, 22, 28, 20, PAL.metal[3]);
  rect(ctx, 25, 22, 14, 6, accent[1]);
  pottedPlant(ctx, 24, 25, PAL.red[3]);
  // clothesline on balcony
  line(ctx, 30, 23, 38, 23, PAL.metal[3]);
  rect(ctx, 31, 24, 2, 3, PAL.yellow[3]);
  rect(ctx, 35, 24, 2, 3, PAL.blue[3]);
  // floor band
  rect(ctx, 0, 42, 64, 2, wall[1]);
  hline(ctx, 0, 42, 64, wall[3]);
  // lower storey
  chajja(ctx, 4, 47, 16);
  facadeWindow(ctx, 6, 50, 12, 12, WH, accent[3]);
  chajja(ctx, 44, 47, 16);
  facadeWindow(ctx, 46, 50, 12, 12, WH, accent[3]);
  door(ctx, 26, 54, 12, 15, ramp(doorHex));
  chajja(ctx, 23, 50, 18);
  plinth(ctx, 0, 69, 64);
  steps(ctx, 26, 70, 12);
  pottedPlant(ctx, 19, 62, PAL.pink[3]);
}

function houseTiled(ctx: Ctx, wallHex: string, roof: Ramp, doorHex: string, accent: Ramp) {
  const wall = ramp(wallHex);
  plaster(ctx, 2, 22, 60, 50, wall, 13);
  hipRoof(ctx, 0, 0, 64, 24, roof, 8);
  // chimney-like vent
  rect(ctx, 44, 2, 5, 8, PAL.stone[2]);
  hline(ctx, 44, 2, 5, PAL.stone[4]);
  hline(ctx, 2, 24, 60, wall[0]);
  hline(ctx, 2, 25, 60, wall[1]);
  // upper bay window
  chajja(ctx, 21, 27, 22);
  facadeWindow(ctx, 23, 30, 18, 12, WH, accent[3]);
  rect(ctx, 22, 42, 20, 2, PAL.wood[2]);
  for (const x of [24, 30, 36]) pottedPlant(ctx, x, 36, x === 30 ? PAL.yellow[3] : PAL.red[3]);
  // floor band
  rect(ctx, 2, 46, 60, 2, wall[1]);
  hline(ctx, 2, 46, 60, wall[3]);
  // ground floor
  chajja(ctx, 4, 50, 16);
  facadeWindow(ctx, 6, 53, 12, 11, WH, accent[3]);
  chajja(ctx, 44, 50, 16);
  facadeWindow(ctx, 46, 53, 12, 11, WH, accent[3]);
  door(ctx, 26, 55, 12, 14, ramp(doorHex));
  plinth(ctx, 2, 69, 60);
  steps(ctx, 26, 70, 12);
  pottedPlant(ctx, 40, 62, PAL.purple[3]);
}

// --------------------------------------------------------------- shops ---

function storeFront(ctx: Ctx) {
  const wall = ramp('#e9e4d8');
  plaster(ctx, 0, 14, 112, 66, wall, 21);
  flatRoof(ctx, 0, 0, 112, 16);
  // AC units + vents on roof
  for (const x of [10, 26]) {
    rect(ctx, x, 4, 12, 7, WH[3]);
    hline(ctx, x, 4, 12, WH[4]);
    hline(ctx, x, 10, 12, WH[1]);
    ellipse(ctx, x + 6, 5, 5, 5, PAL.metal[2]);
    px(ctx, x + 8, 7, PAL.metal[0]);
  }
  rect(ctx, 86, 4, 14, 6, PAL.metal[3]);
  for (let x = 87; x < 99; x += 2) vline(ctx, x, 5, 4, PAL.metal[1]);
  // green sign band
  const g = PAL.green;
  rect(ctx, 0, 16, 112, 16, g[1]);
  hline(ctx, 0, 16, 112, g[3]);
  hline(ctx, 0, 17, 112, g[2]);
  hline(ctx, 0, 31, 112, g[0]);
  // logo leaf + text (scale 2)
  const text = signText('store');
  const withLogo = fitText(text, 92, 10, 2);
  if (withLogo.scale === 2 && withLogo.lines.length === 1) {
    // leaf logo + big name, centred as one group
    const tx = Math.floor((112 - withLogo.w) / 2) + 6;
    sprite(ctx, tx - 12, 19, ['..###', '.####', '####.', '###..', '#....'], { '#': PAL.yellow[3] });
    px(ctx, tx - 10, 20, PAL.yellow[4]);
    drawFittedText(ctx, text, tx + 1, 20, withLogo.w, 10, g[0], undefined, 2);
    drawFittedText(ctx, text, tx, 19, withLogo.w, 10, '#ffffff', undefined, 2);
  } else {
    drawFittedText(ctx, text, 4, 19, 104, 12, '#ffffff', g[0], 2);
  }
  // awning
  awning(ctx, 2, 33, 108, 9, g, WH, 6);
  // display windows
  for (const wx of [5, 77]) {
    rect(ctx, wx - 1, 46, 32, 26, PAL.metal[1]);
    glass(ctx, wx, 47, 30, 22);
    // produce crates behind the glass
    for (let i = 0; i < 3; i++) {
      const cx = wx + 2 + i * 10;
      rect(ctx, cx, 61, 8, 6, PAL.wood[2]);
      hline(ctx, cx, 61, 8, PAL.wood[3]);
      const fruit = [PAL.red, PAL.orange, PAL.green][(i + wx) % 3];
      for (let k = 0; k < 4; k++) {
        px(ctx, cx + 1 + k * 2, 60, fruit[2]);
        px(ctx, cx + 1 + k * 2, 59, fruit[3]);
        px(ctx, cx + 2 + k * 2, 60, fruit[1]);
      }
    }
    // offer poster
    rect(ctx, wx + 3, 49, 9, 7, PAL.yellow[3]);
    drawPixelText(ctx, '50%', wx + 3, 50, PAL.red[2]);
    hline(ctx, wx - 1, 71, 32, PAL.metal[3]);
  }
  // sliding glass doors
  rect(ctx, 39, 46, 34, 34, PAL.metal[1]);
  hline(ctx, 39, 46, 34, PAL.metal[3]);
  glass(ctx, 41, 48, 14, 31);
  glass(ctx, 57, 48, 14, 31);
  vline(ctx, 56, 48, 31, PAL.metal[2]);
  hline(ctx, 41, 63, 30, PAL.metal[3]);
  // OPEN sign
  rect(ctx, 44, 51, 17, 7, PAL.red[2]);
  hline(ctx, 44, 51, 17, PAL.red[3]);
  drawPixelText(ctx, 'OPEN', 45, 52, '#ffffff');
  plinth(ctx, 0, 77, 39);
  plinth(ctx, 73, 77, 39);
  rect(ctx, 39, 78, 34, 2, PAL.stone[3]);
}

function kiosk(ctx: Ctx) {
  // corrugated tin roof
  const m = PAL.metal;
  rect(ctx, 0, 0, 64, 9, m[3]);
  for (let x = 0; x < 64; x++) {
    const k = x % 4;
    vline(ctx, x, 0, 9, k === 0 ? m[4] : k === 3 ? m[1] : m[3]);
  }
  for (const [x, y] of [
    [9, 3],
    [10, 4],
    [40, 6],
    [41, 6],
    [55, 2],
  ])
    px(ctx, x, y, PAL.orange[1]);
  hline(ctx, 0, 8, 64, m[0]);
  // walls
  const wall = ramp('#7ab4c8');
  rect(ctx, 2, 9, 60, 39, wall[2]);
  vline(ctx, 2, 9, 39, wall[3]);
  vline(ctx, 61, 9, 39, wall[1]);
  // sign
  signBoard(ctx, 4, 10, 56, 9, PAL.yellow, signText('kiosk'), PAL.red[1], PAL.yellow[1]);
  // awning
  awning(ctx, 2, 19, 60, 6, PAL.red, WH, 4);
  // opening with goods
  rect(ctx, 6, 27, 52, 13, PAL.dark[2]);
  hline(ctx, 6, 27, 52, PAL.dark[1]);
  // shelves
  for (const y of [31, 36]) hline(ctx, 6, y, 52, PAL.wood[2]);
  const goods = [PAL.red, PAL.yellow, PAL.green, PAL.blue, PAL.orange, PAL.pink, PAL.purple];
  for (let x = 7; x < 57; x += 3) {
    const gc = goods[Math.floor(hash2(x, 1, 8) * goods.length)];
    rect(ctx, x, 29, 2, 2, gc[2]);
    px(ctx, x, 29, gc[3]);
    const gc2 = goods[Math.floor(hash2(x, 2, 8) * goods.length)];
    rect(ctx, x, 33, 2, 3, gc2[2]);
    px(ctx, x, 33, gc2[4]);
  }
  // hanging chip packets strip
  for (let i = 0; i < 6; i++) {
    const x = 9 + i * 8;
    vline(ctx, x + 1, 27, 1, m[3]);
    rect(ctx, x, 28, 3, 4, i % 2 ? PAL.orange[2] : PAL.blue[3]);
    px(ctx, x + 1, 29, PAL.yellow[4]);
  }
  // counter
  rect(ctx, 4, 40, 56, 2, PAL.wood[3]);
  hline(ctx, 4, 40, 56, PAL.wood[4]);
  rect(ctx, 4, 42, 56, 6, ramp('#3b6fa6')[2]);
  hline(ctx, 4, 47, 56, PAL.blue[0]);
  for (let x = 8; x < 58; x += 10) vline(ctx, x, 42, 6, PAL.blue[1]);
  // glass jars on the counter
  for (const [x, c] of [
    [8, PAL.orange[3]],
    [14, PAL.pink[3]],
    [44, PAL.yellow[3]],
    [50, PAL.green[3]],
  ] as [number, string][]) {
    rect(ctx, x, 36, 4, 4, PAL.glass[3]);
    rect(ctx, x, 37, 4, 3, c);
    hline(ctx, x, 35, 4, PAL.red[2]);
    px(ctx, x, 37, '#ffffff');
  }
  // scale
  rect(ctx, 28, 38, 8, 2, m[2]);
  ellipse(ctx, 29, 35, 6, 3, m[4]);
}

function clinicFront(ctx: Ctx) {
  const wall = ramp('#eef2f0');
  plaster(ctx, 0, 12, 96, 68, wall, 31);
  flatRoof(ctx, 0, 0, 96, 14);
  waterTank(ctx, 78, 1);
  // teal trim band
  rect(ctx, 0, 14, 96, 2, PAL.teal[2]);
  // sign band
  rect(ctx, 14, 18, 68, 14, WH[4]);
  hline(ctx, 14, 31, 68, WH[1]);
  vline(ctx, 81, 18, 14, WH[1]);
  // red cross badge
  rect(ctx, 18, 19, 12, 12, PAL.red[2]);
  hline(ctx, 18, 19, 12, PAL.red[3]);
  rect(ctx, 22, 21, 4, 8, '#ffffff');
  rect(ctx, 20, 23, 8, 4, '#ffffff');
  drawFittedText(ctx, signText('clinic'), 33, 19, 48, 12, PAL.red[2], PAL.red[0], 2);
  // windows (blue tint, blinds)
  for (const wx of [6, 70]) {
    chajja(ctx, wx - 2, 37, 24);
    rect(ctx, wx, 40, 20, 16, WH[3]);
    glass(ctx, wx + 1, 41, 18, 13);
    for (let y = 42; y < 54; y += 3) hline(ctx, wx + 1, y, 18, mix(PAL.glass[3], '#ffffff', 0.4));
    vline(ctx, wx + 10, 41, 13, WH[2]);
    rect(ctx, wx - 1, 54, 22, 2, WH[3]);
    hline(ctx, wx - 1, 55, 22, WH[1]);
  }
  // lower windows
  for (const wx of [6, 70]) facadeWindow(ctx, wx + 2, 60, 16, 12, WH);
  // entrance canopy
  rect(ctx, 32, 38, 32, 4, PAL.teal[2]);
  hline(ctx, 32, 38, 32, PAL.teal[3]);
  hline(ctx, 32, 41, 32, PAL.teal[0]);
  for (let x = 33; x < 64; x += 2) px(ctx, x, 42, 'rgba(27,19,37,0.3)');
  // double glass door
  rect(ctx, 35, 44, 26, 34, PAL.metal[2]);
  glass(ctx, 37, 46, 10, 32);
  glass(ctx, 49, 46, 10, 32);
  vline(ctx, 48, 46, 32, PAL.metal[1]);
  // cross decals
  for (const dx of [41, 53]) {
    rect(ctx, dx, 54, 2, 6, PAL.red[2]);
    rect(ctx, dx - 2, 56, 6, 2, PAL.red[2]);
  }
  // ramp + steps
  plinth(ctx, 0, 77, 96);
  rect(ctx, 33, 78, 30, 2, PAL.stone[3]);
  hline(ctx, 33, 78, 30, PAL.stone[4]);
  pottedPlant(ctx, 27, 69);
  pottedPlant(ctx, 63, 69);
}

function school(ctx: Ctx) {
  const wall = ramp('#f2d38a');
  const brick = PAL.terra;
  plaster(ctx, 2, 20, 108, 60, wall, 41);
  hipRoof(ctx, 0, 0, 104, 22, PAL.red, 10);
  // bell tower on roof
  rect(ctx, 44, 0, 16, 14, WH[3]);
  hline(ctx, 44, 0, 16, WH[4]);
  ellipse(ctx, 47, 3, 10, 10, PAL.yellow[2]);
  ellipse(ctx, 48, 4, 8, 8, '#ffffff');
  vline(ctx, 52, 5, 3, PAL.dark[1]);
  hline(ctx, 52, 8, 3, PAL.dark[1]);
  hline(ctx, 2, 22, 104, wall[0]);
  // brick pilasters
  for (const x of [2, 36, 70, 104]) {
    rect(ctx, x, 23, 4, 54, brick[2]);
    for (let y = 24; y < 77; y += 3) hline(ctx, x, y, 4, brick[1]);
    vline(ctx, x, 23, 54, brick[3]);
  }
  // windows two rows
  for (const wx of [9, 22, 76, 89]) {
    facadeWindow(ctx, wx, 27, 10, 12, WH, undefined);
    facadeWindow(ctx, wx, 54, 10, 12, WH, undefined);
  }
  // sign over entrance
  signBoard(ctx, 39, 24, 32, 13, PAL.blue, signText('school'), '#ffffff', PAL.blue[0]);
  // entrance arch + doors
  rect(ctx, 42, 42, 26, 35, brick[2]);
  ellipse(ctx, 42, 38, 26, 10, brick[2]);
  ellipse(ctx, 45, 41, 20, 8, PAL.green[1]);
  rect(ctx, 45, 45, 20, 32, PAL.green[2]);
  vline(ctx, 55, 45, 32, PAL.green[0]);
  vline(ctx, 45, 45, 32, PAL.green[3]);
  for (const y of [50, 62]) {
    rect(ctx, 47, y, 6, 8, PAL.green[1]);
    rect(ctx, 57, y, 6, 8, PAL.green[1]);
  }
  px(ctx, 53, 61, PAL.yellow[3]);
  px(ctx, 57, 61, PAL.yellow[3]);
  plinth(ctx, 2, 77, 108);
  steps(ctx, 44, 78, 22);
  // flag pole + school pennant
  vline(ctx, 108, 0, 30, PAL.metal[3]);
  vline(ctx, 109, 0, 30, PAL.metal[1]);
  px(ctx, 108, 0, PAL.yellow[3]);
  sprite(
    ctx,
    98,
    2,
    ['##########', '#########.', '########..', '#######...', '######....'],
    { '#': PAL.blue[3] },
  );
  hline(ctx, 98, 2, 10, PAL.blue[4]);
  sprite(ctx, 101, 3, ['.#.', '###', '.#.'], { '#': PAL.yellow[3] });
  // flipped pennant points left -> mirror visual: pole on right side
}

function busStop(ctx: Ctx) {
  const b = PAL.blue;
  // back glass panel
  rect(ctx, 3, 7, 42, 14, PAL.metal[2]);
  glass(ctx, 4, 8, 40, 12);
  // ad poster
  rect(ctx, 30, 9, 12, 10, PAL.orange[2]);
  rect(ctx, 31, 10, 10, 4, PAL.yellow[3]);
  px(ctx, 35, 15, '#ffffff');
  px(ctx, 36, 16, '#ffffff');
  // posts
  rect(ctx, 2, 6, 2, 26, b[1]);
  rect(ctx, 44, 6, 2, 26, b[0]);
  // bench
  rect(ctx, 6, 21, 36, 3, PAL.wood[3]);
  hline(ctx, 6, 21, 36, PAL.wood[4]);
  hline(ctx, 6, 23, 36, PAL.wood[1]);
  rect(ctx, 6, 24, 36, 2, PAL.wood[2]);
  for (const x of [8, 39]) rect(ctx, x, 26, 2, 5, PAL.metal[1]);
  // roof with fascia sign
  rect(ctx, 0, 0, 48, 7, b[2]);
  hline(ctx, 0, 0, 48, b[4]);
  hline(ctx, 0, 1, 48, b[3]);
  hline(ctx, 0, 6, 48, b[0]);
  rect(ctx, 14, 1, 20, 6, '#fbf8f0');
  drawPixelText(ctx, 'BUS 12', 13 + Math.floor((22 - measurePixelText('BUS 12')) / 2), 2, b[1]);
}

// ---------------------------------------------------------------- nature ---

function tree(ctx: Ctx) {
  groundShadow(ctx, 4, 33, 24, 7);
  // trunk
  const bark = PAL.wood;
  rect(ctx, 13, 24, 6, 13, bark[2]);
  vline(ctx, 13, 24, 13, bark[3]);
  vline(ctx, 18, 24, 13, bark[1]);
  px(ctx, 15, 28, bark[1]);
  px(ctx, 16, 32, bark[1]);
  px(ctx, 12, 36, bark[2]);
  px(ctx, 19, 36, bark[1]);
  // canopy layers (back to front)
  const l = PAL.leaf;
  leafBall(ctx, 1, 10, 30, 18, l, 3);
  leafBall(ctx, 4, 2, 24, 18, l, 5);
  leafBall(ctx, 2, 12, 13, 11, l, 7);
  leafBall(ctx, 16, 13, 14, 11, l, 9);
  leafBall(ctx, 9, 5, 14, 11, l, 11);
  // a few blossoms
  for (const [x, y] of [
    [8, 9],
    [21, 8],
    [12, 18],
    [25, 17],
    [6, 19],
  ])
    px(ctx, x, y, PAL.orange[3]);
}

function treeSmall(ctx: Ctx) {
  groundShadow(ctx, 4, 27, 16, 5);
  rect(ctx, 10, 19, 4, 11, PAL.wood[2]);
  vline(ctx, 10, 19, 11, PAL.wood[3]);
  vline(ctx, 13, 19, 11, PAL.wood[1]);
  const l = PAL.leaf;
  leafBall(ctx, 1, 6, 22, 15, l, 13);
  leafBall(ctx, 4, 1, 16, 13, l, 15);
  leafBall(ctx, 7, 4, 10, 8, l, 17);
}

function bush(ctx: Ctx) {
  groundShadow(ctx, 2, 11, 12, 5);
  leafBall(ctx, 0, 4, 10, 10, PAL.leaf, 21);
  leafBall(ctx, 6, 4, 10, 10, PAL.leaf, 23);
  leafBall(ctx, 3, 1, 10, 10, PAL.leaf, 25);
  px(ctx, 5, 5, PAL.pink[3]);
  px(ctx, 10, 7, PAL.pink[3]);
  px(ctx, 7, 10, '#ffffff');
}

function flowerBed(ctx: Ctx) {
  const br = PAL.terra;
  // brick border front
  rect(ctx, 0, 10, 32, 6, br[2]);
  for (let y = 10; y < 16; y += 2)
    for (let x = (y / 2) % 2 ? 0 : 2; x < 32; x += 4) px(ctx, x, y, br[1]);
  hline(ctx, 0, 10, 32, br[3]);
  hline(ctx, 0, 15, 32, br[0]);
  // soil
  rect(ctx, 1, 3, 30, 7, PAL.dirt[1]);
  rect(ctx, 0, 2, 32, 1, br[3]);
  for (let x = 1; x < 31; x++) if (hash2(x, 3, 2) < 0.3) px(ctx, x, 4 + (x % 3), PAL.dirt[0]);
  // flowers
  const colors = [PAL.red, PAL.yellow, PAL.pink, PAL.purple, WH];
  for (let i = 0; i < 7; i++) {
    const x = 3 + i * 4;
    const y = 2 + (i % 2) * 3;
    const c = colors[i % colors.length];
    leafBall(ctx, x - 2, y + 2, 5, 4, PAL.leaf, i);
    px(ctx, x, y, c[3]);
    px(ctx, x - 1, y + 1, c[2]);
    px(ctx, x + 1, y + 1, c[2]);
    px(ctx, x, y + 2, c[2]);
    px(ctx, x, y + 1, PAL.yellow[4]);
  }
}

// ------------------------------------------------------- street furniture ---

function bench(ctx: Ctx) {
  const w = PAL.wood;
  // backrest slats
  for (const y of [1, 4]) {
    rect(ctx, 1, y, 30, 2, w[3]);
    hline(ctx, 1, y, 30, w[4]);
  }
  // seat
  rect(ctx, 1, 8, 30, 4, w[2]);
  hline(ctx, 1, 8, 30, w[3]);
  hline(ctx, 1, 10, 30, w[3]);
  hline(ctx, 1, 11, 30, w[1]);
  // iron frame
  for (const x of [3, 27]) {
    vline(ctx, x, 0, 16, PAL.dark[2]);
    vline(ctx, x + 1, 0, 16, PAL.dark[3]);
    px(ctx, x + 2, 15, PAL.dark[2]);
  }
}

function streetlamp(ctx: Ctx) {
  const p = PAL.teal;
  // base
  rect(ctx, 1, 36, 6, 4, p[1]);
  hline(ctx, 1, 36, 6, p[2]);
  // pole
  rect(ctx, 3, 8, 2, 28, p[1]);
  vline(ctx, 3, 8, 28, p[3]);
  // lamp head
  rect(ctx, 1, 2, 6, 6, '#ffe9a8');
  rect(ctx, 2, 3, 4, 4, '#fff8e0');
  rect(ctx, 0, 0, 8, 2, p[1]);
  hline(ctx, 0, 0, 8, p[3]);
  hline(ctx, 1, 8, 6, p[1]);
}

function lampGlow(ctx: Ctx) {
  const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0, 'rgba(255,214,130,0.55)');
  g.addColorStop(0.35, 'rgba(255,200,110,0.28)');
  g.addColorStop(0.7, 'rgba(255,180,90,0.08)');
  g.addColorStop(1, 'rgba(255,170,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 48, 48);
  void GLOW;
}

function car(ctx: Ctx, body: Ramp) {
  // wheels
  for (const x of [5, 22]) {
    rect(ctx, x, 0, 6, 3, PAL.dark[2]);
    rect(ctx, x, 15, 6, 3, PAL.dark[2]);
  }
  // body
  rrect(ctx, 0, 2, 32, 14, body[2], 2);
  hline(ctx, 2, 2, 28, body[3]);
  hline(ctx, 2, 15, 28, body[0]);
  hline(ctx, 1, 14, 30, body[1]);
  vline(ctx, 0, 4, 10, body[1]);
  // hood lines
  hline(ctx, 24, 5, 6, body[3]);
  hline(ctx, 24, 12, 6, body[1]);
  // cabin
  rrect(ctx, 8, 4, 15, 10, body[1]);
  // windshield (front = right)
  rect(ctx, 20, 5, 3, 8, PAL.glass[2]);
  vline(ctx, 21, 5, 4, PAL.glass[4]);
  // rear window
  rect(ctx, 8, 5, 2, 8, PAL.glass[1]);
  // roof
  rect(ctx, 10, 5, 10, 8, body[2]);
  hline(ctx, 10, 5, 10, body[4]);
  px(ctx, 11, 6, body[4]);
  // mirrors
  px(ctx, 19, 3, body[1]);
  px(ctx, 19, 14, body[0]);
  // lights
  rect(ctx, 31, 4, 1, 2, '#fff2b0');
  rect(ctx, 31, 12, 1, 2, '#fff2b0');
  rect(ctx, 0, 4, 1, 2, PAL.red[3]);
  rect(ctx, 0, 12, 1, 2, PAL.red[3]);
}

function mailbox(ctx: Ctx) {
  // Indian red pillar box
  const r = PAL.red;
  ellipse(ctx, 0, 0, 8, 5, r[3]);
  px(ctx, 2, 1, r[4]);
  rect(ctx, 0, 3, 8, 12, r[2]);
  vline(ctx, 1, 3, 12, r[3]);
  vline(ctx, 6, 3, 12, r[1]);
  vline(ctx, 7, 3, 12, r[0]);
  hline(ctx, 1, 5, 6, PAL.dark[1]); // slot
  rect(ctx, 0, 8, 8, 2, PAL.yellow[3]);
  hline(ctx, 0, 9, 8, PAL.yellow[2]);
  rect(ctx, 0, 15, 8, 1, PAL.stone[2]);
}

function signArrow(ctx: Ctx) {
  const w = PAL.wood;
  rect(ctx, 7, 4, 2, 12, w[2]);
  vline(ctx, 7, 4, 12, w[3]);
  sprite(
    ctx,
    1,
    2,
    ['###########..', '############.', '#############', '############.', '###########..'],
    { '#': PAL.green[2] },
  );
  hline(ctx, 1, 2, 11, PAL.green[3]);
  hline(ctx, 1, 6, 11, PAL.green[1]);
  hline(ctx, 3, 4, 7, '#ffffff');
  px(ctx, 9, 3, '#ffffff');
  px(ctx, 9, 5, '#ffffff');
}

function manhole(ctx: Ctx) {
  const m = PAL.metal;
  ellipse(ctx, 1, 1, 14, 14, m[0]);
  ellipse(ctx, 2, 2, 12, 12, m[1]);
  for (let y = 3; y < 13; y++)
    for (let x = 3; x < 13; x++) if ((x + y) % 3 === 0 && ((x - 8) ** 2 + (y - 8) ** 2) < 26) px(ctx, x, y, m[2]);
  ellipse(ctx, 6, 6, 4, 4, m[1]);
  px(ctx, 4, 4, m[3]);
  px(ctx, 5, 3, m[3]);
}

export const TOWN_PROPS: Record<string, PropDef> = {
  'house-player': { w: 80, h: 80, draw: housePlayer },
  'house-a': { w: 64, h: 72, draw: (ctx) => houseFlat(ctx, '#a6d4c4', '#a8462f', PAL.yellow) },
  'house-b': { w: 64, h: 72, draw: (ctx) => houseTiled(ctx, '#f2b8b0', PAL.slate, '#6b4f8c', PAL.blue) },
  'store-front': { w: 112, h: 80, draw: storeFront },
  kiosk: { w: 64, h: 48, draw: kiosk },
  'clinic-front': { w: 96, h: 80, draw: clinicFront },
  school: { w: 112, h: 80, draw: school },
  'bus-stop': { w: 48, h: 32, draw: busStop },
  tree: { w: 32, h: 40, draw: tree },
  'tree-small': { w: 24, h: 32, draw: treeSmall },
  bush: { w: 16, h: 16, draw: bush },
  bench: { w: 32, h: 16, draw: bench },
  streetlamp: { w: 8, h: 40, draw: streetlamp },
  'lamp-glow': { w: 48, h: 48, draw: lampGlow },
  'car-red': { w: 32, h: 18, draw: (ctx) => car(ctx, PAL.red) },
  'car-blue': { w: 32, h: 18, draw: (ctx) => car(ctx, PAL.blue) },
  'flower-bed': { w: 32, h: 16, draw: flowerBed },
  mailbox: { w: 8, h: 16, draw: mailbox },
  'sign-arrow': { w: 16, h: 16, draw: signArrow },
  manhole: { w: 16, h: 16, draw: manhole },
};
