// Cinematic toolkit: dramatic camera & screen effects any system can trigger.
// Bound to the active WorldScene by attachWow(). Every call is safe when no
// scene is active (it simply does nothing). Owned by the cinematic/rewind agent,
// who may enhance these — keep the function names and signatures stable.
import Phaser from 'phaser';
import { sfx } from '../core/sfx';
import { store } from '../core/store';

let scene: Phaser.Scene | null = null;
let redRect: Phaser.GameObjects.Rectangle | null = null;
let redTween: Phaser.Tweens.Tween | null = null;
let bars: Phaser.GameObjects.Rectangle[] = [];
let slowTimer: ReturnType<typeof setTimeout> | null = null;

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const live = () => (scene && scene.sys && scene.sys.isActive() ? scene : null);

export function bindCinematic(s: Phaser.Scene) {
  scene = s;
  redRect = null;
  redTween = null;
  bars = [];
  s.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (scene === s) {
      endSlowMo();
      scene = null;
    }
  });
}

/** Quick dramatic zoom in and back (e.g. on a shocking moment). */
export function punchZoom(zoom = 1.25, ms = 380) {
  const s = live();
  if (!s || reduced()) return;
  const cam = s.cameras.main;
  const base = cam.zoom;
  s.tweens.add({ targets: cam, zoom: base * zoom, duration: ms * 0.35, ease: 'Back.easeOut', yoyo: true, hold: ms * 0.3, onComplete: () => cam.setZoom(base) });
}

export function shake(intensity = 0.006, ms = 260) {
  const s = live();
  if (!s || reduced()) return;
  s.cameras.main.shake(ms, intensity);
}

export function flash(color = 0xffffff, ms = 180) {
  const s = live();
  if (!s) return;
  const c = Phaser.Display.Color.IntegerToRGB(color);
  s.cameras.main.flash(ms, c.r, c.g, c.b);
}

/** Slow the whole world down for `ms` real milliseconds (scale 0.3 = 30% speed). */
export function slowMo(scale = 0.3, ms = 900) {
  const s = live();
  if (!s || reduced()) return;
  s.time.timeScale = scale;
  s.tweens.timeScale = scale;
  if (s.physics?.world) s.physics.world.timeScale = 1 / scale;
  if (slowTimer) clearTimeout(slowTimer);
  slowTimer = setTimeout(endSlowMo, ms);
}

function endSlowMo() {
  if (slowTimer) clearTimeout(slowTimer);
  slowTimer = null;
  const s = scene;
  if (!s || !s.sys) return;
  s.time.timeScale = 1;
  s.tweens.timeScale = 1;
  if (s.physics?.world) s.physics.world.timeScale = 1;
}

/** Anime-style radial speed lines over the screen. */
export function speedLines(ms = 650, color = 0xffffff) {
  const s = live();
  if (!s || reduced()) return;
  const w = s.scale.width;
  const h = s.scale.height;
  const g = s.add.graphics().setScrollFactor(0).setDepth(30000);
  const cam = s.cameras.main;
  // graphics with scrollFactor 0 are still zoomed: draw in screen space / zoom
  const z = cam.zoom;
  const cx = w / 2 / z;
  const cy = h / 2 / z;
  const r0 = Math.min(w, h) * 0.32 / z;
  const r1 = Math.max(w, h) / z;
  g.lineStyle(2 / z, color, 0.85);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2 + (i % 3) * 0.03;
    const jitter = ((i * 37) % 11) / 11;
    g.lineBetween(cx + Math.cos(a) * (r0 + jitter * r0 * 0.4), cy + Math.sin(a) * (r0 + jitter * r0 * 0.4), cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  }
  g.setPosition(-cx + w / 2 / z - (w / 2) * (1 - 1 / z) * 0, 0);
  s.tweens.add({ targets: g, alpha: 0, duration: ms, ease: 'Cubic.easeIn', onComplete: () => g.destroy() });
}

/** Pulsing red "danger" tint over the scene (Angry Mum Mode etc). */
export function redAlert(on: boolean) {
  const s = live();
  if (!s) return;
  if (on) {
    if (redRect?.active) return;
    redRect = s.add.rectangle(0, 0, s.scale.width * 2, s.scale.height * 2, 0xff2a2a, 0.0).setOrigin(0).setScrollFactor(0).setDepth(29000).setBlendMode(Phaser.BlendModes.MULTIPLY);
    redRect.setFillStyle(0xff6b5b, 1);
    redRect.setAlpha(0.25);
    redTween = s.tweens.add({ targets: redRect, alpha: { from: 0.18, to: 0.42 }, duration: 420, yoyo: true, repeat: -1 });
  } else {
    redTween?.stop();
    redRect?.destroy();
    redRect = null;
    redTween = null;
  }
}

/** Cinematic black bars in/out. */
export function letterbox(on: boolean, ms = 300) {
  const s = live();
  if (!s) return;
  const w = s.scale.width;
  const h = s.scale.height;
  const z = s.cameras.main.zoom;
  const bh = (h * 0.11) / z;
  if (on && !bars.length) {
    bars = [0, 1].map((i) => s.add.rectangle(0, i === 0 ? -bh : h / z, (w / z) * 2, bh, 0x000000, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(31000));
    s.tweens.add({ targets: bars[0], y: 0, duration: ms, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: bars[1], y: h / z - bh, duration: ms, ease: 'Cubic.easeOut' });
  } else if (!on && bars.length) {
    const [a, b] = bars;
    bars = [];
    s.tweens.add({ targets: a, y: -bh, duration: ms, onComplete: () => a.destroy() });
    s.tweens.add({ targets: b, y: h / z, duration: ms, onComplete: () => b.destroy() });
  }
}

export type StingKind = 'shock' | 'danger' | 'win' | 'fail' | 'reveal' | 'comedy';
/** A short musical sting for big moments. */
export function sting(kind: StingKind) {
  if (!store.ui.sound) return;
  const map: Record<StingKind, Parameters<typeof sfx.play>[0]> = { shock: 'alert', danger: 'warn', win: 'win', fail: 'fail', reveal: 'objective', comedy: 'select' };
  sfx.play(map[kind]);
}

/** One-call combo for a dramatic beat. */
export function dramatic(kind: StingKind = 'shock') {
  sting(kind);
  flash(kind === 'danger' ? 0xff5a4a : 0xffffff, 140);
  punchZoom(1.3, 420);
  speedLines(600);
  shake(0.004, 200);
}
