// Shared helpers for scenes S05–S07 (queue, storm/bus, chaos montage).
import { CAST, drawChar, drawIcon, fx, drawPixelText, measurePixelText, type Dir } from '../lib/art';
import { rand, clamp, lerp, EASE } from '../lib/stage';

export type Ctx = CanvasRenderingContext2D;

/** Reset to screen space (identity transform). */
export const screen = (ctx: Ctx) => ctx.setTransform(1, 0, 0, 1, 0, 0);

/** 0 before start, overshooting pop 0→1 over dur frames. */
export const popIn = (f: number, start: number, dur = 9) => (f < start ? 0 : EASE.back(clamp((f - start) / dur)));

/** Piecewise-linear keyframe lookup with per-segment easing. keys: [frame, value][] */
export function keys(f: number, k: [number, number][], ease: (t: number) => number = EASE.inOut) {
  if (f <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (f <= k[i][0]) {
      const [f0, v0] = k[i - 1];
      const [f1, v1] = k[i];
      return lerp(v0, v1, ease((f - f0) / Math.max(1, f1 - f0)));
    }
  }
  return k[k.length - 1][1];
}

/** Full-screen flash. */
export function flash(ctx: Ctx, w: number, h: number, a: number, color = '#ffffff') {
  if (a <= 0) return;
  ctx.save();
  screen(ctx);
  ctx.globalAlpha = clamp(a);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** An fx sprite that pops in, floats up and fades out. */
export function fxPop(ctx: Ctx, key: string, x: number, y: number, f: number, start: number, life = 30, scale = 1, rise = 8) {
  const t = f - start;
  if (t < 0 || t > life) return;
  const s = popIn(f, start, 8) * scale;
  const a = t > life - 8 ? (life - t) / 8 : 1;
  const bob = Math.round(-rise * (t / life));
  drawIcon(ctx, fx(key), x, y + bob, s, a);
}

/** Pixel speech bubble with a single glyph (?, !). */
export function glyphBubble(ctx: Ctx, x: number, y: number, s: number, glyph: string, color = '#1b1325') {
  if (s <= 0.01) return;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(s, s);
  ctx.fillStyle = '#1b1325';
  ctx.fillRect(-7, -9, 14, 13);
  ctx.fillRect(-6, -10, 12, 15);
  ctx.fillRect(-1, 4, 3, 3);
  ctx.fillStyle = '#fff8e8';
  ctx.fillRect(-6, -9, 12, 13);
  ctx.fillRect(0, 4, 1, 2);
  ctx.fillStyle = color;
  drawPixelText(ctx, glyph, -Math.floor(measurePixelText(glyph, 2) / 2), -8, color, 2);
  ctx.restore();
}

/** Raised hands (two skin-coloured mitts) for a character drawn at (x, y) bottom-centre. */
export function hands(ctx: Ctx, who: string, x: number, y: number, scale = 1, mode: 'up' | 'right' | 'left' = 'up', wiggle = 0) {
  const skin = CAST[who].a.skin;
  ctx.fillStyle = skin;
  const p = (dx: number, dy: number) => {
    ctx.fillRect(Math.round(x + dx * scale), Math.round(y + dy * scale), 2 * scale, 2 * scale);
    ctx.fillStyle = 'rgba(27,19,37,0.35)';
    ctx.fillRect(Math.round(x + dx * scale), Math.round(y + (dy + 2) * scale), 2 * scale, scale);
    ctx.fillStyle = skin;
  };
  if (mode === 'up') {
    p(-8, -19 + wiggle);
    p(6, -19 - wiggle);
  } else if (mode === 'right') p(7, -12 + wiggle);
  else p(-9, -12 + wiggle);
}

/** Draw a character plus after-image ghosts from a position function. */
export function charGhosts(ctx: Ctx, who: string, pos: (f: number) => { x: number; y: number }, f: number, dir: Dir, n = 3, gap = 2, alpha = 0.35) {
  for (let i = n; i >= 1; i--) {
    const p = pos(f - i * gap);
    ctx.save();
    ctx.globalAlpha = alpha * (1 - i / (n + 1));
    drawChar(ctx, who, p.x, p.y, dir, (f - i * gap) / 3, true);
    ctx.restore();
  }
}

/** Horizontal speed lines in screen space. */
export function speedLines(ctx: Ctx, w: number, h: number, frame: number, alpha = 0.25, count = 26, color = '255,255,255', speed = 40) {
  ctx.save();
  screen(ctx);
  for (let i = 0; i < count; i++) {
    const len = 20 + rand(i, 3) * 70;
    const y = Math.floor(rand(i, 4) * h);
    const x = ((rand(i, 5) * (w + 200) - frame * speed * (0.6 + rand(i, 6))) % (w + 200) + w + 200) % (w + 200) - 100;
    ctx.fillStyle = `rgba(${color},${alpha * (0.4 + rand(i, 8) * 0.6)})`;
    ctx.fillRect(Math.round(x), y, Math.round(len), 1);
  }
  ctx.restore();
}

/** Pixel ring (stroked circle) */
export function ring(ctx: Ctx, x: number, y: number, r: number, color: string, width = 2, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), Math.max(0.5, r), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Radial burst lines (manga impact) around a point. */
export function burst(ctx: Ctx, x: number, y: number, r0: number, r1: number, n: number, color: string, alpha = 1, seed = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(i, seed) * 0.3;
    const rr = r0 + rand(i, seed, 2) * (r1 - r0) * 0.3;
    ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
  }
  ctx.stroke();
  ctx.restore();
}

/** VHS-ish scanlines over the frame. */
export function scanlines(ctx: Ctx, w: number, h: number, alpha = 0.12, offset = 0) {
  ctx.save();
  screen(ctx);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = offset % 2; y < h; y += 2) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}

/** Simple pixel umbrella, bottom of handle at (x, y). open: 0..1+ (scale of canopy). */
export function drawUmbrella(ctx: Ctx, x: number, y: number, open: number, tilt = 0) {
  const R = 15;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(tilt);
  // handle
  ctx.fillStyle = '#3a2a1e';
  ctx.fillRect(0, -26, 1, 26);
  ctx.fillRect(-2, -1, 2, 1);
  ctx.fillRect(-3, -3, 1, 2);
  if (open > 0.02) {
    ctx.translate(0, -26);
    ctx.scale(clamp(open, 0, 1.4), clamp(open, 0, 1.4) * (0.75 + 0.25 * Math.min(1, open)));
    const cols = ['#e4572e', '#f2c14e'];
    for (let row = 0; row <= 9; row++) {
      const yy = -10 + row;
      const half = Math.round(Math.sqrt(Math.max(0, 1 - ((9 - row) / 10) ** 2)) * R);
      for (let xx = -half; xx < half; xx++) {
        const seg = Math.floor((xx + R) / 6) % 2;
        ctx.fillStyle = row === 0 || xx === -half || xx === half - 1 ? '#7a2418' : cols[seg];
        if (row < 3 && xx > -half + 2 && xx < -half + 7) ctx.fillStyle = '#ffd9b0';
        ctx.fillRect(xx, yy, 1, 1);
      }
    }
    // scalloped rim
    for (let xx = -R; xx < R; xx += 6) {
      const seg = Math.floor((xx + R) / 6) % 2;
      ctx.fillStyle = cols[seg];
      ctx.fillRect(xx + 1, 0, 4, 1);
      ctx.fillStyle = '#7a2418';
      ctx.fillRect(xx + 2, 1, 2, 1);
    }
    ctx.fillStyle = '#3a2a1e';
    ctx.fillRect(0, -12, 1, 2);
  }
  ctx.restore();
}

/** Destination-sign board (dark LED panel with amber text) centred at x, top y. */
export function signBoard(ctx: Ctx, text: string, cx: number, y: number, color = '#ffb43a', scale = 1) {
  const tw = measurePixelText(text, scale);
  ctx.fillStyle = '#14121e';
  ctx.fillRect(Math.round(cx - tw / 2 - 3 * scale), y, tw + 6 * scale, 9 * scale);
  ctx.fillStyle = '#2b2838';
  ctx.fillRect(Math.round(cx - tw / 2 - 2 * scale), y + scale, tw + 4 * scale, 7 * scale);
  drawPixelText(ctx, text, Math.round(cx - tw / 2), y + 2 * scale, color, scale);
}

/** Punch-in on a cut: returns zoom multiplier and shake for shot-local frame s. */
export function punch(s: number, amt = 0.35, dur = 9) {
  const p = clamp(s / dur);
  return { zoom: 1 + amt * (1 - EASE.out(p)), shake: s < dur ? 3 * (1 - p) : 0 };
}
