import { store, type Modal as ModalT } from '../core/store';
import { formatClock, formatDuration } from '../core/systems';
import { formatMoney } from '../domain/items';
import { ROLE_LABELS } from '../domain/family';
import { getMission } from '../missions/registry';
import { fmt } from '../missions/format';
import { useSnap } from './hooks';
import { money } from '../domain/region';
import { OPENING_HOURS } from '../domain/world';
import type { MissionDef } from '../missions/types';
import { hoursPlaceName, openStatus, placeName, time12 } from './HUD';

/** Budget & time limit for a mission, adjusted for difficulty and region unless an assignment overrides them. */
export function missionTerms(def: MissionDef, asg?: { budget: number | null; deadlineMinutes: number | null }) {
  const budget = store.missionBudget(def, asg);
  const deadline = asg?.deadlineMinutes ?? (def.deadlineMinutes ? Math.round(def.deadlineMinutes * store.diff.deadlineMul) : null);
  return { budget, deadline };
}

/** Opening-hours notes for the places a mission sends you to. */
export function hoursWarnings(def: MissionDef, now: number, deadline: number | null): { text: string; tone: 'bad' | 'warn' | 'info' }[] {
  const keys = new Set<string>();
  const add = (k?: string) => k && OPENING_HOURS[k] && k !== 'bus' && keys.add(k);
  add(def.destination ?? def.location);
  for (const o of def.objectives) {
    add(o.where?.location);
    add(o.where?.target);
  }
  const out: { text: string; tone: 'bad' | 'warn' | 'info' }[] = [];
  for (const k of keys) {
    const h = OPENING_HOURS[k];
    const st = openStatus(k, now);
    const name = hoursPlaceName(k);
    if (!st?.open) out.push({ text: `${name} is closed right now — it opens at ${time12(h.open)}.`, tone: 'bad' });
    else {
      const closesBeforeDue = deadline !== null && (now % 1440) + deadline > h.close;
      out.push({
        text: `${name} closes at ${time12(h.close)}${closesBeforeDue ? ' — before your deadline, so go there first.' : '.'}`,
        tone: closesBeforeDue || st.soon ? 'warn' : 'info',
      });
    }
  }
  return out;
}
import { Modal, Stars } from './Modal';
import { Portrait } from './art';

export default function BriefingModal({ modal }: { modal: Extract<ModalT, { type: 'briefing' }> }) {
  const { state } = useSnap();
  const def = getMission(modal.missionId);
  const close = () => store.openModal(null);
  if (!def) {
    return (
      <Modal title="Task not found" onClose={close} size="sm">
        <p>This task isn't available any more.</p>
      </Modal>
    );
  }
  const run = state.run && state.run.missionId === def.id ? state.run : null;
  const active = !!modal.reopen && !!run;
  const assigner = store.member(modal.assignerId);
  const asg = modal.assignmentId ? state.assignments.find((a) => a.id === modal.assignmentId) : undefined;
  const terms = missionTerms(def, asg);
  const budget = active ? run!.budget : terms.budget;
  const deadline = terms.deadline;
  const now = state.clock.minutes;
  const left = active ? store.timeLeft() : null;
  const opts = { assignerId: modal.assignerId, budget };
  const where = placeName(def.destination ?? def.location).replace(/^the /, '').replace(/^./, (c) => c.toUpperCase());
  const warnings = hoursWarnings(def, now, active ? left : deadline);

  return (
    <Modal
      title={def.title}
      icon={def.icon}
      onClose={close}
      size="md"
      footer={
        active ? (
          <button className="btn btn-primary" onClick={close} data-autofocus>
            Back to it
          </button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={close}>
              Not now
            </button>
            <button className="btn btn-good btn-lg" onClick={() => store.acceptMission(def.id, modal.assignerId, modal.assignmentId)} data-autofocus>
              Accept task ✓
            </button>
          </>
        )
      }
    >
      <div className="quote">
        <span className="portrait-frame" style={{ width: 64, height: 64 }}>
          <Portrait id={modal.assignerId} size={60} />
        </span>
        <div className="grow">
          <div className="bubble">“{fmt(store, def.briefing, opts)}”</div>
          <div className="who">
            {assigner ? `${assigner.name} · ${ROLE_LABELS[assigner.role]}` : 'Notice board'}
          </div>
        </div>
      </div>

      {asg?.note && (
        <div className="boxed small">
          <span className="label">Note</span> {asg.note}
        </div>
      )}

      <div className="kv">
        <div>
          <span className="label">{active ? 'Budget left' : 'Budget'}</span>
          <b className={active && budget !== null && budget - run!.spent < 0 ? 'bad' : ''}>
            {budget === null ? '—' : active ? formatMoney(budget - run!.spent) : formatMoney(budget)}
          </b>
        </div>
        <div>
          <span className="label">{active ? 'Time left' : 'Due by'}</span>
          <b className={left !== null && left < 10 ? 'bad' : ''}>
            {active
              ? left === null
                ? 'No rush'
                : left < 0
                  ? `Late ${formatDuration(-left)}`
                  : formatDuration(left)
              : deadline === null
                ? 'No rush'
                : formatClock(now + deadline)}
          </b>
          {!active && deadline !== null && <span className="tiny muted">{formatDuration(deadline)} from now</span>}
        </div>
        <div>
          <span className="label">Where</span>
          <b>{where}</b>
        </div>
        <div>
          <span className="label">Difficulty</span>
          <Stars n={def.difficulty} />
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="hours-warn">
          {warnings.map((w, i) => (
            <li key={i} className={w.tone}>
              <span aria-hidden>{w.tone === 'bad' ? '⛔' : '🕘'}</span> {w.text}
            </li>
          ))}
        </ul>
      )}

      <div className="section">
        <h3>Objectives</h3>
        <ul className="objectives" style={{ paddingLeft: 0 }}>
          {def.objectives.map((o) => {
            const done = !!run?.objectives[o.id]?.done && active;
            return (
              <li key={o.id} className={`obj ${done ? 'done' : ''}`} style={{ color: done ? undefined : 'var(--text)' }}>
                <span className={`check ${done ? 'on' : ''}`} aria-hidden>
                  ✓
                </span>
                <span>
                  {fmt(store, o.label, opts)}
                  {active && !done && def.progress?.(state, o.id) && <span className="obj-sub">{def.progress(state, o.id)}</span>}
                  {o.where && o.where.location !== def.location && !done && (
                    <span className="where-tag" title="Where to go">
                      📍 {placeName(o.where.location).replace(/^the /, '')}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="section">
        <h3>Good to know</h3>
        <ul className="bullets sky">
          {def.instructions.map((t, i) => (
            <li key={i}>{fmt(store, t, opts)}</li>
          ))}
        </ul>
      </div>

      {!active && (
        <>
          <div className="section">
            <h3>You'll practise</h3>
            <ul className="bullets mint">
              {def.learning.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
          {def.challenges.length > 0 && (
            <p className="boxed small">
              <b className="warn">Expect the unexpected.</b> Real life rarely goes to plan — something may change along the way. How you handle it counts.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
