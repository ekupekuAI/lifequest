import { store } from '../core/store';
import { formatDuration } from '../core/systems';
import { useSnap, useTicker } from './hooks';
import { Portrait, crowdLook } from './art';

const MAX_SHOWN = 6;

export default function QueuePanel() {
  const { state, ui } = useSnap();
  // queue progress mutates without notifying every frame; poll while queued
  useTicker(ui.waiting ? 150 : 400, state.inQueue);
  const q = store.queue;
  const info = store.queueInfo();
  if (!state.inQueue || ui.dialogue || !q || !info) return null;
  const idx = q.customers.findIndex((c) => c.isPlayer);
  const ahead = idx < 0 ? q.customers : q.customers.slice(0, idx);
  const hidden = Math.max(0, ahead.length - MAX_SHOWN);
  const shownAhead = ahead.slice(0, MAX_SHOWN);
  const behind = idx >= 0 ? q.customers.length - idx - 1 : 0;
  const front = q.customers[0];
  const frontPct = front && !front.isPlayer ? Math.min(100, (q.progress / front.serviceMinutes) * 100) : 0;
  const last = q.log[q.log.length - 1];
  const yourTurn = info.ahead === 0;
  const clinic = state.location === 'clinic';
  return (
    <section className="panel queue" aria-label="Queue">
      <div className="row spread">
        <span className="label" style={{ color: 'var(--gold)' }}>
          {clinic ? 'Reception queue' : 'Checkout queue'}
        </span>
        <span className="pill sky">{yourTurn ? 'Your turn!' : `#${info.ahead + 1} in line`}</span>
      </div>
      <div className="queue-line" aria-hidden>
        <span className="counter" title="Counter">
          {clinic ? '🩺' : '🧾'}
        </span>
        {shownAhead.map((c, i) => (
          <span className={`qp ${i === 0 ? 'serving' : ''}`} key={c.id} title={c.name}>
            <Portrait id={`crowd-${c.look ?? i}`} appearance={crowdLook(c.look ?? i)} kind="adult" size={28} alt={c.name} />
            {i === 0 ? (
              <span className="svc">
                <i style={{ width: `${frontPct}%` }} />
              </span>
            ) : (
              <span className="qp-name">{i + 1}</span>
            )}
          </span>
        ))}
        {hidden > 0 && <span className="qp-name label">+{hidden}</span>}
        {idx >= 0 && (
          <span className="qp you">
            <Portrait id="player" size={28} alt="You" />
            <span className="qp-name">YOU</span>
          </span>
        )}
        {behind > 0 && <span className="label dim" style={{ marginLeft: 'auto' }}>+{behind} behind</span>}
      </div>
      <div className="row spread small">
        <span>
          Wait ≈ <b className="warn">{formatDuration(info.wait)}</b>
        </span>
        <span className="tiny muted">Each customer takes 2–5 min{clinic ? ' at reception' : ' at the counter'}.</span>
      </div>
      <div className="queue-log" aria-live="polite">
        {last ?? 'The line shuffles forward…'}
      </div>
      <div className="row wrap" style={{ gap: 5 }}>
        {yourTurn ? (
          <button className="btn btn-good" onClick={() => store.counterTurn()}>
            {clinic ? 'Go to the desk' : 'Pay now'}
          </button>
        ) : (
          <button className={`btn ${ui.waiting ? 'waiting' : 'btn-primary'}`} onClick={() => store.queueWait(!ui.waiting)} aria-pressed={ui.waiting}>
            {ui.waiting ? 'Waiting… ⏩' : 'Wait'}
          </button>
        )}
        <button className="btn btn-sm" onClick={() => store.openModal({ type: 'journal' })}>
          Review list
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => store.queueLeave()}>
          Leave queue
        </button>
      </div>
    </section>
  );
}
