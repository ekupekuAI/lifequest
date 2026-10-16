import CustomMissionEditor from './CustomMissionEditor';
import RewardsBoard from './RewardsBoard';
import { customAssignment } from '../missions/custom';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { store } from '../core/store';
import { formatClock, formatDuration } from '../core/systems';
import {
  currentSession,
  fetchAssignments,
  fetchFamilyProfile,
  fetchMessages,
  fetchStatuses,
  leaveFamilyOnThisDevice,
  multiplayerAvailable,
  previewCode,
  pushAssignment,
  regenerateCodes,
  releaseSeat,
  sendMessage,
  sendVoiceMessage,
  subscribeFamily,
  updateAssignment,
  type FamilyMessage,
  type FamilySeat,
  type FamilySession,
  type LiveStatus,
} from '../services/family';
import type { Assignment, MissionStatus, Profile, Settings } from '../domain/types';
import { ROLE_LABELS } from '../domain/family';
import { REGIONS, formatMoneyIn, money, region, setRegion } from '../domain/region';
import { DIFFICULTY } from '../domain/world';
import { MISSIONS, getMission } from '../missions/registry';
import { LOCATION_NAMES, isTypingTarget, useTicker } from './hooks';
import { Bar, Modal, Stars } from './Modal';
import { Portrait, kindOf } from './art';
import { OUTCOME_LABEL, OUTCOME_TONE } from './JournalPanel';
import { CopyButton, Loading, friendlyError, seatLook } from './FamilyGate';
import './family.css';
import VoiceRecorder, { VoicePlayer, voiceUrls } from './VoiceRecorder';
import { isVoice } from '../core/voiceMsg';

type LiveAssignment = Assignment & { toGameMemberId: string };

const LOCATION_ICONS: Record<string, string> = { home: '🏠', town: '🏘️', grocery: '🛒', clinic: '🏥', city: '🏙️', library: '📚' };
const NUDGES = ["Don't forget the milk! 🥛", 'Dinner in 10 minutes!', 'Proud of you ⭐', 'Call me when you can 📞'];
const MAX_MSG = 140;
const STATUS_TONE: Partial<Record<MissionStatus, string>> = { assigned: 'sky', 'in-progress': 'warn', completed: 'good', incomplete: 'bad', cancelled: 'ghost' };

const clean = (s: string, max: number) => s.replace(/[<>]/g, '').trim().slice(0, max);
const clampNum = (v: string, lo: number, hi: number, step = 1): number | null => {
  if (v.trim() === '') return null;
  const n = Math.round(Math.round(Number(v) / step) * step * 100) / 100;
  if (!Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, n));
};

function ago(iso: string | number, now = Date.now()): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function fmtMoney(n: number, symbol: string) {
  const r = Object.values(REGIONS).find((x) => x.currency.symbol === symbol) ?? region();
  return formatMoneyIn(n, r.currency.symbol === symbol ? r : { ...r, currency: { ...r.currency, symbol } });
}

function byId<T>(list: T[], key: (t: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const x of list) seen.set(key(x), x);
  return [...seen.values()];
}

interface Child {
  gameMemberId: string;
  name: string;
  role: FamilySeat['role'];
  seat?: FamilySeat;
  status?: LiveStatus;
}

export default function ParentLive() {
  const [session, setSession] = useState<FamilySession | null>(() => currentSession());
  if (!session) return <NoSession />;
  return <Dashboard session={session} onCodes={(c) => setSession({ ...session, ...c })} />;
}

function NoSession() {
  return (
    <div className="screen fam screen-scroll">
      <div className="fam-inner">
        <header className="setup-head">
          <button className="icon-btn" onClick={() => store.goToScreen('start')} aria-label="Back to title">
            ←
          </button>
          <h1>Parent dashboard</h1>
        </header>
        <section className="panel fam-card">
          <p className="fam-lead">This device isn't connected to a family yet.</p>
          <p className="muted">Create a family, or join one with the parent code another grown-up gave you.</p>
          <div className="fam-cta">
            <button className="btn btn-primary btn-lg" onClick={() => store.goToScreen('family')} autoFocus>
              Family setup ▶
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

type Confirm = null | { text: string; yes: string; run: () => Promise<void> | void };

function Dashboard({ session, onCodes }: { session: FamilySession; onCodes: (c: { familyCode: string; parentCode: string }) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [statuses, setStatuses] = useState<Record<string, LiveStatus>>({});
  const [assignments, setAssignments] = useState<LiveAssignment[]>([]);
  const [messages, setMessages] = useState<FamilyMessage[]>([]);
  const [seats, setSeats] = useState<FamilySeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [flash, setFlash] = useState<string | null>(null);
  useTicker(15_000);

  const loadSeats = useCallback(async () => {
    const codes = [session.familyCode, session.parentCode].filter(Boolean) as string[];
    const previews = await Promise.all(codes.map((c) => previewCode(c).catch(() => null)));
    const all = previews.flatMap((p) => p?.seats ?? []);
    if (all.length) setSeats(byId(all, (s) => s.memberId));
  }, [session.familyCode, session.parentCode]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    const [prof, sts, asg, msgs] = await Promise.allSettled([fetchFamilyProfile(), fetchStatuses(), fetchAssignments(), fetchMessages(40)]);
    if (prof.status === 'fulfilled' && prof.value) {
      setRegion(prof.value.settings.region);
      setProfile(prof.value.profile);
      setSettings(prof.value.settings);
    }
    if (sts.status === 'fulfilled') setStatuses(Object.fromEntries(sts.value.map((s) => [s.gameMemberId, s])));
    if (asg.status === 'fulfilled') setAssignments(asg.value);
    if (msgs.status === 'fulfilled') setMessages(msgs.value);
    const failed = [prof, sts, asg, msgs].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failed) setLoadErr(friendlyError(failed.reason));
    else if (!multiplayerAvailable()) setLoadErr(friendlyError(new Error('not implemented')));
    await loadSeats();
    setLoading(false);
  }, [loadSeats]);

  useEffect(() => {
    load();
    let unsub = () => {};
    try {
      unsub = subscribeFamily({
        onStatus: (s) => setStatuses((m) => ({ ...m, [s.gameMemberId]: s })),
        onAssignment: (a) => setAssignments((l) => byId([...l, a], (x) => x.id)),
        onMessage: (msg) => setMessages((l) => byId([...l, msg], (x) => x.id)),
        onSeats: (s) => setSeats(s),
      });
    } catch (e) {
      setLoadErr(friendlyError(e));
    }
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      unsub();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 3500);
    return () => window.clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isTypingTarget(e.target)) return;
      if (confirm) setConfirm(null);
      else store.goToScreen('start');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm]);

  const nameOf = useCallback(
    (id: string | null) => {
      if (id === null) return 'everyone';
      return statuses[id]?.name ?? seats.find((s) => s.gameMemberId === id)?.name ?? profile?.members.find((m) => m.id === id)?.name ?? 'someone';
    },
    [statuses, seats, profile],
  );

  const children: Child[] = useMemo(() => {
    const map = new Map<string, Child>();
    for (const s of seats.filter((x) => x.kind === 'child')) map.set(s.gameMemberId, { gameMemberId: s.gameMemberId, name: s.name, role: s.role, seat: s });
    for (const st of Object.values(statuses)) {
      const prev = map.get(st.gameMemberId);
      map.set(st.gameMemberId, { gameMemberId: st.gameMemberId, name: st.name || prev?.name || 'Player', role: prev?.role ?? 'player', seat: prev?.seat, status: st });
    }
    return [...map.values()].sort((a, b) => Number(!!b.status) - Number(!!a.status) || a.name.localeCompare(b.name));
  }, [seats, statuses]);

  const state: 'live' | 'offline' | 'connecting' = loading ? 'connecting' : !online || loadErr ? 'offline' : 'live';

  const ask = (text: string, yes: string, run: () => Promise<void> | void) => setConfirm({ text, yes, run });

  return (
    <div className="screen fam screen-scroll">
      <div className="fam-inner wide">
        <header className="pl-head">
          <button className="icon-btn" onClick={() => store.goToScreen('start')} aria-label="Back to title" title="Back (Esc)">
            ←
          </button>
          <div className="pl-title">
            <h1>{session.familyName}</h1>
            <span className="pl-conn" role="status" aria-live="polite">
              <span className={`pl-dot ${state}`} aria-hidden />
              {state === 'live' ? 'Live' : state === 'connecting' ? 'Connecting…' : 'Offline'}
              <span className="dim">· you are {session.displayName}</span>
            </span>
          </div>
          <div className="pl-codes">
            <CodeChip label="Kids" code={session.familyCode} />
            {session.parentCode && <CodeChip label="Grown-ups" code={session.parentCode} secret />}
          </div>
          <button
            className="btn btn-ghost"
            onClick={() =>
              ask('Leave this family on this device? Nothing is deleted — you can join again with the parent code.', 'Leave', () => {
                leaveFamilyOnThisDevice();
                store.goToScreen('start');
              })
            }
          >
            Leave this device
          </button>
        </header>

        {loadErr && (
          <div className="fam-error row wrap" role="alert">
            <span className="grow">{loadErr}</span>
            <button className="btn btn-sm" onClick={load}>
              ↻ Retry
            </button>
          </div>
        )}
        {flash && (
          <p className="fam-ok" role="status">
            {flash}
          </p>
        )}

        <div className="pl-grid">
          <main className="col" aria-label="Children">
            {loading && !children.length ? (
              <section className="panel pl-empty">
                <Loading>Loading your family…</Loading>
              </section>
            ) : children.length === 0 ? (
              <section className="panel pl-empty col">
                <p className="fam-lead">No kids have joined yet.</p>
                <p className="muted">Share the kids' code ({session.familyCode}). When they join and play, you'll see them here live.</p>
              </section>
            ) : (
              <div className="pl-kids">
                {children.map((c) => (
                  <ChildCard
                    key={c.gameMemberId}
                    child={c}
                    session={session}
                    profile={profile}
                    settings={settings}
                    assignments={assignments.filter((a) => a.toGameMemberId === c.gameMemberId || a.assignedTo === c.gameMemberId)}
                    onAssigned={(a) => {
                      setAssignments((l) => byId([...l, a], (x) => x.id));
                      setFlash(`Task sent to ${c.name}!`);
                    }}
                    onCancel={async (a) => {
                      await updateAssignment(a.id, { status: 'cancelled' });
                      setAssignments((l) => l.map((x) => (x.id === a.id ? { ...x, status: 'cancelled' } : x)));
                    }}
                    onSent={(m) => {
                      setFlash(`Message sent to ${c.name}.`);
                      fetchMessages(40)
                        .then((list) => setMessages((l) => byId([...l, ...list], (x) => x.id)))
                        .catch(() => {});
                      void m;
                    }}
                  />
                ))}
              </div>
            )}
          </main>

          <aside className="pl-side">
            <Feed
              messages={messages}
              nameOf={nameOf}
              onSent={() =>
                fetchMessages(40)
                  .then((list) => setMessages((l) => byId([...l, ...list], (x) => x.id)))
                  .catch(() => {})
              }
            />
            <SeatsPanel
              seats={seats}
              session={session}
              profile={profile}
              onRelease={(s) =>
                ask(`Remove ${s.name}'s device from the family? They can join again with a code.`, 'Remove', async () => {
                  await releaseSeat(s.memberId);
                  setSeats((l) => l.map((x) => (x.memberId === s.memberId ? { ...x, claimed: false } : x)));
                  setFlash(`${s.name}'s device was removed.`);
                })
              }
              onRegenerate={() =>
                ask('Make new codes? The old codes stop working. People already in the family stay in.', 'Make new codes', async () => {
                  const c = await regenerateCodes();
                  onCodes(c);
                  setFlash('New codes are ready. Share the new kids code.');
                })
              }
            />
          </aside>
        </div>
      </div>

      {confirm && <ConfirmBox confirm={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function ConfirmBox({ confirm, onClose }: { confirm: NonNullable<Confirm>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function yes() {
    setBusy(true);
    setErr(null);
    try {
      await confirm.run();
      onClose();
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Are you sure?"
      icon="?"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} data-autofocus disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={yes} disabled={busy}>
            {busy ? 'Working…' : confirm.yes}
          </button>
        </>
      }
    >
      <p>{confirm.text}</p>
      {err && (
        <p className="fam-error" role="alert">
          {err}
        </p>
      )}
    </Modal>
  );
}

function CodeChip({ label, code, secret = false }: { label: string; code: string; secret?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="pl-codechip">
      <span className="label">{label}</span>
      <button
        type="button"
        className="fam-link"
        style={{ textDecoration: 'none', padding: 0 }}
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? `Hide ${label} code` : `Show ${label} code`}
        aria-expanded={shown}
      >
        <code>{shown ? code : '••••-••••'}</code>
      </button>
      {shown && <CopyButton text={code} label={`Copy ${label} code`} />}
      {secret && !shown && (
        <span className="tiny dim" aria-hidden>
          private
        </span>
      )}
    </span>
  );
}

function memberLook(child: { gameMemberId: string; role: FamilySeat['role'] }, profile: Profile | null) {
  const m = profile?.members.find((x) => x.id === child.gameMemberId);
  if (m) return { appearance: m.appearance, kind: kindOf(m.role) };
  return seatLook(child.role);
}

function ChildCard({
  child,
  session,
  profile,
  settings,
  assignments,
  onAssigned,
  onCancel,
  onSent,
}: {
  child: Child;
  session: FamilySession;
  profile: Profile | null;
  settings: Settings | null;
  assignments: LiveAssignment[];
  onAssigned: (a: LiveAssignment) => void;
  onCancel: (a: LiveAssignment) => Promise<void>;
  onSent: (text: string) => void;
}) {
  const [panel, setPanel] = useState<null | 'assign' | 'nudge' | 'voice'>(null);
  const st = child.status;
  const look = memberLook(child, profile);
  const now = Date.now();
  const fresh = st ? now - Date.parse(st.updatedAt) < 60_000 : false;
  const playing = !!st && st.online && fresh;
  const reflection = st?.reflections?.length ? [...st.reflections].sort((a, b) => b.day - a.day)[0] : null;
  const timeline = [...assignments].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const notJoined = !st && child.seat && !child.seat.claimed;
  const mission = st?.mission;
  const outcome = st?.lastResult?.outcome as keyof typeof OUTCOME_LABEL | undefined;

  return (
    <article className="panel pl-kid" aria-labelledby={`kid-${child.gameMemberId}`}>
      <div className="pl-kid-head">
        <Portrait id={`live-${child.gameMemberId}`} appearance={look.appearance} kind={look.kind} size={48} alt="" />
        <div className="grow col" style={{ gap: 2 }}>
          <span className="pl-kid-name" id={`kid-${child.gameMemberId}`}>
            {child.name}
          </span>
          <span className={`pl-seen ${playing ? 'now' : ''}`}>
            <span className={`pl-dot ${playing ? 'live' : st?.online ? '' : 'offline'}`} aria-hidden />
            {playing ? 'Playing now' : st ? `Last seen ${ago(st.updatedAt, now)}` : notJoined ? "Hasn't joined yet" : 'No game data yet'}
          </span>
        </div>
      </div>

      {st ? (
        <>
          <div className="pl-facts">
            <div className="pl-fact">
              <span className="label">Where</span>
              <span className="v">
                <span aria-hidden>{LOCATION_ICONS[st.location] ?? '📍'}</span> {LOCATION_NAMES[st.location] ?? st.location}
              </span>
            </div>
            <div className="pl-fact">
              <span className="label">Game time</span>
              <span className="v">
                Day {st.clock.day} · {formatClock(st.clock.minutes)}
              </span>
            </div>
            <div className="pl-fact">
              <span className="label">Money</span>
              <span className="v">{fmtMoney(st.wallet, st.currency)}</span>
            </div>
            <div className="pl-fact">
              <span className="label">Energy</span>
              <Bar value={st.energy} max={100} tone={st.energy < 25 ? 'bad' : st.energy < 50 ? 'warn' : 'good'} label={`${child.name}'s energy`} />
            </div>
          </div>

          {mission ? (
            <div className="pl-mission" aria-label="Current task">
              <span className="pl-mission-title">
                <span className="ic" aria-hidden>
                  {mission.icon}
                </span>
                <span className="grow">{mission.title}</span>
                {mission.timeLeft != null && (
                  <span className={`pill ${mission.timeLeft < 10 ? 'warn' : 'sky'}`} title="Game time left">
                    ⏱ {formatDuration(mission.timeLeft)}
                  </span>
                )}
              </span>
              <Bar value={mission.objectivesDone} max={Math.max(1, mission.objectivesTotal)} tone="sky" label={`${mission.objectivesDone} of ${mission.objectivesTotal} steps done`} />
              <span className="tiny muted">
                {mission.objectivesDone}/{mission.objectivesTotal} steps
                {mission.budget != null && ` · spent ${fmtMoney(mission.spent, st.currency)} of ${fmtMoney(mission.budget, st.currency)}`}
              </span>
              {mission.nextObjective && (
                <span className="pl-next">
                  <span className="dim">Next:</span> {mission.nextObjective}
                </span>
              )}
            </div>
          ) : (
            <p className="muted small boxed">No task right now — a good moment to assign one.</p>
          )}

          {st.lastResult && (
            <div className="boxed small col" style={{ gap: 4 }}>
              <div className="row spread wrap">
                <span className="label">Last result · Day {st.lastResult.day}</span>
                {outcome && OUTCOME_LABEL[outcome] ? <span className={`pill ${OUTCOME_TONE[outcome]}`}>{OUTCOME_LABEL[outcome]}</span> : <span className="pill">{st.lastResult.outcome}</span>}
              </div>
              <div className="row spread">
                <span>{st.lastResult.title}</span>
                <b className="warn" style={{ fontWeight: 'normal' }}>
                  Score {st.lastResult.overall}
                </b>
              </div>
              {st.lastResult.feedback && <span className="tiny muted">{st.lastResult.feedback}</span>}
            </div>
          )}

          {reflection && (
            <div className="boxed small col" style={{ gap: 4 }}>
              <div className="row spread">
                <span className="label">Day {reflection.day} reflection</span>
                {reflection.mood && (
                  <span role="img" aria-label="Mood" className="refl-mood">
                    {reflection.mood}
                  </span>
                )}
              </div>
              {reflection.wentWell && (
                <span>
                  <span className="good">＋</span> {reflection.wentWell}
                </span>
              )}
              {reflection.improve && (
                <span>
                  <span className="warn">→</span> {reflection.improve}
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="muted small boxed">{notJoined ? 'Share the kids code so they can pick this name and start playing.' : 'Details appear here once they start playing.'}</p>
      )}

      <div className="pl-actions">
        <button className={`btn ${panel === 'assign' ? 'btn-primary' : ''}`} aria-expanded={panel === 'assign'} onClick={() => setPanel((p) => (p === 'assign' ? null : 'assign'))}>
          ⚑ Assign a task
        </button>
        <button className={`btn ${panel === 'nudge' ? 'btn-primary' : ''}`} aria-expanded={panel === 'nudge'} onClick={() => setPanel((p) => (p === 'nudge' ? null : 'nudge'))}>
          💬 Send a nudge
        </button>
        <button className={`btn ${panel === 'voice' ? 'btn-primary' : ''}`} aria-expanded={panel === 'voice'} onClick={() => setPanel((p) => (p === 'voice' ? null : 'voice'))}>
          🎙️ Voice note
        </button>
      </div>

      {panel === 'assign' && (
        <AssignPanel
          child={child}
          session={session}
          settings={settings}
          onDone={(a) => {
            onAssigned(a);
            setPanel(null);
          }}
        />
      )}
      {(panel === 'nudge' || panel === 'voice') && (
        <NudgePanel
          key={panel}
          voiceFirst={panel === 'voice'}
          to={child.gameMemberId}
          toName={child.name}
          onSent={(t) => {
            onSent(t);
            setPanel(null);
          }}
        />
      )}

      {timeline.length > 0 && (
        <div className="col" style={{ gap: 4 }}>
          <span className="label">Recent tasks</span>
          <ul className="pl-timeline">
            {timeline.map((a) => {
              const def = getMission(a.missionId);
              const tone = STATUS_TONE[a.status] ?? '';
              return (
                <li key={a.id} className={`pl-tl-item ${tone}`}>
                  <span aria-hidden>{def?.icon ?? '•'}</span>
                  <span className="grow">
                    {def?.title ?? a.missionId}
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {ago(a.createdAt)}
                      {a.note && ` · “${a.note}”`}
                    </span>
                  </span>
                  <span className={`pill ${tone}`}>{a.status.replace('-', ' ')}</span>
                  {a.status === 'assigned' && <CancelBtn onCancel={() => onCancel(a)} />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}

function CancelBtn({ onCancel }: { onCancel: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-sm btn-ghost"
      disabled={busy}
      aria-label="Cancel this task"
      onClick={async () => {
        setBusy(true);
        try {
          await onCancel();
        } catch {
          /* status stays as it was */
        } finally {
          setBusy(false);
        }
      }}
    >
      ✕
    </button>
  );
}

function AssignPanel({ child, session, settings, onDone }: { child: Child; session: FamilySession; settings: Settings | null; onDone: (a: LiveAssignment) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [budget, setBudget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const templates = MISSIONS.filter((m) => m.category !== 'social');
  const diff = DIFFICULTY[settings?.difficulty ?? 'normal'];
  const cur = region().currency;
  const maxBudget = money(5000);

  async function send(missionId: string) {
    const def = getMission(missionId);
    if (!def) return;
    setBusy(true);
    setErr(null);
    const a: LiveAssignment = {
      id: crypto.randomUUID(),
      missionId,
      assignedTo: child.gameMemberId,
      assignedBy: session.gameMemberId,
      budget: def.budget ? clampNum(budget, 0, maxBudget, cur.step) : null,
      deadlineMinutes: clampNum(deadline, 5, 600),
      note: clean(note, 80) || undefined,
      status: 'assigned',
      createdAt: Date.now(),
      toGameMemberId: child.gameMemberId,
    };
    try {
      const { toGameMemberId: _to, ...plain } = a;
      await pushAssignment(plain, child.gameMemberId);
      onDone(a);
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <div className="pl-panel" role="group" aria-label={`Assign a task to ${child.name}`}>
      {listOpen ? (
        <CustomMissionEditor
          assignerName={session.displayName}
          childName={child.name}
          onCancel={() => setListOpen(false)}
          onSubmit={async (spec) => {
            setErr(null);
            try {
              const asg = customAssignment(spec, session.gameMemberId, child.gameMemberId);
              await pushAssignment(asg, child.gameMemberId);
              setListOpen(false);
              onDone({ ...asg, toGameMemberId: child.gameMemberId } as LiveAssignment);
            } catch (e) {
              setErr(friendlyError(e));
            }
          }}
        />
      ) : (
        <button className="btn btn-good" onClick={() => setListOpen(true)}>
          📝 Our real shopping list…
        </button>
      )}
      <span className="label">Pick a task for {child.name}</span>
      <div className="pl-tpl-list scroll">
        {templates.map((def) => {
          const open = selected === def.id;
          return (
            <div key={def.id} className="tpl" aria-current={open}>
              <button
                className="tpl-head"
                onClick={() => {
                  setSelected(open ? null : def.id);
                  setBudget('');
                  setDeadline('');
                  setNote('');
                  setErr(null);
                }}
                aria-expanded={open}
              >
                <span style={{ fontSize: 20 }} aria-hidden>
                  {def.icon}
                </span>
                <span className="t">{def.title}</span>
                <Stars n={def.difficulty} />
                <span className="muted" aria-hidden>
                  {open ? '▴' : '▾'}
                </span>
              </button>
              <span className="small muted">{def.summary}</span>
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
                          value={budget}
                          onChange={(e) => setBudget(e.target.value)}
                        />
                      </label>
                    ) : (
                      <span className="field">
                        <span className="label">Budget</span>
                        <span className="small muted">No money needed</span>
                      </span>
                    )}
                    <label className="field">
                      <span className="label">Time limit (game min)</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={5}
                        max={600}
                        placeholder={def.deadlineMinutes ? String(Math.round(def.deadlineMinutes * diff.deadlineMul)) : 'none'}
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span className="label">Note (optional)</span>
                    <input type="text" maxLength={80} placeholder="e.g. Please be back before dinner" value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  {err && (
                    <p className="fam-error" role="alert">
                      {err}
                    </p>
                  )}
                  <button className="btn btn-good btn-lg" disabled={busy} onClick={() => send(def.id)}>
                    {busy ? 'Sending…' : `Send to ${child.name}`}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <span className="tiny muted">Leave budget or time empty to use the game's usual amount. {child.name} gets the task in their game right away.</span>
    </div>
  );
}

function NudgePanel({ to, toName, onSent, voiceFirst = false }: { to: string | null; toName: string; onSent: (text: string) => void; voiceFirst?: boolean }) {
  const [voiceMode, setVoiceMode] = useState(voiceFirst);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const msg = clean(text, MAX_MSG);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!msg) return;
    setBusy(true);
    setErr(null);
    try {
      await sendMessage(to, msg);
      setText('');
      onSent(msg);
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setBusy(false);
    }
  }

  if (voiceMode)
    return (
      <div className="pl-panel" aria-label={`Voice note to ${toName}`}>
        <div className="row spread wrap">
          <span className="label">🎙️ Voice note to {toName}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setVoiceMode(false)}>
            💬 Type instead
          </button>
        </div>
        <VoiceRecorder
          toLabel={`to ${toName}`}
          onSend={async (blob, ms) => {
            await sendVoiceMessage(to, blob, ms);
            onSent('🎤 Voice message');
          }}
        />
        <span className="tiny muted">{to ? `${toName}'s phone rings in the game and they hear your voice.` : "Everyone's phone rings in their game."}</span>
      </div>
    );

  return (
    <form className="pl-panel" onSubmit={send} aria-label={`Message ${toName}`}>
      <div className="pl-nudges" aria-label="Quick messages">
        {NUDGES.map((n) => (
          <button key={n} type="button" className="chip" aria-pressed={text === n} onClick={() => setText(n)}>
            {n}
          </button>
        ))}
        <button type="button" className="chip vr-chip" onClick={() => setVoiceMode(true)}>
          🎙️ Voice note
        </button>
      </div>
      <label className="field">
        <span className="label">Message to {toName}</span>
        <input type="text" value={text} maxLength={MAX_MSG} placeholder="Type a short message…" onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </label>
      <span className="pl-count" aria-hidden>
        {text.length}/{MAX_MSG}
      </span>
      {err && (
        <p className="fam-error" role="alert">
          {err}
        </p>
      )}
      <button type="submit" className="btn btn-sky btn-lg" disabled={busy || !msg}>
        {busy ? 'Sending…' : 'Send ▶'}
      </button>
    </form>
  );
}

function Feed({ messages, nameOf, onSent }: { messages: FamilyMessage[]; nameOf: (id: string | null) => string; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const list = [...messages].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 30);
  return (
    <section className="panel fam-card" aria-labelledby="feed-h">
      <div className="row spread">
        <h2 id="feed-h" className="eyebrow">
          Family feed
        </h2>
        <button className="btn btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : '✚ Message everyone'}
        </button>
      </div>
      {open && (
        <NudgePanel
          to={null}
          toName="everyone"
          onSent={() => {
            setOpen(false);
            onSent();
          }}
        />
      )}
      {list.length === 0 ? (
        <p className="muted small">No messages yet. Nudges you send show up here.</p>
      ) : (
        <ul className="pl-feed scroll" aria-live="polite">
          {list.map((m) => (
            <li key={m.id} className="pl-msg">
              <div className="meta">
                <span>
                  {m.fromName} → {nameOf(m.toGameMemberId)}
                </span>
                <span>{ago(m.createdAt)}</span>
              </div>
              {isVoice(m) ? (
                <div className="pl-voice">
                  <span className="tiny muted">🎤 Voice message</span>
                  <VoicePlayer id={m.id} src={() => voiceUrls.get(m.audioPath)} durationMs={m.durationMs} label={`Voice message from ${m.fromName}`} />
                </div>
              ) : (
                m.text
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeatsPanel({
  seats,
  session,
  profile,
  onRelease,
  onRegenerate,
}: {
  seats: FamilySeat[];
  session: FamilySession;
  profile: Profile | null;
  onRelease: (s: FamilySeat) => void;
  onRegenerate: () => void;
}) {
  const group = (kind: 'parent' | 'child', title: string) => {
    const list = seats.filter((s) => s.kind === kind);
    return (
      <div className="col" style={{ gap: 2 }}>
        <span className="label">{title}</span>
        {list.length === 0 && <span className="small muted">None yet</span>}
        {list.map((s) => {
          const look = memberLook(s, profile);
          const me = s.memberId === session.memberId;
          return (
            <div key={s.memberId} className="pl-seat-row">
              <Portrait id={`seat-row-${s.memberId}`} appearance={look.appearance} kind={look.kind} size={30} alt="" />
              <span className="grow">
                {s.name}
                {me && <span className="dim"> (you)</span>}
                <span className="tiny muted" style={{ display: 'block' }}>
                  {s.kind === 'child' && s.role === 'player' ? 'Child' : ROLE_LABELS[s.role] ?? s.role} · {s.claimed ? 'joined' : 'not joined'}
                </span>
              </span>
              {s.claimed && !me && (
                <button className="btn btn-sm btn-ghost" onClick={() => onRelease(s)} aria-label={`Remove ${s.name}'s device`}>
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };
  return (
    <>
    <section className="panel fam-card" aria-labelledby="rewards-h">
      <h2 id="rewards-h" className="eyebrow">
        Family rewards
      </h2>
      <RewardsBoard mode="parent" />
    </section>
    <section className="panel fam-card" aria-labelledby="seats-h">
      <h2 id="seats-h" className="eyebrow">
        Who's in
      </h2>
      {group('parent', 'Grown-ups')}
      {group('child', 'Kids')}
      <button className="btn" onClick={onRegenerate}>
        ↻ Make new codes
      </button>
      <span className="tiny muted">Lost a code, or shared it by mistake? New codes stop the old ones working.</span>
    </section>
    </>
  );
}
