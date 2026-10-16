import Phaser from 'phaser';
import { WorldScene, T, type WorldConfig } from './WorldScene';
import { store } from '../../core/store';
import { mulberry32 } from '../../core/systems';
import type { GameState } from '../../domain/types';

const W = 44;
const H = 30;
const b = (row: number) => (row + 1) * T;
const night = (s: GameState) => s.clock.minutes % 1440 > 18.5 * 60;

function buildRows(): string[] {
  const g: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => 'g'));
  const rnd = mulberry32(7);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rnd() < 0.08) g[y][x] = 'f';
  const fill = (x0: number, y0: number, x1: number, y1: number, ch: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch;
  };
  fill(1, 9, W - 2, 10, 's'); // north sidewalk
  fill(1, 11, W - 2, 13, 'r'); // road
  fill(1, 12, W - 2, 12, 'l');
  fill(1, 14, W - 2, 15, 's'); // south sidewalk
  fill(6, 11, 7, 13, 'z'); // zebra crossings
  fill(24, 11, 25, 13, 'z');
  // garden path from home door around to the sidewalk
  fill(5, 24, 9, 25, 'o');
  fill(9, 16, 9, 25, 'o');
  fill(10, 16, 10, 16, 'o');
  // park paths & pond
  fill(12, 16, 12, 26, 'o');
  fill(12, 26, 28, 26, 'o');
  fill(16, 20, 19, 22, 'w');
  // borders
  fill(0, 0, W - 1, 0, 'h');
  fill(0, H - 1, W - 1, H - 1, 'h');
  fill(0, 0, 0, H - 1, 'h');
  fill(W - 1, 0, W - 1, H - 1, 'h');
  return g.map((r) => r.join(''));
}

export class TownScene extends WorldScene {
  private cars: { img: Phaser.GameObjects.Image; dir: 1 | -1; y: number; wait: number }[] = [];
  private rain?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('Town');
  }

  buildConfig(): WorldConfig {
    return {
      location: 'town',
      outdoor: true,
      rows: buildRows(),
      legend: { g: 'grass', f: 'grassFlowers', s: 'sidewalk', r: 'road', l: 'roadLine', z: 'crosswalk', o: 'path', w: 'water', h: 'hedge' },
      solidTiles: ['water', 'hedge'],
      spawns: {
        default: { x: 88, y: b(24) + 4, facing: 'down' },
        'home-door': { x: 88, y: b(24) + 4, facing: 'down' },
        'store-door': { x: 104, y: b(9), facing: 'down' },
        'clinic-door': { x: 320, y: b(9), facing: 'down' },
      },
    };
  }

  populate() {
    this.rain = undefined; // fresh visit
    // ---- north row: shops & houses (fronts face the sidewalk) ----
    this.prop({ key: 'store-front', x: 104, y: b(8), solid: { w: 108, h: 44, dy: 2 } });
    this.door({ x: 104, y: b(8) + 2, w: 18, h: 8, to: 'grocery', spawn: 'entrance' });
    this.interact({ id: 'sign-freshmart', x: 136, y: b(8) + 4, label: 'FreshMart', flavor: 'FreshMart Supermarket — open till 9 PM. Fresh vegetables, dairy and more.' });
    this.prop({ key: 'kiosk', x: 208, y: b(8), solid: { w: 60, h: 20 } });
    this.interact({ id: 'kiosk', x: 208, y: b(8) + 4, label: 'Buy at Sharma General Store', r: 20 });
    this.npc({ id: 'sharma', texture: 'char:npc:sharma', x: 208, y: b(8) - 14, talk: 'kiosk', label: 'Buy at Sharma General Store', solid: false });
    this.prop({ key: 'clinic-front', x: 320, y: b(8), solid: { w: 92, h: 44, dy: 2 } });
    this.door({ x: 320, y: b(8) + 2, w: 18, h: 8, to: 'clinic', spawn: 'entrance' });
    this.prop({ key: 'house-a', x: 432, y: b(8), solid: { w: 60, h: 40 } });
    this.interact({ id: 'house-a', x: 432, y: b(8) + 4, label: "The Guptas' house", flavor: "The Guptas' house. You can hear a pressure cooker whistling." });
    this.prop({ key: 'house-b', x: 528, y: b(8), solid: { w: 60, h: 40 } });
    this.prop({ key: 'school', x: 632, y: b(8), solid: { w: 108, h: 44 } });
    this.interact({ id: 'school', x: 632, y: b(8) + 4, label: 'Sunrise Public School', flavor: 'Sunrise Public School — closed for the evening. Tomorrow is a school day!' });
    for (const x of [16, 168, 248, 384, 480, 576, 688]) this.prop({ key: 'tree-small', x, y: b(7), solid: { w: 8, h: 6 } });

    // ---- street furniture ----
    for (const col of [2, 10, 18, 27, 35, 42]) {
      this.prop({ key: 'streetlamp', x: col * T, y: b(10) - 6, solid: { w: 4, h: 4 } });
      this.prop({ key: 'lamp-glow', x: col * T, y: b(10) + 8, blend: 'add', depth: 19990, alpha: 0.55, visible: night });
    }
    this.prop({ key: 'bus-stop', x: 656, y: b(15), solid: { w: 44, h: 10 } });
    this.interact({ id: 'bus-stop', x: 656, y: b(15) + 4, label: 'Read the bus timetable', r: 20 });
    this.prop({ key: 'mailbox', x: 136, y: b(15) });
    this.prop({ key: 'manhole', x: 360, y: b(12), depth: -900 });

    // ---- south: home, park, houses ----
    this.prop({ key: 'house-player', x: 88, y: b(23), solid: { w: 76, h: 44, dy: 2 } });
    this.door({ x: 88, y: b(23) + 2, w: 18, h: 8, to: 'home', spawn: 'door' });
    this.interact({ id: 'home-plate', x: 112, y: b(23) + 6, label: 'Home sweet home', flavor: `House No. 12 — the ${store.player.name.split(' ')[0]} family home.` });
    this.prop({ key: 'flower-bed', x: 56, y: b(25) + 8, solid: 6 });
    this.prop({ key: 'tree', x: 24, y: b(19), solid: { w: 10, h: 6 } });
    this.prop({ key: 'tree', x: 168, y: b(20), solid: { w: 10, h: 6 } });
    this.prop({ key: 'tree', x: 232, y: b(18), solid: { w: 10, h: 6 } });
    this.prop({ key: 'tree', x: 344, y: b(19), solid: { w: 10, h: 6 } });
    this.prop({ key: 'tree', x: 408, y: b(24), solid: { w: 10, h: 6 } });
    this.prop({ key: 'tree', x: 200, y: b(27), solid: { w: 10, h: 6 } });
    this.prop({ key: 'bench', x: 232, y: b(23), solid: 6 });
    this.interact({ id: 'bench', x: 232, y: b(23) - 2, label: 'Park bench', flavor: 'A quiet bench by the pond. Ducks paddle around.' });
    this.prop({ key: 'flower-bed', x: 296, y: b(24), solid: 6 });
    this.prop({ key: 'bush', x: 160, y: b(17) });
    this.prop({ key: 'bush', x: 376, y: b(17) });
    this.prop({ key: 'house-a', x: 528, y: b(23), solid: { w: 60, h: 40 } });
    this.prop({ key: 'house-b', x: 624, y: b(23), solid: { w: 60, h: 40 } });
    this.prop({ key: 'tree', x: 456, y: b(19), solid: { w: 10, h: 6 } });
    this.prop({ key: 'tree', x: 680, y: b(26), solid: { w: 10, h: 6 } });
    this.prop({ key: 'sign-arrow', x: 168, y: b(15) });
    this.interact({ id: 'sign', x: 168, y: b(15) - 2, label: 'Read the signpost', flavor: '← Home (via garden path)   ↑ FreshMart · Sharma Store · Clinic   → School · Bus stop' });

    // ---- townsfolk ----
    this.npc({ id: 'folk1', texture: 'char:folk:1', x: 300, y: b(10), wander: { x: 200, y: b(9), w: 300, h: 10 }, label: 'Say hi', flavor: '"Evening! Busy day at FreshMart — the queue is long today."' });
    this.npc({ id: 'folk2', texture: 'char:folk:4', x: 500, y: b(15), wander: { x: 380, y: b(14) + 4, w: 220, h: 8 }, label: 'Say hi', flavor: '"Always cross at the zebra crossing, kiddo. Cars stop there."' });
    this.npc({ id: 'folk3', texture: 'char:folk:6', x: 260, y: b(24), wander: { x: 210, y: b(23), w: 140, h: 40 }, label: 'Say hi', flavor: '"The bus to the city comes every 20 minutes. Plan ahead!"' });

    // ---- cars ----
    this.cars = [
      { img: this.add.image(-40, b(11) - 2, 'car-red').setDepth(b(11)), dir: 1, y: b(11) - 2, wait: 0 },
      { img: this.add.image(W * T + 200, b(13) - 2, 'car-blue').setFlipX(true).setDepth(b(13)), dir: -1, y: b(13) - 2, wait: 0 },
    ];
  }

  protected tick(delta: number) {
    // cars stop for pedestrians on or near the road ahead of them
    for (const car of this.cars) {
      const ahead = (this.player.x - car.img.x) * car.dir;
      const onRoad = this.player.y > b(10) - 4 && this.player.y < b(13) + 8;
      const blocked = onRoad && ahead > 0 && ahead < 44;
      if (store.blocking) continue;
      if (!blocked) car.img.x += car.dir * 70 * (delta / 1000);
      if (car.dir === 1 && car.img.x > W * T + 60) car.img.x = -60 - Math.random() * 300;
      if (car.dir === -1 && car.img.x < -60) car.img.x = W * T + 60 + Math.random() * 300;
    }
    // rain
    const raining = !!store.state.world['rainUntil'];
    if (raining && !this.rain && this.textures.exists('fx:raindrop')) {
      this.rain = this.add.particles(0, 0, 'fx:raindrop', {
        x: { min: -20, max: this.scale.width },
        y: -10,
        lifespan: 900,
        speedY: { min: 260, max: 340 },
        speedX: { min: -50, max: -30 },
        quantity: 3,
        frequency: 20,
        alpha: { start: 0.8, end: 0.3 },
      });
      this.rain.setScrollFactor(0).setDepth(19995);
    } else if (!raining && this.rain) {
      this.rain.destroy();
      this.rain = undefined;
    }
  }
}
