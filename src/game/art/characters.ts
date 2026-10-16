// Chibi character sprite sheets + dialogue portraits, generated from an Appearance.

import type { Appearance, HairStyle } from '../../domain/types';
import type { Ramp } from './palette';
import { OUTLINE } from './palette';
import { type Ctx, makeCanvas, px, rect, hline, vline, ellipse, ramp, mix, outlineOuter } from './draw';

export type CharKind = 'adult' | 'child' | 'elder';
export const FRAME_W = 16;
export const FRAME_H = 24;

export function kindForRole(role: string): CharKind {
  if (role === 'younger-sibling') return 'child';
  if (role === 'grandparent') return 'elder';
  return 'adult';
}

// ---------------------------------------------------------------- setup ---

interface Proportions {
  headTop: number;
  headH: number;
  bodyH: number;
  legH: number;
}

function proportions(kind: CharKind): Proportions {
  // every kind ends with 2 shoe rows at y=21..22 (outline at 23)
  if (kind === 'child') return { headTop: 6, headH: 9, bodyH: 4, legH: 2 };
  if (kind === 'elder') return { headTop: 4, headH: 10, bodyH: 5, legH: 2 };
  return { headTop: 3, headH: 10, bodyH: 5, legH: 3 };
}

interface Colors {
  skin: Ramp;
  hair: Ramp;
  shirt: Ramp;
  pants: Ramp;
  shoe: [string, string, string];
  eye: string;
  blush: string;
  cane: [string, string];
}

function colorsFor(a: Appearance, kind: CharKind): Colors {
  const hairBase = kind === 'elder' ? mix(a.hair || '#b8b8c0', '#c9c6d2', 0.75) : a.hair || '#2a1f1a';
  const skin = ramp(a.skin || '#e8b48a');
  return {
    skin,
    hair: ramp(hairBase),
    shirt: ramp(a.shirt || '#2e86ab'),
    pants: ramp(a.pants || '#2b2d42'),
    shoe: kind === 'child' ? ['#5a2a3a', '#a8435a', '#e8e0d8'] : ['#21171f', '#3e2b33', '#6a5260'],
    eye: '#21172b',
    blush: mix(skin[2], '#ff6f7a', 0.35),
    cane: ['#5e3424', '#a8673f'],
  };
}

// ------------------------------------------------------------ hair masks ---
// 12 columns (x = 2..13), row 0 = headTop-3. Head box = cols 1..10, rows 3..(3+headH-1).
// '#' = hair (auto-shaded), 'D' = darkest hair (tie / parting).

type View = 'front' | 'side' | 'back';

const HAIR: Record<HairStyle, Record<View, string[]>> = {
  short: {
    front: [
      '............',
      '............',
      '...######...',
      '..########..',
      '.##########.',
      '############',
      '############',
      '############',
      '###.#...####',
      '##........##',
      '.#........#.',
    ],
    side: [
      '............',
      '............',
      '..######....',
      '.########...',
      '##########..',
      '###########.',
      '############',
      '###########.',
      '######..##..',
      '#####.......',
      '####........',
      '.##.........',
    ],
    back: [
      '............',
      '............',
      '...######...',
      '..########..',
      '.##########.',
      '############',
      '############',
      '############',
      '############',
      '############',
      '.##########.',
      '..########..',
      '...##..##...',
    ],
  },
  long: {
    front: [
      '............',
      '............',
      '...######...',
      '..########..',
      '.##########.',
      '############',
      '############',
      '#####D######',
      '####....####',
      '###......###',
      '##........##',
      '##........##',
      '##........##',
      '##........##',
      '##........##',
      '#..........#',
    ],
    side: [
      '............',
      '............',
      '..######....',
      '.########...',
      '##########..',
      '###########.',
      '############',
      '###########.',
      '#######..#..',
      '######......',
      '######......',
      '######......',
      '#####.......',
      '#####.......',
      '####........',
      '####........',
      '.##.........',
    ],
    back: [
      '............',
      '............',
      '...######...',
      '..########..',
      '.##########.',
      '############',
      '############',
      '############',
      '############',
      '############',
      '############',
      '############',
      '.##########.',
      '.##########.',
      '.##########.',
      '.##########.',
      '..########..',
      '...#.##.#...',
    ],
  },
  bun: {
    front: [
      '............',
      '....####....',
      '...######...',
      '..##DDDD##..',
      '.##########.',
      '.##########.',
      '############',
      '#####D######',
      '###......###',
      '##........##',
      '.#........#.',
    ],
    side: [
      '............',
      '............',
      '...#####....',
      '..#######...',
      '.#########..',
      '.##########.',
      '############',
      '###########.',
      '######..#...',
      '#####.......',
      '####........',
      '.##.........',
    ],
    back: [
      '............',
      '............',
      '...######...',
      '..########..',
      '.##########.',
      '############',
      '############',
      '############',
      '############',
      '############',
      '.##########.',
      '..########..',
      '...##..##...',
    ],
  },
  spiky: {
    front: [
      '............',
      '..#..#..#...',
      '.##.###.###.',
      '.##########.',
      '############',
      '############',
      '############',
      '############',
      '###.##..#.##',
      '##........##',
      '.#........#.',
    ],
    side: [
      '............',
      '.#..#..#....',
      '.##.##.##...',
      '##########..',
      '###########.',
      '############',
      '############',
      '###########.',
      '######..#...',
      '#####.......',
      '####........',
      '.##.........',
    ],
    back: [
      '............',
      '..#..#..#...',
      '.##.###.###.',
      '.##########.',
      '############',
      '############',
      '############',
      '############',
      '############',
      '############',
      '.##########.',
      '..########..',
      '...##..##...',
    ],
  },
  bald: {
    front: [
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '##........##',
      '##........##',
      '#..........#',
    ],
    side: [
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '.####.......',
      '#####.......',
      '.###........',
    ],
    back: [
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '##........##',
      '###......###',
      '.##########.',
      '..########..',
    ],
  },
};

/** Paint a hair mask with automatic top-left-lit shading. */
function paintHair(ctx: Ctx, x0: number, y0: number, mask: string[], hair: Ramp, maxRow: number, shine: boolean) {
  const has = (c: number, r: number) => r >= 0 && r < mask.length && r <= maxRow && c >= 0 && c < 12 && mask[r][c] !== '.';
  for (let r = 0; r < mask.length && r <= maxRow; r++)
    for (let c = 0; c < 12; c++) {
      const ch = mask[r][c];
      if (ch === '.') continue;
      let col = hair[2];
      if (ch === 'D') col = hair[0];
      else {
        if (!has(c, r - 1)) col = hair[3];
        if (!has(c + 1, r) || !has(c, r + 1)) col = hair[1];
        if (!has(c + 1, r) && !has(c, r + 1)) col = hair[0];
        if (shine && r >= 3 && r <= 5 && c >= 2 && c - 2 + (r - 3) <= 2) col = hair[3];
        if (shine && r === 4 && c === 3) col = hair[4];
      }
      px(ctx, x0 + c, y0 + r, col);
    }
}

// ---------------------------------------------------------------- frames ---

type Dir = 'down' | 'side' | 'up';

function drawHead(ctx: Ctx, x: number, y: number, h: number, skin: Ramp, sideView: boolean) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < 10; i++) {
      if ((i === 0 || i === 9) && (j === 0 || j === h - 1)) continue;
      let c = skin[2];
      if (i === 9 || j === h - 1) c = skin[1];
      else if (i === 0 && !sideView) c = skin[3];
      px(ctx, x + i, y + j, c);
    }
  // jaw shadow under the face
  hline(ctx, x + 2, y + h - 1, 6, skin[1]);
}

function drawFrame(
  ctx: Ctx,
  ox: number,
  oy: number,
  C: Colors,
  style: HairStyle,
  kind: CharKind,
  dir: Dir,
  phase: number,
) {
  const P = proportions(kind);
  const step = phase === 1 ? 1 : phase === 3 ? -1 : 0;
  const hy = oy + P.headTop;
  const by = hy + P.headH; // body top
  const ly = by + P.bodyH; // legs top
  const sy = ly + P.legH; // shoes top (2 rows)
  const elder = kind === 'elder';
  const { skin, shirt, pants, shoe, hair } = C;
  const X = (n: number) => ox + n;

  if (dir === 'down' || dir === 'up') {
    // ---- legs + shoes
    const lLift = step === -1 ? 1 : 0;
    const rLift = step === 1 ? 1 : 0;
    const leg = (x: number, lift: number, cols: [string, string, string]) => {
      for (let r = 0; r < P.legH - lift; r++) {
        px(ctx, X(x), ly + r, cols[0]);
        px(ctx, X(x + 1), ly + r, cols[1]);
        px(ctx, X(x + 2), ly + r, cols[2]);
      }
      const s = sy - lift;
      px(ctx, X(x), s, shoe[2]);
      px(ctx, X(x + 1), s, shoe[1]);
      px(ctx, X(x + 2), s, shoe[1]);
      hline(ctx, X(x), s + 1, 3, shoe[0]);
    };
    leg(5, lLift, [pants[3], pants[2], pants[1]]);
    leg(8, rLift, [pants[2], pants[1], pants[0]]);
    // ---- torso
    for (let r = 0; r < P.bodyH; r++) {
      const y = by + r;
      for (let x = 4; x <= 11; x++) {
        let c = shirt[2];
        if (x === 5) c = shirt[3];
        if (x === 4) c = shirt[1];
        if (x === 11) c = shirt[0];
        if (r === P.bodyH - 1) c = x === 11 ? shirt[0] : shirt[1];
        px(ctx, X(x), y, c);
      }
    }
    if (dir === 'down') {
      hline(ctx, X(5), by, 6, shirt[1]); // head shadow
      px(ctx, X(7), by, skin[1]);
      px(ctx, X(8), by, skin[1]);
      px(ctx, X(7), by + 1, shirt[1]);
      px(ctx, X(8), by + 1, shirt[1]);
    } else {
      hline(ctx, X(5), by, 6, shirt[1]);
      vline(ctx, X(7), by + 1, P.bodyH - 2, mix(shirt[2], shirt[1], 0.5)); // back seam
    }
    // ---- arms
    const lExt = step === 1 ? 1 : step === -1 ? -1 : 0;
    const arm = (x: number, ext: number, sleeve: string, hand: string) => {
      const len = P.bodyH + ext;
      for (let r = 0; r < len - 1; r++) px(ctx, X(x), by + r, sleeve);
      px(ctx, X(x), by + len - 1, hand);
    };
    const swapL = dir === 'up' ? -lExt : lExt;
    arm(3, swapL, shirt[2], skin[2]);
    arm(12, elder ? 0 : -swapL, shirt[1], skin[1]);
    // ---- head
    drawHead(ctx, X(3), hy, P.headH, skin, false);
    const eyeRow = P.headH === 9 ? 5 : 6;
    if (dir === 'down') {
      // eyes, blush, mouth
      vline(ctx, X(5), hy + eyeRow, 2, C.eye);
      vline(ctx, X(10), hy + eyeRow, 2, C.eye);
      px(ctx, X(4), hy + eyeRow + 2, C.blush);
      px(ctx, X(11), hy + eyeRow + 2, C.blush);
      px(ctx, X(7), hy + eyeRow + 2, mix(skin[1], '#8a3040', 0.35));
      px(ctx, X(8), hy + eyeRow + 2, mix(skin[1], '#8a3040', 0.35));
      if (elder) {
        // little round spectacles glints
        px(ctx, X(6), hy + eyeRow, mix(skin[2], '#ffffff', 0.5));
        px(ctx, X(9), hy + eyeRow, mix(skin[2], '#ffffff', 0.5));
      }
    }
    if (style === 'bald') {
      // scalp shine
      px(ctx, X(5), hy + 1, skin[4]);
      px(ctx, X(6), hy + 1, skin[3]);
      px(ctx, X(5), hy + 2, skin[3]);
    }
    const mask = HAIR[style][dir === 'down' ? 'front' : 'back'];
    const maxRow = style === 'long' ? 99 : 2 + P.headH;
    paintHair(ctx, X(2), hy - 3, mask, hair, maxRow, true);
    if (style === 'bun' && dir === 'up') {
      // bun on the back of the head
      ellipse(ctx, X(5), hy + 2, 6, 5, hair[1]);
      ellipse(ctx, X(5), hy + 2, 5, 4, hair[2]);
      px(ctx, X(6), hy + 3, hair[3]);
      px(ctx, X(7), hy + 3, hair[3]);
      hline(ctx, X(6), hy + 6, 4, hair[0]);
    }
    // ---- cane
    if (elder) {
      const cx = dir === 'down' ? 13 : 2;
      const top = by + P.bodyH - 2;
      vline(ctx, X(cx), top, sy + 2 - top, C.cane[0]);
      px(ctx, X(cx), top, C.cane[1]);
      px(ctx, X(cx === 13 ? 12 : 3), top, C.cane[1]);
      if (dir === 'up') px(ctx, X(3), by + P.bodyH - 1, skin[1]);
    }
    return;
  }

  // ------------------------------------------------ side view (facing right)
  const dx = elder ? 1 : 0;
  // legs
  if (step === 0) {
    for (let r = 0; r < P.legH; r++) {
      px(ctx, X(6), ly + r, pants[1]);
      px(ctx, X(7), ly + r, pants[0]);
      px(ctx, X(8), ly + r, pants[3]);
      px(ctx, X(9), ly + r, pants[2]);
    }
    hline(ctx, X(6), sy, 4, shoe[1]);
    px(ctx, X(10), sy, shoe[2]);
    px(ctx, X(8), sy, shoe[2]);
    hline(ctx, X(6), sy + 1, 5, shoe[0]);
  } else {
    const far = step === 1 ? pants[0] : pants[1];
    const near = step === 1 ? pants[2] : pants[3];
    const lift = step === -1 ? 1 : 0;
    // back leg (diagonal to the left)
    for (let r = 0; r < P.legH; r++) {
      const off = r >= P.legH - 1 ? 1 : 0;
      px(ctx, X(6 - off), ly + r, far);
      px(ctx, X(7 - off), ly + r, far);
    }
    hline(ctx, X(4), sy, 3, shoe[1]);
    hline(ctx, X(4), sy + 1, 3, shoe[0]);
    // front leg (diagonal to the right)
    for (let r = 0; r < P.legH - lift; r++) {
      const off = r >= 1 ? 1 : 0;
      px(ctx, X(8 + off), ly + r, near);
      px(ctx, X(9 + off), ly + r, mix(near, pants[1], 0.5));
    }
    hline(ctx, X(9), sy - lift, 3, shoe[1]);
    px(ctx, X(11), sy - lift, shoe[2]);
    hline(ctx, X(9), sy + 1 - lift, 3, shoe[0]);
  }
  // torso
  for (let r = 0; r < P.bodyH; r++)
    for (let x = 5; x <= 10; x++) {
      let c = shirt[2];
      if (x === 5) c = shirt[3];
      if (x === 10) c = shirt[1];
      if (r === P.bodyH - 1) c = shirt[1];
      px(ctx, X(x), by + r, c);
    }
  hline(ctx, X(6), by, 4, shirt[1]);
  if (elder) {
    // stooped back
    px(ctx, X(4), by, shirt[3]);
    px(ctx, X(4), by + 1, shirt[2]);
  }
  // arm
  const armTop = by + 1;
  if (elder) {
    // arm reaching forward to the cane
    px(ctx, X(8), armTop, shirt[3]);
    px(ctx, X(9), armTop + 1, shirt[3]);
    px(ctx, X(10), armTop + 2, shirt[2]);
    px(ctx, X(11), armTop + 2, skin[2]);
    const top = armTop + 2;
    vline(ctx, X(12), top, sy + 2 - top, C.cane[0]);
    px(ctx, X(12), top - 1, C.cane[1]);
    px(ctx, X(11), top - 1, C.cane[1]);
  } else if (step === 0) {
    for (let r = 0; r < P.bodyH - 1; r++) {
      px(ctx, X(7), armTop + r, shirt[3]);
      px(ctx, X(8), armTop + r, shirt[1]);
    }
    px(ctx, X(7), armTop + P.bodyH - 1, skin[2]);
    px(ctx, X(8), armTop + P.bodyH - 1, skin[1]);
  } else {
    const fwd = step === 1;
    const n = P.bodyH - 1;
    for (let r = 0; r < n; r++) {
      const off = Math.round(((fwd ? 1 : -1) * (r * 2)) / Math.max(1, n - 1));
      px(ctx, X(7 + off), armTop + r, shirt[3]);
      px(ctx, X(8 + off), armTop + r, shirt[1]);
    }
    const hx = fwd ? 9 : 5;
    px(ctx, X(hx), armTop + n - (fwd ? 1 : 1), skin[2]);
    px(ctx, X(hx + 1), armTop + n - 1, skin[1]);
  }
  // head
  const hx0 = X(3 + dx);
  drawHead(ctx, hx0, hy, P.headH, skin, true);
  const eyeRow = P.headH === 9 ? 5 : 6;
  vline(ctx, X(10 + dx), hy + eyeRow, 2, C.eye);
  px(ctx, X(11 + dx), hy + eyeRow + 2, C.blush);
  // nose
  px(ctx, X(13 + dx), hy + eyeRow + 1, skin[1]);
  if (style === 'bald') {
    px(ctx, X(6 + dx), hy + 1, skin[4]);
    px(ctx, X(7 + dx), hy + 1, skin[3]);
  }
  const mask = HAIR[style].side;
  const maxRow = style === 'long' ? 99 : 2 + P.headH;
  paintHair(ctx, X(2 + dx), hy - 3, mask, hair, maxRow, true);
  if (style !== 'long') {
    // ear
    px(ctx, X(7 + dx), hy + eyeRow, skin[2]);
    px(ctx, X(7 + dx), hy + eyeRow + 1, skin[1]);
  }
  if (style === 'bun') {
    ellipse(ctx, X(1 + dx), hy, 4, 4, hair[1]);
    px(ctx, X(2 + dx), hy + 1, hair[3]);
    px(ctx, X(3 + dx), hy + 1, hair[2]);
    px(ctx, X(4 + dx), hy + 2, hair[0]);
  }
}

// ------------------------------------------------------------ public api ---

const sheetCache = new Map<string, HTMLCanvasElement>();

/** 4 columns x 4 rows of 16x24 frames. Rows: down, left, right, up. Cols: idle, stepA, idle, stepB. */
export function drawCharacterSheet(a: Appearance, kind: CharKind): HTMLCanvasElement {
  const key = kind + JSON.stringify(a);
  const hit = sheetCache.get(key);
  if (hit) return hit;
  const C = colorsFor(a, kind);
  const style: HairStyle = (HAIR as Record<string, unknown>)[a.hairStyle] ? a.hairStyle : 'short';
  const [c, ctx] = makeCanvas(FRAME_W * 4, FRAME_H * 4);
  for (let col = 0; col < 4; col++) {
    drawFrame(ctx, col * FRAME_W, 0, C, style, kind, 'down', col);
    drawFrame(ctx, col * FRAME_W, FRAME_H * 2, C, style, kind, 'side', col);
    drawFrame(ctx, col * FRAME_W, FRAME_H * 3, C, style, kind, 'up', col);
  }
  // row 1 (left) = mirrored row 2 (right)
  for (let col = 0; col < 4; col++) {
    ctx.save();
    ctx.translate(col * FRAME_W + FRAME_W, FRAME_H);
    ctx.scale(-1, 1);
    ctx.drawImage(c, col * FRAME_W, FRAME_H * 2, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
    ctx.restore();
  }
  outlineOuter(c, OUTLINE, 0.9);
  sheetCache.set(key, c);
  return c;
}

// -------------------------------------------------------------- portrait ---

function paintMask(ctx: Ctx, mask: Uint8Array, w: number, h: number, r: Ramp, shineBox?: [number, number, number, number]) {
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] > 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m = mask[y * w + x];
      if (!m) continue;
      let c = r[2];
      if (m === 2) c = r[1];
      if (!has(x, y - 1)) c = r[3];
      if (!has(x + 1, y) || !has(x, y + 1)) c = r[1];
      if (!has(x + 1, y) && !has(x, y + 1)) c = r[0];
      if (x > w * 0.62 && m === 1 && c === r[2]) c = mix(r[2], r[1], 0.5);
      if (shineBox) {
        const [sx, sy, sw, sh] = shineBox;
        if (x >= sx && x < sx + sw && y >= sy && y < sy + sh && (x - sx + (y - sy)) % 5 < 2) c = r[3];
      }
      px(ctx, x, y, c);
    }
}

function inEllipse(x: number, y: number, ex: number, ey: number, ew: number, eh: number) {
  const dx = (x + 0.5 - (ex + ew / 2)) / (ew / 2);
  const dy = (y + 0.5 - (ey + eh / 2)) / (eh / 2);
  return dx * dx + dy * dy <= 1;
}

const portraitCache = new Map<string, HTMLCanvasElement>();

/** Head-and-shoulders bust, 32x32 native (scaled nearest-neighbour to `size`). */
export function drawPortrait(a: Appearance, kind: CharKind, size = 32): HTMLCanvasElement {
  const key = `${kind}|${size}|${JSON.stringify(a)}`;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const C = colorsFor(a, kind);
  const style: HairStyle = a.hairStyle in HAIR ? a.hairStyle : 'short';
  const W = 32;
  const [c, ctx] = makeCanvas(W, W);
  const child = kind === 'child';
  const elder = kind === 'elder';
  const hx = 7;
  const hw = 18;
  const hy = child ? 7 : 5;
  const hh = child ? 18 : 19;
  const shY = child ? 26 : 25;
  const { skin, hair, shirt } = C;

  // ---- back hair
  const back = new Uint8Array(W * W);
  const setB = (fn: (x: number, y: number) => boolean, v = 1) => {
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (fn(x, y)) back[y * W + x] = v;
  };
  if (style === 'long') {
    setB((x, y) => inEllipse(x, y, hx - 2, hy - 3, hw + 4, hh + 2));
    setB((x, y) => y >= hy + 6 && y < 31 && ((x >= hx - 2 && x <= hx + 2) || (x >= hx + hw - 3 && x <= hx + hw + 1)));
  } else if (style === 'bun') {
    setB((x, y) => inEllipse(x, y, 11, hy - 6, 10, 9));
  }
  if (style !== 'bald') setB((x, y) => inEllipse(x, y, hx - 1, hy - 3, hw + 2, 15));
  paintMask(ctx, back, W, W, hair);

  // ---- shoulders / shirt
  const sx0 = child ? 6 : 3;
  const sx1 = child ? 25 : 28;
  for (let y = shY; y < W; y++) {
    const inset = y === shY ? 4 : y === shY + 1 ? 2 : y === shY + 2 ? 1 : 0;
    for (let x = sx0 + inset; x <= sx1 - inset; x++) {
      let col = shirt[2];
      const t = (x - sx0) / (sx1 - sx0);
      if (t < 0.22) col = shirt[3];
      else if (t > 0.75) col = shirt[1];
      if (y === shY) col = shirt[3];
      px(ctx, x, y, col);
    }
  }
  // sleeve seams
  vline(ctx, sx0 + 5, shY + 3, W - shY - 3, shirt[1]);
  vline(ctx, sx1 - 5, shY + 3, W - shY - 3, shirt[0]);
  // ---- neck
  rect(ctx, 13, hy + hh - 4, 6, shY - (hy + hh - 4) + 2, skin[1]);
  // collar V
  for (let i = 0; i < 3; i++) {
    hline(ctx, 14 + i, shY + i, 4 - 2 * i > 0 ? 4 - 2 * i : 1, skin[1]);
    px(ctx, 13 + i, shY + i, shirt[0]);
    px(ctx, 18 - i, shY + i, shirt[0]);
  }
  hline(ctx, 14, shY - 1, 4, skin[0]);
  // ---- ears
  ellipse(ctx, hx - 1, hy + 9, 3, 5, skin[1]);
  ellipse(ctx, hx + hw - 2, hy + 9, 3, 5, skin[1]);
  px(ctx, hx, hy + 11, skin[0]);
  px(ctx, hx + hw - 1, hy + 11, skin[0]);
  // ---- head
  ellipse(ctx, hx, hy, hw, hh, skin[1]);
  ellipse(ctx, hx, hy, hw - 3, hh - 2, skin[2]);
  ellipse(ctx, hx + 2, hy + 3, 6, 6, mix(skin[2], skin[3], 0.6));

  // ---- front hair
  const front = new Uint8Array(W * W);
  const setF = (fn: (x: number, y: number) => boolean, v = 1) => {
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (fn(x, y)) front[y * W + x] = v;
  };
  const cap = (x: number, y: number) => inEllipse(x, y, hx - 1, hy - 3, hw + 2, 17);
  if (style === 'short') {
    setF((x, y) => cap(x, y) && (y <= hy + 5 + ((x * 5) % 3 === 0 ? 1 : 0) || x <= hx + 1 || x >= hx + hw - 2) && y <= hy + 10);
  } else if (style === 'long') {
    setF((x, y) => cap(x, y) && y <= hy + 4 + Math.floor(Math.abs(x - 15.5) / 2.5));
    setF((x, y) => y >= hy + 5 && y < 31 && ((x >= hx - 2 && x <= hx + 1) || (x >= hx + hw - 2 && x <= hx + hw + 1)));
    setF((x, y) => x === 16 && y >= hy && y <= hy + 4, 2);
  } else if (style === 'bun') {
    setF((x, y) => cap(x, y) && y <= hy + 4 + (Math.abs(x - 15.5) > 6 ? 2 : 0));
    setF((x, y) => x >= 13 && x <= 18 && y === hy - 3, 2);
  } else if (style === 'spiky') {
    setF((x, y) => cap(x, y) && (y <= hy + 5 || x <= hx + 1 || x >= hx + hw - 2) && y <= hy + 9);
    // upward spikes
    for (const sxp of [9, 13, 17, 21]) setF((x, y) => y >= hy - 7 && y < hy - 1 && Math.abs(x - sxp) <= (y - (hy - 7)) / 2);
    // downward fringe points
    for (const sxp of [11, 15, 19]) setF((x, y) => y > hy + 5 && y <= hy + 8 && Math.abs(x - sxp) <= (hy + 8 - y) / 2);
  } else if (style === 'bald') {
    setF((x, y) => y >= hy + 6 && y <= hy + 12 && (x <= hx + 1 || x >= hx + hw - 2) && inEllipse(x, y, hx - 1, hy - 1, hw + 2, hh));
  }
  paintMask(ctx, front, W, W, hair, style === 'bald' ? undefined : [hx + 2, hy - 2, 7, 4]);
  if (style === 'bald') {
    px(ctx, hx + 5, hy + 2, skin[4]);
    px(ctx, hx + 6, hy + 2, skin[4]);
    px(ctx, hx + 4, hy + 3, skin[3]);
    px(ctx, hx + 5, hy + 3, skin[3]);
  }

  // ---- face
  const ey = hy + (child ? 10 : 10);
  const browC = hair[0];
  const eye = (x: number) => {
    rect(ctx, x, ey, 2, 3, C.eye);
    px(ctx, x, ey, '#ffffff');
    px(ctx, x + 1, ey + 2, mix(C.eye, '#7a4a2c', 0.6));
  };
  eye(11);
  eye(19);
  if (child) {
    // bigger, rounder child eyes
    vline(ctx, 10, ey + 1, 2, C.eye);
    vline(ctx, 21, ey + 1, 2, C.eye);
  }
  hline(ctx, 10, ey - 2, 3, browC);
  hline(ctx, 19, ey - 2, 3, browC);
  // nose
  px(ctx, 16, ey + 3, skin[1]);
  px(ctx, 16, ey + 4, skin[0]);
  // smile
  const my = ey + 6;
  hline(ctx, 14, my, 4, '#8a3040');
  px(ctx, 13, my - 1, '#8a3040');
  px(ctx, 18, my - 1, '#8a3040');
  px(ctx, 15, my + 1, mix(skin[2], '#e05060', 0.4));
  px(ctx, 16, my + 1, mix(skin[2], '#e05060', 0.4));
  // blush
  hline(ctx, 9, ey + 4, 2, C.blush);
  hline(ctx, 21, ey + 4, 2, C.blush);
  if (elder) {
    // round spectacles + smile lines
    const glass = '#5a4a6a';
    for (const gx of [10, 18]) {
      hline(ctx, gx, ey - 1, 4, glass);
      hline(ctx, gx, ey + 3, 4, glass);
      vline(ctx, gx - 1, ey, 3, glass);
      vline(ctx, gx + 4, ey, 3, glass);
      px(ctx, gx + 2, ey, '#dfe8f0');
    }
    hline(ctx, 15, ey, 1, glass);
    hline(ctx, 15, ey, 3, glass);
    px(ctx, 12, my + 1, skin[0]);
    px(ctx, 19, my + 1, skin[0]);
  }

  outlineOuter(c, OUTLINE, 1);
  let out = c;
  if (size !== W) {
    const [s, sctx] = makeCanvas(size, size);
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(c, 0, 0, size, size);
    out = s;
  }
  portraitCache.set(key, out);
  return out;
}
