// Small 16x16 effect sprites (emotes, prompts, shadows, rain).

import { PAL, OUTLINE } from './palette';
import { type Ctx, makeCanvas, px, rect, hline, vline, ellipse, sprite, outlineOuter } from './draw';
import { drawPixelText } from './pixelFont';

export const FX_KEYS = ['heart', 'cloud', 'sparkle', 'coin', 'exclaim', 'prompt', 'shadow', 'raindrop', 'zzz'] as const;
export type FxKey = (typeof FX_KEYS)[number];

function heart(ctx: Ctx) {
  const r = PAL.red;
  sprite(
    ctx,
    2,
    3,
    [
      '.###...###..',
      '#lh##.#####.',
      '#h####@####d',
      '#h#########d',
      '###########d',
      '.#########d.',
      '..#######d..',
      '...#####d...',
      '....###d....',
      '.....#d.....',
    ],
    { '#': r[2], l: '#ffffff', h: r[4], d: r[1], '@': r[2] },
  );
  // sparkle dot
  px(ctx, 13, 2, '#fff3c4');
}

function cloud(ctx: Ctx) {
  const g = ['#4a4458', '#6e6880', '#8f8aa0', '#b4b0c2'];
  ellipse(ctx, 1, 5, 7, 6, g[2]);
  ellipse(ctx, 4, 2, 8, 8, g[2]);
  ellipse(ctx, 8, 4, 7, 7, g[2]);
  rect(ctx, 3, 8, 10, 3, g[2]);
  hline(ctx, 3, 10, 10, g[1]);
  ellipse(ctx, 5, 3, 4, 3, g[3]);
  px(ctx, 2, 6, g[3]);
  // angry scribble
  const s = '#2a1f33';
  sprite(ctx, 4, 5, ['.##.#..', '#..#.##', '.##..#.'], { '#': s });
  // little storm bolt
  sprite(ctx, 7, 11, ['.##', '##.', '.#.', '#..'], { '#': PAL.yellow[3] });
}

function sparkle(ctx: Ctx) {
  const y = PAL.yellow;
  vline(ctx, 7, 1, 14, y[3]);
  hline(ctx, 1, 7, 14, y[3]);
  rect(ctx, 6, 5, 3, 5, y[3]);
  rect(ctx, 5, 6, 5, 3, y[3]);
  vline(ctx, 7, 3, 10, y[4]);
  hline(ctx, 3, 7, 10, y[4]);
  px(ctx, 7, 7, '#ffffff');
  px(ctx, 6, 6, '#ffffff');
  px(ctx, 12, 2, y[4]);
  px(ctx, 3, 12, y[4]);
}

export function drawCoin(ctx: Ctx, x = 0, y = 0) {
  const g = PAL.yellow;
  ellipse(ctx, x + 2, y + 2, 12, 12, g[1]);
  ellipse(ctx, x + 2, y + 2, 11, 11, g[2]);
  ellipse(ctx, x + 4, y + 4, 8, 8, g[3]);
  ellipse(ctx, x + 5, y + 5, 7, 7, g[2]);
  drawPixelText(ctx, '₹', x + 6, y + 6, g[1]);
  px(ctx, x + 4, y + 4, '#ffffff');
  px(ctx, x + 5, y + 3, g[4]);
  px(ctx, x + 3, y + 5, g[4]);
}

function bubble(ctx: Ctx, fill: string, shade: string) {
  rect(ctx, 3, 1, 10, 11, fill);
  rect(ctx, 2, 2, 12, 9, fill);
  hline(ctx, 3, 11, 10, shade);
  vline(ctx, 13, 2, 9, shade);
  // tail
  rect(ctx, 6, 12, 4, 1, fill);
  rect(ctx, 7, 13, 2, 1, fill);
  px(ctx, 9, 12, shade);
}

function exclaim(ctx: Ctx) {
  bubble(ctx, PAL.yellow[3], PAL.yellow[2]);
  px(ctx, 4, 3, PAL.yellow[4]);
  px(ctx, 3, 4, PAL.yellow[4]);
  rect(ctx, 7, 3, 2, 5, OUTLINE);
  rect(ctx, 7, 9, 2, 1, OUTLINE);
}

function prompt(ctx: Ctx) {
  // key cap with E
  rect(ctx, 3, 1, 10, 10, '#f4efe4');
  rect(ctx, 2, 2, 12, 8, '#f4efe4');
  hline(ctx, 3, 10, 10, '#b4aebb');
  hline(ctx, 2, 9, 12, '#d8d3d6');
  vline(ctx, 13, 2, 8, '#d8d3d6');
  drawPixelText(ctx, 'E', 7, 3, OUTLINE);
  // down arrow
  hline(ctx, 5, 12, 6, PAL.yellow[3]);
  hline(ctx, 6, 13, 4, PAL.yellow[3]);
  hline(ctx, 7, 14, 2, PAL.yellow[2]);
}

function zzz(ctx: Ctx) {
  const c = '#cfe3ff';
  const c2 = '#8fb0e0';
  drawPixelText(ctx, 'Z', 2, 9, c2);
  sprite(ctx, 7, 4, ['####', '..#.', '.#..', '####'], { '#': c });
  sprite(ctx, 10, 0, ['#####', '...#.', '..#..', '.#...', '#####'], { '#': '#ffffff' });
}

const cache = new Map<string, HTMLCanvasElement>();

export function drawFx(key: string): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  let c: HTMLCanvasElement;
  let ctx: Ctx;
  switch (key) {
    case 'shadow': {
      [c, ctx] = makeCanvas(16, 8);
      ctx.fillStyle = 'rgba(27,19,37,0.18)';
      ellipse(ctx, 1, 1, 14, 6, 'rgba(27,19,37,0.16)');
      ellipse(ctx, 2, 1, 12, 5, 'rgba(27,19,37,0.22)');
      ellipse(ctx, 4, 2, 8, 3, 'rgba(27,19,37,0.18)');
      break;
    }
    case 'raindrop': {
      [c, ctx] = makeCanvas(4, 8);
      rect(ctx, 1, 1, 2, 6, 'rgba(160,210,240,0.75)');
      rect(ctx, 1, 1, 1, 3, 'rgba(230,245,255,0.9)');
      break;
    }
    default: {
      [c, ctx] = makeCanvas(16, 16);
      if (key === 'heart') heart(ctx);
      else if (key === 'cloud') cloud(ctx);
      else if (key === 'sparkle') sparkle(ctx);
      else if (key === 'coin') drawCoin(ctx);
      else if (key === 'exclaim') exclaim(ctx);
      else if (key === 'prompt') prompt(ctx);
      else if (key === 'zzz') zzz(ctx);
      else sparkle(ctx);
      outlineOuter(c, OUTLINE, key === 'zzz' ? 0.6 : 0.95);
    }
  }
  cache.set(key, c);
  return c;
}
