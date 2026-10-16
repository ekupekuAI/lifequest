// Synthesised retro sound effects (WebAudio) — no audio files to license or load.
type Sfx = 'blip' | 'select' | 'pickup' | 'cash' | 'objective' | 'error' | 'warn' | 'alert' | 'start' | 'win' | 'fail' | 'step' | 'door';

const NOTES: Record<Sfx, [number, number, OscillatorType, number][]> = {
  // [freq, durationMs, wave, delayMs]
  blip: [[660, 40, 'square', 0]],
  select: [[880, 50, 'square', 0]],
  pickup: [[520, 50, 'square', 0], [780, 70, 'square', 50]],
  cash: [[1200, 60, 'square', 0], [1600, 120, 'square', 60]],
  objective: [[523, 80, 'square', 0], [659, 80, 'square', 80], [784, 140, 'square', 160]],
  error: [[180, 140, 'sawtooth', 0]],
  warn: [[440, 120, 'triangle', 0], [440, 120, 'triangle', 200]],
  alert: [[700, 70, 'triangle', 0], [500, 90, 'triangle', 80]],
  start: [[392, 90, 'square', 0], [523, 90, 'square', 90], [659, 160, 'square', 180]],
  win: [[523, 100, 'square', 0], [659, 100, 'square', 110], [784, 100, 'square', 220], [1047, 260, 'square', 330]],
  fail: [[392, 160, 'triangle', 0], [330, 160, 'triangle', 170], [262, 260, 'triangle', 340]],
  step: [[90, 20, 'triangle', 0]],
  door: [[300, 60, 'triangle', 0], [200, 90, 'triangle', 60]],
};

let ctx: AudioContext | null = null;

export const sfx = {
  enabled: () => true,
  volume: 0.08,
  play(name: Sfx) {
    if (!this.enabled() || typeof window === 'undefined') return;
    try {
      ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === 'suspended') void ctx.resume();
      const now = ctx.currentTime;
      for (const [f, d, w, delay] of NOTES[name]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = w;
        o.frequency.value = f;
        const t0 = now + delay / 1000;
        g.gain.setValueAtTime(this.volume, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d / 1000);
        o.connect(g).connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + d / 1000 + 0.02);
      }
    } catch {
      /* audio unavailable — silently skip */
    }
  },
};
