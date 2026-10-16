// Shared engine for every walkable map: ASCII tilemap + collisions, props,
// interactables, NPCs, doors, day/night lighting, interaction prompts and FX.
import Phaser from 'phaser';
import { store } from '../../core/store';
import type { GameState, LocationId } from '../../domain/types';
import { touchInput } from '../input';
import { TILE_INDEX, type TileName } from '../art/tiles';
import { sfx } from '../../core/sfx';
import type { WorldView3D } from '../runtime';

export const T = 16;
export const SCENE_FOR: Record<LocationId, string> = { home: 'Home', town: 'Town', grocery: 'Store', clinic: 'Clinic', city: 'City', library: 'Library' };

export interface PropSpec {
  key: string | ((s: GameState) => string);
  x: number;
  y: number; // bottom-centre anchor
  /** collision footprint height from the bottom (px); width defaults to sprite width - 2 */
  solid?: number | { w: number; h: number; dy?: number };
  depth?: number;
  visible?: (s: GameState) => boolean;
  blend?: 'add';
  wall?: boolean; // wall decoration — drawn below actors
  alpha?: number;
  scale?: number;
}

export interface InteractSpec {
  id: string;
  x: number;
  y: number;
  label: string | ((s: GameState) => string);
  flavor?: string;
  r?: number;
  visible?: (s: GameState) => boolean;
}

export interface NpcSpec {
  id: string; // member id or npc key
  texture: string;
  x: number;
  y: number;
  wander?: { x: number; y: number; w: number; h: number };
  facing?: Dir;
  talk?: string; // interaction id, default npc:<id>
  label?: string;
  flavor?: string;
  solid?: boolean;
  visible?: (s: GameState) => boolean;
}

export interface DoorSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  to: LocationId;
  spawn: string;
}

type Dir = 'down' | 'left' | 'right' | 'up';
const DIR_ROW: Record<Dir, number> = { down: 0, left: 1, right: 2, up: 3 };

export interface WorldConfig {
  location: LocationId;
  rows: string[];
  legend: Record<string, TileName | 'wall'>;
  /** tile used for walls in this map */
  wallTop?: TileName;
  wallFace?: TileName;
  /** extra solid tile names */
  solidTiles?: TileName[];
  outdoor?: boolean;
  spawns: Record<string, { x: number; y: number; facing?: Dir }>;
}

interface DynSprite {
  img: Phaser.GameObjects.Image;
  spec: PropSpec;
  body?: Phaser.GameObjects.Rectangle;
}

interface NpcActor {
  spec: NpcSpec;
  sprite: Phaser.GameObjects.Sprite;
  target?: Phaser.Math.Vector2;
  pause: number;
  dir: Dir;
  body?: Phaser.GameObjects.Rectangle;
}

export function playAnim(sprite: Phaser.GameObjects.Sprite, texture: string, dir: Dir, moving: boolean) {
  if (moving) {
    const key = `${texture}:walk-${dir}`;
    if (sprite.anims.currentAnim?.key !== key || !sprite.anims.isPlaying) sprite.play(key, true);
  } else {
    sprite.anims.stop();
    sprite.setFrame(DIR_ROW[dir] * 4);
  }
}

export abstract class WorldScene extends Phaser.Scene {
  protected cfg!: WorldConfig;
  protected player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  protected playerShadow!: Phaser.GameObjects.Image;
  protected solids!: Phaser.Physics.Arcade.StaticGroup;
  protected layer!: Phaser.Tilemaps.TilemapLayer;
  protected dyn: DynSprite[] = [];
  protected interactables: InteractSpec[] = [];
  protected npcs: NpcActor[] = [];
  protected doors: DoorSpec[] = [];
  protected facing: Dir = 'down';
  protected keys!: Record<string, Phaser.Input.Keyboard.Key>;
  protected cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  protected prompt!: Phaser.GameObjects.Image;
  protected night!: Phaser.GameObjects.Rectangle;
  protected focused: InteractSpec | null = null;
  protected transitioning = false;
  protected syncTimer = 0;
  protected stepTimer = 0;
  protected unsub: (() => void)[] = [];
  protected lockMovement = false;
  protected mapW = 0;
  protected mapH = 0;
  protected guide!: Phaser.GameObjects.Graphics;
  protected guidePoint: { x: number; y: number } | null = null;
  protected wallIdx: number[] = [];
  protected solidIdx: number[] = [];
  protected doorBlockedAt = 0;

  abstract buildConfig(): WorldConfig;
  abstract populate(): void;

  init(data: { spawn?: string }) {
    (this as any)._spawn = data?.spawn;
  }

  create() {
    // scene instances are reused between visits: drop references to last visit's objects
    this.night = undefined as unknown as Phaser.GameObjects.Rectangle;
    this.guide = undefined as unknown as Phaser.GameObjects.Graphics;
    this.transitioning = false;
    this.dyn = [];
    this.interactables = [];
    this.npcs = [];
    this.doors = [];
    this.focused = null;
    this.cfg = this.buildConfig();
    store.travel(this.cfg.location);
    this.buildMap();
    this.solids = this.physics.add.staticGroup();
    this.populate();
    this.spawnPlayer((this as any)._spawn ?? 'default');
    this.setupCamera();
    this.setupInput();
    this.prompt = this.add.image(0, 0, 'fx:prompt').setDepth(10000).setVisible(false);
    this.night = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x0b1033, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(20000)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.scale.on('resize', this.onResize, this);
    this.unsub.push(store.bus.on('fx', (fx) => this.spawnFx(fx.kind, fx.target)));
    this.unsub.push(
      store.bus.on('scene', ({ goto, spawn }) => {
        if (goto !== this.cfg.location) this.goTo(goto, spawn ?? 'default', !spawn);
        else this.scene.restart({ spawn: spawn ?? 'default' });
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsub.forEach((u) => u());
      this.unsub = [];
      this.scale.off('resize', this.onResize, this);
      store.setUI({ prompt: null });
    });
    this.guide = this.add.graphics().setDepth(19000);
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.syncDynamic();
    this.afterCreate();
  }

  protected afterCreate() {}

  // ---------- map ----------
  private buildMap() {
    const rows = this.cfg.rows;
    this.mapH = rows.length * T;
    this.mapW = rows[0].length * T;
    const wallTop = TILE_INDEX[this.cfg.wallTop ?? 'wallTop'];
    const wallFace = TILE_INDEX[this.cfg.wallFace ?? 'wallFace'];
    const data = rows.map((r, y) =>
      [...r].map((ch, x) => {
        const name = this.cfg.legend[ch] ?? 'void';
        if (name === 'wall') {
          const below = rows[y + 1]?.[x];
          const belowIsWall = below === undefined || this.cfg.legend[below] === 'wall';
          return belowIsWall ? wallTop : wallFace;
        }
        return TILE_INDEX[name];
      }),
    );
    const map = this.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const ts = map.addTilesetImage('tiles', 'tiles', T, T, 0, 0)!;
    this.layer = map.createLayer(0, ts, 0, 0)!;
    this.layer.setDepth(-1000);
    const solid = [wallTop, wallFace, TILE_INDEX.void, ...(this.cfg.solidTiles ?? []).map((n) => TILE_INDEX[n])];
    this.layer.setCollision(solid);
    this.wallIdx = [wallTop, wallFace];
    this.solidIdx = solid.filter((i) => i !== wallTop && i !== wallFace && i !== TILE_INDEX.void);
    this.physics.world.setBounds(0, 0, this.mapW, this.mapH);
  }

  // ---------- builders ----------
  protected prop(spec: PropSpec) {
    const key = typeof spec.key === 'function' ? spec.key(store.state) : spec.key;
    const img = this.add.image(spec.x, spec.y, key).setOrigin(0.5, 1);
    if (spec.scale) img.setScale(spec.scale);
    if (spec.alpha !== undefined) img.setAlpha(spec.alpha);
    if (spec.blend === 'add') img.setBlendMode(Phaser.BlendModes.ADD);
    img.setDepth(spec.depth ?? (spec.wall ? -500 : spec.y));
    const d: DynSprite = { img, spec };
    if (spec.solid) {
      const w = typeof spec.solid === 'number' ? img.width - 2 : spec.solid.w;
      const h = typeof spec.solid === 'number' ? spec.solid : spec.solid.h;
      const dy = typeof spec.solid === 'number' ? 0 : spec.solid.dy ?? 0;
      const rect = this.add.rectangle(spec.x, spec.y - h / 2 - dy, w, h).setVisible(false);
      this.solids.add(rect);
      d.body = rect;
    }
    this.dyn.push(d);
    return img;
  }

  protected interact(spec: InteractSpec) {
    this.interactables.push(spec);
  }

  protected door(spec: DoorSpec) {
    this.doors.push(spec);
  }

  protected npc(spec: NpcSpec) {
    if (!this.textures.exists(spec.texture)) return;
    if (spec.visible && !spec.visible(store.state)) return;
    const sprite = this.add.sprite(spec.x, spec.y, spec.texture, DIR_ROW[spec.facing ?? 'down'] * 4).setOrigin(0.5, 1);
    const shadow = this.add.image(spec.x, spec.y, 'fx:shadow').setOrigin(0.5, 0.7).setDepth(-10);
    sprite.setData('shadow', shadow);
    const actor: NpcActor = { spec, sprite, pause: Phaser.Math.Between(500, 2500), dir: spec.facing ?? 'down' };
    if (spec.solid !== false) {
      const rect = this.add.rectangle(spec.x, spec.y - 3, 10, 6).setVisible(false);
      this.physics.add.existing(rect, false);
      (rect.body as Phaser.Physics.Arcade.Body).setImmovable(true).setAllowGravity(false);
      actor.body = rect;
    }
    this.npcs.push(actor);
    const id = spec.talk ?? `npc:${spec.id}`;
    const member = store.member(spec.id);
    this.interactables.push({
      id,
      x: spec.x,
      y: spec.y,
      r: 18,
      label: spec.label ?? `Talk to ${member?.name ?? spec.id}`,
      flavor: spec.flavor,
    });
    return actor;
  }

  private spawnPlayer(spawnId: string) {
    const sp = this.cfg.spawns[spawnId] ?? this.cfg.spawns.default;
    this.facing = sp.facing ?? 'down';
    this.player = this.physics.add.sprite(sp.x, sp.y, 'char:player', DIR_ROW[this.facing] * 4).setOrigin(0.5, 1);
    this.player.body.setSize(10, 6).setOffset(3, 18);
    this.player.setCollideWorldBounds(true);
    this.playerShadow = this.add.image(sp.x, sp.y, 'fx:shadow').setOrigin(0.5, 0.7).setDepth(-10);
    this.physics.add.collider(this.player, this.layer);
    this.physics.add.collider(this.player, this.solids);
    for (const n of this.npcs) if (n.body) this.physics.add.collider(this.player, n.body);
  }

  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.mapW, this.mapH);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    this.onResize();
  }

  private onResize() {
    const w = this.scale.width;
    const h = this.scale.height;
    const zoom = Math.max(2, Math.floor(Math.min(w / (T * 22), h / (T * 13))));
    const cam = this.cameras.main;
    cam.setZoom(zoom);
    // centre small maps
    const vw = w / zoom;
    const vh = h / zoom;
    cam.setBounds(Math.min(0, (this.mapW - vw) / 2), Math.min(0, (this.mapH - vh) / 2), Math.max(this.mapW, vw), Math.max(this.mapH, vh));
    if (this.night?.active) this.night.setSize(w, h);
  }

  private setupInput() {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('W,A,S,D,E,SPACE,ENTER') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.disableGlobalCapture(); // never swallow keys meant for React inputs/buttons
    const doInteract = () => this.tryInteract();
    this.keys.E.on('down', doInteract);
    this.keys.SPACE.on('down', doInteract);
    this.keys.ENTER.on('down', doInteract);
  }

  private tryInteract() {
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (store.blocking || this.transitioning) return;
    if (store.state.inQueue && !this.focused) return;
    const f = this.focused;
    if (!f) return;
    sfx.play('blip');
    store.interact(f.id, f.flavor);
  }

  // ---------- transitions ----------
  goTo(to: LocationId, spawn: string, instant = false) {
    if (this.transitioning) return;
    this.transitioning = true;
    sfx.play('door');
    this.player.setVelocity(0, 0);
    const go = () => this.scene.start(SCENE_FOR[to], { spawn });
    if (instant) return go();
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
  }

  // ---------- per-frame ----------
  update(_time: number, delta: number) {
    if (!this.player || this.transitioning) return;
    const blocked = store.blocking || this.lockMovement || store.state.inQueue;
    let vx = 0;
    let vy = 0;
    if (!blocked) {
      const k = this.keys;
      const c = this.cursors;
      if (c.left.isDown || k.A.isDown) vx -= 1;
      if (c.right.isDown || k.D.isDown) vx += 1;
      if (c.up.isDown || k.W.isDown) vy -= 1;
      if (c.down.isDown || k.S.isDown) vy += 1;
      if (Math.abs(touchInput.x) > 0.2 || Math.abs(touchInput.y) > 0.2) {
        vx = touchInput.x;
        vy = touchInput.y;
      }
    }
    if (touchInput.interact) {
      touchInput.interact = false;
      this.tryInteract();
    }
    const len = Math.hypot(vx, vy);
    const moving = len > 0.01;
    const energy = store.state.stats.energy;
    const speed = 72 * (energy < 20 ? 0.65 : 1) * (store.state.world['carryingByHand'] ? 0.85 : 1);
    if (moving) {
      this.player.setVelocity((vx / len) * speed * Math.min(1, len), (vy / len) * speed * Math.min(1, len));
      this.facing = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'up' : 'down';
      this.stepTimer += delta;
      if (this.stepTimer > 280) {
        this.stepTimer = 0;
        sfx.play('step');
      }
    } else this.player.setVelocity(0, 0);
    playAnim(this.player, 'char:player', this.facing, moving);
    this.player.setDepth(this.player.y);
    this.playerShadow.setPosition(this.player.x, this.player.y);

    store.tick(delta, moving);
    this.updateNpcs(delta);
    this.updateFocus();
    this.checkDoors(moving);
    this.drawGuide();
    // while the 3D diorama fully covers the game, skip drawing 2D (logic keeps running)
    const coveredBy3d = this.game.canvas.style.opacity === '0';
    if (this.cameras.main.visible === coveredBy3d) this.cameras.main.setVisible(!coveredBy3d);
    this.syncTimer += delta;
    if (this.syncTimer > 150) {
      this.syncTimer = 0;
      this.syncDynamic();
      this.updateLighting();
    }
    this.tick(delta);
  }

  /** Where a door that leads to `to` is, if this scene has one. */
  protected doorTo(to: LocationId): { x: number; y: number } | null {
    const d = this.doors.find((x) => x.to === to);
    return d ? { x: d.x, y: d.y } : null;
  }

  /** Bouncing guide arrow toward the current objective (or the exit that leads to it). */
  private drawGuide() {
    const g = this.guide;
    if (!g) return;
    g.clear();
    this.guidePoint = null;
    const t = store.currentTarget();
    if (!t || store.blocking) return;
    let pt: { x: number; y: number } | null = null;
    if (t.location === this.cfg.location) {
      const it = t.target ? this.interactables.find((i) => i.id === t.target && (!i.visible || i.visible(store.state))) : undefined;
      if (it) pt = { x: it.x, y: it.y - 4 };
    } else if (t.via) pt = this.doorTo(t.via) ?? this.extraRoute(t.via);
    if (!pt) return;
    this.guidePoint = pt;
    const cam = this.cameras.main;
    const view = cam.worldView;
    const bob = Math.sin(this.time.now / 180) * 2;
    const near = Phaser.Math.Distance.Between(this.player.x, this.player.y, pt.x, pt.y) < 26;
    if (near) return;
    const inView = pt.x > view.x + 6 && pt.x < view.right - 6 && pt.y > view.y + 10 && pt.y < view.bottom - 6;
    g.fillStyle(0xf2a541, 1);
    g.lineStyle(1, 0x1b1325, 1);
    if (inView) {
      const y = pt.y - 22 + bob;
      g.fillTriangle(pt.x - 5, y, pt.x + 5, y, pt.x, y + 6);
      g.strokeTriangle(pt.x - 5, y, pt.x + 5, y, pt.x, y + 6);
      return;
    }
    // off-screen: arrow on the screen edge pointing toward the target
    const cx = view.centerX;
    const cy = view.centerY;
    const ang = Math.atan2(pt.y - cy, pt.x - cx);
    const rx = view.width / 2 - 10;
    const ry = view.height / 2 - 12;
    const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-6), ry / Math.abs(Math.sin(ang) || 1e-6));
    const ax = cx + Math.cos(ang) * (k + bob);
    const ay = cy + Math.sin(ang) * (k + bob);
    const p = (a: number, r: number) => ({ x: ax + Math.cos(a) * r, y: ay + Math.sin(a) * r });
    const tip = p(ang, 6);
    const l = p(ang + 2.5, 6);
    const r = p(ang - 2.5, 6);
    g.fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
    g.strokeTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
  }

  /** Scenes can expose non-door routes (e.g. the bus stop) for the guide arrow. */
  protected extraRoute(_to: LocationId): { x: number; y: number } | null {
    return null;
  }

  /** Read-only description of this scene for the 3D diorama renderer. */
  view3d(): WorldView3D | null {
    if (!this.player || !this.layer || !this.sys.isActive()) return null;
    const tiles: number[][] = [];
    for (let y = 0; y < this.layer.layer.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.layer.layer.width; x++) row.push(this.layer.layer.data[y][x]?.index ?? 0);
      tiles.push(row);
    }
    const tinted = this.night?.active && this.night.visible;
    return {
      key: this.scene.key,
      location: this.cfg.location,
      outdoor: !!this.cfg.outdoor,
      mapW: this.mapW,
      mapH: this.mapH,
      tile: T,
      tiles,
      wallTiles: this.wallIdx,
      solidTiles: this.solidIdx,
      scene: this,
      player: this.player,
      facing: this.facing,
      lightTint: tinted ? this.night.fillColor : null,
      ignore: new Set<Phaser.GameObjects.GameObject>([this.night, this.guide, this.prompt, this.layer].filter(Boolean) as Phaser.GameObjects.GameObject[]),
      guide: this.guidePoint,
    };
  }

  /** scene-specific per-frame hook */
  protected tick(_delta: number) {}

  private updateNpcs(delta: number) {
    const paused = store.blocking;
    for (const n of this.npcs) {
      const s = n.sprite;
      const w = n.spec.wander;
      let moving = false;
      if (w && !paused) {
        if (n.target) {
          const dx = n.target.x - s.x;
          const dy = n.target.y - s.y;
          const d = Math.hypot(dx, dy);
          const nearPlayer = Phaser.Math.Distance.Between(s.x, s.y, this.player.x, this.player.y) < 18;
          if (d < 1 || nearPlayer) {
            n.target = undefined;
            n.pause = Phaser.Math.Between(1200, 3500);
            if (nearPlayer) n.dir = this.dirTo(s.x, s.y, this.player.x, this.player.y);
          } else {
            const step = Math.min(d, (28 * delta) / 1000);
            s.x += (dx / d) * step;
            s.y += (dy / d) * step;
            n.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
            moving = true;
          }
        } else {
          n.pause -= delta;
          if (n.pause <= 0) n.target = new Phaser.Math.Vector2(w.x + Math.random() * w.w, w.y + Math.random() * w.h);
        }
      }
      // face the player when they are focused on this NPC
      if (this.focused?.id === (n.spec.talk ?? `npc:${n.spec.id}`)) n.dir = this.dirTo(s.x, s.y, this.player.x, this.player.y);
      playAnim(s, n.spec.texture, n.dir, moving);
      s.setDepth(s.y);
      (s.getData('shadow') as Phaser.GameObjects.Image)?.setPosition(s.x, s.y);
      if (n.body) {
        n.body.setPosition(s.x, s.y - 3);
        (n.body.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
      }
      const it = this.interactables.find((i) => i.id === (n.spec.talk ?? `npc:${n.spec.id}`));
      if (it) {
        it.x = s.x;
        it.y = s.y - 4;
      }
    }
  }

  private dirTo(x: number, y: number, tx: number, ty: number): Dir {
    const dx = tx - x;
    const dy = ty - y;
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
  }

  private updateFocus() {
    const fx = this.player.x + (this.facing === 'left' ? -8 : this.facing === 'right' ? 8 : 0);
    const fy = this.player.y - 4 + (this.facing === 'up' ? -10 : this.facing === 'down' ? 6 : 0);
    let best: InteractSpec | null = null;
    let bestD = Infinity;
    for (const it of this.interactables) {
      if (it.visible && !it.visible(store.state)) continue;
      const d = Phaser.Math.Distance.Between(fx, fy, it.x, it.y);
      if (d < (it.r ?? 16) && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    this.focused = best;
    const label = best && !store.blocking ? (typeof best.label === 'function' ? best.label(store.state) : best.label) : null;
    if (store.ui.prompt !== label) store.setUI({ prompt: label });
    if (best && !store.blocking) {
      this.prompt.setVisible(true);
      this.prompt.x = best.x;
      this.prompt.y = Math.round(best.y - 18 + Math.sin(this.time.now / 160) * 1.5);
    } else this.prompt.setVisible(false);
  }

  private checkDoors(moving: boolean) {
    if (!moving) return;
    const px = this.player.x;
    const py = this.player.y - 2;
    for (const d of this.doors) {
      if (px > d.x - d.w / 2 && px < d.x + d.w / 2 && py > d.y - d.h / 2 && py < d.y + d.h / 2) {
        const gate = store.canEnter(d.to);
        if (!gate.ok) {
          // step back out of the doorway so the check doesn't repeat every frame
          this.player.body.reset(this.player.x, this.player.y + (d.y < this.player.y ? 6 : -6));
          if (gate.reason && this.time.now - this.doorBlockedAt > 2500) {
            this.doorBlockedAt = this.time.now;
            store.toast(gate.reason, 'bad');
          }
          return;
        }
        this.goTo(d.to, d.spawn);
        return;
      }
    }
  }

  /** Re-evaluate state-driven visuals (textures, visibility). */
  protected syncDynamic() {
    const s = store.state;
    for (const d of this.dyn) {
      if (d.spec.visible) {
        const v = d.spec.visible(s);
        d.img.setVisible(v);
        if (d.body) (d.body.body as Phaser.Physics.Arcade.StaticBody | null)?.enable !== undefined && ((d.body.body as Phaser.Physics.Arcade.StaticBody).enable = v);
      }
      if (typeof d.spec.key === 'function') {
        const k = d.spec.key(s);
        if (d.img.texture.key !== k && this.textures.exists(k)) d.img.setTexture(k);
      }
    }
  }

  private updateLighting() {
    const m = store.state.clock.minutes % (24 * 60);
    // 16:30 bright → 18:30 golden → 19:30 dusk → 20:30+ night
    const stops = [
      { t: 16.5 * 60, c: [255, 255, 255] },
      { t: 18 * 60, c: [255, 226, 190] },
      { t: 19 * 60, c: [230, 170, 160] },
      { t: 19.75 * 60, c: [140, 130, 190] },
      { t: 20.5 * 60, c: [80, 90, 150] },
    ];
    let c = stops[stops.length - 1].c;
    for (let i = 0; i < stops.length - 1; i++) {
      if (m <= stops[0].t) {
        c = stops[0].c;
        break;
      }
      if (m >= stops[i].t && m < stops[i + 1].t) {
        const k = (m - stops[i].t) / (stops[i + 1].t - stops[i].t);
        c = stops[i].c.map((v, j) => Math.round(v + (stops[i + 1].c[j] - v) * k));
        break;
      }
    }
    if (!this.cfg.outdoor) c = c.map((v) => Math.round(v + (255 - v) * 0.6)); // indoor lights on
    const raining = !!store.state.world['rainUntil'] && this.cfg.outdoor;
    if (raining) c = c.map((v) => Math.round(v * 0.8));
    this.night.setFillStyle(Phaser.Display.Color.GetColor(c[0], c[1], c[2]), 1);
    this.night.setVisible(c.some((v) => v < 250));
  }

  protected isNight() {
    return store.state.clock.minutes % 1440 > 18.5 * 60;
  }

  // ---------- fx ----------
  private spawnFx(kind: string, target?: string) {
    let x = this.player.x;
    let y = this.player.y - 26;
    if (target) {
      const it = this.interactables.find((i) => i.id === target || i.id === `npc:${target}`);
      if (it) {
        x = it.x;
        y = it.y - 22;
      }
    }
    const key = `fx:${kind}`;
    if (!this.textures.exists(key)) return;
    const img = this.add.image(x, y, key).setDepth(15000);
    this.tweens.add({ targets: img, y: y - 14, alpha: 0, duration: 900, ease: 'Sine.easeOut', onComplete: () => img.destroy() });
  }
}
