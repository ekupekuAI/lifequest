// Everyday-object layer: extra interactables (`obj:*`) next to existing props, label/flavour upgrades for
// flavour-only props, the family-dinner eating animation (plates of the region's dish, steam, bites,
// cutlery clinks, family bobbing), plants that perk up when watered and a living-room lamp glow.
// Logic lives in core/homeObjects.ts + core/dinner.ts; this layer only draws and wires positions.
import Phaser from 'phaser';
import { store } from '../core/store';
import { installHomeObjects, lampOn, objectInteract, objFx, objLabel, OBJ, overrideActive, OVERRIDES, plantWatered } from '../core/homeObjects';
import { dinnerFx, isEating } from '../core/dinner';
import { words } from '../domain/region';
import type { InteractSpec } from './scenes/WorldScene';
import { reducedMotion } from './cinematic';

// tile size (same as WorldScene.T — not imported: WorldScene → wow → this module is a cycle, and the
// positions below are evaluated at module load)
const T = 16;
const c = (col: number) => col * T + T / 2;
const b = (row: number) => (row + 1) * T;

type Dir = 'down' | 'left' | 'right' | 'up';
const DIR_ROW: Record<Dir, number> = { down: 0, left: 1, right: 2, up: 3 };

/** Seats around the dining table (same order HomeScene seats the family) + where each plate goes. */
const SEATS: { x: number; y: number; facing: Dir; plate: { x: number; y: number } }[] = [
  { x: 290, y: 104, facing: 'right', plate: { x: 309, y: 93 } },
  { x: 350, y: 104, facing: 'left', plate: { x: 331, y: 93 } },
  { x: 309, y: 128, facing: 'up', plate: { x: 311, y: 98 } },
  { x: 331, y: 128, facing: 'up', plate: { x: 329, y: 98 } },
  { x: 320, y: 83, facing: 'down', plate: { x: 320, y: 89 } },
  // big families fill all five: the player squeezes in at the top-left corner
  { x: 299, y: 84, facing: 'down', plate: { x: 307, y: 90 } },
];
const PLANTS = [
  { x: c(9), y: b(8) },
  { x: c(24), y: b(8) },
  { x: c(24), y: b(10) },
  { x: c(1), y: b(14) },
];
const TOWN_TREES = [
  { x: 24, y: b(19) },
  { x: 168, y: b(20) },
  { x: 232, y: b(18) },
  { x: 344, y: b(19) },
  { x: 408, y: b(24) },
  { x: 200, y: b(27) },
  { x: 456, y: b(19) },
  { x: 680, y: b(26) },
];
const CITY_TREES = [
  { x: 24, y: b(13) },
  { x: 520, y: b(13) },
];

// ---------------------------------------------------------------- textures

type Ctx = CanvasRenderingContext2D;
const px = (g: Ctx, col: string, x: number, y: number, w = 1, h = 1) => {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
};

/** [main, side, garnish] food colours for the region's dinner word. */
export function dishColors(dinner: string): [string, string, string] {
  const d = dinner.toLowerCase();
  if (d.includes('dal')) return ['#e8b830', '#f8f4e8', '#3a8a3a'];
  if (d.includes('pasta')) return ['#c83020', '#f0d080', '#3a8a3a'];
  if (d.includes('pie')) return ['#c8883a', '#8a5a2b', '#f0d890'];
  if (d.includes('jollof')) return ['#e05a20', '#f2c14e', '#3a8a3a'];
  if (d.includes('curry')) return ['#8a5420', '#f8f4e8', '#e0a030'];
  if (d.includes('feij')) return ['#4a2a1a', '#f8f4e8', '#3a8a3a'];
  if (d.includes('taco')) return ['#e8c040', '#3a8a3a', '#c83020'];
  return ['#e07a30', '#b8823a', '#f8f0d8'];
}

function drawPlate(g: Ctx, ox: number, stage: number, [main, side, garnish]: [string, string, string]) {
  // 12×7 plate, rim + well
  px(g, '#8a96a8', ox + 1, 6, 10, 1);
  px(g, '#dfe6ee', ox + 0, 1, 12, 5);
  px(g, '#dfe6ee', ox + 1, 0, 10, 6);
  px(g, '#d9e2ec', ox + 2, 1, 8, 4); // slightly blue well so white rice still reads
  if (stage === 0) {
    px(g, side, ox + 2, 2, 4, 3);
    px(g, side, ox + 3, 1, 2, 1);
    px(g, main, ox + 6, 1, 4, 4);
    px(g, garnish, ox + 7, 2, 1, 1);
    px(g, garnish, ox + 4, 2, 1, 1);
  } else if (stage === 1) {
    px(g, side, ox + 3, 2, 3, 2);
    px(g, main, ox + 6, 2, 3, 3);
    px(g, garnish, ox + 7, 3, 1, 1);
  } else if (stage === 2) {
    px(g, side, ox + 4, 3, 2, 1);
    px(g, main, ox + 6, 3, 2, 1);
  } else {
    px(g, main, ox + 5, 3, 1, 1);
    px(g, side, ox + 7, 2, 1, 1);
  }
}

function ensureTextures(scene: Phaser.Scene) {
  const tx = scene.textures;
  const dish = words('{dinner}');
  const key = `obj:plate:${dish}`;
  if (!tx.exists(key)) {
    const cv = document.createElement('canvas');
    cv.width = 48;
    cv.height = 7;
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const cols = dishColors(dish);
    for (let i = 0; i < 4; i++) drawPlate(g, i * 12, i, cols);
    const t = tx.addCanvas(key, cv)!;
    for (let i = 0; i < 4; i++) t.add(i, 0, i * 12, 0, 12, 7);
  }
  if (!tx.exists('obj:glow')) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 40;
    const g = cv.getContext('2d')!;
    const grd = g.createRadialGradient(20, 20, 2, 20, 20, 20);
    grd.addColorStop(0, 'rgba(255,220,140,0.85)');
    grd.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 40, 40);
    tx.addCanvas('obj:glow', cv);
  }
  return key;
}

// ---------------------------------------------------------------- tiny local sounds

let ac: AudioContext | null = null;
/** Cutlery clink / small blips — WebAudio, respects the sound toggle. */
export function clink(freqs: number[] = [2600, 3400], vol = 0.04) {
  if (!store.ui.sound || typeof window === 'undefined') return;
  try {
    ac ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ac.state === 'suspended') void ac.resume();
    const t0 = ac.currentTime;
    freqs.forEach((f, i) => {
      const o = ac!.createOscillator();
      const g = ac!.createGain();
      const t = t0 + i * 0.05;
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(ac!.destination);
      o.start(t);
      o.stop(t + 0.15);
    });
  } catch {
    /* audio unavailable */
  }
}

// ---------------------------------------------------------------- attach

interface SceneLike extends Phaser.Scene {
  player?: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  interactables?: InteractSpec[];
  lockMovement?: boolean;
  facing?: Dir;
  dyn?: { img: Phaser.GameObjects.Image; spec: { key: unknown; x: number; y: number } }[];
  fam?: Map<string, { spot: string; actor: { sprite: Phaser.GameObjects.Sprite } }>;
}

export function attachObjects(scene: Phaser.Scene) {
  installHomeObjects(store);
  const s = scene as SceneLike;
  if (!s.player || !s.interactables) return;
  const layer = new ObjectLayer(s);
  scene.events.on(Phaser.Scenes.Events.UPDATE, layer.update, layer);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, layer.update, layer);
    layer.destroy();
  });
}

class ObjectLayer {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private plates: Phaser.GameObjects.Image[] = [];
  private plantImgs: (Phaser.GameObjects.Image | undefined)[] = [];
  private glow?: Phaser.GameObjects.Image;
  private dinner: { timers: Phaser.Time.TimerEvent[]; tweens: Phaser.Tweens.Tween[]; done: () => void; keyFn: () => void } | null = null;
  private plateKey = '';

  constructor(private s: SceneLike) {
    const loc = store.state.location;
    this.plateKey = ensureTextures(s);
    const it = (spec: InteractSpec) => s.interactables!.push(spec);
    const obj = (id: string, x: number, y: number, r = 12) => it({ id, x, y, r, label: () => objLabel(store, id) });
    // upgrade flavour-only props that belong to this scene
    for (const spec of s.interactables!) if (OVERRIDES[spec.id]?.loc === loc) this.upgrade(spec);
    if (loc === 'home') {
      obj('obj:window', c(2), b(1) + 6);
      obj('obj:picture', c(8), b(1) + 6);
      obj('obj:clock', c(12), b(9) + 2);
      obj('obj:shower', c(11), b(2) + 2, 11);
      obj('obj:toilet', c(14), b(3) - 2, 10);
      obj('obj:lamp', c(14), b(13) - 4);
      PLANTS.forEach((p, i) => obj(`obj:plant:${i}`, p.x, p.y - 4, 11));
      // match the plant prop images so they can perk up when watered
      this.plantImgs = PLANTS.map((p) => s.dyn?.find((d) => d.spec.key === 'plant' && Math.abs(d.spec.x - p.x) < 2 && Math.abs(d.spec.y - p.y) < 2)?.img);
      this.glow = this.add(s.add.image(c(14), b(13) - 14, 'obj:glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(19995).setVisible(false)) as Phaser.GameObjects.Image;
      // dinner plates (hidden until the meal)
      for (const seat of SEATS) this.plates.push(this.add(s.add.image(seat.plate.x, seat.plate.y, this.plateKey, 0).setDepth(b(6) + 2).setVisible(false)) as Phaser.GameObjects.Image);
      dinnerFx.play = (done) => this.playDinner(done);
      dinnerFx.skip = () => this.endDinner();
    }
    if (loc === 'town') {
      obj('obj:house:b', 528, b(8) + 4, 16);
      obj('obj:house:c', 528, b(23) + 4, 16);
      obj('obj:house:d', 624, b(23) + 4, 16);
      TOWN_TREES.forEach((t, i) => obj(`obj:tree:${i}`, t.x, t.y - 2, 13));
    }
    if (loc === 'city') {
      [
        [344, b(10) - 2],
        [200, b(14) - 2],
        [344, b(14) - 2],
      ].forEach(([x, y], i) => obj(`obj:bench:${i + 1}`, x, y));
      CITY_TREES.forEach((t, i) => obj(`obj:tree:${i}`, t.x, t.y - 2, 13));
    }
    objFx.pulse = (id, kind) => this.pulse(id, kind);
  }

  /** Swap label + hide the flavour text while core/homeObjects handles this id. */
  private upgrade(spec: InteractSpec) {
    const id = spec.id;
    const label = spec.label;
    const flavor = spec.flavor;
    spec.label = (st) => (overrideActive(store, id) ? objLabel(store, id) : typeof label === 'function' ? label(st) : label);
    // while eating, the table hides its prompt so the plates stay visible (E skips via the key listener)
    if (id === 'dining-table') {
      const vis = spec.visible;
      spec.visible = (st) => !isEating() && (!vis || vis(st));
    }
    Object.defineProperty(spec, 'flavor', { configurable: true, enumerable: true, get: () => (overrideActive(store, id) ? undefined : flavor) });
  }

  private add<O extends Phaser.GameObjects.GameObject>(o: O): O {
    this.objs.push(o);
    return o;
  }

  destroy() {
    this.endDinner(true);
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    dinnerFx.play = (done) => done();
    dinnerFx.skip = () => {};
    objFx.pulse = () => {};
  }

  update() {
    if (store.state.location === 'home') {
      this.plantImgs.forEach((img, i) => {
        if (!img?.active) return;
        if (plantWatered(store, i)) img.clearTint();
        else img.setTint(0xd8cf96); // a bit droopy and dry
      });
      if (this.glow) {
        const night = store.state.clock.minutes % 1440 > 18.5 * 60;
        this.glow.setVisible(lampOn(store)).setAlpha(night ? 0.9 : 0.45);
      }
    }
  }

  // ---------------------------------------------------------------- fx

  private posOf(id: string): { x: number; y: number } {
    const spec = this.s.interactables!.find((i) => i.id === id);
    if (spec) return { x: spec.x, y: spec.y };
    return { x: this.s.player!.x, y: this.s.player!.y };
  }

  private pulse(id: string, kind: Parameters<typeof objFx.pulse>[1]) {
    const scene = this.s;
    if (!scene.sys?.isActive()) return;
    const p = this.posOf(id);
    const quiet = reducedMotion();
    if (kind === 'water') {
      // a few drops fall onto the plant, then a sparkle
      for (let i = 0; i < (quiet ? 1 : 4); i++) {
        const d = scene.add.image(p.x - 4 + i * 3, p.y - 26, 'fx:raindrop').setDepth(15000).setScale(0.6);
        scene.tweens.add({ targets: d, y: p.y - 8, alpha: 0.2, delay: i * 90, duration: 380, onComplete: () => d.destroy() });
      }
      clink([1400, 1800], 0.02);
      kind = 'sparkle';
    }
    if (kind === 'coin') clink([1800, 2400, 3000], 0.03);
    const key = `fx:${kind}`;
    if (!scene.textures.exists(key)) return;
    const img = scene.add.image(p.x, p.y - 22, key).setDepth(15000);
    scene.tweens.add({ targets: img, y: p.y - 38, alpha: 0, duration: quiet ? 500 : 1000, ease: 'Sine.easeOut', onComplete: () => img.destroy() });
    // a tiny "do it" squash on the player
    const pl = scene.player!;
    if (!quiet) scene.tweens.add({ targets: pl, scaleY: 0.92, duration: 110, yoyo: true, repeat: 1, onComplete: () => pl.setScale(1) });
  }

  // ---------------------------------------------------------------- dinner

  private playDinner(done: () => void) {
    const scene = this.s;
    const p = scene.player!;
    if (!scene.sys?.isActive()) return done();
    const others = store.state.profile.members.filter((m) => m.role !== 'player').length;
    const seatIdx = Math.min(others, SEATS.length - 1);
    const seat = SEATS[seatIdx];
    scene.lockMovement = true;
    p.setVelocity(0, 0);
    p.body.reset(seat.x, seat.y);
    p.anims.stop();
    p.setFrame(DIR_ROW[seat.facing] * 4);
    scene.facing = seat.facing;
    this.plates.forEach((pl, i) => pl.setFrame(0).setVisible(i < others || i === seatIdx));
    const timers: Phaser.Time.TimerEvent[] = [];
    const tweens: Phaser.Tweens.Tween[] = [];
    const quiet = reducedMotion();
    // steam rising from the plates
    timers.push(
      scene.time.addEvent({
        delay: 420,
        loop: true,
        callback: () => {
          const pl = this.plates[Math.floor(Math.random() * this.plates.length)];
          if (!pl?.visible || String(pl.frame.name) === '3') return;
          const st = scene.add.image(pl.x + Phaser.Math.Between(-2, 2), pl.y - 4, 'fx:steam').setDepth(15000).setScale(0.55).setAlpha(0.8);
          scene.tweens.add({ targets: st, y: st.y - 12, alpha: 0, duration: 1100, onComplete: () => st.destroy() });
        },
      }),
    );
    // family bobs & chats
    const fam = [...(scene.fam?.values() ?? [])].filter((e) => e.spot === 'dining').map((e) => e.actor.sprite);
    if (!quiet) for (const sp of fam) tweens.push(scene.tweens.add({ targets: sp, scaleY: 0.94, duration: 260 + Math.random() * 120, yoyo: true, repeat: -1, delay: Math.random() * 300 }));
    timers.push(
      scene.time.addEvent({
        delay: 1300,
        loop: true,
        callback: () => {
          const who = fam.length ? fam[Math.floor(Math.random() * fam.length)] : p;
          const kind = ['bubble', 'music', 'heart'][Math.floor(Math.random() * 3)];
          if (!scene.textures.exists(`fx:${kind}`)) return;
          const fx = scene.add.image(who.x, who.y - 28, `fx:${kind}`).setDepth(15000);
          scene.tweens.add({ targets: fx, y: fx.y - 10, alpha: 0, duration: 900, onComplete: () => fx.destroy() });
        },
      }),
    );
    // bites: player squash + plates empty in 3 steps + cutlery clink
    for (let i = 1; i <= 3; i++) {
      timers.push(
        scene.time.delayedCall(i * 1800, () => {
          this.plates.forEach((pl) => pl.setFrame(i));
          clink(i === 3 ? [2200, 2900, 3600] : [2600, 3400]);
          if (!quiet) scene.tweens.add({ targets: p, scaleY: 0.9, duration: 120, yoyo: true, repeat: 1, onComplete: () => p.setScale(1) });
        }),
      );
    }
    timers.push(scene.time.delayedCall(7000, () => this.endDinner()));
    const startedAt = performance.now();
    // ignore the same E press that sat us down (the key event is still being dispatched)
    const keyFn = () => {
      if (performance.now() - startedAt > 350) this.endDinner();
    };
    scene.input.keyboard?.on('keydown-E', keyFn);
    this.dinner = { timers, tweens, done, keyFn };
    store.toast(`🍽 Family dinner: ${words('{dinner}')}! (press E to skip)`, 'info');
    clink();
  }

  private endDinner(silent = false) {
    const d = this.dinner;
    if (!d) return;
    this.dinner = null;
    const scene = this.s;
    d.timers.forEach((t) => t.remove(false));
    d.tweens.forEach((t) => t.stop());
    scene.input?.keyboard?.off('keydown-E', d.keyFn);
    [...(scene.fam?.values() ?? [])].forEach((e) => e.actor.sprite?.active && e.actor.sprite.setScale(1));
    scene.player?.active && scene.player.setScale(1);
    scene.lockMovement = false;
    this.plates.forEach((pl) => pl.active && pl.setFrame(3));
    // clear the plates a moment later
    if (!silent && scene.sys?.isActive()) scene.time.delayedCall(2500, () => this.plates.forEach((pl) => pl.active && pl.setVisible(false)));
    d.done();
  }
}

export { objectInteract, OBJ };
