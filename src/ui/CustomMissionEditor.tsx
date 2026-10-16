// Parent UI: turn the family's real shopping list into a mission ("Mum's list").
import { useMemo, useState } from 'react';
import type { CustomMissionSpec, CustomStore } from '../domain/types';
import { formatMoney } from '../domain/items';
import { money, region } from '../domain/region';
import { CUSTOM_LIMITS, briefingText, estimateCost, normalizeSpec, parseItemLine, resolveItem, storeName } from '../missions/custom';
import './familyExtras.css';

const QUICK = ['Milk', 'Bread', 'Eggs', 'Tomatoes', 'Potatoes', 'Onions', 'Bananas', 'Rice', 'Carrots', 'Chips'];
const STORES: { id: CustomStore; icon: string; blurb: string }[] = [
  { id: 'grocery', icon: '🛒', blurb: 'Big shop · checkout queue' },
  { id: 'kiosk', icon: '🏪', blurb: 'Corner shop · quick, pricier' },
  { id: 'market', icon: '🥕', blurb: 'Market cart · fresh, haggle' },
];
const DEADLINES = [30, 45, 60, 90, 120];

interface Row {
  key: number;
  name: string;
  qty: number;
}

export default function CustomMissionEditor({
  onSubmit,
  onCancel,
  assignerName = 'Mum',
  childName = 'your child',
  submitLabel,
}: {
  onSubmit(spec: CustomMissionSpec): void;
  onCancel(): void;
  assignerName?: string;
  childName?: string;
  submitLabel?: string;
}) {
  const [title, setTitle] = useState(`${assignerName}'s shopping list`);
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState('');
  const [store, setStore] = useState<CustomStore>('grocery');
  const [budget, setBudget] = useState('');
  const [deadline, setDeadline] = useState(60);
  const [note, setNote] = useState('');
  const [nextKey, setNextKey] = useState(1);
  const cur = region().currency;

  const add = (text: string) => {
    const parsed = parseItemLine(text);
    const name = parsed.name.replace(/^./, (c) => c.toUpperCase());
    const qty = parsed.qty;
    if (!name.trim()) return;
    setRows((rs) => {
      const same = rs.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (same) return rs.map((r) => (r === same ? { ...r, qty: Math.min(CUSTOM_LIMITS.qty, r.qty + qty) } : r));
      if (rs.length >= CUSTOM_LIMITS.items) return rs;
      return [...rs, { key: nextKey, name, qty }];
    });
    setNextKey((k) => k + 1);
  };
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  const items = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name, qty: r.qty }));
  const estimate = useMemo(() => estimateCost({ items, store }), [JSON.stringify(items), store]);
  const suggested = useMemo(() => estimateCost({ items, store }, 0.15), [JSON.stringify(items), store]);
  const budgetNum = budget.trim() === '' ? suggested : Math.max(0, Math.min(money(5000), Number(budget) || 0));
  const spec = normalizeSpec({ title, items, store, budget: budgetNum || suggested, deadlineMinutes: deadline, note });
  const tight = items.length > 0 && budgetNum < estimate;

  return (
    <div className="cme col" aria-label="Custom shopping mission">
      <label className="field">
        <span className="label">Mission name</span>
        <input type="text" maxLength={CUSTOM_LIMITS.titleLen} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <div className="section">
        <h3>What should they buy?</h3>
        <div className="chips" aria-label="Quick add">
          {QUICK.map((q) => (
            <button key={q} type="button" className="chip" onClick={() => add(q)} disabled={rows.length >= CUSTOM_LIMITS.items}>
              + {q}
            </button>
          ))}
        </div>
        <form
          className="row cme-add"
          onSubmit={(e) => {
            e.preventDefault();
            add(draft);
            setDraft('');
          }}
        >
          <input
            type="text"
            className="grow"
            maxLength={CUSTOM_LIMITS.nameLen + 6}
            placeholder='Type an item, e.g. "Eggs ×6"'
            aria-label="New item"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn btn-sm" type="submit" disabled={!draft.trim() || rows.length >= CUSTOM_LIMITS.items}>
            Add
          </button>
        </form>
        {rows.length === 0 ? (
          <p className="small muted">Nothing on the list yet — tap a chip or type an item.</p>
        ) : (
          <ul className="cme-rows">
            {rows.map((r) => {
              const it = resolveItem({ name: r.name, qty: r.qty }, store);
              return (
                <li key={r.key} className="cme-row">
                  <input
                    type="text"
                    className="grow"
                    aria-label="Item name"
                    maxLength={CUSTOM_LIMITS.nameLen}
                    value={r.name}
                    onChange={(e) => update(r.key, { name: e.target.value })}
                  />
                  <span className="stepper">
                    <button type="button" className="icon-btn" aria-label={`One less ${r.name}`} onClick={() => update(r.key, { qty: Math.max(1, r.qty - 1) })}>
                      −
                    </button>
                    <span className="q" aria-label="quantity">
                      {r.qty}
                    </span>
                    <button type="button" className="icon-btn" aria-label={`One more ${r.name}`} onClick={() => update(r.key, { qty: Math.min(CUSTOM_LIMITS.qty, r.qty + 1) })}>
                      +
                    </button>
                  </span>
                  <span className={`tiny cme-map ${it.known ? 'good' : 'muted'}`} title={it.known ? 'Sold in the game' : 'Added to the "Family list" shelf'}>
                    {it.known ? '✓' : '📝'} ~{formatMoney(money(it.price) * r.qty)}
                  </span>
                  <button type="button" className="icon-btn" aria-label={`Remove ${r.name}`} onClick={() => remove(r.key)}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="section">
        <h3>Where?</h3>
        <div className="chips" role="radiogroup" aria-label="Store">
          {STORES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={store === s.id} className="chip cme-store" onClick={() => setStore(s.id)}>
              <span>
                {s.icon} {storeName(s.id)}
              </span>
              <span className="tiny muted">{s.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="tpl-fields">
        <label className="field">
          <span className="label">
            Budget ({cur.symbol} {cur.code})
          </span>
          <input
            type="number"
            inputMode={cur.decimals ? 'decimal' : 'numeric'}
            min={0}
            max={money(5000)}
            step={cur.step}
            placeholder={String(suggested)}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <span className="tiny muted">
            Estimate {formatMoney(estimate)} · suggested {formatMoney(suggested)} (+15%)
          </span>
        </label>
        <label className="field">
          <span className="label">Be back within</span>
          <select value={deadline} onChange={(e) => setDeadline(Number(e.target.value))}>
            {DEADLINES.map((d) => (
              <option key={d} value={d}>
                {d} minutes (game time)
              </option>
            ))}
          </select>
        </label>
      </div>
      {tight && (
        <p className="small warn" role="status">
          ⚠ The budget is below the estimate — fine if you want them to compare prices!
        </p>
      )}
      <label className="field">
        <span className="label">Note (optional)</span>
        <input type="text" maxLength={CUSTOM_LIMITS.noteLen} placeholder="e.g. Brown bread if they have it" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="boxed cme-preview" aria-live="polite">
        <span className="label">Preview of the briefing</span>
        <p className="small">
          <b>{assignerName}:</b> {items.length ? briefingText(spec) : 'Add something to the list to see the briefing.'}
        </p>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-good" disabled={!items.length} onClick={() => onSubmit(spec)}>
          {submitLabel ?? `Send list to ${childName}`}
        </button>
      </div>
    </div>
  );
}
