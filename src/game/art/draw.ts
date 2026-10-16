// Low-level pixel drawing helpers shared by every art module.
// Framework-agnostic: only HTMLCanvasElement / CanvasRenderingContext2D.

import { OUTLINE, type Ramp } from './palette';

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

// ---------------------------------------------------------------- random ---

/** mulberry32 seeded PRNG -> [0,1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable per-pixel hash -> [0,1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export function strSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Ordered dither test: true when value (0..1) beats the Bayer threshold. */
export function dither(x: number, y: number, v: number): boolean {
  return v * 16 > BAYER4[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5;
}

// ------------------------------------------------------------ primitives ---

export function px(ctx: Ctx, x: number, y: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, 1, 1);
}

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

export function hline(ctx: Ctx, x: number, y: number, w: number, c: string) {
  rect(ctx, x, y, w, 1, c);
}

export function vline(ctx: Ctx, x: number, y: number, h: number, c: string) {
  rect(ctx, x, y, 1, h, c);
}

/** Pixel-perfect filled ellipse inside the box (x,y,w,h). */
export function ellipse(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  ctx.fillStyle = c;
  for (let j = 0; j < h; j++) {
    const dy = (y + j + 0.5 - cy) / ry;
    const span = Math.sqrt(Math.max(0, 1 - dy * dy)) * rx;
    const x0 = Math.round(cx - span);
    const x1 = Math.round(cx + span);
    if (x1 > x0) ctx.fillRect(x0, y + j, x1 - x0, 1);
  }
}

/** Rounded rectangle with 1px clipped corners. */
export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string, r = 1) {
  if (r <= 0) return rect(ctx, x, y, w, h, c);
  rect(ctx, x + r, y, w - 2 * r, h, c);
  rect(ctx, x, y + r, w, h - 2 * r, c);
  if (r >= 2) {
    rect(ctx, x + 1, y + 1, w - 2, h - 2, c);
  }
}

export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, c: string) {
  // Bresenham
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = c;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Draw a bitmap from strings; each char maps to a colour via `map` ('.'/' ' = skip). */
export function sprite(ctx: Ctx, x: number, y: number, rows: string[], map: Record<string, string>) {
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    for (let i = 0; i < r.length; i++) {
      const ch = r[i];
      const col = map[ch];
      if (col) px(ctx, x + i, y + j, col);
    }
  }
}

/**
 * Shaded box with top-left light: base fill, light top & left edges,
 * dark bottom & right edges.
 */
export function bevel(ctx: Ctx, x: number, y: number, w: number, h: number, r: Ramp, mid = 2) {
  rect(ctx, x, y, w, h, r[mid]);
  hline(ctx, x, y, w, r[Math.min(4, mid + 1)]);
  vline(ctx, x, y, h, r[Math.min(4, mid + 1)]);
  hline(ctx, x, y + h - 1, w, r[Math.max(0, mid - 1)]);
  vline(ctx, x + w - 1, y, h, r[Math.max(0, mid - 1)]);
}

/** Speckle noise over a rect using a ramp tone. */
export function speckle(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  c: string,
  density: number,
  seed: number,
) {
  ctx.fillStyle = c;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) if (hash2(x + i, y + j, seed) < density) ctx.fillRect(x + i, y + j, 1, 1);
}

// --------------------------------------------------------------- outline ---

function parseColor(c: string): [number, number, number] {
  const [r, g, b] = hexToRgb(c);
  return [r, g, b];
}

/**
 * Outline post-process (outer): every transparent pixel 4-adjacent to an
 * opaque one becomes the outline colour. Needs 1px padding around content.
 */
export function outlineOuter(canvas: HTMLCanvasElement, color = OUTLINE, alpha = 0.9) {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  const [r, g, b] = parseColor(color);
  const a = Math.round(alpha * 255);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (src[i]) continue;
      if (
        (x > 0 && src[i - 1]) ||
        (x < w - 1 && src[i + 1]) ||
        (y > 0 && src[i - w]) ||
        (y < h - 1 && src[i + w])
      ) {
        d[i * 4] = r;
        d[i * 4 + 1] = g;
        d[i * 4 + 2] = b;
        d[i * 4 + 3] = a;
      }
    }
  ctx.putImageData(img, 0, 0);
}

/**
 * Outline post-process (inner): every opaque pixel that touches a transparent
 * pixel or the canvas edge (4-adjacent) becomes the outline colour.
 * Keeps sprites inside their bounds.
 */
export function outlineInner(canvas: HTMLCanvasElement, color = OUTLINE, edges = true) {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3] > 100 ? 1 : 0;
  const [r, g, b] = parseColor(color);
  const op = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? (edges ? 0 : 1) : src[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!src[i]) continue;
      if (!op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1)) {
        d[i * 4] = r;
        d[i * 4 + 1] = g;
        d[i * 4 + 2] = b;
        d[i * 4 + 3] = 255;
      }
    }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- colour ---

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function hueToward(h: number, target: number, amt: number): number {
  let d = target - h;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
}

/**
 * Hue-shifted shade. step < 0 darkens (toward cool purple), step > 0 lightens
 * (toward warm yellow). Each step ~ 11% lightness.
 */
export function shade(hex: string, step: number): string {
  if (step === 0) return hex;
  const [r, g, b] = hexToRgb(hex);
  let [h, s, l] = rgbToHsl(r, g, b);
  const lowSat = s < 0.08;
  if (step < 0) {
    if (!lowSat) h = hueToward(h, 255, 9 * -step);
    else {
      h = 260;
      s = 0.12;
    }
    l = l + step * 0.12;
    s = Math.min(1, s + 0.04 * -step);
  } else {
    if (!lowSat) h = hueToward(h, 50, 6 * step);
    l = l + step * 0.1 * (1 - l * 0.4);
    s = Math.max(0, s - 0.03 * step);
  }
  l = Math.max(0.04, Math.min(0.97, l));
  return rgbToHex(...hslToRgb(h, s, l));
}

/** Build a 5-tone ramp (darkest -> lightest) around a base colour at index 2. */
export function ramp(hex: string): Ramp {
  return [shade(hex, -2), shade(hex, -1), hex, shade(hex, 1), shade(hex, 2)] as const;
}

/** Scale a canvas by an integer factor with nearest-neighbour. */
export function scaled(src: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(src.width * scale, src.height * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
