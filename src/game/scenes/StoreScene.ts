import Phaser from 'phaser';
import { WorldScene, T, playAnim, type WorldConfig } from './WorldScene';
import { store } from '../../core/store';
import { playerIndex } from '../../core/systems';
import type { QueueCustomer, QueueState } from '../../domain/types';

const c = (col: number) => col * T + T / 2;
const b = (row: number) => (row + 1) * T;

/** Shared queue visuals: NPC sprites walk to their slot; served customers walk out. */
export class QueueView {
  private sprites = new Map<string, Phaser.GameObjects.Sprite>();
  constructor(
    private scene: WorldScene,
    private slot: (i: number) => { x: number; y: number; dir: 'up' | 'down' | 'left' | 'right' },
    private exit: { x: number; y: number },
  ) {}

  texFor(cu: QueueCustomer) {
    if (cu.id === 'cutter') return 'char:npc:cutter';
    if (cu.id === 'elder') return 'char:npc:elder';
    return `char:folk:${(cu.look ?? 0) % 8}`;
  }

  sync(q: QueueState | null, player: Phaser.GameObjects.Sprite, onPlayerSlot: (x: number, y: number, dir: 'up' | 'down' | 'left' | 'right') => void) {
    const seen = new Set<string>();
    q?.customers.forEach((cu, i) => {
      const s = this.slot(i);
      if (cu.isPlayer) {
        onPlayerSlot(s.x, s.y, s.dir);
        return;
      }
      seen.add(cu.id);
      let sp = this.sprites.get(cu.id);
      const tex = this.texFor(cu);
      if (!sp) {
        if (!this.scene.textures.exists(tex)) return;
        const start = i === (q.customers.length - 1) && this.sprites.size > 0 ? this.exit : s;
        sp = this.scene.add.sprite(start.x, start.y, tex, 0).setOrigin(0.5, 1);
        this.sprites.set(cu.id, sp);
      }
      const d = Phaser.Math.Distance.Between(sp.x, sp.y, s.x, s.y);
      if (d > 0.5) {
        const step = Math.min(d, 1.2);
        sp.x += ((s.x - sp.x) / d) * step;
        sp.y += ((s.y - sp.y) / d) * step;
        const dx = s.x - sp.x;
        const dy = s.y - sp.y;
        playAnim(sp, tex, Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down', true);
      } else playAnim(sp, tex, s.dir, false);
      sp.setDepth(sp.y);
    });
    for (const [id, sp] of this.sprites) {
      if (seen.has(id)) continue;
      this.sprites.delete(id);
      const tex = sp.texture.key;
      playAnim(sp, tex, 'down', true);
      this.scene.tweens.add({
        targets: sp,
        x: this.exit.x,
        y: this.exit.y,
        duration: 1400,
        onUpdate: () => sp.setDepth(sp.y),
        onComplete: () => this.scene.tweens.add({ targets: sp, alpha: 0, duration: 250, onComplete: () => sp.destroy() }),
      });
    }
    void player;
  }
}

export class StoreScene extends WorldScene {
  private queueView!: QueueView;

  constructor() {
    super('Store');
  }

  buildConfig(): WorldConfig {
    const rows = [
      '####################',
      '####################',
      '#ssssssssssssssssss#',
      '#ssssssssssssssssss#',
      '#ssssssssssssssssss#',
      '#ssssssssssssssssss#',
      '#ssssssssssssssssss#',
      '#ssssssssssssssssss#',
      '#ssssssssssssssssss#',
      '#ssssssssssssssssss#',
      '#ssssssssssssssssss#',
      '#ssssssssssssssssss#',
      '#ssssssssssssssssss#',
      '#########DD#########',
    ];
    return {
      location: 'grocery',
      rows,
      legend: { '#': 'wall', s: 'storeFloor', D: 'doormat' },
      spawns: { default: { x: 10 * T, y: b(12) - 2, facing: 'up' }, entrance: { x: 10 * T, y: b(12) - 2, facing: 'up' } },
    };
  }

  populate() {
    // back wall shelves
    this.prop({ key: 'store-banner', x: 10 * T, y: b(1) - 2, wall: true });
    this.prop({ key: 'shelf-dairy', x: 3 * T + 8, y: b(3), solid: 16 });
    this.prop({ key: 'shelf-dairy-empty-slot', x: 2 * T + 8, y: b(3) - 12, depth: b(3) + 1, visible: () => store.stockOf('shelf-dairy', 'milk-packet') <= 0 });
    this.interact({ id: 'shelf-dairy', x: 3 * T + 8, y: b(3) + 2, r: 22, label: 'Browse the dairy fridge' });
    this.prop({ key: 'shelf-veg', x: 8 * T + 8, y: b(3), solid: 16 });
    this.interact({ id: 'shelf-veg', x: 8 * T + 8, y: b(3) + 2, r: 22, label: 'Browse fresh vegetables' });
    this.prop({ key: 'shelf-snacks', x: 13 * T + 8, y: b(3), solid: 16 });
    this.interact({ id: 'shelf-snacks', x: 13 * T + 8, y: b(3) + 2, r: 22, label: 'Browse snacks & drinks' });
    this.prop({ key: 'shelf-bakery', x: 17 * T, y: b(3), solid: 16 });
    this.interact({ id: 'shelf-bakery', x: 17 * T, y: b(3) + 2, r: 18, label: 'Browse the bakery' });
    // island aisle (same products, closer to the entrance)
    this.prop({ key: 'shelf-veg', x: 5 * T + 8, y: b(7), solid: 16 });
    this.interact({ id: 'shelf-veg', x: 5 * T + 8, y: b(7) + 2, r: 22, label: 'Browse fresh vegetables' });
    this.prop({ key: 'shelf-snacks', x: 10 * T + 8, y: b(7), solid: 16 });
    this.interact({ id: 'shelf-snacks', x: 10 * T + 8, y: b(7) + 2, r: 22, label: 'Browse snacks & drinks' });
    this.prop({ key: 'basket-stack', x: c(12), y: b(12) });
    this.interact({ id: 'baskets', x: c(12), y: b(12) - 4, label: 'Shopping baskets', flavor: 'You grab a basket. Items you pick go in here until you pay.' });
    this.prop({ key: 'service-desk', x: 3 * T + 8, y: b(10), solid: 12 });
    this.interact({ id: 'service-desk', x: 3 * T + 8, y: b(10) + 4, r: 22, label: 'Returns & exchanges desk' });
    this.prop({ key: 'plant', x: c(1), y: b(12), solid: 6 });
    this.prop({ key: 'plant', x: c(18), y: b(12), solid: 6 });

    // checkout
    this.prop({ key: 'checkout', x: 16 * T, y: b(9), solid: 14 });
    this.prop({ key: 'queue-sign', x: c(18), y: b(11), solid: 6 });
    this.interact({ id: 'checkout', x: 16 * T, y: b(9) + 6, r: 26, label: (s) => (s.inQueue ? 'Talk to the cashier' : 'Checkout counter (join queue)') });
    this.interact({ id: 'checkout', x: c(17), y: b(11), r: 18, label: 'Join the checkout queue' });
    this.npc({ id: 'cashier', texture: 'char:npc:cashier', x: 16 * T, y: b(8) + 2, talk: 'checkout', label: 'Talk to the cashier', solid: false });
    this.npc({ id: 'stocker', texture: 'char:npc:stocker', x: c(10), y: b(5), wander: { x: 3 * T, y: b(4) + 4, w: 13 * T, h: 6 }, talk: 'stocker', label: 'Ask the store helper' });

    this.door({ x: 10 * T, y: 13 * T + 10, w: 30, h: 8, to: 'town', spawn: 'store-door' });

    // queue: front at the counter, then a line heading left along row 10
    this.queueView = new QueueView(
      this,
      (i) => (i < 7 ? { x: 16 * T - i * 18, y: b(10) + 4, dir: i === 0 ? "up" : "right" } : { x: 16 * T - 6 * 18, y: b(10) + 4 + (i - 6) * 15, dir: "up" }),
      { x: 10 * T, y: b(13) },
    );
  }

  protected tick() {
    const wasIn = this.lockMovement;
    this.queueView.sync(store.queue, this.player, (x, y, dir) => {
      this.player.body.reset(x, y);
      this.player.setVelocity(0, 0);
      playAnim(this.player, 'char:player', dir, false);
      (this as any).facing = dir;
    });
    if (wasIn && !store.state.inQueue) this.player.body.reset(this.player.x, Math.min(this.player.y + 14, b(12)));
    this.lockMovement = store.state.inQueue;
    void playerIndex;
  }
}
