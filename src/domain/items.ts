import type { ItemDef } from './types';
import { formatMoneyIn } from './region';

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
  chips: { id: 'chips', name: 'Chips', weight: 0.3, category: 'grocery' },
  'milk-tetra-old': { id: 'milk-tetra-old', name: 'Toned milk tetra (expires today)', weight: 1, category: 'grocery' },
  carrot: { id: 'carrot', name: 'Carrots', weight: 0.5, category: 'grocery' },
  onion: { id: 'onion', name: 'Onion', weight: 0.3, category: 'grocery' },
  'chopped-veg': { id: 'chopped-veg', name: 'Chopped vegetables', weight: 0, category: 'chore' },
  'soup-bowl': { id: 'soup-bowl', name: 'Bowl of soup', weight: 0, category: 'chore' },
  plates: { id: 'plates', name: 'Plates & spoons', weight: 0, category: 'chore' },
  'cooking-pot': { id: 'cooking-pot', name: 'Cooking pot', weight: 0, category: 'chore' },
  'cold-drink': { id: 'cold-drink', name: 'Cold drink', weight: 1, category: 'grocery' },
  bread: { id: 'bread', name: 'Bread loaf', weight: 0.8, category: 'grocery' },
  popcorn: { id: 'popcorn', name: 'Popcorn (small)', weight: 0.3, category: 'grocery' },
  'juice-box': { id: 'juice-box', name: 'Mango juice box', weight: 0.3, category: 'grocery' },
  'peanut-choc': { id: 'peanut-choc', name: 'Peanut crunch chocolate', weight: 0.3, category: 'grocery' },
  banana: { id: 'banana', name: 'Banana', weight: 0.2, category: 'grocery' },
  mango: { id: 'mango', name: 'Mango', weight: 0.3, category: 'grocery' },
  apple: { id: 'apple', name: 'Apple', weight: 0.2, category: 'grocery' },
  // gear
  'cloth-bag': { id: 'cloth-bag', name: 'Cloth shopping bag', weight: 0, category: 'gear' },
  umbrella: { id: 'umbrella', name: 'Umbrella', weight: 0.5, category: 'gear' },
  'paper-bag': { id: 'paper-bag', name: 'Paper bag', weight: 0, category: 'gear' },
  'house-keys': { id: 'house-keys', name: 'House keys', weight: 0, category: 'gear' },
  'bus-ticket': { id: 'bus-ticket', name: 'Bus ticket (Route 12)', weight: 0, category: 'gear' },
  'library-book': { id: 'library-book', name: 'Library book (due today)', weight: 0.5, category: 'gear' },
  letter: { id: 'letter', name: 'Letter to post', weight: 0, category: 'gear' },
  parcel: { id: 'parcel', name: 'Parcel', weight: 1, category: 'gear' },
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
  'white-shirt': { id: 'white-shirt', name: 'White clothes', weight: 0, category: 'chore' },
  'pink-shirt': { id: 'pink-shirt', name: 'Pink-stained shirt', weight: 0, category: 'chore' },
  'red-sock': { id: 'red-sock', name: 'Red sock', weight: 0, category: 'chore' },
  'clothes-pile': { id: 'clothes-pile', name: 'Coloured clothes', weight: 0, category: 'chore' },
  detergent: { id: 'detergent', name: 'Detergent', weight: 0, category: 'chore' },
};

export function itemName(id: string): string {
  return ITEMS[id]?.name ?? id;
}

export interface ShopProduct {
  item: string;
  price: number;
  stockKey?: string; // world flag holding stock count
  tag?: string;
  /** multi-buy offer */
  deal?: '3for2';
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
      { item: 'milk-tetra-old', price: 26, tag: 'Expires today · 30% off' },
      { item: 'milk-flavoured', price: 45, tag: 'New!' },
    ],
  },
  {
    id: 'shelf-veg',
    label: 'Fresh vegetables',
    products: [
      { item: 'tomato', price: 12, tag: 'each' },
      { item: 'carrot', price: 20, tag: '500 g' },
      { item: 'onion', price: 8, tag: 'each' },
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
      { item: 'chips', price: 25, deal: '3for2', tag: '3 for 2!' },
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
    { item: 'popcorn', price: 15 },
    { item: 'juice-box', price: 15 },
    { item: 'peanut-choc', price: 20, tag: 'Extra peanutty!' },
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

/** Format an amount already in the current region's currency. */
export function formatMoney(n: number): string {
  return formatMoneyIn(n);
}

/**
 * The vegetable & fruit market cart in town. Sold by weight: `basePerKg` is the vendor's opening ask
 * (base currency) and `perKg` how many inventory pieces make up a kilo (item ids match FreshMart's, so
 * any list that needs tomatoes or potatoes accepts the cart's too).
 */
export interface MarketGood {
  item: string;
  label: string;
  basePerKg: number;
  perKg: number;
  /** smallest amount the vendor weighs out, in kg */
  minQty: number;
  kind: 'veg' | 'fruit';
}

export const MARKET_GOODS: MarketGood[] = [
  { item: 'tomato', label: 'Tomatoes', basePerKg: 45, perKg: 6, minQty: 0.5, kind: 'veg' },
  { item: 'onion', label: 'Onions', basePerKg: 40, perKg: 6, minQty: 0.5, kind: 'veg' },
  { item: 'potatoes', label: 'Potatoes', basePerKg: 30, perKg: 1, minQty: 1, kind: 'veg' },
  { item: 'carrot', label: 'Carrots', basePerKg: 36, perKg: 2, minQty: 0.5, kind: 'veg' },
  { item: 'banana', label: 'Bananas', basePerKg: 50, perKg: 6, minQty: 0.5, kind: 'fruit' },
  { item: 'mango', label: 'Mangoes', basePerKg: 120, perKg: 4, minQty: 0.5, kind: 'fruit' },
  { item: 'apple', label: 'Apples', basePerKg: 160, perKg: 6, minQty: 0.5, kind: 'fruit' },
];

export function marketGood(item: string): MarketGood | undefined {
  return MARKET_GOODS.find((g) => g.item === item);
}

/** Base-currency price of one piece of `item` at FreshMart / the kiosk (undefined when not sold there). */
export function shopUnitPrice(shop: 'grocery' | 'kiosk', item: string): number | undefined {
  if (shop === 'grocery') return groceryPrice(item);
  return KIOSK_SHELF.products.find((p) => p.item === item)?.price;
}
