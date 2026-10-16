import { useState } from 'react';
import { store } from '../core/store';
import { formatClock } from '../core/systems';
import { formatMoney, itemName } from '../domain/items';
import { fmt } from '../missions/format';
import { LOCATION_NAMES, levelFor, useSnap } from './hooks';
import { ItemIcon } from './art';
import { Bar, Key } from './Modal';

export function currentObjectiveId(): string | null {
  const run = store.state.run;
  const def = store.mission;
  if (!run || !def) return null;
  const ready = (o: (typeof def.objectives)[number]) => !run.objectives[o.id]?.done && !(o.dependsOn ?? []).some((d) => !run.objectives[d]?.done);
  return (def.objectives.find((o) => o.required && ready(o)) ?? def.objectives.find(ready) ?? def.objectives.find((o) => !run.objectives[o.id]?.done))?.id ?? null;
}

function MissionCard() {
  const { state } = useSnap();
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 480);
  const run = state.run;
  const def = store.mission;
  if (!run || !def) {
    return (
      <div className="panel mission-card free">
        <div className="label">Free time</div>
        <div>Talk to family or check the notice board for tasks.</div>
      </div>
    );
  }
  const cur = currentObjectiveId();
  const list = collapsed ? def.objectives.filter((o) => o.id === cur) : def.objectives;
  const doneCount = def.objectives.filter((o) => run.objectives[o.id]?.done).length;
  return (
    <section className="panel mission-card" aria-label="Current task">
      <header>
        <span className="m-icon" aria-hidden>
          {def.icon}
        </span>
        <h2 className="m-title">{def.title}</h2>
        <button
          className="icon-btn"
          style={{ width: 24, height: 24, fontSize: 11 }}
          onClick={() => store.openModal({ type: 'briefing', missionId: def.id, assignerId: run.assignerId, assignmentId: run.assignmentId, reopen: true })}
          aria-label="Open task briefing"
          title="Briefing"
        >
          i
        </button>
        <button
          className="icon-btn"
          style={{ width: 24, height: 24, fontSize: 11 }}
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Show all objectives' : 'Show current objective only'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▾' : '▴'}
        </button>
      </header>
      <ul className="objectives">
        {list.map((o) => {
          const done = !!run.objectives[o.id]?.done;
          const sub = !done ? def.progress?.(state, o.id) : null;
          return (
            <li key={o.id} className={`obj ${done ? 'done' : ''} ${o.id === cur ? 'current' : ''}`}>
              <span className={`check ${done ? 'on' : ''}`} aria-hidden>
                ✓
              </span>
              <span>
                <span className="sr-only">{done ? 'Done: ' : o.id === cur ? 'Current: ' : ''}</span>
                {fmt(store, o.label)}
                {sub && <span className="obj-sub">{sub}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {collapsed && (
        <div className="tiny dim" style={{ marginTop: 3 }}>
          {doneCount}/{def.objectives.length} done
        </div>
      )}
    </section>
  );
}

function StatusColumn() {
  const { state, ui } = useSnap();
  const left = store.timeLeft();
  const run = state.run;
  const lvl = levelFor(state.stats.xp);
  const energy = state.stats.energy;
  const budgetLeft = run?.budget != null ? run.budget - run.spent : null;
  return (
    <div className="hud-tr">
      <div className="panel stat-chip">
        <span className="clock">{formatClock(state.clock.minutes)}</span>
        <span className="label">Day {state.clock.day}</span>
      </div>
      {left !== null && (
        <span className={`pill deadline ${left < 0 ? 'late' : left < 10 ? 'urgent' : 'warn'}`} role="timer" aria-label="Time left">
          {left < 0 ? `LATE ${Math.ceil(-left)}m` : `⏱ ${Math.floor(left)}m left`}
        </span>
      )}
      <div className="panel stat-chip" title="Wallet">
        <span className="money">{formatMoney(state.wallet.balance)}</span>
        {budgetLeft !== null && (
          <span className={`label ${budgetLeft < 0 ? 'bad' : ''}`} title="Task budget remaining">
            budget {formatMoney(budgetLeft)}
          </span>
        )}
      </div>
      <div className="panel stat-chip" title={`Energy ${Math.round(energy)} · Level ${lvl.level} (${lvl.toNext} XP to next)`}>
        <span className="level">
          <span className="level-badge" aria-label={`Level ${lvl.level}`}>
            {lvl.level}
          </span>
        </span>
        <span className="col" style={{ gap: 2 }}>
          <span className="label">Energy</span>
          <span className="energy">
            <Bar value={energy} tone={energy < 25 ? 'bad' : energy < 50 ? 'warn' : 'good'} label="Energy" />
          </span>
        </span>
      </div>
      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
        <span className="pill ghost" style={{ background: 'var(--panel)' }}>
          ⌂ {LOCATION_NAMES[state.location] ?? state.location}
        </span>
      </div>
      <div className="row tiny" style={{ gap: 4, textShadow: '1px 1px 0 #000' }} title={ui.saveStatus.message} aria-live="polite">
        <span className={`save-dot ${ui.saveStatus.kind}`} />
        <span className="dim" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ui.saveStatus.message}
        </span>
      </div>
      <div className="hud-actions">
        <button className="btn" onClick={(e) => { e.currentTarget.blur(); store.openModal({ type: 'journal' }); }} title="Journal (J)" aria-label="Journal">
          📓<span className="lbl">J</span>
        </button>
        <button className="btn" onClick={(e) => { e.currentTarget.blur(); store.callHome(); }} title="Call home (P)" aria-label="Call home">
          📞<span className="lbl">P</span>
        </button>
        <button className="btn" onClick={(e) => { e.currentTarget.blur(); store.openModal({ type: 'pause' }); }} title="Pause (Esc)" aria-label="Pause">
          ❚❚
        </button>
      </div>
    </div>
  );
}

function Hotbar({ touch }: { touch: boolean }) {
  const { state, ui } = useSnap();
  const inv = Object.entries(state.inventory.items).filter(([, q]) => q > 0);
  const basketCount = Object.values(state.basket).reduce((a, b) => a + b, 0);
  const prompt = ui.prompt?.replace(/^\s*\[?E\]?\s{1,}/, '');
  return (
    <div className="hud-bottom">
      {prompt && !ui.dialogue && !ui.modal && !state.inQueue && (
        <div className="panel prompt" key={prompt}>
          {touch ? <span aria-hidden>✋</span> : <Key>E</Key>}
          <span>{prompt}</span>
        </div>
      )}
      <div className="panel hotbar" aria-label="Inventory">
        {inv.length ? (
          inv.map(([id, q]) => (
            <span className="slot" key={id} title={`${itemName(id)} ×${q}`}>
              <ItemIcon id={id} size={32} />
              {q > 1 && <span className="qty">{q}</span>}
            </span>
          ))
        ) : (
          <span className="slot empty" data-empty="BAG" title="Your bag is empty" />
        )}
        <span className="sep" aria-hidden />
        {[0, 1].map((i) => {
          const it = state.hands[i];
          return it ? (
            <span className="slot hand" key={i} title={`In hand: ${itemName(it)}`}>
              <ItemIcon id={it} size={32} />
            </span>
          ) : (
            <span className="slot hand empty" key={i} data-empty="HAND" title="Empty hand" />
          );
        })}
        {basketCount > 0 && (
          <>
            <span className="sep" aria-hidden />
            <button className="basket-chip btn-ghost" style={{ background: 'none', border: 0 }} onClick={() => store.openModal({ type: 'shelf', shelfId: 'basket' })} title="Edit basket">
              <span aria-hidden>🧺 {basketCount}</span>
              <span>{formatMoney(store.basketTotal())}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function HUD({ touch }: { touch: boolean }) {
  return (
    <>
      <div className="hud-tl">
        <MissionCard />
      </div>
      <StatusColumn />
      <Hotbar touch={touch} />
    </>
  );
}
