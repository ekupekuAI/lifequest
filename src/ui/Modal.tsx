import { useEffect, useRef, type ReactNode } from 'react';
import { isTypingTarget } from './hooks';

/**
 * Shared modal frame. Escape is handled centrally by the screen's key handler
 * (so it never double-fires with "open pause"); this frame provides the visible ✕.
 */
export function Modal({
  title,
  icon,
  onClose,
  children,
  footer,
  size = 'md',
  className,
  label,
  closeLabel = 'Close',
}: {
  title: ReactNode;
  icon?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // move focus into the dialog for keyboard users, without stealing it from an input
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? el;
    target.focus({ preventScroll: true });
    return () => {
      // in-game, hand the keyboard back to the world instead of re-focusing a HUD button
      if (prev && document.contains(prev) && !prev.closest('.game-root')) prev.focus?.({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('.modal')) document.activeElement.blur();
    };
  }, []);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        ref={ref}
        className={`panel modal modal-${size} ${className ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === 'string' ? title : undefined)}
        tabIndex={-1}
        onKeyDown={(e) => {
          // keep typed letters (WASD, E, space) away from the game's window key listeners
          if (isTypingTarget(e.target) && e.key !== 'Escape') e.stopPropagation();
        }}
      >
        <header className="modal-head">
          {icon && <span className="modal-icon">{icon}</span>}
          <h2 className="modal-title">{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label={closeLabel} title={`${closeLabel} (Esc)`}>
              ✕
            </button>
          )}
        </header>
        <div className="modal-body scroll">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Bar({ value, max = 100, tone, label }: { value: number; max?: number; tone?: 'good' | 'warn' | 'bad' | 'sky'; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <span className={`bar bar-${tone ?? 'good'}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-label={label}>
      <span className="bar-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Stars({ n, of = 3 }: { n: number; of?: number }) {
  return (
    <span className="stars" aria-label={`Difficulty ${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < n ? 'on' : ''}>
          ★
        </span>
      ))}
    </span>
  );
}

export function Key({ children }: { children: ReactNode }) {
  return <kbd className="key">{children}</kbd>;
}
