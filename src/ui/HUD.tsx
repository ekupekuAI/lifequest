import { useEffect, useState } from 'react';
import { store } from '../core/store';
import { region } from '../domain/region';
import { OPENING_HOURS } from '../domain/world';
import { formatClock } from '../core/systems';
import { formatMoney, itemName } from '../domain/items';
import { fmt } from '../missions/format';
import { dateTextWaiting } from '../missions/dateNight';
import { LOCATION_NAMES, levelFor, useSnap } from './hooks';
import { ItemIcon } from './art';
import { Bar, Key } from './Modal';
import { SCREEN_LIMITS } from '../core/conduct';
import { phoneLock, todayConduct } from '../core/reels';
import { formatDuration } from '../core/systems';
import { openPhone } from './PhoneReels';
import { currentSession } from '../services/family';
import { openVoiceInbox, useCallSnap } from './PhoneCall';
import { calls } from '../core/voiceMsg';

/** Phone button / P key: family games open the phone (voice notes + call home); otherwise call home. */
export function phonePress() {
  if (store.blocking) return;
  const unread = !store.state.run && dateTextWaiting(store);
  if ((currentSession() || calls.getSnapshot().inbox.length > 0) && !unread) openVoiceInbox();
  else store.callHome();
}

/** Small screen-time + sibling-mood chips (only shown when there's something to show). */
function ConductChips() {
  const { state } = useSnap();
  const c = todayConduct(state);
  const st = c.screenMinutes;
  if (st <= 0 && c.tension <= 0) return null;
  const tone = st >= SCREEN_LIMITS.scold ? 'bad' : st >= SCREEN_LIMITS.nudge ? 'warn' : 'ghost';
  return (
    <div className="conduct-chips">
      {st > 0 && (
        <span className={`pill st-chip ${tone}`} title={`Screen time today: ${formatDuration(st)} (reminder at ${SCREEN_LIMITS.nudge} min)`} aria-label={`Screen time today ${formatDuration(st)}`}>
          📱 {formatDuration(st)}
        </span>
      )}
      {c.tension > 0 && (
        <span className="pill mood-chip" title={`Sibling mood: ${c.tension >= 70 ? 'about to explode' : c.tension >= 40 ? 'upset' : 'a bit grumpy'}`} aria-label="Sibling mood">
          <span aria-hidden>{c.tension >= 40 ? '😤' : '😒'}</span>
          <Bar value={c.tension} tone={c.tension >= 70 ? 'bad' : 'warn'} label="Sibling tension" />
        </span>
      )}
    </div>
  );
}

const PLACE_LABEL: Record<string, string> = { home: 'Home', town: 'the street', grocery: 'FreshMart', clinic: 'the clinic', city: 'the city centre', library: 'the library' };
export const placeName = (loc: string) => LOCATION_NAMES[loc] ?? PLACE_LABEL[loc] ?? loc;

/** 12-hour clock label for minutes since midnight, e.g. 1170 → "7:30 PM". */
export function time12(m: number): string {
  const hh = Math.floor((m % 1440) / 60);
  const mm = Math.round(m % 60);
  return `${((hh + 11) % 12) + 1}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${hh < 12 ? 'AM' : 'PM'}`;
}

/** Display name for an OPENING_HOURS key ("the corner shop" → the region's kiosk name). */
export function hoursPlaceName(place: string): string {
  if (place === 'kiosk') return region().words.kioskName;
  const l = OPENING_HOURS[place]?.label ?? place;
  return l.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase());
}

/** Open/closed status for a place with opening hours (null if always open). */
export function openStatus(place: string, now: number): { open: boolean; soon: boolean; text: string } | null {
  const h = OPENING_HOURS[place];
  if (!h) return null;
  const m = now % 1440;
  const open = store.isOpen(place);
  if (open) {
    const left = h.close - m;
    return { open, soon: left <= 30, text: left <= 30 ? `closes in ${Math.max(1, Math.ceil(left))} min` : `open till ${time12(h.close)}` };
  }
  return { open, soon: false, text: m < h.open ? `closed · opens ${time12(h.open)}` : `closed · opens ${time12(h.open)} tomorrow` };
}

/** Which opening-hours entry describes where the player is standing. */
const HOURS_AT: Record<string, string> = { grocery: 'grocery', clinic: 'clinic', library: 'library', town: 'kiosk' };

function useShortScreen() {
  const q = '(max-height: 799px)';
  const [short, setShort] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const on = () => setShort(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return short;
}

export function currentObjectiveId(): string | null {
  const run = store.state.run;
  const def = store.mission;
  if (!run || !def) return null;
  const ready = (o: (typeof def.objectives)[number]) => !run.objectives[o.id]?.done && !(o.dependsOn ?? []).some((d) => !run.objectives[d]?.done);
  return (def.objectives.find((o) => o.required && ready(o)) ?? def.objectives.find(ready) ?? def.objectives.find((o) => !run.objectives[o.id]?.done))?.id ?? null;
}

function MissionCard() {
  const { state } = useSnap();
  const short = useShortScreen();
  const [userToggle, setUserToggle] = useState<boolean | null>(null);
  // auto-collapse on narrow or short screens unless the player chose otherwise
  const collapsed = userToggle ?? (short || (typeof window !== 'undefined' && window.innerWidth < 480));
  const setCollapsed = (f: (c: boolean) => boolean) => setUserToggle(f(collapsed));
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
  const target = store.currentTarget();
  const guide = target && target.location !== state.location ? `Head to ${placeName(target.location)}${target.via && target.via !== target.location ? ` · via ${placeName(target.via)}` : ''}` : null;
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
        {state.settings?.hints !== false && (
          <button className="icon-btn mc-hint" style={{ width: 24, height: 24, fontSize: 11 }} onClick={() => store.hint()} aria-label="Hint: what to do next" title="Hint">
            💡
          </button>
        )}
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
      <ul
        className={`objectives ${collapsed ? 'clickable' : ''}`}
        onClick={collapsed ? () => setCollapsed(() => false) : undefined}
        title={collapsed ? 'Show all objectives' : undefined}
      >
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
        <div className="mc-progress" aria-label={`${doneCount} of ${def.objectives.length} objectives done`}>
          <Bar value={doneCount} max={def.objectives.length} tone="warn" />
          <span className="tiny dim">
            {doneCount}/{def.objectives.length}
          </span>
        </div>
      )}
      {guide && (
        <div className="guide-line" aria-live="polite">
          <span aria-hidden>➜</span> {guide}
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
  const sv = state.savings;
  const hoursKey = HOURS_AT[state.location];
  const hours = hoursKey ? openStatus(hoursKey, state.clock.minutes) : null;
  const hints = state.settings?.hints !== false;
  const hintOn = hints && !!run && !!store.nextObjective();
  const { missed } = useCallSnap();
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
      <div
        className="panel stat-chip"
        title={`Wallet: ${formatMoney(state.wallet.balance)}${sv ? `
🐷 Savings: ${formatMoney(sv.balance)} of ${formatMoney(sv.target)} for ${sv.goal}` : ''}`}
      >
        <span className="money">{formatMoney(state.wallet.balance)}</span>
        {sv && sv.balance > 0 && (
          <span className="piggy" aria-label={`Savings ${formatMoney(sv.balance)}`}>
            🐷
          </span>
        )}
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
          ⌂ {placeName(state.location).replace(/^the /, '')}
        </span>
      </div>
      <ConductChips />
      {hours && hoursKey && (
        <span className={`pill hours-chip ${!hours.open ? 'bad' : hours.soon ? 'warn' : 'ghost'}`} title={`${hoursPlaceName(hoursKey)}: ${store.hoursLabel(hoursKey)}`}>
          {hoursPlaceName(hoursKey)} · {hours.text}
        </span>
      )}
      <div className="row tiny" style={{ gap: 4, textShadow: '1px 1px 0 #000' }} title={ui.saveStatus.message} aria-live="polite">
        <span className={`save-dot ${ui.saveStatus.kind}`} />
        <span className="dim" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ui.saveStatus.message}
        </span>
      </div>
      <div className="hud-actions">
        {hints && (
          <button
            className={`btn ${hintOn ? 'hint-ready' : ''}`}
            onClick={(e) => { e.currentTarget.blur(); store.hint(); }}
            title={hintOn ? 'Hint: what to do next (H)' : 'Hint (H)'}
            aria-label="Hint"
          >
            💡<span className="lbl">H</span>
          </button>
        )}
        <button
          className={`btn view-toggle ${ui.view3d ? 'on' : ''}`}
          onClick={(e) => { e.currentTarget.blur(); store.toggleView3d(); }}
          title={ui.view3d ? 'Back to 2D view (V)' : 'Switch to 3D view (V)'}
          aria-label={ui.view3d ? 'Switch to 2D view' : 'Switch to 3D view'}
          aria-pressed={ui.view3d}
        >
          {ui.view3d ? '2D' : '3D'}<span className="lbl">V</span>
        </button>
        <button className="btn" onClick={(e) => { e.currentTarget.blur(); store.openModal({ type: 'journal' }); }} title="Journal (J)" aria-label="Journal">
          📓<span className="lbl">J</span>
        </button>
        {(() => {
          const unread = !state.run && dateTextWaiting(store) ? 1 : 0;
          const count = unread + missed;
          const what = [missed ? `${missed} missed call${missed > 1 ? 's' : ''}` : '', unread ? '1 new message' : ''].filter(Boolean).join(', ');
          return (
            <button
              className={`btn ${missed ? 'phone-missed' : ''}`}
              style={{ position: 'relative' }}
              onClick={(e) => { e.currentTarget.blur(); phonePress(); }}
              title={count ? `Phone — ${what} (P)` : currentSession() ? 'Phone (P)' : 'Call home (P)'}
              aria-label={count ? `Phone, ${what}` : currentSession() ? 'Phone' : 'Call home'}
            >
              📞<span className="lbl">P</span>
              {count > 0 && (
                <span aria-hidden="true" style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: '#e4572e', color: '#fff', fontSize: 10, lineHeight: '16px', textAlign: 'center', fontWeight: 700 }}>
                  {count}
                </span>
              )}
            </button>
          );
        })()}
        {(() => {
          const lock = phoneLock(state);
          const label = lock.locked && lock.until !== null ? `Phone taken away until ${formatClock(lock.until)}` : 'Phone (R)';
          return (
            <button className={`btn phone-btn ${lock.locked ? 'locked' : ''}`} onClick={(e) => { e.currentTarget.blur(); openPhone(); }} title={label} aria-label={label}>
              📱<span className="lbl">R</span>
              {lock.locked && <span className="lock" aria-hidden>🔒</span>}
            </button>
          );
        })()}
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
