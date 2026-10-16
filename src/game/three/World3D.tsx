// 3D diorama mode. Mounted (lazily) over the Phaser canvas; Phaser keeps running underneath
// as the source of truth and this view mirrors it every frame (see engine.ts).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { store } from '../../core/store';
import { DioramaEngine } from './engine';
import './world3d.css';

const HINT_KEY = 'lifequest.3dHintSeen';

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function World3D() {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const on = snap.ui.view3d;
  const [mounted, setMounted] = useState(on);
  const [supported] = useState(webglAvailable);
  useEffect(() => {
    if (on) setMounted(true);
  }, [on]);
  if (!supported || !mounted) return null;
  return <Diorama on={on} onExited={() => setMounted(false)} />;
}

function Diorama({ on, onExited }: { on: boolean; onExited: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const fade = useRef<HTMLDivElement>(null);
  const engine = useRef<DioramaEngine | null>(null);
  const exitRef = useRef(onExited);
  exitRef.current = onExited;
  const [hint, setHint] = useState(false);
  const [rested, setRested] = useState(false);

  useEffect(() => {
    if (!host.current || !fade.current) return;
    let eng: DioramaEngine;
    try {
      eng = new DioramaEngine(host.current, fade.current, prefersReducedMotion(), {
        onExited: () => exitRef.current(),
        onRested: () => {
          setRested(true);
          let seen = false;
          try {
            seen = localStorage.getItem(HINT_KEY) === '1';
            localStorage.setItem(HINT_KEY, '1');
          } catch {
            /* storage unavailable */
          }
          if (!seen) setHint(true);
        },
      });
    } catch (err) {
      console.warn('[3D] could not start the diorama view', err);
      store.toggleView3d(false);
      exitRef.current();
      return;
    }
    engine.current = eng;
    if (import.meta.env?.DEV) (window as unknown as { __w3d?: DioramaEngine }).__w3d = eng;
    return () => {
      eng.dispose();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.setOn(on);
    if (!on) setHint(false);
  }, [on]);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(false), 4500);
    return () => window.clearTimeout(t);
  }, [hint]);

  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  return (
    <div ref={host} className={`w3d ${on && rested ? 'w3d-on' : ''}`} aria-hidden="true">
      <div className="w3d-vignette" />
      <div ref={fade} className="w3d-fade" />
      <div className="w3d-badge">3D</div>
      <div className={`w3d-hint ${hint ? 'show' : ''}`}>{touch ? 'Tap 2D to go back to the flat view' : 'Press V to go back to 2D · right-drag to look around'}</div>
    </div>
  );
}
