import { store } from '../core/store';
import { ROLE_LABELS } from '../domain/family';
import { formatMoney } from '../domain/items';
import { getMission } from '../missions/registry';
import { useSnap } from './hooks';
import { Modal, Stars } from './Modal';
import { hoursWarnings, missionTerms } from './BriefingModal';
import { formatDuration } from '../core/systems';

export default function MissionBoard() {
  const { state } = useSnap();
  // social missions (the optional date) come by text from the partner, not from the family board
  const list = store.availableMissions().filter((x) => x.def.category !== 'social');
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
                    {(() => {
                      const t = missionTerms(def, a);
                      return (
                        <>
                          {t.budget != null && <>Budget {formatMoney(t.budget)} · </>}
                          {t.deadline != null ? formatDuration(t.deadline) : 'No deadline'}
                        </>
                      );
                    })()}
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
            const terms = missionTerms(def);
            const warn = avail.ok ? hoursWarnings(def, state.clock.minutes, terms.deadline).find((w) => w.tone !== 'info') : undefined;
            return (
              <button key={def.id} className="note" disabled={disabled} onClick={() => store.offerMission(def.id)} data-autofocus={undefined}>
                {done && <span className="n-tag">Done today ✓</span>}
                <span className="n-title">
                  {def.icon} {def.title}
                </span>
                <Stars n={def.difficulty} />
                <span>{def.summary}</span>
                <span className="n-meta">From {who ? `${who.name} (${ROLE_LABELS[who.role]})` : def.assignerRoles.map((r) => ROLE_LABELS[r]).join(' / ')}</span>
                {(terms.budget != null || terms.deadline != null) && (
                  <span className="n-meta">
                    {terms.budget != null && <>💰 {formatMoney(terms.budget)}</>}
                    {terms.budget != null && terms.deadline != null && ' · '}
                    {terms.deadline != null && <>⏱ {formatDuration(terms.deadline)}</>}
                  </span>
                )}
                {warn && <span className="n-meta n-warn">🕘 {warn.text}</span>}
                {!avail.ok && <span className="n-meta" style={{ color: '#a8381a' }}>✕ {avail.reason ?? 'Not available right now'}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
