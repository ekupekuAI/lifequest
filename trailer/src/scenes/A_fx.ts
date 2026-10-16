// Small shared drawing helpers for S01–S04 (iris, HUD panels, bubbles, flashes).
import { drawPixelText, measurePixelText, prop } from '../lib/art';

/** Iris: black everywhere outside a circle of radius r (screen space). */
export function iris(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, r: number, color = '#000') {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  if (r > 0) {
    // pixel-stepped circle: build from horizontal spans for a crunchy edge
    const step = 4;
    for (let yy = -r; yy < r; yy += step) {
      const hw = Math.sqrt(Math.max(0, r * r - (yy + step / 2) * (yy + step / 2)));
      const q = Math.round(hw / step) * step;
      ctx.moveTo(Math.round(x - q), Math.round(y + yy));
      ctx.lineTo(Math.round(x - q), Math.round(y + yy + step));
      ctx.lineTo(Math.round(x + q), Math.round(y + yy + step));
      ctx.lineTo(Math.round(x + q), Math.round(y + yy));
      ctx.closePath();
    }
  }
  ctx.fill('evenodd');
  ctx.restore();
}

export function flash(ctx: CanvasRenderingContext2D, w: number, h: number, a: number, color = '#fff') {
  if (a <= 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.min(1, a);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Chunky game-UI panel (cream fill, dark outline, drop shadow). Coordinates in current transform. */
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, u = 2, fill = '#fff3dc', edge = '#2a1430') {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  ctx.fillStyle = 'rgba(20,10,30,0.35)';
  ctx.fillRect(x + u, y + u * 2, w, h);
  ctx.fillStyle = edge;
  ctx.fillRect(x + u, y, w - 2 * u, h);
  ctx.fillRect(x, y + u, w, h - 2 * u);
  ctx.fillStyle = fill;
  ctx.fillRect(x + u, y + u, w - 2 * u, h - 2 * u);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(x + 2 * u, y + u, w - 4 * u, u);
  ctx.fillStyle = 'rgba(120,70,60,0.18)';
  ctx.fillRect(x + 2 * u, y + h - 2 * u, w - 4 * u, u);
}

/** Speech bubble with a tail pointing down-left to (tx, ty). */
export function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tx: number, ty: number, u = 1) {
  panel(ctx, x, y, w, h, u);
  ctx.fillStyle = '#2a1430';
  const bx = Math.round(Math.max(x + 4 * u, Math.min(x + w - 10 * u, tx)));
  const by = Math.round(y + h - u);
  // tail outline then fill, stepped
  for (let i = 0; i < 5; i++) ctx.fillRect(bx + (tx < bx ? -i * u : i * u * 0.4), by + i * u, (6 - i) * u + u, u);
  ctx.fillStyle = '#fff3dc';
  for (let i = 0; i < 4; i++) ctx.fillRect(bx + u + (tx < bx ? -i * u : i * u * 0.4), by - u + i * u, (4 - i) * u, u);
  void ty;
}

/** Centered pixel text with a dark drop outline. */
export function outlinedText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, color: string, scale: number, edge = '#2a1430') {
  const w = measurePixelText(text, scale);
  const x = Math.round(cx - w / 2);
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [1, 1],
    [2, 2],
  ])
    drawPixelText(ctx, text, x + dx * scale * 0.5 * 2, y + dy * scale * 0.5 * 2, edge, scale);
  drawPixelText(ctx, text, x, y, color, scale);
  return w;
}

/** Tiny clock HUD: panel + clock prop + time text. */
export function clockHud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, text: string) {
  const tw = measurePixelText(text, s);
  const pw = tw + 22 * s;
  const ph = 13 * s;
  panel(ctx, x - pw, y, pw, ph, s);
  const clk = prop('wall-clock');
  ctx.drawImage(clk, Math.round(x - pw + 3 * s), Math.round(y + 0.5 * s), 12 * s, 12 * s);
  drawPixelText(ctx, text, x - tw - 4 * s, y + 4 * s, '#2a1430', s);
}

/** Pixel phone icon (16x16 design) drawn at scale u centered at (x,y). */
export function phoneIcon(ctx: CanvasRenderingContext2D, x: number, y: number, u: number) {
  const ox = Math.round(x - 5 * u);
  const oy = Math.round(y - 8 * u);
  ctx.fillStyle = '#2a1430';
  ctx.fillRect(ox, oy, 10 * u, 16 * u);
  ctx.fillStyle = '#3d5a80';
  ctx.fillRect(ox + u, oy + u, 8 * u, 14 * u);
  ctx.fillStyle = '#9ad7f0';
  ctx.fillRect(ox + 2 * u, oy + 2 * u, 6 * u, 9 * u);
  ctx.fillStyle = '#e8f8ff';
  ctx.fillRect(ox + 2 * u, oy + 2 * u, 2 * u, 3 * u);
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(ox + 4 * u, oy + 12 * u, 2 * u, 2 * u);
}

/** Pixel shop-front icon. */
export function shopIcon(ctx: CanvasRenderingContext2D, x: number, y: number, u: number) {
  const ox = Math.round(x - 7 * u);
  const oy = Math.round(y - 7 * u);
  ctx.fillStyle = '#2a1430';
  ctx.fillRect(ox, oy + 2 * u, 14 * u, 12 * u);
  ctx.fillStyle = '#fff3dc';
  ctx.fillRect(ox + u, oy + 6 * u, 12 * u, 7 * u);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#fff3dc' : '#e4572e';
    ctx.fillRect(ox + u + i * 2 * u, oy + 3 * u, 2 * u, 3 * u);
  }
  ctx.fillStyle = '#3bb273';
  ctx.fillRect(ox + 5 * u, oy + 8 * u, 4 * u, 5 * u);
  ctx.fillStyle = '#9ad7f0';
  ctx.fillRect(ox + 2 * u, oy + 8 * u, 2 * u, 2 * u);
  ctx.fillRect(ox + 10 * u, oy + 8 * u, 2 * u, 2 * u);
}

let smearTmp: HTMLCanvasElement | null = null;
/** Horizontal smear (motion blur) of the current canvas content: redraw shifted copies. */
export function smear(ctx: CanvasRenderingContext2D, w: number, h: number, dist: number, copies = 5) {
  if (Math.abs(dist) < 1) return;
  const c = ctx.canvas;
  if (!smearTmp) smearTmp = document.createElement('canvas');
  const tmp = smearTmp;
  tmp.width = w;
  tmp.height = h;
  tmp.getContext('2d')!.drawImage(c, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 1; i <= copies; i++) {
    ctx.globalAlpha = 0.5 / i + 0.08;
    ctx.drawImage(tmp, Math.round((dist * i) / copies), 0);
    ctx.drawImage(tmp, Math.round(((-dist * i) / copies) * 0.3), 0);
  }
  ctx.restore();
}
