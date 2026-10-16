import { useEffect, useState, type CSSProperties } from 'react';
import { store, freshState } from '../core/store';
import { useSnap } from './hooks';
import { Modal } from './Modal';
import ParentDashboard from './ParentDashboard';
import { ControlsList } from './HelpModal';

type Overlay = null | 'settings' | 'help' | 'parent-nosave';

const STARS = [
  [8, 6], [22, 12], [35, 4], [48, 15], [61, 7], [74, 11], [88, 5], [93, 17], [15, 22], [56, 24], [80, 26], [30, 28], [67, 3],
];
const CLOUDS = [
  { top: '16%', delay: '-8s', dur: '70s', s: 1.4 },
  { top: '30%', delay: '-34s', dur: '90s', s: 1 },
  { top: '8%', delay: '-52s', dur: '110s', s: 0.8 },
  { top: '40%', delay: '-20s', dur: '80s', s: 1.2 },
];

export function SkyBackdrop() {
  return (
    <div className="sky-backdrop" aria-hidden>
      {STARS.map(([x, y], i) => (
        <span key={i} className="star" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i % 5) * 0.6}s` }} />
      ))}
      <span className="sun" />
      {CLOUDS.map((c, i) => (
        <span
          key={i}
          className="cloud"
          style={{ top: c.top, animationDelay: c.delay, animationDuration: c.dur, ['--s' as string]: c.s } as CSSProperties}
        />
      ))}
      <div className="skyline">
        <svg xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="town" width="192" height="64" patternUnits="userSpaceOnUse" x="0" y="0">
              <g fill="#14173a">
                <rect x="0" y="28" width="34" height="36" />
                <rect x="4" y="20" width="26" height="8" />
                <rect x="10" y="14" width="14" height="6" />
                <rect x="40" y="10" width="28" height="54" />
                <rect x="74" y="34" width="40" height="30" />
                <rect x="80" y="26" width="28" height="8" />
                <rect x="88" y="20" width="12" height="6" />
                <rect x="120" y="22" width="24" height="42" />
                <rect x="150" y="38" width="42" height="26" />
                <rect x="156" y="30" width="30" height="8" />
              </g>
              <g fill="#ffd166">
                <rect x="10" y="36" width="4" height="4" />
                <rect x="20" y="44" width="4" height="4" />
                <rect x="46" y="18" width="4" height="4" />
                <rect x="58" y="18" width="4" height="4" />
                <rect x="46" y="30" width="4" height="4" />
                <rect x="58" y="42" width="4" height="4" />
                <rect x="82" y="42" width="6" height="4" />
                <rect x="98" y="42" width="6" height="4" />
                <rect x="126" y="30" width="4" height="4" />
                <rect x="134" y="40" width="4" height="4" />
                <rect x="162" y="46" width="6" height="4" />
                <rect x="176" y="46" width="6" height="4" />
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="64" fill="url(#town)" />
        </svg>
      </div>
    </div>
  );
}

export default function StartScreen({ parentOpen = false }: { parentOpen?: boolean }) {
  const { ui } = useSnap();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSave = store.repo.hasSave();
  const cloud = store.repo.kind === 'supabase';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (overlay) setOverlay(null);
      else if (parentOpen) store.goToScreen('start');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, parentOpen]);

  async function onContinue() {
    setBusy(true);
    setError(null);
    const ok = await store.continueGame();
    setBusy(false);
    if (!ok) setError("Couldn't load your save. Try starting a new game.");
  }

  async function onParent() {
    if (!store.repo.hasSave()) return setOverlay('parent-nosave');
    setBusy(true);
    setError(null);
    try {
      const loaded = await store.repo.load();
      if (!loaded) return setOverlay('parent-nosave');
      // Load the family profile without entering the game world.
      store.state = { ...freshState(loaded.profile), ...loaded, inQueue: false };
      store.goToScreen('parent');
    } catch {
      setError("Couldn't open the saved family.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen start">
      <SkyBackdrop />
      <main className="start-card">
        <h1 className="logo">LIFEQUEST</h1>
        <p className="tagline">Real life. Your rules.</p>
        <nav className="panel start-menu" aria-label="Main menu">
          {hasSave && (
            <button className="btn btn-primary btn-lg" onClick={onContinue} disabled={busy} autoFocus>
              ▶ Continue
            </button>
          )}
          <button className={`btn btn-lg ${hasSave ? '' : 'btn-primary'}`} onClick={() => store.goToScreen('setup')} disabled={busy} autoFocus={!hasSave}>
            ✚ New game
          </button>
          <button className="btn" onClick={onParent} disabled={busy}>
            ⚑ Parent mode
          </button>
          <div className="row">
            <button className="btn grow" onClick={() => setOverlay('settings')}>
              ⚙ Settings
            </button>
            <button className="btn grow" onClick={() => setOverlay('help')}>
              ? How to play
            </button>
          </div>
          {error && <p className="bad small" role="alert">{error}</p>}
        </nav>
        <div className="start-foot">
          <span className={`save-dot ${cloud ? 'cloud' : 'local'}`} />
          <span>{cloud ? 'Cloud saves' : 'Local demo mode'}</span>
          <span className="dim">·</span>
          <span>Practice real-life skills, one task at a time.</span>
        </div>
      </main>

      {overlay === 'settings' && (
        <Modal title="Settings" icon="⚙" size="sm" onClose={() => setOverlay(null)}>
          <div className="row spread">
            <span>Sound effects</span>
            <button
              className={`btn btn-sm ${ui.sound ? 'btn-good' : ''}`}
              role="switch"
              aria-checked={ui.sound}
              onClick={() => store.setUI({ sound: !ui.sound })}
              data-autofocus
            >
              {ui.sound ? 'On' : 'Off'}
            </button>
          </div>
          <div className="row spread">
            <span>Save mode</span>
            <span className={`pill ${cloud ? 'good' : 'sky'}`}>{cloud ? 'Cloud' : 'This device'}</span>
          </div>
          <p className="muted small">
            {cloud ? 'Progress syncs to the cloud and is also kept on this device.' : 'Progress is saved in this browser only. No account needed.'}
          </p>
        </Modal>
      )}

      {overlay === 'help' && (
        <Modal title="How to play" icon="?" size="sm" onClose={() => setOverlay(null)}>
          <p>Talk to your family to get real-life tasks, then go out and do them before the deadline.</p>
          <ControlsList />
          <p className="muted small">There is rarely one right answer — every choice has a consequence you'll see in your results.</p>
        </Modal>
      )}

      {overlay === 'parent-nosave' && (
        <Modal
          title="Parent mode"
          icon="⚑"
          size="sm"
          onClose={() => setOverlay(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setOverlay(null)}>
                Back
              </button>
              <button className="btn btn-primary" onClick={() => store.goToScreen('setup')} data-autofocus>
                Start a new game
              </button>
            </>
          }
        >
          <p>Parent mode lets a guardian assign tasks, set a budget and deadline, and review results.</p>
          <p className="muted">It needs a family first. Start a new game to create the player and family, then come back here (or open it from the pause menu).</p>
        </Modal>
      )}

      {parentOpen && <ParentDashboard onClose={() => store.goToScreen('start')} fromTitle />}
    </div>
  );
}
