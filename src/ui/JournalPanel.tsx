import RewardsBoard from './RewardsBoard';
import MemoryPanel from './MemoryPanel';
import { useState } from 'react';
import { store } from '../core/store';
import { formatClock, formatDuration, inventoryWeight } from '../core/systems';
import { ITEMS, formatMoney, itemName } from '../domain/items';
import { SKILL_LABELS, type SkillId } from '../domain/types';
import { ROLE_LABELS } from '../domain/family';
import { money } from '../domain/region';
import { ALLOWANCE_BASE, BUS, OPENING_HOURS, nextBus, scheduleFor } from '../domain/world';
import { fmt } from '../missions/format';
import { levelFor, useSnap } from './hooks';
import { Bar, Modal } from './Modal';
import { ItemIcon } from './art';
import { ShoppingChecklist } from './ShoppingList';
import { currentObjectiveId, hoursPlaceName, openStatus, time12 } from './HUD';
import { SCREEN_LIMITS } from '../core/conduct';
import { CONDUCT_ICON, batteryFor, cleanDay, phoneLock, todayConduct } from '../core/reels';
import './conduct.css';

type Tab = 'mission' | 'bag' | 'money' | 'savings' | 'town' | 'skills' | 'habits' | 'family' | 'rewards';
const TABS: { id: Tab; label: string }[] = [
  { id: 'mission', label: 'Task' },
  { id: 'bag', label: 'Bag' },
  { id: 'money', label: 'Money' },
  { id: 'savings', label: 'Savings' },
  { id: 'town', label: 'Town' },
  { id: 'skills', label: 'Skills' },
  { id: 'habits', label: 'Habits' },
  { id: 'family', label: 'Family' },
  { id: 'rewards', label: '🎁 Rewards' },
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
              {r.lines.map((l, j) => {
                const discount = l.price < 0;
                const returned = l.returned ?? 0;
                return (
                  <div key={j} className={`row spread rc-line ${discount ? 'rc-discount' : ''} ${returned ? 'rc-returned' : ''}`}>
                    <span>
                      {discount ? '🏷 ' : `${l.qty}× `}
                      {l.name}
                      {returned > 0 && <span className="pill sky rc-tag">{returned >= l.qty ? 'Returned' : `${returned} returned`}</span>}
                    </span>
                    <span className={discount ? 'good' : ''}>
                      {discount ? '−' : ''}
                      {formatMoney(Math.abs(l.price * l.qty))}
                    </span>
                  </div>
                );
              })}
              <div className="row spread" style={{ borderTop: '1px dashed var(--frame)', marginTop: 3, paddingTop: 2 }}>
                <span>Total</span>
                <b className="warn">{formatMoney(r.total)}</b>
              </div>
              {r.lines.some((l) => l.returned) && (
                <div className="row spread tiny">
                  <span className="muted">Refunded</span>
                  <span className="good">+{formatMoney(r.lines.reduce((n, l) => n + (l.returned ?? 0) * Math.max(0, l.price), 0))}</span>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="muted small">No receipts yet. Shops give you one when you pay.</p>
        )}
        {store.returnableLines().length > 0 && (
          <p className="tiny muted">Bought the wrong thing? FreshMart's service desk refunds unopened items on the same day with the receipt.</p>
        )}
      </div>
    </>
  );
}

function SavingsTab() {
  const { state } = useSnap();
  const sv = state.savings;
  const pct = Math.min(100, Math.round((sv.balance / Math.max(1, sv.target)) * 100));
  const allowance = money(ALLOWANCE_BASE);
  const daysLeft = Math.max(0, Math.ceil((sv.target - sv.balance) / Math.max(0.01, allowance)));
  const entries = [...state.wallet.ledger].reverse().filter((t) => /pocket money|savings|Saved toward/i.test(t.label)).slice(0, 10);
  return (
    <>
      <div className="row">
        <span style={{ fontSize: '1.6rem' }} aria-hidden>
          🐷
        </span>
        <div className="grow">
          <div className="label" style={{ color: 'var(--gold)' }}>Goal: {sv.goal}</div>
          <div className="row">
            <span className="grow">
              <Bar value={sv.balance} max={sv.target} tone={pct >= 100 ? 'good' : 'warn'} label={`Savings toward ${sv.goal}`} />
            </span>
            <span className="small">{pct}%</span>
          </div>
        </div>
      </div>
      <div className="kv">
        <div>
          <span className="label">Saved</span>
          <b className="good">{formatMoney(sv.balance)}</b>
        </div>
        <div>
          <span className="label">Target</span>
          <b>{formatMoney(sv.target)}</b>
        </div>
        <div>
          <span className="label">Wallet</span>
          <b className="warn">{formatMoney(state.wallet.balance)}</b>
        </div>
      </div>
      <div className="section">
        <h3>How it works</h3>
        <ul className="bullets mint">
          <li>Every morning you get {formatMoney(allowance)} pocket money.</li>
          <li>Use the piggy bank in your room to put money aside — or take some out if you really need it.</li>
          <li>
            {pct >= 100
              ? 'Goal reached — well done for being patient!'
              : `If you saved all your pocket money, you would reach the goal in about ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`}
          </li>
          <li>Every treat you buy is money not saved. Small choices add up.</li>
        </ul>
      </div>
      <div className="section">
        <h3>Recent savings &amp; pocket money</h3>
        {entries.length ? (
          <table className="tbl">
            <tbody>
              {entries.map((t, i) => {
                const saved = /Saved toward/.test(t.label);
                return (
                  <tr key={i}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {formatClock(t.at)}
                    </td>
                    <td>{t.label}</td>
                    <td className={`num ${saved ? 'warn' : t.amount < 0 ? 'bad' : 'good'}`}>
                      {saved ? '🐷 +' : t.amount < 0 ? '−' : '+'}
                      {formatMoney(Math.abs(t.amount))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted small">Nothing yet. Visit the piggy bank in your room to start saving.</p>
        )}
      </div>
    </>
  );
}

function TownTab() {
  const { state } = useSnap();
  const now = state.clock.minutes;
  const places = Object.keys(OPENING_HOURS).filter((k) => k !== 'bus');
  const busHours = OPENING_HOURS.bus;
  const departures = (route: 12 | 7) => {
    const out: number[] = [];
    const every = route === 12 ? BUS.route12Every : BUS.route7Every;
    let t = nextBus(now, route);
    for (let i = 0; i < 6 && out.length < 3; i++, t += every) {
      const m = t % 1440;
      if (!busHours || (m >= busHours.open && m < busHours.close)) out.push(t);
    }
    return out;
  };
  const routes = [
    { n: 12 as const, to: 'City centre & library', ok: true, every: BUS.route12Every, off: BUS.route12Offset },
    { n: 7 as const, to: 'Stadium — not the city!', ok: false, every: BUS.route7Every, off: BUS.route7Offset },
  ];
  const fam = state.profile.members.filter((m) => m.role !== 'player');
  return (
    <>
      <div className="section">
        <h3>Opening hours</h3>
        <table className="tbl">
          <tbody>
            {places.map((k) => {
              const st = openStatus(k, now);
              return (
                <tr key={k}>
                  <td>{hoursPlaceName(k)}</td>
                  <td className="muted">{store.hoursLabel(k)}</td>
                  <td className="num">
                    <span className={`pill ${!st?.open ? 'bad' : st.soon ? 'warn' : 'good'}`}>{!st?.open ? 'Closed' : st.soon ? 'Closing' : 'Open'}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <span className="tiny muted">Home and the street are always open.</span>
      </div>
      <div className="section">
        <h3>Bus timetable</h3>
        <div className="bus-grid">
          {routes.map((r) => {
            const deps = departures(r.n);
            return (
              <div key={r.n} className={`boxed bus-route ${r.ok ? 'ok' : 'wrong'}`}>
                <div className="row">
                  <span className="bus-no" aria-label={`Route ${r.n}`}>
                    {r.n}
                  </span>
                  <span className="small grow">→ {r.to}</span>
                </div>
                <span className="tiny muted">
                  Every {r.every} min, at :{String(r.off).padStart(2, '0')}
                </span>
                <span className="small">
                  {deps.length ? (
                    <>
                      Next:{' '}
                      {deps.map((t, i) => (
                        <span key={t}>
                          {i ? ' · ' : ''}
                          <span className={i === 0 ? 'warn' : ''}>{time12(t)}</span>
                          {i === 0 && <span className="muted"> ({Math.round(t - now) <= 0 ? 'at the stop now' : `in ${Math.round(t - now)} min`})</span>}
                        </span>
                      ))}
                    </>
                  ) : (
                    <>No more buses today · service {store.hoursLabel('bus')}</>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <span className="tiny muted">
          Ride: {BUS.rideMinutes} min. Ticket machine {formatMoney(money(BUS.ticketBase))} · cash to the driver {formatMoney(money(BUS.cashFareBase))}. Buses wait {BUS.dwell} min at the stop.
        </span>
      </div>
      {fam.length > 0 && (
        <div className="section">
          <h3>Family right now</h3>
          <ul className="col" style={{ gap: 3 }}>
            {fam.map((m) => {
              const sc = scheduleFor(m.role, now);
              return (
                <li key={m.id} className="row small family-row">
                  <span className="grow">
                    {m.name} <span className="tiny muted">{ROLE_LABELS[m.role]}</span>
                  </span>
                  <span className={sc.spot === 'away' ? 'muted' : ''}>
                    {sc.spot === 'away' ? 'Out' : sc.spot.replace(/^./, (c) => c.toUpperCase())} · {sc.activity || 'around the house'}
                  </span>
                </li>
              );
            })}
          </ul>
          <span className="tiny muted">Dinner is at 7 PM — everyone meets at the table.</span>
        </div>
      )}
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
      <div className="section">
        <h3>My reflections</h3>
        {state.reflections?.length ? (
          <ReflectionList list={state.reflections} />
        ) : (
          <p className="muted small">When you go to sleep, write a short note about your day. Your notes appear here.</p>
        )}
      </div>
    </>
  );
}

function HabitsTab() {
  const { state } = useSnap();
  const c = todayConduct(state);
  const lock = phoneLock(state);
  const lessons = c.log.filter((e) => e.lesson).slice(0, 5);
  const st = c.screenMinutes;
  return (
    <>
      <div className="section">
        <h3>Today</h3>
        <div className="dim-row habit-row">
          <span>📱 Screens</span>
          <Bar value={st} max={SCREEN_LIMITS.confiscate} tone={st >= SCREEN_LIMITS.scold ? 'bad' : st >= SCREEN_LIMITS.nudge ? 'warn' : 'good'} label="Screen time today" />
          <span className="v">{formatDuration(st)}</span>
        </div>
        <div className="dim-row habit-row">
          <span>😤 Sibling</span>
          <Bar value={c.tension} tone={c.tension >= 70 ? 'bad' : c.tension >= 40 ? 'warn' : 'good'} label="Sibling tension" />
          <span className="v">{c.tension >= 70 ? 'tense' : c.tension >= 40 ? 'upset' : 'calm'}</span>
        </div>
        <div className="kv conduct-kv">
          <div>
            <span className="label">Fights</span>
            <b className={c.fights ? 'bad' : ''}>{c.fights}</b>
          </div>
          <div>
            <span className="label">Road warnings</span>
            <b className={c.roadWarnings ? 'warn' : ''}>{c.roadWarnings}</b>
          </div>
          <div>
            <span className="label">Naps</span>
            <b>{formatDuration(c.napMinutes)}</b>
          </div>
          <div>
            <span className="label">Battery</span>
            <b>{batteryFor(st)}%</b>
          </div>
        </div>
        {lock.locked && lock.until !== null && <span className="pill bad" style={{ alignSelf: 'flex-start' }}>📵 Phone taken until {formatClock(lock.until)}</span>}
        {cleanDay(c) && <span className="small habit-good">✓ Good habits so far today. Keep it up!</span>}
        <span className="tiny muted">
          Screens: a reminder at {SCREEN_LIMITS.nudge} min, a parent steps in at {SCREEN_LIMITS.scold}, the phone goes away at {SCREEN_LIMITS.confiscate}. Counters reset each morning.
        </span>
      </div>
      <div className="section">
        <h3>Lessons learned</h3>
        {lessons.length ? (
          <ul className="col" style={{ gap: 4 }}>
            {lessons.map((e, i) => (
              <li key={`${e.day}-${e.at}-${i}`} className="row boxed habit-line" style={{ padding: '4px 8px', alignItems: 'flex-start' }}>
                <span aria-hidden>{CONDUCT_ICON[e.kind]}</span>
                <span className="grow">
                  {e.lesson}
                  <span className="tiny dim" style={{ display: 'block' }}>
                    {e.text} · Day {e.day}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Nothing yet — lessons from everyday choices (screens, siblings, roads) collect here.</p>
        )}
      </div>
    </>
  );
}

export function ReflectionList({ list, max = 10 }: { list: { day: number; wentWell: string; improve: string; mood: string }[]; max?: number }) {
  return (
    <ul className="col reflections">
      {list.slice(0, max).map((r, i) => (
        <li key={i} className="boxed small">
          <div className="row spread">
            <span className="label">Day {r.day}</span>
            {r.mood && (
              <span role="img" aria-label="Mood" className="refl-mood">
                {r.mood}
              </span>
            )}
          </div>
          {r.wentWell && (
            <div>
              <span className="good">✓ Went well:</span> {r.wentWell}
            </div>
          )}
          {r.improve && (
            <div>
              <span className="warn">↻ Next time:</span> {r.improve}
            </div>
          )}
        </li>
      ))}
    </ul>
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
        {tab === 'savings' && <SavingsTab />}
        {tab === 'town' && <TownTab />}
        {tab === 'skills' && <SkillsTab />}
        {tab === 'habits' && <HabitsTab />}
        {tab === 'family' && <MemoryPanel />}
        {tab === 'rewards' && <RewardsBoard mode="child" />}
      </div>
    </Modal>
  );
}
