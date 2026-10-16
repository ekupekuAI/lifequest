// Procedural pixel-art "videos" for the phone's Reels app. Each kind draws one
// looping frame at time `t` (seconds) onto a tiny 54×96 canvas that CSS scales up
// with crisp pixels. No external media.
import type { Reel, ReelKind } from '../core/reels';

export const REEL_W = 54;
export const REEL_H = 96;

type Ctx = CanvasRenderingContext2D;

const px = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

const loop = (t: number, period: number) => (((t % period) + period) % period) / period;

function heart(c: Ctx, x: number, y: number, color = '#e4572e') {
  px(c, x, y, 2, 2, color);
  px(c, x + 3, y, 2, 2, color);
  px(c, x - 1, y + 1, 7, 2, color);
  px(c, x, y + 3, 5, 1, color);
  px(c, x + 1, y + 4, 3, 1, color);
  px(c, x + 2, y + 5, 1, 1, color);
}

function room(c: Ctx, bg: string, floorY: number, floor = '#3a2c22') {
  px(c, 0, 0, REEL_W, REEL_H, bg);
  // wallpaper dots
  for (let y = 4; y < floorY; y += 8) for (let x = (y / 8) % 2 ? 2 : 6; x < REEL_W; x += 8) px(c, x, y, 1, 1, 'rgba(255,255,255,0.08)');
  px(c, 0, floorY, REEL_W, REEL_H - floorY, floor);
  px(c, 0, floorY, REEL_W, 1, 'rgba(0,0,0,0.35)');
}

function person(c: Ctx, x: number, y: number, shirt: string, pose = 0, skin = '#e0ac69', hair = '#2b1d14') {
  // y = feet line; 7px wide, ~20px tall
  px(c, x + 1, y - 20, 5, 5, skin);
  px(c, x + 1, y - 21, 5, 2, hair);
  px(c, x + 2, y - 18, 1, 1, '#111');
  px(c, x + 4, y - 18, 1, 1, '#111');
  px(c, x, y - 15, 7, 8, shirt);
  // arms by pose
  const arms = [
    [-2, -14, 2, 6, 7, -14, 2, 6],
    [-2, -19, 2, 6, 7, -14, 2, 6],
    [-2, -14, 2, 6, 7, -19, 2, 6],
    [-2, -19, 2, 6, 7, -19, 2, 6],
  ][pose % 4];
  px(c, x + arms[0], y + arms[1], arms[2], arms[3], skin);
  px(c, x + arms[4], y + arms[5], arms[6], arms[7], skin);
  // legs
  const kick = pose % 2 ? 1 : 0;
  px(c, x + 1 - kick, y - 7, 2, 7, '#2d3a64');
  px(c, x + 4 + kick, y - 7, 2, 7, '#2d3a64');
}

const DRAW: Record<ReelKind, (c: Ctx, t: number, r: Reel) => void> = {
  cat(c, t, r) {
    room(c, r.bg, 70);
    // table
    px(c, 2, 58, 48, 4, '#8b5a2b');
    px(c, 4, 62, 3, 8, '#6b4220');
    px(c, 45, 62, 3, 8, '#6b4220');
    const p = loop(t * r.speed, 3.2);
    // cat
    const cx = 32;
    px(c, cx, 49, 13, 9, '#9aa0b5');
    px(c, cx + 9, 42, 9, 8, '#9aa0b5');
    px(c, cx + 9, 40, 2, 2, '#9aa0b5');
    px(c, cx + 16, 40, 2, 2, '#9aa0b5');
    px(c, cx + 11, 45, 1, 1, '#ffd166');
    px(c, cx + 15, 45, 1, 1, '#ffd166');
    px(c, cx + 13, 47, 1, 1, '#f7a1c4');
    const tail = Math.round(Math.sin(t * 4) * 2);
    px(c, cx - 3, 46 + tail, 3, 2, '#9aa0b5');
    px(c, cx - 4, 42 + tail, 2, 5, '#9aa0b5');
    // paw reaches for the cup
    const reach = p < 0.3 ? 0 : p < 0.45 ? ((p - 0.3) / 0.15) * 7 : p < 0.55 ? 7 : 0;
    px(c, cx - reach, 55, 3 + reach, 2, '#9aa0b5');
    // cup
    let cupX = 22;
    let cupY = 51;
    if (p >= 0.4 && p < 0.55) cupX = 22 - ((p - 0.4) / 0.15) * 20;
    if (p >= 0.55) cupX = 2;
    if (p >= 0.55 && p < 0.72) cupY = 51 + ((p - 0.55) / 0.17) ** 2 * 17;
    if (p < 0.72) {
      px(c, cupX, cupY, 6, 7, '#f4ecdc');
      px(c, cupX + 6, cupY + 2, 2, 3, '#f4ecdc');
      px(c, cupX + 1, cupY + 1, 4, 1, '#6b3a1f');
    } else {
      // shards + splash
      const s = (p - 0.72) / 0.28;
      for (let i = 0; i < 6; i++) px(c, 2 + i * 3 + s * (i - 2) * 3, 72 - Math.sin(Math.PI * Math.min(1, s * 2)) * (3 + i), 2, 1, i % 2 ? '#f4ecdc' : '#6b3a1f');
      if (p > 0.75) {
        c.fillStyle = '#ffd166';
        c.font = '8px monospace';
        c.fillText('!', cx + 12, 38);
      }
    }
  },

  dance(c, t, r) {
    px(c, 0, 0, REEL_W, REEL_H, '#120d22');
    const beat = Math.floor(t * 4 * r.speed);
    const cols = [r.accent, '#e4572e', '#3bb273', '#2e86ab', '#f7a1c4'];
    for (let y = 66; y < REEL_H; y += 6) for (let x = 0; x < REEL_W; x += 9) px(c, x, y, 8, 5, (x / 9 + y / 6 + beat) % 3 === 0 ? cols[(x + y + beat) % cols.length] : '#241a40');
    // spotlight
    c.fillStyle = 'rgba(255,240,180,0.12)';
    c.beginPath();
    c.moveTo(22, 0);
    c.lineTo(32, 0);
    c.lineTo(44, 72);
    c.lineTo(10, 72);
    c.fill();
    const hop = beat % 2 ? 2 : 0;
    person(c, 23, 70 - hop, r.accent, beat);
    // music notes
    for (let i = 0; i < 3; i++) {
      const ny = 40 - loop(t + i * 0.7, 2) * 30;
      px(c, 6 + i * 18, ny, 2, 2, '#ffd166');
      px(c, 7 + i * 18, ny - 4, 1, 4, '#ffd166');
    }
  },

  cook(c, t, r) {
    room(c, r.bg, 66, '#4b4f5c');
    // stove
    px(c, 6, 60, 42, 6, '#2d2f38');
    px(c, 14, 58, 26, 2, '#e4572e');
    // pan
    px(c, 12, 54, 26, 4, '#22252c');
    px(c, 38, 55, 12, 2, '#22252c');
    const p = loop(t * r.speed, 1.8);
    const up = Math.sin(Math.PI * Math.min(1, p * 1.4)) * 26;
    const flipW = Math.max(2, Math.abs(Math.cos(Math.PI * Math.min(1, p * 1.4))) * 14);
    const ex = 25 - flipW / 2;
    px(c, ex, 50 - up, flipW, 4, '#fbf6ea');
    if (flipW > 6) px(c, 23, 51 - up, 4, 2, '#ffb627');
    // steam
    for (let i = 0; i < 4; i++) {
      const s = loop(t + i * 0.45, 1.8);
      px(c, 16 + i * 6 + Math.sin(t * 3 + i) * 2, 50 - s * 22, 2, 2, `rgba(255,255,255,${0.5 - s * 0.5})`);
    }
  },

  clickbait(c, t, r) {
    const flash = Math.floor(t * 3) % 2;
    px(c, 0, 0, REEL_W, REEL_H, flash ? '#b3261e' : '#e4572e');
    // rays
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + t * 0.6;
      c.strokeStyle = flash ? 'rgba(255,209,102,0.25)' : 'rgba(255,255,255,0.15)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(27, 48);
      c.lineTo(27 + Math.cos(a) * 60, 48 + Math.sin(a) * 60);
      c.stroke();
    }
    // mystery box
    px(c, 17, 44, 20, 16, '#7a4a1d');
    px(c, 17, 44, 20, 3, '#9a6328');
    px(c, 25, 44, 4, 16, '#ffd166');
    // pulsing ring
    const rr = 15 + Math.sin(t * 6) * 2;
    c.strokeStyle = '#ffd166';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(27, 52, rr, 0, Math.PI * 2);
    c.stroke();
    // bouncing arrow
    const ay = 20 + Math.abs(Math.sin(t * 5)) * 5;
    px(c, 39, ay, 3, 10, '#fff');
    px(c, 36, ay + 10, 9, 2, '#fff');
    px(c, 38, ay + 12, 5, 2, '#fff');
    px(c, 40, ay + 14, 1, 1, '#fff');
    c.fillStyle = '#fff';
    c.font = 'bold 12px monospace';
    c.fillText('?!', 6, 26);
  },

  pet(c, t, r) {
    room(c, r.bg, 70, '#5b7a3a');
    const wag = Math.floor(t * 8 * r.speed) % 2;
    // dog
    const dx = 14;
    px(c, dx, 56, 20, 10, '#b5763c');
    px(c, dx + 16, 46, 12, 11, '#b5763c');
    px(c, dx + 15, 47, 3, 7, '#7a4a1d');
    px(c, dx + 26, 47, 3, 7, '#7a4a1d');
    px(c, dx + 19, 50, 2, 2, '#111');
    px(c, dx + 24, 50, 2, 2, '#111');
    px(c, dx + 21, 53, 3, 2, '#111');
    px(c, dx + 22, 55, 2, 3 + wag, '#f7a1c4');
    px(c, dx + 1, 66, 3, 4, '#b5763c');
    px(c, dx + 15, 66, 3, 4, '#b5763c');
    px(c, dx - 5, wag ? 50 : 54, 6, 2, '#b5763c');
    // hearts
    for (let i = 0; i < 3; i++) {
      const s = loop(t * 0.8 + i * 0.33, 1);
      heart(c, 30 + i * 6 + Math.sin(t * 2 + i) * 2, 40 - s * 32, s > 0.8 ? 'rgba(228,87,46,0.4)' : '#e4572e');
    }
  },

  prank(c, t, r) {
    room(c, r.bg, 74);
    const p = loop(t * r.speed, 3);
    // the victim, facing right, playing on a phone (ha)
    const jump = p > 0.7 && p < 0.85 ? Math.sin(((p - 0.7) / 0.15) * Math.PI) * 10 : 0;
    person(c, 34, 74 - jump, '#2e86ab', p > 0.7 ? 3 : 0);
    if (p <= 0.7) px(c, 42, 60, 3, 4, '#111');
    // the prankster sneaks in from the left
    const sx = -8 + Math.min(1, p / 0.65) * 30;
    person(c, sx, 74, r.accent, Math.floor(t * 6) % 2 ? 1 : 0);
    if (p > 0.68) {
      // party horn + confetti
      px(c, sx + 8, 58, 6, 2, '#ffd166');
      const cols = ['#e4572e', '#3bb273', '#ffd166', '#7fd1ff'];
      for (let i = 0; i < 14; i++) {
        const s = (p - 0.68) / 0.32;
        px(c, 26 + Math.cos(i) * s * 22, 50 - Math.sin(i * 1.7) * s * 20 + s * s * 14, 2, 2, cols[i % 4]);
      }
      c.fillStyle = '#fff';
      c.font = 'bold 10px monospace';
      c.fillText('!!', 40, 44 - jump);
    }
  },

  hack(c, t, r) {
    px(c, 0, 0, REEL_W, REEL_H, r.bg);
    px(c, 4, 30, 46, 46, '#e9dcc2');
    const step = Math.floor(loop(t * r.speed, 4) * 4);
    const shirt = r.accent;
    if (step === 0) {
      px(c, 15, 40, 24, 28, shirt);
      px(c, 7, 40, 8, 9, shirt);
      px(c, 39, 40, 8, 9, shirt);
      px(c, 23, 40, 8, 3, '#e9dcc2');
    } else if (step === 1) {
      px(c, 15, 40, 24, 28, shirt);
      px(c, 39, 40, 8, 9, shirt);
      px(c, 15, 44, 8, 24, 'rgba(0,0,0,0.2)');
    } else if (step === 2) {
      px(c, 15, 40, 24, 28, shirt);
      px(c, 15, 44, 8, 24, 'rgba(0,0,0,0.2)');
      px(c, 31, 44, 8, 24, 'rgba(0,0,0,0.2)');
    } else {
      px(c, 15, 52, 24, 16, shirt);
      px(c, 15, 52, 24, 2, 'rgba(0,0,0,0.25)');
      // sparkle
      const s = Math.floor(t * 6) % 2;
      px(c, 42, 46 - s, 1, 5, '#fff');
      px(c, 40, 48 - s, 5, 1, '#fff');
    }
    // hands
    px(c, 10 + step * 6, 74, 6, 5, '#e0ac69');
    c.fillStyle = '#fff';
    c.font = 'bold 9px monospace';
    c.fillText(`${step + 1}/4`, 4, 22);
  },

  quote(c, t, r) {
    const bands = ['#2b1e4a', '#4a2457', '#7a2f5a', '#b8475a', '#e4572e', '#f2a541', '#ffd166'];
    bands.forEach((b, i) => px(c, 0, i * 10, REEL_W, 10, b));
    const sy = 62 - Math.sin(t * 0.8) * 3;
    c.fillStyle = '#fff1c1';
    c.beginPath();
    c.arc(27, sy, 10, Math.PI, 0);
    c.fill();
    px(c, 0, 62, REEL_W, REEL_H - 62, '#1b1f3b');
    for (let i = 0; i < 6; i++) px(c, 6 + i * 8 + Math.sin(t + i) * 2, 66 + (i % 3) * 6, 5, 1, 'rgba(255,209,102,0.5)');
    // birds
    const bx = loop(t * 0.2, 1) * 70 - 8;
    px(c, bx, 20, 2, 1, '#1b1f3b');
    px(c, bx + 3, 20, 2, 1, '#1b1f3b');
    px(c, bx + 2, 21, 1, 1, '#1b1f3b');
  },

  skate(c, t, r) {
    px(c, 0, 0, REEL_W, REEL_H, '#7fb8d6');
    px(c, 0, 72, REEL_W, REEL_H - 72, '#8a8f99');
    px(c, 0, 72, REEL_W, 2, '#5c616b');
    // clouds
    const cx = loop(t * 0.1, 1) * 80 - 20;
    px(c, cx, 14, 14, 4, '#fff');
    px(c, cx + 3, 11, 8, 3, '#fff');
    // cone
    px(c, 25, 64, 4, 8, '#f2a541');
    px(c, 23, 70, 8, 2, '#f2a541');
    px(c, 25, 67, 4, 1, '#fff');
    const p = loop(t * r.speed, 2.2);
    const x = -8 + p * 66;
    const air = x > 12 && x < 34 ? Math.sin(((x - 12) / 22) * Math.PI) * 16 : 0;
    person(c, x, 69 - air, r.accent, air > 4 ? 3 : 0);
    px(c, x - 2, 69 - air, 11, 2, '#3a2c22');
    px(c, x - 1, 71 - air, 2, 1, '#111');
    px(c, x + 6, 71 - air, 2, 1, '#111');
  },

  slime(c, t, r) {
    px(c, 0, 0, REEL_W, REEL_H, '#f3e9ff');
    px(c, 0, 70, REEL_W, REEL_H - 70, '#d9c9ef');
    const layers = ['#f7a1c4', '#7fd1ff', '#ffd166', '#a6e3a1', '#c3a6ff'];
    const p = loop(t * r.speed, 2.4);
    const slices = Math.floor(p * 5);
    // the remaining block
    const left = 10 + slices * 6;
    layers.forEach((col, i) => px(c, left, 46 + i * 5, 44 - left, 5, col));
    // fallen slices
    for (let s = 0; s < slices; s++) layers.forEach((col, i) => px(c, 4 + s * 6 - s * 1.5, 47 + i * 5 + s * 0.6, 5, 5, col));
    // knife
    const kp = (p * 5) % 1;
    const ky = 18 + Math.min(1, kp * 1.6) * 26;
    px(c, left - 1, ky, 2, 26, '#cfd6e6');
    px(c, left - 3, ky - 8, 6, 8, '#3a2c22');
  },
};

export function drawReel(c: Ctx, reel: Reel, t: number) {
  c.imageSmoothingEnabled = false;
  c.save();
  try {
    DRAW[reel.kind](c, t, reel);
  } catch {
    px(c, 0, 0, REEL_W, REEL_H, reel.bg);
  }
  c.restore();
}
