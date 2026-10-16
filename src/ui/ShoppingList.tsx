import type { GameState } from '../domain/types';
import { itemName } from '../domain/items';
import { getMission } from '../missions/registry';
import { ItemIcon } from './art';

export function shoppingRows(state: GameState) {
  const def = state.run ? getMission(state.run.missionId) : undefined;
  if (!def?.requiredItems?.length) return null;
  return def.requiredItems.map((r) => {
    const ids = [r.item, ...(r.alternatives ?? [])];
    const bag = ids.reduce((n, x) => n + (state.inventory.items[x] ?? 0), 0);
    const basket = ids.reduce((n, x) => n + (state.basket[x] ?? 0), 0);
    return { ...r, bag, basket, have: bag + basket, done: bag + basket >= r.qty };
  });
}

/** Checklist of the mission's required items, ticked against bag + basket (alternatives count). */
export function ShoppingChecklist({ state, compact = false }: { state: GameState; compact?: boolean }) {
  const rows = shoppingRows(state);
  if (!rows) return <p className="muted small">No shopping list for this task.</p>;
  return (
    <ul className="checklist">
      {rows.map((r) => (
        <li key={r.item}>
          <span className={`check ${r.done ? 'on' : ''}`} aria-hidden>
            ✓
          </span>
          {!compact && <ItemIcon id={r.item} size={20} />}
          <span className="grow">
            <span className="sr-only">{r.done ? 'Got: ' : 'Need: '}</span>
            {r.qty}× {itemName(r.item)}
            <span className={`tiny ${r.done ? 'good' : 'muted'}`}>
              {' '}
              ({Math.min(r.have, r.qty)}/{r.qty}
              {r.basket > 0 && r.bag < r.qty ? ', in basket' : ''})
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
