import { useEffect } from 'react';
import { store } from '../core/store';
import { useSnap } from './hooks';

const HIDE_MS = 7000;
const ICON = { good: '+', neutral: '~', bad: '!' } as const;
const TITLE = { good: 'Good call', neutral: 'Trade-off', bad: 'Consequence' } as const;

/** Small consequence card after a challenge choice. Never blocks play. */
export default function FeedbackBanner() {
  const { ui } = useSnap();
  const fb = ui.feedback;
  useEffect(() => {
    if (!fb) return;
    const id = window.setTimeout(() => {
      if (store.ui.feedback === fb) store.setUI({ feedback: null });
    }, HIDE_MS);
    return () => window.clearTimeout(id);
  }, [fb]);
  if (!fb) return null;
  return (
    <aside className={`panel feedback ${fb.tone}`} role="status" aria-live="polite">
      <span className="fb-icon" aria-hidden>
        {ICON[fb.tone]}
      </span>
      <div className="fb-text">
        <div className="label" style={{ color: 'inherit' }}>{TITLE[fb.tone]}</div>
        {fb.text}
      </div>
      <button className="icon-btn" style={{ width: 24, height: 24, fontSize: 11 }} onClick={() => store.setUI({ feedback: null })} aria-label="Dismiss">
        ✕
      </button>
      <span className="fb-timer" aria-hidden key={fb.text} />
    </aside>
  );
}
