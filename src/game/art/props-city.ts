// Transport + downtown props: buses, ticket machine, library, post office,
// plaza furniture, and their interior counters / signs.

import { PAL, type Ramp } from './palette';
import { type Ctx, px, rect, hline, vline, ellipse, sprite, mix, hash2, ramp, rrect } from './draw';
import { plaster, flatRoof, glass, groundShadow, books, grain, leafBall, pottedPlant } from './kit';
import { drawPixelText, measurePixelText } from './pixelFont';
import { drawFittedText, signText } from './signs';
import type { PropDef } from './props';

const WH = PAL.white;
const M = PAL.metal;
const D = PAL.dark;

function centred(ctx: Ctx, text: string, x: number, w: number, y: number, c: string, scale = 1) {
  drawPixelText(ctx, text, x + Math.floor((w - measurePixelText(text, scale)) / 2), y, c, scale);
}

// ------------------------------------------------------------- transport ---

/** City bus, 3/4 view facing right: roof on top, near (door) side below. */
function bus(ctx: Ctx, b: Ramp, stripe: Ramp, route: string) {
  groundShadow(ctx, 3, 33, 76, 7);
  // wheels (drawn first, body overlaps their tops)
  const wheel = (x: number) => {
    ellipse(ctx, x - 1, 27, 13, 12, D[0]);
    ellipse(ctx, x, 29, 11, 10, D[2]);
    ellipse(ctx, x + 1, 30, 7, 6, D[3]);
    ellipse(ctx, x + 3, 32, 5, 4, M[3]);
    px(ctx, x + 4, 32, M[4]);
    px(ctx, x + 5, 34, M[1]);
  };
  // roof
  rrect(ctx, 1, 1, 77, 10, b[3], 2);
  hline(ctx, 3, 1, 72, b[4]);
  vline(ctx, 1, 3, 7, b[4]);
  for (const x of [18, 52]) vline(ctx, x, 2, 8, b[2]);
  // roof AC unit + hatch
  rect(ctx, 24, 3, 22, 6, WH[3]);
  hline(ctx, 24, 3, 22, WH[4]);
  hline(ctx, 24, 8, 22, WH[1]);
  vline(ctx, 45, 3, 6, WH[1]);
  for (let x = 26; x < 44; x += 3) {
    px(ctx, x, 5, M[1]);
    px(ctx, x, 6, M[2]);
  }
  rect(ctx, 6, 4, 7, 4, b[2]);
  hline(ctx, 6, 4, 7, b[4]);
  hline(ctx, 6, 7, 7, b[1]);
  // front roof cap (rounded towards the windshield)
  rect(ctx, 70, 2, 7, 8, b[2]);
  hline(ctx, 70, 2, 6, b[3]);
  // side body
  rect(ctx, 1, 11, 78, 22, b[2]);
  hline(ctx, 1, 11, 78, b[4]);
  hline(ctx, 1, 12, 78, b[3]);
  vline(ctx, 1, 11, 22, b[3]);
  // window strip (rear section + middle section)
  const windows = (x0: number, x1: number) => {
    rect(ctx, x0, 14, x1 - x0, 9, D[2]);
    for (let x = x0 + 1; x + 7 <= x1; x += 8) glass(ctx, x, 15, 7, 7);
    hline(ctx, x0, 22, x1 - x0, D[1]);
  };
  windows(3, 31);
  windows(41, 61);
  // livery stripe + skirt
  rect(ctx, 1, 24, 78, 3, stripe[3]);
  hline(ctx, 1, 24, 78, stripe[4]);
  hline(ctx, 1, 26, 78, stripe[2]);
  rect(ctx, 1, 27, 78, 6, b[1]);
  hline(ctx, 1, 32, 78, b[0]);
  for (let x = 4; x < 70; x += 12) px(ctx, x, 29, b[2]);
  // doors (glass double leaf)
  const busDoor = (x: number, top: number) => {
    rect(ctx, x - 1, top - 1, 10, 34 - top, D[1]);
    glass(ctx, x, top, 4, 32 - top);
    glass(ctx, x + 4, top, 4, 32 - top);
    vline(ctx, x + 4, top, 32 - top, M[3]);
    hline(ctx, x, top + Math.floor((32 - top) / 2), 8, M[2]);
    hline(ctx, x - 1, 33, 10, M[2]);
  };
  busDoor(32, 14);
  busDoor(62, 20);
  // route sign over the front door
  rect(ctx, 61, 12, 10, 7, D[0]);
  hline(ctx, 61, 18, 10, D[2]);
  centred(ctx, route, 61, 10, 13, '#ffb648');
  // windshield wrapping round the nose
  rect(ctx, 72, 11, 7, 15, D[1]);
  glass(ctx, 73, 12, 5, 12);
  px(ctx, 74, 13, '#ffffff');
  // nose: headlight, indicator, bumper
  rect(ctx, 76, 27, 3, 2, '#fff2b0');
  px(ctx, 75, 27, PAL.orange[3]);
  rect(ctx, 70, 31, 9, 2, M[2]);
  hline(ctx, 70, 31, 9, M[4]);
  // tail light + mirror
  rect(ctx, 1, 25, 2, 3, PAL.red[3]);
  rect(ctx, 78, 14, 1, 4, D[2]);
  wheel(9);
  wheel(48);
}

function ticketMachine(ctx: Ctx) {
  const t = PAL.teal;
  groundShadow(ctx, 2, 20, 12, 4);
  // post + base
  rect(ctx, 6, 16, 4, 6, M[2]);
  vline(ctx, 6, 16, 6, M[3]);
  rect(ctx, 4, 21, 8, 2, M[1]);
  hline(ctx, 4, 21, 8, M[3]);
  // cabinet
  rect(ctx, 2, 0, 12, 17, t[2]);
  rect(ctx, 2, 0, 12, 2, t[3]);
  hline(ctx, 2, 0, 12, t[4]);
  vline(ctx, 2, 1, 15, t[3]);
  vline(ctx, 13, 1, 16, t[1]);
  hline(ctx, 2, 16, 12, t[0]);
  // yellow header
  rect(ctx, 3, 2, 10, 2, PAL.yellow[3]);
  hline(ctx, 3, 3, 10, PAL.yellow[2]);
  // screen
  rect(ctx, 4, 5, 8, 5, D[1]);
  rect(ctx, 5, 6, 6, 3, '#6fd4a0');
  hline(ctx, 5, 6, 4, '#c8ffe0');
  px(ctx, 9, 8, '#2a7a50');
  // buttons
  px(ctx, 4, 11, PAL.green[3]);
  px(ctx, 6, 11, PAL.yellow[3]);
  px(ctx, 8, 11, PAL.red[3]);
  // coin slot
  rect(ctx, 10, 11, 2, 3, M[3]);
  vline(ctx, 11, 11, 3, D[0]);
  // ticket mouth + ticket
  hline(ctx, 4, 14, 5, D[0]);
  rect(ctx, 5, 13, 3, 2, '#fbf8f0');
  px(ctx, 6, 13, PAL.orange[3]);
}

// ---------------------------------------------------------------- city ---

function stepsBlock(ctx: Ctx, cx: number, y: number, w0: number, n: number) {
  const s = PAL.stone;
  for (let i = 0; i < n; i++) {
    const w = w0 + i * 4;
    const x = cx - Math.floor(w / 2);
    rect(ctx, x, y + i * 2, w, 2, s[3]);
    hline(ctx, x, y + i * 2, w, s[4]);
    px(ctx, x, y + i * 2 + 1, s[2]);
    px(ctx, x + w - 1, y + i * 2 + 1, s[1]);
  }
}

function libraryFront(ctx: Ctx) {
  const st = ramp('#e2d6be');
  const roof = PAL.slate;
  // roof strip behind the pediment
  rect(ctx, 4, 6, 104, 8, roof[2]);
  hline(ctx, 4, 6, 104, roof[3]);
  // pediment (triangle)
  for (let j = 0; j < 16; j++) {
    const half = Math.round(8 + (j / 15) * 46);
    const x0 = 56 - half;
    const w = half * 2;
    rect(ctx, x0, j, w, 1, st[3]);
    px(ctx, x0, j, st[4]);
    px(ctx, x0 + 1, j, st[4]);
    px(ctx, x0 + w - 1, j, st[1]);
    px(ctx, x0 + w - 2, j, st[1]);
    // tympanum (inner, shaded)
    const ih = half - 6;
    if (j > 3 && j < 14 && ih > 0) rect(ctx, 56 - ih, j, ih * 2, 1, st[2]);
  }
  // emblem: open book in a roundel
  ellipse(ctx, 49, 4, 14, 10, st[4]);
  ellipse(ctx, 50, 5, 12, 8, PAL.slate[2]);
  sprite(ctx, 51, 7, ['.###.###.', '#...#...#', '#...#...#', '.###.###.'], { '#': PAL.yellow[4] });
  rect(ctx, 52, 7, 3, 3, '#fffcf5');
  rect(ctx, 56, 7, 3, 3, '#fffcf5');
  // cornice
  rect(ctx, 0, 16, 112, 3, st[4]);
  hline(ctx, 0, 18, 112, st[1]);
  for (let x = 2; x < 112; x += 4) px(ctx, x, 17, st[2]);
  // frieze with the name
  rect(ctx, 4, 19, 104, 12, st[3]);
  hline(ctx, 4, 19, 104, st[4]);
  hline(ctx, 4, 30, 104, st[1]);
  drawFittedText(ctx, signText('library'), 8, 20, 96, 10, PAL.slate[1], st[4], 2);
  // architrave
  rect(ctx, 2, 31, 108, 2, st[4]);
  hline(ctx, 2, 32, 108, st[0]);
  // shaded back wall
  rect(ctx, 6, 33, 100, 40, st[1]);
  for (let j = 33; j < 73; j++) for (let i = 6; i < 106; i++) if (hash2(i, j, 51) < 0.05) px(ctx, i, j, st[0]);
  hline(ctx, 6, 33, 100, mix(st[0], PAL.slate[0], 0.5));
  hline(ctx, 6, 34, 100, st[0]);
  // tall arched windows between columns
  for (const wx of [18, 34, 72, 88]) {
    rect(ctx, wx, 40, 8, 22, st[3]);
    ellipse(ctx, wx, 37, 8, 7, st[3]);
    glass(ctx, wx + 1, 41, 6, 20, PAL.glass, true);
    ellipse(ctx, wx + 1, 38, 6, 6, '#ffe9a8');
    vline(ctx, wx + 4, 39, 22, st[3]);
    hline(ctx, wx + 1, 50, 6, st[3]);
    rect(ctx, wx - 1, 61, 10, 2, st[4]);
    hline(ctx, wx - 1, 62, 10, st[1]);
  }
  // door with fanlight
  rect(ctx, 47, 42, 18, 31, st[4]);
  ellipse(ctx, 47, 37, 18, 11, st[4]);
  ellipse(ctx, 49, 39, 14, 8, '#ffe9a8');
  for (const dx of [-4, 0, 4]) px(ctx, 56 + dx, 41, st[3]);
  const dw = PAL.wood;
  rect(ctx, 49, 45, 14, 28, dw[2]);
  vline(ctx, 49, 45, 28, dw[3]);
  vline(ctx, 56, 45, 28, dw[0]);
  vline(ctx, 62, 45, 28, dw[1]);
  for (const py of [48, 60]) {
    rect(ctx, 51, py, 4, 9, dw[1]);
    rect(ctx, 58, py, 3, 9, dw[1]);
    px(ctx, 51, py, dw[3]);
    px(ctx, 58, py, dw[3]);
  }
  px(ctx, 55, 58, PAL.yellow[3]);
  px(ctx, 57, 58, PAL.yellow[3]);
  // columns
  for (const cx of [9, 26, 41, 66, 81, 98]) {
    rect(ctx, cx - 1, 33, 8, 2, st[4]); // capital
    hline(ctx, cx - 1, 34, 8, st[2]);
    rect(ctx, cx, 35, 6, 36, st[3]);
    vline(ctx, cx, 35, 36, st[4]);
    vline(ctx, cx + 2, 35, 36, st[2]);
    vline(ctx, cx + 4, 35, 36, st[2]);
    vline(ctx, cx + 5, 35, 36, st[1]);
    rect(ctx, cx - 1, 71, 8, 2, st[4]); // base
    hline(ctx, cx - 1, 72, 8, st[1]);
  }
  // podium + steps
  rect(ctx, 2, 73, 108, 2, PAL.stone[2]);
  hline(ctx, 2, 73, 108, PAL.stone[3]);
  stepsBlock(ctx, 56, 74, 28, 3);
  // flanking shrubs + lamps
  for (const x of [1, 103]) leafBall(ctx, x, 68, 8, 7, PAL.leaf, x);
}

function postOfficeFront(ctx: Ctx) {
  const wall = ramp('#efe2c8');
  const r = PAL.red;
  const y = PAL.yellow;
  plaster(ctx, 0, 12, 96, 68, wall, 61);
  flatRoof(ctx, 0, 0, 96, 14);
  // roof antenna + flag
  vline(ctx, 84, 0, 10, M[3]);
  rect(ctx, 85, 1, 6, 4, r[2]);
  hline(ctx, 85, 1, 6, r[3]);
  // red sign band with yellow trim
  rect(ctx, 0, 14, 96, 18, r[2]);
  hline(ctx, 0, 14, 96, y[3]);
  hline(ctx, 0, 15, 96, r[3]);
  hline(ctx, 0, 30, 96, r[1]);
  hline(ctx, 0, 31, 96, y[2]);
  // envelope logo
  rect(ctx, 4, 18, 11, 8, '#fffcf5');
  hline(ctx, 4, 25, 11, PAL.paper[1]);
  sprite(ctx, 4, 18, ['#.........#', '.#.......#.', '..#.....#..', '...#...#...', '....###....'], {
    '#': r[1],
  });
  rect(ctx, 12, 19, 2, 2, y[3]);
  drawFittedText(ctx, signText('post'), 17, 17, 77, 12, y[3], r[0], 2);
  // canopy over the door
  rect(ctx, 32, 38, 32, 4, r[2]);
  hline(ctx, 32, 38, 32, r[3]);
  hline(ctx, 32, 41, 32, y[2]);
  for (let x = 33; x < 64; x += 2) px(ctx, x, 42, 'rgba(27,19,37,0.3)');
  // windows with yellow frames
  for (const wx of [6, 68]) {
    rect(ctx, wx - 1, 40, 24, 22, y[2]);
    hline(ctx, wx - 1, 40, 24, y[3]);
    glass(ctx, wx + 1, 42, 20, 18);
    vline(ctx, wx + 11, 42, 18, y[1]);
    hline(ctx, wx + 1, 50, 20, y[1]);
    rect(ctx, wx - 2, 61, 26, 2, wall[3]);
    hline(ctx, wx - 2, 62, 26, wall[0]);
  }
  // "stamps" poster in the left window
  rect(ctx, 9, 52, 6, 7, y[3]);
  rect(ctx, 10, 53, 4, 4, r[2]);
  // double glass door, red frame
  rect(ctx, 35, 44, 26, 34, r[1]);
  hline(ctx, 35, 44, 26, r[2]);
  glass(ctx, 37, 46, 10, 32);
  glass(ctx, 49, 46, 10, 32);
  vline(ctx, 48, 46, 32, r[0]);
  rect(ctx, 39, 60, 6, 1, y[3]);
  rect(ctx, 51, 60, 6, 1, y[3]);
  // pillar post box by the door
  const pb = (x: number, yy: number) => {
    ellipse(ctx, x, yy, 8, 5, r[3]);
    px(ctx, x + 2, yy + 1, r[4]);
    rect(ctx, x, yy + 3, 8, 13, r[2]);
    vline(ctx, x + 1, yy + 3, 13, r[3]);
    vline(ctx, x + 6, yy + 3, 13, r[1]);
    hline(ctx, x + 1, yy + 5, 6, D[1]);
    rect(ctx, x, yy + 8, 8, 2, y[3]);
    rect(ctx, x - 1, yy + 15, 10, 1, PAL.stone[2]);
  };
  pb(63, 63);
  // plinth + step
  rect(ctx, 0, 77, 96, 3, PAL.stone[2]);
  hline(ctx, 0, 77, 96, PAL.stone[3]);
  rect(ctx, 33, 78, 30, 2, PAL.stone[3]);
  hline(ctx, 33, 78, 30, PAL.stone[4]);
  pottedPlant(ctx, 26, 69, PAL.red[3]);
}

function fountain(ctx: Ctx) {
  const s = PAL.stone;
  const w = PAL.water;
  groundShadow(ctx, 0, 24, 32, 8);
  // basin wall (front) then rim then water
  ellipse(ctx, 0, 15, 32, 16, s[1]);
  rect(ctx, 0, 21, 32, 3, s[1]);
  ellipse(ctx, 0, 13, 32, 14, s[3]);
  ellipse(ctx, 1, 13, 22, 6, s[4]);
  ellipse(ctx, 3, 15, 26, 10, w[2]);
  ellipse(ctx, 4, 15, 20, 5, w[3]);
  for (const [x, yy] of [
    [8, 17],
    [20, 20],
    [12, 21],
    [24, 17],
  ])
    hline(ctx, x, yy, 3, w[4]);
  // front face stones
  for (let x = 3; x < 30; x += 5) vline(ctx, x, 24, 3, s[0]);
  hline(ctx, 2, 27, 28, s[0]);
  // pillar + upper bowl
  rect(ctx, 14, 7, 4, 13, s[3]);
  vline(ctx, 14, 7, 13, s[4]);
  vline(ctx, 17, 7, 13, s[1]);
  ellipse(ctx, 8, 6, 16, 6, s[2]);
  ellipse(ctx, 8, 5, 16, 5, s[3]);
  ellipse(ctx, 10, 6, 12, 3, w[3]);
  // jet + falling streams
  rect(ctx, 15, 0, 2, 6, w[4]);
  px(ctx, 15, 0, '#ffffff');
  for (const x of [8, 23]) {
    vline(ctx, x, 9, 8, w[4]);
    px(ctx, x, 17, '#ffffff');
  }
  px(ctx, 11, 18, '#ffffff');
  px(ctx, 21, 18, '#ffffff');
}

function cityBench(ctx: Ctx) {
  const f = PAL.green;
  const w = PAL.oak;
  // backrest slats
  for (const yy of [0, 3]) {
    rect(ctx, 2, yy, 28, 2, w[3]);
    hline(ctx, 2, yy, 28, w[4]);
    hline(ctx, 2, yy + 1, 28, w[2]);
  }
  // seat slats
  rect(ctx, 1, 7, 30, 5, w[2]);
  hline(ctx, 1, 7, 30, w[4]);
  hline(ctx, 1, 9, 30, w[3]);
  hline(ctx, 1, 11, 30, w[1]);
  grain(ctx, 1, 7, 30, 5, w[1], 33, 0.05);
  // cast-iron ends with armrests
  for (const x of [1, 28]) {
    rect(ctx, x, 0, 3, 16, f[1]);
    vline(ctx, x, 0, 16, f[2]);
    rect(ctx, x - 1, 5, 5, 2, f[2]);
    hline(ctx, x - 1, 5, 5, f[3]);
    px(ctx, x + 3, 15, f[0]);
    px(ctx, x - 1, 15, f[1]);
  }
  rect(ctx, 14, 12, 4, 4, f[1]);
}

function busShelterCity(ctx: Ctx) {
  const b = PAL.green;
  // back glass wall
  rect(ctx, 3, 15, 42, 10, M[2]);
  glass(ctx, 4, 16, 40, 8);
  // route map poster
  rect(ctx, 32, 16, 10, 8, '#fbf8f0');
  hline(ctx, 33, 19, 8, b[2]);
  hline(ctx, 33, 21, 6, PAL.blue[2]);
  px(ctx, 35, 19, PAL.red[2]);
  px(ctx, 39, 21, PAL.red[2]);
  // posts
  rect(ctx, 1, 14, 2, 18, M[1]);
  vline(ctx, 1, 14, 18, M[3]);
  rect(ctx, 45, 14, 2, 18, M[0]);
  // bench
  rect(ctx, 6, 24, 36, 3, PAL.oak[3]);
  hline(ctx, 6, 24, 36, PAL.oak[4]);
  hline(ctx, 6, 26, 36, PAL.oak[1]);
  for (const x of [8, 39]) rect(ctx, x, 27, 2, 4, M[1]);
  // roof with a two-line route sign
  rect(ctx, 0, 0, 48, 15, b[2]);
  hline(ctx, 0, 0, 48, b[4]);
  hline(ctx, 0, 1, 48, b[3]);
  hline(ctx, 0, 14, 48, b[0]);
  rect(ctx, 3, 1, 42, 13, '#fbf8f0');
  hline(ctx, 3, 13, 42, PAL.paper[1]);
  // bus pictogram
  rect(ctx, 5, 4, 7, 6, b[2]);
  rect(ctx, 6, 5, 5, 2, '#fbf8f0');
  px(ctx, 6, 10, D[2]);
  px(ctx, 10, 10, D[2]);
  drawFittedText(ctx, 'BUS 12 → HOME', 13, 1, 31, 13, b[0], undefined, 1);
}

// ------------------------------------------------------------ interiors ---

function counterShell(ctx: Ctx, front: Ramp, top: Ramp, topY = 8) {
  rect(ctx, 0, topY + 5, 48, 24 - topY - 5, front[2]);
  hline(ctx, 0, topY + 5, 48, front[0]);
  hline(ctx, 0, 23, 48, front[0]);
  vline(ctx, 47, topY + 5, 24 - topY - 5, front[1]);
  rect(ctx, 0, topY, 48, 5, top[3]);
  hline(ctx, 0, topY, 48, top[4]);
  hline(ctx, 0, topY + 4, 48, top[1]);
}

function bookStack(ctx: Ctx, x: number, baseY: number, seed: number, n: number) {
  const cols = [PAL.red, PAL.blue, PAL.green, PAL.yellow, PAL.purple, PAL.teal];
  let yy = baseY;
  for (let i = 0; i < n; i++) {
    const c = cols[Math.floor(hash2(i, seed, 2) * cols.length)];
    const w = 7 + Math.floor(hash2(i, seed, 3) * 3);
    const off = Math.floor(hash2(i, seed, 4) * 2);
    yy -= 2;
    rect(ctx, x + off, yy, w, 2, c[2]);
    hline(ctx, x + off, yy, w, c[3]);
    px(ctx, x + off + w - 1, yy + 1, PAL.paper[3]);
    px(ctx, x + off + w - 2, yy + 1, PAL.paper[3]);
  }
}

function libraryDesk(ctx: Ctx) {
  const w = PAL.oak;
  counterShell(ctx, PAL.wood, w);
  for (let x = 4; x < 46; x += 8) {
    rect(ctx, x, 15, 6, 6, PAL.wood[1]);
    px(ctx, x, 15, PAL.wood[3]);
  }
  grain(ctx, 1, 9, 46, 3, w[2], 21);
  // book stacks, bell, card box, lamp
  bookStack(ctx, 2, 11, 1, 4);
  bookStack(ctx, 34, 11, 2, 3);
  ellipse(ctx, 23, 6, 6, 5, PAL.yellow[3]);
  px(ctx, 24, 7, PAL.yellow[4]);
  px(ctx, 25, 5, PAL.yellow[2]);
  hline(ctx, 22, 10, 8, M[2]);
  rect(ctx, 14, 7, 6, 4, PAL.cork[2]);
  hline(ctx, 14, 7, 6, PAL.cork[3]);
  rect(ctx, 15, 6, 4, 1, '#fbf8f0');
  // green banker's lamp
  rect(ctx, 44, 3, 1, 7, M[3]);
  rect(ctx, 41, 1, 6, 3, PAL.green[2]);
  hline(ctx, 41, 1, 6, PAL.green[3]);
  hline(ctx, 42, 4, 4, '#ffe9a8');
}

function libraryShelf(ctx: Ctx) {
  const w = PAL.wood;
  rect(ctx, 0, 0, 32, 32, w[2]);
  rect(ctx, 0, 0, 32, 2, w[3]);
  hline(ctx, 0, 0, 32, w[4]);
  vline(ctx, 0, 0, 32, w[3]);
  vline(ctx, 31, 0, 32, w[1]);
  vline(ctx, 15, 2, 29, w[1]);
  vline(ctx, 16, 2, 29, w[3]);
  for (let r = 0; r < 4; r++) {
    const yy = 2 + r * 7;
    rect(ctx, 2, yy, 12, 6, w[0]);
    rect(ctx, 18, yy, 12, 6, w[0]);
    books(ctx, 2, yy, 12, 6, 40 + r, 1);
    books(ctx, 18, yy, 12, 6, 60 + r, 1);
    hline(ctx, 1, yy + 6, 30, w[3]);
  }
  // label plates
  rect(ctx, 6, 30, 4, 1, '#fbf8f0');
  rect(ctx, 22, 30, 4, 1, '#fbf8f0');
  hline(ctx, 0, 31, 32, w[0]);
}

function parcel(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const k = PAL.cork;
  rect(ctx, x, y, w, h, k[2]);
  hline(ctx, x, y, w, k[3]);
  vline(ctx, x + w - 1, y, h, k[1]);
  vline(ctx, x + Math.floor(w / 2), y, h, '#e8dcc0');
  hline(ctx, x, y + Math.floor(h / 2), w, '#e8dcc0');
}

function postCounter(ctx: Ctx) {
  const r = PAL.red;
  counterShell(ctx, r, PAL.cream);
  rect(ctx, 0, 16, 48, 2, PAL.yellow[3]);
  hline(ctx, 0, 17, 48, PAL.yellow[2]);
  // envelope badge
  rect(ctx, 21, 18, 7, 5, '#fffcf5');
  sprite(ctx, 21, 18, ['#.....#', '.#...#.', '..###..'], { '#': r[1] });
  // scale with dial
  rect(ctx, 4, 8, 12, 3, M[3]);
  hline(ctx, 4, 8, 12, M[4]);
  rect(ctx, 6, 3, 8, 5, M[2]);
  rect(ctx, 7, 4, 6, 3, '#fbf8f0');
  px(ctx, 10, 5, r[2]);
  px(ctx, 11, 4, r[2]);
  rect(ctx, 4, 1, 12, 2, M[3]);
  hline(ctx, 4, 1, 12, M[4]);
  // parcels stacked + letters + stamp
  parcel(ctx, 30, 4, 9, 7);
  parcel(ctx, 32, 0, 6, 5);
  parcel(ctx, 40, 6, 7, 5);
  rect(ctx, 19, 9, 6, 3, '#fffcf5');
  px(ctx, 23, 9, r[2]);
  rect(ctx, 26, 10, 2, 2, D[2]);
  px(ctx, 26, 9, PAL.wood[3]);
}

function serviceDesk(ctx: Ctx) {
  const g = PAL.green;
  counterShell(ctx, ramp('#5f7f9a'), WH, 9);
  for (let x = 3; x < 46; x += 9) vline(ctx, x, 16, 6, ramp('#5f7f9a')[3]);
  // RETURNS sign on a stand
  vline(ctx, 10, 6, 3, M[2]);
  vline(ctx, 37, 6, 3, M[2]);
  rect(ctx, 7, 0, 34, 7, g[2]);
  hline(ctx, 7, 0, 34, g[3]);
  hline(ctx, 7, 6, 34, g[0]);
  centred(ctx, 'RETURNS', 7, 34, 1, '#ffffff');
  // card terminal, returned box, receipt
  rect(ctx, 41, 8, 5, 4, D[2]);
  rect(ctx, 42, 8, 3, 1, '#6fd4a0');
  parcel(ctx, 2, 6, 7, 5);
  rect(ctx, 22, 10, 5, 3, '#fbf8f0');
  hline(ctx, 23, 11, 3, M[3]);
  // bell
  ellipse(ctx, 30, 9, 4, 3, PAL.yellow[3]);
  hline(ctx, 29, 12, 6, M[2]);
}

function hangSign(ctx: Ctx, text: string, bg: Ramp) {
  // string from a nail
  px(ctx, 15, 0, M[3]);
  px(ctx, 16, 0, M[3]);
  for (let i = 1; i < 5; i++) {
    px(ctx, 15 - i * 2, i, PAL.wicker[3]);
    px(ctx, 14 - i * 2, i, PAL.wicker[3]);
    px(ctx, 16 + i * 2, i, PAL.wicker[3]);
    px(ctx, 17 + i * 2, i, PAL.wicker[3]);
  }
  rect(ctx, 3, 5, 26, 11, bg[2]);
  hline(ctx, 3, 5, 26, bg[3]);
  hline(ctx, 4, 6, 24, bg[4]);
  hline(ctx, 3, 15, 26, bg[0]);
  vline(ctx, 28, 5, 11, bg[1]);
  centred(ctx, text, 5, 23, 8, bg[0]);
  centred(ctx, text, 4, 23, 8, '#ffffff');
}

// --------------------------------------------------------------- export ---

export const CITY_PROPS: Record<string, PropDef> = {
  bus: { w: 80, h: 40, draw: (ctx) => bus(ctx, PAL.blue, PAL.white, '12') },
  'bus-7': { w: 80, h: 40, draw: (ctx) => bus(ctx, PAL.orange, PAL.yellow, '7') },
  'ticket-machine': { w: 16, h: 24, draw: ticketMachine },
  'library-front': { w: 112, h: 80, draw: libraryFront },
  'post-office-front': { w: 96, h: 80, draw: postOfficeFront },
  fountain: { w: 32, h: 32, draw: fountain },
  'city-bench': { w: 32, h: 16, draw: cityBench },
  'bus-shelter-city': { w: 48, h: 32, draw: busShelterCity },
  'library-desk': { w: 48, h: 24, draw: libraryDesk },
  'library-shelf': { w: 32, h: 32, draw: libraryShelf },
  'post-counter': { w: 48, h: 24, draw: postCounter },
  'service-desk': { w: 48, h: 24, draw: serviceDesk },
  'closed-sign': { w: 32, h: 16, draw: (ctx) => hangSign(ctx, 'CLOSED', PAL.red) },
  'open-sign': { w: 32, h: 16, draw: (ctx) => hangSign(ctx, 'OPEN', PAL.green) },
};
