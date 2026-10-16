import { describe, expect, it } from 'vitest';
import { budgetScore, checkRequired, clamp, timeScore } from '../src/missions/validation';
import type { RequiredItem } from '../src/missions/types';
import type { Inventory } from '../src/domain/types';

const inv = (items: Record<string, number>): Inventory => ({ items, capacity: 8 });

const GROCERY: RequiredItem[] = [
  { item: 'milk-packet', qty: 1, alternatives: ['milk-tetra'] },
  { item: 'tomato', qty: 2 },
  { item: 'potatoes', qty: 1, alternatives: ['baby-potatoes'] },
];

describe('checkRequired', () => {
  it('is satisfied by the exact items', () => {
    const r = checkRequired(GROCERY, inv({ 'milk-packet': 1, tomato: 2, potatoes: 1 }));
    expect(r.satisfied).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.use).toEqual({ 'milk-packet': 1, tomato: 2, potatoes: 1 });
    expect(r.substitutions).toEqual([]);
  });

  it('accepts alternatives (milk-tetra for milk-packet) and records the substitution', () => {
    const r = checkRequired(GROCERY, inv({ 'milk-tetra': 1, tomato: 2, potatoes: 1 }));
    expect(r.satisfied).toBe(true);
    expect(r.use['milk-tetra']).toBe(1);
    expect(r.substitutions).toEqual([{ wanted: 'milk-packet', got: 'milk-tetra' }]);
  });

  it('prefers the exact item over an alternative', () => {
    const r = checkRequired(GROCERY, inv({ 'milk-packet': 1, 'milk-tetra': 1, tomato: 2, potatoes: 1 }));
    expect(r.use['milk-packet']).toBe(1);
    expect(r.use['milk-tetra']).toBeUndefined();
  });

  it('reports partial quantities (1 of 2 tomatoes → missing qty 1)', () => {
    const r = checkRequired(GROCERY, inv({ 'milk-packet': 1, tomato: 1, potatoes: 1 }));
    expect(r.satisfied).toBe(false);
    expect(r.missing).toEqual([{ item: 'tomato', qty: 1 }]);
    expect(r.use.tomato).toBe(1);
  });

  it('ignores items that are not accepted (milkshake, cherry tomatoes)', () => {
    const r = checkRequired(GROCERY, inv({ 'milk-flavoured': 3, 'cherry-tomato': 4, potatoes: 1 }));
    expect(r.satisfied).toBe(false);
    expect(r.missing).toEqual([
      { item: 'milk-packet', qty: 1 },
      { item: 'tomato', qty: 2 },
    ]);
    expect(r.use).toEqual({ potatoes: 1 });
  });

  it('does not double-count one inventory item for two requirements', () => {
    const req: RequiredItem[] = [
      { item: 'milk-packet', qty: 1 },
      { item: 'milk-tetra', qty: 1, alternatives: ['milk-packet'] },
    ];
    const r = checkRequired(req, inv({ 'milk-packet': 1 }));
    expect(r.satisfied).toBe(false);
    expect(r.missing).toEqual([{ item: 'milk-tetra', qty: 1 }]);
  });

  it('does not mutate the inventory', () => {
    const i = inv({ tomato: 2 });
    checkRequired(GROCERY, i);
    expect(i.items).toEqual({ tomato: 2 });
  });
});

describe('clamp', () => {
  it('rounds and bounds', () => {
    expect(clamp(150)).toBe(100);
    expect(clamp(-3)).toBe(0);
    expect(clamp(42.6)).toBe(43);
    expect(clamp(3, 5, 50)).toBe(5);
  });
});

describe('timeScore', () => {
  it('no deadline → 85', () => {
    expect(timeScore(500, null, 0)).toBe(85);
  });

  it('on time scores 75–100 depending on margin', () => {
    expect(timeScore(0, 100, 0)).toBe(100); // finished instantly
    expect(timeScore(50, 100, 0)).toBe(88); // 75 + 12.5
    expect(timeScore(100, 100, 0)).toBe(75); // exactly on the deadline
    for (let t = 0; t <= 100; t += 5) {
      const s = timeScore(t, 100, 0);
      expect(s).toBeGreaterThanOrEqual(75);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it('late scores decay from 60 down to a floor of 15', () => {
    expect(timeScore(101, 100, 0)).toBe(58);
    expect(timeScore(110, 100, 0)).toBe(40);
    expect(timeScore(1000, 100, 0)).toBe(15);
    let prev = 61;
    for (let t = 100.5; t < 140; t += 2) {
      const s = timeScore(t, 100, 0);
      expect(s).toBeLessThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(15);
      expect(s).toBeLessThanOrEqual(60);
      prev = s;
    }
  });
});

describe('budgetScore', () => {
  it('no budget → 85', () => {
    expect(budgetScore(500, null, 0)).toBe(85);
  });

  it('within budget with no waste → 100', () => {
    expect(budgetScore(107, 150, 0)).toBe(100);
    expect(budgetScore(150, 150, 0)).toBe(100);
  });

  it('penalises money wasted on non-list items, floored at 40', () => {
    expect(budgetScore(112, 150, 5)).toBe(95);
    expect(budgetScore(140, 150, 30)).toBe(70);
    expect(budgetScore(150, 150, 150)).toBe(40);
  });

  it('over budget is capped at 50 and decays by 1 per rupee, floored at 5', () => {
    expect(budgetScore(151, 150, 0)).toBe(49);
    expect(budgetScore(187, 150, 0)).toBe(13);
    expect(budgetScore(500, 150, 0)).toBe(5);
  });

  // BUG: a zero budget (e.g. a parent assignment with budget 0) divides by zero:
  // budgetScore(0, 0, 0) → 0/0 = NaN, which propagates into result.overall/xp.
  // Suggested fix in validation.ts budgetScore(): treat budget <= 0 specially, e.g.
  //   if (budget <= 0) return spent <= 0 ? 100 : clamp(50 - spent, 5, 50);
  it('a zero budget yields a finite score', () => {
    expect(Number.isFinite(budgetScore(0, 0, 0))).toBe(true);
  });
});
