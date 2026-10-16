// S03 · STEP OUT (abs 270–420) — the front door bursts open on the beat, warm light floods
// out, the player steps onto the path, then one continuous pull-back reveals the living town:
// cars stop at the zebra crossing as the player crosses, folk stroll, a bus passes behind.
// Exit: fast whip-pan right (smeared redraws) — S04 picks up mid-whip.
import { AbsoluteFill } from 'remotion';
import { PixelCanvas, camera, prog, EASE, lerp, glow, clamp, type DrawInfo } from '../lib/stage';
import { drawIcon, fx, type Dir } from '../lib/art';
import { CUES } from '../timeline';
import { drawSky, drawTown, drawForeground, goldenGrade, drawCharShadowed, DOOR_X, DOOR_Y, ROAD, type Cam, type CarState } from './A_town';
import { flash, smear } from './A_fx';

const FROM = 270;
const DOOR = CUES.doorOpen - FROM; // 15
const CROSS_C = 192; // crosswalk centre x

interface Pose {
  x: number;
  y: number;
  dir: Dir;
  walking: boolean;
  visible: boolean;
}

function player(f: number): Pose {
  const seg = (a: number, b: number) => clamp((f - a) / (b - a));
  if (f < DOOR + 2) return { x: DOOR_X, y: DOOR_Y - 2, dir: 'down', walking: false, visible: false };
  if (f < 40) return { x: DOOR_X, y: lerp(DOOR_Y - 2, 182, seg(DOOR + 2, 40)), dir: 'down', walking: true, visible: true };
  if (f < 56) return { x: lerp(DOOR_X, CROSS_C, seg(40, 56)), y: lerp(182, 184, seg(40, 56)), dir: 'right', walking: true, visible: true };
  // look both ways
  if (f < 60) return { x: CROSS_C, y: 184, dir: 'left', walking: false, visible: true };
  if (f < 64) return { x: CROSS_C, y: 184, dir: 'right', walking: false, visible: true };
  if (f < 118) return { x: CROSS_C, y: lerp(184, 268, seg(64, 118)), dir: 'down', walking: true, visible: true };
  return { x: CROSS_C + (f - 118) * 2.2, y: 268, dir: 'right', walking: true, visible: true };
}

function cars(f: number): CarState[] {
  const red = f < 58 ? lerp(-70, 146, EASE.out(f / 58)) : f < 118 ? 146 : 146 + 0.07 * (f - 118) ** 2;
  const blue = f < 64 ? lerp(560, 240, EASE.out(f / 64)) : f < 124 ? 240 : 240 - 0.07 * (f - 124) ** 2;
  return [
    { key: 'car-red', x: red, lane: 'east' },
    { key: 'car-blue', x: blue, lane: 'west' },
  ];
}

const draw = (ctx: CanvasRenderingContext2D, { w, h, frame: f }: DrawInfo) => {
  // ---- camera: tight on the door → big continuous pull-back → whip right
  const pull = prog(f, 26, 116, EASE.inOut);
  const p = player(f);
  const tight = { cx: DOOR_X, cy: DOOR_Y - 18 };
  const wide = { cx: 236, cy: 182 };
  let cx = lerp(tight.cx, wide.cx, pull) + (p.visible ? (p.x - DOOR_X) * 0.25 * (1 - pull) : 0);
  let cy = lerp(tight.cy, wide.cy, pull) + (p.visible ? (p.y - DOOR_Y) * 0.35 * (1 - pull) : 0);
  const z = lerp(6, 2.05, pull);
  // whip pan right
  const whipT = Math.max(0, f - 133);
  const whip = whipT > 0 ? 0.45 * whipT ** 2.2 : 0;
  cx += whip;
  cy += 0;
  const shake = f >= DOOR && f < DOOR + 8 ? (DOOR + 8 - f) * 0.9 : 0;
  const cam: Cam = { cx, cy, z };

  const sun = drawSky(ctx, w, h, f + 160, cam);
  camera(ctx, w, h, cx, cy, z, shake, f);

  // ---- door light (behind actors): open doorway glowing warm
  const open = prog(f, DOOR, DOOR + 5, EASE.back);
  drawTown(ctx, {
    frame: f + 400,
    cars: cars(f),
    busX: lerp(980, -140, prog(f, 34, 150, (t) => t)),
    lampsOn: 0.55,
    extra: (c) => {
      // light spill on the path/sidewalk
      if (f >= DOOR) {
        const doorL = DOOR_X - 6;
        const doorT = DOOR_Y - 18;
        c.fillStyle = '#ffe2a0';
        c.fillRect(doorL, doorT, 12, 16);
        c.fillStyle = '#fff6d8';
        c.fillRect(doorL + 3, doorT + 2, 6, 14);
        // door leaf swinging inward (hinge on the left): shrinking width
        const leaf = Math.max(2, Math.round(12 * (1 - open)));
        c.fillStyle = '#1f6e66';
        c.fillRect(doorL, doorT, leaf, 16);
        c.fillStyle = '#2f9a8c';
        c.fillRect(doorL, doorT + 1, Math.max(1, leaf - 1), 14);
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.28 * open * (0.9 + 0.1 * Math.sin(f / 3));
        c.fillStyle = '#ffd38a';
        c.beginPath();
        c.moveTo(doorL, DOOR_Y - 2);
        c.lineTo(doorL + 12, DOOR_Y - 2);
        c.lineTo(doorL + 26, DOOR_Y + 30);
        c.lineTo(doorL - 14, DOOR_Y + 30);
        c.closePath();
        c.fill();
        c.restore();
        glow(c, DOOR_X, DOOR_Y - 10, 40 * open + 6, '#ffcf7a', 0.55 * open);
        // dust puffs from the burst
        if (f < DOOR + 14) {
          const q = (f - DOOR) / 14;
          drawIcon(c, fx('cloud'), DOOR_X - 10 - q * 8, DOOR_Y - 4 - q * 3, 0.5 + q * 0.4, 1 - q);
          drawIcon(c, fx('cloud'), DOOR_X + 10 + q * 8, DOOR_Y - 4 - q * 3, 0.5 + q * 0.4, 1 - q);
        }
      }
      // brake lights while the cars wait
      for (const car of cars(f)) {
        const stopped = car.lane === 'east' ? f >= 50 && f < 120 : f >= 56 && f < 126;
        if (!stopped) continue;
        const rearX = car.lane === 'east' ? car.x - 16 : car.x + 16;
        const y = car.lane === 'east' ? ROAD + 31 : ROAD + 13;
        glow(c, rearX, y, 7, '#ff3a2a', 0.6);
      }
      // the player
      if (p.visible) {
        const hop = f >= DOOR + 2 && f < DOOR + 8 ? -Math.round(Math.sin(((f - DOOR - 2) / 6) * Math.PI) * 3) : 0;
        drawCharShadowed(c, 'player', Math.round(p.x), Math.round(p.y) + hop, p.dir, f / 4, p.walking);
        if (f >= DOOR + 4 && f < DOOR + 22) {
          const q = (f - DOOR - 4) / 18;
          drawIcon(c, fx('exclaim'), p.x + 1, p.y - 30 - q * 4, 0.8, q < 0.8 ? 1 : (1 - q) * 5);
        }
        // a friendly note once safely across
        if (f >= 104 && f < 130) {
          const q = (f - 104) / 26;
          drawIcon(c, fx('music'), p.x + 8 + q * 4, p.y - 28 - q * 10, 0.8, 1 - q);
        }
      }
      // driver's friendly wave = heart from the stopped red car
      if (f >= 70 && f < 100) {
        const q = (f - 70) / 30;
        drawIcon(c, fx('heart'), cars(f)[0].x + 4, ROAD + 16 - q * 10, 0.7, 1 - q);
      }
    },
  });

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawForeground(ctx, w, h, cam, f, clamp((3.6 - z) / 1.2));
  goldenGrade(ctx, w, h, f, 1, sun);

  // energy: a warm bloom pulse on the door burst
  if (f >= DOOR && f < DOOR + 10) flash(ctx, w, h, (1 - (f - DOOR) / 10) * 0.35, '#ffe6b0');

  // whip-pan smear
  if (whipT > 0) smear(ctx, w, h, Math.min(260, whipT * 18), 7);
  // in from S02's white flash
  flash(ctx, w, h, 1 - prog(f, 0, 9, EASE.out), '#fff8ec');
};

export default function S03() {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <PixelCanvas scale={2} draw={draw} />
    </AbsoluteFill>
  );
}
