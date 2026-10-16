import type { ItemDef } from './types';

export const ITEMS: Record<string, ItemDef> = {
  // groceries
  'milk-packet': { id: 'milk-packet', name: 'Milk packet (500ml)', weight: 1, category: 'grocery' },
  'milk-tetra': { id: 'milk-tetra', name: 'Toned milk tetra pack', weight: 1, category: 'grocery' },
  'milk-flavoured': { id: 'milk-flavoured', name: 'Chocolate milkshake', weight: 1, category: 'grocery' },
  tomato: { id: 'tomato', name: 'Tomato', weight: 0.5, category: 'grocery' },
  'cherry-tomato': { id: 'cherry-tomato', name: 'Cherry tomatoes (box)', weight: 0.5, category: 'grocery' },
  potatoes: { id: 'potatoes', name: 'Potatoes (1kg bag)', weight: 2, category: 'grocery' },
  'baby-potatoes': { id: 'baby-potatoes', name: 'Premium baby potatoes', weight: 1.5, category: 'grocery' },
  chocolate: { id: 'chocolate', name: 'Chocolate bar', weight: 0.3, category: 'grocery' },
  chips: { id: 'chips', name: 'Masala chips', weight: 0.3, category: 'grocery' },
  'cold-drink': { id: 'cold-drink', name: 'Cold drink', weight: 1, category: 'grocery' },
  bread: { id: 'bread', name: 'Bread loaf', weight: 0.8, category: 'grocery' },
  // gear
  'cloth-bag': { id: 'cloth-bag', name: 'Cloth shopping bag', weight: 0, category: 'gear' },
  umbrella: { id: 'umbrella', name: 'Umbrella', weight: 0.5, category: 'gear' },
  'paper-bag': { id: 'paper-bag', name: 'Paper bag', weight: 0, category: 'gear' },
  'health-card': { id: 'health-card', name: "Grandparent's health card", weight: 0, category: 'gear' },
  'appointment-slip': { id: 'appointment-slip', name: 'Appointment slip', weight: 0, category: 'gear' },
  // chores (held in hands)
  shirt: { id: 'shirt', name: 'Dirty shirt', weight: 0, category: 'chore' },
  socks: { id: 'socks', name: 'Smelly socks', weight: 0, category: 'chore' },
  book: { id: 'book', name: 'Textbook', weight: 0, category: 'chore' },
  wrapper: { id: 'wrapper', name: 'Snack wrapper', weight: 0, category: 'chore' },
  paper: { id: 'paper', name: 'Crumpled paper', weight: 0, category: 'chore' },
  'toy-car': { id: 'toy-car', name: 'Toy car', weight: 0, category: 'chore' },
  mug: { id: 'mug', name: 'Dirty mug', weight: 0, category: 'chore' },
  // school
  'geometry-box': { id: 'geometry-box', name: 'Geometry box', weight: 0, category: 'school' },
  crayons: { id: 'crayons', name: 'Crayons', weight: 0, category: 'school' },
  'water-bottle': { id: 'water-bottle', name: 'Water bottle (filled)', weight: 0, category: 'school' },
  'empty-bottle': { id: 'empty-bottle', name: 'Water bottle (empty)', weight: 0, category: 'school' },
  'sports-shoes': { id: 'sports-shoes', name: 'Sports shoes', weight: 0, category: 'school' },
  comic: { id: 'comic', name: 'Comic book', weight: 0, category: 'school' },
};

export function itemName(id: string): string {
  return ITEMS[id]?.name ?? id;
}

export interface ShopProduct {
  item: string;
  price: number;
  stockKey?: string; // world flag holding stock count
  tag?: string;
}

export interface Shelf {
  id: string;
  label: string;
  products: ShopProduct[];
}

/** FreshMart grocery store shelves. Stock for some products is kept in world flags. */
export const GROCERY_SHELVES: Shelf[] = [
  {
    id: 'shelf-dairy',
    label: 'Dairy fridge',
    products: [
      { item: 'milk-packet', price: 30, stockKey: 'stock.grocery.milk-packet' },
      { item: 'milk-tetra', price: 38, tag: 'Lasts longer' },
      { item: 'milk-flavoured', price: 45, tag: 'New!' },
    ],
  },
  {
    id: 'shelf-veg',
    label: 'Fresh vegetables',
    products: [
      { item: 'tomato', price: 12, tag: 'per piece' },
      { item: 'cherry-tomato', price: 40, tag: 'Imported' },
      { item: 'potatoes', price: 45 },
      { item: 'baby-potatoes', price: 80, tag: 'Premium' },
    ],
  },
  {
    id: 'shelf-snacks',
    label: 'Snacks & drinks',
    products: [
      { item: 'chocolate', price: 20, tag: 'Offer!' },
      { item: 'chips', price: 25 },
      { item: 'cold-drink', price: 40 },
    ],
  },
  {
    id: 'shelf-bakery',
    label: 'Bakery',
    products: [{ item: 'bread', price: 35 }],
  },
];

/** Sharma General Store kiosk: different prices, no queue. */
export const KIOSK_SHELF: Shelf = {
  id: 'kiosk',
  label: 'Sharma General Store',
  products: [
    { item: 'milk-packet', price: 32, stockKey: 'stock.kiosk.milk-packet' },
    { item: 'bread', price: 38 },
    { item: 'chips', price: 25 },
    { item: 'chocolate', price: 22 },
    { item: 'tomato', price: 15, tag: 'per piece' },
  ],
};

export function findProduct(shelfId: string, item: string): ShopProduct | undefined {
  const shelf = shelfId === 'kiosk' ? KIOSK_SHELF : GROCERY_SHELVES.find((s) => s.id === shelfId);
  return shelf?.products.find((p) => p.item === item);
}

export function groceryPrice(item: string): number | undefined {
  for (const s of GROCERY_SHELVES) {
    const p = s.products.find((x) => x.item === item);
    if (p) return p.price;
  }
  return undefined;
}

export function formatMoney(n: number): string {
  return `₹${Math.round(n)}`;
}
