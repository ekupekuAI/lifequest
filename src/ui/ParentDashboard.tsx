import CustomMissionEditor from './CustomMissionEditor';
import RewardsBoard from './RewardsBoard';
import { assignCustomMission } from '../missions/custom';
import { useState } from 'react';
import { store } from '../core/store';
import { formatClock } from '../core/systems';
import { GUARDIAN_ROLES, type MissionStatus } from '../domain/types';
import { ROLE_LABELS } from '../domain/family';
import { formatMoney } from '../domain/items';
import { money, region } from '../domain/region';
import { UPCOMING, getMission } from '../missions/registry';
import { useSnap } from './hooks';
import { Modal, Stars } from './Modal';
import { Portrait } from './art';
import { OUTCOME_LABEL, OUTCOME_TONE, ReflectionList } from './JournalPanel';
import { SCREEN_LIMITS, markAlertsRead } from '../core/conduct';
import { CONDUCT_ICON, CONDUCT_LABEL, SEVERITY_LABEL, cleanDay, phoneLock, todayConduct, unreadAlerts } from '../core/reels';
import { formatDuration } from '../core/systems';
import type { GameState } from '../domain/types';
import './conduct.css';

/** Who responded to a conduct event (member id, or an NPC key). */
const responder = (by?: string) => (by ? (store.member(by)?.name ?? by.replace(/^npc:/, '')) : null);

function BehaviourSection({ state, player }: { state: GameState; player: string }) {
  const c = todayConduct(state);
  const lock = phoneLock(state);
  const alerts = state.conduct?.alerts ?? [];
  const unread = unreadAlerts(state);
  const log = c.log.slice(0, 12);
  const stTone = c.screenMinutes >= SCREEN_LIMITS.scold ? 'bad' : c.screenMinutes >= SCREEN_LIMITS.nudge ? 'warn' : '';
  return (
    <div className="section behaviour">
      <h3>
        Behaviour · today{unread > 0 && <span className="pd-badge" aria-label={`${unread} unread alerts`}>{unread}</span>}
      </h3>
      <p className="muted behaviour-copy" style={{ margin: 0 }}>
        If you're not online, LifeQuest's built-in parent reacts for you — these alerts show what happened.
      </p>
      <div className="kv conduct-kv">
        <div title={`Reminder at ${SCREEN_LIMITS.nudge} min · scolding at ${SCREEN_LIMITS.scold} · phone taken at ${SCREEN_LIMITS.confiscate}`}>
          <span className="label">📱 Screen time</span>
          <b className={stTone}>{formatDuration(c.screenMinutes)}</b>
        </div>
        <div>
          <span className="label">🥊 Fights</span>
          <b className={c.fights ? 'bad' : ''}>{c.fights}</b>
        </div>
        <div>
          <span className="label">🚸 Road warnings</span>
          <b className={c.roadWarnings ? 'warn' : ''}>{c.roadWarnings}</b>
        </div>
        <div>
          <span className="label">😴 Naps</span>
          <b>{formatDuration(c.napMinutes)}</b>
        </div>
      </div>
      {(lock.locked || c.tvBanned) && (
        <div className="row wrap" style={{ gap: 4 }}>
          {lock.locked && lock.until !== null && <span className="pill bad">📵 Phone taken until {formatClock(lock.until)}</span>}
          {c.tvBanned && <span className="pill bad">📺 No TV today</span>}
        </div>
      )}
      {cleanDay(c) && !log.some((e) => e.day === state.clock.day) && (
        <p className="small habit-good boxed" style={{ margin: 0 }}>
          ✓ A calm day so far — no screen-time, sibling or road-safety issues for {player}.
        </p>
      )}

      {alerts.length > 0 && (
        <>
          <div className="row spread">
            <span className="label">Alerts</span>
            <button className="btn btn-sm" disabled={!unread} onClick={() => markAlertsRead(store)}>
              Mark all as read
            </button>
          </div>
          <ul className="alert-list">
            {alerts.slice(0, 8).map((a) => (
              <li key={a.id} className={`alert-row ${a.read ? 'read' : 'unread'}`}>
                <span aria-hidden>{CONDUCT_ICON[a.kind]}</span>
                <span className="grow">
                  {a.text}
                  <span className="tiny dim" style={{ display: 'block' }}>
                    Day {a.day} · {formatClock(a.at)}
                  </span>
                </span>
                {!a.read && <span className="new">NEW</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <span className="label">Timeline</span>
      {log.length ? (
        <ol className="conduct-log" aria-label="Behaviour timeline">
          {log.map((e, i) => {
            const who = responder(e.by);
            return (
              <li key={`${e.day}-${e.at}-${i}`} className={`log-row sev-${e.severity}`}>
                <span className="ico" aria-hidden>
                  {CONDUCT_ICON[e.kind]}
                </span>
                <span className="small">
                  {e.text}
                  {e.lesson && <span className="cl-lesson">💡 {e.lesson}</span>}
                  <span className="meta">
                    {CONDUCT_LABEL[e.kind]} · {SEVERITY_LABEL[e.severity]} · Day {e.day} {formatClock(e.at)}
                    {who && ` · handled by ${who}`}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted small boxed" style={{ margin: 0 }}>
          Nothing yet. Screen time, sibling fights and road-safety moments show up here as they happen.
        </p>
      )}
    </div>
  );
}

const STATUS_TONE: Partial<Record<MissionStatus, string>> = {
  assigned: 'sky',
  'in-progress': 'warn',
  completed: 'good',
  incomplete: 'bad',
  cancelled: 'ghost',
};

const clampNum = (v: string, lo: number, hi: number, step = 1): number | null => {
  if (v.trim() === '') return null;
  const n = Math.round(Math.round(Number(v) / step) * step * 100) / 100;
  if (!Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, n));
};

export default function ParentDashboard({ onClose, fromTitle = false }: { onClose: () => void; fromTitle?: boolean }) {
  const { state } = useSnap();
  const members = state.profile.members;
  const guardians = members.filter((m) => GUARDIAN_ROLES.includes(m.role));
  const [by, setBy] = useState(guardians[0]?.id ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const [budget, setBudget] = useState<Record<string, string>>({});
  const [deadline, setDeadline] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  // playable templates first; new missions appear here automatically from the registry
  const templates = store
    .availableMissions()
    // the optional teen date storyline is the player's own social life, not a family chore
    .filter((x) => x.def.category !== 'social')
    .filter((x) => !x.def.id.startsWith('custom:'))
    .sort((a, b) => Number(b.avail.ok) - Number(a.avail.ok));
  const cur = region().currency;
  const maxBudget = money(5000);
  const diff = store.diff;
  const player = members.find((m) => m.role === 'player');
  const [listOpen, setListOpen] = useState(false);

  function assign(missionId: string) {
    const def = getMission(missionId);
    if (!def || !by) return;
    const who = store.member(by);
    store.assign({
      missionId,
      assignedTo: 'player',
      assignedBy: by,
      budget: def.budget ? clampNum(budget[missionId] ?? '', 0, maxBudget, cur.step) : null,
      deadlineMinutes: clampNum(deadline[missionId] ?? '', 5, 600),
      note: (note[missionId] ?? '').replace(/[<>]/g, '').trim().slice(0, 80) || undefined,
    });
    const msg = `Assigned! Ask ${player?.name ?? 'the player'} to talk to ${who?.name ?? 'you'}.`;
    store.toast(msg, 'good');
    setFlash(msg);
    setSelected(null);
  }

  async function playNow() {
    await store.save();
    await store.continueGame();
  }

  const asgs = state.assignments;

  return (
    <Modal
      title={
        <>
          Parent dashboard
          {unreadAlerts(state) > 0 && (
            <span className="pd-badge" title="Unread behaviour alerts">
              {unreadAlerts(state)}
            </span>
          )}
        </>
      }
      label="Parent dashboard"
      icon="⚑"
      size="lg"
      onClose={onClose}
      closeLabel={fromTitle ? 'Back to title' : 'Close'}
      footer={
        <>
          <span className="tiny muted grow" style={{ alignSelf: 'center' }}>
            Tasks are simulated practice. Talk about the results together.
          </span>
          {fromTitle ? (
            <>
              <button className="btn btn-ghost" onClick={onClose}>
                Back to title
              </button>
              <button className="btn btn-primary" onClick={playNow}>
                Play now ▶
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          )}
        </>
      }
    >
      {flash && (
        <p className="pill good" role="status" style={{ alignSelf: 'flex-start', whiteSpace: 'normal' }}>
          {flash}
        </p>
      )}
      <div className="row wrap parent-meta">
        <span className="pill sky" title={diff.blurb}>
          Difficulty: {diff.label}
        </span>
        <span className="pill ghost">
          {region().flag} {region().label} · {cur.code} ({cur.symbol})
        </span>
        <span className="tiny muted grow">{diff.blurb} Change it in Settings.</span>
      </div>
      <div className="parent-grid">
        <div className="col">
          <div className="section">
            <h3>Assign to</h3>
            <div className="member-pick" role="radiogroup" aria-label="Family member">
              {members.map((m) => (
                <button
                  key={m.id}
                  className="member-btn"
                  role="radio"
                  aria-checked={m.role === 'player'}
                  disabled={m.role !== 'player'}
                  title={m.role === 'player' ? undefined : 'Only the player can receive tasks in this version'}
                >
                  <Portrait id={m.id} size={28} />
                  {m.name}
                  <span className="tiny muted">{ROLE_LABELS[m.role]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="section">
            <h3>Assigned by</h3>
            <div className="member-pick" role="radiogroup" aria-label="Assigned by">
              {guardians.map((g) => (
                <button key={g.id} className="member-btn" role="radio" aria-checked={by === g.id} onClick={() => setBy(g.id)}>
                  <Portrait id={g.id} size={28} />
                  {g.name}
                </button>
              ))}
              {!guardians.length && <p className="muted small">No guardian in this family.</p>}
            </div>
            <span className="tiny muted">The player picks up the task by talking to this person at home.</span>
          </div>
          <div className="section">
            <h3>Real shopping list</h3>
            {listOpen ? (
              <CustomMissionEditor
                assignerName={store.member(by)?.name}
                childName={player?.name}
                onCancel={() => setListOpen(false)}
                onSubmit={(spec) => {
                  assignCustomMission(store, spec, by);
                  setFlash(`List sent! Ask ${player?.name ?? 'the player'} to talk to ${store.member(by)?.name ?? 'you'}.`);
                  setListOpen(false);
                }}
              />
            ) : (
              <button className="btn btn-good" disabled={!by} onClick={() => setListOpen(true)}>
                📝 Turn your real shopping list into a mission
              </button>
            )}
          </div>
          <div className="section">
            <h3>Family rewards</h3>
            <RewardsBoard mode="parent" />
          </div>
          <div className="section">
            <h3>Task templates</h3>
            {templates.map(({ def, avail }) => {
              const open = selected === def.id;
              return (
                <div key={def.id} className="tpl" aria-current={open}>
                  <button className="tpl-head" onClick={() => setSelected(open ? null : def.id)} aria-expanded={open}>
                    <span style={{ fontSize: 20 }}>{def.icon}</span>
                    <span className="t">{def.title}</span>
                    <Stars n={def.difficulty} />
                    <span className="muted">{open ? '▴' : '▾'}</span>
                  </button>
                  <span className="small muted">{def.summary}</span>
                  {!avail.ok && <span className="small bad">✕ {avail.reason ?? 'Not available for this family right now'}</span>}
                  {open && (
                    <>
                      <div className="tpl-fields">
                        {def.budget ? (
                          <label className="field">
                            <span className="label">
                              Budget ({cur.symbol} {cur.code})
                            </span>
                            <input
                              type="number"
                              inputMode={cur.decimals ? 'decimal' : 'numeric'}
                              min={0}
                              max={maxBudget}
                              step={cur.step}
                              placeholder={String(money(def.budget * diff.budgetMul))}
                              value={budget[def.id] ?? ''}
                              onChange={(e) => setBudget((b) => ({ ...b, [def.id]: e.target.value }))}
                            />
                          </label>
                        ) : (
                          <span className="field">
                            <span className="label">Budget</span>
                            <span className="small muted">No money needed</span>
                          </span>
                        )}
                        <label className="field">
                          <span className="label">Time limit (min)</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={5}
                            max={600}
                            placeholder={def.deadlineMinutes ? String(Math.round(def.deadlineMinutes * diff.deadlineMul)) : 'none'}
                            value={deadline[def.id] ?? ''}
                            onChange={(e) => setDeadline((d) => ({ ...d, [def.id]: e.target.value }))}
                          />
                        </label>
                      </div>
                      <label className="field">
                        <span className="label">Note (optional)</span>
                        <input
                          type="text"
                          maxLength={80}
                          placeholder="e.g. Please be back before dinner"
                          value={note[def.id] ?? ''}
                          onChange={(e) => setNote((n) => ({ ...n, [def.id]: e.target.value }))}
                        />
                      </label>
                      <button className="btn btn-good" disabled={!avail.ok || !by} onClick={() => assign(def.id)}>
                        Assign to {player?.name ?? 'player'}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="section soon">
            <h3>Coming soon</h3>
            <div className="row wrap" style={{ gap: 4 }}>
              {UPCOMING.map((u) => (
                <span key={u} className="pill ghost" aria-disabled="true" title="Not playable yet">
                  {u}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="col">
          <BehaviourSection state={state} player={player?.name ?? 'the player'} />
          <div className="section">
            <h3>Reflections</h3>
            {state.reflections?.length ? (
              <ReflectionList list={state.reflections} max={6} />
            ) : (
              <p className="muted small boxed">
                End-of-day notes appear here after {player?.name ?? 'the player'} goes to sleep in the game. They're a great way to start a chat about the day.
              </p>
            )}
          </div>
          <div className="section">
            <h3>Assignments</h3>
            {asgs.length === 0 && <p className="muted small boxed">No tasks assigned yet. Pick a template to start.</p>}
            {asgs.map((a) => {
              const def = getMission(a.missionId);
              const res = a.resultId ? state.results.find((r) => r.id === a.resultId) : undefined;
              return (
                <div key={a.id} className="tpl">
                  <div className="row">
                    <span style={{ fontSize: 18 }}>{def?.icon ?? '•'}</span>
                    <span className="grow small">
                      <b style={{ fontWeight: 'normal' }}>{def?.title ?? a.missionId}</b>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        by {store.member(a.assignedBy)?.name ?? '—'} · set {formatClock(a.createdAt)}
                        {a.budget != null && ` · ${formatMoney(a.budget)}`}
                        {a.deadlineMinutes != null && ` · ${a.deadlineMinutes} min`}
                      </span>
                    </span>
                    <span className={`pill ${STATUS_TONE[a.status] ?? ''}`}>{a.status.replace('-', ' ')}</span>
                  </div>
                  {a.note && <span className="tiny muted">“{a.note}”</span>}
                  {res && (
                    <div className="boxed small">
                      <div className="row spread">
                        <span className={`pill ${OUTCOME_TONE[res.outcome]}`}>{OUTCOME_LABEL[res.outcome]}</span>
                        <b className="warn">Score {res.overall}</b>
                      </div>
                      {res.feedback[0] && <p style={{ margin: '4px 0 0' }}>{res.feedback[0]}</p>}
                      {!fromTitle && (
                        <button className="btn btn-sm" style={{ marginTop: 4 }} onClick={() => store.openModal({ type: 'results', resultId: res.id })}>
                          Full report
                        </button>
                      )}
                    </div>
                  )}
                  {a.status === 'assigned' && (
                    <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => store.cancelAssignment(a.id)}>
                      Cancel
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
