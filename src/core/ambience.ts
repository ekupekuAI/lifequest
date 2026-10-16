// Synthesised ambient soundscapes (Web Audio, no audio files).
// pickAmbience() is pure (testable); AmbienceEngine renders a scene.

import { noiseBuffer, timeOfDay } from './music';

export type BedId = 'wind' | 'nightAir' | 'traffic' | 'rain' | 'rainRoof' | 'fridge' | 'store' | 'aircon' | 'room';
export type EventId = 'bird' | 'car' | 'cricket' | 'drip' | 'beep' | 'chatter' | 'page';

export interface AmbienceScene {
  /** bed id → relative level (0..1) */
  beds: Partial<Record<BedId, number>>;
  /** event id → average occurrences per minute */
  events: Partial<Record<EventId, number>>;
  /** clock tick once a second (home, evening/night) */
  tick: boolean;
  /** outdoor sounds heard through walls (muffled) */
  indoor: boolean;
}

export const SILENT_SCENE: AmbienceScene = { beds: {}, events: {}, tick: false, indoor: false };

export interface AmbienceInput {
  ui: { screen: string };
  state: { location: string; clock: { minutes: number }; world?: Record<string, unknown> };
}

export function isRaining(s: AmbienceInput['state']): boolean {
  const r = s.world?.['rainUntil'];
  if (r === undefined || r === null || r === false) return false;
  const until = Number(r);
  return Number.isFinite(until) && s.clock.minutes <= until;
}

/** Pure: which soundscape fits this game state. */
export function pickAmbience(s: AmbienceInput): AmbienceScene {
  if (!s || !s.ui || s.ui.screen !== 'game' || !s.state) return SILENT_SCENE;
  const tod = timeOfDay(s.state.clock?.minutes ?? 0);
  const rain = isRaining(s.state);
  const beds: AmbienceScene['beds'] = {};
  const events: AmbienceScene['events'] = {};
  let tick = false;
  let indoor = true;
  switch (s.state.location) {
    case 'town':
    case 'city': {
      indoor = false;
      const city = s.state.location === 'city';
      if (tod === 'night') {
        beds.nightAir = 0.7;
        beds.traffic = city ? 0.6 : 0.15;
        events.cricket = city ? 6 : 30;
        events.car = city ? 2 : 0.4;
      } else {
        beds.wind = city ? 0.3 : 0.5;
        beds.traffic = city ? 1 : tod === 'evening' ? 0.35 : 0.4;
        events.car = city ? 4 : 1.5;
        events.bird = tod === 'evening' ? (city ? 1 : 3) : city ? 2 : 10;
        events.chatter = city ? 3 : 1.5;
        if (tod === 'evening') events.cricket = city ? 2 : 8;
      }
      if (rain) {
        beds.rain = 1;
        events.drip = 40;
        delete events.bird;
        delete events.cricket;
        if (events.chatter) events.chatter *= 0.3;
      }
      break;
    }
    case 'grocery':
      beds.store = 1;
      events.chatter = 6;
      events.beep = 3;
      if (rain) beds.rainRoof = 0.5;
      break;
    case 'clinic':
      beds.aircon = 1;
      events.chatter = 2;
      if (rain) beds.rainRoof = 0.4;
      break;
    case 'library':
      beds.room = 1;
      events.page = 2;
      if (rain) beds.rainRoof = 0.5;
      break;
    case 'home':
    default:
      beds.fridge = 0.6;
      tick = tod !== 'day';
      if (tod === 'day') events.bird = 2;
      if (tod === 'night') events.cricket = 6;
      if (rain) {
        beds.rainRoof = 1;
        events.drip = 10;
        delete events.bird;
        delete events.cricket;
      }
      break;
  }
  return { beds, events, tick, indoor };
}

export function sceneKey(sc: AmbienceScene): string {
  return JSON.stringify(sc);
}

// ---------------------------------------------------------------------------
// engine

const BED_LEVEL: Record<BedId, number> = {
  wind: 0.12,
  nightAir: 0.08,
  traffic: 0.22,
  rain: 0.1,
  rainRoof: 0.25,
  fridge: 0.06,
  store: 0.12,
  aircon: 0.12,
  room: 0.035,
};

interface Bed {
  gain: GainNode;
}

export class AmbienceEngine {
  readonly output: GainNode;
  private muffle: BiquadFilterNode;
  private beds = new Map<BedId, Bed>();
  private scene: AmbienceScene = SILENT_SCENE;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTick = 0;
  private tock = false;
  private white: AudioBuffer;
  private pink: AudioBuffer;
  private brown: AudioBuffer;

  constructor(private ctx: AudioContext, destination: AudioNode) {
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    this.output.connect(destination);
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 1100;
    const mg = ctx.createGain();
    mg.gain.value = 0.55;
    this.muffle.connect(mg).connect(this.output);
    this.white = noiseBuffer(ctx, 3, 'white');
    this.pink = noiseBuffer(ctx, 4, 'pink');
    this.brown = noiseBuffer(ctx, 5, 'brown');
  }

  setVolume(v: number, time = 0.6) {
    this.output.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, time / 3);
  }

  setScene(sc: AmbienceScene) {
    this.scene = sc;
    const now = this.ctx.currentTime;
    const ids = new Set<BedId>([...this.beds.keys(), ...(Object.keys(sc.beds) as BedId[])]);
    for (const id of ids) {
      const lv = (sc.beds[id] ?? 0) * BED_LEVEL[id];
      let bed = this.beds.get(id);
      if (!bed && lv > 0) {
        bed = this.makeBed(id) ?? undefined;
        if (bed) this.beds.set(id, bed);
      }
      bed?.gain.gain.setTargetAtTime(lv, now, 0.8);
    }
    if (this.timer === null && (Object.keys(sc.events).length || sc.tick)) {
      this.timer = setInterval(() => {
        try {
          this.tickEvents();
        } catch {
          /* never throw */
        }
      }, 250);
    }
  }

  stop() {
    this.setScene(SILENT_SCENE);
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  // ----- beds -----

  private loop(buf: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start(this.ctx.currentTime, Math.random() * buf.duration);
    return src;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private lfo(target: AudioParam, rate: number, depth: number) {
    const o = this.ctx.createOscillator();
    o.frequency.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
  }

  private hum(freqs: number[], level: number, dest: AudioNode) {
    for (const f of freqs) {
      const o = this.ctx.createOscillator();
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = level / freqs.length;
      o.connect(g).connect(dest);
      o.start();
    }
  }

  private makeBed(id: BedId): Bed | null {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const out = this.output;
    switch (id) {
      case 'wind': {
        const f = this.filter('lowpass', 500);
        const amp = ctx.createGain();
        amp.gain.value = 0.7;
        this.lfo(amp.gain, 0.09, 0.3);
        this.lfo(f.frequency, 0.05, 180);
        this.loop(this.pink).connect(f).connect(amp).connect(gain);
        break;
      }
      case 'nightAir':
        this.loop(this.pink).connect(this.filter('lowpass', 320)).connect(gain);
        break;
      case 'traffic': {
        const f = this.filter('lowpass', 260);
        const amp = ctx.createGain();
        amp.gain.value = 0.8;
        this.lfo(amp.gain, 0.06, 0.2);
        this.loop(this.brown).connect(f).connect(amp).connect(gain);
        break;
      }
      case 'rain':
        this.loop(this.white).connect(this.filter('highpass', 900)).connect(this.filter('lowpass', 6500)).connect(gain);
        this.loop(this.pink).connect(this.filter('bandpass', 400, 0.5)).connect(gain);
        break;
      case 'rainRoof':
        this.loop(this.pink).connect(this.filter('lowpass', 700)).connect(gain);
        this.loop(this.brown).connect(this.filter('lowpass', 200)).connect(gain);
        break;
      case 'fridge': {
        this.hum([50, 100, 150], 0.5, gain);
        this.loop(this.pink).connect(this.filter('lowpass', 250)).connect(gain);
        break;
      }
      case 'store':
        this.hum([120, 240, 360], 0.25, gain);
        this.loop(this.pink).connect(this.filter('lowpass', 1200)).connect(gain);
        break;
      case 'aircon': {
        const f = this.filter('lowpass', 900);
        this.loop(this.pink).connect(this.filter('highpass', 120)).connect(f).connect(gain);
        this.hum([60], 0.15, gain);
        break;
      }
      case 'room':
        this.loop(this.pink).connect(this.filter('lowpass', 300)).connect(gain);
        break;
      default:
        return null;
    }
    gain.connect(out);
    return { gain };
  }

  // ----- one-shot events -----

  private tickEvents() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const sc = this.scene;
    for (const [id, rate] of Object.entries(sc.events) as [EventId, number][]) {
      if (!rate) continue;
      // Poisson-ish: chance per 250 ms tick
      if (Math.random() < rate / 240) this.fire(id, now + Math.random() * 0.25, sc.indoor);
    }
    if (sc.tick) {
      if (this.nextTick < now) this.nextTick = Math.ceil(now);
      while (this.nextTick < now + 0.4) {
        this.click(this.nextTick, this.tock ? 2100 : 2700, 0.12);
        this.tock = !this.tock;
        this.nextTick += 1;
      }
    }
  }

  private dest(indoor: boolean, outdoorSound: boolean): AudioNode {
    return indoor && outdoorSound ? this.muffle : this.output;
  }

  private panner(pan: number, dest: AudioNode): AudioNode {
    if (typeof this.ctx.createStereoPanner !== 'function') return dest;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    return p;
  }

  private fire(id: EventId, t: number, indoor: boolean) {
    switch (id) {
      case 'bird':
        return this.bird(t, this.panner(Math.random() * 1.6 - 0.8, this.dest(indoor, true)));
      case 'car':
        return this.car(t, this.dest(indoor, true));
      case 'cricket':
        return this.cricket(t, this.panner(Math.random() * 1.4 - 0.7, this.dest(indoor, true)));
      case 'drip':
        return this.drip(t, this.panner(Math.random() * 1.6 - 0.8, this.dest(indoor, true)));
      case 'beep':
        return this.beep(t);
      case 'chatter':
        return this.chatter(t, indoor);
      case 'page':
        return this.page(t);
    }
  }

  private env(t: number, peak: number, attack: number, dur: number, dest: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    return g;
  }

  private bird(t: number, dest: AudioNode) {
    const ctx = this.ctx;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2400 + Math.random() * 2000;
    const up = Math.random() < 0.5;
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = 0.06 + Math.random() * 0.07;
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = base * (0.9 + Math.random() * 0.2);
      o.frequency.setValueAtTime(up ? f0 * 0.75 : f0 * 1.2, tt);
      o.frequency.exponentialRampToValueAtTime(up ? f0 * 1.25 : f0 * 0.8, tt + d);
      o.connect(this.env(tt, 0.035, 0.01, d, dest));
      o.start(tt);
      o.stop(tt + d + 0.02);
      tt += d + 0.04 + Math.random() * 0.08;
    }
  }

  private car(t: number, dest: AudioNode) {
    const ctx = this.ctx;
    const dur = 3.5 + Math.random() * 2;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const out: AudioNode = pan ?? dest;
    if (pan) {
      pan.pan.setValueAtTime(-0.85 * dir, t);
      pan.pan.linearRampToValueAtTime(0.85 * dir, t + dur);
      pan.connect(dest);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(out);
    // tyre / wind noise
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    const bp = this.filter('bandpass', 300, 0.8);
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.linearRampToValueAtTime(650, t + dur * 0.5);
    bp.frequency.linearRampToValueAtTime(240, t + dur);
    src.connect(bp).connect(g);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
    // engine with a little doppler
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = 55 + Math.random() * 25;
    o.frequency.setValueAtTime(f * 1.06, t);
    o.frequency.setValueAtTime(f * 1.06, t + dur * 0.45);
    o.frequency.linearRampToValueAtTime(f * 0.94, t + dur * 0.6);
    const lp = this.filter('lowpass', 180);
    const og = ctx.createGain();
    og.gain.value = 0.25;
    o.connect(lp).connect(og).connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private cricket(t: number, dest: AudioNode) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 4200 + Math.random() * 600;
    const g = ctx.createGain();
    g.gain.value = 0;
    const pulses = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < pulses; i++) {
      const pt = t + i * 0.045;
      g.gain.setValueAtTime(0, pt);
      g.gain.linearRampToValueAtTime(0.018, pt + 0.008);
      g.gain.linearRampToValueAtTime(0, pt + 0.025);
    }
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + pulses * 0.045 + 0.05);
  }

  private drip(t: number, dest: AudioNode) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = 1200 + Math.random() * 1400;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.04);
    o.connect(this.env(t, 0.03, 0.002, 0.06, dest));
    o.start(t);
    o.stop(t + 0.08);
  }

  private beep(t: number) {
    const ctx = this.ctx;
    const twice = Math.random() < 0.25;
    for (let i = 0; i < (twice ? 2 : 1); i++) {
      const tt = t + i * 0.18;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 1850;
      const lp = this.filter('lowpass', 3500);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.012, tt + 0.005);
      g.gain.setValueAtTime(0.012, tt + 0.1);
      g.gain.linearRampToValueAtTime(0.0001, tt + 0.12);
      o.connect(lp).connect(g).connect(this.panner(0.4, this.output));
      o.start(tt);
      o.stop(tt + 0.14);
    }
  }

  /** Indistinct murmur: a few "syllables" of formant-filtered noise + a low voiced hum. */
  private chatter(t: number, indoor: boolean) {
    const ctx = this.ctx;
    const dest = this.panner(Math.random() * 1.4 - 0.7, indoor ? this.output : this.muffle);
    const lp = this.filter('lowpass', 1000);
    lp.connect(dest);
    const n = 3 + Math.floor(Math.random() * 6);
    const pitch = 110 + Math.random() * 110;
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = 0.08 + Math.random() * 0.12;
      const src = ctx.createBufferSource();
      src.buffer = this.pink;
      const bp = this.filter('bandpass', 400 + Math.random() * 600, 3);
      src.connect(bp).connect(this.env(tt, 0.05, 0.02, d, lp));
      src.start(tt, Math.random() * 3);
      src.stop(tt + d + 0.02);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(pitch * (0.9 + Math.random() * 0.25), tt);
      o.frequency.linearRampToValueAtTime(pitch * (0.85 + Math.random() * 0.25), tt + d);
      o.connect(this.env(tt, 0.012, 0.02, d, lp));
      o.start(tt);
      o.stop(tt + d + 0.02);
      tt += d + 0.02 + Math.random() * 0.1;
    }
  }

  private page(t: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const d = 0.22 + Math.random() * 0.15;
    const hp = this.filter('bandpass', 2000, 0.8);
    hp.frequency.setValueAtTime(1800, t);
    hp.frequency.exponentialRampToValueAtTime(5000, t + d);
    src.connect(hp).connect(this.env(t, 0.03, d * 0.4, d, this.panner(Math.random() - 0.5, this.output)));
    src.start(t, Math.random() * 2);
    src.stop(t + d + 0.02);
  }

  private click(t: number, freq: number, level: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = this.filter('bandpass', freq, 6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(bp).connect(g).connect(this.output);
    src.start(t, Math.random() * 2);
    src.stop(t + 0.04);
  }
}
