import { lazy, Suspense } from 'react';
import { useSnap } from './ui/hooks';
import StartScreen from './ui/StartScreen';
import FamilySetup from './ui/FamilySetup';
import GameScreen from './ui/GameScreen';

const FamilyGate = lazy(() => import('./ui/FamilyGate'));
const ParentLive = lazy(() => import('./ui/ParentLive'));

function ScreenLoading() {
  return (
    <div className="screen fam" role="status" style={{ display: 'grid', placeItems: 'center' }}>
      <span className="muted">Loading…</span>
    </div>
  );
}

export default function App() {
  const { ui } = useSnap();
  switch (ui.screen) {
    case 'setup':
      return <FamilySetup />;
    case 'game':
      return <GameScreen />;
    case 'parent':
      return <StartScreen parentOpen />;
    case 'family':
      return (
        <Suspense fallback={<ScreenLoading />}>
          <FamilyGate />
        </Suspense>
      );
    case 'parent-live':
      return (
        <Suspense fallback={<ScreenLoading />}>
          <ParentLive />
        </Suspense>
      );
    default:
      return <StartScreen />;
  }
}
