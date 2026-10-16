// City Centre: a compact downtown plaza reached by Bus 12 — library, post office,
// fountain, and the Route-12 shelter for the ride home.
import { WorldScene, T, type WorldConfig } from './WorldScene';
import { store } from '../../core/store';
import type { GameState, LocationId } from '../../domain/types';
import { busStopped, installTownHandlers } from '../bus';
import { BusView, openSign } from './TownScene';
import { Traffic } from '../traffic';

const W = 34;
const H = 22;
const b = (row: number) => (row + 1) * T;
const night = (s: GameState) => s.clock.minutes % 1440 > 18.5 * 60;

const LIB_X = 144;
const POST_X = 384;
const STOP_X = 440;
const SHELTER_X = 456;

function buildRows(): string[] {
  const g: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => 'g'));
  const fill = (x0: number, y0: number, x1: number, y1: number, ch: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch;
  };
  fill(1, 7, W - 2, 8, 's'); // sidewalk in front of the buildings
  fill(3, 9, W - 4, 14, 'o'); // paved plaza
  fill(1, 15, W - 2, 16, 's'); // sidewalk by the road
  fill(1, 17, W - 2, 19, 'r'); // road
  fill(1, 18, W - 2, 18, 'l');
  fill(1, 20, W - 2, 20, 's');
  fill(8, 9, 9, 14, 's'); // walkways across the plaza
  fill(23, 9, 24, 14, 's');
  fill(14, 17, 15, 19, 'z'); // zebra crossing
  fill(0, 0, W - 1, 0, 'h');
  fill(0, H - 1, W - 1, H - 1, 'h');
  fill(0, 0, 0, H - 1, 'h');
  fill(W - 1, 0, W - 1, H - 1, 'h');
  return g.map((r) => r.join(''));
}

export class CityScene extends WorldScene {
  private busView?: BusView;
  private traffic?: Traffic;

  constructor() {
    super('City');
  }

  buildConfig(): WorldConfig {
    return {
      location: 'city',
      outdoor: true,
      rows: buildRows(),
      legend: { g: 'grass', s: 'sidewalk', o: 'path', r: 'road', l: 'roadLine', z: 'crosswalk', h: 'hedge' },
      solidTiles: ['hedge'],
      spawns: {
        default: { x: STOP_X - 44, y: b(16) - 2, facing: 'up' },
        bus: { x: STOP_X - 44, y: b(16) - 2, facing: 'up' },
        'library-door': { x: LIB_X, y: b(7) + 4, facing: 'down' },
      },
    };
  }

  populate() {
    // ---- north: library & post office ----
    this.prop({ key: 'library-front', x: LIB_X, y: b(6), solid: { w: 108, h: 44, dy: 2 } });
    this.door({ x: LIB_X, y: b(6) + 2, w: 18, h: 8, to: 'library', spawn: 'entrance' });
    this.prop({ key: openSign('library'), x: LIB_X - 44, y: b(7) + 2, depth: b(7) - 6 });
    this.interact({ id: 'hours-library', x: LIB_X - 44, y: b(7), label: 'Library opening hours', r: 14 });
    const box = this.prop({ key: 'mailbox', x: LIB_X + 40, y: b(7) + 2, solid: { w: 6, h: 4 } });
    box.setTint(0x6fa8dc);
    this.interact({ id: 'drop-box', x: LIB_X + 40, y: b(7) - 2, label: 'Book return box', r: 14 });

    this.prop({ key: 'post-office-front', x: POST_X, y: b(6), solid: { w: 92, h: 44, dy: 2 } });
    this.interact({ id: 'post-counter', x: POST_X + 22, y: b(6) + 4, label: () => (store.isOpen('post') ? 'Post office service window' : 'Post office (closed)'), r: 20 });
    this.prop({ key: openSign('post'), x: POST_X - 30, y: b(7) + 2, depth: b(7) - 6 });
    this.interact({ id: 'hours-post', x: POST_X - 30, y: b(7), label: 'Post office opening hours', r: 14 });

    for (const x of [40, 248, 296, 504]) this.prop({ key: 'tree', x, y: b(5), solid: { w: 10, h: 6 } });
    this.prop({ key: 'bush', x: 216, y: b(6) });
    this.prop({ key: 'bush', x: 328, y: b(6) });

    // ---- plaza ----
    this.prop({ key: 'fountain', x: 272, y: b(12), solid: { w: 28, h: 14 } });
    this.interact({ id: 'fountain', x: 272, y: b(12) + 4, label: 'Fountain', r: 22, flavor: 'Coins glitter at the bottom of the fountain. Someone has made a wish — maybe for the bus to come on time.' });
    for (const [x, row] of [
      [200, 10],
      [344, 10],
      [200, 14],
      [344, 14],
    ] as const) this.prop({ key: 'city-bench', x, y: b(row), solid: 6 });
    this.interact({ id: 'city-bench', x: 200, y: b(10) - 2, label: 'Sit on the bench', flavor: 'You rest for a moment and watch the pigeons by the fountain.' });
    this.prop({ key: 'flower-bed', x: 88, y: b(11), solid: 6 });
    this.prop({ key: 'flower-bed', x: 456, y: b(11), solid: 6 });
    this.prop({ key: 'tree', x: 24, y: b(13), solid: { w: 10, h: 6 } });
    this.prop({ key: 'tree', x: 520, y: b(13), solid: { w: 10, h: 6 } });
    this.prop({ key: 'sign-arrow', x: 120, y: b(14) });
    this.interact({ id: 'city-sign', x: 120, y: b(14) - 2, label: 'Read the signpost', flavor: '↑ City Library · Post Office   ↓ Bus 12 → Home (shelter by the road)   → Stadium (Route 7, from Sunrise Street)' });

    // ---- street ----
    for (const col of [3, 11, 19, 27]) {
      this.prop({ key: 'streetlamp', x: col * T, y: b(15) - 6, solid: { w: 4, h: 4 } });
      this.prop({ key: 'lamp-glow', x: col * T, y: b(15) + 8, blend: 'add', depth: 19990, alpha: 0.55, visible: night });
    }
    this.prop({ key: 'bus-shelter-city', x: SHELTER_X, y: b(16), solid: { w: 44, h: 10 } });
    this.interact({ id: 'city-stop', x: SHELTER_X, y: b(16) - 14, label: 'Bus shelter: timetable & wait for Bus 12 home', r: 22 });
    this.interact({
      id: 'city-bus-door',
      x: STOP_X - 26,
      y: b(16) + 6,
      r: 22,
      label: 'Board the bus (Route 12 → Home)',
      visible: () => busStopped(store, 'city') === 12,
    });

    // ---- people ----
    this.npc({ id: 'cfolk0', texture: 'char:folk:0', x: 300, y: b(11), wander: { x: 160, y: b(9), w: 220, h: 80 }, label: 'Say hi', flavor: '"The library closes at 7 sharp — the librarian locks the door right on time!"' });
    this.npc({ id: 'cfolk2', texture: 'char:folk:2', x: 400, y: b(8), wander: { x: 330, y: b(7) + 4, w: 120, h: 12 }, label: 'Say hi', flavor: '"I always buy a return ticket at the machine. Paying on the bus costs more!"' });
    this.npc({ id: 'cfolk5', texture: 'char:folk:5', x: 90, y: b(13), wander: { x: 60, y: b(12), w: 90, h: 30 }, label: 'Say hi', flavor: '"Lost? The bus home leaves from the shelter by the road — Route 12."' });
    this.npc({ id: 'cfolk3', texture: 'char:folk:3', x: SHELTER_X + 36, y: b(16) - 2, facing: 'down', label: 'Say hi', flavor: '"Waiting for the 12 too? It comes every 20 minutes — at :00, :20 and :40."' });

    this.busView = new BusView(this, 'city', STOP_X, b(19) - 2, 'Sunrise Street');
    this.traffic = new Traffic(
      { scene: this, player: () => this.player, facing: () => this.facing },
      {
        place: 'City Centre',
        road: {
          top: b(16),
          bottom: b(19),
          lanes: [
            { dir: 1, top: b(16), bottom: b(17) + 8 },
            { dir: -1, top: b(17) + 8, bottom: b(19) },
          ],
          zebras: [{ x0: 14 * T, x1: 16 * T }],
        },
        laneY: [b(17) + 5, b(19) - 3],
        width: W * T,
        seed: 34,
        bus: { view: this.busView, lane: 1 },
        // stepping off the kerb to the open door of the docked Bus 12 is fine
        safeSpot: () => (busStopped(store, 'city') === 12 ? { x0: STOP_X - 60, x1: STOP_X + 10, y0: b(16) - 4, y1: b(16) + 14 } : null),
      },
    );
  }

  protected afterCreate() {
    this.unsub.push(installTownHandlers(store));
  }

  /** Home, the street and the shops are all reached by Bus 12 from the shelter. */
  protected extraRoute(to: LocationId) {
    return to === 'library' ? null : { x: SHELTER_X, y: b(16) - 14 };
  }

  protected tick(delta: number) {
    // traffic drives the bus too (it brakes for pedestrians, then keeps to its timetable)
    this.traffic?.update(delta);
  }
}
