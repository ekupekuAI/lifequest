// Mission validation helpers — pure functions, unit tested.
import type { Inventory } from '../domain/types';
import type { RequiredItem } from './types';

export interface RequirementCheck {
  satisfied: boolean;
  missing: { item: string; qty: number }[];
  /** which inventory items would be used to satisfy the list */
  use: Record<string, number>;
  substitutions: { wanted: string; got: string }[];
}

export function checkRequired(required: RequiredItem[], inv: Inventory): RequirementCheck {
  const pool = { ...inv.items };
  const use: Record<string, number> = {};
  const missing: { item: string; qty: number }[] = [];
  const substitutions: { wanted: string; got: string }[] = [];
  for (const r of required) {
    let need = r.qty;
    const take = (id: string) => {
      const have = pool[id] ?? 0;
      const n = Math.min(have, need);
      if (n > 0) {
        pool[id] = have - n;
        use[id] = (use[id] ?? 0) + n;
        need -= n;
        if (id !== r.item) substitutions.push({ wanted: r.item, got: id });
      }
    };
    take(r.item);
    for (const alt of r.alternatives ?? []) if (need > 0) take(alt);
    if (need > 0) missing.push({ item: r.item, qty: need });
  }
  return { satisfied: missing.length === 0, missing, use, substitutions };
}

export function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Time score: on time earns 75–100 depending on margin; late decays. */
export function timeScore(finishedAt: number, deadlineAt: number | null, startedAt: number): number {
  if (deadlineAt === null) return 85;
  const total = deadlineAt - startedAt;
  const left = deadlineAt - finishedAt;
  if (left >= 0) return clamp(75 + 25 * (left / Math.max(1, total)));
  return clamp(60 + left * 2, 15, 60);
}

/** Budget score: within budget earns up to 100, minus money wasted on non-list items. */
export function budgetScore(spent: number, budget: number | null, wasted: number): number {
  if (budget === null) return 85;
  if (budget <= 0) return spent <= 0 ? 100 : clamp(50 - spent, 5, 50);
  if (spent <= budget) return clamp(100 - (wasted / budget) * 150, 40, 100);
  return clamp(50 - (spent - budget), 5, 50);
}
