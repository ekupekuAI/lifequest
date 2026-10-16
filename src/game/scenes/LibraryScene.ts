// City Library interior: shelves, reading table and the librarian's desk.
import { WorldScene, T, type WorldConfig } from './WorldScene';
import { store } from '../../core/store';
import { installTownHandlers } from '../bus';

const c = (col: number) => col * T + T / 2;
const b = (row: number) => (row + 1) * T;
const MID = 9 * T;

export class LibraryScene extends WorldScene {
  constructor() {
    super('Library');
  }

  buildConfig(): WorldConfig {
    return {
      location: 'library',
      rows: [
        '##################',
        '##################',
        '#wwwwwwwwwwwwwwww#',
        '#wwwwwwwwwwwwwwww#',
        '#wwwwwwwwwwwwwwww#',
        '#wwwwwwwwwwwwwwww#',
        '#wwwwwwrrrrwwwwww#',
        '#wwwwwwrrrrwwwwww#',
        '#wwwwwwrrrrwwwwww#',
        '#wwwwwwwwwwwwwwww#',
        '#wwwwwwwwwwwwwwww#',
        '########DD########',
      ],
      legend: { '#': 'wall', w: 'wood', r: 'rug', D: 'doormat' },
      spawns: { default: { x: MID, y: b(10) - 2, facing: 'up' }, entrance: { x: MID, y: b(10) - 2, facing: 'up' } },
    };
  }

  populate() {
    // wall decor
    this.prop({ key: 'wall-clock', x: MID, y: b(1) - 4, wall: true });
    this.prop({ key: 'notice-board', x: c(4), y: b(1), wall: true });
    this.interact({
      id: 'library-notice',
      x: c(4),
      y: b(1) + 8,
      label: 'Read the notice board',
      flavor: `CITY LIBRARY · Open ${store.hoursLabel('library')}\n• Books are lent for 14 days\n• Late returns: a small fine per day\n• After hours, use the return box outside\n• Quiet, please!`,
    });
    this.prop({ key: 'window', x: c(13), y: b(1) - 2, wall: true });
    this.prop({ key: 'picture', x: c(15), y: b(1) - 2, wall: true });

    // librarian's desk
    this.prop({ key: 'library-desk', x: MID, y: b(3), solid: 14 });
    this.npc({ id: 'librarian', texture: 'char:npc:librarian', x: MID, y: b(2) + 2, talk: 'library-desk', label: 'Talk to the librarian', solid: false });
    this.interact({ id: 'library-desk', x: MID, y: b(3) + 6, r: 26, label: 'Library desk (returns)' });
    const slot = this.prop({ key: 'mailbox', x: MID + 36, y: b(3), solid: { w: 6, h: 4 } });
    slot.setTint(0x6fa8dc);
    this.interact({ id: 'returns-slot', x: MID + 36, y: b(3) + 2, label: 'Returns slot', flavor: 'RETURNS — please hand books to the librarian while we are open, so you get a return slip.' });

    // shelves
    const shelfFlavors = [
      'Adventure stories, mysteries and a whole row of comics.',
      'Science books: space, dinosaurs, and how bridges are built.',
      'Cookbooks! "Easy dinners for busy families" looks useful.',
      'Atlases and travel guides. One has a map of every bus route in the city.',
    ];
    const shelves: [number, number][] = [
      [c(2), b(5)],
      [c(4), b(5)],
      [c(13), b(5)],
      [c(15), b(5)],
      [c(2), b(8)],
      [c(4), b(8)],
      [c(13), b(8)],
      [c(15), b(8)],
    ];
    shelves.forEach(([x, y], i) => {
      this.prop({ key: 'library-shelf', x, y, solid: { w: 30, h: 12 } });
      if (i % 2 === 0) this.interact({ id: `lib-shelf-${i}`, x: x + 16, y: y + 4, label: 'Browse the shelf', flavor: shelfFlavors[(i / 2) % shelfFlavors.length] });
    });

    // reading table
    this.prop({ key: 'dining-table', x: MID, y: b(8), solid: 12 });
    this.prop({ key: 'chair', x: MID - 26, y: b(8) - 2, solid: 6 });
    this.prop({ key: 'chair', x: MID + 26, y: b(8) - 2, solid: 6 });
    this.interact({ id: 'reading-table', x: MID, y: b(8) + 4, label: 'Reading table', flavor: 'Someone left a newspaper open: "Route 12 adds evening buses — every 20 minutes until 10 PM."' });
    this.prop({ key: 'plant', x: c(1), y: b(10), solid: 6 });
    this.prop({ key: 'plant', x: c(16), y: b(10), solid: 6 });
    this.prop({ key: 'lamp', x: c(16), y: b(3), solid: 6 });

    this.door({ x: MID, y: 11 * T + 10, w: 30, h: 8, to: 'city', spawn: 'library-door' });
  }

  protected afterCreate() {
    this.unsub.push(installTownHandlers(store));
  }
}
