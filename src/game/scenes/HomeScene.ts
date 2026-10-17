import Phaser from 'phaser';
import { demoHooksEnabled } from '../../core/demo';
import { WorldScene, T, type NpcSpec, type WorldConfig } from './WorldScene';
import { touchInput } from '../input';
import { COMIC_WORDS, PILLOW_WORDS, ensureHomeTextures, lyingTexture } from '../homeFx';
import { FIGHT_MS, isGroggy, isWatchingTv, stopTv, tension, timeoutLeft, watchTv } from '../../core/homeLife';
import { store } from '../../core/store';
import { ANGRY, angryPhase, angryTick, bannedAttempt, callInfo, chaseSpeed, counter, demoAngry, detectionStep, isFound, pollTriggers, searchOver, setAngryStage, startCall, type AngryStage, type AngryTrigger, type ChaseHooks } from '../../core/angryMum';
import { phoneLock } from '../../core/reels';
import { sfx } from '../../core/sfx';
import { flash, letterbox, redAlert, shake, slowMo, speedLines, sting } from '../cinematic';
import { angrySheet, ensureAngryTextures, soulTexture, textTexture } from '../angryMumFx';
import type { InteractSpec } from './WorldScene';
import { ROOM_OBJECTS, SCHOOL_SPOTS } from '../../domain/homeLayout';
import { itemName } from '../../domain/items';
import { scheduleFor, type HomeSpot } from '../../domain/world';
import type { FamilyMember, GameState, Role } from '../../domain/types';

const c = (col: number) => col * T + T / 2; // tile centre x
const b = (row: number) => (row + 1) * T; // tile bottom y

const roomOf = (s: GameState, id: string) => String(s.world[`room.${id}`] ?? 'floor');
const run = (s: GameState, id: string) => s.run?.missionId === id;
const holds = (s: GameState, ...items: string[]) => items.some((i) => s.hands.includes(i));
const today = (s: GameState, key: string) => s.world[key] === s.clock.day;
const dinnerTime = (s: GameState) => {
  const m = s.clock.minutes % 1440;
  return m >= 19 * 60 && m < 19 * 60 + 40;
};
const stoveKey = (s: GameState) => {
  if (!run(s, 'cook-meal')) return 'stove';
  const v = s.world['stove.state'];
  return v === 'burnt' ? 'stove-pot-burnt' : v === 'cooking' || v === 'ready' || v === 'off-ready' ? 'stove-pot' : 'stove';
};
const stoveLabel = (s: GameState) => {
  if (!run(s, 'cook-meal')) return 'Stove';
  const v = s.world['stove.state'];
  if (holds(s, 'chopped-veg') && v === 'empty') return 'Put the vegetables in the pot';
  if (v === 'cooking') return 'Check the soup';
  if (v === 'ready' || v === 'off-ready') return 'Take the pot off the stove';
  if (v === 'burnt') return 'Deal with the burnt pot';
  return 'Stove';
};
const washerLabel = (s: GameState) => {
  if (!run(s, 'laundry')) return 'Washing machine';
  const v = s.world['washer.state'];
  if (v === 'running') return 'Washing machine (running)';
  if (v === 'done') return 'Take out the clean clothes';
  if (v === 'empty') return 'Washing machine (empty)';
  return holds(s, 'white-shirt', 'clothes-pile') ? 'Load the washing machine' : 'Washing machine';
};

/** Minimal view of WorldScene's NPC actor that HomeScene needs for routines. */
interface ActorLike {
  spec: NpcSpec;
  sprite: Phaser.GameObjects.Sprite;
  target?: Phaser.Math.Vector2;
  pause: number;
  dir: 'down' | 'left' | 'right' | 'up';
  body?: Phaser.GameObjects.Rectangle;
}
interface Place {
  x: number;
  y: number;
  wander?: { x: number; y: number; w: number; h: number };
  facing?: ActorLike['dir'];
}
interface FamEntry {
  member: FamilyMember;
  actor: ActorLike;
  spot: HomeSpot;
  activity: string;
  collider?: Phaser.Physics.Arcade.Collider;
}

const FRONT_DOOR = { x: 12 * T, y: b(14) };
const KITCHEN_WANDER = { x: 17 * T, y: 3 * T + 4, w: 7 * T, h: T };
const AREAS: Record<Exclude<HomeSpot, 'away'>, Place[]> = {
  kitchen: [
    { x: c(19), y: b(3) + 4, wander: KITCHEN_WANDER },
    { x: c(22), y: b(3) + 4, wander: KITCHEN_WANDER },
  ],
  living: [
    { x: c(17), y: b(12), wander: { x: 15 * T, y: 11 * T, w: 5 * T, h: 3 * T } },
    { x: c(6), y: b(12), wander: { x: 3 * T, y: 11 * T, w: 4 * T, h: 3 * T } },
    { x: c(8), y: b(11), wander: { x: 5 * T, y: 11 * T, w: 3 * T, h: 2 * T } },
  ],
  bedroom: [{ x: c(6), y: b(5), wander: { x: 4 * T, y: 4 * T, w: 4 * T, h: 3 * T } }],
  sofa: [{ x: 9 * T, y: b(13) }],
  desk: [{ x: 4 * T, y: b(3) + 4, facing: 'up' }],
  // seats around the dining table (table spans x 304–336, y 80–112)
  dining: [
    { x: 290, y: 104, facing: 'right' },
    { x: 350, y: 104, facing: 'left' },
    { x: 309, y: 128, facing: 'up' },
    { x: 331, y: 128, facing: 'up' },
    { x: 320, y: 83, facing: 'down' },
  ],
};
type Dir = ActorLike['dir'];
type Room = 'bedroom' | 'bath' | 'hall' | 'kitchen' | 'living';
const DIR_ROW: Record<Dir, number> = { down: 0, left: 1, right: 2, up: 3 };
/** y of the clear lane through the living room (between the TV and the coffee table) */
const LANE = 186;
/** waypoints from each room's interior to the living-room lane (NPCs walk these instead of through walls) */
const TO_LIVING: Record<Room, { x: number; y: number }[]> = {
  bedroom: [{ x: 80, y: 142 }, { x: 80, y: LANE }],
  bath: [{ x: 200, y: 100 }, { x: 200, y: 128 }, { x: 216, y: 144 }, { x: 216, y: LANE }],
  hall: [{ x: 216, y: 144 }, { x: 216, y: LANE }],
  kitchen: [{ x: 352, y: 144 }, { x: 352, y: LANE }],
  living: [],
};
/** where the player may stand during a time-out, per room (foot positions) */
const ROOM_RECT: Record<Room, { x0: number; y0: number; x1: number; y1: number }> = {
  bedroom: { x0: 18, y0: 40, x1: 158, y1: 142 },
  living: { x0: 18, y0: 172, x1: 398, y1: 234 },
  kitchen: { x0: 258, y0: 40, x1: 398, y1: 142 },
  hall: { x0: 170, y0: 104, x1: 254, y1: 150 },
  bath: { x0: 178, y0: 40, x1: 236, y1: 96 },
};
const FIGHT_TOTAL = FIGHT_MS;
const FIGHT_PHASE_PILLOW = 2000;
const SOFA_SEAT = { x: 11 * T + 14, y: 214 };
const BED_SIDE = { x: c(2) + 6, y: b(3) - 2 };
/** furniture that wobbles when Angry Mum barrels past */
const KNOCKABLE = new Set(['plant', 'lamp', 'dining-table', 'table-set', 'coffee-table', 'drying-rack', 'drying-rack-full', 'toybox', 'toybox-full', 'bin', 'bin-full', 'laundry', 'laundry-full', 'sofa', 'shoe-rack', 'shoe-rack-empty', 'school-bag']);
const ROLE_SLOT: Partial<Record<Role, number>> ={ mother: 0, father: 0, guardian: 1, 'older-sibling': 1, 'younger-sibling': 2, grandparent: 0 };

export class HomeScene extends WorldScene {
  private fam = new Map<string, FamEntry>();
  private famTimer = 0;
  // ---- home life (fights, naps, alarm, TV) ----
  private controlled = new Set<string>();
  private savedWander = new Map<string, Place['wander'] | undefined>();
  private puppets = new Map<Phaser.GameObjects.Sprite, { dir: Dir; walk: boolean }>();
  private returning: { e: FamEntry; home: { x: number; y: number }; free: number }[] = [];
  private locks = new Set<string>();
  private homeTimer = 0;
  private overlay?: Phaser.GameObjects.Rectangle;
  private lying?: Phaser.GameObjects.Image;
  private lyingFrom?: { x: number; y: number };
  private zzz?: Phaser.Time.TimerEvent;
  private sleepNight = false;
  private sleepSince = 0;
  private sleepDay = 0;
  private alarmObjs: Phaser.GameObjects.Image[] = [];
  private tvObjs: Phaser.GameObjects.Image[] = [];
  private tvScreen?: Phaser.GameObjects.Image;
  private tvChannel = 0;
  private tvFlick = 0;
  private tvAlt = false;
  private tvSeatFrom?: { x: number; y: number };
  private timeoutRect?: { x0: number; y0: number; x1: number; y1: number };
  private timeoutToastAt = 0;
  private groggyFxAt = 0;

  constructor() {
    super('Home');
  }

  buildConfig(): WorldConfig {
    return {
      location: 'home',
      rows: [
        '##########################',
        '##########################',
        '#.........#bbbb#kkkkkkkkk#',
        '#.........#bbbb#kkkkkkkkk#',
        '#.........#bbbb#kkkkkkkkk#',
        '#.........#bbbb#kkkkkkkkk#',
        '#.........##b###kkkkkkkkk#',
        '#.........#.....kkkkkkkkk#',
        '#.........#.....kkkkkkkkk#',
        '####..#####.....#####kk###',
        '#........................#',
        '#.......rrrrrr...........#',
        '#.......rrrrrr...........#',
        '#.......rrrrrr...........#',
        '#........................#',
        '###########DD#############',
      ],
      legend: { '#': 'wall', '.': 'wood', k: 'kitchen', b: 'bath', r: 'rug', D: 'doormat' },
      spawns: {
        default: { x: c(5), y: b(5), facing: 'down' },
        door: { x: 12 * T, y: b(13), facing: 'up' },
      },
    };
  }

  populate() {
    const s = store.state;
    // ---- wall decorations ----
    this.prop({ key: 'window', x: c(2), y: b(1), wall: true });
    this.prop({ key: 'timetable', x: c(5), y: b(1), wall: true });
    this.interact({ id: 'timetable', x: c(5), y: b(1) + 4, label: 'Read the class timetable', flavor: "Your sibling's class timetable. Maths, Art, P.E.…" });
    this.prop({ key: 'picture', x: c(8), y: b(1), wall: true });
    this.prop({ key: 'window', x: c(20), y: b(1), wall: true });
    this.prop({ key: 'wall-clock', x: c(12), y: b(9) - 2, wall: true });
    this.prop({ key: 'window', x: c(4), y: b(9), wall: true });
    this.prop({ key: 'notice-board', x: c(17), y: b(9), wall: true });
    this.interact({ id: 'notice-board', x: c(17), y: b(9) + 6, label: 'Check the family notice board' });
    this.prop({ key: 'coat-hook', x: c(19) + 4, y: b(9), wall: true });
    this.prop({ key: 'hook-bag', x: c(19), y: b(9) - 2, wall: true, visible: (st) => !st.inventory.items['cloth-bag'] });
    this.prop({ key: 'hook-umbrella', x: c(19) + 9, y: b(9), wall: true, visible: (st) => !st.inventory.items['umbrella'] });
    this.interact({ id: 'hook-bag', x: c(19) - 2, y: b(9) + 6, label: (st) => (st.inventory.items['cloth-bag'] ? 'Hang the cloth bag back' : 'Take the cloth shopping bag'), r: 12 });
    this.interact({ id: 'hook-umbrella', x: c(19) + 9, y: b(9) + 6, label: (st) => (st.inventory.items['umbrella'] ? 'Put the umbrella back' : 'Take the umbrella'), r: 10 });
    // house keys by the front door
    this.prop({ key: (st) => (st.inventory.items['house-keys'] ? 'key-hook-empty' : 'key-hook'), x: c(9), y: b(9) - 2, wall: true });
    this.interact({ id: 'key-hook', x: c(9), y: b(9) + 6, r: 10, label: (st) => (st.inventory.items['house-keys'] ? 'Hang the house keys back' : 'Take the house keys') });
    this.prop({ key: 'calendar', x: c(7), y: b(9) - 2, wall: true });
    this.interact({
      id: 'calendar',
      x: c(7),
      y: b(9) + 6,
      r: 10,
      label: 'Family calendar',
      flavor: `Family calendar, day ${s.clock.day}. Dinner together at 7:00 PM. Home from work 5:30 PM. Football practice until 6 PM. LAUNDRY DAY is circled in red.`,
    });

    // ---- bedroom ----
    this.prop({ key: (st) => (st.world['room.bed'] === 'made' ? 'bed-made' : 'bed'), x: c(1), y: b(3), solid: 28 });
    this.interact({ id: 'bed', x: c(1) + 6, y: b(3) - 10, label: (st) => (run(st, 'clean-room') && st.world['room.bed'] !== 'made' ? 'Make the bed' : 'Your bed'), r: 18 });
    this.prop({ key: 'desk', x: 4 * T, y: b(2), solid: 12 });
    this.interact({ id: 'desk', x: 4 * T - 7, y: b(2) + 2, r: 11, label: 'Study desk', flavor: 'Your study desk. A half-finished drawing and a maths book.' });
    this.prop({ key: 'piggy-bank', x: 4 * T + 8, y: b(2) - 11, depth: b(2) + 1 });
    this.interact({ id: 'piggy-bank', x: 4 * T + 8, y: b(2) + 2, r: 10, label: 'Piggy bank (savings)' });
    this.prop({ key: (st) => (roomOf(st, 'book1') === 'placed' || roomOf(st, 'book2') === 'placed' ? 'bookshelf-full' : 'bookshelf'), x: c(6), y: b(2), solid: 12 });
    this.interact({ id: 'bookshelf', x: c(6), y: b(2) + 2, label: (st) => (st.hands.length ? 'Put books on the shelf' : 'Bookshelf'), flavor: 'Your bookshelf. Some gaps where books should be.' });
    this.prop({ key: 'wardrobe', x: c(7), y: b(2), solid: 12 });
    this.interact({ id: 'wardrobe', x: c(7), y: b(2) + 2, label: 'Wardrobe', flavor: 'Neatly folded clothes. Well… mostly.' });
    this.prop({ key: 'bed-kid', x: c(9), y: b(3), solid: 28 });
    this.interact({ id: 'kid-bed', x: c(9) - 4, y: b(3) - 8, label: "Sibling's bed", flavor: 'Covered in stickers. Something might have rolled underneath…' });
    this.prop({ key: 'school-bag', x: c(8), y: b(3) });
    this.interact({ id: 'school-bag', x: c(8), y: b(3) - 4, label: (st) => (run(st, 'help-sibling') ? 'Open the school bag' : 'School bag'), flavor: "Your sibling's school bag." });
    this.prop({ key: (st) => (ROOM_OBJECTS.some((o) => o.dest === 'laundry' && roomOf(st, o.id) === 'placed') ? 'laundry-full' : 'laundry'), x: c(1), y: b(7), solid: 8 });
    this.interact({ id: 'laundry', x: c(1), y: b(7) - 4, label: (st) => (st.hands.length ? 'Put in laundry basket' : 'Laundry basket'), flavor: 'The laundry basket.' });
    const pileThere = (st: GameState, p: string) => run(st, 'laundry') && (st.world[`laundry.${p}`] ?? 'basket') === 'basket';
    this.prop({ key: 'laundry-whites', x: c(2), y: b(7), depth: b(7) - 1, visible: (st) => pileThere(st, 'whites') });
    this.prop({ key: 'laundry-colors', x: c(3), y: b(7), depth: b(7) - 1, visible: (st) => pileThere(st, 'colors') });
    this.interact({ id: 'pile-whites', x: c(2), y: b(7) - 6, r: 11, label: 'Pick up the whites pile', visible: (st) => pileThere(st, 'whites') });
    this.interact({ id: 'pile-colors', x: c(3), y: b(7) - 6, r: 11, label: 'Pick up the colours pile', visible: (st) => pileThere(st, 'colors') });
    // guide-only marker (r: 0 never takes focus): once the whites are taken, point the arrow at the colours
    this.interact({ id: 'pile-whites', x: c(3), y: b(7) - 6, r: 0, label: '', visible: (st) => !pileThere(st, 'whites') && pileThere(st, 'colors') });
    this.prop({ key: (st) => (ROOM_OBJECTS.some((o) => o.dest === 'bin' && roomOf(st, o.id) === 'placed') ? 'bin-full' : 'bin'), x: c(2), y: b(8), solid: 8 });
    this.interact({ id: 'bin', x: c(2), y: b(8) - 4, label: (st) => (st.hands.length ? 'Throw in the dustbin' : 'Dustbin'), flavor: 'A small dustbin.' });
    this.prop({ key: (st) => (roomOf(st, 'toycar') === 'placed' ? 'toybox-full' : 'toybox'), x: c(8), y: b(8), solid: 8 });
    this.interact({ id: 'toybox', x: c(8), y: b(8) - 4, label: (st) => (st.hands.length ? 'Put in the toy box' : 'Toy box'), flavor: 'The toy box.' });
    this.prop({ key: 'plant', x: c(9), y: b(8), solid: 6 });

    // mess objects (state-driven)
    for (const o of ROOM_OBJECTS) {
      this.prop({ key: `item:${o.item}`, x: c(o.col), y: b(o.row) - 2, depth: -400, visible: (st) => roomOf(st, o.id) === 'floor' });
      this.interact({
        id: `room:${o.id}`,
        x: c(o.col),
        y: b(o.row) - 8,
        r: 12,
        label: `Pick up ${itemName(o.item).toLowerCase()}`,
        flavor: 'Your room is a bit messy… Maybe someone will ask you to tidy it.',
        visible: (st) => roomOf(st, o.id) === 'floor',
      });
    }

    // ---- bathroom ----
    this.prop({ key: 'shower', x: c(11), y: b(2), solid: 10 });
    this.prop({ key: (st) => (run(st, 'laundry') && st.world['washer.state'] === 'running' ? 'washer-running' : 'washer'), x: c(13), y: b(2), solid: 10 });
    this.interact({ id: 'washer', x: c(13), y: b(2) + 2, label: washerLabel, flavor: 'The washing machine. Laundry day is another lesson!' });
    this.prop({ key: 'toilet', x: c(14), y: b(3), solid: 8 });

    // ---- kitchen ----
    this.prop({ key: 'fridge', x: c(16), y: b(2), solid: 12 });
    this.interact({
      id: 'fridge',
      x: c(16),
      y: b(2) + 2,
      label: (st) => (run(st, 'cook-meal') && (st.world['veg.state'] ?? 'fridge') === 'fridge' ? 'Take carrots & an onion' : 'Fridge (snack +energy)'),
    });
    this.prop({ key: stoveKey, x: c(18), y: b(2), solid: 12 });
    this.interact({ id: 'stove', x: c(18), y: b(2) + 2, label: stoveLabel, flavor: 'The stove. Only cook when a grown-up is at home, and never walk away from a hot pan.' });
    this.prop({ key: 'counter', x: c(17), y: b(2), solid: 12 });
    this.prop({ key: 'counter', x: c(19), y: b(2), solid: 12 });
    this.prop({ key: 'chopping-board', x: c(19), y: b(2) - 13, depth: b(2) + 1 });
    this.interact({
      id: 'chopping-board',
      x: c(19),
      y: b(2) + 2,
      label: (st) => (holds(st, 'carrot', 'onion') ? 'Chop the vegetables' : 'Chopping board'),
      flavor: 'A wooden chopping board and a sharp knife. Fingers tucked in, cut away from yourself.',
    });
    this.prop({ key: 'sink', x: c(20), y: b(2), solid: 12 });
    this.interact({
      id: 'sink',
      x: c(20),
      y: b(2) + 2,
      label: (st) =>
        holds(st, 'carrot', 'onion') ? 'Wash the vegetables' : st.hands.includes('mug') ? 'Put the mug in the sink' : st.hands.includes('empty-bottle') ? 'Fill the water bottle' : 'Kitchen sink',
      flavor: 'A clean kitchen sink.',
    });
    for (const col of [21, 22, 23, 24]) this.prop({ key: 'counter', x: c(col), y: b(2), solid: 12 });
    // plates & spoons cupboard (cook-meal)
    const platesHere = (st: GameState) => run(st, 'cook-meal') && !st.world['plates.taken'];
    this.prop({ key: 'item:plates', x: c(23), y: b(2) - 12, depth: b(2) + 1, visible: platesHere });
    this.interact({ id: 'plates', x: c(23), y: b(2) + 2, r: 12, label: 'Take plates & spoons', visible: platesHere });
    // dining table: laid for dinner once the table is set (and during family dinner)
    this.prop({ key: (st) => ((today(st, 'table.setDay') && st.clock.minutes % 1440 < 19 * 60 + 40) || dinnerTime(st) ? 'table-set' : 'dining-table'), x: 20 * T, y: b(6), solid: { w: 30, h: 18 } });
    this.interact({
      id: 'dining-table',
      x: 20 * T,
      y: b(6) + 4,
      r: 14,
      label: (st) => (holds(st, 'plates') ? 'Set the table' : holds(st, 'cooking-pot') ? 'Serve the soup' : 'Dining table'),
      flavor: 'The family dining table. Dinner is at 7:00 PM.',
    });
    // guide-only marker: after taking the plates, point at the table
    this.interact({ id: 'plates', x: 20 * T, y: b(6) + 4, r: 0, label: '', visible: (st) => run(st, 'cook-meal') && holds(st, 'plates') });
    this.prop({ key: 'plant', x: c(24), y: b(8), solid: 6 });

    // ---- living room ----
    this.prop({ key: 'cabinet', x: 2 * T, y: b(10), solid: 10 });
    this.interact({ id: 'doc-folder', x: c(1), y: b(10) + 2, r: 12, label: run(s, 'clinic-visit') ? 'Open the document folder' : 'Cabinet: documents', flavor: "Grandparent's document folder: health card, old bills, a recipe." });
    this.prop({ key: 'tv', x: 11 * T, y: b(10), solid: { w: 28, h: 5 } });
    this.prop({ key: 'sofa', x: 11 * T, y: b(13), solid: 14 });
    this.interact({ id: 'sofa', x: 11 * T + 12, y: b(13) - 6, label: () => (isWatchingTv(store) ? 'Get up from the sofa' : 'Sofa · watch TV') });
    this.interact({
      id: 'tv',
      x: 11 * T,
      y: b(10) + 8,
      r: 12,
      label: (st) => (isWatchingTv(store) ? 'Stop watching TV' : st.conduct?.tvBanned && st.conduct.day === st.clock.day ? 'TV (switched off for today)' : 'Watch TV'),
    });
    this.prop({ key: 'coffee-table', x: 11 * T, y: b(11) + 8, solid: { w: 26, h: 4 } });
    this.prop({ key: 'lamp', x: c(14), y: b(13), solid: 6 });
    this.prop({ key: 'plant', x: c(24), y: b(10), solid: 6 });
    this.prop({ key: 'plant', x: c(1), y: b(14), solid: 6 });
    this.prop({ key: (st) => (st.world['found.sports-shoes'] === false ? 'shoe-rack' : run(st, 'help-sibling') ? 'shoe-rack-empty' : 'shoe-rack'), x: c(14), y: b(14), solid: 8 });
    this.prop({ key: (st) => (today(st, 'rack.fullDay') ? 'drying-rack-full' : 'drying-rack'), x: 22 * T, y: b(12), solid: { w: 28, h: 6 } });
    this.interact({
      id: 'drying-rack',
      x: 22 * T,
      y: b(12) + 4,
      r: 14,
      label: (st) => (holds(st, 'white-shirt', 'pink-shirt', 'clothes-pile') && run(st, 'laundry') && st.world['washer.state'] === 'empty' ? 'Hang the clothes to dry' : 'Drying rack'),
      flavor: 'A folding drying rack by the window.',
    });

    // school items (help-sibling mission)
    for (const sp of SCHOOL_SPOTS) {
      if (sp.item !== 'sports-shoes') this.prop({ key: `item:${sp.item}`, x: c(sp.col), y: b(sp.row) - 2, depth: sp.item === 'crayons' ? b(sp.row) + 1 : -400, visible: (st) => run(st, 'help-sibling') && st.world[`found.${sp.item}`] === false });
      this.interact({
        id: sp.id,
        x: c(sp.col),
        y: b(sp.row) - 6,
        r: 12,
        label: `Take the ${itemName(sp.item).toLowerCase()}`,
        visible: (st) => run(st, 'help-sibling') && st.world[`found.${sp.item}`] === false,
      });
    }

    // ---- exit ----
    this.door({ x: 12 * T, y: 15 * T + 10, w: 30, h: 10, to: 'town', spawn: 'home-door' });

    // ---- family (daily routines) ----
    this.fam = new Map();
    this.famTimer = 0;
    this.syncFamily(true);
  }

  protected tick(delta: number) {
    this.homeTick(delta);
    this.famTimer += delta;
    if (this.famTimer < 2000 || store.blocking) return;
    this.famTimer = 0;
    this.syncFamily(false);
  }

  // =====================================================================================
  // Home life: fights, parents walking over, naps & the alarm, TV (logic in core/homeLife)
  // =====================================================================================

  protected afterCreate() {
    ensureHomeTextures(this);
    ensureAngryTextures(this);
    this.angryReset();
    setAngryStage(this.stage);
    // dev/demo hooks (dev builds, or any build opened with ?demo=1 for live pitches):
    // __angry.demo() forces Angry Mum Mode, __angry.call() makes a parent call you
    if (demoHooksEnabled()) (window as unknown as { __angry?: unknown }).__angry = {
      demo: (trigger?: AngryTrigger) => demoAngry(store, trigger),
      call: () => startCall(store, true),
      phase: () => angryPhase(store),
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.angryShutdown());
    this.unsub.push(
      store.bus.on('game', (ev) => {
        if (ev.type === 'interact' && ev.target.startsWith('hide:')) this.amHide(ev.target.slice(5));
      }),
    );
    this.controlled = new Set();
    this.savedWander = new Map();
    this.puppets = new Map();
    this.returning = [];
    this.locks = new Set();
    this.lockMovement = false;
    this.overlay = this.lying = this.tvScreen = undefined;
    this.alarmObjs = [];
    this.tvObjs = [];
    this.sleepNight = false;
    this.timeoutRect = undefined;
    if (isWatchingTv(store)) stopTv(store);
    if (timeoutLeft(store) > 0) this.timeoutRect = ROOM_RECT[this.roomAt(this.player.x, this.player.y)];
    this.unsub.push(
      store.bus.on('fx', (f) => {
        if (f.kind.startsWith('home:')) this.homeFx(f.kind.slice(5), f.target, f.x);
      }),
    );
    this.unsub.push(store.bus.on('conduct', (ev) => this.onConduct(ev)));
  }

  private lock(reason: string, on: boolean) {
    if (on) this.locks.add(reason);
    else this.locks.delete(reason);
    this.lockMovement = this.locks.size > 0;
  }

  /** Per-frame home-life updates (runs after WorldScene moved NPCs and the player). */
  private homeTick(delta: number) {
    const now = this.time.now;
    // puppeteered characters: walk cycle / facing that updateNpcs would otherwise reset
    for (const [spr, p] of this.puppets) {
      if (!spr.active) {
        this.puppets.delete(spr);
        continue;
      }
      spr.anims.stop();
      spr.setFrame(DIR_ROW[p.dir] * 4 + (p.walk ? Math.floor(now / 110) % 4 : 0));
    }
    // parents go back to what they were doing once the talk is over
    for (const r of [...this.returning]) {
      if (store.blocking) {
        r.free = 0;
        continue;
      }
      r.free += delta;
      if (r.free > 700) {
        this.returning = this.returning.filter((x) => x !== r);
        if (this.fam.get(r.e.member.id) === r.e) this.walkActor(r.e, r.home, () => this.release(r.e), 70);
      }
    }
    // TV: time flies while watching; any movement gets you up
    if (isWatchingTv(store)) {
      const k = this.keys;
      const cur = this.cursors;
      const wants =
        cur.left.isDown || cur.right.isDown || cur.up.isDown || cur.down.isDown || k.W.isDown || k.A.isDown || k.S.isDown || k.D.isDown || Math.abs(touchInput.x) > 0.2 || Math.abs(touchInput.y) > 0.2;
      if (wants && !store.blocking) stopTv(store);
      else if (!store.blocking) watchTv(store, delta);
      this.tvFlick += delta;
      if (this.tvScreen?.active && this.tvFlick > 380) {
        this.tvFlick = 0;
        this.tvAlt = !this.tvAlt;
        this.tvScreen.setTexture(`hl:tv${this.tvChannel}${this.tvAlt ? 'b' : 'a'}`);
        for (const g of this.tvObjs) if (g.texture.key === 'hl:glow') g.setAlpha(0.55 + Math.random() * 0.35);
      }
    }
    // time-out: stay in the room
    const left = timeoutLeft(store);
    if (left > 0 && this.timeoutRect) {
      const r = this.timeoutRect;
      const x = Phaser.Math.Clamp(this.player.x, r.x0, r.x1);
      const y = Phaser.Math.Clamp(this.player.y, r.y0, r.y1);
      if (x !== this.player.x || y !== this.player.y) {
        this.player.body.reset(x, y);
        if (now - this.timeoutToastAt > 2500) {
          this.timeoutToastAt = now;
          store.toast(`Time-out: ${Math.ceil(left)} more min in this room.`, 'neutral');
        }
      }
    } else if (this.timeoutRect) {
      this.timeoutRect = undefined;
      store.toast('Time-out is over. Fresh start!', 'info');
    }
    // groggy after a long nap: slower steps and the odd yawn
    if (isGroggy(store)) {
      const v = this.player.body.velocity;
      if (v.lengthSq() > 0) v.scale(0.6);
      if (now - this.groggyFxAt > 3500) {
        this.groggyFxAt = now;
        this.rise('fx:zzz', this.player.x + 4, this.player.y - 26);
      }
    }
    // went to bed but closed the day summary ("Not yet"): get back up
    if (this.sleepNight && !store.ui.modal && !store.ui.dialogue && now - this.sleepSince > 1500 && store.state.clock.day === this.sleepDay) {
      this.sleepNight = false;
      this.getUp();
    }
    this.angryFrame(delta);
    this.homeTimer += delta;
    if (this.homeTimer > 2000) {
      this.homeTimer = 0;
      tension(store); // lazy cool-down
      pollTriggers(store);
    }
  }

  private homeFx(kind: string, target?: string, x?: number) {
    const e = target ? this.fam.get(target) : undefined;
    switch (kind) {
      case 'fight':
        return this.playFight(e, x === 1);
      case 'stomp':
        return e && this.stomp(e);
      case 'cry':
        return e && this.cry(e);
      case 'separate':
        return e && this.separate(e);
      case 'hug':
        return e && this.hug(e);
      case 'jump':
        return e && this.jumpOnBed(e);
      case 'timeout':
        this.timeoutRect = ROOM_RECT[this.roomAt(this.player.x, this.player.y)];
        return this.popWord('hl:timeout', this.player.x, this.player.y - 34, 1400);
      case 'nap':
        this.lock('nap', true);
        return this.lieDown(0.55);
      case 'wake':
        this.getUp();
        if (target === 'groggy') this.rise('fx:zzz', this.player.x, this.player.y - 26);
        return;
      case 'sleep':
        this.lock('sleep', true);
        this.sleepNight = true;
        this.sleepSince = this.time.now;
        this.sleepDay = store.state.clock.day;
        return this.lieDown(0.85);
      case 'alarm':
        return this.ringAlarm();
      case 'snooze':
        this.clearAlarm();
        this.fadeOverlay(0.5);
        this.startZzz();
        return;
      case 'alarm-off':
        this.clearAlarm();
        return this.getUp();
      case 'tv-on':
        return this.tvOn(x ?? 0);
      case 'tv-channel':
        return this.tvSwitch(x ?? 0);
      case 'tv-off':
        return this.tvOff();
    }
  }

  // ---------------------------------------------------------------- walking NPCs

  private roomAt(x: number, y: number): Room {
    const col = Math.floor(x / T);
    const row = Math.floor((y - 1) / T);
    if (row >= 10) return 'living';
    if (row === 9) return col <= 9 || col >= 16 ? 'living' : 'hall';
    if (col <= 9) return 'bedroom';
    if (col >= 16) return 'kitchen';
    if (col >= 11 && col <= 14 && row <= 5) return 'bath';
    return 'hall';
  }

  /** Light path-finding: room → doorway → living-room lane → doorway → room. */
  private route(from: { x: number; y: number }, to: { x: number; y: number }) {
    const ra = this.roomAt(from.x, from.y);
    const rb = this.roomAt(to.x, to.y);
    if (ra === rb && ra !== 'living') return [to];
    if ((ra === 'kitchen' && rb === 'hall') || (ra === 'hall' && rb === 'kitchen')) return [{ x: 256, y: 136 }, to];
    const pts: { x: number; y: number }[] = [];
    if (ra === 'living') {
      if (rb === 'living' && Math.abs(from.x - to.x) < 40) return [to];
      if (Math.abs(from.y - LANE) > 4) pts.push({ x: from.x, y: LANE });
    } else pts.push(...TO_LIVING[ra]);
    if (rb === 'living') pts.push({ x: to.x, y: LANE });
    else pts.push(...[...TO_LIVING[rb]].reverse());
    pts.push(to);
    return pts;
  }

  private take(e: FamEntry) {
    const id = e.member.id;
    if (!this.controlled.has(id)) {
      this.controlled.add(id);
      this.savedWander.set(id, e.actor.spec.wander);
    }
    e.actor.spec.wander = undefined;
    e.actor.target = undefined;
  }

  private release(e: FamEntry, wander?: Place['wander']) {
    const id = e.member.id;
    e.actor.spec.wander = wander ?? this.savedWander.get(id) ?? { x: e.actor.sprite.x, y: e.actor.sprite.y, w: 0, h: 0 };
    e.actor.pause = 1500;
    this.controlled.delete(id);
    this.savedWander.delete(id);
    this.puppets.delete(e.actor.sprite);
  }

  private dirOf(dx: number, dy: number): Dir {
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
  }

  /** Walk a family member along a route at `minSpeed`+ px/s (faster for long trips so they arrive in ~4 s). */
  private walkActor(e: FamEntry, to: { x: number; y: number }, done: () => void, minSpeed = 95) {
    this.take(e);
    const spr = e.actor.sprite;
    const pts = this.route({ x: spr.x, y: spr.y }, to);
    let len = 0;
    let px = spr.x;
    let py = spr.y;
    for (const p of pts) {
      len += Math.hypot(p.x - px, p.y - py);
      px = p.x;
      py = p.y;
    }
    const speed = Math.max(minSpeed, len / 4.2);
    const step = (i: number) => {
      if (!spr.active) return done();
      if (i >= pts.length) {
        this.puppets.set(spr, { dir: this.puppets.get(spr)?.dir ?? 'down', walk: false });
        return done();
      }
      const p = pts[i];
      const d = Math.hypot(p.x - spr.x, p.y - spr.y);
      if (d < 0.5) return step(i + 1);
      this.puppets.set(spr, { dir: this.dirOf(p.x - spr.x, p.y - spr.y), walk: true });
      this.tweens.add({ targets: spr, x: p.x, y: p.y, duration: (d / speed) * 1000, onComplete: () => step(i + 1) });
    };
    step(0);
  }

  private face(spr: Phaser.GameObjects.Sprite, x: number, y: number) {
    this.puppets.set(spr, { dir: this.dirOf(x - spr.x, y - spr.y), walk: false });
  }

  /** A spot next to the player (or the bed) to walk up to. */
  private besidePlayer(from: { x: number }) {
    if (this.lying) return { ...BED_SIDE };
    const p = this.player;
    let side = from.x < p.x ? -1 : 1;
    if (p.x + side * 15 < 22 || p.x + side * 15 > 394) side = -side;
    return { x: p.x + side * 15, y: p.y };
  }

  /** conduct.ts sends someone over: walk them to the player, then deliver the lines. */
  private onConduct(ev: { type: 'intervene'; memberId: string; reason: string; handled?: boolean; arrive: () => void }) {
    if (ev.type !== 'intervene' || this.transitioning || !this.player?.active) return;
    const e = this.fam.get(ev.memberId);
    if (!e || !e.actor.sprite.active) return;
    ev.handled = true;
    if (isWatchingTv(store)) stopTv(store);
    const spr = e.actor.sprite;
    const home = { x: spr.x, y: spr.y };
    this.lock('intervene', true);
    this.rise('fx:exclaim', this.player.x, this.player.y - 28);
    this.rise('fx:exclaim', spr.x, spr.y - 26);
    this.walkActor(e, this.besidePlayer(spr), () => {
      this.face(spr, this.player.x, this.player.y);
      if (!this.lying) this.facing = this.dirOf(spr.x - this.player.x, spr.y - this.player.y);
      this.lock('intervene', false);
      ev.arrive();
      this.returning.push({ e, home, free: 0 });
    }, 110);
  }

  // ---------------------------------------------------------------- fight scene

  private playFight(e: FamEntry | undefined, real: boolean) {
    const pl = this.player;
    this.lock('fight', true);
    const side = e && e.actor.sprite.x < pl.x ? -1 : 1;
    const begin = () => {
      const sib = e?.actor.sprite;
      const opp = side < 0 ? 'right' : 'left';
      this.facing = side < 0 ? 'left' : 'right';
      this.puppets.set(pl, { dir: this.facing, walk: false });
      if (sib) this.puppets.set(sib, { dir: opp, walk: false });
      const mid = () => ({ x: (pl.x + (sib?.x ?? pl.x + side * 13)) / 2, y: pl.y - 12 });
      const words = real ? COMIC_WORDS : PILLOW_WORDS;
      let n = 0;
      const lunge = () => {
        const who = n % 2 === 0 || !sib ? pl : sib;
        const dir = who === pl ? side : -side;
        this.tweens.add({ targets: who, x: who.x + dir * 4, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
        const p = this.puppets.get(who);
        if (p) {
          p.walk = true;
          this.time.delayedCall(140, () => p && (p.walk = false));
        }
        const m = mid();
        if (real) {
          this.popImg('hl:star', m.x + Phaser.Math.Between(-3, 3), m.y + Phaser.Math.Between(-4, 2), 380);
          this.cameras.main.shake(90, 0.006);
        } else this.feathers(m.x, m.y);
        if (n % 2 === 0) this.popWord(`hl:${real ? 'word' : 'pword'}${(n / 2) % words.length}`, m.x + Phaser.Math.Between(-8, 8), m.y - 14, 520);
        n++;
      };
      lunge();
      const phase1 = real ? 1050 : FIGHT_PHASE_PILLOW;
      this.time.addEvent({ delay: 200, repeat: Math.floor(phase1 / 200) - 1, callback: lunge });
      if (real) this.time.delayedCall(phase1 + 60, () => this.brawlCloud(pl, sib, side));
      this.time.delayedCall(FIGHT_TOTAL - 120, () => {
        this.puppets.delete(pl);
        if (e) {
          this.face(e.actor.sprite, pl.x, pl.y);
          this.time.delayedCall(400, () => this.controlled.has(e.member.id) && !this.isBusyWalking(e) && this.release(e));
        }
        this.lock('fight', false);
      });
    };
    if (e) {
      const spot = { x: Phaser.Math.Clamp(pl.x + side * 13, 20, 396), y: pl.y };
      this.take(e);
      const spr = e.actor.sprite;
      this.puppets.set(spr, { dir: this.dirOf(spot.x - spr.x, spot.y - spr.y), walk: true });
      this.tweens.add({ targets: spr, x: spot.x, y: spot.y, duration: Math.min(260, Math.hypot(spot.x - spr.x, spot.y - spr.y) * 6 + 40), onComplete: begin });
    } else begin();
  }

  private isBusyWalking(e: FamEntry) {
    return this.tweens.isTweening(e.actor.sprite);
  }

  /** The classic cartoon dust ball with limbs poking out, stars and comic words. */
  private brawlCloud(pl: Phaser.GameObjects.Sprite, sib: Phaser.GameObjects.Sprite | undefined, side: number) {
    const cx = (pl.x + (sib?.x ?? pl.x + side * 13)) / 2;
    const cy = pl.y - 2;
    const hide = [pl, this.playerShadow, sib, sib?.getData('shadow') as Phaser.GameObjects.Image | undefined].filter(Boolean) as Phaser.GameObjects.Components.Visible[];
    hide.forEach((o) => o.setVisible(false));
    const cloud = this.add.image(cx, cy, 'hl:dust0').setOrigin(0.5, 1).setDepth(cy + 2);
    let k = 0;
    const wobble = this.time.addEvent({
      delay: 90,
      loop: true,
      callback: () => {
        k++;
        cloud.setTexture(`hl:dust${k % 2}`);
        cloud.setPosition(cx + Phaser.Math.Between(-2, 2), cy + Phaser.Math.Between(-1, 1));
        if (k % 2 === 0) this.popImg('hl:star', cx + Phaser.Math.Between(-20, 20), cy - Phaser.Math.Between(10, 30), 300);
        if (k % 4 === 1) this.popWord(`hl:word${(k >> 2) % COMIC_WORDS.length}`, cx + Phaser.Math.Between(-16, 16), cy - 34, 420);
      },
    });
    this.cameras.main.shake(1000, 0.004);
    this.time.delayedCall(1100, () => {
      wobble.remove();
      this.tweens.add({ targets: cloud, scale: 1.4, alpha: 0, duration: 220, onComplete: () => cloud.destroy() });
      hide.forEach((o) => o.setVisible(true));
      // pushed apart
      const away = (o: Phaser.GameObjects.Sprite | undefined, d: number) => o && this.tweens.add({ targets: o, x: o.x + d, duration: 150, ease: 'Quad.easeOut' });
      away(pl, -side * 5);
      away(sib, side * 5);
      this.rise('fx:cloud', pl.x, pl.y - 26);
    });
  }

  private feathers(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      const f = this.add.image(x, y, 'hl:feather').setDepth(15000);
      this.tweens.add({
        targets: f,
        x: x + Phaser.Math.Between(-14, 14),
        y: y + Phaser.Math.Between(-10, 12),
        alpha: 0,
        duration: Phaser.Math.Between(500, 900),
        ease: 'Sine.easeOut',
        onComplete: () => f.destroy(),
      });
    }
  }

  private popImg(key: string, x: number, y: number, life: number) {
    const img = this.add.image(x, y, key).setDepth(15000).setScale(0.3);
    this.tweens.add({ targets: img, scale: 1, duration: 90, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, delay: life * 0.6, duration: life * 0.4, onComplete: () => img.destroy() });
  }

  private popWord(key: string, x: number, y: number, life: number) {
    const img = this.add.image(x, y, key).setDepth(15001).setScale(0.2);
    this.tweens.add({ targets: img, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, y: y - 8, alpha: 0, delay: life * 0.55, duration: life * 0.45, onComplete: () => img.destroy() });
  }

  private rise(key: string, x: number, y: number) {
    if (!this.textures.exists(key)) return;
    const img = this.add.image(x, y, key).setDepth(15000);
    this.tweens.add({ targets: img, y: y - 14, alpha: 0, duration: 900, ease: 'Sine.easeOut', onComplete: () => img.destroy() });
  }

  // ---------------------------------------------------------------- sibling reactions

  private stomp(e: FamEntry) {
    const spr = e.actor.sprite;
    this.take(e);
    this.face(spr, this.player.x, this.player.y);
    const y0 = spr.y;
    this.tweens.add({
      targets: spr,
      y: y0 - 3,
      duration: 80,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        spr.y = y0;
        if (!this.isBusyWalking(e)) this.release(e);
      },
    });
  }

  private cry(e: FamEntry) {
    const spr = e.actor.sprite;
    this.time.addEvent({
      delay: 160,
      repeat: 14,
      callback: () => {
        if (!spr.active) return;
        const t = this.add.image(spr.x + (Math.random() < 0.5 ? -3 : 3), spr.y - 15, 'hl:tear').setDepth(15000);
        this.tweens.add({ targets: t, x: t.x + (t.x < spr.x ? -3 : 3), y: t.y + 9, alpha: 0, duration: 520, onComplete: () => t.destroy() });
      },
    });
  }

  /** Parent sends the sibling to the other room. */
  private separate(e: FamEntry) {
    const spr = e.actor.sprite;
    const inBedroom = this.roomAt(spr.x, spr.y) === 'bedroom';
    const dest = inBedroom ? AREAS.living[1] : AREAS.bedroom[0];
    this.rise('fx:cloud', spr.x, spr.y - 26);
    this.walkActor(e, { x: dest.x, y: dest.y }, () => this.release(e, dest.wander), 80);
  }

  private hug(e: FamEntry) {
    const spr = e.actor.sprite;
    this.lock('hug', true);
    this.walkActor(e, this.besidePlayer(spr), () => {
      this.face(spr, this.player.x, this.player.y);
      this.facing = this.dirOf(spr.x - this.player.x, spr.y - this.player.y);
      const mx = (spr.x + this.player.x) / 2;
      for (let i = 0; i < 3; i++) this.time.delayedCall(i * 220, () => this.rise('fx:heart', mx + (i - 1) * 6, this.player.y - 28));
      this.tweens.add({ targets: [spr, this.player], scaleX: 1.12, scaleY: 0.92, duration: 140, yoyo: true, repeat: 1 });
      this.time.delayedCall(900, () => {
        this.lock('hug', false);
        this.release(e);
      });
    }, 90);
  }

  private jumpOnBed(e: FamEntry) {
    const spr = e.actor.sprite;
    this.take(e);
    const back = { x: spr.x, y: spr.y };
    const shadow = spr.getData('shadow') as Phaser.GameObjects.Image | undefined;
    spr.setPosition(c(1), b(3) - 8);
    this.puppets.set(spr, { dir: 'down', walk: false });
    this.rise('fx:exclaim', spr.x, spr.y - 30);
    this.tweens.add({
      targets: spr,
      y: spr.y - 7,
      duration: 150,
      yoyo: true,
      repeat: 4,
      ease: 'Quad.easeOut',
      onComplete: () => {
        spr.setPosition(back.x, back.y);
        shadow?.setPosition(back.x, back.y);
        this.release(e);
      },
    });
  }

  // ---------------------------------------------------------------- nap / sleep / alarm

  private ensureOverlay() {
    if (!this.overlay?.active) {
      this.overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0b1033, 0).setOrigin(0).setScrollFactor(0).setDepth(19500);
    }
    this.overlay.setSize(this.scale.width, this.scale.height);
    return this.overlay;
  }

  private fadeOverlay(alpha: number, then?: () => void) {
    const o = this.ensureOverlay();
    this.tweens.killTweensOf(o);
    this.tweens.add({ targets: o, fillAlpha: alpha, duration: 450, onComplete: () => then?.() });
  }

  private startZzz() {
    this.zzz?.remove();
    this.zzz = this.time.addEvent({ delay: 650, loop: true, callback: () => this.rise('fx:zzz', c(1) + 8, b(3) - 32) });
  }

  private lieDown(dark: number) {
    if (!this.lying) {
      this.lyingFrom = { x: this.player.x, y: this.player.y };
      const key = lyingTexture(this, 'char:player');
      this.lying = this.add.image(c(1), b(3) - 31, key).setOrigin(0.5, 0).setDepth(b(3) + 1);
      this.player.setVisible(false);
      this.playerShadow.setVisible(false);
    }
    this.fadeOverlay(dark);
    this.startZzz();
  }

  private getUp() {
    this.zzz?.remove();
    this.zzz = undefined;
    this.clearAlarm();
    if (this.lying) {
      this.lying.destroy();
      this.lying = undefined;
      const p = this.lyingFrom ?? BED_SIDE;
      this.player.body.reset(p.x, p.y);
      this.player.setVisible(true);
      this.playerShadow.setVisible(true);
    }
    this.sleepNight = false;
    if (this.overlay?.active) this.fadeOverlay(0, () => this.overlay?.setVisible(true));
    this.lock('nap', false);
    this.lock('sleep', false);
  }

  private ringAlarm() {
    this.sleepNight = false;
    if (!this.lying) {
      this.lock('sleep', true);
      this.lieDown(0.15);
    }
    this.zzz?.remove();
    this.fadeOverlay(0.12);
    this.clearAlarm();
    const x = c(2) + 6;
    const y = b(1) + 10;
    const clock = this.add.image(x, y, 'hl:alarm').setOrigin(0.5, 1).setDepth(y + 40);
    const ring = this.add.image(x, y - 18, 'hl:ring').setDepth(15001);
    this.alarmObjs = [clock, ring];
    this.tweens.add({ targets: clock, x: x + 1.5, duration: 45, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: ring, y: y - 22, scale: 1.12, duration: 180, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.cameras.main.shake(220, 0.003);
  }

  private clearAlarm() {
    for (const o of this.alarmObjs) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    this.alarmObjs = [];
  }

  // ---------------------------------------------------------------- TV

  private tvOn(channel: number) {
    this.lock('tv', true);
    this.tvSeatFrom = { x: this.player.x, y: this.player.y };
    this.player.body.enable = false;
    this.player.setPosition(SOFA_SEAT.x, SOFA_SEAT.y);
    this.playerShadow.setVisible(false);
    this.facing = 'up';
    this.tvChannel = channel;
    const scr = this.add.image(11 * T - 12, b(10) - 23, `hl:tv${channel}a`).setOrigin(0, 0).setDepth(b(10) + 0.5);
    const glow = this.add.image(11 * T, b(10) - 10, 'hl:glow').setDepth(b(10) + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7);
    const floor = this.add.image(11 * T, b(11) + 6, 'hl:glow').setDepth(-900).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35).setScale(1.2, 0.8);
    this.tvScreen = scr;
    this.tvObjs = [scr, glow, floor];
  }

  private tvSwitch(channel: number) {
    if (!this.tvScreen?.active) return;
    this.tvChannel = 5; // static between channels
    this.time.delayedCall(260, () => (this.tvChannel = channel));
  }

  private tvOff() {
    for (const o of this.tvObjs) o.destroy();
    this.tvObjs = [];
    this.tvScreen = undefined;
    this.player.body.enable = true;
    const p = this.tvSeatFrom ?? { x: SOFA_SEAT.x, y: b(14) - 2 };
    this.player.body.reset(p.x, p.y);
    this.playerShadow.setVisible(true);
    this.lock('tv', false);
  }

  // =====================================================================================
  // ANGRY MUM MODE — the visuals (logic & flow live in core/angryMum.ts)
  // =====================================================================================

  private amE?: FamEntry;
  private amAura?: Phaser.GameObjects.Image;
  private amFx: Phaser.GameObjects.GameObject[] = [];
  private amTimers: Phaser.Time.TimerEvent[] = [];
  private amScale = 1;
  private amSteamAt = 0;
  private amSteamEvery = 260;
  private amCount?: Phaser.GameObjects.Image;
  private amBubble?: { img: Phaser.GameObjects.Image; id: string; until: number };
  private amCallBar?: Phaser.GameObjects.Image[];
  private amPhoneSeen = false;
  private amSavedIts?: InteractSpec[];
  private amZoom = 0;
  private amEscort?: { e: FamEntry };
  private amLecture?: { objs: Phaser.GameObjects.GameObject[]; timers: Phaser.Time.TimerEvent[]; sib?: FamEntry; grand?: FamEntry; from: { x: number; y: number } };
  private amChase?: {
    e: FamEntry;
    hooks: ChaseHooks;
    ms: number;
    shoutAt: number;
    beepAt: number;
    dustAt: number;
    linesAt: number;
    pathAt: number;
    path: { x: number; y: number }[];
    hidden?: { id: string; x: number; y: number; eyes: Phaser.GameObjects.Image; bar: Phaser.GameObjects.Image[]; meter: number; ms: number; room: Room; plan: { x: number; y: number }[]; walking: boolean; pauseUntil: number; cone?: Phaser.GameObjects.Image };
    slide?: { vx: number; vy: number; until: number };
    knocked: Map<Phaser.GameObjects.Image, number>;
    puddle: Phaser.GameObjects.Image;
    done: boolean;
  };

  private angryReset() {
    this.amE = this.amAura = this.amCount = this.amBubble = this.amCallBar = this.amSavedIts = this.amEscort = this.amLecture = this.amChase = undefined;
    this.amFx = [];
    this.amTimers = [];
    this.amScale = 1;
    this.amZoom = 0;
    this.amPhoneSeen = false;
    this.amFollow = [];
  }

  private angryShutdown() {
    const ch = this.amChase;
    if (ch && !ch.done) {
      ch.done = true;
      // ran out of the house mid-chase: she gives up… for now
      setTimeout(() => ch.hooks.escaped(), 0);
    }
    setAngryStage(null);
  }

  private stage: AngryStage = {
    ready: (id) => {
      const e = this.fam.get(id);
      return !!e && e.actor.sprite.active && !this.transitioning && !!this.player?.active && !this.amChase;
    },
    transform: (id, title, done) => this.amTransform(id, title, done),
    yell: (text) => this.amYell(text),
    count: (label) => this.amCountShow(label),
    deflate: (id) => this.amDeflate(id),
    angrier: (id) => this.amAngrier(id),
    chase: (id, hooks) => this.amStartChase(id, hooks),
    escort: (id, done) => this.amDoEscort(id, done),
    lecture: (id, on) => (on ? this.amLectureOn(id) : this.amLectureOff()),
    calm: (id) => this.amCalm(id),
    approach: (id, done) => this.amApproach(id, done),
    bubble: (id, text, loud) => this.amShowBubble(id, text, loud ?? false, text ? 60000 : 0),
    distanceTo: (id) => {
      const e = this.fam.get(id);
      if (!e || !e.actor.sprite.active || !this.player?.active) return null;
      return Phaser.Math.Distance.Between(e.actor.sprite.x, e.actor.sprite.y, this.player.x, this.player.y);
    },
  };

  private amTrack<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.amFx.push(o);
    return o;
  }

  /** ~3 s transformation: letterbox, red alert, camera punch-in, red face, steam, aura, growth, thud. */
  private amTransform(id: string, title: string, done: () => void) {
    const e = this.fam.get(id);
    if (!e) return done();
    if (isWatchingTv(store)) stopTv(store);
    if (this.lying) this.getUp();
    this.amE = e;
    const spr = e.actor.sprite;
    this.take(e);
    this.lock('angry', true);
    this.player.setVelocity(0, 0);
    this.puppets.set(spr, { dir: 'down', walk: false }); // face the camera: we want to SEE that face
    this.facing = this.dirOf(spr.x - this.player.x, spr.y - this.player.y);
    const cam = this.cameras.main;
    this.amZoom = cam.zoom;
    letterbox(true);
    redAlert(true);
    sting('danger');
    cam.stopFollow();
    cam.pan(spr.x, spr.y - 12, 450, 'Cubic.easeOut');
    this.tweens.add({ targets: cam, zoom: this.amZoom + 1, duration: 450, ease: 'Cubic.easeOut' });
    this.rise('fx:exclaim', this.player.x, this.player.y - 28);
    // lights flicker
    [500, 640, 820, 1000].forEach((t) => this.time.delayedCall(t, () => flash(0x000000, 70)));
    this.time.delayedCall(900, () => {
      const m = store.member(id);
      spr.setTexture(angrySheet(this, `char:${id}`, m?.appearance, m?.role ?? 'mother'), spr.frame.name as unknown as number);
      this.amAura = this.amTrack(this.add.image(spr.x, spr.y + 4, 'am:aura0').setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(spr.depth - 0.5));
      this.tweens.add({ targets: this.amAura, alpha: 0.9, duration: 300 });
      this.amSteamEvery = 220;
      shake(0.004, 300);
    });
    this.time.delayedCall(1500, () => {
      this.amScale = 1.25;
      this.tweens.add({ targets: spr, scaleX: 1.25, scaleY: 1.25, duration: 260, ease: 'Back.easeOut' });
      this.popWord('am:thud', spr.x, spr.y - 6, 700);
      shake(0.014, 320);
      speedLines(600, 0xffd0c0);
      if (store.ui.sound) sfx.play('alert');
    });
    this.time.delayedCall(2000, () => {
      const t = this.amTrack(this.add.image(spr.x, spr.y - 44, textTexture(this, 'title', title)).setDepth(16000).setScale(2.4).setAlpha(0));
      this.tweens.add({ targets: t, scale: 0.55, alpha: 1, duration: 220, ease: 'Back.easeOut' });
      this.tweens.add({ targets: t, alpha: 0, y: t.y - 6, delay: 1300, duration: 350, onComplete: () => t.destroy() });
    });
    this.time.delayedCall(3000, () => {
      this.tweens.add({ targets: cam, zoom: this.amZoom, duration: 400 });
      cam.startFollow(this.player, true, 0.15, 0.15);
      done();
    });
  }

  /** Screen-centre (world coords) helper for giant text. */
  private amScreen(fy: number) {
    const v = this.cameras.main.worldView;
    return { x: v.centerX, y: v.y + v.height * fy, w: v.width };
  }

  private amYell(text: string) {
    const key = textTexture(this, 'yell', text);
    const p = this.amScreen(0.24);
    const img = this.add.image(p.x, p.y, key).setScrollFactor(1).setDepth(32000);
    const fit = Math.min(1, (p.w * 0.92) / img.width);
    img.setScale(fit * 3).setAlpha(0);
    this.tweens.add({ targets: img, scale: fit, alpha: 1, duration: 200, ease: 'Back.easeOut', onComplete: () => shake(0.016, 380) });
    // echoes ripple outward and fade
    for (let i = 1; i <= 3; i++) {
      this.time.delayedCall(220 + i * 260, () => {
        const echo = this.add.image(p.x, p.y, key).setDepth(31999).setScale(fit).setAlpha(0.55);
        this.tweens.add({ targets: echo, scale: fit * (1.25 + i * 0.15), alpha: 0, duration: 700, onComplete: () => echo.destroy() });
      });
    }
    this.tweens.add({ targets: img, alpha: 0, delay: 2600, duration: 400, onComplete: () => img.destroy() });
    sting('shock');
    if (this.amE) this.popWord('am:thud', this.amE.actor.sprite.x, this.amE.actor.sprite.y - 30, 500);
  }

  private amCountShow(label: string) {
    this.amCount?.destroy();
    this.amCount = undefined;
    if (!label) return;
    const p = this.amScreen(0.3);
    const img = this.add.image(p.x, p.y, textTexture(this, 'count', label)).setDepth(32000);
    const fit = Math.min(1, (p.w * 0.8) / img.width);
    img.setScale(fit * 2.6).setAlpha(0);
    this.amCount = img;
    this.tweens.add({ targets: img, scale: fit, alpha: 1, duration: 180, ease: 'Back.easeOut' });
    shake(0.01, 220);
    sting('danger');
    slowMo(0.25, 1600); // the world holds its breath between numbers
  }

  private amSteamPuff(spr: Phaser.GameObjects.Sprite, big = false) {
    const h = 24 * this.amScale;
    for (const side of [-1, 1]) {
      const s = this.add.image(spr.x + side * 6 * this.amScale, spr.y - h * 0.62, 'am:steam').setDepth(15002).setScale(big ? 1 : 0.6);
      this.tweens.add({ targets: s, x: s.x + side * Phaser.Math.Between(4, 9), y: s.y - Phaser.Math.Between(8, 14), scale: big ? 1.8 : 1.1, alpha: 0, duration: big ? 900 : 650, ease: 'Sine.easeOut', onComplete: () => s.destroy() });
    }
  }

  private amDeflate(id: string) {
    const e = this.fam.get(id);
    if (!e) return;
    const spr = e.actor.sprite;
    this.popWord('am:hiss', spr.x, spr.y - 34, 1200);
    for (let i = 0; i < 4; i++) this.time.delayedCall(i * 120, () => this.amSteamPuff(spr, true));
    this.amScale = 1;
    this.tweens.add({ targets: spr, scaleX: 1, scaleY: 1, duration: 900, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: spr, angle: { from: -3, to: 3 }, duration: 90, yoyo: true, repeat: 4, onComplete: () => spr.setAngle(0) });
    if (this.amAura) this.tweens.add({ targets: this.amAura, alpha: 0, duration: 900 });
    this.time.delayedCall(700, () => spr.setTexture(`char:${id}`, spr.frame.name as unknown as number));
    this.amSteamEvery = 0;
    redAlert(false);
  }

  private amAngrier(id: string) {
    const e = this.fam.get(id);
    if (!e) return;
    const spr = e.actor.sprite;
    this.amScale = 1.4;
    this.tweens.add({ targets: spr, scaleX: 1.4, scaleY: 1.4, duration: 220, ease: 'Back.easeOut' });
    if (this.amAura) this.amAura.setScale(1.3);
    this.amSteamEvery = 120;
    flash(0xff3020, 160);
    shake(0.02, 400);
    sting('danger');
    this.popWord('am:thud', spr.x, spr.y - 40, 600);
  }

  private amCalm(id: string) {
    const e = this.fam.get(id);
    this.amSteamEvery = 0;
    this.amCountShow('');
    if (e) {
      const spr = e.actor.sprite;
      spr.setTexture(`char:${id}`, spr.frame.name as unknown as number);
      this.tweens.add({ targets: spr, scaleX: 1, scaleY: 1, duration: 500 });
      if (this.controlled.has(id) && !this.isBusyWalking(e)) this.returning.push({ e, home: { x: spr.x, y: spr.y }, free: 0 });
    }
    this.amScale = 1;
    if (this.amAura) {
      const a = this.amAura;
      this.amAura = undefined;
      this.tweens.add({ targets: a, alpha: 0, duration: 600, onComplete: () => a.destroy() });
    }
    redAlert(false);
    letterbox(false);
    this.amEndChase();
    this.amLectureOff();
    this.amEscort = undefined;
    this.amE = undefined;
    if (this.amZoom) {
      this.tweens.add({ targets: this.cameras.main, zoom: this.amZoom, duration: 500 });
      this.amZoom = 0;
    }
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.lock('angry', false);
  }

  private amShowBubble(id: string, text: string | null, loud: boolean, life: number) {
    this.amBubble?.img.destroy();
    this.amBubble = undefined;
    if (!text) return;
    const e = this.fam.get(id);
    if (!e) return;
    const img = this.add.image(e.actor.sprite.x, e.actor.sprite.y - 30, textTexture(this, loud ? 'loud' : 'bubble', text)).setOrigin(0.15, 1).setDepth(16500).setScale(0.3);
    this.tweens.add({ targets: img, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.amBubble = { img, id, until: this.time.now + life };
    if (loud) this.cameras.main.shake(160, 0.004);
  }

  // ---------------------------------------------------------------- chase & hide

  private amStartChase(id: string, hooks: ChaseHooks) {
    const e = this.fam.get(id);
    if (!e) return hooks.escaped();
    this.take(e);
    this.lock('angry', false);
    this.player.body.enable = true;
    this.player.setVisible(true);
    // only hiding spots are interactable during the chase
    this.amSavedIts = this.interactables;
    const hide = (hid: string, x: number, y: number, label: string): InteractSpec => ({ id: `hide:${hid}`, x, y, r: 16, label });
    this.interactables = [
      hide('bed', c(1) + 6, b(3) - 10, '🙈 Hide under your bed'),
      hide('wardrobe', c(7), b(2) + 4, '🙈 Hide in the wardrobe'),
      hide('sofa', 11 * T + 14, b(13) - 4, '🙈 Hide behind the sofa curtain'),
    ];
    const puddle = this.amTrack(this.add.image(19 * T, b(4) + 2, 'am:wet').setDepth(-800));
    this.amChase = { e, hooks, ms: 0, shoutAt: 0, beepAt: 0, dustAt: 0, linesAt: 0, pathAt: 0, path: [], knocked: new Map(), puddle, done: false };
    if (this.amZoom) this.tweens.add({ targets: this.cameras.main, zoom: this.amZoom, duration: 500 }); // slight zoom-out
    speedLines(700);
    sting('danger');
    store.toast('🏃 RUN! (Hide: under your bed, in the wardrobe, or behind the sofa curtain — press E)', 'bad');
    this.amShowBubble(id, hooks.shout('chase'), true, 2200);
  }

  private amEndChase() {
    const ch = this.amChase;
    if (!ch) return;
    ch.done = true;
    if (ch.hidden) this.amUnhide(false);
    if (this.amSavedIts) this.interactables = this.amSavedIts;
    this.amSavedIts = undefined;
    ch.puddle.destroy();
    this.amChase = undefined;
    this.player.body.enable = true;
    this.player.setVisible(true);
    this.playerShadow.setVisible(true);
    this.player.setAngle(0);
  }

  private amHide(spot: string) {
    const ch = this.amChase;
    if (!ch || ch.done) return;
    if (ch.hidden) return this.amUnhide(true);
    const it = this.interactables.find((i) => i.id === `hide:${spot}`);
    if (!it) return;
    this.player.setVelocity(0, 0);
    this.player.setVisible(false);
    this.playerShadow.setVisible(false);
    this.player.body.enable = false;
    this.lock('hide', true);
    const eyes = this.add.image(it.x, it.y + (spot === 'bed' ? 8 : 2), 'am:eyes').setDepth(it.y + 30);
    this.tweens.add({ targets: eyes, scaleY: 0.2, duration: 80, yoyo: true, repeat: -1, repeatDelay: 1800 });
    const bg = this.add.image(it.x, it.y - 22, 'am:px').setDisplaySize(22, 3).setTint(0x222233).setDepth(16000);
    const fill = this.add.image(it.x - 11, it.y - 22, 'am:px').setOrigin(0, 0.5).setDisplaySize(0.01, 3).setTint(0xffd23a).setDepth(16001);
    const room = this.roomAt(it.x, it.y + 4);
    const rooms: Room[] = ['kitchen', 'hall', 'living', 'bedroom'];
    const others = rooms.filter((r) => r !== room && r !== this.roomAt(ch.e.actor.sprite.x, ch.e.actor.sprite.y));
    const centre = (r: Room) => {
      const R = ROOM_RECT[r];
      return { x: (R.x0 + R.x1) / 2, y: (R.y0 + R.y1) / 2 + 6 };
    };
    // she searches the wrong rooms first… then yours (and stands RIGHT next to you)
    const plan = [centre(others[0]), centre(room), { x: it.x + 18, y: it.y + 10 }, centre(others[1] ?? others[0])];
    ch.hidden = { id: spot, x: it.x, y: it.y, eyes, bar: [bg, fill], meter: 0, ms: 0, room, plan, walking: false, pauseUntil: this.time.now + 900 };
    this.amShowBubble(ch.e.member.id, 'Where did you GO?!', true, 1600);
    store.toast('🤫 Hold still! Moving fills the meter. She gives up if she can’t find you.', 'info');
  }

  private amUnhide(resume: boolean) {
    const ch = this.amChase;
    const h = ch?.hidden;
    if (!ch || !h) return;
    h.eyes.destroy();
    h.bar.forEach((o) => o.destroy());
    h.cone?.destroy();
    ch.hidden = undefined;
    this.player.body.enable = true;
    this.player.body.reset(h.x, h.y + 12);
    this.player.setVisible(true);
    this.playerShadow.setVisible(true);
    this.lock('hide', false);
    if (resume) this.amShowBubble(ch.e.member.id, 'THERE you are!', true, 1600);
  }

  private amChaseFrame(delta: number) {
    const ch = this.amChase;
    if (!ch || ch.done) return;
    if (store.blocking) return;
    const spr = ch.e.actor.sprite;
    const now = this.time.now;
    ch.ms += delta;
    if (store.ui.sound && now > ch.beepAt) {
      ch.beepAt = now + 380;
      sfx.play(Math.floor(now / 380) % 2 ? 'blip' : 'step');
    }
    if (ch.hidden) return this.amSearchFrame(ch, delta);
    // out of breath → she gives up (for now)
    if (ch.ms > ANGRY.chaseMaxMs) return this.amChaseOver(false);
    // run towards the player along the room route
    if (now > ch.pathAt) {
      ch.pathAt = now + 350;
      ch.path = this.route({ x: spr.x, y: spr.y }, { x: this.player.x, y: this.player.y });
    }
    const tgt = ch.path[0] ?? { x: this.player.x, y: this.player.y };
    const dx = tgt.x - spr.x;
    const dy = tgt.y - spr.y;
    const d = Math.hypot(dx, dy);
    const sp = (chaseSpeed(72) * delta) / 1000;
    if (d <= sp) {
      spr.setPosition(tgt.x, tgt.y);
      ch.path.shift();
    } else spr.setPosition(spr.x + (dx / d) * sp, spr.y + (dy / d) * sp);
    this.puppets.set(spr, { dir: this.dirOf(dx, dy), walk: true });
    if (now > ch.dustAt) {
      ch.dustAt = now + 110;
      const dust = this.add.image(spr.x - Math.sign(dx) * 5, spr.y - 1, 'am:steam').setDepth(spr.y - 1).setScale(0.45).setTint(0xcbb89a);
      this.tweens.add({ targets: dust, scale: 0.9, alpha: 0, y: dust.y - 3, duration: 420, onComplete: () => dust.destroy() });
    }
    if (now > ch.shoutAt) {
      ch.shoutAt = now + 2600;
      this.amShowBubble(ch.e.member.id, ch.hooks.shout('chase'), true, 2000);
    }
    if (now > ch.linesAt) {
      ch.linesAt = now + 4200;
      speedLines(500);
    }
    // furniture in the way wobbles, cushions fly
    for (const dyn of this.dyn) {
      const img = dyn.img;
      if (!img.active || !KNOCKABLE.has(img.texture.key)) continue;
      if (Math.abs(img.x - spr.x) > 16 || Math.abs(img.y - spr.y) > 10) continue;
      if ((ch.knocked.get(img) ?? 0) > now) continue;
      ch.knocked.set(img, now + 1500);
      this.tweens.add({ targets: img, angle: { from: -8, to: 8 }, duration: 70, yoyo: true, repeat: 3, onComplete: () => img.setAngle(0) });
      if (img.texture.key === 'sofa' || img.texture.key.startsWith('dining') || img.texture.key.startsWith('table')) this.amCushions(img.x, img.y - 10);
      else this.popImg('hl:star', img.x, img.y - 14, 300);
    }
    // wet kitchen floor: whoosh!
    const pl = this.player;
    if (!ch.slide && Math.abs(pl.x - ch.puddle.x) < 14 && Math.abs(pl.y - ch.puddle.y) < 6 && pl.body.velocity.lengthSq() > 100) {
      const v = pl.body.velocity.clone().normalize();
      ch.slide = { vx: v.x * 150, vy: v.y * 150, until: now + 520 };
      this.lock('slide', true);
      this.popWord('hl:pword0', pl.x, pl.y - 26, 500);
      this.tweens.add({ targets: pl, angle: { from: -15, to: 15 }, duration: 100, yoyo: true, repeat: 2, onComplete: () => pl.setAngle(0) });
    }
    if (ch.slide) {
      if (now > ch.slide.until) {
        ch.slide = undefined;
        this.lock('slide', false);
      } else pl.setVelocity(ch.slide.vx, ch.slide.vy);
    }
    // caught!
    if (Phaser.Math.Distance.Between(spr.x, spr.y, pl.x, pl.y) < 14) this.amChaseOver(true);
  }

  private amCushions(x: number, y: number) {
    for (let i = 0; i < 2; i++) {
      const cu = this.add.image(x, y, 'am:cushion').setDepth(15500);
      const tx = x + Phaser.Math.Between(-30, 30);
      this.tweens.add({ targets: cu, x: tx, angle: Phaser.Math.Between(-360, 360), duration: 600, ease: 'Sine.easeOut' });
      this.tweens.add({ targets: cu, y: y - 22, duration: 300, yoyo: true, ease: 'Quad.easeOut', onComplete: () => this.tweens.add({ targets: cu, alpha: 0, delay: 900, duration: 300, onComplete: () => cu.destroy() }) });
    }
  }

  private amSearchFrame(ch: NonNullable<HomeScene['amChase']>, delta: number) {
    const h = ch.hidden!;
    const spr = ch.e.actor.sprite;
    const now = this.time.now;
    h.ms += delta;
    // walk the search plan, pausing to look around with a search cone
    if (!h.walking && now > h.pauseUntil) {
      const next = h.plan.shift();
      if (next) {
        h.walking = true;
        h.cone?.destroy();
        h.cone = undefined;
        this.walkActor(ch.e, next, () => {
          h.walking = false;
          h.pauseUntil = this.time.now + 1700;
          this.take(ch.e);
          const near = Phaser.Math.Distance.Between(spr.x, spr.y, h.x, h.y) < 40;
          this.amShowBubble(ch.e.member.id, ch.hooks.shout(near ? 'near' : 'search'), false, 1600);
          h.cone = this.add.image(spr.x, spr.y - 8, 'am:cone').setOrigin(0, 0.5).setDepth(15400).setAlpha(0.8);
          const base = Phaser.Math.Angle.Between(spr.x, spr.y, h.x, h.y) + Phaser.Math.FloatBetween(-0.8, 0.8);
          h.cone.setRotation(base);
          this.tweens.add({ targets: h.cone, rotation: base + 0.9, duration: 800, yoyo: true });
        }, 60);
      }
    }
    const k = this.keys;
    const cur = this.cursors;
    const moving = cur.left.isDown || cur.right.isDown || cur.up.isDown || cur.down.isDown || k.W.isDown || k.A.isDown || k.S.isDown || k.D.isDown;
    if (moving) h.eyes.setX(h.x + Math.sin(now / 40) * 1.5);
    const dist = Phaser.Math.Distance.Between(spr.x, spr.y, h.x, h.y);
    h.meter = detectionStep(h.meter, { moving, dist, sameRoom: this.roomAt(spr.x, spr.y) === h.room, dtMs: delta });
    h.bar[1].setDisplaySize(Math.max(0.01, (h.meter / 100) * 22), 3).setTint(h.meter > 66 ? 0xff4a3a : 0xffd23a);
    if (isFound(h.meter)) {
      this.popWord('am:gotcha', h.x, h.y - 30, 900);
      shake(0.01, 250);
      this.amShowBubble(ch.e.member.id, ch.hooks.shout('lost'), true, 1800);
      this.tweens.killTweensOf(spr);
      this.amUnhide(false);
      return this.amChaseOver(true);
    }
    if (searchOver(h.ms)) {
      this.tweens.killTweensOf(spr);
      return this.amChaseOver(false);
    }
  }

  private amChaseOver(caught: boolean) {
    const ch = this.amChase;
    if (!ch || ch.done) return;
    const hooks = ch.hooks;
    this.amShowBubble(ch.e.member.id, null, false, 0);
    if (caught) {
      const spr = ch.e.actor.sprite;
      this.popWord('am:gotcha', spr.x, spr.y - 34, 900);
      this.player.setVelocity(0, 0);
    }
    this.amEndChase();
    this.lock('slide', false);
    this.lock('hide', false);
    if (caught) {
      this.lock('angry', true);
      hooks.caught();
    } else {
      this.amCalm(ch.e.member.id);
      hooks.escaped();
    }
  }

  // ---------------------------------------------------------------- escort & lecture

  /** Walk side by side to the sofa (no grabbing — she just walks you there). */
  private amDoEscort(id: string, done: () => void) {
    const e = this.fam.get(id);
    if (!e) return done();
    this.lock('angry', true);
    this.amEndChase();
    this.amEscort = { e };
    this.player.body.enable = false;
    this.walkActor(e, { x: SOFA_SEAT.x - 18, y: SOFA_SEAT.y - 2 }, () => {
      this.amEscort = undefined;
      done();
    }, 80);
  }

  private amLectureOn(id: string) {
    const e = this.fam.get(id);
    if (!e) return;
    const pl = this.player;
    this.amLecture = { objs: [], timers: [], from: { x: SOFA_SEAT.x, y: b(14) - 2 } };
    const L = this.amLecture;
    pl.body.enable = false;
    pl.setPosition(SOFA_SEAT.x, SOFA_SEAT.y);
    this.playerShadow.setVisible(false);
    this.facing = 'left';
    const spr = e.actor.sprite;
    this.face(spr, pl.x, pl.y);
    // the wall clock spins (time-lapse)
    for (const [len, ms] of [[1, 260], [0.7, 1800]] as const) {
      const hand = this.add.image(c(12), b(9) - 12, 'am:hand').setOrigin(0.5, 1).setScale(1, len).setDepth(b(9) + 5);
      this.tweens.add({ targets: hand, angle: 360, duration: ms, repeat: -1 });
      L.objs.push(hand);
    }
    // she talks… and talks… (bobbing)
    this.tweens.add({ targets: spr, scaleY: this.amScale * 1.06, duration: 160, yoyo: true, repeat: -1 });
    // the soul leaves the body… and gets yanked back
    const soulKey = soulTexture(this, 'char:player');
    L.timers.push(
      this.time.addEvent({
        delay: 2600,
        loop: true,
        startAt: 1600,
        callback: () => {
          const soul = this.add.image(pl.x, pl.y, soulKey).setOrigin(0.5, 1).setDepth(16000).setAlpha(0.75);
          L.objs.push(soul);
          this.tweens.add({ targets: soul, y: pl.y - 26, angle: 8, duration: 1100, ease: 'Sine.easeOut', onComplete: () => this.tweens.add({ targets: soul, y: pl.y, angle: 0, duration: 140, ease: 'Back.easeIn', onComplete: () => soul.destroy() }) });
        },
      }),
    );
    L.timers.push(this.time.addEvent({ delay: 1500, loop: true, callback: () => this.rise('am:zzz', pl.x + 6, pl.y - 26) }));
    // the grandparent nods along; the sibling smirks from the doorway
    for (const f of this.fam.values()) {
      if (f.member.id === id || !f.actor.sprite.active) continue;
      if (f.member.role === 'grandparent') {
        L.grand = f;
        this.take(f);
        this.face(f.actor.sprite, spr.x, spr.y);
        this.tweens.add({ targets: f.actor.sprite, y: f.actor.sprite.y + 1, duration: 300, yoyo: true, repeat: -1 });
        L.timers.push(this.time.addEvent({ delay: 2200, loop: true, callback: () => this.popWord('am:nod', f.actor.sprite.x, f.actor.sprite.y - 28, 900) }));
      } else if ((f.member.role === 'younger-sibling' || f.member.role === 'older-sibling') && !L.sib) {
        L.sib = f;
        this.walkActor(f, { x: 216, y: 176 }, () => {
          this.face(f.actor.sprite, pl.x, pl.y);
          L.timers.push(this.time.addEvent({ delay: 1900, loop: true, callback: () => this.popWord('am:smirk', f.actor.sprite.x, f.actor.sprite.y - 28, 900) }));
        }, 90);
      }
    }
  }

  private amLectureOff() {
    const L = this.amLecture;
    if (!L) return;
    this.amLecture = undefined;
    L.timers.forEach((t) => t.remove());
    L.objs.forEach((o) => o.active && o.destroy());
    if (this.amE) {
      const spr = this.amE.actor.sprite;
      this.tweens.killTweensOf(spr);
      spr.setScale(this.amScale);
    }
    if (L.grand) {
      this.tweens.killTweensOf(L.grand.actor.sprite);
      this.release(L.grand);
    }
    if (L.sib && this.fam.get(L.sib.member.id) === L.sib) this.returning.push({ e: L.sib, home: { ...this.placeFor(L.sib.member, (L.sib.spot === 'away' ? 'living' : L.sib.spot) as Exclude<HomeSpot, 'away'>, 0) }, free: 0 });
    this.player.body.enable = true;
    this.player.body.reset(L.from.x, L.from.y);
    this.playerShadow.setVisible(true);
  }

  private amApproach(id: string, done: () => void) {
    const e = this.fam.get(id);
    if (!e) return done();
    const spr = e.actor.sprite;
    const home = { x: spr.x, y: spr.y };
    this.lock('angry-approach', true);
    const snack = angryPhase(store) === 'cool' ? this.add.image(spr.x, spr.y - 14, 'am:snack').setDepth(16000) : undefined;
    this.walkActor(e, this.besidePlayer(spr), () => {
      this.face(spr, this.player.x, this.player.y);
      this.facing = this.dirOf(spr.x - this.player.x, spr.y - this.player.y);
      this.lock('angry-approach', false);
      if (snack) this.time.delayedCall(1500, () => snack.destroy());
      this.returning.push({ e, home, free: 0 });
      done();
    }, 85);
    if (snack) this.amFollow.push({ img: snack, spr, dy: -14 });
  }
  private amFollow: { img: Phaser.GameObjects.Image; spr: Phaser.GameObjects.Sprite; dy: number }[] = [];

  /** Per-frame: aura/steam/bubbles follow, call timer, chase, phone attempts, angry logic tick. */
  private angryFrame(delta: number) {
    const now = this.time.now;
    angryTick(store, delta);
    const e = this.amE;
    if (e?.actor.sprite.active) {
      const spr = e.actor.sprite;
      if (this.amAura?.active) {
        this.amAura.setPosition(spr.x + Phaser.Math.FloatBetween(-0.6, 0.6), spr.y + 4).setDepth(spr.depth - 0.5);
        if (Math.floor(now / 90) % 2 !== Number(this.amAura.texture.key.endsWith('1'))) {
          this.amAura.setTexture(`am:aura${Math.floor(now / 90) % 2}`);
          this.amAura.setAlpha(Math.min(this.amAura.alpha, 1) > 0.1 ? 0.7 + Math.random() * 0.3 : this.amAura.alpha);
        }
      }
      if (this.amSteamEvery && now - this.amSteamAt > this.amSteamEvery) {
        this.amSteamAt = now;
        this.amSteamPuff(spr);
      }
      if (this.amEscort && this.player.active) {
        // walking side by side
        const es = this.amEscort.e.actor.sprite;
        this.player.setPosition(es.x - 13, es.y);
        this.playerShadow.setPosition(this.player.x, this.player.y);
        const p = this.puppets.get(es);
        this.puppets.set(this.player, { dir: p?.dir ?? 'down', walk: !!p?.walk });
      } else this.puppets.delete(this.player);
    }
    this.amFollow = this.amFollow.filter((f) => f.img.active && (f.img.setPosition(f.spr.x, f.spr.y + f.dy).setDepth(f.spr.depth + 1), true));
    if (this.amBubble) {
      const f = this.fam.get(this.amBubble.id);
      if (!f || now > this.amBubble.until) {
        this.amBubble.img.destroy();
        this.amBubble = undefined;
      } else this.amBubble.img.setPosition(f.actor.sprite.x - 4, f.actor.sprite.y - 25 * (f === this.amE ? this.amScale : 1) - 2);
    }
    // parent's call: a shrinking timer bar over the player
    const call = callInfo(store);
    if (call && this.player.active) {
      if (!this.amCallBar) this.amCallBar = [this.add.image(0, 0, 'am:px').setDepth(16000).setTint(0x222233), this.add.image(0, 0, 'am:px').setOrigin(0, 0.5).setDepth(16001)];
      const [bg, fg] = this.amCallBar;
      bg.setPosition(this.player.x, this.player.y - 30).setDisplaySize(20, 3);
      fg.setPosition(this.player.x - 10, this.player.y - 30).setDisplaySize(Math.max(0.01, (call.leftMs / call.windowMs) * 20), 3).setTint(call.level === 2 ? 0xff4a3a : 0x5ad1ff);
      if (call.level === 2 && Math.floor(now / 300) % 2) bg.setTint(0xff4a3a);
      else bg.setTint(0x222233);
    } else if (this.amCallBar) {
      this.amCallBar.forEach((o) => o.destroy());
      this.amCallBar = undefined;
    }
    this.amChaseFrame(delta);
    // trying to use a confiscated phone
    const m = store.ui.modal;
    const phoneOpen = m?.type === 'phone' || m?.type === 'reels';
    if (phoneOpen && !this.amPhoneSeen && phoneLock(store.state).locked) {
      this.amPhoneSeen = true;
      if (counter(store, 'phone') >= 1) store.openModal(null); // second try: she's had enough
      bannedAttempt(store, 'phone');
    } else if (!phoneOpen) this.amPhoneSeen = false;
  }

  private placeFor(m: FamilyMember, spot: Exclude<HomeSpot, 'away'>, index: number): Place {
    const list = AREAS[spot];
    const i = spot === 'dining' ? index : (ROLE_SLOT[m.role] ?? index);
    return list[i % list.length];
  }

  /** Spawn, move or remove family members according to scheduleFor(role, clock). */
  private syncFamily(instant: boolean) {
    const s = store.state;
    const others = s.profile.members.filter((m) => m.role !== 'player');
    others.forEach((m, index) => {
      const sch = scheduleFor(m.role, s.clock.minutes);
      const e = this.fam.get(m.id);
      if (sch.spot === 'away') {
        if (e) this.despawn(e);
        return;
      }
      const place = this.placeFor(m, sch.spot, index);
      if (!e) {
        this.spawnMember(m, place, sch.spot, sch.activity, instant);
        return;
      }
      e.activity = sch.activity;
      if (this.controlled.has(m.id)) return; // walking over / fighting / sent to their room
      if (e.spot !== sch.spot) {
        e.spot = sch.spot;
        this.relocate(e, place);
      }
    });
  }

  private spawnMember(m: FamilyMember, place: Place, spot: HomeSpot, activity: string, instant: boolean) {
    const start = instant ? place : FRONT_DOOR;
    const actor = this.npc({ id: m.id, texture: `char:${m.id}`, x: start.x, y: start.y, wander: place.wander, facing: place.facing ?? 'down' }) as ActorLike | undefined;
    if (!actor) return;
    const entry: FamEntry = { member: m, actor, spot, activity };
    this.fam.set(m.id, entry);
    const it = this.interactables.find((x) => x.id === `npc:${m.id}`);
    if (it) {
      it.label = () => {
        const act = this.fam.get(m.id)?.activity;
        return `Talk to ${m.name}${act ? ` · ${act}` : ''}`;
      };
    }
    if (this.player && actor.body) entry.collider = this.physics.add.collider(this.player, actor.body);
    if (instant) return;
    // came home: fade in at the front door, then walk (or step) to their spot
    const shadow = actor.sprite.getData('shadow') as Phaser.GameObjects.Image | undefined;
    actor.sprite.setAlpha(0);
    shadow?.setAlpha(0);
    this.tweens.add({ targets: shadow ? [actor.sprite, shadow] : [actor.sprite], alpha: 1, duration: 500 });
    store.toast(`${m.name} is home!`, 'info');
    if (place.y >= 10 * T) {
      actor.spec.wander = place.wander ?? { x: place.x, y: place.y, w: 0, h: 0 };
      actor.target = new Phaser.Math.Vector2(place.x, place.y);
    } else {
      this.time.delayedCall(1200, () => {
        if (this.fam.get(m.id) === entry) this.relocate(entry, place);
      });
    }
  }

  /** Move to another room: quick fade out, reposition, fade in (no walking through walls). */
  private relocate(e: FamEntry, place: Place) {
    const a = e.actor;
    const shadow = a.sprite.getData('shadow') as Phaser.GameObjects.Image | undefined;
    const targets = shadow ? [a.sprite, shadow] : [a.sprite];
    this.tweens.add({
      targets,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        if (!a.sprite.active) return;
        a.sprite.setPosition(place.x, place.y);
        shadow?.setPosition(place.x, place.y);
        a.spec.wander = place.wander ?? { x: place.x, y: place.y, w: 0, h: 0 };
        a.target = undefined;
        a.pause = 1500;
        a.dir = place.facing ?? 'down';
        this.tweens.add({ targets, alpha: 1, duration: 300 });
      },
    });
  }

  private despawn(e: FamEntry) {
    this.fam.delete(e.member.id);
    const a = e.actor;
    this.npcs = this.npcs.filter((n) => n.sprite !== a.sprite);
    this.interactables = this.interactables.filter((x) => x.id !== `npc:${e.member.id}`);
    e.collider?.destroy();
    a.body?.destroy();
    const shadow = a.sprite.getData('shadow') as Phaser.GameObjects.Image | undefined;
    this.tweens.add({
      targets: shadow ? [a.sprite, shadow] : [a.sprite],
      alpha: 0,
      duration: 400,
      onComplete: () => {
        a.sprite.destroy();
        shadow?.destroy();
      },
    });
  }
}
