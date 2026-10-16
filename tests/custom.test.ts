import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStore } from '../src/core/store';
import { GROCERY_SHELVES, ITEMS, KIOSK_SHELF, findProduct } from '../src/domain/items';
import {
  FAMILY_SHELF_ID,
  assignCustomMission,
  briefingText,
  customAssignment,
  estimateCost,
  injectedProducts,
  installCustomMissions,
  makeCustomMission,
  matchItem,
  normalizeSpec,
  parseItemLine,
  resetCustomMissions,
  resolveItem,
  syncCustomMissions,
} from '../src/missions/custom';
import { customMissions, getMission, registerCustomMission, unregisterCustomMission } from '../src/missions/registry';
import { byLabel, idOf, newStore, settle } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  resetCustomMissions();
});

const LIST = {
  title: "Mum's list",
  items: [
    { name: 'Bread', qty: 1 },
    { name: 'Eggs', qty: 6 },
    { name: 'Tomatoes', qty: 2 },
  ],
  store: 'grocery' as const,
  budget: 150,
  deadlineMinutes: 90,
  note: 'Brown bread if they have it.',
};

describe('item mapping', () => {
  it('parses typed rows with quantities', () => {
    expect(parseItemLine('Eggs ×6')).toEqual({ name: 'Eggs', qty: 6 });
    expect(parseItemLine('6 eggs')).toEqual({ name: 'eggs', qty: 6 });
    expect(parseItemLine('bananas x 4')).toEqual({ name: 'bananas', qty: 4 });
    expect(parseItemLine('Bread')).toEqual({ name: 'Bread', qty: 1 });
  });

  it('maps synonyms to existing items, longest phrase first', () => {
    expect(matchItem('Milk')).toBe('milk-packet');
    expect(matchItem('doodh')).toBe('milk-packet');
    expect(matchItem('chocolate milk')).toBe('milk-flavoured');
    expect(matchItem('Tomatoes')).toBe('tomato');
    expect(matchItem('cherry tomatoes')).toBe('cherry-tomato');
    expect(matchItem('aloo')).toBe('potatoes');
    expect(matchItem('a loaf of bread')).toBe('bread');
    expect(matchItem('crisps')).toBe('chips');
    expect(matchItem('Onions')).toBe('onion');
    expect(matchItem('carrots')).toBe('carrot');
    expect(matchItem('Eggs')).toBeUndefined();
    expect(matchItem('rice')).toBeUndefined();
  });

  it('creates generic family-list products with sensible prices', () => {
    const eggs = resolveItem({ name: 'eggs', qty: 6 });
    expect(eggs).toMatchObject({ name: 'Eggs', itemId: 'fam-eggs', known: false, qty: 6 });
    expect(eggs.price).toBe(7);
    expect(resolveItem({ name: 'Basmati rice', qty: 1 }).price).toBe(60);
    expect(resolveItem({ name: 'Mystery thing', qty: 1 }).price).toBe(40);
    const bread = resolveItem({ name: 'Bread', qty: 1 });
    expect(bread).toMatchObject({ itemId: 'bread', known: true, price: 35 });
    // the kiosk sells bread at its own price
    expect(resolveItem({ name: 'Bread', qty: 1 }, 'kiosk').price).toBe(38);
  });

  it('normalizes untrusted specs (limits, merge duplicates, defaults)', () => {
    const spec = normalizeSpec({
      title: '<b>x</b>'.repeat(30),
      items: [{ name: 'milk', qty: 2 }, { name: 'Milk', qty: 50 }, { name: '  ', qty: 1 }],
      store: 'nowhere' as never,
      budget: -5,
      deadlineMinutes: 99999,
    });
    expect(spec.store).toBe('grocery');
    expect(spec.items).toHaveLength(1);
    expect(spec.items[0]).toMatchObject({ itemId: 'milk-packet', qty: 20 });
    expect(spec.title).not.toMatch(/[<>]/);
    expect(spec.deadlineMinutes).toBe(480);
    expect(spec.budget).toBeGreaterThan(0); // suggested = estimate + 15%
  });

  it('estimates cost and writes the briefing', () => {
    const spec = normalizeSpec(LIST);
    expect(estimateCost(spec)).toBe(35 + 6 * 7 + 2 * 12);
    const text = briefingText(spec);
    expect(text).toContain('Please buy Bread, 6 Eggs and 2 Tomatoes from FreshMart');
    expect(text).toContain('₹150');
    expect(text).toContain('Brown bread if they have it.');
  });
});

describe('mission definition', () => {
  it('builds objectives, required items (with alternatives) and budget', () => {
    const def = makeCustomMission({ ...LIST, items: [...LIST.items, { name: 'milk', qty: 1 }] }, { id: 'custom:t1' });
    expect(def.id).toBe('custom:t1');
    expect(def.objectives.map((o) => o.id)).toEqual(['receive-list', 'reach-store', 'checkout', 'buy-items', 'return-home', 'deliver']);
    expect(def.requiredItems).toEqual([
      { item: 'bread', qty: 1 },
      { item: 'fam-eggs', qty: 6 },
      { item: 'tomato', qty: 2 },
      { item: 'milk-packet', qty: 1, alternatives: ['milk-tetra', 'milk-tetra-old'] },
    ]);
    expect(def.budgetFn?.({} as GameStore)).toBe(150);
    expect(def.deadlineMinutes).toBe(90);
  });

  it('points the kiosk version at the corner shop', () => {
    const def = makeCustomMission({ ...LIST, store: 'kiosk' }, { id: 'custom:k1' });
    expect(def.objectives.find((o) => o.id === 'reach-store')?.where).toEqual({ location: 'town', target: 'kiosk' });
  });
});

describe('registration & family shelf', () => {
  it('registers / unregisters through the registry', () => {
    const def = makeCustomMission(LIST, { id: 'custom:reg' });
    registerCustomMission(def);
    expect(getMission('custom:reg')).toBe(def);
    expect(customMissions()).toContain(def);
    unregisterCustomMission('custom:reg');
    expect(getMission('custom:reg')).toBeUndefined();
    expect(() => registerCustomMission({ ...def, id: 'nope' })).toThrow();
  });

  it('adds products for active lists idempotently and removes them when done', () => {
    const asg = customAssignment(LIST, 'mother-0', 'player');
    const bakeryCount = GROCERY_SHELVES.find((s) => s.id === FAMILY_SHELF_ID)!.products.length;
    syncCustomMissions([asg]);
    syncCustomMissions([{ ...asg }]);
    syncCustomMissions([{ ...asg, note: 'changed' }]);
    expect(injectedProducts()).toEqual([{ shelfId: FAMILY_SHELF_ID, item: 'fam-eggs' }]);
    expect(findProduct(FAMILY_SHELF_ID, 'fam-eggs')?.price).toBe(7);
    expect(ITEMS['fam-eggs']?.name).toBe('Eggs');
    expect(GROCERY_SHELVES.find((s) => s.id === FAMILY_SHELF_ID)!.label).toMatch(/Family list/);
    expect(getMission(asg.missionId)?.title).toBe("Mum's list");

    syncCustomMissions([{ ...asg, status: 'completed' }]);
    expect(injectedProducts()).toEqual([]);
    expect(GROCERY_SHELVES.find((s) => s.id === FAMILY_SHELF_ID)!.products.length).toBe(bakeryCount);
    expect(GROCERY_SHELVES.find((s) => s.id === FAMILY_SHELF_ID)!.label).toBe('Bakery');
    // finished lists stay resolvable for results/history
    expect(getMission(asg.missionId)).toBeDefined();
  });

  it('puts kiosk-only gaps on the kiosk shelf', () => {
    const asg = customAssignment({ ...LIST, store: 'kiosk', items: [{ name: 'carrots', qty: 1 }, { name: 'bread', qty: 1 }] }, 'mother-0', 'player');
    syncCustomMissions([asg]);
    expect(injectedProducts()).toEqual([{ shelfId: 'kiosk', item: 'carrot' }]);
    expect(KIOSK_SHELF.products.find((p) => p.item === 'carrot')?.price).toBe(20);
  });

  it('resolves freshly-arrived assignments through the store sync hook', () => {
    const s = newStore();
    const stop = installCustomMissions(s);
    const asg = customAssignment(LIST, idOf(s, 'mother'), 'player');
    resetCustomMissions(); // forget it, as if it just arrived from the backend
    s.state.assignments = [asg, ...s.state.assignments];
    expect(getMission(asg.missionId)?.title).toBe("Mum's list"); // before any notify
    expect(s.availableMissions().length).toBeGreaterThan(0);
    stop();
  });
});

describe('playing a custom list', () => {
  async function play(s: GameStore, buy: [string, string][]) {
    installCustomMissions(s);
    const mum = idOf(s, 'mother');
    const asg = assignCustomMission(s, LIST, mum);
    s.acceptMission(asg.missionId, mum, asg.id);
    expect(s.state.run?.budget).toBe(150);
    s.travel('town');
    settle(s);
    s.travel('grocery');
    settle(s);
    expect(s.isDone('reach-store')).toBe(true);
    for (const [shelf, item] of buy) s.addToBasket(shelf, item);
    s.checkoutInteract();
    settle(s, byLabel(/Join the queue|Go to the counter/));
    for (let g = 0; s.queueInfo()!.ahead > 0; g++) {
      if (g > 300) throw new Error('queue never moved');
      s.spendTime(1);
      settle(s, byLabel(/./));
    }
    s.checkoutInteract();
    settle(s, byLabel(/^Pay /));
    expect(s.isDone('checkout')).toBe(true);
    s.travel('town');
    settle(s);
    s.travel('home');
    settle(s);
    const reports: string[] = [];
    s.bus.on('report', (r) => reports.push(r.text));
    s.talkTo(mum);
    settle(s, byLabel(/Here's what I got/));
    return { asg, reports };
  }

  it('happy path: everything bought within budget', async () => {
    const s = newStore();
    const { asg, reports } = await play(s, [
      ['shelf-bakery', 'bread'],
      ...Array.from({ length: 6 }, () => ['shelf-bakery', 'fam-eggs'] as [string, string]),
      ['shelf-veg', 'tomato'],
      ['shelf-veg', 'tomato'],
    ]);
    const r = s.state.results[0];
    expect(r.missionId).toBe(asg.missionId);
    expect(r.outcome === 'completed' || r.outcome === 'completed-late').toBe(true);
    expect(r.feedback[0]).toMatch(/^You bought all 9 items from .+'s list for ₹1\d\d of ₹150\.$/);
    expect(r.scores.accuracy).toBe(100);
    expect(s.state.assignments.find((a) => a.id === asg.id)?.status).toBe('completed');
    expect(reports.some((t) => /brought everything/.test(t))).toBe(true);
    expect(injectedProducts()).toEqual([]); // shelf cleaned once the list is done
  });

  it('missing-item path: incomplete with what was missing', async () => {
    const s = newStore();
    const { reports } = await play(s, [
      ['shelf-bakery', 'bread'],
      ['shelf-veg', 'tomato'],
      ['shelf-veg', 'tomato'],
    ]);
    const r = s.state.results[0];
    expect(r.outcome).toBe('incomplete');
    expect(r.feedback[0]).toMatch(/You brought 3 of 9 items/);
    expect(r.scores.accuracy).toBeLessThan(50);
    expect(reports.some((t) => /missing 6× Eggs/.test(t))).toBe(true);
  });
});
