import { useEffect, useState, useSyncExternalStore } from 'react';
import { store } from '../core/store';

/** Subscribe to the game store. The snapshot object changes on every notify. */
export function useSnap() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** True on phones/tablets (coarse pointer or touch support). */
export function useIsTouch(): boolean {
  const [touch, setTouch] = useState(() => detectTouch());
  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: coarse)');
    const on = () => setTouch(detectTouch());
    mq?.addEventListener?.('change', on);
    window.addEventListener('touchstart', on, { once: true, passive: true });
    return () => {
      mq?.removeEventListener?.('change', on);
      window.removeEventListener('touchstart', on);
    };
  }, []);
  return touch;
}

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

/** Rerender at an interval (for live clocks/timers that don't notify). */
export function useTicker(ms: number, active = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => set((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms, active]);
}

export const LOCATION_NAMES: Record<string, string> = {
  home: 'Home',
  town: 'Town',
  grocery: 'FreshMart',
  clinic: 'City Clinic',
};

export function levelFor(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 50)) + 1;
  const cur = 50 * (level - 1) ** 2;
  const next = 50 * level ** 2;
  return { level, pct: Math.max(0, Math.min(1, (xp - cur) / (next - cur))), toNext: next - xp };
}
