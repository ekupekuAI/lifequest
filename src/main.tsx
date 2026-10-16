import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './core/audioDirector';

// No React.StrictMode: its double-mount would create the Phaser game twice.
createRoot(document.getElementById('root')!).render(<App />);
