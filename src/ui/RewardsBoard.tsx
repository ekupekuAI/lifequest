// Family rewards board. Parents promise real-life rewards for in-game progress; children see what
// they are working toward. Progress fills from game data (see core/rewards.ts). No leaderboards.
//
// Offline (single device): the board lives in the save (state.rewards).
// Family mode: the board lives in families.settings.rewards (parents edit it); each child's
// progress is computed from that child's own save.
import { useEffect, useMemo, useState } from 'react';
import { store } from '../core/store';
import { GOAL_TYPES, REWARD_TEMPLATES, defaultGoal, goalText, newRewardId, rewardProgress, type RewardGoalType } from '../core/rewards';
import type { GameState, Memory, Reward, RewardGoal, SkillId } from '../domain/types';
import { SKILL_LABELS } from '../domain/types';
import { region } from '../domain/region';
import { MISSIONS, getMission } from '../missions/registry';
import { currentSession, fetchChildSave, fetchFamilyRewards, fetchSeats, saveFamilyRewards, type FamilySeat } from '../services/family';
import { useSnap } from './hooks';
import { Bar } from './Modal';
import './familyExtras.css';

const KINDS: Memory['kind'][] = ['kind', 'helpful', 'responsible', 'honest', 'thrifty', 'brave'];
const missionTitle = (id: string) => getMission(id)?.title;

function ProgressRow({ state, reward, compact }: { state: GameState | null; reward: Reward; compact?: boolean }) {
  const p = state ? rewardProgress(state, reward) : null;
  return (
    <div className="rw-progress">
      <span className="tiny muted">{goalText(reward.goal, missionTitle)}</span>
      {p ? (
        <>
          <Bar value={p.pct * 100} tone={p.done ? 'good' : 'sky'} label={`Progress toward ${reward.text}`} />
          <span className={`tiny ${p.done ? 'good' : ''}`}>{p.done ? (reward.givenAt ? '🎁 Given — enjoy!' : '🎉 Reached!') : p.label}</span>
        </>
      ) : (
        !compact && <span className="tiny muted">Progress shows once they have played.</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Child view
// ---------------------------------------------------------------------------
function ChildBoard() {
  const { state } = useSnap();
  const rewards = (state.rewards ?? []).filter((r) => !r.givenAt || Date.now() - r.givenAt < 3 * 86_400_000);
  if (!rewards.length)
    return (
      <p className="small muted">
        No family rewards yet. Ask a parent to add one — like choosing Friday's movie for finishing tasks on time! 🎬
      </p>
    );
  const sorted = [...rewards].sort((a, b) => Number(!!a.reachedAt) - Number(!!b.reachedAt) || rewardProgress(state, b).pct - rewardProgress(state, a).pct);
  return (
    <ul className="rw-list" aria-label="Family rewards">
      {sorted.map((r) => (
        <li key={r.id} className={`boxed rw-card ${r.reachedAt ? 'rw-done' : ''}`}>
          <span className="rw-emoji" aria-hidden>
            {r.emoji ?? '🎁'}
          </span>
          <div className="grow col" style={{ gap: 2 }}>
            <b className="small">{r.text}</b>
            <ProgressRow state={state} reward={r} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Parent editor
// ---------------------------------------------------------------------------
function GoalFields({ goal, onChange }: { goal: RewardGoal; onChange(g: RewardGoal): void }) {
  const cur = region().currency;
  return (
    <div className="tpl-fields">
      <label className="field">
        <span className="label">Goal</span>
        <select value={goal.type} onChange={(e) => onChange(defaultGoal(e.target.value as RewardGoalType))}>
          {GOAL_TYPES.map((g) => (
            <option key={g.type} value={g.type}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">{goal.type === 'savingsAtLeast' ? `Target (${cur.symbol})` : 'Target'}</span>
        <input
          type="number"
          min={1}
          max={goal.type === 'savingsAtLeast' ? 100000 : 1000}
          value={goal.target}
          onChange={(e) => onChange({ ...goal, target: Math.max(1, Math.min(100000, Math.round(Number(e.target.value) || 1))) })}
        />
      </label>
      {goal.type === 'skillLevel' && (
        <label className="field">
          <span className="label">Skill</span>
          <select value={goal.skill} onChange={(e) => onChange({ ...goal, skill: e.target.value as SkillId })}>
            {(Object.keys(SKILL_LABELS) as SkillId[]).map((k) => (
              <option key={k} value={k}>
                {SKILL_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      )}
      {goal.type === 'kindMemories' && (
        <label className="field">
          <span className="label">Memory kind</span>
          <select value={goal.kind ?? 'kind'} onChange={(e) => onChange({ ...goal, kind: e.target.value as Memory['kind'] })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      )}
      {goal.type === 'missionCompleted' && (
        <label className="field">
          <span className="label">Task</span>
          <select value={goal.missionId} onChange={(e) => onChange({ ...goal, missionId: e.target.value })}>
            {MISSIONS.filter((m) => m.category !== 'social').map((m) => (
              <option key={m.id} value={m.id}>
                {m.icon} {m.title}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function RewardForm({ initial, children, onSave, onCancel }: { initial: Reward; children: FamilySeat[] | null; onSave(r: Reward): void; onCancel(): void }) {
  const [r, setR] = useState<Reward>(initial);
  return (
    <div className="boxed col rw-form" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 6 }}>
        <label className="field" style={{ width: 64 }}>
          <span className="label">Icon</span>
          <input type="text" maxLength={4} value={r.emoji ?? ''} onChange={(e) => setR({ ...r, emoji: e.target.value })} />
        </label>
        <label className="field grow">
          <span className="label">Real-life reward</span>
          <input type="text" maxLength={120} placeholder="e.g. You choose Friday's movie" value={r.text} onChange={(e) => setR({ ...r, text: e.target.value })} />
        </label>
      </div>
      <GoalFields goal={r.goal} onChange={(goal) => setR({ ...r, goal })} />
      {children && children.length > 1 && (
        <label className="field">
          <span className="label">For</span>
          <select value={r.forMember ?? ''} onChange={(e) => setR({ ...r, forMember: e.target.value || undefined })}>
            <option value="">Every child</option>
            {children.map((c) => (
              <option key={c.gameMemberId} value={c.gameMemberId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-good btn-sm" disabled={!r.text.trim()} onClick={() => onSave({ ...r, text: r.text.trim().replace(/[<>]/g, '') })}>
          Save reward
        </button>
      </div>
    </div>
  );
}

function ParentBoard() {
  const { state } = useSnap();
  const session = currentSession();
  const family = session?.kind === 'parent';
  const [remote, setRemote] = useState<Reward[] | null>(null);
  const [kids, setKids] = useState<FamilySeat[] | null>(null);
  const [saves, setSaves] = useState<Record<string, GameState | null>>({});
  const [editing, setEditing] = useState<Reward | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!family) return;
    let alive = true;
    const load = async () => {
      try {
        const [rw, seats] = await Promise.all([fetchFamilyRewards(), fetchSeats()]);
        if (!alive) return;
        const children = seats.filter((s) => s.kind === 'child');
        setRemote(rw);
        setKids(children);
        const entries = await Promise.all(children.map(async (c) => [c.gameMemberId, await fetchChildSave(c.gameMemberId).catch(() => null)] as const));
        if (alive) setSaves(Object.fromEntries(entries));
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    void load();
    const t = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [family]);

  const rewards = family ? (remote ?? []) : (state.rewards ?? []);
  const childCols: { id: string; name: string; state: GameState | null }[] = useMemo(
    () =>
      family
        ? (kids ?? []).map((k) => ({ id: k.gameMemberId, name: k.name, state: saves[k.gameMemberId] ?? null }))
        : [{ id: 'player', name: state.profile.members.find((m) => m.role === 'player')?.name ?? 'Player', state }],
    [family, kids, saves, state],
  );

  async function commit(next: Reward[]) {
    setError(null);
    if (!family) {
      store.state.rewards = next;
      store.notify();
      void store.save('Rewards saved');
      return;
    }
    setBusy(true);
    const prev = remote;
    setRemote(next);
    try {
      await saveFamilyRewards(next);
    } catch (e) {
      setRemote(prev);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const by = family ? session!.gameMemberId : state.profile.members.find((m) => m.role !== 'player')?.id;
  const blank = (t = REWARD_TEMPLATES[0]): Reward => ({
    id: newRewardId(),
    text: t.text,
    emoji: t.emoji,
    goal: t.goal(),
    createdAt: Date.now(),
    createdBy: by,
    forMember: kids && kids.length === 1 ? kids[0].gameMemberId : undefined,
  });
  const save = (r: Reward) => {
    const exists = rewards.some((x) => x.id === r.id);
    const old = rewards.find((x) => x.id === r.id);
    // a new goal starts fresh
    const fresh = old && JSON.stringify(old.goal) !== JSON.stringify(r.goal) ? { ...r, reachedAt: undefined, givenAt: undefined } : r;
    void commit(exists ? rewards.map((x) => (x.id === r.id ? fresh : x)) : [...rewards, fresh]);
    setEditing(null);
  };
  const markGiven = (r: Reward) => void commit(rewards.map((x) => (x.id === r.id ? { ...x, givenAt: Date.now() } : x)));
  const del = (r: Reward) => void commit(rewards.filter((x) => x.id !== r.id));

  return (
    <div className="col rw-parent" style={{ gap: 10 }}>
      <p className="small muted">
        Promise a real-life reward for good habits in the game. Progress fills in by itself — no rankings, just each child's own goals. You mark it
        “given” when you have done it.
      </p>
      {error && (
        <p className="small bad" role="alert">
          {error}
        </p>
      )}
      {family && remote === null && !error && <p className="small muted">Loading the rewards board…</p>}
      {rewards.length === 0 && (remote !== null || !family) && <p className="small muted">No rewards yet — pick an idea below.</p>}
      <ul className="rw-list">
        {rewards.map((r) =>
          editing?.id === r.id ? (
            <li key={r.id}>
              <RewardForm initial={editing} children={kids} onSave={save} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={r.id} className={`boxed rw-card ${r.givenAt ? 'rw-given' : ''}`}>
              <span className="rw-emoji" aria-hidden>
                {r.emoji ?? '🎁'}
              </span>
              <div className="grow col" style={{ gap: 4 }}>
                <b className="small">{r.text}</b>
                {childCols
                  .filter((c) => !r.forMember || r.forMember === c.id || (!family && r.forMember === 'player'))
                  .map((c) => {
                    const reached = !!(r.reachedAt || (c.state && rewardProgress(c.state, r).done) || c.state?.rewards?.find((x) => x.id === r.id)?.reachedAt);
                    return (
                      <div key={c.id} className="col" style={{ gap: 2 }}>
                        {childCols.length > 1 || family ? <span className="tiny">{c.name}</span> : null}
                        <ProgressRow state={c.state} reward={reached ? { ...r, reachedAt: r.reachedAt ?? 1 } : r} />
                      </div>
                    );
                  })}
                <div className="row wrap" style={{ gap: 6 }}>
                  {r.givenAt ? (
                    <span className="pill good">🎁 Given</span>
                  ) : (
                    <button type="button" className="btn btn-sm btn-good" disabled={busy} onClick={() => markGiven(r)}>
                      Mark as given
                    </button>
                  )}
                  <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setEditing(r)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => del(r)} aria-label={`Delete reward ${r.text}`}>
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ),
        )}
      </ul>
      {editing && !rewards.some((x) => x.id === editing.id) ? (
        <RewardForm initial={editing} children={kids} onSave={save} onCancel={() => setEditing(null)} />
      ) : (
        <div className="section">
          <h3>Add a reward</h3>
          <div className="chips">
            {REWARD_TEMPLATES.map((t) => (
              <button key={t.text} type="button" className="chip" onClick={() => setEditing(blank(t))} disabled={rewards.length >= 30}>
                {t.emoji} {t.text}
              </button>
            ))}
            <button type="button" className="chip" onClick={() => setEditing({ ...blank(), text: '', emoji: '🎁' })} disabled={rewards.length >= 30}>
              ✏️ Your own…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RewardsBoard({ mode }: { mode: 'parent' | 'child' }) {
  return mode === 'parent' ? <ParentBoard /> : <ChildBoard />;
}
