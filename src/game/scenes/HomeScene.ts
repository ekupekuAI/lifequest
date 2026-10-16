import { WorldScene, T, type WorldConfig } from './WorldScene';
import { store } from '../../core/store';
import { ROOM_OBJECTS, SCHOOL_SPOTS } from '../../domain/homeLayout';
import { itemName } from '../../domain/items';
import type { GameState, Role } from '../../domain/types';

const c = (col: number) => col * T + T / 2; // tile centre x
const b = (row: number) => (row + 1) * T; // tile bottom y

const roomOf = (s: GameState, id: string) => String(s.world[`room.${id}`] ?? 'floor');
const run = (s: GameState, id: string) => s.run?.missionId === id;

export class HomeScene extends WorldScene {
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

    // ---- bedroom ----
    this.prop({ key: (st) => (st.world['room.bed'] === 'made' ? 'bed-made' : 'bed'), x: c(1), y: b(3), solid: 28 });
    this.interact({ id: 'bed', x: c(1) + 6, y: b(3) - 10, label: (st) => (run(st, 'clean-room') && st.world['room.bed'] !== 'made' ? 'Make the bed' : 'Your bed'), r: 18 });
    this.prop({ key: 'desk', x: 4 * T, y: b(2), solid: 12 });
    this.interact({ id: 'desk', x: 4 * T, y: b(2) + 2, label: 'Study desk', flavor: 'Your study desk. A half-finished drawing and a maths book.' });
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
    this.prop({ key: 'washer', x: c(13), y: b(2), solid: 10 });
    this.interact({ id: 'washer', x: c(13), y: b(2) + 2, label: 'Washing machine', flavor: 'The washing machine. Laundry day is another lesson!' });
    this.prop({ key: 'toilet', x: c(14), y: b(3), solid: 8 });

    // ---- kitchen ----
    this.prop({ key: 'fridge', x: c(16), y: b(2), solid: 12 });
    this.interact({ id: 'fridge', x: c(16), y: b(2) + 2, label: 'Fridge (snack +energy)' });
    this.prop({ key: 'stove', x: c(18), y: b(2), solid: 12 });
    this.prop({ key: 'counter', x: c(17), y: b(2), solid: 12 });
    this.prop({ key: 'counter', x: c(19), y: b(2), solid: 12 });
    this.prop({ key: 'sink', x: c(20), y: b(2), solid: 12 });
    this.interact({ id: 'sink', x: c(20), y: b(2) + 2, label: (st) => (st.hands.includes('mug') ? 'Put the mug in the sink' : st.hands.includes('empty-bottle') ? 'Fill the water bottle' : 'Kitchen sink'), flavor: 'A clean kitchen sink.' });
    for (const col of [21, 22, 23, 24]) this.prop({ key: 'counter', x: c(col), y: b(2), solid: 12 });
    this.prop({ key: 'dining-table', x: 20 * T, y: b(6), solid: { w: 30, h: 18 } });
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

    // ---- family ----
    const spots: Partial<Record<Role, { x: number; y: number; wander?: { x: number; y: number; w: number; h: number } }>> = {
      mother: { x: c(19), y: b(4), wander: { x: 17 * T, y: 4 * T, w: 6 * T, h: 2 * T } },
      father: { x: c(17), y: b(12), wander: { x: 15 * T, y: 11 * T, w: 7 * T, h: 3 * T } },
      'older-sibling': { x: c(6), y: b(12), wander: { x: 3 * T, y: 11 * T, w: 4 * T, h: 3 * T } },
      'younger-sibling': { x: c(6), y: b(5), wander: { x: 4 * T, y: 4 * T, w: 4 * T, h: 3 * T } },
      grandparent: { x: 9 * T, y: b(13) },
      guardian: { x: c(21), y: b(5), wander: { x: 17 * T, y: 4 * T, w: 6 * T, h: 2 * T } },
    };
    for (const m of s.profile.members) {
      if (m.role === 'player') continue;
      const sp = spots[m.role];
      if (!sp) continue;
      this.npc({ id: m.id, texture: `char:${m.id}`, x: sp.x, y: sp.y, wander: sp.wander, facing: 'down' });
    }
  }
}
