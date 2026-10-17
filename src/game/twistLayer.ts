// Plot-twist visuals per scene: mess props + surprise guests, the hidden torch and flashlight position,
// the lost-puppy follower (procedural 16×16 dog), the wallet on the pavement, the anxious owner, the kite.
// Story/state lives in core/twists.ts; this layer only draws it. Everything is an Image/Sprite so the
// 3D diorama mirrors it too.
import Phaser from 'phaser';
import { store } from '../core/store';
import { activeTwist, installTwists, isActive, messThere, MESS_COUNT, TORCH_SPOT_LABELS, TORCH_SPOTS, twistFx, twists } from '../core/twists';
import type { InteractSpec } from './scenes/WorldScene';
import { T } from './scenes/WorldScene';
import { dramatic, flash, letterbox, shake, sting } from './cinematic';
import { drawCharacterSheet, FRAME_H, FRAME_W, type CharKind } from './art/characters';
import type { Appearance } from '../domain/types';

const c = (col: number) => col * T + T / 2;
const b = (row: number) => (row + 1) * T;

// ---------------------------------------------------------------- textures

type Ctx = CanvasRenderingContext2D;
function canvas(w: number, h: number, draw: (g: Ctx) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  draw(g);
  return cv;
}
const px = (g: Ctx, col: string, x: number, y: number, w = 1, h = 1) => {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
};

/** One 16×16 dog frame: tail 0/1 (wag), legs 0/1 (walk). Faces right. */
function drawDog(g: Ctx, ox: number, tail: number, legs: number) {
  const fur = '#c8894a';
  const dark = '#8a5a2b';
  const light = '#f0c590';
  const ol = '#2b1d14';
  // shadow
  px(g, 'rgba(0,0,0,0.25)', ox + 3, 14, 10, 2);
  // legs
  const l = legs ? [4, 7, 9, 12] : [5, 6, 10, 11];
  for (const x of l) px(g, dark, ox + x, 11, 1, 3);
  // body
  px(g, ol, ox + 3, 7, 10, 5);
  px(g, fur, ox + 4, 7, 8, 4);
  px(g, light, ox + 5, 10, 6, 1);
  // head
  px(g, ol, ox + 10, 3, 6, 6);
  px(g, fur, ox + 11, 4, 4, 4);
  px(g, light, ox + 13, 6, 3, 2);
  px(g, ol, ox + 15, 6, 1, 1); // nose
  px(g, ol, ox + 13, 5, 1, 1); // eye
  px(g, dark, ox + 10, 3, 2, 3); // ear
  px(g, '#e85d75', ox + 14, 8, 1, 1); // tongue
  // tail
  if (tail) {
    px(g, dark, ox + 2, 4, 1, 3);
    px(g, dark, ox + 1, 3, 1, 1);
  } else {
    px(g, dark, ox + 1, 7, 2, 1);
    px(g, dark, ox + 0, 6, 1, 1);
  }
}

const MESS = ['shoe', 'cushion', 'paper', 'sock', 'toy'] as const;
function drawMess(g: Ctx, kind: (typeof MESS)[number]) {
  const ol = '#2b1d14';
  switch (kind) {
    case 'shoe':
      px(g, ol, 1, 6, 8, 4);
      px(g, '#e94f37', 2, 6, 6, 3);
      px(g, '#fff', 2, 8, 7, 1);
      px(g, ol, 9, 8, 5, 3);
      px(g, '#3f88c5', 10, 8, 4, 2);
      break;
    case 'cushion':
      px(g, ol, 2, 3, 12, 9);
      px(g, '#f2a541', 3, 4, 10, 7);
      px(g, '#ffd27a', 4, 5, 4, 2);
      break;
    case 'paper':
      px(g, '#ddd', 2, 5, 11, 7);
      px(g, '#999', 3, 6, 6, 1);
      px(g, '#999', 3, 8, 8, 1);
      px(g, '#999', 3, 10, 5, 1);
      break;
    case 'sock':
      px(g, ol, 4, 3, 4, 8);
      px(g, '#8e5ea2', 5, 3, 2, 7);
      px(g, ol, 4, 10, 8, 3);
      px(g, '#8e5ea2', 5, 10, 6, 2);
      break;
    case 'toy':
      px(g, ol, 2, 6, 12, 5);
      px(g, '#3bb273', 3, 6, 10, 3);
      px(g, '#bde0fe', 6, 4, 4, 2);
      px(g, ol, 4, 10, 2, 2);
      px(g, ol, 10, 10, 2, 2);
      break;
  }
}

const GUEST_LOOKS: Record<string, { a: Appearance; kind: CharKind }> = {
  aunt: { a: { skin: '#c68642', hair: '#2b1d14', hairStyle: 'bun', shirt: '#e85d75', pants: '#6a2c70' }, kind: 'adult' },
  uncle: { a: { skin: '#a86b3c', hair: '#3b2a1a', hairStyle: 'bald', shirt: '#f2c14e', pants: '#2b2d42' }, kind: 'adult' },
  cousin: { a: { skin: '#c68642', hair: '#1b1325', hairStyle: 'spiky', shirt: '#ffffff', pants: '#3d5a80' }, kind: 'child' },
};

function ensureTextures(scene: Phaser.Scene) {
  const tx = scene.textures;
  const add = (key: string, cv: HTMLCanvasElement) => {
    if (!tx.exists(key)) tx.addCanvas(key, cv);
    return tx.get(key);
  };
  if (!tx.exists('twist:dog')) {
    const t = add(
      'twist:dog',
      canvas(64, 16, (g) => {
        drawDog(g, 0, 0, 0);
        drawDog(g, 16, 1, 0);
        drawDog(g, 32, 0, 1);
        drawDog(g, 48, 1, 1);
      }),
    );
    for (let i = 0; i < 4; i++) t.add(i, 0, i * 16, 0, 16, 16);
  }
  MESS.forEach((m, i) => add(`twist:mess:${i}`, canvas(16, 16, (g) => drawMess(g, m))));
  add(
    'twist:tray',
    canvas(16, 12, (g) => {
      px(g, '#2b1d14', 0, 6, 16, 5);
      px(g, '#b5651d', 1, 7, 14, 3);
      px(g, '#fff', 3, 2, 4, 5);
      px(g, '#c0392b', 4, 3, 2, 1);
      px(g, '#e8b04b', 9, 4, 5, 2);
      px(g, '#d9a066', 10, 3, 3, 1);
    }),
  );
  add(
    'twist:wallet',
    canvas(12, 8, (g) => {
      px(g, '#2b1d14', 0, 1, 12, 7);
      px(g, '#7b4b2a', 1, 2, 10, 5);
      px(g, '#3bb273', 2, 0, 6, 2);
      px(g, '#9a6a44', 7, 4, 3, 2);
    }),
  );
  add(
    'twist:torch',
    canvas(12, 8, (g) => {
      px(g, '#2b1d14', 0, 2, 9, 4);
      px(g, '#c0392b', 1, 3, 7, 2);
      px(g, '#ccc', 9, 1, 3, 6);
      px(g, '#fff6a8', 10, 2, 2, 4);
    }),
  );
  add(
    'twist:spot',
    canvas(10, 6, (g) => {
      px(g, 'rgba(255,240,170,0.9)', 4, 0, 2, 2);
      px(g, 'rgba(255,240,170,0.6)', 2, 3, 6, 1);
    }),
  );
  add(
    'twist:kite',
    canvas(16, 24, (g) => {
      g.fillStyle = '#e94f37';
      g.beginPath();
      g.moveTo(8, 0);
      g.lineTo(15, 8);
      g.lineTo(8, 16);
      g.lineTo(1, 8);
      g.closePath();
      g.fill();
      px(g, '#f2c14e', 8, 0, 1, 16);
      px(g, '#f2c14e', 1, 8, 14, 1);
      px(g, '#fff', 8, 16, 1, 3);
      px(g, '#3f88c5', 6, 19, 3, 2);
      px(g, '#fff', 8, 21, 1, 3);
    }),
  );
  for (const [k, v] of Object.entries(GUEST_LOOKS)) {
    const key = `char:twist:${k}`;
    if (tx.exists(key)) continue;
    const t = tx.addCanvas(key, drawCharacterSheet(v.a, v.kind))!;
    for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) t.add(r * 4 + col, 0, col * FRAME_W, r * FRAME_H, FRAME_W, FRAME_H);
  }
}

// ---------------------------------------------------------------- per-scene layer

interface SceneLike extends Phaser.Scene {
  player?: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  interactables?: InteractSpec[];
  cfg?: { location: string };
}

let fxBound = false;

export function attachTwists(scene: Phaser.Scene) {
  installTwists(store);
  if (!fxBound) {
    fxBound = true;
    twistFx.dramatic = (k) => dramatic(k);
    twistFx.letterbox = (on) => letterbox(on);
    twistFx.sting = (k) => sting(k);
    twistFx.flash = (col) => flash(col ?? 0xffffff, 220);
    twistFx.shake = () => shake(0.006, 260);
  }
  const s = scene as SceneLike;
  if (!s.player || !s.interactables) return;
  ensureTextures(scene);
  const layer = new TwistLayer(s);
  scene.events.on(Phaser.Scenes.Events.UPDATE, layer.update, layer);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, layer.update, layer);
    layer.destroy();
  });
}

const loc = () => store.state.location;
const step = () => activeTwist(store)?.step;

class TwistLayer {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private mess: Phaser.GameObjects.Image[] = [];
  private guests: Phaser.GameObjects.Sprite[] = [];
  private tray?: Phaser.GameObjects.Image;
  private spots: Phaser.GameObjects.Image[] = [];
  private dog?: Phaser.GameObjects.Sprite;
  private dogSpec?: InteractSpec;
  private trail: { x: number; y: number; t: number }[] = [];
  private dogWander = { x: 0, y: 0, pause: 0 };
  private wallet?: Phaser.GameObjects.Image;
  private walletSpec?: InteractSpec;
  private owner?: Phaser.GameObjects.Sprite;
  private ownerSpec?: InteractSpec;
  private ownerT = 0;
  private kite?: Phaser.GameObjects.Image;
  private mia?: Phaser.GameObjects.Sprite;
  private kiteSpec?: InteractSpec;
  private auntSpec?: InteractSpec;
  private lightVar = '';

  constructor(private s: SceneLike) {
    const home = loc() === 'home';
    const town = loc() === 'town';
    const it = (spec: InteractSpec) => {
      s.interactables!.push(spec);
      return spec;
    };
    if (home) {
      // ---- surprise relatives: mess, snack tray, guests ----
      const spots = [
        { x: c(3), y: b(11) },
        { x: c(9), y: b(10) + 4 },
        { x: c(16), y: b(12) },
        { x: c(20), y: b(11) },
        { x: c(5), y: b(13) },
      ];
      for (let i = 0; i < MESS_COUNT; i++) {
        const p = spots[i];
        const img = this.add(s.add.image(p.x, p.y, `twist:mess:${i}`).setOrigin(0.5, 1).setDepth(p.y - 6).setVisible(false));
        this.mess.push(img as Phaser.GameObjects.Image);
        it({ id: `twist:mess:${i}`, x: p.x, y: p.y - 4, r: 14, label: 'Put it away ✨', visible: () => messThere(store, i) });
      }
      this.tray = this.add(s.add.image(c(19), b(8) - 2, 'twist:tray').setOrigin(0.5, 1).setDepth(b(8)).setVisible(false)) as Phaser.GameObjects.Image;
      it({ id: 'twist:tray', x: c(19), y: b(8) - 4, r: 16, label: 'Take the snack tray 🍪', visible: () => isActive(store, 'relatives', 'snacks') });
      const gp = [
        { k: 'aunt', x: c(15), y: b(11) },
        { k: 'uncle', x: c(17), y: b(11) },
        { k: 'cousin', x: c(16), y: b(12) },
      ];
      for (const g of gp) this.guests.push(this.add(s.add.sprite(g.x, g.y, `char:twist:${g.k}`, 0).setOrigin(0.5, 1).setDepth(g.y).setVisible(false)) as Phaser.GameObjects.Sprite);
      this.auntSpec = it({
        id: 'twist:aunt',
        x: c(15),
        y: b(11) - 4,
        r: 20,
        label: () => (step() === 'serve' ? 'Serve the tea & snacks 🫖' : 'Talk to Aunty Pinky'),
        visible: () => !!activeTwist(store) && activeTwist(store)!.id === 'relatives' && ['guests', 'snacks', 'serve'].includes(step() ?? ''),
      });
      // ---- power cut: three hiding places for the torch ----
      const tp = [
        { x: 4 * T - 7, y: b(3) + 4 },
        { x: c(2), y: b(11) },
        { x: c(22), y: b(3) + 4 },
      ];
      for (let i = 0; i < TORCH_SPOTS; i++) {
        this.spots.push(this.add(s.add.image(tp[i].x, tp[i].y - 8, 'twist:spot').setDepth(19500).setVisible(false)) as Phaser.GameObjects.Image);
        it({ id: `twist:torch:${i}`, x: tp[i].x, y: tp[i].y, r: 14, label: `${TORCH_SPOT_LABELS[i]} 🔦`, visible: () => isActive(store, 'powercut', 'find') });
      }
    }
    if (town) {
      this.wallet = this.add(s.add.image(0, 0, 'twist:wallet').setOrigin(0.5, 1).setVisible(false)) as Phaser.GameObjects.Image;
      this.walletSpec = it({ id: 'twist:wallet', x: -999, y: -999, r: 16, label: 'Pick up the wallet 👛', visible: () => isActive(store, 'wallet', 'spotted') });
      this.owner = this.add(s.add.sprite(300, b(10), 'char:folk:3', 0).setOrigin(0.5, 1).setVisible(false)) as Phaser.GameObjects.Sprite;
      this.ownerSpec = it({ id: 'twist:owner', x: -999, y: -999, r: 18, label: 'The worried man…', visible: () => isActive(store, 'wallet', 'guilt') });
      this.kite = this.add(s.add.image(0, 0, 'twist:kite').setOrigin(0.5, 1).setVisible(false)) as Phaser.GameObjects.Image;
      this.mia = this.add(s.add.sprite(0, 0, 'char:folk:7', 0).setOrigin(0.5, 1).setVisible(false)) as Phaser.GameObjects.Sprite;
      this.kiteSpec = it({ id: 'twist:kite', x: -999, y: -999, r: 22, label: 'Help get the kite down 🪁', visible: () => isActive(store, 'kite', 'stuck') });
    }
    // ---- the dog (follower in town / family pet at home) ----
    this.dog = this.add(s.add.sprite(s.player!.x - 14, s.player!.y, 'twist:dog', 0).setOrigin(0.5, 1).setVisible(false)) as Phaser.GameObjects.Sprite;
    this.dogSpec = it({ id: 'twist:dog', x: -999, y: -999, r: 14, label: () => `${twists(store).puppy?.name ?? 'Dog'} · feed / walk / pet 🐕`, visible: () => twists(store).puppy?.status === 'adopted' && loc() === 'home' });
    this.dogWander = { x: c(18), y: b(12), pause: 0 };
    if (home && twists(store).puppy?.status === 'adopted') this.dog.setPosition(c(18), b(12));
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  destroy() {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    this.setLight(null);
  }

  update(time: number, delta: number) {
    const p = this.s.player;
    if (!p || !p.active) return;
    const a = activeTwist(store);
    const now = time;
    // ---- relatives ----
    this.mess.forEach((m, i) => m.setVisible(messThere(store, i)).setY(m.y));
    this.tray?.setVisible(isActive(store, 'relatives', 'snacks'));
    const guestsIn = a?.id === 'relatives' && ['guests', 'snacks', 'serve', 'questions'].includes(a.step);
    this.guests.forEach((g, i) => {
      g.setVisible(!!guestsIn);
      if (guestsIn) g.setFrame(i === 2 ? (Math.floor(now / 400) % 2 ? 0 : 1) : 0);
    });
    // ---- power cut ----
    const pc = a?.id === 'powercut' && loc() === 'home';
    this.spots.forEach((sp) => sp.setVisible(pc && a!.step === 'find').setAlpha(0.5 + Math.sin(now / 200) * 0.4));
    this.setLight(pc ? this.screenPos(p.x, p.y - 12) : null);
    // ---- wallet ----
    if (this.wallet && this.walletSpec) {
      const show = isActive(store, 'wallet', 'spotted');
      if (show && a) {
        if (a.data.wx === undefined) {
          a.data.wx = Math.round(p.x + (this.s.cameras.main.worldView.centerX > p.x ? 30 : -30));
          a.data.wy = Math.round(p.y + 2);
        }
        const wx = Number(a.data.wx);
        const wy = Number(a.data.wy);
        this.wallet.setPosition(wx, wy).setDepth(wy - 8).setVisible(true).setAngle(Math.sin(now / 300) * 4);
        this.walletSpec.x = wx;
        this.walletSpec.y = wy - 3;
      } else this.wallet.setVisible(false);
    }
    if (this.owner && this.ownerSpec) {
      const show = isActive(store, 'wallet', 'guilt');
      this.owner.setVisible(show);
      if (show) {
        this.ownerT += delta;
        const x = 260 + Math.sin(this.ownerT / 2600) * 120;
        const y = b(10) - 2;
        const dx = x - this.owner.x;
        this.owner.setPosition(x, y).setDepth(y);
        const moving = Math.abs(dx) > 0.05;
        if (moving) this.owner.play(`char:folk:3:walk-${dx < 0 ? 'left' : 'right'}`, true);
        this.ownerSpec.x = x;
        this.ownerSpec.y = y - 4;
      }
    }
    // ---- kite ----
    if (this.kite && this.mia && this.kiteSpec) {
      const show = isActive(store, 'kite', 'stuck');
      if (show && a) {
        if (a.data.kx === undefined) {
          const trees = [168, 248, 384, 480, 576, 688];
          a.data.kx = trees.reduce((best, x) => (Math.abs(x - p.x) < Math.abs(best - p.x) ? x : best), trees[0]);
        }
        const kx = Number(a.data.kx);
        this.kite.setPosition(kx + 4, b(7) - 14 + Math.sin(now / 250) * 1).setAngle(Math.sin(now / 180) * 8).setDepth(b(7) + 2).setVisible(true);
        this.mia.setPosition(kx + 16, b(9) + 6).setDepth(b(9) + 6).setVisible(true).setFrame(Math.floor(now / 300) % 2 ? 12 : 0);
        this.kiteSpec.x = kx + 12;
        this.kiteSpec.y = b(9) + 2;
      } else {
        this.kite.setVisible(false);
        this.mia.setVisible(false);
      }
    }
    // ---- dog ----
    this.updateDog(now, delta);
  }

  private updateDog(now: number, delta: number) {
    const dog = this.dog!;
    const p = this.s.player!;
    const pup = twists(store).puppy;
    const a = activeTwist(store);
    const following = a?.id === 'puppy' && pup?.status === 'following';
    const pet = pup?.status === 'adopted' && loc() === 'home';
    const walking = pup?.status === 'adopted' && loc() !== 'home';
    if (!following && !pet && !walking) {
      dog.setVisible(false);
      this.dogSpec!.x = -999;
      return;
    }
    if (!dog.visible) {
      dog.setPosition(p.x - 16, p.y);
      this.trail = [];
    }
    dog.setVisible(true);
    let tx: number;
    let ty: number;
    if (following || walking) {
      // follower AI: chase where the player was ~350 ms ago, keep a little gap
      this.trail.push({ x: p.x, y: p.y, t: now });
      while (this.trail.length > 2 && now - this.trail[0].t > 350) this.trail.shift();
      tx = this.trail[0].x;
      ty = this.trail[0].y;
    } else {
      // family pet: potter around the living room, come say hi when you're close
      const near = Phaser.Math.Distance.Between(dog.x, dog.y, p.x, p.y) < 50;
      if (near) {
        tx = p.x + (dog.x < p.x ? -14 : 14);
        ty = p.y;
      } else {
        this.dogWander.pause -= delta;
        if (this.dogWander.pause <= 0) {
          this.dogWander = { x: c(13 + Math.floor(Math.random() * 9)), y: b(11 + Math.floor(Math.random() * 3)), pause: 1800 + Math.random() * 2500 };
        }
        tx = this.dogWander.x;
        ty = this.dogWander.y;
      }
    }
    const dx = tx - dog.x;
    const dy = ty - dog.y;
    const d = Math.hypot(dx, dy);
    const gap = following || walking ? 14 : 2;
    const moving = d > gap;
    if (moving) {
      const sp = Math.min(d - gap, ((d > 60 ? 120 : 80) * delta) / 1000);
      dog.x += (dx / d) * sp;
      dog.y += (dy / d) * sp;
      if (Math.abs(dx) > 0.5) dog.setFlipX(dx < 0);
      dog.setFrame(2 + (Math.floor(now / 120) % 2));
    } else dog.setFrame(Math.floor(now / 180) % 2); // tail wag
    dog.setDepth(dog.y);
    this.dogSpec!.x = dog.x;
    this.dogSpec!.y = dog.y - 4;
  }

  /** Player position in page pixels (for the DOM flashlight); centred while the 3D view covers the canvas. */
  private screenPos(x: number, y: number): { x: number; y: number } | null {
    const canvasEl = this.s.game.canvas;
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    if (canvasEl.style.opacity === '0') return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.55 };
    const cam = this.s.cameras.main;
    const k = rect.width / this.s.scale.width;
    return { x: rect.left + (x - cam.worldView.x) * cam.zoom * k, y: rect.top + (y - cam.worldView.y) * cam.zoom * k };
  }

  private setLight(pos: { x: number; y: number } | null) {
    if (typeof document === 'undefined') return;
    const v = pos ? `${Math.round(pos.x)},${Math.round(pos.y)}` : '';
    if (v === this.lightVar) return;
    this.lightVar = v;
    const st = document.documentElement.style;
    if (pos) {
      st.setProperty('--twist-lx', `${Math.round(pos.x)}px`);
      st.setProperty('--twist-ly', `${Math.round(pos.y)}px`);
    }
  }
}
