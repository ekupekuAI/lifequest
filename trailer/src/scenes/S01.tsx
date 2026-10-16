// S01 · DAWN (abs 0–120) — golden-hour establishing shot: crane down from the sky,
// slow push-in on the player's house, clock HUD ticks in, iris into the kitchen.
import { AbsoluteFill } from 'remotion';
import { PixelCanvas, camera, prog, EASE, lerp, glow, type DrawInfo } from '../lib/stage';
import { drawSky, drawTown, drawForeground, goldenGrade, toScreen, DOOR_X, DOOR_Y, type Cam, type CarState } from './A_town';
import { iris, flash, clockHud } from './A_fx';

const draw = (ctx: CanvasRenderingContext2D, { w, h, frame }: DrawInfo) => {
  // camera: crane down from the sky (0→60), then a slow push-in on house no.12 (40→118)
  const tilt = prog(frame, 0, 70, EASE.inOut);
  const push = prog(frame, 30, 118, EASE.inOut);
  const cam: Cam = {
    cx: lerp(lerp(430, 330, tilt), DOOR_X + 4, push),
    cy: lerp(lerp(30, 178, tilt), 150, push),
    z: lerp(lerp(1.8, 1.75, tilt), 2.6, push),
  };

  const sun = drawSky(ctx, w, h, frame + 40, cam);
  camera(ctx, w, h, cam.cx, cam.cy, cam.z);
  const cars: CarState[] = [
    { key: 'car-blue', x: -40 + (frame + 60) * 1.6, lane: 'east' },
    { key: 'car-red', x: 760 - frame * 1.3, lane: 'west' },
  ];
  drawTown(ctx, { frame: frame + 90, cars, busX: 820 - frame * 2.2, lampsOn: prog(frame, 70, 110) * 0.8 });
  // warm light behind house no.12's windows — someone's cooking
  const warm = prog(frame, 60, 110) * (0.85 + 0.15 * Math.sin(frame / 4));
  glow(ctx, DOOR_X - 22, DOOR_Y - 26, 18, '#ffb35a', 0.5 * warm);
  glow(ctx, DOOR_X + 22, DOOR_Y - 26, 18, '#ffb35a', 0.5 * warm);
  glow(ctx, DOOR_X, DOOR_Y - 10, 22, '#ffcf7a', 0.35 * warm);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawForeground(ctx, w, h, cam, frame);
  goldenGrade(ctx, w, h, frame, 1, sun);

  // window of house no.12 glows warmly as we push in (someone's cooking)
  // clock HUD — ticks in on the downbeat at f60
  const hudIn = prog(frame, 58, 72, EASE.back);
  if (frame >= 58) {
    const s = 3;
    const x = w - 36 + (1 - hudIn) * 220;
    const y = 86 + Math.round(Math.sin(frame / 8) * 1);
    const t = frame < 84 ? '4:29 PM' : '4:30 PM';
    const pop = frame >= 84 && frame < 90 ? 1 : 0;
    clockHud(ctx, x, y - pop * 3, s, t);
  }

  // fade from black
  flash(ctx, w, h, 1 - prog(frame, 0, 26, EASE.out), '#000');

  // iris into the kitchen, centred on the front door
  if (frame >= 96) {
    const [dx, dy] = toScreen(cam, w, h, DOOR_X, DOOR_Y - 10);
    const r = lerp(620, 0, prog(frame, 96, 118, EASE.in));
    iris(ctx, w, h, dx, dy, r);
  }
};

export default function S01() {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <PixelCanvas scale={2} draw={draw} />
    </AbsoluteFill>
  );
}
