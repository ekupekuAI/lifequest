import { WorldScene, T, playAnim, type WorldConfig } from './WorldScene';
import { QueueView } from './StoreScene';
import { store } from '../../core/store';

const c = (col: number) => col * T + T / 2;
const b = (row: number) => (row + 1) * T;

// waiting seats: token holders sit while they wait; the front person stands at the desk
const SEATS = [
  { x: c(2), y: b(6) },
  { x: c(3), y: b(6) },
  { x: c(4), y: b(6) },
  { x: c(2), y: b(8) },
  { x: c(3), y: b(8) },
  { x: c(4), y: b(8) },
  { x: c(11), y: b(6) },
  { x: c(12), y: b(6) },
  { x: c(13), y: b(6) },
];

export class ClinicScene extends WorldScene {
  private queueView!: QueueView;

  constructor() {
    super('Clinic');
  }

  buildConfig(): WorldConfig {
    return {
      location: 'clinic',
      rows: [
        '################',
        '################',
        '#cccccccccccccc#',
        '#cccccccccccccc#',
        '#cccccccccccccc#',
        '#cccccccccccccc#',
        '#cccccccccccccc#',
        '#cccccccccccccc#',
        '#cccccccccccccc#',
        '#cccccccccccccc#',
        '#cccccccccccccc#',
        '#######DD#######',
      ],
      legend: { '#': 'wall', c: 'clinicFloor', D: 'doormat' },
      spawns: { default: { x: 8 * T, y: b(10) - 2, facing: 'up' }, entrance: { x: 8 * T, y: b(10) - 2, facing: 'up' } },
    };
  }

  populate() {
    this.prop({ key: 'token-display', x: 8 * T, y: b(1) - 2, wall: true });
    this.prop({ key: 'poster-health', x: c(3), y: b(1), wall: true });
    this.prop({ key: 'poster-health', x: c(13), y: b(1), wall: true });
    this.interact({ id: 'poster', x: c(3), y: b(1) + 6, label: 'Read the poster', flavor: '"Wash your hands for 20 seconds. Carry your health card to every visit."' });
    this.prop({ key: 'reception', x: 8 * T, y: b(3), solid: 14 });
    this.npc({ id: 'receptionist', texture: 'char:npc:receptionist', x: 8 * T, y: b(2) + 2, talk: 'reception', label: 'Talk to the receptionist', solid: false });
    this.interact({ id: 'reception', x: 8 * T, y: b(3) + 6, r: 26, label: 'Reception desk' });
    this.prop({ key: 'waiting-chairs', x: c(3), y: b(6), solid: 6, depth: b(6) - 8 });
    this.prop({ key: 'waiting-chairs', x: c(3), y: b(8), solid: 6, depth: b(8) - 8 });
    this.prop({ key: 'waiting-chairs', x: c(12), y: b(6), solid: 6, depth: b(6) - 8 });
    this.prop({ key: 'water-cooler', x: c(14), y: b(9), solid: 8 });
    this.interact({ id: 'cooler', x: c(14), y: b(9) - 2, label: 'Water cooler', flavor: 'You drink a cup of cool water. Refreshing!' });
    this.prop({ key: 'plant', x: c(1), y: b(10), solid: 6 });
    this.prop({ key: 'plant', x: c(14), y: b(3), solid: 6 });
    this.door({ x: 8 * T, y: 11 * T + 10, w: 30, h: 8, to: 'town', spawn: 'clinic-door' });

    this.queueView = new QueueView(
      this,
      (i) => (i === 0 ? { x: 8 * T, y: b(4) + 2, dir: 'up' } : { ...SEATS[(i - 1) % SEATS.length], y: SEATS[(i - 1) % SEATS.length].y - 4, dir: 'down' }),
      { x: 8 * T, y: b(11) },
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
    if (wasIn && !store.state.inQueue) this.player.body.reset(8 * T, b(5) + 4);
    this.lockMovement = store.state.inQueue;
  }
}
