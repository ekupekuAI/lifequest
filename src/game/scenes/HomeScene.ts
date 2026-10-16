import Phaser from 'phaser';
import { WorldScene, T, type NpcSpec, type WorldConfig } from './WorldScene';
import { store } from '../../core/store';
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
const ROLE_SLOT: Partial<Record<Role, number>> = { mother: 0, father: 0, guardian: 1, 'older-sibling': 1, 'younger-sibling': 2, grandparent: 0 };

export class HomeScene extends WorldScene {
  private fam = new Map<string, FamEntry>();
  private famTimer = 0;

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
    this.interact({ id: 'sofa', x: 11 * T, y: b(13) - 6, label: 'Sofa', flavor: 'A comfy sofa. The TV can wait until your tasks are done.' });
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
    this.famTimer += delta;
    if (this.famTimer < 2000 || store.blocking) return;
    this.famTimer = 0;
    this.syncFamily(false);
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
