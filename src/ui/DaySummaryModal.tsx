import { useState } from 'react';
import { store } from '../core/store';
import { formatMoney } from '../domain/items';
import { money } from '../domain/region';
import { ALLOWANCE_BASE } from '../domain/world';
import { SKILL_LABELS, type SkillId } from '../domain/types';
import { useSnap } from './hooks';
import { Bar, Modal } from './Modal';
import { OUTCOME_LABEL, OUTCOME_TONE } from './JournalPanel';

const MOODS = [
  { id: 'great', face: '😄', label: 'Great' },
  { id: 'good', face: '🙂', label: 'Good' },
  { id: 'okay', face: '😐', label: 'Okay' },
  { id: 'tired', face: '😩', label: 'Tired' },
  { id: 'rough', face: '😞', label: 'Rough' },
];
const WENT_WELL = ['I planned my route', 'I stayed within budget', 'I asked for help', 'I finished on time'];
const IMPROVE = ['Check my list first', 'Leave earlier', 'Compare prices', 'Ask before deciding'];
const MAX = 140;

/** Tidy free text: no markup, collapsed spaces, capped length. */
const clean = (t: string) => t.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX);

function ChipPick({ options, value, onToggle, label }: { options: string[]; value: string[]; onToggle: (o: string) => void; label: string }) {
  return (
    <div className="chips reflect-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={value.includes(o)} onClick={() => onToggle(o)}>
          {value.includes(o) ? '✓ ' : ''}
          {o}
        </button>
      ))}
    </div>
  );
}

export default function DaySummaryModal({ day }: { day: number }) {
  const { state } = useSnap();
  const sum = store.daySummary(day);
  const [mood, setMood] = useState<string>('');
  const [well, setWell] = useState<string[]>([]);
  const [improve, setImprove] = useState<string[]>([]);
  const [wellText, setWellText] = useState('');
  const [improveText, setImproveText] = useState('');
  const close = () => store.openModal(null);
  const toggle = (set: (f: (v: string[]) => string[]) => void) => (o: string) => set((v) => (v.includes(o) ? v.filter((x) => x !== o) : [...v, o]));

  const sv = state.savings;
  const pct = Math.round((sv.balance / Math.max(1, sv.target)) * 100);
  // skills practised today, most frequent first
  const skillCount = new Map<SkillId, number>();
  for (const r of sum.results) for (const s of r.skillsPracticed) skillCount.set(s, (skillCount.get(s) ?? 0) + 1);
  const skills = [...skillCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const busyRun = !!state.run;

  const sleep = () => {
    const join = (chips: string[], text: string) => clean([...chips, clean(text)].filter(Boolean).join('; '));
    const w = join(well, wellText);
    const i = join(improve, improveText);
    if (mood || w || i) store.addReflection({ wentWell: w, improve: i, mood: MOODS.find((m) => m.id === mood)?.face ?? '' });
    store.nextDay();
  };

  return (
    <Modal
      title={`End of day ${sum.day}`}
      icon="🌙"
      size="md"
      onClose={close}
      closeLabel="Not yet"
      footer={
        <>
          <button className="btn btn-ghost" onClick={close}>
            Not yet
          </button>
          <button className="btn btn-primary" onClick={sleep} data-autofocus>
            Sleep &amp; start Day {sum.day + 1} ▶
          </button>
        </>
      }
    >
      {busyRun && (
        <p className="pill warn" style={{ alignSelf: 'flex-start', whiteSpace: 'normal' }}>
          ⚠ You still have a task in progress — sleeping now leaves it unfinished.
        </p>
      )}
      <div className="kv">
        <div>
          <span className="label">Tasks done</span>
          <b>
            {sum.completed}
            <span className="small muted"> / {sum.results.length}</span>
          </b>
        </div>
        <div>
          <span className="label">XP earned</span>
          <b className="warn">+{sum.xp}</b>
        </div>
        <div>
          <span className="label">Wallet</span>
          <b>{formatMoney(sum.balance)}</b>
        </div>
      </div>

      <div className="section">
        <h3>Today's tasks</h3>
        {sum.results.length ? (
          <ul className="col day-tasks">
            {sum.results.map((r) => (
              <li key={r.id} className="row boxed">
                <span className="grow">{r.title}</span>
                <span className={`pill ${OUTCOME_TONE[r.outcome]}`}>{OUTCOME_LABEL[r.outcome]}</span>
                <b className="warn">{r.overall}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No tasks finished today — rest days count too. Tomorrow is a fresh start.</p>
        )}
      </div>

      <div className="section">
        <h3>🐷 Savings: {sv.goal}</h3>
        <div className="row">
          <span className="grow">
            <Bar value={sv.balance} max={sv.target} tone={pct >= 100 ? 'good' : 'warn'} label={`Savings toward ${sv.goal}`} />
          </span>
          <span className="small">
            {formatMoney(sv.balance)} / {formatMoney(sv.target)}
          </span>
        </div>
        <span className="tiny muted">Tomorrow you'll get {formatMoney(money(ALLOWANCE_BASE))} pocket money. Save some in the piggy bank in your room.</span>
      </div>

      {skills.length > 0 && (
        <div className="section">
          <h3>Skill highlights</h3>
          <div className="row wrap" style={{ gap: 4 }}>
            {skills.map(([s]) => (
              <span key={s} className="pill good">
                {SKILL_LABELS[s]}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="section reflect">
        <h3>Reflect (optional)</h3>
        <div className="mood-pick" role="radiogroup" aria-label="How was your day?">
          <span className="small">How was your day?</span>
          <div className="row" style={{ gap: 4 }}>
            {MOODS.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mood === m.id} className="mood" onClick={() => setMood(mood === m.id ? '' : m.id)} title={m.label}>
                <span aria-hidden>{m.face}</span>
                <span className="sr-only">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="small">What went well today?</span>
          <ChipPick options={WENT_WELL} value={well} onToggle={toggle(setWell)} label="What went well" />
          <input type="text" maxLength={MAX} value={wellText} onChange={(e) => setWellText(e.target.value)} placeholder="Add your own (optional)" aria-label="What went well, in your words" />
        </div>
        <div className="field">
          <span className="small">What would you do differently?</span>
          <ChipPick options={IMPROVE} value={improve} onToggle={toggle(setImprove)} label="What you would do differently" />
          <input type="text" maxLength={MAX} value={improveText} onChange={(e) => setImproveText(e.target.value)} placeholder="Add your own (optional)" aria-label="What you would do differently, in your words" />
        </div>
        <span className="tiny muted">Keep it about the game — no names, addresses or other personal info. Your family can read reflections in the parent dashboard.</span>
      </div>
    </Modal>
  );
}
