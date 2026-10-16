// Pixel-art textures for home-life moments (fights, naps, the alarm clock, TV).
// Everything is drawn into canvases and registered as plain textures, so the
// sprites that use them are ordinary Images — which the 3D diorama mirrors too.
import type Phaser from 'phaser';
import { makeCanvas, ellipse, rect, px, hline, outlineOuter, type Ctx } from './art/draw';
import { drawPixelText, measurePixelText } from './art/pixelFont';
import { OUTLINE } from './art/palette';

export const COMIC_WORDS = ['POW!', 'BIFF!', 'BONK!', 'WHACK!', 'OOF!'];
export const PILLOW_WORDS = ['FWUMP!', 'PAF!', 'FLUMP!'];
export const TV_FRAMES = 5;

function add(scene: Phaser.Scene, key: string, c: HTMLCanvasElement) {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, c);
}

function word(text: string, fill: string, burst?: string): HTMLCanvasElement {
  const s = 2;
  const w = measurePixelText(text, s) + 6;
  const h = 5 * s + 6;
  const bw = burst ? w + 10 : w;
  const bh = burst ? h + 8 : h;
  const [c, ctx] = makeCanvas(bw, bh);
  const ox = (bw - w) / 2 + 3;
  const oy = (bh - h) / 2 + 3;
  if (burst) {
    // spiky comic burst behind the word
    ctx.fillStyle = burst;
    ctx.beginPath();
    const cx = bw / 2;
    const cy = bh / 2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 0.55 : 1;
      const x = cx + Math.cos(a) * (bw / 2) * r;
      const y = cy + Math.sin(a) * (bh / 2) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1], [0, 2], [1, 2]])
    drawPixelText(ctx, text, ox + dx, oy + dy, OUTLINE, s);
  drawPixelText(ctx, text, ox, oy, fill, s);
  return c;
}

function star(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(13, 13);
  const rows = ['......#......', '.....###.....', '.....###.....', '#...#####...#', '.###########.', '..#########..', '...#######...', '..#########..', '.###########.', '#...#####...#', '.....###.....', '.....###.....', '......#......'];
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && px(ctx, x, y, '#ffe14d')));
  px(ctx, 6, 6, '#ffffff');
  px(ctx, 5, 5, '#fff6b0');
  outlineOuter(c, OUTLINE, 1);
  return c;
}

function dust(seed: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(44, 30);
  const puffs = [
    [8, 14, 10],
    [18, 9, 11],
    [30, 10, 10],
    [36, 18, 8],
    [24, 20, 11],
    [11, 21, 8],
  ];
  for (const [x, y, r] of puffs) ellipse(ctx, x - r + ((seed * 3 + x) % 3) - 1, y - r * 0.8, r * 2, r * 1.6, '#cfc6b8');
  for (const [x, y, r] of puffs) ellipse(ctx, x - r * 0.6 + ((seed + y) % 2), y - r * 0.6, r * 1.1, r * 0.9, '#ebe4d6');
  // cartoon limbs & a sneaker poking out of the cloud
  const limbs = seed % 2 ? [[2, 8], [40, 24], [38, 4]] : [[4, 25], [41, 9], [20, 1]];
  for (const [x, y] of limbs) {
    rect(ctx, x - 1, y - 1, 4, 3, '#f0c8a0');
    px(ctx, x + 2, y, '#d9a77c');
  }
  rect(ctx, seed % 2 ? 30 : 6, 26, 6, 3, '#e04b4b');
  hline(ctx, seed % 2 ? 30 : 6, 28, 6, '#ffffff');
  outlineOuter(c, OUTLINE, 1);
  return c;
}

function alarmClock(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(14, 14);
  // bells
  ellipse(ctx, 0, 0, 5, 4, '#ffd34d');
  ellipse(ctx, 9, 0, 5, 4, '#ffd34d');
  // body
  ellipse(ctx, 1, 2, 12, 11, '#e04b4b');
  ellipse(ctx, 3, 4, 8, 7, '#fff8e8');
  // hands at 7:00
  px(ctx, 7, 7, OUTLINE);
  px(ctx, 7, 6, OUTLINE);
  px(ctx, 7, 5, OUTLINE);
  px(ctx, 6, 8, OUTLINE);
  px(ctx, 5, 9, OUTLINE);
  // feet
  px(ctx, 3, 13, OUTLINE);
  px(ctx, 10, 13, OUTLINE);
  outlineOuter(c, OUTLINE, 1);
  return c;
}

/** 24x11 TV screen contents for each channel (+ a static frame). */
function tvFrame(i: number, alt: boolean): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(24, 11);
  switch (i) {
    case 0: // cartoon: sky, sun, hill, bouncing character
      rect(ctx, 0, 0, 24, 11, '#6ec6ff');
      ellipse(ctx, 18, 1, 4, 4, '#ffe14d');
      ellipse(ctx, -4, 6, 20, 10, '#5ccf6b');
      ellipse(ctx, 10, 7, 18, 9, '#47b45a');
      rect(ctx, alt ? 7 : 9, alt ? 3 : 4, 3, 3, '#ff7aa8');
      px(ctx, alt ? 8 : 10, alt ? 4 : 5, '#1b1325');
      break;
    case 1: // cooking show: orange set, pot with steam
      rect(ctx, 0, 0, 24, 11, '#f2a541');
      rect(ctx, 0, 8, 24, 3, '#a8643a');
      rect(ctx, 8, 5, 8, 4, '#6b6f80');
      hline(ctx, 7, 5, 10, '#9aa0b4');
      px(ctx, alt ? 10 : 12, 3, '#ffffff');
      px(ctx, alt ? 12 : 11, 2, '#ffffff');
      px(ctx, alt ? 13 : 14, 1, '#ffffff');
      break;
    case 2: // nature documentary: forest & a deer
      rect(ctx, 0, 0, 24, 11, '#a8e0b0');
      for (const x of [2, 7, 19]) {
        ellipse(ctx, x - 2, 1, 6, 6, '#2e7d4f');
        rect(ctx, x, 6, 1, 3, '#6b4a2b');
      }
      rect(ctx, 0, 9, 24, 2, '#4f9a55');
      rect(ctx, alt ? 11 : 12, 6, 4, 2, '#b07a46');
      px(ctx, alt ? 15 : 16, 5, '#b07a46');
      break;
    case 3: // game show: purple stage, flashing lights
      rect(ctx, 0, 0, 24, 11, '#5a2d82');
      for (let x = 1; x < 24; x += 3) px(ctx, x, 1, (x + (alt ? 1 : 0)) % 2 ? '#ffe14d' : '#ff5ab4');
      rect(ctx, 8, 4, 8, 5, '#2b175a');
      drawPixelText(ctx, '?', 11, 4, '#ffe14d');
      break;
    case 4: // music videos: equaliser bars
      rect(ctx, 0, 0, 24, 11, '#1a1033');
      for (let x = 1; x < 23; x += 3) {
        const hgt = 2 + ((x * 7 + (alt ? 5 : 0)) % 8);
        rect(ctx, x, 11 - hgt, 2, hgt, x % 2 ? '#ff5ab4' : '#5ad1ff');
      }
      break;
    default: // static
      for (let y = 0; y < 11; y++) for (let x = 0; x < 24; x++) px(ctx, x, y, (x * 13 + y * 7 + (alt ? 3 : 0)) % 5 < 2 ? '#d8dde8' : '#5a6070');
  }
  // scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 1; y < 11; y += 2) ctx.fillRect(0, y, 24, 1);
  return c;
}

function glow(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(72, 44);
  const g = ctx.createRadialGradient(36, 18, 2, 36, 22, 36);
  g.addColorStop(0, 'rgba(140,190,255,0.55)');
  g.addColorStop(0.5, 'rgba(90,130,230,0.22)');
  g.addColorStop(1, 'rgba(40,60,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 72, 44);
  return c;
}

/** Ensure all home-life textures exist (cheap to call on every scene create). */
export function ensureHomeTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('hl:star')) return;
  add(scene, 'hl:star', star());
  add(scene, 'hl:dust0', dust(0));
  add(scene, 'hl:dust1', dust(1));
  COMIC_WORDS.forEach((w, i) => add(scene, `hl:word${i}`, word(w, i % 2 ? '#ffe14d' : '#ffffff', i % 2 ? '#e04b4b' : '#ff9b3d')));
  PILLOW_WORDS.forEach((w, i) => add(scene, `hl:pword${i}`, word(w, '#ffffff', '#7ab8ff')));
  add(scene, 'hl:ring', word('RING!', '#ffe14d', '#e04b4b'));
  add(scene, 'hl:timeout', word('TIME-OUT', '#ffffff'));
  add(scene, 'hl:alarm', alarmClock());
  for (let i = 0; i <= TV_FRAMES; i++) {
    add(scene, `hl:tv${i}a`, tvFrame(i, false));
    add(scene, `hl:tv${i}b`, tvFrame(i, true));
  }
  add(scene, 'hl:glow', glow());
  const [f, fc] = makeCanvas(4, 3);
  rect(fc, 0, 1, 4, 1, '#ffffff');
  px(fc, 1, 0, '#e8eef8');
  px(fc, 2, 2, '#e8eef8');
  add(scene, 'hl:feather', f);
  const [t, tc] = makeCanvas(2, 3);
  px(tc, 0, 0, '#9fdcff');
  rect(tc, 0, 1, 2, 2, '#5ab4ff');
  add(scene, 'hl:tear', t);
  const [d, dc] = makeCanvas(1, 1);
  px(dc, 0, 0, '#ffffff');
  add(scene, 'hl:px', d);
}

/**
 * A simple "lying in bed" pose for a character sheet: head & shoulders on the pillow
 * (top of the down-facing idle frame, eyes closed) under a tucked-in blanket.
 */
export function lyingTexture(scene: Phaser.Scene, charKey: string): string {
  const key = `hl:lying:${charKey}`;
  if (scene.textures.exists(key)) return key;
  const frame = scene.textures.getFrame(charKey, 0);
  const [c, ctx] = makeCanvas(16, 26);
  if (frame) {
    const src = frame.source.image as CanvasImageSource;
    ctx.drawImage(src, frame.cutX, frame.cutY, 16, 13, 0, 0, 16, 13);
    // close the eyes: replace the darkest pixels in the face band with a lash line
    const img = ctx.getImageData(0, 6, 16, 5);
    for (let i = 0; i < img.data.length; i += 4) {
      const [r, g, b, a] = [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
      if (a > 0 && r + g + b < 140) {
        img.data[i] = 120;
        img.data[i + 1] = 80;
        img.data[i + 2] = 70;
      }
    }
    ctx.putImageData(img, 0, 6);
  }
  // blanket
  const top = 10;
  rect(ctx, 1, top, 14, 26 - top, '#4f6fbf');
  hline(ctx, 1, top, 14, '#9db4ee');
  hline(ctx, 1, top + 1, 14, '#7a95dc');
  for (let y = top + 4; y < 25; y += 5) hline(ctx, 3, y, 10, '#43609f');
  outlineOuter(c, OUTLINE, 1);
  scene.textures.addCanvas(key, c);
  return key;
}

export type { Ctx };
