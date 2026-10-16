// Shared golden-hour neighbourhood used by S01 (establishing) and S03 (step out).
// World units are game pixels. Draw with a camera transform (zoom ≈ 1.6–6 on a scale-2 canvas).
import { drawChar, drawPropAt, prop, fillTiles, fx, drawIcon, type Dir } from '../lib/art';
import { rand } from '../lib/stage';

// ---------- layout ----------
export const HORIZON = 88; // world y where the sky meets the hedge line
export const BASE = 160; // building base line
export const SIDE1 = 168; // north sidewalk top
export const ROAD = 200; // road top (3 tiles)
export const SIDE2 = 248; // south sidewalk top
export const VERGE = 280; // front verge top
export const WORLD_W = 800;
export const CROSS_X = 176; // crosswalk left edge (2 tiles wide)
export const DOOR_X = 160; // player's front door centre
export const DOOR_Y = 160;

type Placed = { key: string; x: number; y: number };
export const BUILDINGS: Placed[] = [
  { key: 'house-b', x: 52, y: BASE },
  { key: 'house-player', x: 160, y: BASE },
  { key: 'house-a', x: 252, y: BASE },
  { key: 'store-front', x: 372, y: BASE },
  { key: 'kiosk', x: 476, y: BASE },
  { key: 'house-b', x: 588, y: BASE },
  { key: 'house-a', x: 672, y: BASE },
];
export const TREES: Placed[] = [
  { key: 'tree', x: 104, y: BASE + 2 },
  { key: 'tree-small', x: 300, y: BASE + 2 },
  { key: 'tree', x: 532, y: BASE + 3 },
  { key: 'tree-small', x: 720, y: BASE + 2 },
  { key: 'tree', x: 760, y: BASE + 4 },
  { key: 'tree-small', x: -6, y: BASE + 2 },
];
export const SMALL: Placed[] = [
  { key: 'flower-bed', x: 124, y: BASE + 7 },
  { key: 'flower-bed', x: 198, y: BASE + 7 },
  { key: 'bush', x: 218, y: BASE + 6 },
  { key: 'flower-bed', x: 286, y: BASE + 7 },
  { key: 'bench', x: 432, y: BASE + 8 },
  { key: 'bush', x: 508, y: BASE + 6 },
  { key: 'flower-bed', x: 626, y: BASE + 7 },
  { key: 'mailbox', x: 230, y: SIDE1 + 14 },
];
export const LAMPS = [96, 312, 520, 700, 236];

// ---------- static ground (cached) ----------
let groundCache: HTMLCanvasElement | null = null;
export function ground(): HTMLCanvasElement {
  if (groundCache) return groundCache;
  const c = document.createElement('canvas');
  c.width = WORLD_W + 64;
  c.height = 360;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const ox = 32; // allow x from -32
  g.translate(ox, 0);
  const cols = Math.ceil((WORLD_W + 64) / 16) + 1;
  fillTiles(g, 'hedge', -32, HORIZON - 8, cols, 1);
  fillTiles(g, 'road', -32, HORIZON + 8, cols, 2); // back road (bus lane, mostly hidden)
  fillTiles(g, 'grass', -32, HORIZON + 40, cols, 3);
  for (let i = 0; i < cols; i++) if (rand(i, 3) < 0.35) fillTiles(g, 'grassFlowers', -32 + i * 16, HORIZON + 40 + 16 * Math.floor(rand(i, 4) * 3), 1, 1);
  fillTiles(g, 'sidewalk', -32, SIDE1, cols, 2);
  fillTiles(g, 'road', -32, ROAD, cols, 1);
  fillTiles(g, 'roadLine', -32, ROAD + 16, cols, 1);
  fillTiles(g, 'road', -32, ROAD + 32, cols, 1);
  fillTiles(g, 'sidewalk', -32, SIDE2, cols, 2);
  fillTiles(g, 'grass', -32, VERGE, cols, 5);
  for (let i = 0; i < cols; i++) if (rand(i, 8) < 0.4) fillTiles(g, 'grassFlowers', -32 + i * 16, VERGE + 16 * Math.floor(1 + rand(i, 9) * 3), 1, 1);
  fillTiles(g, 'crosswalk', CROSS_X, ROAD, 2, 3);
  // garden path from each house door
  fillTiles(g, 'path', DOOR_X - 8, BASE, 1, 1);
  fillTiles(g, 'path', 252 - 8, BASE, 1, 1);
  fillTiles(g, 'doormat', 372 - 8, BASE, 1, 1);
  groundCache = c;
  return c;
}

// ---------- silhouettes for long shadows ----------
const silCache = new Map<string, HTMLCanvasElement>();
function silhouette(src: HTMLCanvasElement, key: string) {
  let c = silCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#2a1430';
  g.fillRect(0, 0, c.width, c.height);
  silCache.set(key, c);
  return c;
}

/** Long golden-hour shadow cast down-right of a bottom-centred sprite. */
export function castShadow(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, key: string, x: number, y: number, len = 0.9, alpha = 0.3) {
  const s = silhouette(src, key);
  const H = s.height;
  const X0 = Math.round(x - s.width / 2);
  const k = 1.15 * len;
  const m = 0.32 * len;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.transform(1, 0, -k, -m, X0 + k * H, y + m * H);
  ctx.drawImage(s, 0, 0);
  ctx.restore();
}

// ---------- sky + parallax ----------
export interface Cam {
  cx: number;
  cy: number;
  z: number;
}
export const toScreen = (cam: Cam, w: number, h: number, wx: number, wy: number) => [w / 2 + (wx - cam.cx) * cam.z, h / 2 + (wy - cam.cy) * cam.z] as const;

const cloudCache = new Map<number, HTMLCanvasElement>();
function cloudSprite(seed: number) {
  let c = cloudCache.get(seed);
  if (c) return c;
  const W = 56, H = 20;
  c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const blobs: [number, number, number][] = [];
  const n = 4 + Math.floor(rand(seed, 1) * 3);
  for (let i = 0; i < n; i++) {
    const r = 4 + rand(seed, i + 2) * 5 * (1 - Math.abs(i - (n - 1) / 2) / n);
    blobs.push([8 + (i * (W - 16)) / (n - 1), H - 4 - r * 0.7, r]);
  }
  const inside = (x: number, y: number, grow = 0) => blobs.some(([bx, by, r]) => (x - bx) ** 2 + (y - by) ** 2 <= (r + grow) ** 2) && y <= H - 4;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const lit = !inside(x - 1.5, y - 2.5);
      const under = y > H - 8 && !inside(x + 0.5, y + 2.5);
      g.fillStyle = under ? '#e2857f' : lit ? '#fff1dc' : y > H - 9 ? '#f6b597' : '#ffd3b0';
      g.fillRect(x, y, 1, 1);
    }
  cloudCache.set(seed, c);
  return c;
}
function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, seed: number) {
  const c = cloudSprite(seed);
  const k = Math.max(1, Math.round(s * 2) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, Math.round(x - (c.width * k) / 2), Math.round(y - c.height * k), Math.round(c.width * k), Math.round(c.height * k));
}

/** Screen-space sky, sun, clouds, distant skyline + treeline (parallax), birds. */
export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number, cam: Cam, birds = true): [number, number] {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const [, hy] = toScreen(cam, w, h, 0, HORIZON);
  const g = ctx.createLinearGradient(0, hy - 420, 0, hy);
  g.addColorStop(0, '#2a2459');
  g.addColorStop(0.35, '#7a3f78');
  g.addColorStop(0.62, '#e0646a');
  g.addColorStop(0.85, '#f9a25a');
  g.addColorStop(1, '#ffd889');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, Math.ceil(hy) + 2);

  // sun (far layer)
  const pFar = 0.25;
  const sunX = w * 0.22 - (cam.cx - 300) * cam.z * pFar;
  const sunY = hy - 58 * (cam.z / 2);
  const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 360);
  sg.addColorStop(0, 'rgba(255,236,170,0.95)');
  sg.addColorStop(0.15, 'rgba(255,200,120,0.55)');
  sg.addColorStop(1, 'rgba(255,140,90,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, hy + 40);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fff4cf';
  const sr = Math.round(22 * (cam.z / 2));
  ctx.beginPath();
  ctx.arc(Math.round(sunX), Math.round(sunY), sr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe39a';
  ctx.fillRect(Math.round(sunX - sr), Math.round(sunY + sr * 0.35), sr * 2, 2);
  ctx.fillRect(Math.round(sunX - sr), Math.round(sunY + sr * 0.6), sr * 2, 2);

  // clouds — slow drift + parallax
  for (let i = 0; i < 9; i++) {
    const p = 0.12 + rand(i, 21) * 0.15;
    const span = w + 400;
    const x = ((rand(i, 22) * span + frame * (0.25 + p) - (cam.cx - 300) * cam.z * p) % span + span) % span - 200;
    const y = hy - 70 - rand(i, 23) * 220 * (cam.z / 2);
    cloud(ctx, x, y, (2 + rand(i, 24) * 1.6) * (cam.z / 2), i);
  }

  // distant skyline (purple haze)
  const layer = (p: number, color: string, seed: number, minH: number, maxH: number, step: number) => {
    ctx.fillStyle = color;
    const z = cam.z * (0.6 + p * 0.4);
    const off = -(cam.cx - 300) * z * p;
    for (let i = -2; i < 70; i++) {
      const bw = step * z;
      const x = Math.round(off + i * bw - 100);
      if (x > w + 50 || x + bw < -50) continue;
      const bh = (minH + rand(i, seed) * (maxH - minH)) * z;
      ctx.fillRect(x, Math.round(hy - bh), Math.ceil(bw) + 1, Math.ceil(bh) + 1);
      if (rand(i, seed + 1) < 0.35) ctx.fillRect(Math.round(x + bw * 0.4), Math.round(hy - bh - 6 * z), Math.max(2, Math.round(2 * z)), Math.round(6 * z));
    }
  };
  layer(0.3, '#9a5a86', 31, 10, 34, 14);
  // windows twinkling in the skyline
  ctx.fillStyle = 'rgba(255,214,140,0.8)';
  for (let i = 0; i < 40; i++) {
    if (rand(i, 40 + Math.floor(frame / 20)) < 0.25) continue;
    const z = cam.z * 0.72;
    const x = Math.round(-(cam.cx - 300) * z * 0.3 + rand(i, 41) * 1400 - 200);
    const y = Math.round(hy - (3 + rand(i, 42) * 12) * z);
    ctx.fillRect(x, y, 2, 2);
  }
  // near treeline
  ctx.fillStyle = '#6b3f5a';
  {
    const z = cam.z * 0.9;
    const off = -(cam.cx - 300) * z * 0.6;
    for (let i = -4; i < 120; i++) {
      const x = off + i * 7 * z - 200;
      if (x > w + 40 || x < -60) continue;
      const r = (6 + rand(i, 51) * 7) * z;
      ctx.beginPath();
      ctx.arc(Math.round(x), Math.round(hy - r * 0.35), r, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillRect(0, Math.round(hy - 2), w, 4);
  }

  // birds
  if (birds) {
    ctx.fillStyle = '#2a1430';
    for (let b = 0; b < 6; b++) {
      const t = frame + b * 3;
      const bx = w * 1.1 - t * (3.2 + (b % 3) * 0.3) + (b % 2) * 26 + b * 18;
      const by = hy - 150 - b * 9 + Math.sin(t / 9 + b) * 6 + (b % 2) * 12;
      const flap = Math.floor((t + b * 2) / 4) % 2;
      const s = 2;
      if (flap) {
        ctx.fillRect(bx - 3 * s, by - s, 2 * s, s);
        ctx.fillRect(bx - s, by, 2 * s, s);
        ctx.fillRect(bx + s, by - s, 2 * s, s);
      } else {
        ctx.fillRect(bx - 3 * s, by + s, 2 * s, s);
        ctx.fillRect(bx - s, by, 2 * s, s);
        ctx.fillRect(bx + s, by + s, 2 * s, s);
      }
    }
  }
  ctx.restore();
  return [sunX, sunY];
}

// ---------- world ----------
export interface Walker {
  who: string;
  x: number; // start x
  y: number; // lane base y
  v: number; // px per frame (sign = direction)
}
export const FOLK: Walker[] = [
  { who: 'folk0', x: 60, y: SIDE1 + 22, v: 0.45 },
  { who: 'folk2', x: 470, y: SIDE1 + 14, v: -0.38 },
  { who: 'folk5', x: 330, y: SIDE1 + 26, v: 0.25 },
  { who: 'folk1', x: 690, y: SIDE2 + 18, v: -0.5 },
  { who: 'folk6', x: 250, y: SIDE2 + 26, v: 0.55 },
  { who: 'folk4', x: 560, y: SIDE2 + 22, v: 0.32 },
  { who: 'folk3', x: 720, y: SIDE1 + 29, v: -0.42 },
  { who: 'folk7', x: 20, y: SIDE2 + 20, v: 0.4 },
];

export function walkerPos(wk: Walker, frame: number, active = 1) {
  const span = WORLD_W + 120;
  const x = ((((wk.x + wk.v * frame * active + 60) % span) + span) % span) - 60;
  return x;
}

export function drawCharShadowed(ctx: CanvasRenderingContext2D, who: string, x: number, y: number, dir: Dir, step: number, walking: boolean, scale = 1) {
  // long shadow streak to the right
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#2a1430';
  ctx.beginPath();
  ctx.moveTo(x - 4 * scale, y - 1);
  ctx.lineTo(x + 4 * scale, y - 1);
  ctx.lineTo(x + 24 * scale, y + 7 * scale);
  ctx.lineTo(x + 16 * scale, y + 8 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  drawChar(ctx, who, x, y, dir, step, walking, scale);
}

export interface CarState {
  key: string;
  x: number;
  lane: 'east' | 'west';
}

export function drawCar(ctx: CanvasRenderingContext2D, c: CarState, frame: number) {
  const img = prop(c.key);
  const y = c.lane === 'east' ? ROAD + 40 : ROAD + 22; // bottom y
  const s = silhouette(img, c.key);
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.drawImage(s, Math.round(c.x - 16 + 6), y - 14, 32, 18);
  ctx.restore();
  ctx.save();
  if (c.lane === 'west') {
    ctx.translate(Math.round(c.x), 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -16, y - 18);
  } else ctx.drawImage(img, Math.round(c.x - 16), y - 18);
  ctx.restore();
  // headlight glints
  void frame;
}

export interface TownOpts {
  frame: number;
  folkActive?: number; // 0..1 how far folk have walked (ramp-in)
  cars?: CarState[];
  busX?: number | null;
  extra?: (ctx: CanvasRenderingContext2D) => void; // actors on sidewalks/road (after folk)
  lampsOn?: number;
  hideFolk?: (w: Walker) => boolean;
}

/** World pass: ground, back road bus, shadows, buildings, trees, folk, cars, extras. */
export function drawTown(ctx: CanvasRenderingContext2D, o: TownOpts) {
  const { frame } = o;
  ctx.drawImage(ground(), -32, 0);
  // distant bus on the back road (behind the building row)
  if (o.busX != null) {
    const bus = prop('bus');
    ctx.drawImage(bus, Math.round(o.busX - 40), HORIZON + 34 - bus.height);
  }
  // long shadows
  for (const b of [...TREES, ...BUILDINGS]) castShadow(ctx, prop(b.key), b.key, b.x, b.y, 0.8, 0.26);
  for (const lx of LAMPS) castShadow(ctx, prop('streetlamp'), 'streetlamp', lx, SIDE1 + 6, 0.9, 0.3);
  // buildings + back trees (sorted by y)
  const row = [...BUILDINGS, ...TREES].sort((a, b) => a.y - b.y);
  for (const p of row) {
    // tree sway: draw slightly offset canopy by frame
    drawPropAt(ctx, p.key, p.x, p.y);
  }
  for (const p of SMALL) drawPropAt(ctx, p.key, p.x, p.y);
  // folk + cars + extras, sorted by lane
  const folk = FOLK.filter((f) => !o.hideFolk?.(f));
  const north = folk.filter((f) => f.y < ROAD);
  const south = folk.filter((f) => f.y >= ROAD);
  for (const f of north) {
    const x = walkerPos(f, frame, o.folkActive ?? 1);
    drawCharShadowed(ctx, f.who, x, f.y, f.v > 0 ? 'right' : 'left', frame / 5 + f.x, true);
  }
  for (const lx of LAMPS) drawPropAt(ctx, 'streetlamp', lx, SIDE1 + 6);
  for (const c of o.cars ?? []) if (c.lane === 'west') drawCar(ctx, c, frame);
  for (const c of o.cars ?? []) if (c.lane === 'east') drawCar(ctx, c, frame);
  o.extra?.(ctx);
  for (const f of south) {
    const x = walkerPos(f, frame, o.folkActive ?? 1);
    drawCharShadowed(ctx, f.who, x, f.y, f.v > 0 ? 'right' : 'left', frame / 5 + f.x, true);
  }
  // lamp glow (dusk)
  if (o.lampsOn) {
    for (const lx of LAMPS) {
      const gl = prop('lamp-glow');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = o.lampsOn;
      ctx.drawImage(gl, lx - 24, SIDE1 + 6 - 58);
      ctx.restore();
    }
  }
  // drifting sparkle motes in the warm air
  for (let i = 0; i < 18; i++) {
    const x = (rand(i, 61) * WORLD_W + frame * 0.3 + Math.sin(frame / 20 + i) * 6) % WORLD_W;
    const y = HORIZON + 20 + rand(i, 62) * 200 - ((frame * 0.2 + i * 13) % 40);
    const a = 0.3 + 0.3 * Math.sin(frame / 7 + i);
    ctx.fillStyle = `rgba(255,236,180,${a.toFixed(2)})`;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
}

/** Foreground silhouettes anchored to the bottom of the letterbox band, with strong parallax. */
export function drawForeground(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Cam, frame: number, alpha = 1, items: [string, number][] = FG_ITEMS) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  const z = cam.z * 1.7;
  const baseY = h - 52 + (176 - cam.cy) * cam.z * 0.5;
  for (const [key, wx] of items) {
    const img = prop(key);
    const s = silhouette(img, key);
    const dw = img.width * z;
    const dh = img.height * z;
    const sx = w / 2 + (wx - cam.cx) * cam.z * 1.45 + Math.sin(frame / 25 + wx) * 1.5;
    if (sx + dw < 0 || sx - dw > w) continue;
    const X = Math.round(sx - dw / 2);
    const Y = Math.round(baseY - dh + (key.startsWith('tree') ? dh * 0.25 : 0));
    ctx.drawImage(img, X, Y, Math.round(dw), Math.round(dh));
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * 0.72;
    ctx.drawImage(s, X, Y, Math.round(dw), Math.round(dh));
    ctx.globalAlpha = a0;
  }
  ctx.restore();
}
export const FG_ITEMS: [string, number][] = [
  ['tree', -10],
  ['bush', 70],
  ['bush', 330],
  ['bush', 346],
  ['tree-small', 480],
  ['bush', 640],
  ['tree', 760],
];

export function sparkleAt(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, s = 1) {
  const a = 0.5 + 0.5 * Math.sin(frame / 3);
  drawIcon(ctx, fx('sparkle'), x, y, s * (0.6 + 0.4 * a), a);
}

/** Warm golden-hour grade over the whole frame. */
export function goldenGrade(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number, amount = 1, sun: [number, number] = [96, 108]) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.28 * amount;
  ctx.fillStyle = '#ffb070';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, 0, w, h * 0.6);
  g.addColorStop(0, `rgba(255,170,90,${0.22 * amount})`);
  g.addColorStop(0.5, 'rgba(255,120,60,0.04)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // light rays from the sun (upper left)
  ctx.globalAlpha = 0.05 * amount * (0.8 + 0.2 * Math.sin(frame / 15));
  ctx.fillStyle = '#ffe0a0';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    const a0 = -0.05 + i * 0.12;
    ctx.moveTo(sun[0], sun[1]);
    ctx.lineTo(sun[0] + Math.cos(a0) * w * 1.4, sun[1] + Math.sin(a0) * w * 1.4);
    ctx.lineTo(sun[0] + Math.cos(a0 + 0.05) * w * 1.4, sun[1] + Math.sin(a0 + 0.05) * w * 1.4);
    ctx.fill();
  }
  ctx.restore();
}
