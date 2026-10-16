// S07 — CHAOS MONTAGE (abs 930–1140). Five hard cuts on the beat: burnt soup, pink laundry,
// angry little sister, locked out, short change. Each shot punches in, then a reaction lands.
import { AbsoluteFill } from 'remotion';
import { PixelCanvas, camera, grade, glow, rand, clamp, lerp, EASE, type DrawInfo } from '../lib/stage';
import { CAST, drawChar, drawPropAt, drawIcon, fillTiles, fx, item, prop, portrait, drawPixelText, type Dir } from '../lib/art';
import { CUES, SCENES } from '../timeline';
import { type Ctx, screen, popIn, fxPop, hands, flash, ring, burst, glyphBubble, punch, speedLines } from './B_kit';

const FROM = SCENES[6].from; // 930
const CUTS = CUES.montageCuts.map((c) => c - FROM); // 0,45,90,135,180
const SIB_LINE = CUES.siblingLine - FROM; // 92

/** camera with cut punch */
function shotCam(ctx: Ctx, w: number, h: number, s: number, cx: number, cy: number, zoom: number, f: number, extraShake = 0) {
  const p = punch(s);
  camera(ctx, w, h, cx, cy, zoom * p.zoom, p.shake + extraShake, f);
}

function sweat(ctx: Ctx, x: number, y: number, s: number, seed: number) {
  ctx.fillStyle = '#9fd8ff';
  for (let k = 0; k < 4; k++) {
    const t = (s * 1.3 + k * 4) % 12;
    const side = k % 2 ? 1 : -1;
    ctx.fillRect(Math.round(x + side * (6 + t * 1.2)), Math.round(y - 4 - t * 1.4 + t * t * 0.12), 1, 2);
    void seed;
  }
}

// ---------------- 1) kitchen: soup on fire ----------------
function shotKitchen(ctx: Ctx, w: number, h: number, s: number, f: number) {
  shotCam(ctx, w, h, s, 100 + s * 0.15, 58, 2.7 + s * 0.006, f);
  ctx.fillStyle = '#2a2236';
  ctx.fillRect(-100, -100, 400, 300);
  fillTiles(ctx, 'wallTop', -16, 0, 16, 1);
  fillTiles(ctx, 'wallFace', -16, 16, 16, 3);
  fillTiles(ctx, 'kitchen', -16, 64, 16, 6);
  drawPropAt(ctx, 'window', 140, 40);
  drawPropAt(ctx, 'fridge', 52, 72);
  drawPropAt(ctx, 'counter', 68, 72);
  drawPropAt(ctx, 'counter', 84, 72);
  drawPropAt(ctx, 'stove-pot-burnt', 100, 72);
  drawPropAt(ctx, 'sink', 116, 72);
  drawPropAt(ctx, 'counter', 132, 72);
  drawPropAt(ctx, 'dining-table', 150, 118);
  // flames licking the pot
  for (let k = 0; k < 5; k++) {
    const fh = 2 + Math.floor(rand(k, f) * 4);
    ctx.fillStyle = k % 2 ? '#ffb43a' : '#e4572e';
    ctx.fillRect(94 + k * 3, 52 - fh, 2, fh);
  }
  glow(ctx, 100, 50, 28, '#ff7a2a', 0.45 + rand(f, 3) * 0.2);
  // player sprints in, then panics
  const runT = clamp(s / 16);
  const px = lerp(-10, 88, EASE.out(runT));
  const panic = s > 16;
  const hop = panic ? Math.round(Math.abs(Math.sin(s * 0.9)) * 4) : Math.round(Math.abs(Math.sin(s * 0.8)) * 2);
  const dir: Dir = panic ? (Math.floor(s / 4) % 2 ? 'up' : 'down') : 'right';
  drawChar(ctx, 'player', px, 88 - hop, dir, s / 2, true);
  if (panic) hands(ctx, 'player', px, 88 - hop, 1, 'up', s % 4 < 2 ? 1 : -1);
  // billowing black smoke
  for (let k = 0; k < 34; k++) {
    const born = k * 1.2 - 4;
    const t = s - born;
    if (t < 0) continue;
    const life = 30;
    if (t > life) continue;
    const sx = 100 + Math.sin(t * 0.2 + k) * (3 + t * 0.5) + (rand(k, 1) - 0.5) * 10;
    const sy = 40 - t * 1.6;
    const r = 3 + t * 0.45;
    const a = 0.75 * (1 - t / life);
    ctx.fillStyle = `rgba(${30 + (k % 3) * 12},${26 + (k % 3) * 10},${36 + (k % 3) * 10},${a})`;
    ctx.beginPath();
    ctx.arc(Math.round(sx), Math.round(sy), r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let k = 0; k < 6; k++) fxPop(ctx, 'smoke', 96 + (k % 3) * 5, 38, s, k * 6, 22, 1, 26);
  if (panic) {
    fxPop(ctx, 'exclaim', px - 14, 52, s, 17, 28, 1.1, 2);
    sweat(ctx, px, 68 - hop, s, 1);
  }
  screen(ctx);
  grade(ctx, w, h, '#ffd8b8', 1);
}

// ---------------- 2) laundry: the pink shirt ----------------
function shotLaundry(ctx: Ctx, w: number, h: number, s0: number, f: number) {
  const FREEZE = 30;
  const frozen = s0 >= FREEZE && s0 < FREEZE + 6;
  const s = frozen ? FREEZE : s0 >= FREEZE + 6 ? s0 - 6 : s0;
  const sockX = 106;
  const sockY = 86;
  const fz = frozen ? EASE.out(clamp((s0 - FREEZE) / 3)) : s0 >= FREEZE + 6 ? 1 - EASE.inOut(clamp((s0 - FREEZE - 6) / 5)) : 0;
  const cx = lerp(100, sockX, fz);
  const cy = lerp(64, sockY - 6, fz);
  shotCam(ctx, w, h, s0, cx, cy, 2.9 + fz * 1.8, f, s < 12 ? 0.6 : 0);
  ctx.fillStyle = '#2a2236';
  ctx.fillRect(-100, -100, 400, 300);
  fillTiles(ctx, 'wallTop', -16, 0, 16, 1);
  fillTiles(ctx, 'wallFace', -16, 16, 16, 3);
  fillTiles(ctx, 'bath', -16, 64, 16, 6);
  drawPropAt(ctx, 'drying-rack', 60, 80);
  drawPropAt(ctx, 'laundry-whites', 140, 84);
  drawPropAt(ctx, 'laundry', 156, 84);
  // shaking washer
  const shakeX = s < 12 ? (s % 2 ? 1 : -1) : s < 30 ? (s % 4 < 2 ? 1 : 0) : 0;
  ctx.save();
  ctx.translate(100 + shakeX, 76);
  ctx.rotate(s < 12 ? (s % 2 ? 0.04 : -0.04) : 0);
  ctx.translate(-100, -76);
  drawPropAt(ctx, 'washer-running', 100, 76, 1.4);
  ctx.restore();
  if (s < 12) {
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 3; k++) ctx.fillRect(86 + k * 13, 50 - (s % 3), 1, 2); // rattle marks
  }
  // door pops
  if (s >= 12 && s < 20) {
    ring(ctx, 100, 62, 4 + (s - 12) * 3, '#ffffff', 1, 1 - (s - 12) / 8);
    burst(ctx, 100, 62, 6, 14 + (s - 12) * 2, 10, '#fff3dc', 1 - (s - 12) / 8, 4);
    for (let k = 0; k < 5; k++) fxPop(ctx, 'bubble', 92 + k * 4, 60, s, 12 + k, 14, 0.6, 14);
  }
  // red sock drops out and bounces
  if (s >= 24) {
    const t = s - 24;
    const fall = t < 6 ? (t / 6) ** 2 : 1;
    const bounce = t >= 6 ? Math.abs(Math.sin((t - 6) * 0.9)) * 4 * Math.exp(-(t - 6) * 0.4) : 0;
    const y = lerp(62, sockY, fall) - bounce;
    drawIcon(ctx, item('red-sock'), sockX, y, 0.8);
  }
  // player peeks in after the freeze
  if (s0 >= FREEZE + 6) {
    const t = s0 - FREEZE - 6;
    const px = lerp(190, 146, EASE.back(clamp(t / 6)));
    drawChar(ctx, 'player', px, 96, 'left');
    fxPop(ctx, 'exclaim', px, 62, t, 2, 20, 1, 2);
  }
  screen(ctx);
  grade(ctx, w, h, '#e6ecff', 1);
  // the pink shirt flies at the camera (screen space)
  if (s >= 12 && s < 27) {
    const t = (s - 12) / 15;
    const sc = lerp(2.5, 16, EASE.in(t));
    const x = lerp(w / 2 - 4, w / 2 + 30, t);
    const y = lerp(h / 2 - 10, h / 2 + 20, t);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 7);
    ctx.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : 1;
    const c = item('pink-shirt');
    ctx.drawImage(c, -c.width * sc / 2, -c.height * sc / 2, c.width * sc, c.height * sc);
    ctx.restore();
  }
  // freeze: desaturate + ring zoom on the sock
  if (frozen) {
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'rgba(128,128,128,0.85)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    // re-colour the sock so it pops
    const z = (2.9 + fz * 1.8);
    const scx = w / 2 + (sockX - cx) * z;
    const scy = h / 2 + (sockY - cy) * z;
    ring(ctx, scx, scy, 70 - (s0 - FREEZE) * 9, '#e4572e', 3, 1);
    ctx.save();
    ctx.translate(Math.round(scx), Math.round(scy));
    const c = item('red-sock');
    ctx.drawImage(c, -c.width * 0.8 * z / 2, -c.height * 0.8 * z / 2, c.width * 0.8 * z, c.height * 0.8 * z);
    ctx.restore();
  }
}

// ---------------- 3) bedroom: MY crayons ----------------
function shotBedroom(ctx: Ctx, w: number, h: number, s: number, f: number) {
  shotCam(ctx, w, h, s, 110, 74, 3.0 + s * 0.006, f);
  ctx.fillStyle = '#2a2236';
  ctx.fillRect(-100, -100, 400, 300);
  fillTiles(ctx, 'wallTop', -16, 16, 18, 1);
  fillTiles(ctx, 'wallFace', -16, 32, 18, 2);
  fillTiles(ctx, 'wood', -16, 64, 18, 6);
  fillTiles(ctx, 'rug', 80, 80, 4, 2);
  drawPropAt(ctx, 'window', 90, 56);
  drawPropAt(ctx, 'picture', 134, 56);
  drawPropAt(ctx, 'bed-kid', 62, 92);
  drawPropAt(ctx, 'toybox-full', 156, 80);
  drawPropAt(ctx, 'desk', 150, 108);
  const calm = s >= 30;
  // sister stomps
  const stomp = !calm ? (Math.floor(s / 3) % 2 ? 2 : 0) : 0;
  const sx = 96;
  const sy = 100;
  const sDir: Dir = calm ? 'right' : 'down';
  drawChar(ctx, 'sibling', sx, sy - stomp, sDir);
  if (!calm && stomp === 0 && s % 6 < 2) {
    ctx.fillStyle = 'rgba(255,240,220,0.8)';
    ctx.fillRect(sx - 8, sy - 1, 2, 1);
    ctx.fillRect(sx + 6, sy - 1, 2, 1);
    ctx.fillRect(sx - 6, sy - 3, 1, 1);
    ctx.fillRect(sx + 5, sy - 3, 1, 1);
  }
  drawIcon(ctx, item('crayons'), sx - 9, sy - 9 - stomp, 0.6);
  // player, hands up apologetically
  const px = 124;
  drawChar(ctx, 'player', px, sy, 'left', 0, false);
  if (!calm) {
    hands(ctx, 'player', px, sy, 1, 'up', s % 6 < 3 ? 1 : 0);
    sweat(ctx, px, sy - 18, s, 3);
  }
  // reactions
  if (!calm) {
    const c = popIn(f, CUTS[2] + 2, 7);
    const jit = s % 4 < 2 ? 1 : -1;
    drawIcon(ctx, fx('cloud'), sx + jit, sy - 32 - Math.round((1 - c) * 4), c * 1.25);
  }
  if (calm) {
    const t = s - 30;
    const hs = popIn(s, 31, 7) * 1.2;
    drawIcon(ctx, fx('heart'), (sx + px) / 2, sy - 34, hs);
    for (let k = 0; k < 3; k++) {
      const tk = t - 2 - k * 3;
      if (tk > 0) drawIcon(ctx, fx('heart'), (sx + px) / 2 + (k - 1) * 10, sy - 38 - tk * 1.5, 0.4, clamp(1 - tk / 12));
    }
    // happy hop
    void f;
  }
  screen(ctx);
  grade(ctx, w, h, '#ffe2c4', 1);
  void SIB_LINE;
}

// ---------------- 4) locked out ----------------
function padlock(ctx: Ctx, x: number, y: number, s: number) {
  if (s <= 0.01) return;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(s, s);
  ctx.strokeStyle = '#c9ccd8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -3, 4, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#1b1325';
  ctx.fillRect(-6, -4, 12, 10);
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(-5, -3, 10, 8);
  ctx.fillStyle = '#ffe08a';
  ctx.fillRect(-5, -3, 10, 1);
  ctx.fillStyle = '#5a3a10';
  ctx.fillRect(-1, 0, 2, 3);
  ctx.restore();
}

function shotLocked(ctx: Ctx, w: number, h: number, s: number, f: number) {
  const CLOSE = 22;
  if (s < CLOSE) {
    shotCam(ctx, w, h, s, 100, 86, 2.8 + s * 0.01, f);
    ctx.fillStyle = '#141428';
    ctx.fillRect(-100, -100, 400, 300);
    fillTiles(ctx, 'grass', -16, 0, 16, 8);
    drawPropAt(ctx, 'house-player', 100, 104);
    fillTiles(ctx, 'path', 92, 104, 1, 3);
    fillTiles(ctx, 'doormat', 92, 104, 1, 1);
    drawPropAt(ctx, 'bush', 52, 110);
    drawPropAt(ctx, 'bush', 148, 110);
    const rattle = s >= 3 && s < 18 ? (s % 2 ? 1 : -1) : 0;
    drawChar(ctx, 'player', 100 + rattle, 116, 'up');
    if (s >= 3 && s < 18) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(108 + rattle, 100, 1, 2);
      ctx.fillRect(91 + rattle, 100, 1, 2);
    }
    const lk = popIn(s, 8, 7);
    padlock(ctx, 100, 70, lk * 1.2 * (s > 8 && s < 12 ? 1.1 : 1));
    fxPop(ctx, 'exclaim', 114, 78, s, 10, 14, 0.9, 2);
    screen(ctx);
    grade(ctx, w, h, '#5a5fa0', 1);
    camera(ctx, w, h, 100, 86, (2.8 + s * 0.01) * punch(s).zoom, 0, f);
    glow(ctx, 100, 82, 30, '#ffcf7a', 0.5); // porch light
    glow(ctx, 80, 70, 14, '#ffd27a', 0.3);
    screen(ctx);
    return;
  }
  // close-up through the window: keys hanging on the hook inside
  const t = s - CLOSE;
  const p = punch(t, 0.25, 7);
  const z = (1 + t * 0.006) * p.zoom;
  ctx.save();
  screen(ctx);
  ctx.translate(w / 2 + (p.shake ? (rand(f, 1) - 0.5) * p.shake * 2 : 0), h / 2);
  ctx.scale(z, z);
  // exterior wall
  ctx.fillStyle = '#3a3f6e';
  ctx.fillRect(-w, -h, w * 2, h * 2);
  for (let y = -h; y < h; y += 12) {
    ctx.fillStyle = '#343864';
    ctx.fillRect(-w, y, w * 2, 1);
  }
  // window: warm interior
  const ww = 250;
  const wh = 150;
  ctx.fillStyle = '#f5d6a0';
  ctx.fillRect(-ww / 2, -wh / 2, ww, wh);
  ctx.fillStyle = '#ecc58e';
  for (let x = -ww / 2; x < ww / 2; x += 10) ctx.fillRect(x, -wh / 2, 1, wh);
  drawPropAt(ctx, 'coat-hook', -70, -10, 3);
  // keys hanging on a nail, swinging gently
  const sw = Math.sin(t * 0.5) * 0.12 * Math.exp(-t * 0.05);
  ctx.fillStyle = '#5c4033';
  ctx.fillRect(28, -40, 4, 4);
  ctx.save();
  ctx.translate(30, -38);
  ctx.rotate(sw);
  ctx.fillStyle = '#8f93a6';
  ctx.fillRect(-1, 0, 2, 14);
  const hk = item('house-keys');
  const ks = 5;
  ctx.drawImage(hk, -hk.width * ks / 2, 10, hk.width * ks, hk.height * ks);
  // glint sweep across the keys
  if (t >= 5 && t < 14) {
    const gx = -40 + (t - 5) * 9;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-hk.width * ks / 2, 10, hk.width * ks, hk.height * ks);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(gx, 10, 6, 80);
    ctx.fillRect(gx + 9, 10, 2, 80);
    ctx.restore();
  }
  ctx.restore();
  // window frame + cross bars + glass reflection
  ctx.fillStyle = '#fff3dc';
  ctx.fillRect(-ww / 2 - 6, -wh / 2 - 6, ww + 12, 6);
  ctx.fillRect(-ww / 2 - 6, wh / 2, ww + 12, 8);
  ctx.fillRect(-ww / 2 - 6, -wh / 2, 6, wh);
  ctx.fillRect(ww / 2, -wh / 2, 6, wh);
  ctx.fillRect(-12, -wh / 2, 4, wh);
  ctx.fillStyle = 'rgba(200,220,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(-ww / 2 + 10, -wh / 2);
  ctx.lineTo(-ww / 2 + 34, -wh / 2);
  ctx.lineTo(-ww / 2 + 4, wh / 2);
  ctx.lineTo(-ww / 2, wh / 2);
  ctx.fill();
  ctx.restore();
  // night tint outside the window, warm inside
  grade(ctx, w, h, '#c8ccff', 1);
  glow(ctx, w / 2, h / 2, 110, '#ffcf7a', 0.25);
  if (t >= 8) {
    drawIcon(ctx, fx('sparkle'), w / 2 + 62, h / 2 - 2, popIn(t, 8, 6) * 2.2 * (1 + Math.sin(t) * 0.1));
    drawIcon(ctx, fx('sparkle'), w / 2 + 14, h / 2 + 22, popIn(t, 12, 6) * 1.2);
  }
}

// ---------------- 5) corner shop: short change ----------------
function shotChange(ctx: Ctx, w: number, h: number, s: number, f: number) {
  const FACE = 13;
  const skin = CAST.player.a.skin;
  if (s < FACE) {
    const p = punch(s);
    ctx.save();
    screen(ctx);
    ctx.translate(w / 2, h / 2);
    ctx.scale(p.zoom, p.zoom);
    ctx.translate(-w / 2 + (p.shake ? (rand(f, 1) - 0.5) * p.shake * 2 : 0), -h / 2);
    // blurred shop behind
    ctx.filter = 'blur(2px) brightness(0.75)';
    const k = prop('kiosk');
    ctx.drawImage(k, w / 2 - 160, 20, 320, 240);
    ctx.filter = 'none';
    // the open palm
    const hx = w / 2;
    const hy = 196;
    ctx.fillStyle = '#1b1325';
    ctx.beginPath();
    ctx.ellipse(hx, hy, 66, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 63, 33, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c98e62';
    ctx.fillRect(hx - 40, hy - 4, 50, 2);
    ctx.fillRect(hx - 30, hy + 8, 44, 2);
    // fingers
    for (let i = 0; i < 4; i++) {
      const fy = hy - 54 + (i === 0 || i === 3 ? 6 : 0);
      ctx.fillStyle = '#1b1325';
      ctx.beginPath();
      ctx.ellipse(hx - 43 + i * 26, fy + 2, 11, 9, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(hx - 54 + i * 26, fy, 22, 34);
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(hx - 43 + i * 26, fy + 2, 9, 7, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(hx - 52 + i * 26, fy + 2, 18, 34);
      ctx.fillStyle = '#f6c9a0';
      ctx.fillRect(hx - 48 + i * 26, fy - 2, 6, 3);
    }
    ctx.fillStyle = '#1b1325';
    ctx.fillRect(hx + 58, hy - 22, 26, 18);
    ctx.fillStyle = skin;
    ctx.fillRect(hx + 58, hy - 20, 24, 14);
    // coins drop one by one
    const spots = [
      [hx - 30, hy - 2],
      [hx - 6, hy + 2],
      [hx + 18, hy - 2],
    ];
    spots.forEach(([cx, cy], i) => {
      const t0 = 1 + i * 3;
      const t = s - t0;
      if (t < 0) return;
      const fall = clamp(t / 3);
      const y = lerp(30, cy, fall * fall) - (t >= 3 && t < 5 ? 3 : 0);
      drawIcon(ctx, fx('coin'), cx, y, 2.4);
      if (t >= 3) {
        const ps = popIn(t, 3, 5);
        if (ps > 0) {
          ctx.save();
          ctx.translate(cx + 6, 80);
          ctx.scale(ps, ps);
          drawPixelText(ctx, String(i + 1), -5, -9, '#1b1325', 5);
          drawPixelText(ctx, String(i + 1), -7, -11, '#fff3dc', 5);
          ctx.restore();
        }
      }
    });
    // the missing fourth coin
    if (s >= 10) {
      const a = popIn(s, 10, 4);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#fff3dc';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx + 42, hy + 2, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(hx + 48, 80);
      ctx.scale(a, a);
      drawPixelText(ctx, '4', -5, -9, '#1b1325', 5);
      drawPixelText(ctx, '4', -7, -11, s % 4 < 2 ? '#e4572e' : '#fff3dc', 5);
      ctx.restore();
    }
    ctx.restore();
    grade(ctx, w, h, '#ffe0b8', 1);
    return;
  }
  // squint: zoom into the player's eyes
  const t = s - FACE;
  const zoomOut = t >= 11 ? EASE.in(clamp((t - 11) / 6)) : 0;
  const z = lerp(9 + t * 0.15, 3, zoomOut);
  const pt = portrait('player', 32);
  ctx.save();
  screen(ctx);
  ctx.fillStyle = '#f2a541';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.scale(z, z);
  ctx.translate(-16, -16);
  ctx.drawImage(pt, 0, 0);
  // squinting eyelids
  if (t < 9) {
    ctx.fillStyle = skin;
    ctx.fillRect(10, 14, 4, 4);
    ctx.fillRect(18, 14, 4, 4);
    ctx.fillStyle = '#21172b';
    ctx.fillRect(10, 16, 4, 1);
    ctx.fillRect(18, 16, 4, 1);
  }
  ctx.restore();
  if (t >= 1 && t < 9) glyphBubble(ctx, w / 2 + 130, 96, popIn(t, 1, 5) * 2.4, '?');
  if (t >= 8) {
    const c = popIn(t, 8, 6);
    drawIcon(ctx, fx('check'), w / 2 + 130, 92, c * 3);
    burst(ctx, w / 2 + 130, 92, 26, 44, 12, '#fff3dc', clamp(1 - (t - 8) / 8), 9);
  }
  if (t >= 11) speedLines(ctx, w, h, f, 0.4, 30, '255,255,255', 60);
  flash(ctx, w, h, t >= 14 ? (t - 14) / 3 : 0);
}

const draw = (ctx: Ctx, { w, h, frame: f }: DrawInfo) => {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  let shot = 0;
  for (let i = 0; i < CUTS.length; i++) if (f >= CUTS[i]) shot = i;
  const s = f - CUTS[shot];
  if (shot === 0) shotKitchen(ctx, w, h, s, f);
  else if (shot === 1) shotLaundry(ctx, w, h, s, f);
  else if (shot === 2) shotBedroom(ctx, w, h, s, f);
  else if (shot === 3) shotLocked(ctx, w, h, s, f);
  else shotChange(ctx, w, h, s, f);
  screen(ctx);
  // cut flash on every beat cut
  if (s < 2) flash(ctx, w, h, 0.35 * (1 - s / 2));
};

export default function S07() {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <PixelCanvas draw={draw} />
    </AbsoluteFill>
  );
}
