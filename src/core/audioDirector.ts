// Audio director: watches the game store and steers background music + ambience.
// Self-starts on import (browser only). Never throws; does nothing in node/tests.

import { store } from './store';
import { voice } from './voice';
import type { Settings } from '../domain/types';
import { MOOD_IDS, MOODS, MusicEngine, pickMood, type MoodId } from './music';
import { AmbienceEngine, SILENT_SCENE, pickAmbience, sceneKey } from './ambience';

export { pickMood } from './music';
export { pickAmbience } from './ambience';

export type MusicSettings = NonNullable<Settings['music']>;
export const DEFAULT_MUSIC: MusicSettings = { enabled: true, volume: 0.5, ambience: 0.6 };

const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

/** Settings.music with defaults filled in. */
export function musicSettings(s: Partial<Settings> | null | undefined): MusicSettings {
  const m = s?.music;
  return {
    enabled: m?.enabled !== false,
    volume: clamp01(m?.volume, DEFAULT_MUSIC.volume),
    ambience: clamp01(m?.ambience, DEFAULT_MUSIC.ambience),
  };
}

/** Perceptual volume curve: slider 0..1 → gain. Kept modest so voices sit on top. */
export function musicGain(v: number): number {
  return 1.8 * Math.pow(Math.max(0, Math.min(1, v)), 1.5);
}
export function ambienceGain(v: number): number {
  return 1.4 * Math.pow(Math.max(0, Math.min(1, v)), 1.5);
}

/** Pure: how much to lower the music (1 = full) for dialogue / voice lines / pause. */
export function duckFactor(opts: { dialogue: boolean; speaking: boolean; paused?: boolean }): number {
  let f = 1;
  if (opts.dialogue) f = Math.min(f, 0.7);
  if (opts.paused) f = Math.min(f, 0.6);
  if (opts.speaking) f = Math.min(f, 0.6);
  return f;
}

class AudioDirector {
  private ctx: AudioContext | null = null;
  private music: MusicEngine | null = null;
  private amb: AmbienceEngine | null = null;
  private started = false;
  private lastScene = '';
  private lastModal: string | null = null;
  private previewTimer: ReturnType<typeof setInterval> | null = null;
  private previewMood: MoodId | null = null;
  private previewListeners = new Set<() => void>();
  private musicOn = false;
  private last = { vol: -1, duck: -1, amb: -1 };

  /** Only touch an AudioParam when the value really changes (store updates are frequent). */
  private changed(k: 'vol' | 'duck' | 'amb', v: number): boolean {
    if (Math.abs(this.last[k] - v) < 1e-4) return false;
    this.last[k] = v;
    return true;
  }

  start() {
    if (this.started || typeof window === 'undefined' || typeof document === 'undefined') return;
    this.started = true;
    const unlock = () => {
      this.unlock();
      if (this.ctx && this.ctx.state === 'running') {
        for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.removeEventListener(ev, unlock, true);
      }
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(ev, unlock, true);
    store.subscribe(() => this.update());
    try {
      voice.subscribe(() => this.update());
    } catch {
      /* voice engine unavailable */
    }
    document.addEventListener('visibilitychange', () => this.onVisibility());
  }

  /** Create / resume the AudioContext (must run inside a user gesture the first time). */
  unlock() {
    try {
      const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        const ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 12;
        comp.ratio.value = 3.5;
        comp.attack.value = 0.01;
        comp.release.value = 0.25;
        const master = ctx.createGain();
        master.gain.value = 0.9;
        comp.connect(master).connect(ctx.destination);
        this.ctx = ctx;
        this.music = new MusicEngine(ctx, comp);
        this.amb = new AmbienceEngine(ctx, comp);
      }
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume().then(() => this.update()).catch(() => {});
      this.update();
    } catch {
      /* audio unavailable */
    }
  }

  private onVisibility() {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (document.hidden) void ctx.suspend().catch(() => {});
      else void ctx.resume().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  /** Re-evaluate mood, ambience, ducking and volumes from the store. */
  update() {
    try {
      this.apply();
    } catch {
      /* never throw into the store's listeners */
    }
  }

  private apply() {
    const music = this.music;
    const amb = this.amb;
    if (!music || !amb || !this.ctx) return;
    const snap = store.getSnapshot();
    const { state, ui } = snap;
    const ms = musicSettings(state?.settings);
    const previewing = this.previewMood !== null;

    // music
    if (ms.enabled || previewing) {
      const mood = this.previewMood ?? pickMood(snap);
      music.setMood(mood, previewing);
      this.musicOn = true;
      const vol = musicGain(previewing && !ms.enabled ? DEFAULT_MUSIC.volume : ms.volume);
      if (this.changed('vol', vol)) music.setVolume(vol);
    } else if (this.musicOn) {
      this.musicOn = false;
      this.changed('vol', 0);
      music.setVolume(0);
      music.stop();
    }
    const speaking = !!voice.speaking;
    const duck = duckFactor({ dialogue: !!ui.dialogue, speaking, paused: ui.modal?.type === 'pause' || ui.modal?.type === 'phone' });
    if (this.changed('duck', duck)) music.setDuck(duck);

    // results sting
    const modalType = ui.modal?.type ?? null;
    if (modalType === 'results' && this.lastModal !== 'results' && ms.enabled && !previewing) {
      const res = ui.modal && 'resultId' in ui.modal ? state.results?.find((r) => r.id === (ui.modal as { resultId: string }).resultId) : undefined;
      music.playSting(res?.outcome === 'incomplete' ? 'soft' : 'good');
    }
    this.lastModal = modalType;

    // ambience
    const scene = ms.enabled && !previewing ? pickAmbience(snap) : SILENT_SCENE;
    const key = sceneKey(scene);
    if (key !== this.lastScene) {
      this.lastScene = key;
      amb.setScene(scene);
    }
    const ambDuck = speaking ? 0.75 : 1;
    const ambVol = ms.enabled && !previewing ? ambienceGain(ms.ambience) * ambDuck : 0;
    if (this.changed('amb', ambVol)) amb.setVolume(ambVol);
  }

  // ----- preview (settings panel) -----

  get previewing(): MoodId | null {
    return this.previewMood;
  }

  subscribePreview = (fn: () => void) => {
    this.previewListeners.add(fn);
    return () => {
      this.previewListeners.delete(fn);
    };
  };

  private emitPreview() {
    for (const fn of this.previewListeners) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  }

  /** Cycle through every mood, 4 s each. Call again (or stopPreview) to stop. */
  startPreview(seconds = 4) {
    this.unlock();
    this.stopPreview(false);
    let i = 0;
    this.previewMood = MOOD_IDS[0];
    this.previewTimer = setInterval(() => {
      i++;
      if (i >= MOOD_IDS.length) {
        this.stopPreview();
        return;
      }
      this.previewMood = MOOD_IDS[i];
      this.update();
      this.emitPreview();
    }, seconds * 1000);
    this.update();
    this.emitPreview();
  }

  stopPreview(refresh = true) {
    if (this.previewTimer !== null) clearInterval(this.previewTimer);
    this.previewTimer = null;
    if (this.previewMood === null) return;
    this.previewMood = null;
    if (refresh) {
      // snap straight back to the game's mood
      const ms = musicSettings(store.getSnapshot().state?.settings);
      if (this.music && ms.enabled) this.music.setMood(pickMood(store.getSnapshot()), true);
      this.update();
    }
    this.emitPreview();
  }

  /** Debug/inspection helper. */
  debug() {
    return { ctx: this.ctx?.state ?? 'none', mood: this.music?.mood ?? null, scene: this.lastScene, preview: this.previewMood };
  }
}

export const audioDirector = new AudioDirector();

export function moodLabel(id: MoodId | null): string {
  return id ? MOODS[id]?.label ?? id : '';
}

if (typeof window !== 'undefined') {
  try {
    audioDirector.start();
    if (import.meta.env?.DEV) (window as any).__lqAudio = audioDirector;
  } catch {
    /* never break the app over audio */
  }
}
