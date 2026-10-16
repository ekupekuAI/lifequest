// Custom real-life missions: a parent types the family's actual errand ("Bread ×1, Eggs ×6,
// Bananas ×4, ₹150, back in an hour") and the child plays it in the game world like the Grocery Run.
//
// Each typed item maps to the closest existing game item through a synonym table; anything the game
// does not sell yet becomes a generic "family list" product (id `fam-<slug>`) with a sensible price.
// Those products are added at runtime — idempotently — to FreshMart's bakery shelf (relabelled
// "Bakery & Family list") or to the corner-shop kiosk, so the normal shelf, basket, checkout and
// receipt paths sell them without any store/UI changes.
import type { Assignment, CustomMissionSpec, CustomStore, GameState, ItemDef } from '../domain/types';
import { GUARDIAN_ROLES } from '../domain/types';
import * as ItemsModule from '../domain/items';
import { GROCERY_SHELVES, ITEMS, KIOSK_SHELF, formatMoney, groceryPrice, itemName, type Shelf, type ShopProduct } from '../domain/items';
import { money, region } from '../domain/region';
import type { GameStore } from '../core/store';
import type { MissionDef, ObjectiveDef, RequiredItem } from './types';
import { budgetScore, checkRequired, clamp, timeScore } from './validation';
import { isCustomMissionId, registerCustomMission, setCustomMissionSync, unregisterCustomMission } from './registry';

// ---------------------------------------------------------------------------
// Limits (specs arrive from another device — always sanitize)
// ---------------------------------------------------------------------------
export const CUSTOM_LIMITS = { items: 10, nameLen: 32, qty: 20, titleLen: 60, noteLen: 200, minDeadline: 10, maxDeadline: 480 } as const;

/** The FreshMart shelf that also carries "family list" products. */
export const FAMILY_SHELF_ID = 'shelf-bakery';
const FAMILY_TAG = 'Family list';
/** Interactable id of the bargaining market cart in town (see TownScene). */
export const MARKET_TARGET = 'market-cart';

// ---------------------------------------------------------------------------
// Item mapping
// ---------------------------------------------------------------------------
interface Synonym {
  words: string[];
  /** candidate item ids, first one that exists wins; the rest become accepted alternatives */
  ids: string[];
}

/** Typed words → existing game items. Multi-word phrases are checked before single words. */
export const SYNONYMS: Synonym[] = [
  { words: ['chocolate milk', 'milkshake', 'flavoured milk', 'flavored milk'], ids: ['milk-flavoured'] },
  { words: ['milk', 'doodh', 'dudh'], ids: ['milk-packet', 'milk-tetra', 'milk-tetra-old'] },
  { words: ['cherry tomato', 'cherry tomatoes'], ids: ['cherry-tomato'] },
  { words: ['tomato', 'tomatoes', 'tamatar'], ids: ['tomato'] },
  { words: ['baby potato', 'baby potatoes'], ids: ['baby-potatoes'] },
  { words: ['potato', 'potatoes', 'aloo', 'alu'], ids: ['potatoes', 'baby-potatoes'] },
  { words: ['bread', 'loaf', 'pav', 'bun', 'buns'], ids: ['bread'] },
  { words: ['chips', 'crisps', 'wafers'], ids: ['chips'] },
  { words: ['peanut chocolate'], ids: ['peanut-choc'] },
  { words: ['chocolate', 'choc', 'candy bar'], ids: ['chocolate'] },
  { words: ['onion', 'onions', 'pyaz', 'pyaaz', 'kanda'], ids: ['onion'] },
  { words: ['carrot', 'carrots', 'gajar'], ids: ['carrot'] },
  { words: ['banana', 'bananas', 'kela', 'kele'], ids: ['banana'] },
  { words: ['mango', 'mangoes', 'mangos', 'aam'], ids: ['mango'] },
  { words: ['apple', 'apples', 'seb'], ids: ['apple'] },
  { words: ['juice', 'juice box', 'mango juice'], ids: ['juice-box'] },
  { words: ['popcorn'], ids: ['popcorn'] },
  { words: ['cold drink', 'soda', 'cola', 'coke', 'soft drink', 'pop'], ids: ['cold-drink'] },
];

/** Sensible base-currency (₹-scale) unit prices for things the game does not stock. */
export const GENERIC_PRICES: Record<string, number> = {
  egg: 7, eggs: 7, rice: 60, sugar: 45, salt: 20, butter: 55, dal: 90, lentil: 90, lentils: 90, atta: 50, flour: 50,
  oil: 150, tea: 80, coffee: 120, biscuit: 25, biscuits: 25, cookies: 40, soap: 35, shampoo: 90, toothpaste: 50,
  paneer: 90, curd: 30, yogurt: 30, yoghurt: 30, cheese: 100, orange: 10, oranges: 10, lemon: 5, lemons: 5,
  pasta: 60, noodles: 15, cereal: 150, jam: 90, honey: 120, ghee: 250, spinach: 25, cucumber: 10, garlic: 15,
  ginger: 15, chilli: 10, chillies: 10, coriander: 10, peas: 40, cabbage: 30, cauliflower: 35, grapes: 60,
  watermelon: 60, water: 20, candles: 30, batteries: 60, tissues: 40, napkins: 40, sponge: 20,
};
const DEFAULT_PRICE = 40;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "Eggs ×6", "6 eggs", "eggs x 6", "Bread" → { name, qty } */
export function parseItemLine(line: string): { name: string; qty: number } {
  let text = line.trim();
  let qty = 1;
  const tail = text.match(/^(.*?)\s*(?:[×xX*]\s*)(\d{1,3})\s*$/);
  const head = text.match(/^(\d{1,3})\s*(?:[×xX*]\s*)?(.+)$/);
  if (tail && tail[1]) {
    text = tail[1];
    qty = Number(tail[2]);
  } else if (head) {
    qty = Number(head[1]);
    text = head[2];
  }
  return { name: text.trim().slice(0, CUSTOM_LIMITS.nameLen), qty: Math.max(1, Math.min(CUSTOM_LIMITS.qty, qty || 1)) };
}

const singular = (w: string) => (w.endsWith('oes') ? w.slice(0, -2) : w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w);

function synonymFor(name: string): Synonym | undefined {
  const n = ` ${norm(name)} `;
  // longest phrase first so "chocolate milk" beats "milk" and "cherry tomatoes" beats "tomatoes"
  const all = SYNONYMS.flatMap((syn) => syn.words.map((w) => ({ syn, w }))).sort((a, b) => b.w.length - a.w.length);
  for (const { syn, w } of all) if (n.includes(` ${w} `) && syn.ids.some((id) => ITEMS[id])) return syn;
  return undefined;
}

/** Map a typed item name to an existing game item id (undefined when the game does not stock it). */
export function matchItem(name: string): string | undefined {
  return synonymFor(name)?.ids.find((id) => ITEMS[id]);
}

/** Stable id for a family-list product, e.g. "Brown eggs" → "fam-brown-eggs". */
export function customItemId(name: string): string {
  const slug = norm(name).replace(/ /g, '-').slice(0, 24).replace(/-+$/, '');
  return `fam-${slug || 'item'}`;
}

const titleCase = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());

/** Base-currency price of a generic family-list product. */
export function genericPrice(name: string): number {
  const words = norm(name).split(' ');
  for (const w of words) {
    if (GENERIC_PRICES[w] !== undefined) return GENERIC_PRICES[w];
    if (GENERIC_PRICES[singular(w)] !== undefined) return GENERIC_PRICES[singular(w)];
  }
  return DEFAULT_PRICE;
}

interface MarketGoodLike {
  item: string;
  basePerKg: number;
  perKg: number;
}
/** The market cart's goods (owned by the market feature; read defensively). */
function marketGoods(): MarketGoodLike[] {
  const g = (ItemsModule as unknown as Record<string, unknown>)['MARKET_GOODS'];
  return Array.isArray(g) ? (g as MarketGoodLike[]) : [];
}

/** Where an item can be bought at the chosen store, and its base unit price there. */
export function storeUnitPrice(store: CustomStore, itemId: string): number | undefined {
  if (store === 'grocery') return groceryPrice(itemId);
  if (store === 'kiosk') return KIOSK_SHELF.products.find((p) => p.item === itemId && !isInjected(p))?.price;
  const g = marketGoods().find((x) => x.item === itemId);
  return g ? Math.round(g.basePerKg / Math.max(1, g.perKg)) : undefined;
}

/** Best guess of a base-currency unit price for an item, wherever it is sold. */
function anyPrice(itemId: string): number | undefined {
  return storeUnitPrice('grocery', itemId) ?? storeUnitPrice('kiosk', itemId) ?? storeUnitPrice('market', itemId);
}

export interface ResolvedItem {
  name: string;
  qty: number;
  itemId: string;
  /** base-currency unit price */
  price: number;
  /** true when the game already had this item (mapped through the synonym table) */
  known: boolean;
}

/** Resolve one typed row: existing item (synonyms) or a generic family-list product. */
export function resolveItem(row: { name: string; qty: number; itemId?: string; price?: number }, store: CustomStore = 'grocery'): ResolvedItem {
  const name = titleCase(String(row.name ?? '').slice(0, CUSTOM_LIMITS.nameLen)) || 'Item';
  const qty = Math.max(1, Math.min(CUSTOM_LIMITS.qty, Math.round(Number(row.qty) || 1)));
  const given = typeof row.itemId === 'string' && /^[a-z0-9-]{1,40}$/.test(row.itemId) ? row.itemId : undefined;
  const mapped = given && (ITEMS[given] || given.startsWith('fam-')) ? given : matchItem(name);
  const finitePrice = typeof row.price === 'number' && Number.isFinite(row.price) && row.price > 0 ? Math.min(5000, row.price) : undefined;
  if (mapped && !mapped.startsWith('fam-')) {
    const price = storeUnitPrice(store, mapped) ?? anyPrice(mapped) ?? finitePrice ?? genericPrice(name);
    return { name, qty, itemId: mapped, price, known: true };
  }
  return { name, qty, itemId: mapped ?? customItemId(name), price: finitePrice ?? genericPrice(name), known: false };
}

/** Clean a spec coming from a form or another device; resolves item ids and prices. */
export function normalizeSpec(spec: Partial<CustomMissionSpec> | null | undefined): CustomMissionSpec {
  const store: CustomStore = spec?.store === 'kiosk' || spec?.store === 'market' ? spec.store : 'grocery';
  const rows = Array.isArray(spec?.items) ? spec!.items.slice(0, CUSTOM_LIMITS.items) : [];
  const merged = new Map<string, ResolvedItem>();
  for (const r of rows) {
    if (!r || !String(r.name ?? '').trim()) continue;
    const it = resolveItem(r, store);
    const prev = merged.get(it.itemId);
    if (prev) prev.qty = Math.min(CUSTOM_LIMITS.qty, prev.qty + it.qty);
    else merged.set(it.itemId, it);
  }
  const items = [...merged.values()].map((i) => ({ name: i.name, qty: i.qty, itemId: i.itemId, price: i.price }));
  const budget = Number(spec?.budget);
  const deadline = Number(spec?.deadlineMinutes);
  const clean = (s: unknown, n: number) => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
  return {
    title: clean(spec?.title, CUSTOM_LIMITS.titleLen) || 'Family shopping list',
    items,
    store,
    budget: Number.isFinite(budget) && budget > 0 ? Math.min(budget, money(5000)) : estimateCost({ items, store } as CustomMissionSpec, 0.15),
    deadlineMinutes: Number.isFinite(deadline) ? Math.max(CUSTOM_LIMITS.minDeadline, Math.min(CUSTOM_LIMITS.maxDeadline, Math.round(deadline))) : 90,
    note: clean(spec?.note, CUSTOM_LIMITS.noteLen),
  };
}

/** Estimated cost in the CURRENT currency (optionally + a margin, e.g. 0.15 = suggested budget). */
export function estimateCost(spec: Pick<CustomMissionSpec, 'items' | 'store'>, margin = 0): number {
  const base = spec.items.reduce((n, r) => {
    const it = resolveItem(r, spec.store);
    return n + it.price * it.qty;
  }, 0);
  const cur = region().currency;
  const raw = money(base) * (1 + margin);
  const step = cur.step || 1;
  return Math.round(Math.ceil(raw / step) * step * 100) / 100;
}

/** Display name of a store in the current region. */
export function storeName(store: CustomStore): string {
  const r = region() as ReturnType<typeof region> & { market?: { cart?: string } };
  if (store === 'kiosk') return r.words.kioskName;
  if (store === 'market') return r.market?.cart ?? 'the market cart';
  return 'FreshMart';
}

/** "Bread, 6 Eggs and 4 Bananas" */
export function listPhrase(items: { name: string; qty: number }[]): string {
  const parts = items.map((i) => (i.qty > 1 ? `${i.qty} ${i.name}` : i.name));
  if (parts.length <= 1) return parts[0] ?? 'a few things';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The assigner's spoken request, e.g. "Please buy Bread, 6 Eggs and 4 Bananas from FreshMart. You have ₹150…" */
export function briefingText(spec: CustomMissionSpec, budgetText = formatMoney(spec.budget)): string {
  const mins = spec.deadlineMinutes;
  const when = mins >= 60 ? `${Math.floor(mins / 60)} hour${mins >= 120 ? 's' : ''}${mins % 60 ? ` ${mins % 60} minutes` : ''}` : `${mins} minutes`;
  const note = spec.note ? ` ${spec.note}` : '';
  return `Please buy ${listPhrase(spec.items)} from ${storeName(spec.store)}. You have ${budgetText}. Please be back within ${when}.${note}`;
}

// ---------------------------------------------------------------------------
// Runtime products ("Family list" shelf)
// ---------------------------------------------------------------------------
const injected: { shelf: Shelf; product: ShopProduct }[] = [];
const injectedSet = new WeakSet<ShopProduct>();
const addedItems = new Set<string>();
let originalBakeryLabel: string | null = null;
const isInjected = (p: ShopProduct) => injectedSet.has(p);

/** Make sure ITEMS knows every family-list product (names show in inventory, receipts, results). */
function ensureItemDefs(spec: CustomMissionSpec) {
  for (const r of spec.items) {
    if (!r.itemId || ITEMS[r.itemId]) continue;
    const def: ItemDef = { id: r.itemId, name: r.name, weight: 0.5, category: 'grocery' };
    ITEMS[r.itemId] = def;
    addedItems.add(r.itemId);
  }
}

/** Products that must be added so `spec` is buyable at its store. */
export function productsNeeded(spec: CustomMissionSpec): { shelfId: string; item: string; price: number }[] {
  const out: { shelfId: string; item: string; price: number }[] = [];
  for (const r of spec.items) {
    const id = r.itemId!;
    if (spec.store === 'kiosk') {
      if (storeUnitPrice('kiosk', id) === undefined) out.push({ shelfId: 'kiosk', item: id, price: r.price ?? genericPrice(r.name) });
    } else if (spec.store === 'market' && storeUnitPrice('market', id) !== undefined) {
      // sold at the cart
    } else if (groceryPrice(id) === undefined || isInjectedGrocery(id)) {
      out.push({ shelfId: FAMILY_SHELF_ID, item: id, price: r.price ?? genericPrice(r.name) });
    }
  }
  return out;
}
const isInjectedGrocery = (id: string) => injected.some((x) => x.shelf.id === FAMILY_SHELF_ID && x.product.item === id);

/** Remove every runtime product, then add the ones the given active specs need. Idempotent. */
export function rebuildFamilyShelves(active: CustomMissionSpec[]) {
  for (const { shelf, product } of injected.splice(0)) {
    const i = shelf.products.indexOf(product);
    if (i >= 0) shelf.products.splice(i, 1);
  }
  const bakery = GROCERY_SHELVES.find((s) => s.id === FAMILY_SHELF_ID);
  if (bakery && originalBakeryLabel !== null) bakery.label = originalBakeryLabel;
  for (const spec of active) {
    ensureItemDefs(spec);
    for (const need of productsNeeded(spec)) {
      const shelf = need.shelfId === 'kiosk' ? KIOSK_SHELF : bakery;
      if (!shelf || shelf.products.some((p) => p.item === need.item)) continue;
      const product: ShopProduct = { item: need.item, price: need.price, tag: FAMILY_TAG };
      shelf.products.push(product);
      injected.push({ shelf, product });
      injectedSet.add(product);
    }
  }
  if (bakery && injected.some((x) => x.shelf === bakery)) {
    if (originalBakeryLabel === null) originalBakeryLabel = bakery.label;
    bakery.label = `${originalBakeryLabel} & ${FAMILY_TAG}`;
  }
}

/** Ids of the products currently added at runtime (for tests / debugging). */
export function injectedProducts(): { shelfId: string; item: string }[] {
  return injected.map((x) => ({ shelfId: x.shelf.id, item: x.product.item }));
}

// ---------------------------------------------------------------------------
// Mission definition
// ---------------------------------------------------------------------------
export function customMissionId(a: Pick<Assignment, 'id' | 'missionId'>): string {
  return isCustomMissionId(a.missionId) ? a.missionId : `custom:${a.id}`;
}

/** A fresh id for a not-yet-created custom assignment (≤ 64 chars for the backend). */
export function newCustomMissionId(): string {
  return `custom:${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function requiredFor(spec: CustomMissionSpec): RequiredItem[] {
  return spec.items.map((r) => {
    const syn = r.itemId && !r.itemId.startsWith('fam-') ? SYNONYMS.find((s) => s.ids[0] === r.itemId) : undefined;
    const alternatives = syn ? syn.ids.slice(1).filter((id) => ITEMS[id]) : [];
    return alternatives.length ? { item: r.itemId!, qty: r.qty, alternatives } : { item: r.itemId!, qty: r.qty };
  });
}

function storeWhere(spec: CustomMissionSpec): NonNullable<ObjectiveDef['where']> {
  if (spec.store === 'kiosk') return { location: 'town', target: 'kiosk' };
  if (spec.store === 'market') return { location: 'town', target: MARKET_TARGET };
  return { location: 'grocery' };
}

/** Build a playable mission from a parent's list. `id` must start with "custom:". */
export function makeCustomMission(input: Partial<CustomMissionSpec>, opts: { id: string; assignerName?: string } = { id: newCustomMissionId() }): MissionDef {
  const spec = normalizeSpec(input);
  const id = opts.id;
  const REQUIRED = requiredFor(spec);
  const listIds = new Set(REQUIRED.flatMap((r) => [r.item, ...(r.alternatives ?? [])]));
  const where = storeWhere(spec);
  const sName = storeName(spec.store);
  const needsFreshMart = spec.store === 'market' && productsNeeded(spec).length > 0;
  const shopsAtCounter = spec.store === 'grocery' || needsFreshMart;
  const itemCount = spec.items.reduce((n, i) => n + i.qty, 0);

  const receipts = (s: GameStore) => {
    const start = s.state.run?.startedAt ?? 0;
    const day = s.state.clock.day;
    return s.state.receipts.filter((r) => r.at >= start && (r.day === undefined || r.day === day));
  };
  const wastedSpend = (s: GameStore) => {
    let wasted = 0;
    const extras: string[] = [];
    for (const rc of receipts(s))
      for (const l of rc.lines)
        if (!listIds.has(l.id)) {
          wasted += l.price * l.qty;
          if (l.id !== 'paper-bag') extras.push(l.name);
        }
    return { wasted, extras };
  };
  const missingText = (miss: { item: string; qty: number }[]) => miss.map((m) => `${m.qty}× ${itemName(m.item)}`).join(', ');

  function finishDelivery(s: GameStore, use: Record<string, number>, missing: { item: string; qty: number }[]) {
    const run = s.state.run!;
    const a = s.assigner();
    const who = a?.name ?? 'your parent';
    const missingQty = missing.reduce((n, m) => n + m.qty, 0);
    run.flags['missingAtDelivery'] = missingQty;
    for (const [item, q] of Object.entries(use)) s.takeItem(item, q);
    run.flags['deliveredAt'] = s.state.clock.minutes;
    const lines: string[] = [];
    const { extras } = wastedSpend(s);
    if (extras.length) lines.push(`And ${extras.join(', ')}? That wasn't on the list…`);
    const change = Math.max(0, run.cashGiven - run.spent);
    if (change > 0) {
      s.pay(change, `Returned change to ${who}`, false);
      run.flags['returnedChange'] = change;
      lines.push(`Here's your change: ${formatMoney(change)}. Thank you for bringing it back!`);
    } else if (run.spent > run.cashGiven) {
      lines.push(`You spent ${formatMoney(run.spent - run.cashGiven)} more than I gave you — that came from your pocket money.`);
    }
    s.objective('deliver');
    if (a) s.trust(a.id, missingQty ? -2 : 5);
    const got = itemCount - missingQty;
    s.bus.emit('report', {
      text: missingQty
        ? `${s.player?.name ?? 'Your child'} brought ${got} of ${itemCount} things from "${spec.title}" (missing ${missingText(missing)}). Spent ${formatMoney(run.spent)} of ${formatMoney(run.budget ?? spec.budget)}.`
        : `${s.player?.name ?? 'Your child'} brought everything on "${spec.title}" — ${formatMoney(run.spent)} of ${formatMoney(run.budget ?? spec.budget)}.`,
      tone: missingQty ? 'neutral' : 'good',
      toMemberId: a?.id,
    });
    s.say(
      [
        { speaker: who, portrait: a?.id, text: missingQty ? "Okay — thank you. We'll manage without the rest today." : 'You got everything on my list! Thank you 🙌' },
        ...lines.map((t) => ({ speaker: who, portrait: a?.id, text: t })),
      ],
      () => s.finishMission(missingQty ? 'incomplete' : undefined),
    );
  }

  function deliver(s: GameStore) {
    const a = s.assigner();
    const check = checkRequired(REQUIRED, s.state.inventory);
    if (check.satisfied) return finishDelivery(s, check.use, []);
    s.say([
      {
        speaker: a?.name ?? '',
        portrait: a?.id,
        text: `Thank you… but we're still missing: ${missingText(check.missing)}.`,
        choices: [
          ...(s.timeLeft() === null || s.timeLeft()! > 0
            ? [{ label: "I'll go back and get it now", tone: 'good' as const, run: () => s.log('Went back for missing items', 'Fixing a mistake is better than leaving it.', 'good') }]
            : []),
          { label: "Here's what I got. Sorry, I couldn't get everything.", tone: 'bad' as const, run: () => finishDelivery(s, check.use, check.missing) },
        ],
      },
    ]);
  }

  const objectives: ObjectiveDef[] = [
    { id: 'receive-list', label: 'Get the shopping list', type: 'talk', required: true },
    {
      id: 'reach-store',
      label: `Go to ${sName}`,
      type: 'reach',
      target: spec.store === 'grocery' ? 'grocery' : where.target,
      required: true,
      where,
      hint: spec.store === 'grocery' ? 'Leave by the front door and cross at the zebra crossing to FreshMart.' : `${sName} is on the street outside — walk up and press E.`,
    },
    {
      id: 'checkout',
      label: shopsAtCounter ? 'Pay for your shopping' : `Buy the things at ${sName}`,
      type: 'checkout',
      required: true,
      where: shopsAtCounter && spec.store === 'grocery' ? { location: 'grocery', target: 'checkout' } : where,
      hint: shopsAtCounter ? 'Pick items from the shelves (E) — family-list things are on the bakery shelf — then join the checkout queue.' : 'Buy each thing on the list. Check the price before you pay.',
    },
    {
      id: 'buy-items',
      label: 'Have every item on the list',
      type: 'collect',
      required: true,
      where: spec.store === 'grocery' ? { location: 'grocery', target: FAMILY_SHELF_ID } : where,
      hint: needsFreshMart ? `Some things are not sold at ${sName} — find them on FreshMart's "Family list" shelf.` : 'Open your journal (J) to see what is still missing.',
    },
    { id: 'return-home', label: 'Return home', type: 'reach', target: 'home', required: true, dependsOn: ['checkout'], where: { location: 'home' } },
    { id: 'deliver', label: 'Give the shopping to {assigner}', type: 'deliver', required: true, where: { location: 'home', target: 'assigner' }, hint: 'Talk to them (E) to hand over the shopping and the change.' },
  ];

  const def: MissionDef = {
    id,
    title: spec.title,
    category: 'errand',
    difficulty: spec.items.length > 4 || spec.store === 'market' ? 2 : 1,
    icon: '📝',
    summary: `Real errand: ${listPhrase(spec.items)} from ${sName}.`,
    assignerRoles: [...GUARDIAN_ROLES],
    location: 'home',
    destination: spec.store === 'grocery' ? 'grocery' : 'town',
    briefing: briefingText(spec, '{budget}'),
    instructions: [
      `Shop at ${sName}.`,
      ...(spec.store !== 'kiosk' && productsNeeded(spec).length ? [`Things the shop does not usually stock are on FreshMart's "${FAMILY_TAG}" shelf (by the bakery).`] : []),
      'Check every price against your budget before you pay.',
      'Bring back the change and hand everything over at home.',
      ...(spec.note ? [`Note: ${spec.note}`] : []),
    ],
    objectives,
    requiredItems: REQUIRED,
    budgetFn: () => spec.budget,
    deadlineMinutes: spec.deadlineMinutes,
    lateRule: 'partial',
    challenges: spec.store === 'grocery' ? [{ id: 'queue-cutter' }, { id: 'elder-ahead' }] : [],
    rewards: { xp: 80 + 10 * Math.min(6, spec.items.length) },
    learning: ['Follow a real shopping list', 'Stay within a budget', 'Bring back the change'],
    skills: ['budget', 'planning', 'responsibility'],
    available(state: GameState) {
      const asg = state.assignments.find((x) => customMissionId(x) === id && x.assignedTo === 'player' && (x.status === 'assigned' || x.status === 'in-progress'));
      return asg ? { ok: true } : { ok: false, reason: 'Only when a parent sends this list.' };
    },
    onEvent(s, ev) {
      if (ev.type === 'location') {
        if (spec.store === 'grocery' && ev.to === 'grocery') s.objective('reach-store');
        if (ev.to === 'home' && s.isDone('checkout')) s.objective('return-home');
      }
      if (ev.type === 'interact' && spec.store !== 'grocery' && (ev.target === where.target || (spec.store === 'market' && /market|cart/.test(ev.target)))) s.objective('reach-store');
      if (ev.type === 'purchased') {
        if (spec.store === 'kiosk' && ev.store === 'kiosk') s.objective('reach-store');
        if (spec.store === 'market' && /market|cart/.test(ev.store)) s.objective('reach-store');
        s.objective('checkout');
        if (checkRequired(REQUIRED, s.state.inventory).satisfied) s.objective('buy-items');
        if (s.state.location === 'home') s.objective('return-home');
      }
    },
    onTalk(s, member) {
      const run = s.state.run!;
      if (member.id !== run.assignerId) return false;
      if (!s.isDone('checkout')) {
        s.say([{ speaker: member.name, portrait: member.id, text: `The list is in your journal (press J): ${listPhrase(spec.items)}. ${sName}, and keep the receipt!` }]);
        return true;
      }
      deliver(s);
      return true;
    },
    progress(state, oid) {
      if (oid !== 'buy-items') return null;
      const inv = state.inventory.items;
      const b = state.basket;
      return REQUIRED.map((r, i) => {
        const have = [r.item, ...(r.alternatives ?? [])].reduce((n, x) => n + (inv[x] ?? 0) + (b[x] ?? 0), 0);
        return `${spec.items[i]?.name ?? itemName(r.item)} ${Math.min(have, r.qty)}/${r.qty}`;
      }).join(' · ');
    },
    evaluate(s, forced) {
      const run = s.state.run!;
      const f = run.flags;
      const who = s.assigner()?.name ?? opts.assignerName ?? 'your parent';
      const finishedAt = Number(f['deliveredAt'] ?? s.state.clock.minutes);
      const delivered = s.isDone('deliver');
      const remaining = checkRequired(REQUIRED, s.state.inventory);
      const missingCount = delivered ? Number(f['missingAtDelivery'] ?? 0) : remaining.missing.reduce((n, m) => n + m.qty, 0);
      const late = run.deadlineAt !== null && finishedAt > run.deadlineAt;
      const { wasted, extras } = wastedSpend(s);
      const scores = {
        accuracy: clamp(100 - (missingCount / Math.max(1, itemCount)) * 100 - (forced === 'incomplete' && !delivered ? 30 : 0)),
        budget: budgetScore(run.spent, run.budget, wasted),
        time: timeScore(finishedAt, run.deadlineAt, run.startedAt),
        planning: clamp(60 + (f['checkedList'] ? 15 : 0) + Number(f['planning'] ?? 0) + (extras.length ? -10 : 10)),
        responsibility: clamp(65 + Number(f['resp'] ?? 0) + (f['returnedChange'] ? 20 : 0) + (delivered ? 10 : -15)),
      };
      const outcome = forced ?? (missingCount > 0 || !delivered ? 'incomplete' : late ? 'completed-late' : 'completed');
      const listName = `${who}'s list`;
      const fb: string[] = [];
      const within = run.budget === null || run.spent <= run.budget;
      if (outcome !== 'incomplete')
        fb.push(`You bought all ${itemCount} item${itemCount === 1 ? '' : 's'} from ${listName} for ${formatMoney(run.spent)}${run.budget !== null ? ` of ${formatMoney(run.budget)}` : ''}.`);
      else if (delivered) fb.push(`You brought ${itemCount - missingCount} of ${itemCount} items from ${listName}. Check the list in your journal before paying next time.`);
      else fb.push(`The shopping from ${listName} was not finished. In real life, try writing the list down and ticking things off.`);
      if (!within) fb.push(`You went over the budget by ${formatMoney(run.spent - run.budget!)}. Comparing prices first helps.`);
      if (wasted > 0) fb.push(`${formatMoney(wasted)} went on things not on the list${extras.length ? ` (${extras.join(', ')})` : ''}.`);
      if (late) fb.push(`You were ${Math.round(finishedAt - run.deadlineAt!)} minutes late.`);
      else if (run.deadlineAt !== null && delivered) fb.push(`Back with ${Math.round(run.deadlineAt - finishedAt)} minutes to spare.`);
      if (f['returnedChange']) fb.push('You returned the change — that builds trust.');
      if (outcome !== 'incomplete') fb.push('Now try it for real: help with this list next time you go shopping together!');
      return { outcome, scores, feedback: fb };
    },
  };
  return def;
}

// ---------------------------------------------------------------------------
// Assignment ↔ registry sync
// ---------------------------------------------------------------------------
const ACTIVE = new Set(['assigned', 'in-progress']);
const registered = new Set<string>();
let lastKey = '';

/**
 * Register a mission for every assignment that carries a custom spec (on parent AND child devices),
 * and rebuild the runtime shelves for the active ones. Cheap when nothing changed. Registration is
 * additive — finished lists stay resolvable for results/history.
 */
export function syncCustomMissions(assignments: readonly Assignment[], opts: { shelves?: boolean } = {}) {
  const customs = assignments.filter((a) => a.custom);
  const key = customs.map((a) => `${a.id}:${a.missionId}:${a.status}`).join('|');
  if (opts.shelves !== false && key === lastKey) return;
  for (const a of customs) {
    const id = customMissionId(a);
    if (!registered.has(id)) {
      ensureItemDefs(normalizeSpec(a.custom));
      registered.add(id);
      registerCustomMission(makeCustomMission(a.custom!, { id }));
    }
  }
  if (opts.shelves === false) return;
  lastKey = key;
  rebuildFamilyShelves(customs.filter((a) => ACTIVE.has(a.status)).map((a) => normalizeSpec(a.custom)));
}

/** Remove one custom mission (e.g. a parent deleted the list). */
export function forgetCustomMission(id: string) {
  registered.delete(id);
  unregisterCustomMission(id);
}

/** Call once at startup: keeps custom missions & family shelves in step with the store's assignments. */
export function installCustomMissions(s: GameStore): () => void {
  const sync = () => {
    try {
      syncCustomMissions(s.state.assignments);
    } catch (e) {
      console.warn('custom missions', e);
    }
  };
  setCustomMissionSync(sync);
  const unsub = s.subscribe(sync);
  sync();
  return () => {
    unsub();
    setCustomMissionSync(null);
  };
}

/** Test helper: reset module state (shelves, registrations). */
export function resetCustomMissions() {
  rebuildFamilyShelves([]);
  for (const id of registered) unregisterCustomMission(id);
  registered.clear();
  for (const id of addedItems) delete ITEMS[id];
  addedItems.clear();
  lastKey = '';
}

/**
 * Parent action (offline or on the parent's device): create the assignment for a custom list.
 * Returns the Assignment; in family mode also hand it to `pushAssignment(asg, childGameId)`.
 */
export function assignCustomMission(s: GameStore, input: Partial<CustomMissionSpec>, by: string, to = 'player'): Assignment {
  const spec = normalizeSpec(input);
  const missionId = newCustomMissionId();
  const asg = s.assign({ missionId, assignedTo: to, assignedBy: by, budget: spec.budget, deadlineMinutes: spec.deadlineMinutes, note: spec.note || undefined, custom: spec });
  syncCustomMissions(s.state.assignments);
  return asg;
}

/** Build (without saving) an Assignment for a custom list — for ParentLive, which pushes to the backend itself. */
export function customAssignment(input: Partial<CustomMissionSpec>, by: string, to: string, createdAt = Date.now()): Assignment {
  const spec = normalizeSpec(input);
  const missionId = newCustomMissionId();
  const asg: Assignment = {
    id: `a-${missionId.slice(7)}`,
    missionId,
    assignedTo: to,
    assignedBy: by,
    budget: spec.budget,
    deadlineMinutes: spec.deadlineMinutes,
    status: 'assigned',
    createdAt,
    custom: spec,
  };
  if (spec.note) asg.note = spec.note;
  syncCustomMissions([asg], { shelves: false });
  return asg;
}
