// Pixel-art textures for ANGRY MUM MODE (red-faced sheet, steam, fiery aura, giant
// yell text, countdown numbers, shout bubbles, the "soul" gag, peeking eyes…).
// Like homeFx, everything is drawn into canvases and registered as plain textures,
// so the sprites using them are ordinary Images — the 3D diorama mirrors them too.
import type Phaser from 'phaser';
import type { Appearance } from '../domain/types';
import { kindForRole } from './art/characters';
import { ellipse, hexToRgb, makeCanvas, outlineOuter, px, ramp, rect } from './art/draw';
import { drawPixelText, measurePixelText } from './art/pixelFont';
import { OUTLINE } from './art/palette';

const FW = 16;
const FH = 24;

function add(scene: Phaser.Scene, key: string, c: HTMLCanvasElement) {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, c);
}

const clean = (t: string) => t.replace(/…/g, '...').replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

/** Big outlined pixel word (optionally on a spiky burst). */
export function bigWord(text: string, fill: string, scale = 3, burst?: string, outline = OUTLINE): HTMLCanvasElement {
  const t = clean(text);
  const w = measurePixelText(t, scale) + 8;
  const h = 5 * scale + 8;
  const bw = burst ? w + 16 : w;
  const bh = burst ? h + 12 : h;
  const [c, ctx] = makeCanvas(bw, bh);
  if (burst) {
    ctx.fillStyle = burst;
    ctx.beginPath();
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = i % 2 ? 0.62 : 1;
      const x = bw / 2 + Math.cos(a) * (bw / 2) * r;
      const y = bh / 2 + Math.sin(a) * (bh / 2) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  const ox = (bw - w) / 2 + 4;
  const oy = (bh - h) / 2 + 4;
  const o = Math.max(1, Math.round(scale / 2));
  for (let dx = -o; dx <= o; dx++) for (let dy = -o; dy <= o + 1; dy++) if (dx || dy) drawPixelText(ctx, t, ox + dx, oy + dy, outline, scale);
  drawPixelText(ctx, t, ox, oy, fill, scale);
  return c;
}

/** A speech bubble with a tail; `loud` = red spiky shout. */
function bubble(text: string, loud: boolean): HTMLCanvasElement {
  const t = clean(text);
  const words = t.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measurePixelText(next, 1) > 64 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  const tw = Math.max(...lines.map((l) => measurePixelText(l, 1)));
  const w = tw + 8;
  const h = lines.length * 7 + 5;
  const [c, ctx] = makeCanvas(w + 2, h + 6);
  const bg = loud ? '#ff5a4a' : '#ffffff';
  rect(ctx, 1, 0, w, h, bg);
  rect(ctx, 0, 1, w + 2, h - 2, bg);
  // tail
  for (let i = 0; i < 4; i++) rect(ctx, 6 + i, h + i, 4 - i, 1, bg);
  if (loud) {
    // spikes
    for (let x = 3; x < w - 2; x += 6) {
      px(ctx, x, 0, '#ffe14d');
      px(ctx, x + 3, h - 1, '#ffe14d');
    }
  }
  lines.forEach((l, i) => drawPixelText(ctx, l, 5, 3 + i * 7, loud ? '#ffffff' : '#2a2238', 1));
  outlineOuter(c, OUTLINE, 1);
  return c;
}

function steam(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(9, 8);
  ellipse(ctx, 0, 2, 6, 5, '#f4f4f8');
  ellipse(ctx, 3, 0, 6, 6, '#ffffff');
  ellipse(ctx, 4, 3, 5, 5, '#e2e4ee');
  outlineOuter(c, '#8a8fa8', 0.6);
  return c;
}

function aura(seed: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(44, 52);
  const g = ctx.createRadialGradient(22, 32, 3, 22, 30, 24);
  g.addColorStop(0, 'rgba(255,240,140,0.95)');
  g.addColorStop(0.35, 'rgba(255,150,40,0.8)');
  g.addColorStop(0.7, 'rgba(230,40,20,0.55)');
  g.addColorStop(1, 'rgba(160,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(22, 32, 20, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  // flame tongues
  for (let i = 0; i < 7; i++) {
    const x = 5 + i * 5.5 + ((seed + i) % 2) * 2;
    const hgt = 14 + ((i * 7 + seed * 5) % 12);
    const fg = ctx.createLinearGradient(x, 32 - hgt, x, 32);
    fg.addColorStop(0, 'rgba(255,80,20,0)');
    fg.addColorStop(0.5, 'rgba(255,120,30,0.7)');
    fg.addColorStop(1, 'rgba(255,220,90,0.9)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(x - 3, 32);
    ctx.quadraticCurveTo(x - 2 + ((seed + i) % 3) - 1, 32 - hgt * 0.6, x + ((seed * 3 + i) % 3) - 1, 32 - hgt);
    ctx.quadraticCurveTo(x + 2, 32 - hgt * 0.5, x + 3, 32);
    ctx.fill();
  }
  return c;
}

function eyes(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(10, 5);
  rect(ctx, 0, 0, 10, 5, 'rgba(0,0,0,0.85)');
  for (const x of [1, 6]) {
    rect(ctx, x, 1, 3, 3, '#ffffff');
    px(ctx, x + 1, 2, '#111111');
  }
  return c;
}

function cone(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(48, 30);
  const g = ctx.createLinearGradient(0, 15, 48, 15);
  g.addColorStop(0, 'rgba(255,240,150,0.65)');
  g.addColorStop(1, 'rgba(255,240,150,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 15);
  ctx.lineTo(48, 0);
  ctx.lineTo(48, 30);
  ctx.closePath();
  ctx.fill();
  return c;
}

function puddle(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(30, 12);
  ellipse(ctx, 0, 1, 30, 10, 'rgba(110,180,255,0.55)');
  ellipse(ctx, 5, 3, 14, 5, 'rgba(190,225,255,0.6)');
  px(ctx, 8, 4, '#ffffff');
  px(ctx, 20, 6, '#ffffff');
  return c;
}

function cushion(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(9, 7);
  rect(ctx, 1, 1, 7, 5, '#e86a9a');
  rect(ctx, 2, 2, 5, 3, '#f59abb');
  px(ctx, 0, 0, '#e86a9a');
  px(ctx, 8, 0, '#e86a9a');
  px(ctx, 0, 6, '#e86a9a');
  px(ctx, 8, 6, '#e86a9a');
  outlineOuter(c, OUTLINE, 0.9);
  return c;
}

function snack(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(12, 6);
  ellipse(ctx, 0, 2, 12, 4, '#f4f4f8');
  for (const x of [2, 5, 8]) {
    ellipse(ctx, x, 0, 3, 3, '#c98b4a');
    px(ctx, x + 1, 1, '#6b3a1b');
  }
  outlineOuter(c, OUTLINE, 0.9);
  return c;
}

function clockHand(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(3, 9);
  rect(ctx, 1, 0, 1, 5, '#e04b4b');
  return c;
}

function pixel(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(1, 1);
  px(ctx, 0, 0, '#ffffff');
  return c;
}

export function ensureAngryTextures(scene: Phaser.Scene) {
  add(scene, 'am:steam', steam());
  add(scene, 'am:aura0', aura(0));
  add(scene, 'am:aura1', aura(1));
  add(scene, 'am:eyes', eyes());
  add(scene, 'am:cone', cone());
  add(scene, 'am:wet', puddle());
  add(scene, 'am:cushion', cushion());
  add(scene, 'am:snack', snack());
  add(scene, 'am:hand', clockHand());
  add(scene, 'am:px', pixel());
  add(scene, 'am:zzz', bigWord('ZZZ', '#bcd4ff', 1));
  add(scene, 'am:hiss', bigWord('HSSSS...', '#ffffff', 1));
  add(scene, 'am:thud', bigWord('THUD!', '#ffe14d', 2, '#e04b4b'));
  add(scene, 'am:gotcha', bigWord('GOTCHA!', '#ffffff', 2, '#e04b4b'));
  add(scene, 'am:smirk', bigWord('HEH HEH', '#ffe14d', 1));
  add(scene, 'am:nod', bigWord('MM-HMM', '#ffffff', 1));
}

let seq = 0;
/** Register (once) a texture for arbitrary text and return its key. */
export function textTexture(scene: Phaser.Scene, kind: 'yell' | 'count' | 'title' | 'bubble' | 'loud', text: string): string {
  const key = `am:${kind}:${text}`;
  if (scene.textures.exists(key)) return key;
  let c: HTMLCanvasElement;
  if (kind === 'yell') c = bigWord(text, '#ffe14d', 3, '#d81e1e');
  else if (kind === 'count') c = bigWord(text, '#ffffff', 5, undefined, '#7a0a0a');
  else if (kind === 'title') c = bigWord(text, '#ffffff', 2, '#ff3b1f');
  else c = bubble(text, kind === 'loud');
  scene.textures.addCanvas(key, c);
  seq++;
  return key;
}

/** Red-faced, furrowed-brow version of a 16x24 character sheet (frames 0..15 kept). */
export function angrySheet(scene: Phaser.Scene, charKey: string, appearance: Appearance | undefined, role: string): string {
  const key = `${charKey}:angry`;
  if (scene.textures.exists(key) || !scene.textures.exists(charKey)) return scene.textures.exists(key) ? key : charKey;
  const src = scene.textures.get(charKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const [c, ctx] = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const skin = ramp(appearance?.skin || '#e8b48a').map((h) => hexToRgb(h));
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const near = skin.some(([sr, sg, sb]) => Math.abs(sr - r) + Math.abs(sg - g) + Math.abs(sb - b) < 48);
    if (!near) continue;
    d[i] = Math.min(255, r * 0.55 + 255 * 0.45);
    d[i + 1] = Math.round(g * 0.42);
    d[i + 2] = Math.round(b * 0.38);
  }
  ctx.putImageData(img, 0, 0);
  // furrowed brows + a shouting mouth on the front-facing frames
  const kind = kindForRole(role);
  const headTop = kind === 'child' ? 6 : kind === 'elder' ? 4 : 3;
  const eyeRow = kind === 'child' ? 5 : 6;
  for (let col = 0; col < 4; col++) {
    const ox = col * FW;
    const hy = headTop + (col === 1 || col === 3 ? 0 : 0);
    const brow = '#3a1010';
    const ey = hy + eyeRow;
    // left brow slants down toward the nose, right brow mirrors it
    px(ctx, ox + 4, ey - 2, brow);
    px(ctx, ox + 5, ey - 2, brow);
    px(ctx, ox + 6, ey - 1, brow);
    px(ctx, ox + 11, ey - 2, brow);
    px(ctx, ox + 10, ey - 2, brow);
    px(ctx, ox + 9, ey - 1, brow);
    // open shouting mouth
    rect(ctx, ox + 7, ey + 2, 2, 2, '#5a0f18');
    px(ctx, ox + 7, ey + 3, '#e86a7a');
  }
  const tex = scene.textures.addCanvas(key, c);
  if (tex) for (let i = 0; i < 16; i++) tex.add(i, 0, (i % 4) * FW, Math.floor(i / 4) * FH, FW, FH);
  return key;
}

/** Translucent ghostly copy of the player's front frame (the "soul leaves the body" gag). */
export function soulTexture(scene: Phaser.Scene, charKey: string): string {
  const key = `${charKey}:soul`;
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists(charKey)) return 'am:steam';
  const src = scene.textures.get(charKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const [c, ctx] = makeCanvas(FW, FH);
  ctx.drawImage(src, 0, 0, FW, FH, 0, 0, FW, FH);
  const img = ctx.getImageData(0, 0, FW, FH);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    d[i] = 200 + l * 0.2;
    d[i + 1] = 225 + l * 0.1;
    d[i + 2] = 255;
    d[i + 3] = 170;
  }
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(key, c);
  return key;
}
