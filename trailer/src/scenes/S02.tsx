// S02 · THE ASK (abs 120–270) — chunky kitchen close-up. Mum turns from the stove,
// a speech bubble fills with the shopping list in sync with her line, coins rain
// into the player's hands (₹150), then the list whooshes into camera → white flash.
import { AbsoluteFill } from 'remotion';
import { PixelCanvas, camera, prog, EASE, lerp, glow, rand, clamp, type DrawInfo } from '../lib/stage';
import { drawChar, drawPropAt, drawIcon, fillTiles, item, fx, prop, drawPixelText, measurePixelText, type Dir } from '../lib/art';
import { CUES } from '../timeline';
import { iris, flash, panel } from './A_fx';

const FROM = 120;
const LINE = CUES.momLine - FROM; // 20
const COIN = CUES.coinDrop - FROM; // 108

// ---------- room (cached) ----------
const ROOM_W = 26 * 16;
let roomCache: HTMLCanvasElement | null = null;
function room() {
  if (roomCache) return roomCache;
  const c = document.createElement('canvas');
  c.width = ROOM_W;
  c.height = 12 * 16;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  fillTiles(g, 'wallTop', 0, 0, 26, 1);
  fillTiles(g, 'wallFace', 0, 16, 26, 2);
  fillTiles(g, 'kitchen', 0, 48, 21, 9);
  fillTiles(g, 'wood', 21 * 16, 48, 5, 9);
  fillTiles(g, 'rug', 22 * 16, 96, 3, 3);
  // skirting line
  g.fillStyle = 'rgba(60,30,40,0.35)';
  g.fillRect(0, 47, ROOM_W, 2);
  roomCache = c;
  return c;
}

const MUM = { x: 140, y: 80 };

function mumDir(f: number): Dir {
  if (f < LINE - 3) return 'up';
  if (f < LINE + 1) return 'right';
  return 'down';
}

const ICONS: { at: number; draw: (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => void }[] = [
  { at: 30, draw: (c, x, y, s) => drawIcon(c, item('milk-packet'), x, y, s) },
  { at: 45, draw: (c, x, y, s) => drawIcon(c, item('tomato'), x, y, s) },
  { at: 52, draw: (c, x, y, s) => drawIcon(c, item('tomato'), x, y, s) },
  { at: 62, draw: (c, x, y, s) => drawIcon(c, item('potatoes'), x, y, s) },
  {
    at: 72,
    draw: (c, x, y, s) => {
      const clk = prop('wall-clock');
      c.drawImage(clk, Math.round(x - 6 * s), Math.round(y - 6 * s), Math.round(12 * s), Math.round(12 * s));
    },
  },
];

const draw = (ctx: CanvasRenderingContext2D, { w, h, frame: f }: DrawInfo) => {
  // camera: slow dolly-in on Mum, gentle drift; slight push toward player when coins drop
  const drift = prog(f, 0, 150, EASE.inOut);
  const coinPush = prog(f, COIN - 6, COIN + 20, EASE.out);
  const cx = lerp(146, 158, drift) - coinPush * 8;
  const cy = lerp(68, 72, drift) + coinPush * 3;
  const z = lerp(3.1, 3.4, drift) + coinPush * 0.1;
  camera(ctx, w, h, cx, cy, z);

  ctx.drawImage(room(), -48, 0);
  // wall dressing
  drawPropAt(ctx, 'window', 96, 40);
  drawPropAt(ctx, 'window', 232, 40);
  drawPropAt(ctx, 'wall-clock', 190, 34);
  drawPropAt(ctx, 'picture', 300, 38);
  // window sky (golden) peeking through panes
  for (const wx of [96, 232]) glow(ctx, wx, 32, 14, '#ffc070', 0.55);

  // counters along the wall
  drawPropAt(ctx, 'fridge', 48, 54);
  drawPropAt(ctx, 'counter', 72, 54);
  drawPropAt(ctx, 'sink', 96, 54);
  drawPropAt(ctx, 'counter', 112, 54);
  drawPropAt(ctx, 'stove-pot', 140, 54);
  drawPropAt(ctx, 'counter', 156, 54);
  drawPropAt(ctx, 'counter', 172, 54);
  drawPropAt(ctx, 'plant', 268, 54);
  drawPropAt(ctx, 'table-set', 246, 124);
  drawPropAt(ctx, 'plant', 20, 54);
  drawPropAt(ctx, 'chopping-board', 172, 34);

  // window light shafts across the floor (additive)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [wx, a] of [
    [96, 0.13],
    [232, 0.11],
  ] as const) {
    ctx.globalAlpha = a * (0.9 + 0.1 * Math.sin(f / 11 + wx));
    ctx.fillStyle = '#ffcf8a';
    ctx.beginPath();
    ctx.moveTo(wx - 8, 46);
    ctx.lineTo(wx + 8, 46);
    ctx.lineTo(wx + 44, 150);
    ctx.lineTo(wx + 18, 150);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // dust motes in the light
  for (let i = 0; i < 26; i++) {
    const t = f + i * 17;
    const x = 96 + rand(i, 1) * 60 + Math.sin(t / 23 + i) * 4 + (rand(i, 2) * 100 > 50 ? 136 : 0);
    const y = 50 + ((rand(i, 3) * 100 + t * 0.15) % 100);
    ctx.fillStyle = `rgba(255,240,200,${(0.35 + 0.35 * Math.sin(t / 6)).toFixed(2)})`;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  // steam from the pot (rising, drifting)
  for (let i = 0; i < 4; i++) {
    const p = ((f + i * 12) % 48) / 48;
    const sx = 140 + Math.sin(p * 6 + i) * 3 + i * 1.5 - 3;
    const sy = 26 - p * 26;
    drawIcon(ctx, fx('steam'), sx, sy, 0.6 + p * 0.6, (1 - p) * 0.8);
  }
  glow(ctx, 140, 44, 10, '#6ab0ff', 0.25 + 0.1 * Math.sin(f / 2));

  // Mum: back turned at the stove, turns on her line; little talk bob while speaking
  const talking = f >= LINE && f < LINE + 66;
  const bob = talking && Math.floor(f / 4) % 2 === 0 ? 1 : 0;
  const turnHop = f >= LINE - 3 && f < LINE + 3 ? -1 : 0;
  drawChar(ctx, 'mom', MUM.x, MUM.y + turnHop + bob, mumDir(f), 0, false, 1);
  if (talking) {
    // little speech ticks beside her head, flickering with the syllables
    const on = Math.floor(f / 3) % 3;
    ctx.fillStyle = '#fff3dc';
    if (on !== 2) {
      ctx.fillRect(MUM.x - 13, MUM.y - 22, 3, 1);
      ctx.fillRect(MUM.x - 12, MUM.y - 26, 2, 1);
      ctx.fillRect(MUM.x - 12, MUM.y - 18, 2, 1);
    }
  }
  // heart when she finishes asking
  if (f > LINE + 66 && f < LINE + 96) {
    const p = (f - LINE - 66) / 30;
    drawIcon(ctx, fx('heart'), MUM.x + 9, MUM.y - 28 - p * 10, 0.7, 1 - p);
  }

  // warm grade
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffb27a';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // ---------- foreground: the player (bigger, closer, slight parallax) ----------
  const fz = z * 1.32;
  const px = w * 0.3 + (158 - cx) * z * 0.25;
  const py = h - 104 + (cy - 72) * z * 0.3;
  ctx.setTransform(fz, 0, 0, fz, Math.round(px), Math.round(py));
  // nod: two dips after the list is complete
  const nod = (f >= 78 && f < 82) || (f >= 86 && f < 90) ? 1 : 0;
  const receive = f >= COIN && f < COIN + 6 ? 1 : 0;
  drawChar(ctx, 'player', 0, nod + receive, 'up', 0, false, 1);
  // rim light on the foreground figure (from the window)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  glow(ctx, px - 40, py - 120, 70, '#ffb060', 0.18);

  // ---------- speech bubble (screen space, pops in on the line) ----------
  const mumS = { x: w / 2 + (MUM.x - cx) * z, y: h / 2 + (MUM.y - 28 - cy) * z };
  const bIn = prog(f, LINE + 4, LINE + 12, EASE.back);
  // exit: list whooshes toward camera
  const ex = prog(f, 116, 146, EASE.in);
  if (f >= LINE + 4) {
    const s = 3;
    const icons = ICONS.filter((ic) => f >= ic.at);
    const bw = 5 * 16 * s + 4 * 6 + 28;
    const bh = 16 * s + 26;
    const bx0 = mumS.x + 6;
    const by0 = Math.max(78, mumS.y - bh - 12);
    ctx.save();
    // scale about bubble centre
    const bcx = bx0 + bw / 2;
    const bcy = by0 + bh / 2;
    const sc = Math.max(0.01, bIn) * (1 + ex * 6.5);
    const tx = lerp(bcx, w / 2, ex);
    const ty = lerp(bcy, h / 2, ex);
    ctx.translate(tx, ty);
    ctx.rotate(-0.05 * ex + Math.sin(f / 9) * 0.01 * (1 - ex));
    ctx.scale(sc, sc);
    ctx.translate(-bcx, -bcy + Math.sin(f / 7) * 2 * (1 - ex));
    // panel + tail toward Mum
    panel(ctx, bx0, by0, bw, bh, 4);
    ctx.fillStyle = '#2a1430';
    for (let i = 0; i < 5; i++) ctx.fillRect(Math.round(bx0 + 14 - i * 5), Math.round(by0 + bh - 4 + i * 4), 22 - i * 3, 4);
    ctx.fillStyle = '#fff3dc';
    for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(bx0 + 18 - i * 5), Math.round(by0 + bh - 6 + i * 4), 14 - i * 3, 4);
    icons.forEach((ic, i) => {
      const p = prog(f, ic.at, ic.at + 7, EASE.back);
      const ixx = bx0 + 14 + 8 + i * (16 * s + 6) + 8 * s;
      const iyy = by0 + bh / 2 + (1 - p) * 10;
      ctx.save();
      ctx.translate(ixx, iyy);
      ctx.scale(p, p);
      ic.draw(ctx, 0, 0, s);
      ctx.restore();
      // pop sparkle
      if (f - ic.at < 6) drawIcon(ctx, fx('sparkle'), ixx + 20, iyy - 20, 1.5, 1 - (f - ic.at) / 6);
    });
    ctx.restore();
    // speed streaks while it rushes at camera
    if (ex > 0.05) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,243,220,${(ex * 0.8).toFixed(2)})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < 26; i++) {
        const a = rand(i, 77) * Math.PI * 2;
        const r0 = 60 + rand(i, 78) * 120 + ex * 300;
        const r1 = r0 + 40 + ex * 220;
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0);
        ctx.lineTo(w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---------- coins rain into the player's hands ----------
  if (f >= COIN - 10) {
    const handX = px + 2 * fz;
    const handY = py - 30 * fz;
    for (let i = 0; i < 12; i++) {
      const t0 = COIN - 10 + i * 1.6;
      const p = clamp((f - t0) / 9);
      if (f < t0 || p >= 1) continue;
      const sx = handX + (rand(i, 5) - 0.5) * 50;
      const sy = lerp(60, handY, EASE.in(p));
      drawIcon(ctx, fx('coin'), lerp(sx, handX, p * p), sy, 2, 1);
    }
    if (f >= COIN) {
      const p = prog(f, COIN, COIN + 8, EASE.back);
      const fade = clamp(1 - ex * 4);
      drawIcon(ctx, item('coins'), handX, handY - 6 - p * 8, 3 * p, fade);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + f / 10;
        const r = 30 + (f - COIN) * 1.5;
        if (f - COIN < 22) drawIcon(ctx, fx('sparkle'), handX + Math.cos(a) * r, handY - 10 + Math.sin(a) * r * 0.7, 1.6, 1 - (f - COIN) / 22);
      }
      // ₹150 counter punch
      const q = prog(f, COIN + 2, COIN + 10, EASE.back);
      const txt = '₹150';
      const ts = 5;
      const tw = measurePixelText(txt, ts);
      const cxp = handX + 250;
      const cyp = handY + 90;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(cxp, cyp);
      ctx.scale(q * (1 + 0.15 * Math.max(0, 1 - (f - COIN - 8) / 6)), q);
      panel(ctx, -tw / 2 - 16, -22, tw + 32, 44, 4, '#2a1430', '#f2c14e');
      drawPixelText(ctx, txt, -tw / 2, -12, '#f2c14e', ts);
      ctx.restore();
    }
  }

  // iris open from S01
  if (f < 14) iris(ctx, w, h, w / 2, h / 2 - 20, lerp(0, 640, prog(f, 0, 14, EASE.out)));
  // white flash into the cut
  flash(ctx, w, h, prog(f, 136, 149, EASE.in), '#fff8ec');
};

export default function S02() {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <PixelCanvas scale={2} draw={draw} />
    </AbsoluteFill>
  );
}
