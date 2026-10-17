// Cinematic toolkit: dramatic camera & screen effects any system can trigger.
// Bound to the active WorldScene by attachWow(). Every call is safe when no
// scene is active (it simply does nothing). Owned by the cinematic/rewind agent,
// who may enhance these — keep the function names and signatures stable.
//
// Notes for maintainers:
// - Screen-space overlays (scrollFactor 0) are still scaled by the camera zoom around the
//   camera centre, so they are laid out every frame through `place()` (correct under any zoom,
//   including mid punch-zoom).
// - Anything that must end on time (slow-mo, freeze, punch zoom, bars) runs on REAL time
//   (performance.now) — never on the scene clock it is slowing down — and has a setTimeout
//   safety net, so the world always returns to normal speed.
// - Motion effects respect prefers-reduced-motion (and a future `settings.reducedMotion`).
import Phaser from 'phaser';
import { sfx } from '../core/sfx';
import { store } from '../core/store';

let scene: Phaser.Scene | null = null;
let redRect: Phaser.GameObjects.Rectangle | null = null;
let bars: Phaser.GameObjects.Rectangle[] = [];
let barsK = 0; // 0 = hidden, 1 = fully in
let barsSeq = 0;
let vignette: Phaser.GameObjects.Image | null = null;
let freezeBorder: Phaser.GameObjects.Graphics | null = null;
let slowTimer: ReturnType<typeof setTimeout> | null = null;
let freezeTimer: ReturnType<typeof setTimeout> | null = null;
let slow: { scale: number; t0: number; ms: number } | null = null;
let slowValue = 1;
let frozen = false;
let punch: { base: number; amount: number; t0: number; ms: number } | null = null;
let colorFx: Phaser.FX.ColorMatrix | null = null;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** true when the player (or their OS) asked for less motion. */
export function reducedMotion(): boolean {
  const st = store.state.settings as { reducedMotion?: boolean } | undefined;
  if (st?.reducedMotion) return true;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
const reduced = reducedMotion;
const live = () => (scene && scene.sys && scene.sys.isActive() ? scene : null);
/** The scene effects are currently bound to (null between scenes). */
export const cinematicScene = () => live();

// ------------------------------------------------------------------ real-time micro-animator ---
type RT = { t0: number; dur: number; step: (k: number) => void; done?: () => void };
let rts: RT[] = [];
function rt(dur: number, step: (k: number) => void, done?: () => void) {
  const r = { t0: now(), dur: Math.max(1, dur), step, done };
  rts.push(r);
  step(0);
  return r;
}
function tickRT() {
  if (!rts.length) return;
  const t = now();
  const list = rts;
  rts = [];
  const keep: RT[] = [];
  for (const r of list) {
    const k = Math.min(1, (t - r.t0) / r.dur);
    try {
      r.step(k);
    } catch {
      /* object destroyed */
    }
    if (k >= 1) r.done?.();
    else keep.push(r);
  }
  rts = keep.concat(rts);
}
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// ------------------------------------------------------------------ screen-space placement ---
/** Place a scrollFactor-0 object so it appears at screen pixel (sx, sy) at the current zoom. */
function place(o: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, sx: number, sy: number) {
  const cam = live()?.cameras.main;
  if (!cam) return;
  const z = cam.zoom || 1;
  const ox = cam.width * cam.originX;
  const oy = cam.height * cam.originY;
  o.setPosition(ox + (sx - ox) / z, oy + (sy - oy) / z);
  o.setScale(1 / z);
}

function layout() {
  const s = live();
  if (!s) return;
  const cam = s.cameras.main;
  const w = cam.width;
  const h = cam.height;
  if (bars.length === 2) {
    const bh = Math.round(h * 0.085);
    const [a, b] = bars;
    a.setSize(w, bh);
    b.setSize(w, bh);
    place(a, 0, -bh + bh * barsK);
    place(b, 0, h - bh * barsK);
  }
  if (redRect?.active) {
    redRect.setSize(w, h);
    place(redRect, 0, 0);
  }
  if (vignette?.active) {
    place(vignette, w / 2, h / 2);
    vignette.setScale(vignette.scaleX * (w / vignette.width), vignette.scaleY * (h / vignette.height));
  }
  if (freezeBorder?.active) place(freezeBorder, 0, 0);
}

function applyTimeScale() {
  const s = scene;
  if (!s || !s.sys) return;
  const v = frozen ? 0 : slowValue;
  s.time.timeScale = v;
  s.tweens.timeScale = v;
  const world = s.physics?.world;
  if (world) {
    if (frozen) {
      if (!world.isPaused) world.pause();
    } else {
      if (world.isPaused) world.resume();
      world.timeScale = 1 / Math.max(0.05, v);
    }
  }
  if (s.anims) s.anims.globalTimeScale = v;
}

function tickSlow() {
  if (!slow) return;
  const t = now() - slow.t0;
  const inMs = Math.min(140, slow.ms * 0.2);
  const outMs = Math.min(260, slow.ms * 0.35);
  let v: number;
  if (t < inMs) v = 1 + (slow.scale - 1) * easeOut(t / inMs);
  else if (t < slow.ms - outMs) v = slow.scale;
  else if (t < slow.ms) v = slow.scale + (1 - slow.scale) * easeInOut((t - (slow.ms - outMs)) / outMs);
  else return endSlowMo();
  slowValue = v;
  applyTimeScale();
}

function tickPunch() {
  const s = live();
  if (!punch || !s) return;
  const k = (now() - punch.t0) / punch.ms;
  const cam = s.cameras.main;
  if (k >= 1) {
    cam.setZoom(punch.base);
    punch = null;
    return;
  }
  // fast overshooting push in (35%), hold (30%), ease back out (35%)
  let f: number;
  if (k < 0.35) {
    const x = k / 0.35;
    const c1 = 1.70158;
    f = 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); // back-out
  } else if (k < 0.65) f = 1;
  else f = 1 - easeInOut((k - 0.65) / 0.35);
  cam.setZoom(punch.base * (1 + (punch.amount - 1) * f));
}

function onPostUpdate() {
  tickSlow();
  tickPunch();
  tickRT();
  layout();
}

export function bindCinematic(s: Phaser.Scene) {
  scene = s;
  redRect = null;
  bars = [];
  barsK = 0;
  vignette = null;
  freezeBorder = null;
  punch = null;
  rts = [];
  colorFx = null;
  s.events.on(Phaser.Scenes.Events.POST_UPDATE, onPostUpdate);
  s.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    s.events.off(Phaser.Scenes.Events.POST_UPDATE, onPostUpdate);
    if (scene === s) {
      endFreeze();
      endSlowMo();
      if (punch) s.cameras.main?.setZoom(punch.base);
      punch = null;
      rts = [];
      bars = [];
      redRect = null;
      vignette = null;
      freezeBorder = null;
      colorFx = null;
      scene = null;
    }
  });
}

/** Quick dramatic zoom in and back (e.g. on a shocking moment). */
export function punchZoom(zoom = 1.25, ms = 380) {
  const s = live();
  if (!s || reduced()) return;
  const cam = s.cameras.main;
  const base = punch ? punch.base : cam.zoom; // never drift when punches overlap
  punch = { base, amount: zoom, t0: now(), ms: Math.max(120, ms) };
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
  // reduced motion: a softer, shorter flash
  if (reduced()) s.cameras.main.flash(Math.min(ms, 120), Math.round(c.r * 0.5), Math.round(c.g * 0.5), Math.round(c.b * 0.5));
  else s.cameras.main.flash(ms, c.r, c.g, c.b);
}

/** Slow the whole world down for `ms` real milliseconds (scale 0.3 = 30% speed). Smoothly ramps in and out. */
export function slowMo(scale = 0.3, ms = 900) {
  const s = live();
  if (!s || reduced()) return;
  scale = Phaser.Math.Clamp(scale, 0.05, 1);
  slow = { scale: slow ? Math.min(slow.scale, scale) : scale, t0: now(), ms: Math.max(200, ms) };
  if (slowTimer) clearTimeout(slowTimer);
  // safety net: even if the scene stops updating, normal speed comes back
  slowTimer = setTimeout(endSlowMo, ms + 400);
  tickSlow();
}

/** Force normal speed right now (also used on scene shutdown). */
export function endSlowMo() {
  if (slowTimer) clearTimeout(slowTimer);
  slowTimer = null;
  slow = null;
  slowValue = 1;
  applyTimeScale();
}

/** Anime-style radial speed lines over the screen (centred on screen at any zoom). */
export function speedLines(ms = 650, color = 0xffffff) {
  const s = live();
  if (!s || reduced()) return;
  const cam = s.cameras.main;
  const w = cam.width;
  const h = cam.height;
  const g = s.add.graphics().setScrollFactor(0).setDepth(30000);
  const r0 = Math.min(w, h) * 0.3;
  const r1 = Math.hypot(w, h) * 0.6;
  const n = 56;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (((i * 53) % 7) / 7) * 0.05;
    const jitter = ((i * 37) % 11) / 11;
    const thick = 1 + ((i * 17) % 3);
    const start = r0 + jitter * r0 * 0.45;
    // wedge-shaped streak: thicker at the edge of the screen
    g.fillStyle(color, 0.75);
    const spread = (0.004 + thick * 0.0025) * (1 + jitter);
    g.fillTriangle(
      Math.cos(a) * start,
      Math.sin(a) * start,
      Math.cos(a - spread) * r1,
      Math.sin(a - spread) * r1,
      Math.cos(a + spread) * r1,
      Math.sin(a + spread) * r1,
    );
  }
  const follow = () => place(g, w / 2, h / 2);
  follow();
  rt(
    ms,
    (k) => {
      follow();
      g.setScale(g.scaleX * (1 + 0.08 * k));
      g.setAlpha(k < 0.25 ? 1 : 1 - easeInOut((k - 0.25) / 0.75));
    },
    () => g.destroy(),
  );
}

/** Pulsing red "danger" tint over the scene (Angry Mum Mode etc). */
export function redAlert(on: boolean) {
  const s = live();
  if (!s) return;
  if (on) {
    if (redRect?.active) return;
    const r = s.add.rectangle(0, 0, s.cameras.main.width, s.cameras.main.height, 0xff6b5b, 1).setOrigin(0).setScrollFactor(0).setDepth(29000).setBlendMode(Phaser.BlendModes.MULTIPLY);
    redRect = r;
    place(r, 0, 0);
    const pulse = () => {
      if (redRect !== r || !r.active) return;
      rt(840, (k) => r.setAlpha(0.18 + 0.24 * Math.sin(k * Math.PI)), pulse);
    };
    pulse();
  } else {
    redRect?.destroy();
    redRect = null;
  }
}

/** Cinematic black bars in/out (laid out in screen space, under the DOM HUD). */
export function letterbox(on: boolean, ms = 300) {
  const s = live();
  if (!s) return;
  const seq = ++barsSeq;
  if (on) {
    if (!bars.length) bars = [0, 1].map(() => s.add.rectangle(0, 0, 10, 10, 0x000000, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(31000));
    const from = barsK;
    rt(ms, (k) => {
      if (seq === barsSeq) barsK = from + (1 - from) * easeOut(k);
    });
  } else if (bars.length) {
    const mine = bars;
    const from = barsK;
    rt(
      ms,
      (k) => {
        if (seq === barsSeq) barsK = from * (1 - easeInOut(k));
      },
      () => {
        if (seq !== barsSeq || bars !== mine) return;
        mine.forEach((b) => b.destroy());
        bars = [];
        barsK = 0;
      },
    );
  }
}

/** Letterbox for `ms`, then bars out again. */
export function letterboxFor(ms = 1400, inMs = 260) {
  letterbox(true, inMs);
  rt(ms, () => {}, () => letterbox(false, 360));
}

export type StingKind = 'shock' | 'danger' | 'win' | 'fail' | 'reveal' | 'comedy' | 'scratch';
/** A short musical sting for big moments. */
export function sting(kind: StingKind) {
  if (!store.ui.sound) return;
  if (kind === 'scratch') return recordScratch();
  const map: Record<Exclude<StingKind, 'scratch'>, Parameters<typeof sfx.play>[0]> = { shock: 'alert', danger: 'warn', win: 'win', fail: 'fail', reveal: 'objective', comedy: 'select' };
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

/** A soft darkening (or coloured) vignette that breathes in and out once. */
export function vignettePulse(color = 0x000000, ms = 900, strength = 0.65) {
  const s = live();
  if (!s) return;
  const key = 'cine:vignette';
  if (!s.textures.exists(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 40, 128, 128, 182);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    s.textures.addCanvas(key, c);
  }
  vignette?.destroy();
  const v = s.add.image(0, 0, key).setScrollFactor(0).setDepth(29500).setOrigin(0.5).setAlpha(0);
  // white texture × tint = coloured vignette (black via a dark tint + multiply)
  if (color === 0x000000) v.setTint(0x000000);
  else v.setTint(color);
  vignette = v;
  layout();
  rt(
    ms,
    (k) => v.setAlpha(strength * Math.sin(k * Math.PI)),
    () => {
      if (vignette === v) vignette = null;
      v.destroy();
    },
  );
}

/**
 * "Yep, that's me. You're probably wondering how I got here." Freeze the world for `ms`:
 * white flash + white frame outline, desaturated picture, record-scratch sound, optional caption.
 */
export function freezeFrame(ms = 900, caption?: string) {
  const s = live();
  if (!s || frozen) return;
  sting('scratch');
  flash(0xffffff, 120);
  frozen = true;
  applyTimeScale();
  const cam = s.cameras.main;
  const w = cam.width;
  const h = cam.height;
  const g = s.add.graphics().setScrollFactor(0).setDepth(31500);
  const pad = Math.round(Math.min(w, h) * 0.035);
  g.lineStyle(6, 0xffffff, 1).strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  g.lineStyle(2, 0x000000, 0.6).strokeRect(pad + 5, pad + 5, w - pad * 2 - 10, h - pad * 2 - 10);
  freezeBorder?.destroy();
  freezeBorder = g;
  let label: Phaser.GameObjects.Text | null = null;
  if (caption) {
    label = s.add
      .text(0, 0, caption, { fontFamily: '"Press Start 2P", monospace', fontSize: `${Math.max(10, Math.round(Math.min(w, h) * 0.03))}px`, color: '#ffffff', backgroundColor: '#000000cc', padding: { x: 8, y: 6 } })
      .setScrollFactor(0)
      .setDepth(31600)
      .setOrigin(0, 1);
    const lbl = label;
    rt(ms, () => place(lbl, pad + 12, h - pad - 12));
  }
  try {
    if (s.renderer.type === Phaser.WEBGL && cam.postFX) {
      colorFx = cam.postFX.addColorMatrix();
      colorFx.saturate(-0.65);
      colorFx.contrast(0.15, true);
    }
  } catch {
    colorFx = null;
  }
  layout();
  if (freezeTimer) clearTimeout(freezeTimer);
  freezeTimer = setTimeout(() => {
    label?.destroy();
    endFreeze();
  }, ms);
}

function endFreeze() {
  if (freezeTimer) clearTimeout(freezeTimer);
  freezeTimer = null;
  const s = scene;
  if (colorFx && s?.cameras?.main?.postFX) {
    try {
      s.cameras.main.postFX.remove(colorFx as unknown as Phaser.FX.Controller);
    } catch {
      /* already gone */
    }
  }
  colorFx = null;
  freezeBorder?.destroy();
  freezeBorder = null;
  if (frozen) {
    frozen = false;
    applyTimeScale();
  }
}

// ------------------------------------------------------------------ local audio ---
let actx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    actx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (actx.state === 'suspended') void actx.resume();
    return actx;
  } catch {
    return null;
  }
}

/** Record-scratch: band-passed noise swept fast up/down/up. */
function recordScratch() {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime;
  const len = 0.42;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 6;
  bp.frequency.setValueAtTime(600, t0);
  bp.frequency.exponentialRampToValueAtTime(2600, t0 + 0.09);
  bp.frequency.exponentialRampToValueAtTime(380, t0 + 0.22);
  bp.frequency.exponentialRampToValueAtTime(1800, t0 + 0.36);
  const g = ac.createGain();
  const vol = Math.max(0.05, sfx.volume * 2.2);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.setValueAtTime(vol, t0 + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + len + 0.02);
}

/** Dev/test hook: state of the time-scale machinery. */
export function _cinematicDebug() {
  return { slowValue, frozen, slowActive: !!slow, punchActive: !!punch, bars: bars.length, barsK, scene: !!live() };
}
