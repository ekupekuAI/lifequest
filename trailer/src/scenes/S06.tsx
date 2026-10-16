// S06 — WEATHER & THE WRONG BUS (abs 780–930). Thunder, rain, an umbrella pop,
// bus 7 pulls in, "?" — split-screen 7 STADIUM vs 12 CITY — the right bus glows, board, whoosh.
import { AbsoluteFill } from 'remotion';
import { PixelCanvas, camera, grade, glow, rand, clamp, lerp, EASE, type DrawInfo } from '../lib/stage';
import { drawChar, drawPropAt, drawIcon, fillTiles, fx, type Dir } from '../lib/art';
import { CUES, SCENES } from '../timeline';
import { type Ctx, screen, keys, popIn, fxPop, flash, speedLines, drawUmbrella, signBoard, glyphBubble, ring } from './B_kit';

const FROM = SCENES[5].from; // 780
const BUS = CUES.busArrive - FROM; // 75
const SPLIT_IN = 100;
const SPLIT_OUT = 129;
const STOP_X = 262; // where buses halt (prop centre)
const ROAD_Y = 178; // bus bottom (upper lane)
const SIDEWALK_Y = 130; // player feet

// ---------- player path ----------
function playerPos(f: number) {
  const x = keys(f, [
    [0, 64],
    [16, 104],
    [34, 104],
    [70, 232],
  ], (t) => t);
  return { x, y: SIDEWALK_Y };
}
const UMB = 19; // umbrella pops
const umbrellaOpen = (f: number) => {
  const t = (f - UMB) / 14;
  if (t <= 0) return 0;
  return 1 - Math.cos(Math.min(t, 2) * Math.PI * 2.2) * Math.exp(-t * 4.5);
};

// ---------- buses ----------
function bus7X(f: number) {
  // decelerating arrival
  return lerp(-70, STOP_X, EASE.out(clamp((f - BUS + 6) / 22)));
}
function bus7Tilt(f: number) {
  // nose dips as it brakes, rocks back on stop
  const t = f - (BUS + 16);
  if (t < -10) return 0;
  if (t < 0) return 0.035 * ((t + 10) / 10);
  return 0.035 * Math.cos(t * 0.55) * Math.exp(-t * 0.22);
}
function bus12X(f: number) {
  return lerp(-90, STOP_X, EASE.out(clamp((f - SPLIT_IN + 2) / 20)));
}

function drawBus(ctx: Ctx, key: string, x: number, y: number, tilt: number, sign: string, f: number, doorOpen = 0, braking = false) {
  ctx.save();
  // pivot on the front wheel
  ctx.translate(x + 28, y);
  ctx.rotate(tilt);
  ctx.translate(-(x + 28), -y);
  drawPropAt(ctx, key, x, y);
  // destination LED board above the windscreen
  signBoard(ctx, sign, x + 22, y - 49, '#ffb43a');
  if (doorOpen > 0) {
    ctx.fillStyle = '#141020';
    const dw = Math.round(doorOpen * 4);
    ctx.fillRect(x + 26 - dw, y - 20, dw * 2, 14);
  }
  if (braking) {
    ctx.fillStyle = '#ff4a3a';
    ctx.fillRect(x - 40 + 1, y - 15, 2, 3);
  }
  ctx.restore();
  void f;
}

// ---------- environment ----------
function drawStreet(ctx: Ctx, f: number) {
  ctx.fillStyle = '#1d2236';
  ctx.fillRect(-300, -200, 1200, 600);
  fillTiles(ctx, 'grass', -288, 0, 50, 6);
  // buildings along the top
  drawPropAt(ctx, 'house-b', -20, 100);
  drawPropAt(ctx, 'house-a', 60, 100);
  drawPropAt(ctx, 'kiosk', 140, 100);
  drawPropAt(ctx, 'house-b', 212, 100);
  drawPropAt(ctx, 'house-a', 296, 100);
  drawPropAt(ctx, 'house-b', 380, 100);
  fillTiles(ctx, 'sidewalk', -288, 96, 50, 3);
  fillTiles(ctx, 'road', -288, 144, 50, 5);
  fillTiles(ctx, 'roadLine', -288, 176, 50, 1);
  fillTiles(ctx, 'road', -288, 192, 50, 1);
  fillTiles(ctx, 'sidewalk', -288, 208, 50, 2);
  fillTiles(ctx, 'hedge', -288, 240, 50, 1);
  fillTiles(ctx, 'grass', -288, 256, 50, 4);
  // wet sheen on the road
  ctx.fillStyle = 'rgba(120,150,220,0.12)';
  ctx.fillRect(-300, 144, 1200, 64);
  // puddles with shimmer + rain rings
  const puddles = [
    [30, 166, 26, 5],
    [150, 196, 34, 6],
    [236, 160, 22, 4],
    [330, 198, 30, 5],
    [-60, 194, 28, 5],
    [90, 120, 16, 3],
    [300, 222, 22, 4],
  ];
  puddles.forEach(([x, y, rw, rh], i) => {
    ctx.fillStyle = 'rgba(30,40,80,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,220,255,0.55)';
    const sh = ((f * 0.7 + i * 9) % rw) - rw / 2;
    ctx.fillRect(Math.round(x + sh * 0.6), Math.round(y - 1), 5, 1);
    ctx.fillRect(Math.round(x - sh * 0.4 - 4), Math.round(y + 1), 3, 1);
    for (let k = 0; k < 2; k++) {
      const t = (f + i * 7 + k * 11) % 16;
      const rx = x + (rand(i, k, Math.floor((f + i * 7 + k * 11) / 16)) - 0.5) * rw * 0.7;
      ctx.strokeStyle = `rgba(210,230,255,${0.6 * (1 - t / 16)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(Math.round(rx), y, 1 + t * 0.35, 0.5 + t * 0.15, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  // splashes everywhere on the ground
  ctx.fillStyle = 'rgba(220,235,255,0.8)';
  for (let k = 0; k < 40; k++) {
    const sx = Math.floor(rand(k, f, 1) * 700) - 250;
    const sy = 100 + Math.floor(rand(k, f, 2) * 150);
    ctx.fillRect(sx - 1, sy - 1, 1, 1);
    ctx.fillRect(sx + 1, sy - 1, 1, 1);
    ctx.fillRect(sx, sy, 1, 1);
  }
  // street furniture
  drawPropAt(ctx, 'mailbox', 30, 106);
  drawPropAt(ctx, 'flower-bed', 92, 106);
  drawPropAt(ctx, 'bench', 228, 106);
  drawPropAt(ctx, 'tree-small', -60, 108);
  drawPropAt(ctx, 'streetlamp', 168, 104);
  drawPropAt(ctx, 'bus-stop', 300, 128);
  drawPropAt(ctx, 'streetlamp', 360, 104);
}

function lampsOn(f: number) {
  // flicker on after the thunder
  if (f < 6) return 0;
  if (f < 12) return f % 2 ? 1 : 0.2;
  return 1;
}

function lights(ctx: Ctx, f: number) {
  const on = lampsOn(f);
  for (const lx of [168, 360]) {
    glow(ctx, lx, 66, 40, '#ffd27a', 0.7 * on);
    glow(ctx, lx, 118, 56, '#ffcf80', 0.32 * on);
    // reflection streak on the wet road
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,200,120,${0.12 * on})`;
    for (let k = 0; k < 6; k++) ctx.fillRect(lx - 3 + ((k * 3) % 5), 150 + k * 9 + (f % 3), 6, 3);
    ctx.restore();
  }
  // shop window glow
  glow(ctx, 140, 86, 40, '#ffb35a', 0.4);
  for (const hx of [-20, 60, 212, 296, 380]) glow(ctx, hx, 80, 22, '#ffc070', 0.22);
}

function rainWorld(ctx: Ctx, f: number, x0: number, x1: number) {
  // foreground heavy drops in world space (parallax depth)
  ctx.strokeStyle = 'rgba(200,220,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 160; i++) {
    const x = x0 + ((rand(i, 31) * (x1 - x0) + f * 2.5) % (x1 - x0));
    const y = ((rand(i, 32) * 320 + f * (14 + rand(i, 33) * 6)) % 320) - 20;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y + 9);
  }
  ctx.stroke();
}

function stormGrade(ctx: Ctx, w: number, h: number, f: number) {
  screen(ctx);
  grade(ctx, w, h, '#8494cc', 1);
  grade(ctx, w, h, '#1a2040', 0.12, 'source-over');
  void f;
}

/** Player + umbrella + drips. */
function drawPlayer(ctx: Ctx, x: number, y: number, dir: Dir, step: number, walking: boolean, open: number, f: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (open > 0.01) drawUmbrella(ctx, 2, 1, open, walking ? Math.sin(f * 0.4) * 0.04 : 0);
  drawChar(ctx, 'player', 0, 0, dir, step, walking);
  if (open > 0.6) {
    // drips running off the canopy rim
    ctx.fillStyle = 'rgba(210,230,255,0.85)';
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? 1 : -1;
      const t = (f * 2 + k * 5) % 14;
      ctx.fillRect(2 + side * (13 + (k % 3)), -24 + t, 1, 2);
    }
    // rain hitting the canopy
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(2 + (rand(k, f, 7) - 0.5) * 22), -35 + Math.floor(rand(k, f, 8) * 3), 1, 1);
  }
  ctx.restore();
}

const draw = (ctx: Ctx, { w, h, frame: f }: DrawInfo) => {
  const pp = playerPos(f);
  const walking = Math.abs(pp.x - playerPos(f - 1).x) > 0.1;

  // ---------- main street (everything except the split-screen) ----------
  const drawMain = (boarding: boolean) => {
    let cx: number, cy: number, zoom: number, shake = 0;
    if (!boarding) {
      cx = keys(f, [
        [0, 92],
        [16, 108],
        [34, 112],
        [70, 222],
        [92, 238],
        [100, 240],
      ]);
      cy = keys(f, [
        [0, 112],
        [34, 114],
        [70, 132],
        [100, 140],
      ]);
      zoom = keys(f, [
        [0, 2.6],
        [16, 3.0],
        [34, 2.8],
        [70, 2.2],
        [92, 2.0],
        [100, 2.1],
      ]);
      if (f < 8) shake = 3 * (1 - f / 8);
      if (f >= UMB && f < UMB + 6) zoom += 0.15 * (1 - (f - UMB) / 6);
      if (f >= BUS + 14 && f < BUS + 20) shake = 1.5;
    } else {
      cx = keys(f, [
        [SPLIT_OUT, 246],
        [150, 262],
      ]);
      cy = 142;
      zoom = keys(f, [
        [SPLIT_OUT, 2.6],
        [150, 2.3],
      ]);
      if (f > 141) shake = 1.5;
    }
    camera(ctx, w, h, cx, cy, zoom, shake, f);
    drawStreet(ctx, f);

    // passer-by dashing through the rain, and a car spraying the kerb
    const rx = lerp(320, -80, clamp(f / 70));
    if (f < 70 && !boarding) drawChar(ctx, 'folk1', rx, 226, 'left', f / 2, true);
    const carX = lerp(520, -120, clamp((f - 30) / 34));
    if (f > 30 && f < 64) {
      drawPropAt(ctx, 'car-blue', carX, 204);
      ctx.fillStyle = 'rgba(210,230,255,0.7)';
      for (let k = 0; k < 10; k++) ctx.fillRect(Math.round(carX + 12 + k * 2 + rand(k, f) * 4), Math.round(204 - 2 - rand(k, f, 3) * 8), 1, 2);
    }

    if (!boarding) {
      let dir: Dir = 'right';
      if (f >= 14 && f < UMB + 3) dir = 'up'; // looks up at the sky
      if (f >= BUS + 2) dir = 'down';
      if (f >= BUS + 8) dir = bus7X(f) < pp.x ? 'left' : 'right';
      if (f >= BUS + 20) dir = 'down';
      const hop = f >= UMB && f < UMB + 6 ? Math.round(Math.sin(((f - UMB) / 6) * Math.PI) * 2) : 0;
      drawPlayer(ctx, pp.x, pp.y - hop, dir, f / 4, walking, umbrellaOpen(f), f);
      // bus 7
      if (f >= BUS - 6) {
        const braking = f > BUS + 4 && f < BUS + 26;
        drawBus(ctx, 'bus-7', bus7X(f), ROAD_Y, bus7Tilt(f), 'STADIUM', f, 0, braking);
        // brake spray
        if (braking) {
          ctx.fillStyle = 'rgba(210,230,255,0.75)';
          for (let k = 0; k < 14; k++) ctx.fillRect(Math.round(bus7X(f) + 30 + rand(k, f) * 10), Math.round(ROAD_Y - 3 - rand(k, f, 2) * 10), 1, 2);
        }
      }
      // fx
      if (f >= UMB && f < UMB + 14) {
        ring(ctx, pp.x + 2, pp.y - 31, 6 + (f - UMB) * 2.4, '#fff3dc', 1, 1 - (f - UMB) / 14);
        fxPop(ctx, 'sparkle', pp.x + 18, pp.y - 38, f, UMB + 2, 12, 0.6, 4);
      }
      const q = popIn(f, BUS + 21, 7);
      if (q > 0) glyphBubble(ctx, pp.x - 8, pp.y - 44, q * 0.9, '?');
    } else {
      // boarding bus 12
      const s = f - SPLIT_OUT;
      const busX = f < 142 ? STOP_X : STOP_X + Math.pow(f - 142, 2) * 2.2;
      const doorOpen = s < 2 ? s / 2 : f < 138 ? 1 : clamp(1 - (f - 138) / 3);
      const doorX = STOP_X + 26;
      // player walks into the doorway and is swallowed by the dark
      const px = lerp(232, doorX, EASE.inOut(clamp(s / 8)));
      const py = lerp(SIDEWALK_Y, SIDEWALK_Y + 26, EASE.in(clamp(s / 8)));
      if (f < 138) {
        ctx.save();
        ctx.globalAlpha = clamp(1 - (s - 6) / 3);
        drawPlayer(ctx, px, py, 'right', f / 3, s < 8, clamp(1 - s / 6), f);
        ctx.restore();
      }
      drawBus(ctx, 'bus', busX, ROAD_Y, f > 142 ? -0.02 : 0, 'CITY', f, doorOpen);
      if (f > 142) {
        ctx.fillStyle = 'rgba(210,230,255,0.8)';
        for (let k = 0; k < 18; k++) ctx.fillRect(Math.round(busX - 40 - rand(k, f) * 30), Math.round(ROAD_Y - 2 - rand(k, f, 2) * 10), 2, 1);
      }
    }
    rainWorld(ctx, f, -200, 700);

    // lighting
    stormGrade(ctx, w, h, f);
    camera(ctx, w, h, cx, cy, zoom, shake, f);
    lights(ctx, f);
    if (!boarding && f >= BUS - 6) {
      const bx = bus7X(f);
      glow(ctx, bx + 42, ROAD_Y - 12, 26, '#fff2b0', 0.55);
      if (f > BUS + 4 && f < BUS + 26) glow(ctx, bx - 40, ROAD_Y - 14, 16, '#ff3a2a', 0.6);
    }
    if (boarding) glow(ctx, (f < 142 ? STOP_X : STOP_X + Math.pow(f - 142, 2) * 2.2) + 42, ROAD_Y - 12, 26, '#fff2b0', 0.55);
    if (umbrellaOpen(f) > 0.5 && !boarding) glow(ctx, pp.x + 2, pp.y - 32, 18, '#ff8a5a', 0.18);
    screen(ctx);
  };

  const splitP = f < SPLIT_IN ? 0 : f < SPLIT_OUT ? 1 : 0;
  ctx.fillStyle = '#0b0d18';
  ctx.fillRect(0, 0, w, h);

  if (f < SPLIT_IN + 6) drawMain(false);
  if (f >= SPLIT_OUT) drawMain(true);

  // ---------- split-screen: 7 STADIUM | 12 CITY ----------
  if (f >= SPLIT_IN && f < SPLIT_OUT + 4) {
    const sIn = EASE.out(clamp((f - SPLIT_IN) / 6));
    const sOut = EASE.in(clamp((f - SPLIT_OUT) / 4));
    const half = w / 2;
    const glowOn = f >= 120;
    const panel = (side: 0 | 1) => {
      const off = side === 0 ? -half * (1 - sIn) - half * sOut : half * (1 - sIn) + half * sOut;
      const x0 = side * half + off;
      ctx.save();
      screen(ctx);
      ctx.beginPath();
      ctx.rect(Math.round(x0), 0, Math.round(half), h);
      ctx.clip();
      const bx = side === 0 ? STOP_X : bus12X(f);
      const camX = side === 0 ? STOP_X + 14 : STOP_X + 4;
      // camera centred within this panel
      const zoom = 2.6 + (f - SPLIT_IN) * 0.008;
      ctx.setTransform(zoom, 0, 0, zoom, Math.round(x0 + half / 2 - camX * zoom), Math.round(h / 2 - 150 * zoom));
      drawStreet(ctx, f);
      drawBus(ctx, side === 0 ? 'bus-7' : 'bus', bx, ROAD_Y, side === 1 ? Math.max(0, 0.03 * Math.sin(clamp((f - SPLIT_IN - 10) / 10) * Math.PI)) : 0, side === 0 ? 'STADIUM' : 'CITY', f);
      rainWorld(ctx, f + side * 50, -100, 600);
      const tf = ctx.getTransform();
      // storm grade inside the panel
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#8494cc';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(tf);
      glow(ctx, bx + 42, ROAD_Y - 12, 24, '#fff2b0', 0.5);
      glow(ctx, bx + 22, ROAD_Y - 45, 22, '#ffb43a', 0.45);
      if (glowOn) {
        if (side === 1) {
          const pulse = 0.5 + 0.25 * Math.sin((f - 120) * 0.8);
          glow(ctx, bx, ROAD_Y - 22, 60, '#7dffb0', pulse);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (glowOn && side === 0) {
        ctx.fillStyle = 'rgba(10,10,25,0.55)';
        ctx.fillRect(0, 0, w, h);
      }
      if (glowOn && side === 1) {
        // green selection frame
        const p = popIn(f, 120, 6);
        ctx.strokeStyle = '#7dffb0';
        ctx.lineWidth = 3;
        const ins = Math.round(10 + (1 - p) * 20);
        ctx.strokeRect(Math.round(x0) + ins, 36 + ins, Math.round(half) - ins * 2, 198 - ins * 2);
      }
      ctx.restore();
    };
    panel(0);
    panel(1);
    // seam
    if (sOut === 0) {
      ctx.fillStyle = '#fff3dc';
      ctx.fillRect(Math.round(w / 2 - 1), Math.round(h * (1 - sIn)), 2, h);
    }
    // player bust at the seam, head whipping left/right on the beats
    if (sOut < 1 && f >= SPLIT_IN + 3) {
      const beatDir: Dir = f < 105 ? 'down' : f < 112 ? 'left' : f < 120 ? 'right' : f < 124 ? 'left' : 'right';
      const rise = EASE.back(clamp((f - SPLIT_IN - 3) / 7));
      const by = Math.round(h + 54 - rise * 60 + sOut * 80);
      ctx.save();
      screen(ctx);
      ctx.translate(w / 2, by);
      ctx.scale(3, 3);
      drawUmbrella(ctx, 2, 1, 1, 0);
      drawChar(ctx, 'player', 0, 0, beatDir, 0, false);
      ctx.restore();
      if (f >= 120) {
        ctx.save();
        screen(ctx);
        drawIcon(ctx, fx('check'), w * 0.75 + 40, 70, popIn(f, 121, 7) * 1.6);
        ctx.restore();
      }
    }
    void splitP;
  }

  // ---------- screen-space weather + lightning ----------
  rain(ctx, w, h, f);
  if (f < 3) flash(ctx, w, h, 1);
  else if (f < 10) flash(ctx, w, h, 0.7 * (1 - (f - 3) / 7), '#dfe8ff');
  if (f === 12 || f === 13) flash(ctx, w, h, 0.45, '#dfe8ff');
  if (f >= SPLIT_OUT && f < SPLIT_OUT + 2) flash(ctx, w, h, 0.3);
  if (f > 142) speedLines(ctx, w, h, f, 0.45, 30, '220,235,255', 50);
};

function rain(ctx: Ctx, w: number, h: number, f: number) {
  ctx.save();
  screen(ctx);
  ctx.strokeStyle = 'rgba(190,215,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 260; i++) {
    const x = ((rand(i, 7) * (w + 60) + f * 4) % (w + 60)) - 30;
    const y = (rand(i, 9) * h + f * (12 + rand(i, 3) * 6)) % h;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y + 8);
  }
  ctx.stroke();
  ctx.restore();
}

export default function S06() {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <PixelCanvas draw={draw} />
    </AbsoluteFill>
  );
}
