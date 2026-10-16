import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './core/audioDirector';
import { store } from './core/store';
import { installCustomMissions } from './missions/custom';

// parent-made shopping lists → playable missions + "Family list" shelf products
installCustomMissions(store);

// No React.StrictMode: its double-mount would create the Phaser game twice.
createRoot(document.getElementById('root')!).render(<App />);
