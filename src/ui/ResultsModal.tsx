import { store } from '../core/store';
import { formatClock, formatDuration } from '../core/systems';
import { formatMoney } from '../domain/items';
import { DIMENSION_LABELS, SKILL_LABELS, type ScoreDimension } from '../domain/types';
import { getMission } from '../missions/registry';
import { fmt } from '../missions/format';
import { useState } from 'react';
import type { DecisionLog } from '../domain/types';
import { useSnap } from './hooks';
import { Bar, Modal } from './Modal';
import { OUTCOME_LABEL } from './JournalPanel';

const HEADLINE = {
  completed: 'Task complete!',
  'completed-late': 'Done — a little late',
  incomplete: 'Not quite this time',
} as const;
const SUBLINE = {
  completed: 'Great work. Here is how it went.',
  'completed-late': 'You finished it — the family just had to wait a bit.',
  incomplete: "That's okay — every try teaches something. Here's what to try next time.",
} as const;

const SHORT: Record<ScoreDimension, string> = {
  accuracy: 'Accuracy',
  budget: 'Budget',
  time: 'Time',
  planning: 'Planning',
  communication: 'Talk',
  problem: 'Problems',
  responsibility: 'Duty',
};

const LESSONS: Record<string, string> = {
  'grocery-run':
    'In real life, prices and stock change every day. Checking the list, comparing prices, asking before buying a substitute, and bringing back the change and receipt are what make people trust you with money.',
  'clean-room':
    'In real life, a tidy space is a set of small habits: put things where they belong, sort before you clean, and finish one area at a time. A five-minute reset every day beats one huge clean-up.',
  'help-sibling':
    'In real life, helping someone means guiding them, not doing it all for them. Patience, clear steps, and checking what they actually need make younger kids more independent.',
  'clinic-visit':
    'In real life, clinics run on queues, tokens and paperwork. Bringing the right documents, telling staff clearly why you are there, and waiting patiently gets everyone seen faster.',
  'cook-meal':
    'In real life, cooking is planning: check what you have, prepare before the heat goes on, stay with the stove, and clean as you go. Safety first, then taste.',
  laundry:
    'In real life, laundry is sorting and reading labels: separate colours, choose the right setting, and hang clothes out soon so they dry fresh.',
  'bus-trip':
    'In real life, public transport runs on timetables. Reading the route number, leaving a few minutes early and having your fare ready make trips calm instead of rushed.',
  errands:
    'In real life, errands are a puzzle of opening hours and distance. Doing the place that closes first, then the rest, saves time and stress.',
};

const TONE_WORD = { good: 'Good outcome', neutral: 'Mixed outcome', bad: 'Tough outcome' } as const;

/** A decision in the timeline, with an expandable "What if…?" row for the paths not taken. */
function DecisionItem({ d }: { d: DecisionLog }) {
  const [open, setOpen] = useState(false);
  const alts = d.alternatives ?? [];
  return (
    <div className="tl-item">
      <span className="t">{formatClock(d.at)}</span>
      <span className={`tone-dot ${d.tone}`} role="img" aria-label={TONE_WORD[d.tone]} />
      <div>
        <div className="d">{d.text}</div>
        <div className="c">→ {d.consequence}</div>
        {alts.length > 0 && (
          <div className={`whatif ${open ? 'open' : ''}`}>
            <button className="whatif-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              <span aria-hidden>{open ? '▾' : '▸'}</span> What if…? <span className="tiny muted">{alts.length} other path{alts.length > 1 ? 's' : ''}</span>
            </button>
            {open && (
              <ul className="whatif-list">
                {alts.map((a, i) => (
                  <li key={i}>
                    <span className={`tone-dot ${a.tone}`} role="img" aria-label={TONE_WORD[a.tone]} />
                    <span>
                      <b>{a.label}</b>
                      <span className="muted"> → {a.outcome}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Radar({ scores }: { scores: [ScoreDimension, number][] }) {
  const n = scores.length;
  if (n < 3) return null;
  const S = 290;
  const c = S / 2;
  const R = 64;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;
  };
  const poly = (r: (i: number) => number) => scores.map((_, i) => pt(i, r(i)).join(',')).join(' ');
  return (
    <svg className="radar" viewBox={`0 0 ${S} ${S}`} width="100%" style={{ maxWidth: 270, overflow: "visible" }} role="img" aria-label="Score radar chart">
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={poly(() => R * k)} fill={k === 1 ? 'rgba(11,13,31,0.6)' : 'none'} stroke="#4a5498" strokeWidth={k === 1 ? 2 : 1} strokeDasharray={k === 1 ? undefined : '2 3'} />
      ))}
      {scores.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#4a5498" strokeWidth={1} />;
      })}
      <polygon points={poly((i) => (R * Math.max(4, scores[i][1])) / 100)} fill="rgba(242,165,65,0.35)" stroke="#f2a541" strokeWidth={2} strokeLinejoin="miter" />
      {scores.map(([d, v], i) => {
        const [x, y] = pt(i, (R * Math.max(4, v)) / 100);
        return <rect key={d} x={x - 3} y={y - 3} width={6} height={6} fill="#ffd166" stroke="#0b0d1f" strokeWidth={1} />;
      })}
      {scores.map(([d, v], i) => {
        const [x, y] = pt(i, R + 14);
        const anchor = Math.abs(x - c) < 8 ? 'middle' : x > c ? 'start' : 'end';
        return (
          <text key={d} x={x} y={y} textAnchor={anchor} dominantBaseline="middle">
            <tspan>{SHORT[d]}</tspan>
            <tspan dx={4} fill="#ffd166">
              {Math.round(v)}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

export default function ResultsModal({ resultId }: { resultId: string }) {
  const { state } = useSnap();
  const r = state.results.find((x) => x.id === resultId);
  const close = () => store.openModal(null);
  if (!r) {
    return (
      <Modal title="Results" onClose={close} size="sm">
        <p>Result not found.</p>
      </Modal>
    );
  }
  const def = getMission(r.missionId);
  const scores = (Object.entries(r.scores) as [ScoreDimension, number | undefined][]).filter((e): e is [ScoreDimension, number] => typeof e[1] === 'number');
  const isLatest = state.results[0]?.id === r.id && !state.run;
  const overBudget = r.budget !== null && r.moneySpent > r.budget;
  const altCount = r.decisions.filter((d) => d.alternatives?.length).length;
  const retry = (different: boolean) => {
    store.retryFromResult(r);
    if (store.ui.modal?.type === 'results') {
      store.toast('Retry is only available right after finishing. Ask your family for the task again.', 'neutral');
    } else if (different) {
      const pick = r.decisions.find((d) => d.alternatives?.some((a) => a.tone === 'good' && a.tone !== d.tone)) ?? r.decisions.find((d) => d.alternatives?.length);
      store.toast(pick ? `This time, try another path at: “${pick.text}”` : 'This time, try a different plan — order, route or choices.', 'info');
    }
  };
  return (
    <Modal
      title={r.title}
      icon={def?.icon ?? '★'}
      size="lg"
      onClose={close}
      footer={
        <>
          <span className="tiny muted grow" style={{ alignSelf: 'center' }}>
            Simulated practice — real life varies.
          </span>
          {isLatest && altCount > 0 && (
            <button className="btn btn-sky" onClick={() => retry(true)} title="Replay and pick a different path at the decision points">
              Try a different approach
            </button>
          )}
          {isLatest && (
            <button className="btn" onClick={() => retry(false)}>
              ↺ Retry
            </button>
          )}
          <button className="btn btn-primary" onClick={close} data-autofocus>
            Continue ▶
          </button>
        </>
      }
    >
      <div className={`result-hero ${r.outcome}`}>
        <div className="score-ring" aria-label={`Overall score ${r.overall} out of 100`}>
          {r.overall}
          <small>/ 100</small>
        </div>
        <div className="col grow" style={{ gap: 4 }}>
          <h3>{HEADLINE[r.outcome]}</h3>
          <span className="small muted">{SUBLINE[r.outcome]}</span>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="pill warn">+{r.xp} XP</span>
            <span className="pill ghost">{OUTCOME_LABEL[r.outcome]}</span>
            {r.badge && <span className="badge-earned">★ Badge: {r.badge}</span>}
          </div>
        </div>
      </div>

      <div className="kv">
        <div>
          <span className="label">Spent</span>
          <b className={overBudget ? 'bad' : ''}>
            {formatMoney(r.moneySpent)}
            {r.budget !== null && <span className="small muted"> / {formatMoney(r.budget)}</span>}
          </b>
        </div>
        <div>
          <span className="label">Time used</span>
          <b>{formatDuration(r.timeUsed)}</b>
        </div>
        <div>
          <span className="label">Objectives</span>
          <b>
            {r.objectivesDone.length}/{r.objectivesDone.length + r.objectivesMissed.length}
          </b>
        </div>
        <div>
          <span className="label">Challenges</span>
          <b>{r.challenges.length}</b>
        </div>
      </div>

      {scores.length > 0 && (
        <div className="section">
          <h3>How you did</h3>
          <div className="dims">
            <Radar scores={scores} />
            <div className="col" style={{ gap: 4 }}>
              {scores.map(([d, v]) => (
                <div key={d} className="dim-row">
                  <span>{DIMENSION_LABELS[d]}</span>
                  <Bar value={v} tone={v >= 70 ? 'good' : v >= 45 ? 'warn' : 'bad'} label={DIMENSION_LABELS[d]} />
                  <span className="v">{Math.round(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {r.feedback.length > 0 && (
        <div className="section">
          <h3>Feedback</h3>
          <ul className="bullets">
            {r.feedback.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="two-col">
        <div className="section">
          <h3>Done</h3>
          <ul className="checklist">
            {r.objectivesDone.map((o, i) => (
              <li key={i}>
                <span className="check on" aria-hidden>
                  ✓
                </span>
                {fmt(store, o)}
              </li>
            ))}
            {!r.objectivesDone.length && <li className="muted">—</li>}
          </ul>
        </div>
        <div className="section">
          <h3>Missed</h3>
          <ul className="checklist">
            {r.objectivesMissed.map((o, i) => (
              <li key={i} className="muted">
                <span className="check" aria-hidden />
                {fmt(store, o)}
              </li>
            ))}
            {!r.objectivesMissed.length && <li className="good">Nothing — all done!</li>}
          </ul>
        </div>
      </div>

      {(r.decisions.length > 0 || r.challenges.length > 0) && (
        <div className="section">
          <h3>Decisions &amp; consequences</h3>
          {r.challenges.length > 0 && (
            <div className="row wrap" style={{ gap: 4 }}>
              <span className="tiny muted">Surprises:</span>
              {r.challenges.map((c) => (
                <span key={c} className="pill sky">
                  {c}
                </span>
              ))}
            </div>
          )}
          {altCount > 0 && (
            <p className="whatif-intro">
              <b>Other paths you could have taken</b> — open <i>What if…?</i> under a decision to see how the other choices would have played out. There's rarely one right answer.
            </p>
          )}
          <div className="timeline">
            {r.decisions.map((d, i) => (
              <DecisionItem key={i} d={d} />
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <h3>Skills practised</h3>
        <div className="row wrap" style={{ gap: 4 }}>
          {r.skillsPracticed.map((s) => (
            <span key={s} className="pill good">
              {SKILL_LABELS[s]}
            </span>
          ))}
        </div>
      </div>

      <div className="lesson">
        <span className="label" style={{ color: 'var(--gold)' }}>
          Life lesson
        </span>
        <p style={{ margin: '2px 0 0' }}>
          {LESSONS[r.missionId] ?? 'In real life, planning ahead, asking when unsure, and owning your choices matter more than getting everything perfect.'}
        </p>
      </div>
    </Modal>
  );
}
