import { store } from '../core/store';
import { ROLE_LABELS } from '../domain/family';
import { formatMoney } from '../domain/items';
import { getMission } from '../missions/registry';
import { useSnap } from './hooks';
import { Modal, Stars } from './Modal';

export default function MissionBoard() {
  const { state } = useSnap();
  const list = store.availableMissions();
  const pending = state.assignments.filter((a) => a.status === 'assigned' && a.assignedTo === 'player');
  const busy = !!state.run;
  return (
    <Modal title="Family notice board" icon="📌" size="lg" onClose={() => store.openModal(null)}>
      {busy && <p className="pill warn" style={{ alignSelf: 'flex-start' }}>Finish your current task first</p>}
      {pending.length > 0 && (
        <div className="section">
          <h3>Assigned to you</h3>
          <div className="notes">
            {pending.map((a) => {
              const def = getMission(a.missionId);
              const by = store.member(a.assignedBy);
              if (!def) return null;
              return (
                <button key={a.id} className="note" disabled={busy} onClick={() => store.offerMission(a.missionId, a.assignedBy, a.id)}>
                  <span className="n-tag">From {by?.name ?? 'family'}</span>
                  <span className="n-title">
                    {def.icon} {def.title}
                  </span>
                  {a.note && <span>“{a.note}”</span>}
                  <span className="n-meta">
                    {a.budget != null && <>Budget {formatMoney(a.budget)} · </>}
                    {a.deadlineMinutes != null ? `${a.deadlineMinutes} min` : 'No deadline'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="section">
        <h3>Tasks</h3>
        <div className="notes">
          {list.map(({ def, avail }) => {
            const done = store.doneToday(def.id);
            const who = store.defaultAssigner(def);
            const disabled = busy || !avail.ok;
            return (
              <button key={def.id} className="note" disabled={disabled} onClick={() => store.offerMission(def.id)} data-autofocus={undefined}>
                {done && <span className="n-tag">Done today ✓</span>}
                <span className="n-title">
                  {def.icon} {def.title}
                </span>
                <Stars n={def.difficulty} />
                <span>{def.summary}</span>
                <span className="n-meta">From {who ? `${who.name} (${ROLE_LABELS[who.role]})` : def.assignerRoles.map((r) => ROLE_LABELS[r]).join(' / ')}</span>
                {!avail.ok && <span className="n-meta" style={{ color: '#a8381a' }}>✕ {avail.reason ?? 'Not available right now'}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
