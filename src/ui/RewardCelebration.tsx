// Self-contained celebration for the family rewards board. Mount once inside the game screen:
// it watches the store, runs checkRewards() on changes, and shows a pixel confetti burst + the
// 'win' jingle when a reward is reached (the parent is told via the 'report' bus event).
// In family mode (child device) it also keeps state.rewards in step with the parent's board.
import { useEffect, useMemo, useState } from 'react';
import { store } from '../core/store';
import { checkRewards, goalText, mergeRewards } from '../core/rewards';
import { sfx } from '../core/sfx';
import type { Reward } from '../domain/types';
import { currentSession, fetchFamilyRewards } from '../services/family';
import { prefersReducedMotion } from './hooks';
import './familyExtras.css';

const COLORS = ['#ffcf4a', '#ff7a59', '#5cd6a0', '#58b4ff', '#c78bff', '#ff6fa8'];
const SHOW_MS = 5200;

/** Pull the parent's board into this child's save (keeps local "reached" marks). */
async function syncFromFamily() {
  const s = currentSession();
  if (!s || s.kind !== 'child') return;
  const all = await fetchFamilyRewards();
  const mine = all.filter((r) => !r.forMember || r.forMember === s.gameMemberId || r.forMember === 'player');
  const merged = mergeRewards(store.state.rewards ?? [], mine);
  if (JSON.stringify(merged) !== JSON.stringify(store.state.rewards ?? [])) {
    store.state.rewards = merged;
    store.notify();
  }
}

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: ((i * 53) % 900) / 1000,
        dur: 1.6 + ((i * 29) % 100) / 100,
        drift: ((i * 71) % 120) - 60,
        size: 4 + (i % 3) * 2,
        color: COLORS[i % COLORS.length],
      })),
    [],
  );
  return (
    <div className="rw-confetti" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          style={
            {
              left: `${b.left}%`,
              width: b.size,
              height: b.size,
              background: b.color,
              animationDelay: `${b.delay}s`,
              animationDuration: `${b.dur}s`,
              '--drift': `${b.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export default function RewardCelebration() {
  const [queue, setQueue] = useState<Reward[]>([]);
  const current = queue[0];

  // watch the store for newly reached rewards
  useEffect(() => {
    let scheduled = false;
    const run = () => {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        if (store.ui.screen !== 'game' || !store.state.rewards?.length) return;
        const fresh = checkRewards(store);
        if (fresh.length) setQueue((q) => [...q, ...fresh]);
      }, 400);
    };
    const unsub = store.subscribe(run);
    run();
    return () => {
      unsub();
    };
  }, []);

  // family mode: pull the board now and every minute
  useEffect(() => {
    const s = currentSession();
    if (!s || s.kind !== 'child') return;
    const pull = () => void syncFromFamily().catch(() => {});
    pull();
    const t = window.setInterval(pull, 60_000);
    return () => window.clearInterval(t);
  }, []);

  // play + auto-dismiss each celebration
  useEffect(() => {
    if (!current) return;
    sfx.play('win');
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [current?.id]);

  if (!current) return null;
  const reduced = prefersReducedMotion();
  return (
    <div className="rw-celebrate" role="status" aria-live="assertive" onClick={() => setQueue((q) => q.slice(1))}>
      {!reduced && <Confetti />}
      <div className={`rw-celebrate-card boxed ${reduced ? '' : 'rw-pop'}`}>
        <span className="rw-celebrate-emoji" aria-hidden>
          {current.emoji ?? '🎁'}
        </span>
        <span className="label">Family reward reached!</span>
        <b>{current.text}</b>
        <span className="small muted">{goalText(current.goal)} — your family has been told. 🎉</span>
        <span className="tiny muted">Tap to close</span>
      </div>
    </div>
  );
}
