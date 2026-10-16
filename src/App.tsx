import { useSnap } from './ui/hooks';
import StartScreen from './ui/StartScreen';
import FamilySetup from './ui/FamilySetup';
import GameScreen from './ui/GameScreen';

export default function App() {
  const { ui } = useSnap();
  switch (ui.screen) {
    case 'setup':
      return <FamilySetup />;
    case 'game':
      return <GameScreen />;
    case 'parent':
      return <StartScreen parentOpen />;
    default:
      return <StartScreen />;
  }
}
