// S04 · THE STORE (abs 420–600) — FreshMart. Beat-synced cuts (multiples of 15):
// a 0 arrive mid-whip · b 15 grab tomatoes · c 30 split-flap prices · d 45 basket ticker
// e 60 dairy fridge → SOLD OUT slam @72 · f 90 helper shrug · g 120 player thinks → face zoom.
import { AbsoluteFill } from 'remotion';
import { PixelCanvas, camera, prog, EASE, lerp, glow, rand, clamp, type DrawInfo } from '../lib/stage';
import { drawChar, drawPropAt, drawIcon, fillTiles, item, fx, prop, drawPixelText, measurePixelText, type Dir } from '../lib/art';
import { CUES } from '../timeline';
import { flash, panel, smear, phoneIcon, shopIcon } from './A_fx';

const FROM = 420;
const STAMP = CUES.soldOutStamp - FROM; // 72

// ---------- store world (cached floor + walls) ----------
const SW = 28 * 16;
let floorCache: HTMLCanvasElement | null = null;
function floor() {
  if (floorCache) return floorCache;
  const c = document.createElement('canvas');
  c.width = SW;
  c.height = 16 * 16;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  fillTiles(g, 'wallTop', 0, 0, 28, 1);
  fillTiles(g, 'wallFace', 0, 16, 28, 2);
  fillTiles(g, 'storeFloor', 0, 48, 28, 14);
  fillTiles(g, 'doormat', 12 * 16, 14 * 16, 2, 1);
  g.fillStyle = 'rgba(40,30,60,0.3)';
  g.fillRect(0, 47, SW, 2);
  floorCache = c;
  return c;
}

const VEG = { x: 120, y: 132 };
const DAIRY = { x: 232, y: 58 };
const HELPER = { x: 186, y: 88 };

function drawStore(ctx: CanvasRenderingContext2D, f: number, opts: { player?: { x: number; y: number; dir: Dir; walk: boolean }; helperDir?: Dir; emptySlot?: boolean; helperHop?: number; noFolk?: boolean } = {}) {
  ctx.drawImage(floor(), 0, 0);
  // wall dressing
  drawPropAt(ctx, 'store-banner', 120, 36);
  drawPropAt(ctx, 'store-banner', 330, 36);
  for (const x of [40, 400]) glow(ctx, x, 30, 30, '#fff2c0', 0.2);
  // wall shelves
  drawPropAt(ctx, 'shelf-bakery', 40, 58);
  drawPropAt(ctx, 'shelf-snacks', 88, 58);
  drawPropAt(ctx, 'shelf-snacks', 136, 58);
  drawPropAt(ctx, 'shelf-dairy', DAIRY.x, DAIRY.y);
  drawPropAt(ctx, 'shelf-dairy', DAIRY.x + 48, DAIRY.y);
  if (opts.emptySlot) {
    const slot = prop('shelf-dairy-empty-slot');
    ctx.drawImage(slot, DAIRY.x - 24 + 16, DAIRY.y - 32 + 6);
  }
  // helper restocking by the dairy fridge
  drawChar(ctx, 'helper', HELPER.x, HELPER.y - (opts.helperHop ?? 0), opts.helperDir ?? 'up', 0, false);
  // island shelves
  drawPropAt(ctx, 'shelf-veg', VEG.x, VEG.y);
  drawPropAt(ctx, 'shelf-snacks', VEG.x + 52, VEG.y);
  // checkout + queue
  drawChar(ctx, 'cashier', 352, 118, 'down', 0, false);
  drawPropAt(ctx, 'checkout', 352, 140);
  drawPropAt(ctx, 'queue-sign', 316, 160);
  drawPropAt(ctx, 'basket-stack', 404, 150);
  drawPropAt(ctx, 'plant', 420, 70);
  if (opts.player) drawChar(ctx, 'player', opts.player.x, opts.player.y, opts.player.dir, f / 4, opts.player.walk);
  // second row of islands
  drawPropAt(ctx, 'shelf-bakery', 60, 222);
  drawPropAt(ctx, 'shelf-snacks', 104, 222);
  drawPropAt(ctx, 'shelf-veg', 250, 222);
  // shopper ambience
  if (!opts.noFolk) {
    const sx = 60 + ((f * 0.6) % 120);
    drawChar(ctx, 'folk4', sx, 186, 'right', f / 5, true);
    drawChar(ctx, 'folk5', 250 - ((f * 0.4) % 60), 176, 'left', f / 5, true);
  }
  // overhead light pools
  for (const [x, y] of [
    [100, 110],
    [230, 110],
    [350, 120],
  ])
    glow(ctx, x, y, 70, '#fff0c8', 0.12);
}

function coolGrade(ctx: CanvasRenderingContext2D, w: number, h: number, a = 1) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.26 * a;
  ctx.fillStyle = '#ffc890';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ---------- SOLD OUT stamp (cached, distressed) ----------
let stampCache: HTMLCanvasElement | null = null;
function stamp() {
  if (stampCache) return stampCache;
  const s = 3;
  const tw = measurePixelText('SOLD OUT', s);
  const W = tw + 16 * 2;
  const H = 5 * s + 12 * 2;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const red = '#e0262b';
  g.fillStyle = red;
  g.fillRect(0, 0, W, H);
  g.clearRect(3, 3, W - 6, H - 6);
  g.fillRect(5, 5, W - 10, H - 10);
  g.clearRect(6, 6, W - 12, H - 12);
  drawPixelText(g, 'SOLD OUT', 16, 12, red, s);
  drawPixelText(g, 'SOLD OUT', 17, 12, red, s);
  // distress: knock out random pixels
  g.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rand(x, y, 99) < 0.05) g.fillRect(x, y, 1, 1);
  stampCache = c;
  return c;
}

// ---------- split-flap price tag ----------
function flapTag(ctx: CanvasRenderingContext2D, cx: number, cy: number, f: number, start: number, lock: number, price: string, icon: string, seed: number) {
  const p = prog(f, start, start + 6, EASE.back);
  if (p <= 0) return;
  const u = 3;
  const W = 72 * 1;
  const H = 34;
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.scale(p * u, p * u);
  // hanging string
  ctx.fillStyle = '#2a1430';
  ctx.fillRect(-1, -H / 2 - 30, 1, 14);
  // item above the tag
  drawIcon(ctx, item(icon), 0, -H / 2 - 30, 1.4);
  // card
  panel(ctx, -W / 2, -H / 2, W, H, 2, '#fff3dc');
  // split line + flap
  const cycling = f < lock;
  const step = Math.floor(f / 2);
  let txt = price;
  if (cycling) {
    const n = price.length - 1;
    txt = '₹' + Array.from({ length: n }, (_, i) => Math.floor(rand(step, i, seed) * 10)).join('');
  }
  const flapPhase = cycling ? (f % 2) / 2 : clamp((f - lock) / 4);
  const squash = cycling ? Math.abs(Math.cos(flapPhase * Math.PI)) : 1;
  const ts = 4;
  const tw = measurePixelText(txt, ts);
  ctx.save();
  ctx.scale(1, Math.max(0.15, squash));
  drawPixelText(ctx, txt, -tw / 2, -10, f >= lock ? '#c0392b' : '#2a1430', ts);
  ctx.restore();
  ctx.fillStyle = 'rgba(42,20,48,0.35)';
  ctx.fillRect(-W / 2 + 3, 0, W - 6, 1);
  // lock-in sparkle
  if (f >= lock && f < lock + 6) drawIcon(ctx, fx('sparkle'), W / 2 - 4, -H / 2 + 2, 1, 1 - (f - lock) / 6);
  ctx.restore();
}

const SHOTS = [0, 15, 30, 45, 60, 90, 120];

const draw = (ctx: CanvasRenderingContext2D, { w, h, frame: f }: DrawInfo) => {
  ctx.fillStyle = '#1b1f3b';
  ctx.fillRect(0, 0, w, h);
  const shot = SHOTS.filter((s) => f >= s).length - 1;
  const lf = f - SHOTS[shot];

  if (shot === 0) {
    // (a) arrive mid whip-pan and settle on the wide store
    const settle = prog(f, 0, 13, EASE.expo);
    const cx = lerp(80, 250, settle);
    camera(ctx, w, h, cx, 118, 2.35);
    drawStore(ctx, f, { player: { x: 210, y: 236 - f * 1.4, dir: 'up', walk: true } });
    coolGrade(ctx, w, h);
    smear(ctx, w, h, (1 - settle) * 260, 7);
  } else if (shot === 1) {
    // (b) close on the veg shelf — grab tomatoes, icons arc into the bag
    const z = lerp(5.2, 5.6, lf / 15);
    camera(ctx, w, h, VEG.x + 22 - lf * 0.5, VEG.y - 14, z);
    drawStore(ctx, f, { noFolk: true });
    const bob = Math.floor(lf / 3) % 2;
    drawChar(ctx, 'player', VEG.x - 4, VEG.y + 22 - bob, 'up', 0, false);
    // bag at the player's side
    drawIcon(ctx, item('cloth-bag'), VEG.x + 8, VEG.y + 12, 0.9);
    const throwsA: [number, string, number][] = [
      [0, 'tomato', -12],
      [4, 'tomato', -2],
      [8, 'potatoes', 10],
    ];
    for (const [t0, id, ox] of throwsA) {
      const q = clamp((lf - t0) / 6);
      if (lf < t0) continue;
      const x = lerp(VEG.x + ox, VEG.x + 8, q);
      const y = lerp(VEG.y - 20, VEG.y + 8, q) - Math.sin(q * Math.PI) * 16;
      if (q < 1) drawIcon(ctx, item(id), x, y, 0.8 + 0.2 * Math.sin(q * Math.PI));
      else if (lf - t0 < 9) drawIcon(ctx, fx('sparkle'), VEG.x + 8, VEG.y + 4, 0.7, 1 - (lf - t0 - 6) / 3);
    }
    coolGrade(ctx, w, h);
  } else if (shot === 2) {
    // (c) split-flap price tags over a soft, darkened shelf
    camera(ctx, w, h, 100 + lf * 1.2, 44, 6);
    drawStore(ctx, f);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(20,12,36,0.62)';
    ctx.fillRect(0, 0, w, h);
    flapTag(ctx, w * 0.22, h / 2 + 52, lf, 0, 6, '₹12', 'tomato', 1);
    flapTag(ctx, w * 0.5, h / 2 + 52, lf, 3, 9, '₹38', 'potatoes', 2);
    flapTag(ctx, w * 0.78, h / 2 + 52, lf, 6, 12, '₹45', 'chocolate', 3);
  } else if (shot === 3) {
    // (d) basket total ticker ₹0 → ₹107 against the ₹150 budget
    const px = 140 + lf * 1.6;
    camera(ctx, w, h, px + 10, 132, 3.4);
    drawStore(ctx, f, { player: { x: px, y: 162, dir: 'right', walk: true } });
    drawIcon(ctx, item('cloth-bag'), px + 7, 154, 0.8);
    coolGrade(ctx, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const k = EASE.out(clamp(lf / 11));
    const total = Math.round(107 * k);
    const pIn = prog(lf, 0, 5, EASE.back);
    const PW = 420;
    const PH = 132;
    ctx.save();
    ctx.translate(w / 2, 150);
    ctx.scale(pIn * 0.85, pIn * 0.85);
    panel(ctx, -PW / 2, -PH / 2, PW, PH, 6, '#2a1430', '#f2c14e');
    drawIcon(ctx, item('cloth-bag'), -PW / 2 + 52, -10, 3.5);
    const txt = '₹' + total;
    drawPixelText(ctx, txt, -PW / 2 + 110, -42, '#fff3dc', 9);
    // budget bar
    const bx = -PW / 2 + 110;
    const bw = PW - 140;
    ctx.fillStyle = '#120a1c';
    ctx.fillRect(bx, 26, bw, 22);
    const frac = total / 150;
    ctx.fillStyle = frac > 0.66 ? '#f2a541' : '#3bb273';
    ctx.fillRect(bx + 3, 29, Math.round((bw - 6) * frac), 16);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(bx + 3, 29, Math.round((bw - 6) * frac), 4);
    drawPixelText(ctx, '/ ₹150', bx + bw - measurePixelText('/ ₹150', 3), -6, '#f2c14e', 3);
    ctx.restore();
    if (lf >= 11 && lf < 15) flash(ctx, w, h, 0.15, '#f2c14e');
  } else if (shot === 4) {
    // (e) dairy fridge close-up, push toward the empty slot → SOLD OUT slam
    const push = prog(lf, 0, 12, EASE.inOut);
    const ps = lf + 60 - STAMP;
    const shake = ps >= 0 ? 4 * Math.max(0, 1 - ps / 14) * 2 : 0;
    camera(ctx, w, h, lerp(DAIRY.x + 10, DAIRY.x - 4, push), lerp(DAIRY.y - 8, DAIRY.y - 14, push), lerp(4.4, 6, push), shake, f);
    drawStore(ctx, f, { emptySlot: true, helperDir: 'up', noFolk: true });
    // player reaching up at the fridge
    drawChar(ctx, 'player', DAIRY.x - 6, DAIRY.y + 26, 'up', 0, false);
    if (ps >= 2) {
      const q = clamp((ps - 2) / 10);
      drawIcon(ctx, fx('exclaim'), DAIRY.x - 6, DAIRY.y - 6 - q * 4, 0.9);
    }
    coolGrade(ctx, w, h);
    if (ps >= 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(20,6,16,0.5)';
      ctx.fillRect(0, 0, w, h);
      const st = stamp();
      const sIn = ps < 6 ? lerp(3, 1, EASE.back(clamp(ps / 6))) : 1 + Math.max(0, 0.03 * Math.sin(ps));
      const k = 4.6 * sIn;
      const sx = w / 2 + (rand(f, 11) - 0.5) * shake * 2;
      const sy = h / 2 + (rand(f, 12) - 0.5) * shake * 2;
      ctx.save();
      ctx.translate(Math.round(sx), Math.round(sy));
      ctx.rotate(-0.16);
      ctx.globalAlpha = clamp(ps / 2 + 0.4);
      ctx.drawImage(st, Math.round((-st.width * k) / 2), Math.round((-st.height * k) / 2), Math.round(st.width * k), Math.round(st.height * k));
      ctx.restore();
      flash(ctx, w, h, Math.max(0, 0.6 - ps * 0.2), '#ff2a2a');
    }
  } else if (shot === 5) {
    // (f) helper turns to camera with a shrug — "Sorry! Milk is sold out."
    camera(ctx, w, h, HELPER.x + 4 + lf * 0.15, HELPER.y - 16, lerp(5.4, 6.0, lf / 30));
    const dir: Dir = lf < 3 ? 'up' : lf < 5 ? 'left' : 'down';
    const hop = (lf >= 7 && lf < 11) || (lf >= 15 && lf < 19) ? 2 : 0;
    drawStore(ctx, f, { emptySlot: true, helperDir: dir, helperHop: hop });
    drawChar(ctx, 'player', HELPER.x - 30, HELPER.y + 6, 'right', 0, false);
    if (lf >= 5) {
      const q = clamp((lf - 5) / 4);
      drawIcon(ctx, fx('exclaim'), HELPER.x + 1, HELPER.y - 30 - (1 - q) * 4, q);
    }
    if (hop) {
      ctx.fillStyle = '#fff3dc';
      drawPixelText(ctx, '?', HELPER.x - 13, HELPER.y - 22, '#fff3dc', 1);
      drawPixelText(ctx, '?', HELPER.x + 11, HELPER.y - 22, '#fff3dc', 1);
    }
    // sweat drop
    if (lf > 12) drawIcon(ctx, fx('raindrop'), HELPER.x + 7, HELPER.y - 22 + ((lf - 12) % 10) * 0.6, 0.8);
    coolGrade(ctx, w, h);
  } else {
    // (g) player thinks — a ring of options orbits their head; end on a fast face zoom
    const PX = 110;
    const PY = 100;
    const zoom = lf < 42 ? lerp(4.2, 4.8, lf / 42) : lerp(4.8, 11, EASE.in(clamp((lf - 42) / 18)));
    camera(ctx, w, h, PX, PY - 14 - clamp((lf - 42) / 18) * 3, zoom);
    drawStore(ctx, f, { noFolk: true });
    const look = Math.floor(lf / 10) % 3;
    const dir: Dir = lf < 36 ? (look === 0 ? 'down' : look === 1 ? 'left' : 'right') : 'down';
    const drawOrbit = (front: boolean) => {
      const opts = 4;
      for (let i = 0; i < opts; i++) {
        const q = prog(lf, 4 + i * 4, 12 + i * 4, EASE.back);
        if (q <= 0) continue;
        const a = (i / opts) * Math.PI * 2 + lf * 0.07;
        if (Math.sin(a) > 0 !== front) continue;
        const ox = PX + Math.cos(a) * 30 * q;
        const oy = PY - 22 + Math.sin(a) * 14 * q;
        ctx.save();
        ctx.globalAlpha = front ? 1 : 0.85;
        ctx.fillStyle = '#2a1430';
        ctx.fillRect(Math.round(ox - 7), Math.round(oy - 7), 14, 14);
        ctx.fillStyle = '#fff3dc';
        ctx.fillRect(Math.round(ox - 6), Math.round(oy - 6), 12, 12);
        if (i === 0) phoneIcon(ctx, ox, oy, 0.6);
        else if (i === 1) shopIcon(ctx, ox, oy, 0.7);
        else if (i === 2) drawPixelText(ctx, '?', ox - 1.5, oy - 2.5, '#e4572e', 1);
        else drawIcon(ctx, item('milk-tetra'), ox, oy, 0.62);
        ctx.restore();
      }
    };
    drawOrbit(false);
    drawChar(ctx, 'player', PX, PY, dir, 0, false);
    drawOrbit(true);
    // thought puffs
    for (let i = 0; i < 3; i++) {
      const q = prog(lf, 2 + i * 3, 8 + i * 3, EASE.back);
      if (q > 0) {
        ctx.fillStyle = '#fff3dc';
        ctx.beginPath();
        ctx.arc(PX + 7 + i * 3, PY - 27 - i * 3, (0.8 + i * 0.7) * q, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    coolGrade(ctx, w, h);
    // vignette tightening on the face zoom
    if (lf > 42) {
      const q = clamp((lf - 42) / 18);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, 560 - q * 260);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(10,6,20,${(0.75 * q).toFixed(2)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }
  // tiny flash frame on each hard cut for punch
  if (f > 0 && SHOTS.includes(f) && f !== 75) flash(ctx, w, h, 0.25, '#ffffff');
};

export default function S04() {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <PixelCanvas scale={2} draw={draw} />
    </AbsoluteFill>
  );
}
