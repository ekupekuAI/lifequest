import { useState } from 'react';
import { store } from '../core/store';
import { formatClock, formatDuration, inventoryWeight } from '../core/systems';
import { ITEMS, formatMoney, itemName } from '../domain/items';
import { SKILL_LABELS, type SkillId } from '../domain/types';
import { fmt } from '../missions/format';
import { levelFor, useSnap } from './hooks';
import { Bar, Modal } from './Modal';
import { ItemIcon } from './art';
import { ShoppingChecklist } from './ShoppingList';
import { currentObjectiveId } from './HUD';

type Tab = 'mission' | 'bag' | 'money' | 'skills';
const TABS: { id: Tab; label: string }[] = [
  { id: 'mission', label: 'Task' },
  { id: 'bag', label: 'Bag' },
  { id: 'money', label: 'Money' },
  { id: 'skills', label: 'Skills' },
];
let lastTab: Tab = 'mission';

export const OUTCOME_LABEL = { completed: 'Completed', 'completed-late': 'Completed late', incomplete: 'Incomplete' } as const;
export const OUTCOME_TONE = { completed: 'good', 'completed-late': 'warn', incomplete: 'sky' } as const;

function MissionTab() {
  const { state } = useSnap();
  const run = state.run;
  const def = store.mission;
  if (!run || !def) {
    return (
      <div className="boxed">
        <p>No task right now.</p>
        <p className="muted small">Talk to a family member or check the notice board on the fridge to pick one up.</p>
      </div>
    );
  }
  const cur = currentObjectiveId();
  const left = store.timeLeft();
  return (
    <>
      <div className="row">
        <span style={{ fontSize: 26 }}>{def.icon}</span>
        <div className="grow">
          <div className="label" style={{ color: 'var(--gold)' }}>{def.title}</div>
          <div className="small muted">
            For {store.assigner()?.name ?? 'family'}
            {left !== null && <> · {left < 0 ? <span className="bad">late by {formatDuration(-left)}</span> : <>{formatDuration(left)} left</>}</>}
            {run.budget !== null && <> · budget left {formatMoney(run.budget - run.spent)}</>}
          </div>
        </div>
      </div>
      <div className="two-col">
        <div className="section">
          <h3>Objectives</h3>
          <ul className="objectives" style={{ paddingLeft: 12, marginTop: 0 }}>
            {def.objectives.map((o) => {
              const done = !!run.objectives[o.id]?.done;
              const sub = !done ? def.progress?.(state, o.id) : null;
              return (
                <li key={o.id} className={`obj ${done ? 'done' : ''} ${o.id === cur ? 'current' : ''}`}>
                  <span className={`check ${done ? 'on' : ''}`} aria-hidden>
                    ✓
                  </span>
                  <span>
                    {fmt(store, o.label)}
                    {sub && <span className="obj-sub">{sub}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        {def.requiredItems?.length ? (
          <div className="section">
            <h3>Shopping list</h3>
            <div className="boxed">
              <ShoppingChecklist state={state} />
            </div>
          </div>
        ) : null}
      </div>
      <div className="section">
        <h3>Instructions</h3>
        <ul className="bullets sky">
          {def.instructions.map((t, i) => (
            <li key={i}>{fmt(store, t)}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

function BagTab() {
  const { state } = useSnap();
  const inv = Object.entries(state.inventory.items).filter(([, q]) => q > 0);
  const weight = inventoryWeight(state.inventory);
  const cap = state.inventory.capacity;
  const basket = Object.entries(state.basket);
  return (
    <>
      <div className="section">
        <h3>Bag weight</h3>
        <div className="row">
          <span className="grow">
            <Bar value={weight} max={cap} tone={weight / cap > 0.85 ? 'bad' : weight / cap > 0.6 ? 'warn' : 'good'} label="Bag weight" />
          </span>
          <span className="small">
            {weight.toFixed(1)} / {cap}
          </span>
        </div>
      </div>
      <div className="section">
        <h3>In your bag</h3>
        {inv.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Weight</th>
              </tr>
            </thead>
            <tbody>
              {inv.map(([id, q]) => (
                <tr key={id}>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <ItemIcon id={id} size={24} />
                      {itemName(id)}
                    </span>
                  </td>
                  <td className="num">{q}</td>
                  <td className="num">{((ITEMS[id]?.weight ?? 0) * q).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small">Empty.</p>
        )}
      </div>
      <div className="section">
        <h3>In your hands ({state.hands.length}/2)</h3>
        <div className="row">
          {[0, 1].map((i) =>
            state.hands[i] ? (
              <span key={i} className="row small" style={{ gap: 4 }}>
                <span className="slot hand">
                  <ItemIcon id={state.hands[i]} size={32} />
                </span>
                {itemName(state.hands[i])}
              </span>
            ) : (
              <span key={i} className="slot hand empty" data-empty="HAND" />
            ),
          )}
        </div>
      </div>
      {basket.length > 0 && (
        <div className="section">
          <h3>Shop basket (unpaid)</h3>
          <ul className="checklist">
            {basket.map(([id, q]) => (
              <li key={id}>
                <ItemIcon id={id} size={20} /> {q}× {itemName(id)}
              </li>
            ))}
          </ul>
          <div className="row spread small">
            <span>Total</span>
            <b className="warn">{formatMoney(store.basketTotal())}</b>
          </div>
        </div>
      )}
    </>
  );
}

function MoneyTab() {
  const { state } = useSnap();
  const ledger = [...state.wallet.ledger].reverse();
  const receipts = [...state.receipts].reverse();
  return (
    <>
      <div className="kv">
        <div>
          <span className="label">Wallet</span>
          <b className="warn">{formatMoney(state.wallet.balance)}</b>
        </div>
        {state.run?.budget != null && (
          <div>
            <span className="label">Task budget</span>
            <b>
              {formatMoney(state.run.spent)} / {formatMoney(state.run.budget)}
            </b>
          </div>
        )}
      </div>
      <div className="section">
        <h3>Ledger</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>Time</th>
              <th>What</th>
              <th className="num">Amount</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((t, i) => (
              <tr key={i}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                  {formatClock(t.at)}
                </td>
                <td>{t.label}</td>
                <td className={`num ${t.amount < 0 ? 'bad' : 'good'}`}>
                  {t.amount < 0 ? '−' : '+'}
                  {formatMoney(Math.abs(t.amount))}
                </td>
                <td className="num">{formatMoney(t.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="section">
        <h3>Receipts</h3>
        {receipts.length ? (
          receipts.map((r, i) => (
            <div key={i} className="boxed small">
              <div className="row spread">
                <b className="label" style={{ color: 'var(--text)' }}>{r.store}</b>
                <span className="muted">{formatClock(r.at)}</span>
              </div>
              {r.lines.map((l, j) => (
                <div key={j} className="row spread">
                  <span>
                    {l.qty}× {l.name}
                  </span>
                  <span>{formatMoney(l.price * l.qty)}</span>
                </div>
              ))}
              <div className="row spread" style={{ borderTop: '1px dashed var(--frame)', marginTop: 3, paddingTop: 2 }}>
                <span>Total</span>
                <b className="warn">{formatMoney(r.total)}</b>
              </div>
            </div>
          ))
        ) : (
          <p className="muted small">No receipts yet. Shops give you one when you pay.</p>
        )}
      </div>
    </>
  );
}

function SkillsTab() {
  const { state } = useSnap();
  const lvl = levelFor(state.stats.xp);
  const skills = Object.entries(state.stats.skills) as [SkillId, number][];
  const max = Math.max(50, ...skills.map(([, v]) => v));
  return (
    <>
      <div className="row">
        <span className="level-badge" style={{ width: 34, height: 34, fontSize: 11 }}>
          {lvl.level}
        </span>
        <div className="grow">
          <div className="row spread small">
            <span>Level {lvl.level}</span>
            <span className="muted">
              {state.stats.xp} XP · {lvl.toNext} to next
            </span>
          </div>
          <Bar value={lvl.pct * 100} tone="warn" label="Level progress" />
        </div>
      </div>
      <div className="section">
        <h3>Life skills</h3>
        {skills.map(([id, v]) => (
          <div key={id} className="dim-row">
            <span>{SKILL_LABELS[id]}</span>
            <Bar value={v} max={max} tone="sky" label={SKILL_LABELS[id]} />
            <span className="v">{Math.round(v)}</span>
          </div>
        ))}
      </div>
      <div className="section">
        <h3>Badges</h3>
        {state.stats.badges.length ? (
          <div className="row wrap">
            {state.stats.badges.map((b) => (
              <span key={b} className="badge-earned">
                ★ {b}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted small">Finish a task with a great score to earn a badge.</p>
        )}
      </div>
      <div className="section">
        <h3>Recent results</h3>
        {state.results.length ? (
          <ul className="col" style={{ gap: 4 }}>
            {state.results.slice(0, 8).map((r) => (
              <li key={r.id} className="row boxed" style={{ padding: '4px 8px' }}>
                <span className="grow">
                  {r.title} <span className="tiny muted">· Day {r.day}</span>
                </span>
                <span className={`pill ${OUTCOME_TONE[r.outcome]}`}>{OUTCOME_LABEL[r.outcome]}</span>
                <b className="warn">{r.overall}</b>
                <button className="btn btn-sm" onClick={() => store.openModal({ type: 'results', resultId: r.id })}>
                  View
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No finished tasks yet.</p>
        )}
      </div>
    </>
  );
}

export default function JournalPanel() {
  const { state } = useSnap();
  const [tab, setTab] = useState<Tab>(lastTab);
  const pick = (t: Tab) => {
    lastTab = t;
    setTab(t);
  };
  return (
    <Modal title="Journal" icon="📓" size="md" onClose={() => store.openModal(null)}>
      {state.inQueue && (
        <p className="pill warn" style={{ alignSelf: 'flex-start' }}>
          ⏳ The queue keeps moving while you read
        </p>
      )}
      <div className="tabs" role="tablist" style={{ padding: 0, margin: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            onClick={() => pick(t.id)}
            onKeyDown={(e) => {
              const i = TABS.findIndex((x) => x.id === tab);
              if (e.key === 'ArrowRight') pick(TABS[(i + 1) % TABS.length].id);
              if (e.key === 'ArrowLeft') pick(TABS[(i + TABS.length - 1) % TABS.length].id);
            }}
            data-autofocus={tab === t.id ? true : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="col" style={{ gap: 10, borderTop: '2px solid var(--orange)', paddingTop: 10, marginTop: -10 }}>
        {tab === 'mission' && <MissionTab />}
        {tab === 'bag' && <BagTab />}
        {tab === 'money' && <MoneyTab />}
        {tab === 'skills' && <SkillsTab />}
      </div>
    </Modal>
  );
}
