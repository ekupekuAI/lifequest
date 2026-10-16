// 16x16 inventory / world item icons.

import { PAL, OUTLINE } from './palette';
import { type Ctx, makeCanvas, px, rect, hline, vline, ellipse, line, sprite, mix, outlineOuter } from './draw';
import { drawPixelText } from './pixelFont';
import { drawCoin } from './fx';

type Draw = (ctx: Ctx) => void;

const W = PAL.white;
const R = PAL.red;
const B = PAL.blue;
const Y = PAL.yellow;
const G = PAL.green;

function tomatoAt(ctx: Ctx, x: number, y: number, d: number) {
  ellipse(ctx, x, y, d, d - 1, R[1]);
  ellipse(ctx, x, y, d - 1, d - 2, R[2]);
  if (d >= 6) ellipse(ctx, x + 1, y + 1, 3, 2, R[3]);
  px(ctx, x + 1, y + 1, R[4]);
  const cx = x + Math.floor(d / 2);
  px(ctx, cx, y, G[2]);
  px(ctx, cx - 1, y, G[1]);
  px(ctx, cx + 1, y, G[3]);
  if (d >= 6) px(ctx, cx, y - 1, G[1]);
}

function potatoAt(ctx: Ctx, x: number, y: number, w: number, h: number, base = PAL.dirt) {
  ellipse(ctx, x, y, w, h, base[2]);
  ellipse(ctx, x, y, w - 1, h - 1, base[3]);
  px(ctx, x + 1, y + 1, base[4]);
  px(ctx, x + w - 2, y + h - 2, base[1]);
  px(ctx, x + Math.floor(w / 2), y + Math.floor(h / 2), base[1]);
}

const ICONS: Record<string, Draw> = {
  'milk-packet': (ctx) => {
    // Indian milk pouch: pillow-shaped, blue print
    rect(ctx, 4, 2, 8, 12, W[3]);
    rect(ctx, 3, 3, 10, 10, W[3]);
    vline(ctx, 12, 3, 10, W[1]);
    hline(ctx, 4, 13, 8, W[1]);
    vline(ctx, 3, 3, 10, W[4]);
    // crimped top
    for (let x = 4; x < 12; x += 2) px(ctx, x, 2, W[2]);
    rect(ctx, 3, 6, 10, 4, B[2]);
    hline(ctx, 3, 6, 10, B[3]);
    hline(ctx, 3, 9, 10, B[1]);
    // drop logo
    px(ctx, 8, 7, W[4]);
    px(ctx, 7, 8, W[4]);
    px(ctx, 8, 8, W[4]);
    px(ctx, 4, 4, '#ffffff');
    // cut corner
    px(ctx, 12, 2, W[1]);
  },
  'milk-tetra': (ctx) => {
    // gable-top carton
    rect(ctx, 4, 6, 6, 8, W[3]);
    rect(ctx, 10, 6, 3, 8, W[1]);
    // gable
    for (let i = 0; i < 3; i++) hline(ctx, 4 + i, 5 - i, 6 - 2 * i, W[4]);
    for (let i = 0; i < 3; i++) hline(ctx, 10, 5 - i, 3 - i, W[2]);
    rect(ctx, 6, 1, 4, 2, W[2]);
    rect(ctx, 4, 9, 6, 3, B[2]);
    rect(ctx, 10, 9, 3, 3, B[1]);
    hline(ctx, 4, 9, 6, B[3]);
    drawPixelText(ctx, 'M', 5, 6, B[2]);
    px(ctx, 5, 13, W[2]);
  },
  'milk-flavoured': (ctx) => {
    // chocolate shake bottle
    rect(ctx, 6, 1, 4, 2, R[2]);
    hline(ctx, 6, 1, 4, R[3]);
    rect(ctx, 6, 3, 4, 2, W[3]);
    rect(ctx, 5, 5, 6, 9, '#7a4a2c');
    rect(ctx, 4, 6, 8, 8, '#7a4a2c');
    vline(ctx, 5, 6, 7, '#a06a42');
    vline(ctx, 11, 6, 8, '#4e2c1c');
    rect(ctx, 4, 8, 8, 3, PAL.pink[3]);
    hline(ctx, 4, 10, 8, PAL.pink[2]);
    px(ctx, 6, 9, W[4]);
    px(ctx, 9, 9, '#7a4a2c');
    px(ctx, 6, 6, '#c08a5a');
  },
  tomato: (ctx) => {
    ellipse(ctx, 2, 4, 12, 10, R[1]);
    ellipse(ctx, 2, 4, 11, 9, R[2]);
    ellipse(ctx, 4, 5, 5, 3, R[3]);
    px(ctx, 5, 6, '#ffd8c4');
    px(ctx, 4, 7, R[4]);
    sprite(ctx, 5, 2, ['..#..', '#####', '.#.#.'], { '#': G[2] });
    px(ctx, 7, 1, G[1]);
    px(ctx, 7, 2, G[3]);
  },
  'cherry-tomato': (ctx) => {
    // clear punnet
    rect(ctx, 2, 7, 12, 7, 'rgba(210,235,245,0.55)');
    tomatoAt(ctx, 3, 5, 5);
    tomatoAt(ctx, 7, 4, 5);
    tomatoAt(ctx, 9, 7, 5);
    tomatoAt(ctx, 4, 8, 5);
    rect(ctx, 2, 10, 12, 4, 'rgba(200,230,245,0.75)');
    hline(ctx, 2, 10, 12, '#e8f6fb');
    hline(ctx, 2, 13, 12, '#9fbfcc');
    rect(ctx, 5, 11, 6, 2, G[3]);
    px(ctx, 6, 11, W[4]);
  },
  potatoes: (ctx) => {
    // jute sack
    const s = PAL.wicker;
    rect(ctx, 3, 5, 10, 9, s[2]);
    rect(ctx, 2, 7, 12, 6, s[2]);
    vline(ctx, 2, 7, 6, s[3]);
    vline(ctx, 13, 7, 6, s[1]);
    hline(ctx, 3, 13, 10, s[1]);
    for (let y = 6; y < 13; y += 2) for (let x = 3 + (y % 4 === 0 ? 1 : 0); x < 13; x += 2) px(ctx, x, y, s[3]);
    // tied neck
    rect(ctx, 6, 3, 4, 2, s[2]);
    hline(ctx, 6, 4, 4, R[2]);
    potatoAt(ctx, 4, 1, 4, 3);
    potatoAt(ctx, 8, 1, 4, 3);
    // label
    rect(ctx, 5, 8, 6, 3, W[3]);
    drawPixelText(ctx, '1', 7, 8, OUTLINE);
  },
  'baby-potatoes': (ctx) => {
    // small premium punnet of golden potatoes
    const gold = ['#6e4a1c', '#a8742a', '#d9a85a', '#efcb84', '#fbe6b4'] as const;
    potatoAt(ctx, 3, 5, 4, 4, gold);
    potatoAt(ctx, 7, 4, 4, 4, gold);
    potatoAt(ctx, 9, 6, 4, 4, gold);
    potatoAt(ctx, 5, 7, 4, 4, gold);
    rect(ctx, 2, 9, 12, 5, PAL.purple[2]);
    hline(ctx, 2, 9, 12, PAL.purple[3]);
    hline(ctx, 2, 13, 12, PAL.purple[1]);
    // gold star label
    sprite(ctx, 6, 10, ['.#.', '###', '#.#'], { '#': Y[3] });
    px(ctx, 11, 11, Y[4]);
  },
  chocolate: (ctx) => {
    // bar with torn foil
    rect(ctx, 3, 2, 10, 12, PAL.purple[2]);
    vline(ctx, 3, 2, 12, PAL.purple[3]);
    vline(ctx, 12, 2, 12, PAL.purple[1]);
    rect(ctx, 3, 2, 10, 4, '#d8d8e0');
    hline(ctx, 3, 5, 10, '#9a9aa8');
    // chocolate squares
    rect(ctx, 4, 2, 8, 3, '#6a3a24');
    px(ctx, 7, 2, '#4a2418');
    px(ctx, 7, 3, '#4a2418');
    px(ctx, 4, 2, '#8a5434');
    px(ctx, 8, 2, '#8a5434');
    drawPixelText(ctx, 'C', 6, 8, Y[3]);
    hline(ctx, 4, 12, 8, PAL.purple[3]);
  },
  chips: (ctx) => {
    // puffy packet
    rect(ctx, 3, 2, 10, 12, R[2]);
    rect(ctx, 2, 3, 12, 10, R[2]);
    vline(ctx, 2, 3, 10, R[3]);
    vline(ctx, 13, 3, 10, R[1]);
    for (let x = 3; x < 13; x += 2) {
      px(ctx, x, 2, R[1]);
      px(ctx, x, 13, R[1]);
    }
    ellipse(ctx, 4, 5, 8, 6, Y[3]);
    ellipse(ctx, 5, 6, 6, 4, Y[2]);
    // chip
    px(ctx, 7, 7, Y[4]);
    px(ctx, 8, 7, Y[4]);
    px(ctx, 7, 8, Y[3]);
    px(ctx, 9, 8, PAL.orange[2]);
    px(ctx, 4, 4, R[4]);
  },
  'peanut-choc': (ctx) => {
    // orange wrapper with a big P (for Peanuts!)
    rect(ctx, 3, 2, 10, 12, PAL.orange[2]);
    vline(ctx, 3, 2, 12, PAL.orange[3]);
    vline(ctx, 12, 2, 12, PAL.orange[1]);
    rect(ctx, 4, 2, 8, 3, '#6a3a24');
    px(ctx, 6, 3, '#c98a4a');
    px(ctx, 9, 3, '#c98a4a');
    drawPixelText(ctx, 'P', 6, 8, Y[3]);
    hline(ctx, 4, 12, 8, PAL.orange[3]);
  },
  popcorn: (ctx) => {
    // striped tub with fluffy top
    rect(ctx, 4, 6, 8, 8, W[4]);
    for (let x = 4; x < 12; x += 2) vline(ctx, x, 6, 8, R[2]);
    hline(ctx, 4, 13, 8, R[1]);
    ellipse(ctx, 3, 2, 10, 5, Y[3]);
    px(ctx, 5, 3, W[4]);
    px(ctx, 8, 2, W[4]);
    px(ctx, 10, 4, W[4]);
    px(ctx, 6, 5, Y[2]);
  },
  'juice-box': (ctx) => {
    // carton with a straw
    rect(ctx, 4, 4, 8, 10, Y[3]);
    vline(ctx, 4, 4, 10, Y[2]);
    vline(ctx, 11, 4, 10, PAL.orange[2]);
    rect(ctx, 5, 8, 6, 4, PAL.orange[2]);
    vline(ctx, 9, 1, 4, W[4]);
    px(ctx, 10, 1, W[4]);
    hline(ctx, 4, 13, 8, PAL.orange[3]);
  },
  'cold-drink': (ctx) => {
    // glass cola bottle
    rect(ctx, 7, 1, 2, 2, R[2]);
    rect(ctx, 7, 3, 2, 3, '#3a1c1c');
    rect(ctx, 6, 5, 4, 2, '#3a1c1c');
    rect(ctx, 5, 7, 6, 7, '#3a1c1c');
    vline(ctx, 6, 4, 9, '#7a3a2a');
    rect(ctx, 5, 9, 6, 3, R[2]);
    hline(ctx, 5, 9, 6, R[3]);
    hline(ctx, 6, 10, 4, W[4]);
    vline(ctx, 10, 7, 7, '#22101a');
    px(ctx, 6, 13, '#5a2a22');
  },
  bread: (ctx) => {
    const c = ['#6b3a1c', '#9c5a2a', '#c98a4a', '#e6b06a', '#f6d9a0'];
    rect(ctx, 2, 6, 12, 7, c[2]);
    ellipse(ctx, 2, 3, 12, 7, c[2]);
    ellipse(ctx, 3, 3, 9, 4, c[3]);
    px(ctx, 5, 4, c[4]);
    px(ctx, 6, 4, c[4]);
    hline(ctx, 2, 12, 12, c[1]);
    vline(ctx, 13, 6, 6, c[1]);
    // slice lines
    for (const x of [5, 8, 11]) {
      vline(ctx, x, 5, 7, c[1]);
      vline(ctx, x - 1, 6, 6, c[3]);
    }
  },
  'cloth-bag': (ctx) => {
    const c = PAL.paper;
    // handles
    sprite(ctx, 4, 1, ['.####.', '#....#', '#....#'], { '#': PAL.wicker[2] });
    rect(ctx, 2, 4, 12, 10, '#e8dcc0');
    vline(ctx, 2, 4, 10, '#f6efdc');
    vline(ctx, 13, 4, 10, '#b8a888');
    hline(ctx, 2, 13, 12, '#b8a888');
    hline(ctx, 2, 4, 12, c[1]);
    // leaf print
    sprite(ctx, 5, 6, ['..##.', '.###.', '####.', '.##..', '#....'], { '#': G[2] });
    px(ctx, 7, 7, G[3]);
  },
  umbrella: (ctx) => {
    // canopy
    for (let y = 0; y < 6; y++) {
      const half = Math.round(Math.sqrt(1 - ((5 - y) / 6) ** 2) * 6.5);
      for (let x = 8 - half; x < 8 + half; x++) {
        const seg = Math.floor((x - 1) / 3) % 2 === 0;
        px(ctx, x, 2 + y, seg ? R[2] : W[3]);
      }
    }
    hline(ctx, 2, 7, 12, R[1]);
    px(ctx, 5, 3, R[4]);
    px(ctx, 4, 4, R[3]);
    // scalloped edge
    for (let x = 3; x < 13; x += 3) px(ctx, x, 8, R[1]);
    vline(ctx, 8, 1, 1, PAL.metal[3]);
    // handle
    vline(ctx, 8, 8, 5, PAL.metal[2]);
    sprite(ctx, 6, 13, ['#.#', '.#.'], { '#': PAL.wood[2] });
    px(ctx, 8, 13, PAL.wood[2]);
  },
  'paper-bag': (ctx) => {
    const k = ['#6b4a2a', '#94683c', '#b88a52', '#d4a86a', '#ead0a0'];
    rect(ctx, 3, 4, 10, 10, k[2]);
    vline(ctx, 3, 4, 10, k[3]);
    vline(ctx, 12, 4, 10, k[1]);
    hline(ctx, 3, 13, 10, k[1]);
    // folded top
    rect(ctx, 3, 3, 10, 2, k[3]);
    for (let x = 3; x < 13; x += 2) px(ctx, x, 3, k[4]);
    vline(ctx, 7, 6, 6, k[1]);
    vline(ctx, 8, 6, 6, k[3]);
  },
  'health-card': (ctx) => {
    rect(ctx, 1, 3, 14, 10, '#eef6fb');
    hline(ctx, 1, 3, 14, '#ffffff');
    hline(ctx, 1, 12, 14, '#a9c2d0');
    vline(ctx, 14, 3, 10, '#a9c2d0');
    rect(ctx, 1, 4, 14, 2, B[3]);
    // red cross
    rect(ctx, 3, 7, 3, 1, R[2]);
    rect(ctx, 4, 6, 1, 3, R[2]);
    // photo box
    rect(ctx, 3, 9, 3, 3, PAL.metal[3]);
    px(ctx, 4, 10, PAL.metal[1]);
    hline(ctx, 7, 7, 6, PAL.metal[2]);
    hline(ctx, 7, 9, 5, PAL.metal[3]);
    hline(ctx, 7, 11, 6, PAL.metal[3]);
  },
  shirt: (ctx) => {
    const c = B;
    sprite(
      ctx,
      1,
      2,
      [
        '...##..##...',
        '.####..####.',
        '############',
        '############',
        '##.######.##',
        '...######...',
        '...######...',
        '...######...',
        '...######...',
        '...######...',
        '...######...',
      ],
      { '#': c[3] },
    );
    hline(ctx, 6, 2, 2, c[1]);
    vline(ctx, 9, 7, 6, c[2]);
    hline(ctx, 4, 12, 6, c[2]);
    vline(ctx, 2, 4, 3, c[4]);
    // stains
    px(ctx, 6, 7, '#8a6a3a');
    px(ctx, 7, 8, '#8a6a3a');
    px(ctx, 7, 7, '#a88a5a');
    px(ctx, 9, 10, '#8a6a3a');
  },
  socks: (ctx) => {
    const s = ['#8a8496', '#b4aebb', '#e6e2e6'];
    sprite(ctx, 2, 3, ['###.', '###.', '###.', '###.', '####', '#####', '.####'], { '#': s[2] });
    hline(ctx, 2, 3, 3, R[2]);
    vline(ctx, 4, 4, 5, s[1]);
    sprite(ctx, 8, 5, ['###.', '###.', '###.', '###.', '####', '#####', '.####'], { '#': s[1] });
    hline(ctx, 8, 5, 3, B[2]);
    px(ctx, 12, 10, s[0]);
    // stink lines
    sprite(ctx, 7, 0, ['.#..#', '#..#.', '.#..#'], { '#': G[3] });
    px(ctx, 3, 10, '#9a8a6a');
  },
  book: (ctx) => {
    rect(ctx, 3, 2, 10, 12, B[2]);
    vline(ctx, 3, 2, 12, B[1]);
    vline(ctx, 4, 2, 12, B[3]);
    rect(ctx, 11, 3, 2, 11, PAL.paper[3]);
    vline(ctx, 12, 3, 11, PAL.paper[1]);
    hline(ctx, 4, 13, 9, PAL.paper[2]);
    rect(ctx, 6, 5, 4, 3, PAL.paper[3]);
    hline(ctx, 6, 9, 4, B[4]);
    hline(ctx, 6, 11, 3, B[3]);
    px(ctx, 5, 3, B[4]);
  },
  wrapper: (ctx) => {
    // crumpled shiny wrapper
    sprite(
      ctx,
      2,
      4,
      ['..####.##...', '.#########..', '############', '.###########', '..#########.', '...######...'],
      { '#': PAL.pink[2] },
    );
    for (const [x, y] of [
      [4, 5],
      [7, 6],
      [10, 5],
      [5, 8],
      [9, 8],
    ])
      px(ctx, x, y, PAL.pink[4]);
    for (const [x, y] of [
      [6, 7],
      [8, 5],
      [11, 7],
      [4, 7],
    ])
      px(ctx, x, y, PAL.pink[1]);
    px(ctx, 7, 7, '#e8e8f0');
    px(ctx, 8, 7, '#ffffff');
  },
  paper: (ctx) => {
    ellipse(ctx, 3, 4, 10, 9, PAL.paper[2]);
    ellipse(ctx, 3, 4, 9, 8, PAL.paper[3]);
    line(ctx, 5, 6, 8, 8, PAL.paper[1]);
    line(ctx, 8, 8, 11, 7, PAL.paper[1]);
    line(ctx, 7, 10, 9, 8, PAL.paper[1]);
    px(ctx, 5, 5, '#ffffff');
    px(ctx, 9, 6, '#ffffff');
    px(ctx, 6, 9, B[3]);
    px(ctx, 10, 10, PAL.paper[1]);
  },
  'toy-car': (ctx) => {
    rect(ctx, 2, 8, 12, 4, R[2]);
    rect(ctx, 4, 5, 7, 3, R[2]);
    hline(ctx, 4, 5, 7, R[3]);
    hline(ctx, 2, 8, 2, R[3]);
    rect(ctx, 5, 6, 2, 2, '#bfe6f0');
    rect(ctx, 8, 6, 2, 2, '#bfe6f0');
    hline(ctx, 2, 11, 12, R[1]);
    px(ctx, 13, 9, Y[3]);
    px(ctx, 2, 9, W[3]);
    for (const x of [3, 10]) {
      rect(ctx, x, 11, 3, 3, '#2a2236');
      px(ctx, x + 1, 12, PAL.metal[3]);
    }
  },
  mug: (ctx) => {
    rect(ctx, 3, 4, 8, 10, W[3]);
    vline(ctx, 3, 4, 10, W[4]);
    vline(ctx, 10, 4, 10, W[1]);
    hline(ctx, 3, 13, 8, W[1]);
    rect(ctx, 4, 4, 6, 1, '#5a3424');
    // handle
    sprite(ctx, 11, 6, ['##.', '..#', '..#', '##.'], { '#': W[2] });
    // coffee drip stain + band
    hline(ctx, 3, 8, 8, R[2]);
    px(ctx, 5, 5, '#7a4a2c');
    px(ctx, 5, 6, '#7a4a2c');
    px(ctx, 8, 10, '#a07050');
  },
  'geometry-box': (ctx) => {
    rect(ctx, 1, 4, 14, 9, PAL.metal[3]);
    hline(ctx, 1, 4, 14, PAL.metal[4]);
    hline(ctx, 1, 12, 14, PAL.metal[1]);
    vline(ctx, 14, 4, 9, PAL.metal[1]);
    rect(ctx, 2, 6, 12, 5, B[2]);
    // compass + ruler print
    line(ctx, 4, 10, 6, 6, Y[3]);
    line(ctx, 6, 6, 8, 10, Y[3]);
    hline(ctx, 9, 8, 4, W[3]);
    for (let x = 9; x < 13; x += 2) px(ctx, x, 9, W[3]);
    hline(ctx, 1, 7, 1, PAL.metal[2]);
  },
  crayons: (ctx) => {
    const crayon = (x: number, c: readonly string[]) => {
      rect(ctx, x, 5, 3, 9, c[2]);
      vline(ctx, x, 5, 9, c[3]);
      vline(ctx, x + 2, 5, 9, c[1]);
      hline(ctx, x, 7, 3, c[1]);
      hline(ctx, x, 11, 3, c[1]);
      px(ctx, x + 1, 3, c[2]);
      hline(ctx, x, 4, 3, c[2]);
      px(ctx, x + 1, 2, c[3]);
    };
    crayon(2, R);
    crayon(6, Y);
    crayon(10, B);
  },
  'water-bottle': (ctx) => {
    rect(ctx, 6, 1, 4, 2, B[1]);
    rect(ctx, 5, 3, 6, 11, '#bfe6f0');
    vline(ctx, 10, 3, 11, '#7ab4c8');
    rect(ctx, 5, 6, 6, 8, B[3]);
    hline(ctx, 5, 6, 6, B[4]);
    vline(ctx, 10, 6, 8, B[2]);
    vline(ctx, 6, 4, 9, '#e8f8fc');
    hline(ctx, 5, 9, 6, B[2]);
    hline(ctx, 5, 13, 6, B[2]);
  },
  'empty-bottle': (ctx) => {
    rect(ctx, 6, 1, 4, 2, B[1]);
    rect(ctx, 5, 3, 6, 11, 'rgba(210,236,245,0.6)');
    vline(ctx, 10, 3, 11, '#9cc4d4');
    vline(ctx, 5, 3, 11, '#cfeaf2');
    vline(ctx, 6, 4, 9, '#f2fbfd');
    hline(ctx, 5, 13, 6, '#9cc4d4');
    hline(ctx, 5, 12, 6, 'rgba(120,180,210,0.6)');
  },
  'sports-shoes': (ctx) => {
    sprite(
      ctx,
      1,
      5,
      ['...####.....', '..######....', '..#######...', '.###########.', '#############', '#############'],
      { '#': W[3] },
    );
    line(ctx, 4, 8, 9, 9, B[2]);
    line(ctx, 5, 7, 9, 8, B[3]);
    hline(ctx, 1, 10, 13, B[1]);
    hline(ctx, 1, 11, 13, '#2a2236');
    px(ctx, 5, 6, W[1]);
    px(ctx, 6, 6, W[1]);
    px(ctx, 4, 5, W[4]);
    px(ctx, 12, 9, W[1]);
  },
  comic: (ctx) => {
    rect(ctx, 3, 1, 10, 14, Y[3]);
    vline(ctx, 3, 1, 14, Y[2]);
    vline(ctx, 12, 1, 14, Y[1]);
    rect(ctx, 4, 2, 8, 3, R[2]);
    drawPixelText(ctx, 'POW', 4, 2, '#ffffff');
    // burst
    sprite(ctx, 5, 7, ['#.#.#', '.###.', '#####', '.###.', '#.#.#'], { '#': R[3] });
    px(ctx, 7, 9, '#ffffff');
    hline(ctx, 4, 13, 8, B[2]);
  },
  notebook: (ctx) => {
    rect(ctx, 3, 2, 10, 12, PAL.teal[2]);
    vline(ctx, 12, 2, 12, PAL.teal[1]);
    hline(ctx, 3, 13, 10, PAL.teal[1]);
    rect(ctx, 6, 5, 5, 3, W[3]);
    hline(ctx, 7, 6, 3, PAL.metal[2]);
    for (let y = 3; y < 13; y += 2) {
      px(ctx, 2, y, PAL.metal[3]);
      px(ctx, 3, y, PAL.metal[1]);
    }
    px(ctx, 5, 3, PAL.teal[4]);
  },
  'appointment-slip': (ctx) => {
    rect(ctx, 3, 1, 10, 14, PAL.paper[3]);
    vline(ctx, 12, 1, 14, PAL.paper[1]);
    hline(ctx, 3, 14, 10, PAL.paper[1]);
    rect(ctx, 3, 1, 10, 3, PAL.teal[2]);
    rect(ctx, 5, 2, 1, 1, '#ffffff');
    drawPixelText(ctx, '12', 6, 6, R[2]);
    hline(ctx, 4, 12, 7, PAL.metal[3]);
    hline(ctx, 4, 13, 5, PAL.metal[3]);
    hline(ctx, 4, 11, 7, PAL.metal[3]);
    hline(ctx, 4, 5, 1, PAL.metal[3]);
  },
  coin: (ctx) => drawCoin(ctx),
  receipt: (ctx) => {
    rect(ctx, 4, 1, 8, 13, '#fbf8f0');
    vline(ctx, 11, 1, 13, PAL.paper[1]);
    for (let x = 4; x < 12; x++) if (x % 2 === 0) px(ctx, x, 14, '#fbf8f0');
    hline(ctx, 5, 3, 6, PAL.metal[2]);
    hline(ctx, 5, 5, 4, PAL.metal[3]);
    hline(ctx, 5, 7, 5, PAL.metal[3]);
    hline(ctx, 5, 9, 3, PAL.metal[3]);
    hline(ctx, 5, 11, 6, PAL.metal[1]);
    px(ctx, 10, 5, PAL.metal[2]);
    px(ctx, 10, 7, PAL.metal[2]);
    px(ctx, 10, 9, PAL.metal[2]);
  },
  'house-keys': (ctx) => {
    const m = PAL.metal;
    // ring
    sprite(ctx, 1, 1, ['.####.', '#....#', '#....#', '#....#', '.####.'], { '#': m[3] });
    px(ctx, 2, 1, m[4]);
    // brass house key (diagonal)
    rect(ctx, 5, 5, 4, 4, Y[3]);
    rect(ctx, 6, 6, 2, 2, Y[1]);
    px(ctx, 5, 5, Y[4]);
    for (let i = 0; i < 6; i++) rect(ctx, 8 + i, 8 + i, 2, 1, Y[2]);
    px(ctx, 12, 14, Y[2]);
    px(ctx, 11, 13, Y[1]);
    px(ctx, 13, 11, Y[2]);
    // silver key + tag
    rect(ctx, 1, 7, 3, 3, m[3]);
    vline(ctx, 2, 10, 5, m[4]);
    px(ctx, 3, 13, m[2]);
    px(ctx, 3, 14, m[2]);
    rect(ctx, 6, 0, 4, 3, R[2]);
    px(ctx, 6, 0, R[3]);
  },
  'bus-ticket': (ctx) => {
    rect(ctx, 1, 4, 14, 8, '#f7e7b0');
    hline(ctx, 1, 4, 14, '#fff6d0');
    hline(ctx, 1, 11, 14, '#c9b070');
    // perforated stub
    for (let y = 4; y < 12; y += 2) px(ctx, 11, y, '#c9b070');
    rect(ctx, 12, 5, 2, 6, PAL.orange[3]);
    // bus pictogram + number
    rect(ctx, 3, 6, 6, 3, B[2]);
    hline(ctx, 4, 6, 4, B[4]);
    px(ctx, 4, 9, OUTLINE);
    px(ctx, 7, 9, OUTLINE);
    hline(ctx, 3, 10, 5, PAL.metal[2]);
    // punched hole
    px(ctx, 9, 6, '#a08850');
  },
  'library-book': (ctx) => {
    rect(ctx, 3, 2, 10, 12, G[2]);
    vline(ctx, 3, 2, 12, G[1]);
    vline(ctx, 4, 2, 12, G[3]);
    rect(ctx, 11, 3, 2, 11, PAL.paper[3]);
    vline(ctx, 12, 3, 11, PAL.paper[1]);
    hline(ctx, 4, 13, 9, PAL.paper[2]);
    // gold title + library label at the spine foot
    hline(ctx, 6, 5, 4, Y[3]);
    hline(ctx, 6, 7, 3, Y[3]);
    rect(ctx, 5, 10, 4, 3, W[4]);
    hline(ctx, 6, 11, 2, R[2]);
    px(ctx, 5, 3, G[4]);
  },
  letter: (ctx) => {
    rect(ctx, 1, 4, 14, 9, W[4]);
    hline(ctx, 1, 12, 14, W[1]);
    vline(ctx, 14, 4, 9, W[2]);
    sprite(ctx, 1, 4, ['#............#', '.##........##.', '...##....##...', '.....####.....'], { '#': W[1] });
    // stamp + red seal
    rect(ctx, 11, 5, 3, 3, R[2]);
    px(ctx, 12, 6, Y[3]);
    hline(ctx, 3, 10, 5, PAL.metal[3]);
    hline(ctx, 3, 11, 4, PAL.metal[3]);
  },
  parcel: (ctx) => {
    const k = PAL.cork;
    // box in 3/4: lid + front + side
    rect(ctx, 2, 3, 10, 4, k[3]);
    hline(ctx, 2, 3, 10, k[4]);
    rect(ctx, 2, 7, 10, 7, k[2]);
    rect(ctx, 12, 4, 2, 10, k[1]);
    px(ctx, 12, 3, k[2]);
    hline(ctx, 2, 13, 10, k[1]);
    // string cross
    vline(ctx, 7, 3, 11, '#efe2c0');
    hline(ctx, 2, 5, 10, '#efe2c0');
    hline(ctx, 2, 10, 10, '#efe2c0');
    // label
    rect(ctx, 3, 8, 3, 2, W[4]);
    px(ctx, 6, 2, '#efe2c0');
    px(ctx, 8, 2, '#efe2c0');
  },
  carrot: (ctx) => {
    const o = PAL.orange;
    for (let i = 0; i < 10; i++) {
      const w = Math.max(1, 4 - Math.floor(i / 3));
      rect(ctx, 3 + i, 4 + i - Math.floor(w / 2), w, w, o[2]);
      px(ctx, 3 + i, 4 + i - Math.floor(w / 2), o[3]);
    }
    rect(ctx, 3, 3, 3, 3, o[2]);
    px(ctx, 3, 3, o[4]);
    px(ctx, 6, 7, o[1]);
    px(ctx, 9, 10, o[1]);
    // leafy top
    sprite(ctx, 0, 0, ['#..#', '.##.', '###.', '.#..'], { '#': G[3] });
    px(ctx, 1, 1, G[2]);
    px(ctx, 2, 2, G[1]);
  },
  onion: (ctx) => {
    const p = ['#5a2a4a', '#8a3e66', '#b85a86', '#d88aa8', '#f4c4d4'];
    ellipse(ctx, 2, 4, 12, 11, p[2]);
    ellipse(ctx, 3, 4, 8, 8, p[3]);
    px(ctx, 5, 6, p[4]);
    px(ctx, 6, 5, p[4]);
    // layer lines
    vline(ctx, 8, 6, 7, p[1]);
    vline(ctx, 5, 8, 4, p[1]);
    vline(ctx, 11, 7, 5, p[1]);
    // neck + roots
    rect(ctx, 7, 1, 2, 4, p[2]);
    px(ctx, 7, 1, '#c9a070');
    px(ctx, 8, 0, '#c9a070');
    hline(ctx, 6, 15, 4, '#c9b090');
  },
  banana: (ctx) => {
    // two curved bananas in a bunch, stems joined at the top-left
    const y = PAL.yellow;
    const rows = [
      '..gg............',
      '..gaa...........',
      '...aAa..........',
      '...aAAa.........',
      '...aAAAa........',
      '....aAAAa..bb...',
      '....aAAAAabBBb..',
      '.....aAAAAbBBBb.',
      '.....dAAAAAbBBBc',
      '......dAAAAAABBc',
      '.......ddAAAAAAc',
      '.........ddddcc.',
    ];
    sprite(ctx, 0, 2, rows, { g: G[1], a: y[2], A: y[3], b: y[2], B: y[4], d: y[1], c: '#5a3c2a' });
  },
  mango: (ctx) => {
    // kidney-shaped mango, green shoulder blushing to orange-red
    const o = PAL.orange;
    ellipse(ctx, 3, 4, 10, 11, o[2]);
    ellipse(ctx, 4, 5, 8, 8, o[3]);
    ellipse(ctx, 5, 9, 6, 5, R[3]);
    px(ctx, 6, 6, o[4]);
    px(ctx, 7, 6, o[4]);
    px(ctx, 5, 7, o[4]);
    rect(ctx, 3, 5, 3, 3, G[3]);
    px(ctx, 4, 4, G[4]);
    // stem & leaf
    rect(ctx, 7, 2, 1, 3, PAL.wood[2]);
    sprite(ctx, 8, 1, ['###.', '.###'], { '#': G[2] });
    px(ctx, 9, 1, G[3]);
  },
  apple: (ctx) => {
    ellipse(ctx, 2, 4, 12, 11, R[2]);
    ellipse(ctx, 3, 5, 9, 8, R[3]);
    px(ctx, 5, 6, R[4]);
    px(ctx, 5, 7, R[4]);
    px(ctx, 6, 6, '#ffffff');
    // dimple, stem & leaf
    rect(ctx, 7, 4, 2, 1, R[1]);
    vline(ctx, 8, 1, 4, PAL.wood[1]);
    sprite(ctx, 9, 1, ['##.', '###', '.#.'], { '#': G[3] });
    px(ctx, 10, 2, G[2]);
  },
  'chopped-veg': (ctx) => {
    // small bowl of chopped carrot, onion, greens
    ellipse(ctx, 1, 6, 14, 6, W[3]);
    rect(ctx, 2, 9, 12, 3, W[2]);
    ellipse(ctx, 3, 11, 10, 4, W[1]);
    hline(ctx, 2, 9, 12, W[4]);
    const bits: [number, number, string][] = [
      [4, 7, PAL.orange[3]],
      [6, 6, '#d88aa8'],
      [8, 7, G[3]],
      [10, 6, PAL.orange[2]],
      [5, 8, G[2]],
      [9, 8, '#f4c4d4'],
      [11, 8, PAL.orange[3]],
      [7, 8, PAL.orange[2]],
    ];
    for (const [x, y, c] of bits) px(ctx, x, y, c);
    for (const [x, y, c] of bits) px(ctx, x + 1, y, c);
  },
  'soup-bowl': (ctx) => {
    // steam
    sprite(ctx, 5, 0, ['.#..#', '#..#.', '.#..#'], { '#': W[3] });
    ellipse(ctx, 1, 5, 14, 6, W[4]);
    ellipse(ctx, 2, 6, 12, 4, PAL.orange[2]);
    ellipse(ctx, 3, 6, 6, 2, PAL.orange[3]);
    px(ctx, 9, 7, G[3]);
    px(ctx, 6, 8, PAL.orange[1]);
    // bowl body
    rect(ctx, 2, 9, 12, 2, W[3]);
    ellipse(ctx, 2, 9, 12, 6, W[3]);
    ellipse(ctx, 4, 12, 8, 3, W[1]);
    hline(ctx, 2, 10, 12, B[3]);
    // spoon
    rect(ctx, 11, 3, 1, 4, PAL.metal[4]);
  },
  plates: (ctx) => {
    for (let i = 0; i < 4; i++) {
      const y = 11 - i * 2;
      ellipse(ctx, 1, y, 14, 4, W[1]);
      ellipse(ctx, 1, y - 1, 14, 4, W[3]);
    }
    ellipse(ctx, 1, 4, 14, 5, W[4]);
    ellipse(ctx, 4, 5, 8, 3, W[2]);
    hline(ctx, 3, 5, 2, B[3]);
    hline(ctx, 11, 7, 2, B[3]);
  },
  'white-shirt': (ctx) => shirtIcon(ctx, W, false),
  'pink-shirt': (ctx) => shirtIcon(ctx, PAL.pink, false),
  'red-sock': (ctx) => {
    sprite(ctx, 4, 2, ['#####.', '#####.', '#####.', '#####.', '#####.', '######', '#######', '.######', '..####.'], {
      '#': R[2],
    });
    hline(ctx, 4, 2, 5, W[4]);
    hline(ctx, 4, 3, 5, W[3]);
    vline(ctx, 4, 4, 5, R[3]);
    hline(ctx, 7, 10, 3, R[1]);
    px(ctx, 9, 8, R[4]);
    px(ctx, 6, 7, R[1]);
  },
  banknote: (ctx) => {
    const g = ['#2a4a32', '#3c6a46', '#5a9466', '#8ac08e', '#c4e6b8'];
    rect(ctx, 1, 4, 14, 8, g[3]);
    hline(ctx, 1, 4, 14, g[4]);
    hline(ctx, 1, 11, 14, g[1]);
    rect(ctx, 2, 5, 12, 6, g[2]);
    ellipse(ctx, 9, 5, 5, 6, g[3]);
    ellipse(ctx, 10, 6, 3, 4, g[1]);
    drawPixelText(ctx, '₹', 3, 6, g[4]);
    px(ctx, 13, 5, g[4]);
    px(ctx, 2, 10, g[4]);
  },
  coins: (ctx) => {
    const c = Y;
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, 1, 12 - i * 2, 9, 4, c[1]);
      ellipse(ctx, 1, 11 - i * 2, 9, 4, c[2]);
    }
    ellipse(ctx, 1, 6, 9, 4, c[3]);
    px(ctx, 3, 7, c[4]);
    drawCoin(ctx, 4, 2);
  },
  detergent: (ctx) => {
    const b = B;
    rect(ctx, 3, 3, 9, 11, b[2]);
    vline(ctx, 3, 3, 11, b[3]);
    vline(ctx, 11, 3, 11, b[1]);
    hline(ctx, 3, 13, 9, b[0]);
    // cap + handle
    rect(ctx, 5, 1, 3, 2, R[2]);
    hline(ctx, 5, 1, 3, R[3]);
    sprite(ctx, 9, 1, ['###', '#.#', '###'], { '#': b[2] });
    // label with bubbles
    rect(ctx, 4, 6, 7, 5, W[4]);
    px(ctx, 5, 8, b[3]);
    px(ctx, 7, 7, b[3]);
    px(ctx, 8, 9, b[4]);
    px(ctx, 9, 7, PAL.teal[3]);
  },
  'clothes-pile': (ctx) => {
    ellipse(ctx, 1, 6, 14, 9, B[2]);
    ellipse(ctx, 2, 5, 8, 6, R[2]);
    ellipse(ctx, 3, 5, 5, 3, R[3]);
    ellipse(ctx, 8, 7, 7, 6, Y[3]);
    ellipse(ctx, 9, 7, 4, 3, Y[4]);
    rect(ctx, 2, 12, 5, 2, PAL.pink[3]);
    hline(ctx, 3, 14, 10, B[1]);
    px(ctx, 6, 9, R[1]);
  },
  'cooking-pot': (ctx) => {
    const m = PAL.metal;
    ellipse(ctx, 2, 4, 12, 4, m[4]);
    ellipse(ctx, 3, 5, 10, 2, m[1]);
    rect(ctx, 2, 6, 12, 7, m[3]);
    vline(ctx, 3, 6, 7, m[4]);
    vline(ctx, 13, 6, 7, m[1]);
    ellipse(ctx, 2, 10, 12, 5, m[3]);
    hline(ctx, 4, 14, 8, m[1]);
    // handles + lid knob
    rect(ctx, 0, 6, 2, 2, OUTLINE);
    rect(ctx, 14, 6, 2, 2, OUTLINE);
    hline(ctx, 2, 8, 12, m[2]);
    px(ctx, 7, 3, OUTLINE);
    px(ctx, 8, 3, OUTLINE);
  },
};

function shirtIcon(ctx: Ctx, c: readonly string[], stains: boolean) {
  sprite(
    ctx,
    1,
    2,
    [
      '...##..##...',
      '.####..####.',
      '############',
      '############',
      '##.######.##',
      '...######...',
      '...######...',
      '...######...',
      '...######...',
      '...######...',
      '...######...',
    ],
    { '#': c[3] },
  );
  hline(ctx, 6, 2, 2, c[1]);
  vline(ctx, 9, 7, 6, c[2]);
  hline(ctx, 4, 12, 6, c[2]);
  vline(ctx, 2, 4, 3, c[4]);
  vline(ctx, 4, 7, 5, c[4]);
  // collar + buttons
  px(ctx, 6, 3, c[4]);
  px(ctx, 7, 3, c[4]);
  for (const y of [6, 8, 10]) px(ctx, 7, y, c[1]);
  if (stains) px(ctx, 6, 7, '#8a6a3a');
}

function genericBox(ctx: Ctx) {
  const k = PAL.cork;
  rect(ctx, 2, 5, 12, 9, k[2]);
  rect(ctx, 2, 3, 12, 3, k[3]);
  hline(ctx, 2, 3, 12, k[4]);
  vline(ctx, 13, 3, 11, k[1]);
  hline(ctx, 2, 13, 12, k[1]);
  rect(ctx, 7, 3, 2, 5, mix(k[2], '#e8dcc0', 0.5));
  hline(ctx, 2, 6, 12, k[1]);
}

export const ITEM_ICON_IDS = Object.keys(ICONS);

const cache = new Map<string, HTMLCanvasElement>();

export function drawItemIcon(id: string): HTMLCanvasElement {
  const hit = cache.get(id);
  if (hit) return hit;
  const [c, ctx] = makeCanvas(16, 16);
  (ICONS[id] ?? genericBox)(ctx);
  outlineOuter(c, OUTLINE, 0.95);
  cache.set(id, c);
  return c;
}
