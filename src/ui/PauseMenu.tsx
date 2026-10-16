import { store } from '../core/store';
import { useSnap } from './hooks';
import { Modal } from './Modal';

export default function PauseMenu() {
  const { state, ui } = useSnap();
  const def = store.mission;
  const close = () => store.openModal(null);

  const restart = () =>
    store.openModal({
      type: 'confirm',
      text: `Restart "${def?.title}" from the beginning? Progress on this task will be lost.`,
      yes: 'Restart',
      onYes: () => {
        const before = store.state;
        store.restartMission();
        if (store.state === before) store.toast("This task was resumed from a save, so it can't be rewound. Abandon it and ask again instead.", 'neutral');
      },
    });
  const abandon = () =>
    store.openModal({
      type: 'confirm',
      text: `Stop "${def?.title}" now? It will be marked incomplete — you'll still get feedback and can try again.`,
      yes: 'Abandon task',
      onYes: () => store.abandonMission(),
    });
  const exit = async () => {
    await store.save();
    store.goToScreen('start');
  };

  return (
    <Modal title="Paused" icon="❚❚" size="sm" onClose={close}>
      <div className="menu-list">
        <button className="btn btn-primary btn-lg" onClick={close} data-autofocus>
          ▶ Resume
        </button>
        {state.run && (
          <>
            <button className="btn" onClick={restart}>
              ↺ Restart task
            </button>
            <button className="btn" onClick={abandon}>
              ✕ Abandon task
            </button>
          </>
        )}
        <button className="btn" onClick={() => store.openModal({ type: 'parent' })}>
          ⚑ Parent dashboard
        </button>
        <button className="btn" onClick={() => store.openModal({ type: 'settings' })}>
          ⚙ Settings
        </button>
        <button className="btn" onClick={() => store.openModal({ type: 'help' })}>
          ? Controls &amp; help
        </button>
        <button className="btn" role="switch" aria-checked={ui.sound} onClick={() => store.setUI({ sound: !ui.sound })}>
          {ui.sound ? '♪ Sound: on' : '♪ Sound: off'}
        </button>
        <button className="btn" onClick={() => store.save()} disabled={ui.saveStatus.kind === 'saving'}>
          ⬇ Save now
        </button>
        <button className="btn btn-ghost" onClick={exit}>
          ⏏ Save &amp; exit to title
        </button>
      </div>
      <p className="tiny muted row" style={{ gap: 4 }}>
        <span className={`save-dot ${ui.saveStatus.kind}`} /> {ui.saveStatus.message}
      </p>
    </Modal>
  );
}
