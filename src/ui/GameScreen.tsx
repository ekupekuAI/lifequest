import RewardCelebration from './RewardCelebration';
import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react';
// Phaser is big: load the world on demand so the title screen appears instantly.
const GameCanvas = lazy(() => import('../game/GameCanvas'));
const World3D = lazy(() => import('../game/three/World3D'));

class CanvasBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="loading-world">
        <div className="panel col" style={{ padding: 14, maxWidth: 360, alignItems: 'center' }}>
          <span className="label" style={{ color: 'var(--coral)' }}>The world couldn't load</span>
          <span className="small muted">{this.state.error}</span>
          <button className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
import { store } from '../core/store';
import { isTypingTarget, useIsTouch, useSnap } from './hooks';
import HUD from './HUD';
import DialoguePanel from './DialoguePanel';
import QueuePanel from './QueuePanel';
import Toasts from './Toasts';
import FeedbackBanner from './FeedbackBanner';
import TouchControls from './TouchControls';
import BriefingModal from './BriefingModal';
import JournalPanel from './JournalPanel';
import ShelfPanel from './ShelfPanel';
import ResultsModal from './ResultsModal';
import PauseMenu from './PauseMenu';
import MissionBoard from './MissionBoard';
import ParentDashboard from './ParentDashboard';
import HelpModal, { ControlsList } from './HelpModal';
import ConfirmModal from './ConfirmModal';
import SettingsModal from './SettingsModal';
import DaySummaryModal from './DaySummaryModal';
import WowOverlays from './WowOverlays';
import PhoneCall, { isPhoneModal, phoneEscape } from './PhoneCall';
import { phonePress } from './HUD';
import PhoneReels, { openPhone } from './PhoneReels';
import { RewindButton, rewindPress } from './RewindOverlay';

function dismissTutorial() {
  store.state.tutorialSeen = true;
  if (store.ui.modal?.type === 'help') store.openModal(null);
  store.notify();
}

function Tutorial({ touch }: { touch: boolean }) {
  return (
    <section className="panel tutorial" role="dialog" aria-label="How to play">
      <button className="icon-btn" style={{ position: "absolute", top: 8, right: 8 }} onClick={dismissTutorial} aria-label="Close">
        ✕
      </button>
      <span className="eyebrow">Welcome home, {store.player?.name ?? 'friend'}!</span>
      <h2>Real life. Your rules.</h2>
      <p>
        Talk to your family to get tasks — or check the <b className="warn">notice board</b> on the fridge. Finish them before the deadline, within budget.
      </p>
      <ControlsList touch={touch} />
      <button className="btn btn-primary btn-block" onClick={dismissTutorial} autoFocus>
        Let's go ▶
      </button>
    </section>
  );
}

function ModalRouter({ touch }: { touch: boolean }) {
  const { ui } = useSnap();
  const m = ui.modal;
  if (!m || isPhoneModal(m)) return null; // the phone draws its own overlay (PhoneCall)
  switch (m.type) {
    case 'briefing':
      return <BriefingModal modal={m} />;
    case 'journal':
      return <JournalPanel />;
    case 'shelf':
      return <ShelfPanel shelfId={m.shelfId} />;
    case 'results':
      return <ResultsModal resultId={m.resultId} />;
    case 'pause':
      return <PauseMenu />;
    case 'board':
      return <MissionBoard />;
    case 'parent':
      return <ParentDashboard onClose={() => store.openModal(null)} />;
    case 'help':
      // the first-run tutorial rides on the 'help' modal so the clock is paused
      return store.state.tutorialSeen ? <HelpModal /> : <Tutorial touch={touch} />;
    case 'confirm':
      return <ConfirmModal modal={m} />;
    case 'settings':
      return <SettingsModal />;
    case 'day-summary':
      return <DaySummaryModal day={m.day} />;
    case 'reels':
      return <PhoneReels />;
    default:
      return null;
  }
}

export default function GameScreen() {
  const { state, ui } = useSnap();
  const touch = useIsTouch();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const typing = isTypingTarget(e.target);
      const u = store.ui;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (phoneEscape()) return;
        if (!store.state.tutorialSeen && (!u.modal || u.modal.type === 'help')) return dismissTutorial();
        if (u.modal) return store.openModal(null);
        if (u.feedback) return store.setUI({ feedback: null });
        if (!u.dialogue) return store.openModal({ type: 'pause' });
        return;
      }
      if (typing || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'j' && !u.dialogue) {
        if (u.modal?.type === 'journal') store.openModal(null);
        else if (!u.modal) store.openModal({ type: 'journal' });
      } else if (k === 'p' && !u.dialogue && !u.modal) {
        phonePress();
      } else if (k === 'h' && !u.dialogue && !u.modal && store.state.settings?.hints !== false) {
        store.hint();
      } else if (k === 'r' && !u.dialogue && (!u.modal || u.modal.type === 'reels')) {
        openPhone();
      } else if (k === 'v' && !u.dialogue && !u.modal) {
        store.toggleView3d();
      } else if (k === 't' && (!u.modal || u.modal.type === 'journal' || u.modal.type === 'reels')) {
        // Rewind Time — also works while a challenge is on screen
        rewindPress();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // show the first-run tutorial as a (blocking) modal so game time doesn't run
  useEffect(() => {
    if (!state.tutorialSeen && !ui.modal && !ui.dialogue) store.openModal({ type: 'help' });
  }, [state.tutorialSeen, ui.modal, ui.dialogue]);

  // stop the page itself from scrolling / pinch-zooming while playing
  useEffect(() => {
    const stop = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    const gesture = (e: Event) => e.preventDefault();
    document.addEventListener('touchmove', stop, { passive: false });
    document.addEventListener('gesturestart', gesture);
    return () => {
      document.removeEventListener('touchmove', stop);
      document.removeEventListener('gesturestart', gesture);
    };
  }, []);

  const queueVisible = state.inQueue && !ui.dialogue;
  return (
    <div className={`game-root ${touch ? 'is-touch' : ''} ${queueVisible ? 'has-queue' : ''}`}>
      <div className="game-canvas">
        <CanvasBoundary>
        <Suspense fallback={<div className="loading-world"><span className="label">Loading world…</span></div>}>
          <GameCanvas />
        </Suspense>
        </CanvasBoundary>
        <CanvasBoundary>
          <Suspense fallback={null}>
            <World3D />
          </Suspense>
        </CanvasBoundary>
      </div>
      <div className="layer">
        <HUD touch={touch} />
        <QueuePanel />
        {touch && <TouchControls />}
        {touch && <RewindButton touch />}
        {touch && (
          <button className="btn view-toggle-touch" onClick={() => store.toggleView3d()} aria-label={ui.view3d ? 'Switch to 2D view' : 'Switch to 3D view'}>
            {ui.view3d ? '2D' : '3D'}
          </button>
        )}
        <DialoguePanel />
        <FeedbackBanner />
        <Toasts />
        <RewardCelebration />
        <ModalRouter touch={touch} />
        <PhoneCall />
        <WowOverlays />
      </div>
    </div>
  );
}
