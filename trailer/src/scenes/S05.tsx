// S05 — THE QUEUE (abs 600–780). FreshMart checkout: a long line, a fast-forward,
// a line-cutter, an act of kindness (heart pop) and the till ringing up.
import { AbsoluteFill } from 'remotion';
import { PixelCanvas, camera, grade, glow, rand, clamp, lerp, prog, EASE, type DrawInfo } from '../lib/stage';
import { drawChar, drawPropAt, drawIcon, fillTiles, fx, item, type Dir } from '../lib/art';
import { CUES, SCENES } from '../timeline';
import { type Ctx, screen, keys, popIn, fxPop, hands, speedLines, scanlines, flash, burst, ring } from './B_kit';

const FROM = SCENES[4].from; // 600
const FF = CUES.queueFastForward - FROM; // 60
const HEART = CUES.heartPop - FROM; // 135
const TILL = 150;

const CX = 300; // checkout centre x (world)
const COUNTER_Y = 172; // checkout bottom
const LINE_Y = 188;
const slotX = (k: number) => 286 - k * 20;
const LINE = ['folk3', 'folk0', 'folk5', 'folk2', 'folk4', 'folk7', 'player'];
const SERVES = [FF + 3, FF + 10, FF + 17]; // three customers served during fast-forward
const SERVE_DUR = 6;
const DASH0 = 84;
const DASH1 = 95;

const served = (f: number) => SERVES.reduce((a, s) => a + EASE.inOut(clamp((f - s) / SERVE_DUR)), 0);
const cutShift = (f: number) => EASE.out(clamp((f - DASH1) / 6));

/** queue position (in slots) of line member i at frame f; negative → leaving past the till */
function queuePos(i: number, f: number) {
  let q = i - served(f);
  if (i >= SERVES.length) q += cutShift(f);
  return q;
}

function linePos(i: number, f: number): { x: number; y: number } {
  const who = LINE[i];
  if (who === 'player') return playerPos(f);
  const q = queuePos(i, f);
  if (q >= 0) return { x: slotX(q), y: LINE_Y };
  // served: walk on past the till and out of the shop
  const t = f - SERVES[i];
  return { x: slotX(0) + t * 7, y: LINE_Y + Math.min(12, t * 1.2) };
}

function playerPos(f: number): { x: number; y: number } {
  const base = slotX(queuePos(6, f));
  if (f < 113) return { x: base, y: LINE_Y };
  // step aside (down/right) to let the elder pass, then fall in behind her
  const a = EASE.out(clamp((f - 113) / 8));
  const b = EASE.inOut(clamp((f - 138) / 10));
  const x = lerp(lerp(206, 212, a), slotX(5), b);
  const y = lerp(lerp(LINE_Y, LINE_Y + 10, a), LINE_Y, b);
  return { x, y };
}

function elderPos(f: number) {
  const x = keys(f, [
    [94, 96],
    [118, 186],
    [122, 186],
    [134, 206],
  ], (t) => t);
  return { x, y: LINE_Y };
}

function cutterPos(f: number) {
  if (f < DASH1) return { x: lerp(20, slotX(0) + 6, clamp((f - DASH0) / (DASH1 - DASH0))), y: LINE_Y + 12 };
  const t = EASE.out(clamp((f - DASH1) / 5));
  return { x: lerp(slotX(0) + 6, slotX(0), t), y: lerp(LINE_Y + 12, LINE_Y, t) };
}

// ---------- environment ----------
function drawStore(ctx: Ctx, f: number, flick: number) {
  // ceiling + back wall
  ctx.fillStyle = '#2a2236';
  ctx.fillRect(-200, -100, 900, 150);
  fillTiles(ctx, 'wallTop', -192, 48, 52, 1);
  fillTiles(ctx, 'wallFace', -192, 64, 52, 4);
  // store floor
  fillTiles(ctx, 'storeFloor', -192, 128, 52, 12);
  // FreshMart banner + produce along the wall
  ctx.fillStyle = '#3bb273';
  ctx.fillRect(-200, 66, 900, 6);
  ctx.fillStyle = '#2a8a56';
  ctx.fillRect(-200, 71, 900, 1);
  const shelves = ['shelf-veg', 'shelf-dairy', 'shelf-snacks', 'shelf-bakery', 'shelf-veg', 'shelf-snacks'];
  shelves.forEach((s, i) => drawPropAt(ctx, s, -40 + i * 58, 136));
  drawPropAt(ctx, 'store-banner', 380, 100);
  drawPropAt(ctx, 'basket-stack', 236, 150);
  drawPropAt(ctx, 'queue-sign', 120, 168);
  // fluorescent ceiling strips
  for (let i = 0; i < 7; i++) {
    const lx = -60 + i * 90;
    const on = flick * (i === 3 && f % 23 < 2 ? 0.4 : 1);
    ctx.fillStyle = on > 0.6 ? '#fff6d8' : '#8a8478';
    ctx.fillRect(lx - 14, 50, 28, 3);
  }
  // wall clock (big pixel clock above the till)
  drawClock(ctx, 346, 112, f);
}

function clockAngle(f: number) {
  // slow tick, then 5 full spins during fast-forward
  const spin = prog(f, FF, FF + 26, EASE.inOut) * Math.PI * 2 * 5;
  return -Math.PI / 2 + f * 0.012 + spin;
}

function drawClock(ctx: Ctx, x: number, y: number, f: number) {
  const r = 11;
  ctx.fillStyle = '#1b1325';
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(x, y, r + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff8e8';
  ctx.beginPath();
  ctx.arc(x, y, r - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b1325';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillRect(Math.round(x + Math.cos(a) * (r - 3)), Math.round(y + Math.sin(a) * (r - 3)), 1, 1);
  }
  const m = clockAngle(f);
  const hh = -Math.PI / 2 + (m + Math.PI / 2) / 12 + 1.2;
  const hand = (a: number, len: number, col: string, wdt: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = wdt;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + 0.5);
    ctx.lineTo(x + 0.5 + Math.cos(a) * len, y + 0.5 + Math.sin(a) * len);
    ctx.stroke();
  };
  // motion blur ghosts of the minute hand while spinning
  if (f > FF && f < FF + 27) for (let g = 1; g <= 3; g++) hand(clockAngle(f - g * 0.5), r - 3, `rgba(228,87,46,${0.5 - g * 0.12})`, 1.5);
  hand(hh, r - 6, '#1b1325', 2);
  hand(m, r - 3, '#e4572e', 1.2);
  ctx.fillStyle = '#1b1325';
  ctx.fillRect(x, y, 1, 1);
}

function stanchions(ctx: Ctx) {
  const ys = 214;
  const posts = [130, 170, 210, 250];
  ctx.strokeStyle = '#b8202a';
  ctx.lineWidth = 2;
  for (let i = 0; i < posts.length - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(posts[i], ys - 12);
    ctx.quadraticCurveTo((posts[i] + posts[i + 1]) / 2, ys - 4, posts[i + 1], ys - 12);
    ctx.stroke();
  }
  for (const p of posts) {
    ctx.fillStyle = '#8f93a6';
    ctx.fillRect(p - 1, ys - 14, 2, 14);
    ctx.fillStyle = '#e8eaf2';
    ctx.fillRect(p - 1, ys - 15, 2, 2);
    ctx.fillStyle = '#3c3f52';
    ctx.fillRect(p - 3, ys - 1, 6, 2);
  }
}

// ---------- the scene ----------
const draw = (ctx: Ctx, { w, h, frame: f }: DrawInfo) => {
  const ffOn = f >= FF && f < FF + 28;
  const flick = ffOn ? (rand(f, 11) > 0.35 ? 1 : 0.3) : 1;

  // ----- camera -----
  let cx: number, cy: number, zoom: number, shake = 0;
  if (f < TILL) {
    cx = keys(f, [
      [0, 158],
      [54, 296],
      [62, 228],
      [84, 228],
      [96, 250],
      [104, 248],
      [114, 212],
      [134, 202],
      [149, 196],
    ]);
    cy = keys(f, [
      [0, 160],
      [54, 147],
      [62, 152],
      [96, 152],
      [104, 160],
      [114, 162],
      [149, 158],
    ]);
    zoom = keys(f, [
      [0, 2.7],
      [54, 2.05],
      [62, 1.45],
      [96, 1.45],
      [104, 1.85],
      [114, 2.1],
      [134, 2.4],
      [149, 2.55],
    ]);
    if (ffOn) shake = 1.2;
    if (f >= DASH1 && f < DASH1 + 6) shake = 3;
    if (f >= HEART && f < HEART + 6) zoom += 0.12 * (1 - (f - HEART) / 6);
  } else {
    const s = f - TILL;
    cx = 300;
    cy = 155;
    zoom = 2.6 + s * 0.012 + (1 - EASE.out(clamp(s / 6))) * 0.5;
    if (s >= 4 && s < 9) shake = 2;
    if (s > 25) zoom += EASE.in(clamp((s - 25) / 5)) * 1.5;
  }

  ctx.fillStyle = '#1a1424';
  ctx.fillRect(0, 0, w, h);
  camera(ctx, w, h, cx, cy, zoom, shake, f);
  drawStore(ctx, f, flick);

  // cashier behind the counter
  const scan = Math.floor(f / 8) % 2;
  drawChar(ctx, 'cashier', 297, 160 - (ffOn ? (f % 4 < 2 ? 1 : 0) : scan), 'down');
  drawPropAt(ctx, 'checkout', CX, COUNTER_Y);

  // ----- actors (depth sorted) -----
  type Actor = { y: number; draw: () => void };
  const actors: Actor[] = [];

  const till = f >= TILL;
  LINE.forEach((who, i) => {
    if (who === 'player' || till) return;
    const p = linePos(i, f);
    if (p.x > 520) return;
    const prev = linePos(i, f - 1);
    const moving = Math.abs(p.x - prev.x) > 0.15;
    let dir: Dir = 'right';
    // idle acting before the fast-forward
    let bob = 0;
    if (!moving && f < FF) {
      if (who === 'folk0' && f > 14 && f < 40) dir = 'down';
      if (who === 'folk7') bob = Math.floor(f / 5) % 2; // impatient foot tap
      if (who === 'folk2' && f > 30) dir = 'up';
    }
    // heads whip to follow the line-cutter, then glare at camera
    if (f >= DASH0 - 2 && f < 100 && queuePos(i, f) >= 0) dir = cutterPos(f).x < p.x - 4 ? 'left' : 'right';
    if (f >= 100 && f < 118 && queuePos(i, f) >= 0) dir = 'down';
    if (f >= 100 && f < 112 && queuePos(i, f) >= 0) bob = (f + i) % 4 < 2 ? 1 : 0;
    actors.push({
      y: p.y,
      draw: () => {
        if (ffOn && moving) {
          for (let g = 3; g >= 1; g--) {
            const q = linePos(i, f - g * 1.5);
            ctx.save();
            ctx.globalAlpha = 0.18 * (4 - g);
            drawChar(ctx, who, q.x, q.y, dir, f / 2, true);
            ctx.restore();
          }
        }
        drawChar(ctx, who, p.x, p.y - bob, dir, moving ? f / (ffOn ? 2 : 5) : 0, moving);
      },
    });
  });

  // player
  if (till) {
    const s = f - TILL;
    actors.push({
      y: LINE_Y,
      draw: () => {
        drawChar(ctx, 'player', 282, LINE_Y - (s > 12 && s < 18 ? 2 : 0), 'right');
        hands(ctx, 'player', 282, LINE_Y, 1, 'right', s < 6 ? 0 : -1);
      },
    });
  } else {
    const p = playerPos(f);
    const prev = playerPos(f - 1);
    const moving = Math.hypot(p.x - prev.x, p.y - prev.y) > 0.15;
    let dir: Dir = 'right';
    if (f < FF && f > 20 && f < 44) dir = 'down'; // bored look to camera
    if (f >= DASH0 - 2 && f < 100) dir = cutterPos(f).x < p.x - 4 ? 'left' : 'right';
    if (f >= 100 && f < 112) dir = 'down';
    if (f >= 113 && f < 121) dir = 'down';
    if (f >= 121 && f < 138) dir = 'left';
    if (f >= 138 && f < 148) dir = 'left';
    const hop = f >= 121 && f < 127 ? Math.round(Math.sin(((f - 121) / 6) * Math.PI) * 3) : 0;
    actors.push({
      y: p.y,
      draw: () => {
        if (ffOn && moving) {
          for (let g = 3; g >= 1; g--) {
            const q = playerPos(f - g * 1.5);
            ctx.save();
            ctx.globalAlpha = 0.18 * (4 - g);
            drawChar(ctx, 'player', q.x, q.y, dir, f / 2, true);
            ctx.restore();
          }
        }
        drawChar(ctx, 'player', p.x, p.y - hop, dir, moving ? f / 4 : 0, moving);
        if (f >= 121 && f < 136) hands(ctx, 'player', p.x, p.y - hop, 1, 'left', Math.floor(f / 4) % 2); // "after you"
        if (f >= 100 && f < 112) hands(ctx, 'player', p.x, p.y, 1, 'up', f % 4 < 2 ? 1 : 0);
      },
    });
  }

  // elderly lady joins, walking slowly
  if (f >= 94 && !till) {
    const p = elderPos(f);
    const moving = Math.abs(p.x - elderPos(f - 1).x) > 0.1;
    const dir: Dir = f >= 136 ? 'left' : 'right';
    actors.push({ y: p.y - 0.1, draw: () => drawChar(ctx, 'elder', p.x, p.y, dir, moving ? f / 8 : 0, moving) });
  }

  // line-cutter dash with motion smear
  if (f >= DASH0 && !till) {
    const p = cutterPos(f);
    const dashing = f < DASH1;
    actors.push({
      y: p.y,
      draw: () => {
        if (dashing) {
          for (let g = 6; g >= 1; g--) {
            const q = cutterPos(f - g * 0.6);
            ctx.save();
            ctx.globalAlpha = 0.09 * (7 - g);
            drawChar(ctx, 'cutter', q.x - g * 3, q.y, 'right', f / 1.5, true);
            ctx.restore();
          }
          ctx.fillStyle = 'rgba(228,87,46,0.55)';
          for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(p.x - 70 - k * 9), Math.round(p.y - 6 - k * 4), 60, 1);
        }
        drawChar(ctx, 'cutter', p.x, p.y, f > 104 && f < 140 ? 'down' : 'right', dashing ? f / 1.5 : 0, dashing);
      },
    });
  }

  actors.sort((a, b) => a.y - b.y).forEach((a) => a.draw());

  // foreground queue rope
  stanchions(ctx);

  // ----- reactions (world space) -----
  if (f >= 100 && f < 130) {
    [3, 4, 5].forEach((i, k) => {
      const p = linePos(i, f);
      fxPop(ctx, 'cloud', p.x, p.y - 32, f, 100 + k * 2, 26, 1.1, 4);
    });
    const pp = playerPos(f);
    const s = popIn(f, 99, 7);
    if (f < 116) drawIcon(ctx, fx('exclaim'), pp.x, pp.y - 34 - Math.round((1 - s) * 6), s * 1.2);
  }
  if (f >= 106 && f < 145) fxPop(ctx, 'music', cutterPos(f).x + 9, LINE_Y - 30, f, 106, 38, 0.9, 10);
  if (f < FF) {
    const p = linePos(2, f); // the old man dozes off in the queue
    fxPop(ctx, 'zzz', p.x + 8, p.y - 30, f, 6, 50, 0.8, 10);
  }

  // heart pop
  if (f >= HEART && f < TILL) {
    const hx = 196;
    const hy = 150;
    const t = f - HEART;
    const s = popIn(f, HEART, 8) * 1.8 * (t > 10 ? 1 + Math.sin(t * 0.6) * 0.06 : 1);
    if (t < 8) ring(ctx, hx, hy, 6 + t * 4, '#ffd1dc', 2, 1 - t / 8);
    if (t < 10) burst(ctx, hx, hy, 12, 22 + t * 2, 12, '#fff3c4', 1 - t / 10, 3);
    glow(ctx, hx, hy, 30, '#ff6b8a', 0.35 * Math.min(1, t / 4));
    drawIcon(ctx, fx('heart'), hx, hy, s);
    for (let k = 0; k < 6; k++) {
      const tk = t - 3 - k * 2;
      if (tk < 0) continue;
      const a = clamp(1 - tk / 16);
      drawIcon(ctx, fx('heart'), hx + Math.sin(tk * 0.4 + k * 2) * 8 + (k - 2.5) * 6, hy - 6 - tk * 1.6, 0.5, a);
    }
  }

  // ----- till: coin burst + receipt -----
  if (f >= TILL) {
    const s = f - TILL;
    const rx = 314;
    const ry = 152;
    // cash drawer slides out
    const dOut = EASE.back(clamp((s - 2) / 5)) * 4;
    ctx.fillStyle = '#5c5f72';
    ctx.fillRect(rx - 6, Math.round(ry + 7 + dOut), 12, 3);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(rx - 5, Math.round(ry + 7 + dOut), 10, 1);
    // receipt strip printing upward
    const len = Math.round(EASE.out(clamp((s - 6) / 16)) * 20);
    if (len > 0) {
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(rx - 3, ry - 4 - len, 7, len);
      ctx.fillStyle = '#b8b0a0';
      for (let yy = 2; yy < len - 1; yy += 2) ctx.fillRect(rx - 2, ry - 4 - len + yy, 3 + ((yy * 7) % 3), 1);
      for (let xx = 0; xx < 7; xx += 2) ctx.fillRect(rx - 3 + xx, ry - 5 - len, 1, 1);
    }
    // coins burst out of the register
    for (let k = 0; k < 7; k++) {
      const t0 = 3 + (k % 3) * 2;
      const tk = s - t0;
      if (tk < 0) continue;
      const vx = (rand(k, 21) - 0.5) * 2.6 + (k % 2 ? 0.8 : -0.8);
      const vy = -2.2 - rand(k, 22) * 1.2;
      const x = rx + vx * tk;
      const y = ry + 4 + vy * tk + 0.2 * tk * tk;
      if (y > ry + 16) continue;
      drawIcon(ctx, fx('coin'), x, y, 0.32 * (0.6 + 0.4 * Math.abs(Math.cos(tk * 0.6 + k))));
    }
    if (s > 14) drawIcon(ctx, item('receipt'), rx + 16, ry - 14 - Math.round(EASE.back(clamp((s - 14) / 8)) * 4), 0.7 * popIn(f, TILL + 14, 8));
    fxPop(ctx, 'sparkle', rx + 4, ry - 26, f, TILL + 16, 14, 0.6, 4);
    fxPop(ctx, 'check', 276, 156, f, TILL + 12, 18, 0.6, 4);
  }

  // ----- lighting & grade -----
  screen(ctx);
  grade(ctx, w, h, ffOn ? '#d8e4ff' : '#ffe9cf', 1);
  camera(ctx, w, h, cx, cy, zoom, shake, f);
  for (let i = 0; i < 7; i++) glow(ctx, -60 + i * 90, 60, 70, '#ffe6b0', 0.22 * flick);
  glow(ctx, 316, 130, 60, '#ffd27a', 0.18);
  screen(ctx);

  if (ffOn) {
    const t = f - FF;
    speedLines(ctx, w, h, f, 0.35, 34, '220,235,255', 30);
    scanlines(ctx, w, h, 0.14, f);
    grade(ctx, w, h, flick < 1 ? '#5a6080' : '#ffffff', flick < 1 ? 0.35 : 0, 'multiply');
    // ⏩ glyph, top-right inside the letterbox band
    const s = popIn(f, FF, 6);
    if (s > 0 && (t < 4 || Math.floor(t / 5) % 4 !== 3)) {
      const gx = 56;
      const gy = 58;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.scale(s * 1.6, s * 1.6);
      const tri = (ox: number, col: string) => {
        ctx.fillStyle = col;
        for (let r = 0; r < 13; r++) {
          const len = 13 - Math.abs(6 - r) * 2;
          ctx.fillRect(ox, r - 6, len, 1);
        }
      };
      tri(-14 + 2, '#1b1325');
      tri(0 + 2, '#1b1325');
      tri(-14, '#fff3dc');
      tri(0, '#fff3dc');
      ctx.restore();
    }
    flash(ctx, w, h, t < 3 ? 0.5 - t * 0.16 : 0);
  }
  if (f >= DASH1 && f < DASH1 + 3) flash(ctx, w, h, 0.25, '#ffe1c4');
  if (f >= TILL && f < TILL + 2) flash(ctx, w, h, 0.6);
};

export default function S05() {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <PixelCanvas draw={draw} />
    </AbsoluteFill>
  );
}
