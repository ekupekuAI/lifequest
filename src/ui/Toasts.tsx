import { store } from '../core/store';
import { fmt } from '../missions/format';
import { useSnap } from './hooks';

export default function Toasts() {
  const { ui } = useSnap();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {ui.toasts.map((t) => (
        <div key={t.id} className={`panel toast ${t.tone}`}>
          {t.text.includes('{') ? fmt(store, t.text) : t.text}
        </div>
      ))}
    </div>
  );
}
