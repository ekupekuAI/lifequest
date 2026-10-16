// Positions (in tiles) of mission objects inside the family home. Shared by the
// Phaser HomeScene (rendering) and mission logic (validation).

export interface RoomObject {
  id: string;
  item: string;
  dest: 'laundry' | 'bookshelf' | 'bin' | 'toybox' | 'sink';
  col: number;
  row: number;
}

export const ROOM_OBJECTS: RoomObject[] = [
  { id: 'shirt1', item: 'shirt', dest: 'laundry', col: 2, row: 4 },
  { id: 'shirt2', item: 'shirt', dest: 'laundry', col: 6, row: 7 },
  { id: 'socks', item: 'socks', dest: 'laundry', col: 8, row: 5 },
  { id: 'book1', item: 'book', dest: 'bookshelf', col: 3, row: 6 },
  { id: 'book2', item: 'book', dest: 'bookshelf', col: 7, row: 4 },
  { id: 'wrapper', item: 'wrapper', dest: 'bin', col: 5, row: 4 },
  { id: 'paper', item: 'paper', dest: 'bin', col: 1, row: 5 },
  { id: 'toycar', item: 'toy-car', dest: 'toybox', col: 4, row: 7 },
  { id: 'mug', item: 'mug', dest: 'sink', col: 2, row: 3 },
];

export const DEST_LABELS: Record<RoomObject['dest'], string> = {
  laundry: 'laundry basket',
  bookshelf: 'bookshelf',
  bin: 'dustbin',
  toybox: 'toy box',
  sink: 'kitchen sink',
};

export interface FindSpot {
  id: string; // interact target: find:<item>
  item: string;
  col: number;
  row: number;
  label: string;
}

export const SCHOOL_SPOTS: FindSpot[] = [
  { id: 'find:geometry-box', item: 'geometry-box', col: 9, row: 4, label: 'Something under the bed' },
  { id: 'find:crayons', item: 'crayons', col: 2, row: 10, label: 'Living room cabinet' },
  { id: 'find:empty-bottle', item: 'empty-bottle', col: 22, row: 3, label: 'Kitchen counter' },
  { id: 'find:sports-shoes', item: 'sports-shoes', col: 14, row: 14, label: 'Shoe rack' },
];

export const SCHOOL_REQUIRED = ['geometry-box', 'crayons', 'water-bottle', 'sports-shoes'];
