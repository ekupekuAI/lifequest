import { store, type Modal as ModalT } from '../core/store';
import { formatClock, formatDuration } from '../core/systems';
import { formatMoney } from '../domain/items';
import { ROLE_LABELS } from '../domain/family';
import { getMission } from '../missions/registry';
import { fmt } from '../missions/format';
import { LOCATION_NAMES, useSnap } from './hooks';
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
  const budget = active ? run!.budget : (asg?.budget ?? def.budget ?? null);
  const deadline = asg?.deadlineMinutes ?? def.deadlineMinutes ?? null;
  const now = state.clock.minutes;
  const left = active ? store.timeLeft() : null;
  const opts = { assignerId: modal.assignerId, budget };
  const where = LOCATION_NAMES[def.destination ?? def.location] ?? def.destination ?? def.location;

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
