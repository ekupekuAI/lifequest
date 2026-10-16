// Reusable building blocks for props (3/4 top-down view, top-left light).

import { PAL, OUTLINE, SKY, type Ramp } from './palette';
import { type Ctx, px, rect, hline, vline, ellipse, hash2, mix, dither } from './draw';
import { drawPixelText, measurePixelText } from './pixelFont';

/**
 * Furniture block: lighter top surface (topH rows) and a front face below.
 */
export function block(ctx: Ctx, x: number, y: number, w: number, h: number, topH: number, r: Ramp) {
  rect(ctx, x, y, w, topH, r[3]);
  hline(ctx, x, y, w, r[4]);
  hline(ctx, x, y + topH - 1, w, r[4]);
  rect(ctx, x, y + topH, w, h - topH, r[2]);
  hline(ctx, x, y + topH, w, r[1]);
  vline(ctx, x + w - 1, y + topH, h - topH, r[1]);
  hline(ctx, x, y + h - 1, w, r[1]);
}

/** Wood grain streaks across a rect. */
export function grain(ctx: Ctx, x: number, y: number, w: number, h: number, c: string, seed = 1, density = 0.12) {
  for (let j = 0; j < h; j++) {
    const row = hash2(j, y, seed);
    if (row < 0.4) continue;
    for (let i = 0; i < w; i++) if (hash2(x + i, y + j, seed) < density) px(ctx, x + i, y + j, c);
  }
}

/** A drawer / cabinet door with knob. */
export function drawer(ctx: Ctx, x: number, y: number, w: number, h: number, r: Ramp, knob: string = PAL.yellow[3]) {
  rect(ctx, x, y, w, h, r[2]);
  hline(ctx, x, y, w, r[1]);
  vline(ctx, x, y, h, r[1]);
  hline(ctx, x + 1, y + h - 1, w - 1, r[3]);
  vline(ctx, x + w - 1, y + 1, h - 1, r[3]);
  const kx = x + Math.floor(w / 2);
  const ky = y + Math.floor(h / 2);
  px(ctx, kx, ky, knob);
  if (w > 6) px(ctx, kx - 1, ky, knob);
}

/** Glass pane with diagonal reflections. */
export function glass(ctx: Ctx, x: number, y: number, w: number, h: number, g: Ramp = PAL.glass, lit = false) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let c = j < h / 2 ? g[2] : g[1];
      if (lit) c = j < h / 2 ? '#ffe9a8' : '#f6c870';
      const d = (i + j) % 9;
      if (d === 0 || d === 1) c = lit ? '#fff6d0' : g[3];
      if (d === 1 && j < h / 2) c = lit ? '#ffffff' : g[4];
      px(ctx, x + i, y + j, c);
    }
}

/** Window seen on a facade: frame, sill, panes, optional curtains. */
export function facadeWindow(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: Ramp = PAL.white,
  curtain?: string,
) {
  rect(ctx, x, y, w, h, frame[3]);
  hline(ctx, x, y, w, frame[4]);
  glass(ctx, x + 1, y + 1, w - 2, h - 3);
  vline(ctx, x + Math.floor(w / 2), y + 1, h - 3, frame[2]);
  if (h > 9) hline(ctx, x + 1, y + Math.floor((h - 2) / 2), w - 2, frame[2]);
  if (curtain) {
    vline(ctx, x + 1, y + 1, h - 3, curtain);
    vline(ctx, x + w - 2, y + 1, h - 3, curtain);
    px(ctx, x + 2, y + 1, curtain);
    px(ctx, x + w - 3, y + 1, curtain);
  }
  // sill + shadow
  rect(ctx, x - 1, y + h - 2, w + 2, 2, frame[3]);
  hline(ctx, x - 1, y + h - 1, w + 2, frame[1]);
}

/** Plaster wall with gentle noise; light top-left. */
export function plaster(ctx: Ctx, x: number, y: number, w: number, h: number, r: Ramp, seed = 3) {
  rect(ctx, x, y, w, h, r[2]);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const v = hash2(x + i, y + j, seed);
      if (v < 0.07) px(ctx, x + i, y + j, mix(r[2], r[1], 0.5));
      else if (v > 0.96) px(ctx, x + i, y + j, mix(r[2], r[3], 0.6));
    }
  vline(ctx, x + w - 1, y, h, r[1]);
}

/** Terracotta / slate tiled roof seen from a 3/4 angle (rows of scallops). */
export function tiledRoof(ctx: Ctx, x: number, y: number, w: number, h: number, r: Ramp) {
  rect(ctx, x, y, w, h, r[2]);
  for (let j = 0; j < h; j++) {
    const row = Math.floor(j / 4);
    const inRow = j % 4;
    const off = row % 2 ? 2 : 0;
    for (let i = 0; i < w; i++) {
      const k = (i + off) % 4;
      let c = r[2];
      if (inRow === 0) c = r[3];
      if (inRow === 3) c = r[1];
      if (k === 3 && inRow > 0) c = r[1];
      if (k === 0 && inRow === 1) c = r[4];
      // light falls off toward the bottom (eaves)
      if (j > h - 3 && inRow !== 0) c = mix(c, r[0], 0.3);
      px(ctx, x + i, y + j, c);
    }
  }
  // ridge
  hline(ctx, x, y, w, r[4]);
  hline(ctx, x, y + 1, w, r[3]);
  // eave shadow line
  hline(ctx, x, y + h - 1, w, r[0]);
}

/** Flat concrete roof / parapet seen from above. */
export function flatRoof(ctx: Ctx, x: number, y: number, w: number, h: number, r: Ramp = PAL.stone) {
  rect(ctx, x, y, w, h, r[3]);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) if (hash2(x + i, y + j, 77) < 0.08) px(ctx, x + i, y + j, r[2]);
  // parapet rim
  rect(ctx, x, y, w, 2, r[4]);
  vline(ctx, x, y, h, r[4]);
  vline(ctx, x + w - 1, y, h, r[2]);
  hline(ctx, x, y + h - 2, w, r[4]);
  hline(ctx, x, y + h - 1, w, r[1]);
  // inner shadow
  hline(ctx, x + 1, y + 2, w - 2, r[2]);
  vline(ctx, x + 1, y + 2, h - 4, r[2]);
}

/** Striped awning with scalloped hem. */
export function awning(ctx: Ctx, x: number, y: number, w: number, h: number, a: Ramp, b: Ramp, stripe = 4) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const s = Math.floor(i / stripe) % 2 === 0 ? a : b;
      let c = s[2];
      if (j === 0) c = s[3];
      if (j >= h - 2) c = s[1];
      const t = j / h;
      if (t < 0.35) c = j === 0 ? s[4] : s[3];
      px(ctx, x + i, y + j, c);
    }
  // scallops
  for (let i = 0; i < w; i++) {
    const s = Math.floor(i / stripe) % 2 === 0 ? a : b;
    const k = i % stripe;
    if (k > 0 && k < stripe - 1) px(ctx, x + i, y + h, s[1]);
  }
  // shadow under awning
  for (let i = 0; i < w; i++) px(ctx, x + i, y + h + 1, 'rgba(27,19,37,0.35)');
}

/** Sign board with centred pixel text. */
export function signBoard(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  bg: Ramp,
  text: string,
  fg: string,
  shadow?: string,
) {
  rect(ctx, x, y, w, h, bg[2]);
  hline(ctx, x, y, w, bg[3]);
  hline(ctx, x, y + h - 1, w, bg[0]);
  vline(ctx, x, y, h, bg[3]);
  vline(ctx, x + w - 1, y, h, bg[1]);
  const tw = measurePixelText(text);
  const tx = x + Math.floor((w - tw) / 2);
  const ty = y + Math.floor((h - 5) / 2);
  if (shadow) drawPixelText(ctx, text, tx + 1, ty + 1, shadow);
  drawPixelText(ctx, text, tx, ty, fg);
}

/** Panel door with knob and step. */
export function door(ctx: Ctx, x: number, y: number, w: number, h: number, r: Ramp, knob: string = PAL.yellow[3]) {
  rect(ctx, x - 1, y - 1, w + 2, h + 1, PAL.white[3]); // frame
  hline(ctx, x - 1, y - 1, w + 2, PAL.white[4]);
  rect(ctx, x, y, w, h, r[2]);
  vline(ctx, x, y, h, r[3]);
  vline(ctx, x + w - 1, y, h, r[1]);
  // panels
  const pw = w - 4;
  rect(ctx, x + 2, y + 2, pw, Math.floor(h / 2) - 3, r[1]);
  rect(ctx, x + 3, y + 3, pw - 1, Math.floor(h / 2) - 4, r[2]);
  rect(ctx, x + 2, y + Math.floor(h / 2), pw, Math.floor(h / 2) - 3, r[1]);
  rect(ctx, x + 3, y + Math.floor(h / 2) + 1, pw - 1, Math.floor(h / 2) - 4, r[2]);
  px(ctx, x + w - 3, y + Math.floor(h / 2), knob);
  px(ctx, x + w - 3, y + Math.floor(h / 2) + 1, mix(knob, '#000000', 0.3));
}

/** Leafy canopy blob (cluster of shaded leaf balls). */
export function leafBall(ctx: Ctx, x: number, y: number, w: number, h: number, l: Ramp = PAL.leaf, seed = 1) {
  ellipse(ctx, x, y + 1, w, h, l[0]);
  ellipse(ctx, x, y, w, h - 1, l[1]);
  ellipse(ctx, x + 1, y, w - 3, h - 3, l[2]);
  ellipse(ctx, x + 2, y + 1, Math.max(2, Math.floor(w / 2)), Math.max(2, Math.floor(h / 2) - 1), l[3]);
  // leaf texture
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const v = hash2(x + i, y + j, seed);
      const d = ((i - w / 2) / (w / 2)) ** 2 + ((j - h / 2) / (h / 2)) ** 2;
      if (d > 0.8) continue;
      if (v < 0.08) px(ctx, x + i, y + j, l[1]);
      else if (v > 0.93 && j < h * 0.6) px(ctx, x + i, y + j, l[4]);
    }
}

/** Potted plant (pot w = 6). */
export function pottedPlant(ctx: Ctx, x: number, y: number, flower?: string) {
  leafBall(ctx, x - 1, y, 8, 6, PAL.leaf, x * 7 + y);
  if (flower) {
    px(ctx, x + 1, y + 1, flower);
    px(ctx, x + 4, y + 2, flower);
  }
  rect(ctx, x, y + 5, 6, 4, PAL.terra[2]);
  hline(ctx, x, y + 5, 6, PAL.terra[3]);
  vline(ctx, x + 5, y + 5, 4, PAL.terra[1]);
  hline(ctx, x + 1, y + 8, 4, PAL.terra[1]);
}

/** Soft ground shadow (semi-transparent) under a prop. */
export function groundShadow(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ellipse(ctx, x, y, w, h, 'rgba(27,19,37,0.22)');
}

/** Book spines on a shelf row. */
export function books(ctx: Ctx, x: number, y: number, w: number, h: number, seed: number, fill = 1) {
  const cols = [PAL.red, PAL.blue, PAL.green, PAL.yellow, PAL.purple, PAL.teal, PAL.orange];
  let i = 0;
  while (i < w) {
    const v = hash2(i, seed, 5);
    const bw = v < 0.4 ? 1 : 2;
    if (hash2(i, seed, 9) > fill) {
      i += bw + 1;
      continue;
    }
    const c = cols[Math.floor(hash2(i, seed, 3) * cols.length)];
    const bh = h - (hash2(i, seed, 4) < 0.3 ? 1 : 0);
    rect(ctx, x + i, y + h - bh, Math.min(bw, w - i), bh, c[2]);
    px(ctx, x + i, y + h - bh, c[3]);
    if (bw === 2 && i + 1 < w) vline(ctx, x + i + 1, y + h - bh, bh, c[1]);
    if (bh > 3) px(ctx, x + i, y + h - bh + 2, c[4]);
    i += bw;
  }
}

/** Evening sky gradient with a couple of stars / clouds, dithered. */
export function eveningSky(ctx: Ctx, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++) {
    const t = (j / Math.max(1, h - 1)) * (SKY.length - 1);
    const k = Math.floor(t);
    const f = t - k;
    for (let i = 0; i < w; i++) {
      const c = dither(x + i, y + j, f) ? SKY[Math.min(SKY.length - 1, k + 1)] : SKY[k];
      px(ctx, x + i, y + j, c);
    }
  }
}

export { OUTLINE };
