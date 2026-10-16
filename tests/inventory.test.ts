import { describe, expect, it } from 'vitest';
import { addItem, basketTotal, countItem, inventoryWeight, removeItem } from '../src/core/systems';
import { ITEMS, groceryPrice } from '../src/domain/items';
import type { Inventory } from '../src/domain/types';

const bag = (items: Record<string, number> = {}, capacity = 8): Inventory => ({ items, capacity });

function ok(r: ReturnType<typeof addItem>): Inventory {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.inventory;
}

describe('inventory', () => {
  it('adds, counts and removes items', () => {
    let inv = ok(addItem(bag(), 'tomato', 2));
    inv = ok(addItem(inv, 'tomato'));
    expect(countItem(inv, 'tomato')).toBe(3);
    inv = ok(removeItem(inv, 'tomato', 2));
    expect(countItem(inv, 'tomato')).toBe(1);
    expect(countItem(inv, 'potatoes')).toBe(0);
  });

  it('does not mutate the input inventory', () => {
    const inv = bag({ tomato: 1 });
    addItem(inv, 'tomato');
    removeItem(inv, 'tomato');
    expect(inv.items).toEqual({ tomato: 1 });
  });

  it('removes the key from the map when the count reaches zero', () => {
    const inv = ok(removeItem(bag({ tomato: 2, bread: 1 }), 'tomato', 2));
    expect('tomato' in inv.items).toBe(false);
    expect(inv.items).toEqual({ bread: 1 });
  });

  it('fails to remove missing items or more than held', () => {
    expect(removeItem(bag(), 'milk-packet')).toEqual({ ok: false, reason: 'missing' });
    expect(removeItem(bag({ tomato: 1 }), 'tomato', 2)).toEqual({ ok: false, reason: 'missing' });
  });

  it('weighs items using ITEMS weights', () => {
    expect(ITEMS.potatoes.weight).toBe(2);
    expect(inventoryWeight(bag({ potatoes: 2, tomato: 2, 'cloth-bag': 1 }))).toBe(5);
    expect(inventoryWeight(bag({ 'unknown-thing': 5 }))).toBe(0);
  });

  it('enforces capacity by weight: 4 bags of potatoes fill a capacity-8 bag', () => {
    let inv = bag();
    for (let i = 0; i < 4; i++) inv = ok(addItem(inv, 'potatoes'));
    expect(inventoryWeight(inv)).toBe(8);
    expect(addItem(inv, 'potatoes')).toEqual({ ok: false, reason: 'capacity' });
    expect(addItem(inv, 'tomato')).toEqual({ ok: false, reason: 'capacity' });
    // weightless gear still fits
    expect(addItem(inv, 'cloth-bag').ok).toBe(true);
  });

  it('rejects a multi-quantity add that would exceed capacity as a whole', () => {
    const r = addItem(bag({ potatoes: 2 }), 'potatoes', 3); // 4 + 6 > 8
    expect(r).toEqual({ ok: false, reason: 'capacity' });
  });
});

describe('basketTotal', () => {
  it('sums price × qty', () => {
    const price = (id: string) => groceryPrice(id) ?? 0;
    expect(basketTotal({ tomato: 2, potatoes: 1, 'milk-tetra': 1 }, price)).toBe(24 + 45 + 38);
    expect(basketTotal({}, price)).toBe(0);
  });
});
