// Generative background music, synthesised with the Web Audio API (no audio files).
//
// The top half of this file is pure logic (scales, chords, seeded melodies, mood
// selection) so it can be unit-tested in node. The MusicEngine below only touches
// Web Audio when it is constructed with a live AudioContext.

// ---------------------------------------------------------------------------
// pure helpers

export type ScaleMode = 'major' | 'minor' | 'dorian' | 'mixolydian' | 'lydian';

export const SCALES: Record<ScaleMode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** MIDI note of a (possibly negative or > 6) scale degree. Degree 0 = root, 7 = root an octave up. */
export function degreeToMidi(root: number, mode: ScaleMode, degree: number): number {
  const sc = SCALES[mode];
  const oct = Math.floor(degree / 7);
  const idx = ((degree % 7) + 7) % 7;
  return root + oct * 12 + sc[idx];
}

/** Scale degrees of a diatonic chord built on `degree` (triad, or 7th chord). */
export function chordDegrees(degree: number, size: 3 | 4 = 3): number[] {
  const out = [degree, degree + 2, degree + 4];
  if (size === 4) out.push(degree + 6);
  return out;
}

/** MIDI notes of the diatonic chord on `degree`. */
export function chordMidi(root: number, mode: ScaleMode, degree: number, size: 3 | 4 = 3): number[] {
  return chordDegrees(degree, size).map((d) => degreeToMidi(root, mode, d));
}

/** Small, fast, deterministic PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TimeOfDay = 'day' | 'evening' | 'night';
/** Before 6 PM = day, 6–8 PM = evening, after 8 PM (or before 5 AM) = night. */
export function timeOfDay(minutes: number): TimeOfDay {
  const m = (((minutes || 0) % 1440) + 1440) % 1440;
  if (m >= 20 * 60 || m < 5 * 60) return 'night';
  if (m >= 18 * 60) return 'evening';
  return 'day';
}

// ---------------------------------------------------------------------------
// moods

export type MoodId =
  | 'title'
  | 'home-day'
  | 'home-evening'
  | 'town-day'
  | 'town-evening'
  | 'night'
  | 'shop'
  | 'clinic'
  | 'city'
  | 'library'
  | 'tension'
  | 'queue';

export type Wave = OscillatorType | 'pulse' | 'bell';

export interface MoodDef {
  id: MoodId;
  label: string;
  bpm: number;
  /** MIDI note of the tonic in the lead's octave */
  root: number;
  mode: ScaleMode;
  /** chord scale-degree per bar (loop length = prog.length bars) */
  prog: number[];
  sevenths: boolean;
  swing: number;
  lead: { wave: Wave; density: number; level: number; octave: number } | null;
  comp: { style: 'pad' | 'hits' | 'arp'; wave: Wave; level: number; steps?: number[]; len?: number; octave: number };
  bass: { style: 'whole' | 'half' | 'quarter' | 'walk' | 'pulse' | 'bossa' | 'none'; wave: Wave; level: number };
  /** 16-step strings: 'x' = full, 'o' = soft, '.' = rest */
  drums: { kick?: string; snare?: string; hat?: string; rim?: string } | null;
  drumLevel: number;
  cutoff: number;
  reverb: number;
  delay: number;
  /** overall layer level (0..1) */
  level: number;
  seed: number;
}

export const MOODS: Record<MoodId, MoodDef> = {
  title: {
    id: 'title', label: 'Title', bpm: 92, root: 72, mode: 'major', prog: [0, 4, 5, 3, 0, 4, 3, 4], sevenths: false, swing: 0.05,
    lead: { wave: 'pulse', density: 0.6, level: 0.055, octave: 0 },
    comp: { style: 'pad', wave: 'triangle', level: 0.03, octave: -12 },
    bass: { style: 'half', wave: 'triangle', level: 0.12 },
    drums: { kick: 'x.......x.......', snare: '....o.......o...', hat: '..o...o...o...o.' }, drumLevel: 0.7,
    cutoff: 3200, reverb: 0.35, delay: 0.22, level: 0.9, seed: 1101,
  },
  'home-day': {
    id: 'home-day', label: 'Home (day)', bpm: 84, root: 65, mode: 'major', prog: [0, 3, 5, 4, 0, 3, 1, 4], sevenths: true, swing: 0.12,
    lead: { wave: 'triangle', density: 0.5, level: 0.07, octave: 12 },
    comp: { style: 'arp', wave: 'triangle', level: 0.03, octave: 0 },
    bass: { style: 'half', wave: 'sine', level: 0.14 },
    drums: { kick: 'x.....x...x.....', rim: '....o.......o...', hat: 'o.o.o.o.o.o.o.o.' }, drumLevel: 0.55,
    cutoff: 2400, reverb: 0.3, delay: 0.18, level: 0.85, seed: 2203,
  },
  'home-evening': {
    id: 'home-evening', label: 'Home (evening)', bpm: 76, root: 63, mode: 'major', prog: [0, 5, 3, 4, 0, 5, 1, 4], sevenths: true, swing: 0.15,
    lead: { wave: 'sine', density: 0.35, level: 0.08, octave: 12 },
    comp: { style: 'pad', wave: 'triangle', level: 0.03, octave: 0 },
    bass: { style: 'whole', wave: 'sine', level: 0.14 },
    drums: { kick: 'x.......x.......', hat: '....o.......o...' }, drumLevel: 0.4,
    cutoff: 1800, reverb: 0.42, delay: 0.2, level: 0.85, seed: 3307,
  },
  'town-day': {
    id: 'town-day', label: 'Town (day)', bpm: 100, root: 67, mode: 'major', prog: [0, 3, 4, 0, 5, 3, 1, 4], sevenths: false, swing: 0.08,
    lead: { wave: 'square', density: 0.7, level: 0.04, octave: 0 },
    comp: { style: 'hits', wave: 'pulse', level: 0.025, steps: [2, 6, 10, 14], len: 1, octave: -12 },
    bass: { style: 'walk', wave: 'triangle', level: 0.13 },
    drums: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' }, drumLevel: 0.7,
    cutoff: 3600, reverb: 0.25, delay: 0.15, level: 0.85, seed: 4409,
  },
  'town-evening': {
    id: 'town-evening', label: 'Town (sunset)', bpm: 88, root: 62, mode: 'major', prog: [0, 3, 5, 4, 0, 3, 4, 4], sevenths: true, swing: 0.1,
    lead: { wave: 'triangle', density: 0.5, level: 0.07, octave: 12 },
    comp: { style: 'pad', wave: 'pulse', level: 0.02, octave: 0 },
    bass: { style: 'half', wave: 'triangle', level: 0.13 },
    drums: { kick: 'x.......x.......', rim: '....o.......o...', hat: '..o...o...o...o.' }, drumLevel: 0.5,
    cutoff: 2200, reverb: 0.38, delay: 0.22, level: 0.85, seed: 5503,
  },
  night: {
    id: 'night', label: 'Night', bpm: 70, root: 69, mode: 'minor', prog: [0, 5, 2, 6, 0, 5, 3, 4], sevenths: true, swing: 0,
    lead: { wave: 'sine', density: 0.25, level: 0.07, octave: 0 },
    comp: { style: 'pad', wave: 'sine', level: 0.035, octave: -12 },
    bass: { style: 'whole', wave: 'sine', level: 0.12 },
    drums: null, drumLevel: 0,
    cutoff: 1400, reverb: 0.5, delay: 0.25, level: 0.8, seed: 6607,
  },
  shop: {
    id: 'shop', label: 'Shop', bpm: 96, root: 70, mode: 'major', prog: [1, 4, 0, 0, 1, 4, 0, 5], sevenths: true, swing: 0,
    lead: { wave: 'bell', density: 0.55, level: 0.05, octave: 0 },
    comp: { style: 'hits', wave: 'triangle', level: 0.03, steps: [0, 3, 6, 10, 12], len: 2, octave: -12 },
    bass: { style: 'bossa', wave: 'sine', level: 0.14 },
    drums: { kick: 'x..x....x..x....', rim: 'x..x..x...x.x...', hat: 'oooooooooooooooo' }, drumLevel: 0.45,
    cutoff: 2800, reverb: 0.3, delay: 0.12, level: 0.8, seed: 7703,
  },
  clinic: {
    id: 'clinic', label: 'Clinic', bpm: 66, root: 64, mode: 'lydian', prog: [0, 1, 0, 1, 5, 3, 1, 4], sevenths: true, swing: 0,
    lead: { wave: 'sine', density: 0.15, level: 0.06, octave: 12 },
    comp: { style: 'pad', wave: 'sine', level: 0.035, octave: 0 },
    bass: { style: 'whole', wave: 'sine', level: 0.09 },
    drums: null, drumLevel: 0,
    cutoff: 1200, reverb: 0.55, delay: 0.2, level: 0.75, seed: 8807,
  },
  city: {
    id: 'city', label: 'City', bpm: 104, root: 69, mode: 'dorian', prog: [0, 3, 0, 3, 2, 6, 0, 4], sevenths: true, swing: 0.04,
    lead: { wave: 'pulse', density: 0.75, level: 0.045, octave: 0 },
    comp: { style: 'arp', wave: 'pulse', level: 0.02, octave: -12 },
    bass: { style: 'quarter', wave: 'triangle', level: 0.13 },
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo' }, drumLevel: 0.6,
    cutoff: 3400, reverb: 0.22, delay: 0.18, level: 0.85, seed: 9901,
  },
  library: {
    id: 'library', label: 'Library', bpm: 72, root: 72, mode: 'major', prog: [0, 3, 4, 0, 5, 3, 4, 0], sevenths: false, swing: 0,
    lead: { wave: 'bell', density: 0.4, level: 0.065, octave: 12 },
    comp: { style: 'arp', wave: 'bell', level: 0.025, octave: 0 },
    bass: { style: 'whole', wave: 'sine', level: 0.07 },
    drums: null, drumLevel: 0,
    cutoff: 4000, reverb: 0.45, delay: 0.15, level: 1, seed: 10103,
  },
  tension: {
    id: 'tension', label: 'Hurry!', bpm: 112, root: 69, mode: 'minor', prog: [0, 0, 5, 6, 0, 0, 5, 4], sevenths: false, swing: 0,
    lead: { wave: 'pulse', density: 0.4, level: 0.04, octave: 0 },
    comp: { style: 'pad', wave: 'pulse', level: 0.018, octave: -12 },
    bass: { style: 'pulse', wave: 'triangle', level: 0.12 },
    drums: { kick: 'x...x...x...x...', snare: '............o...', hat: 'xoxoxoxoxoxoxoxo' }, drumLevel: 0.6,
    cutoff: 2600, reverb: 0.2, delay: 0.1, level: 0.85, seed: 11213,
  },
  queue: {
    id: 'queue', label: 'Waiting', bpm: 80, root: 67, mode: 'major', prog: [0, 5, 1, 4, 0, 5, 1, 4], sevenths: true, swing: 0.1,
    lead: { wave: 'triangle', density: 0.3, level: 0.06, octave: 0 },
    comp: { style: 'arp', wave: 'triangle', level: 0.025, octave: -12 },
    bass: { style: 'half', wave: 'sine', level: 0.12 },
    drums: { kick: 'x.......x.......', hat: '..o...o...o...o.' }, drumLevel: 0.45,
    cutoff: 2200, reverb: 0.3, delay: 0.2, level: 0.8, seed: 12301,
  },
};

export const MOOD_IDS = Object.keys(MOODS) as MoodId[];

/** Minimal slice of the store snapshot that decides the mood. */
export interface MoodInput {
  ui: { screen: string; modal?: { type: string } | null };
  state: {
    location: string;
    clock: { minutes: number };
    inQueue?: boolean;
    run?: { deadlineAt: number | null } | null;
  };
}

/** Pure: which music mood fits this game state. */
export function pickMood(s: MoodInput): MoodId {
  if (!s || !s.ui || s.ui.screen !== 'game' || !s.state) return 'title';
  if (s.ui.modal?.type === 'results') return 'home-evening';
  const minutes = s.state.clock?.minutes ?? 0;
  const run = s.state.run;
  if (run && run.deadlineAt !== null && run.deadlineAt !== undefined) {
    const left = run.deadlineAt - minutes;
    if (left >= 0 && left < 10) return 'tension';
  }
  if (s.state.inQueue) return 'queue';
  const tod = timeOfDay(minutes);
  switch (s.state.location) {
    case 'grocery':
      return 'shop';
    case 'clinic':
      return 'clinic';
    case 'library':
      return 'library';
    case 'city':
      return tod === 'night' ? 'night' : 'city';
    case 'town':
      return tod === 'day' ? 'town-day' : tod === 'evening' ? 'town-evening' : 'night';
    case 'home':
    default:
      return tod === 'day' ? 'home-day' : tod === 'evening' ? 'home-evening' : 'night';
  }
}

// ---------------------------------------------------------------------------
// seeded composition

export interface MelodyNote {
  bar: number;
  step: number; // 16th within the bar
  len: number; // in 16ths
  degree: number; // scale degree relative to the mood root
  vel: number;
}

// rhythm cells for one bar: [step, len]
const RHYTHMS: Record<'low' | 'mid' | 'high', [number, number][][]> = {
  low: [
    [[0, 8], [8, 8]],
    [[0, 12], [12, 4]],
    [[0, 4], [4, 4], [8, 8]],
    [[0, 6], [6, 2], [8, 8]],
    [[2, 6], [8, 8]],
  ],
  mid: [
    [[0, 4], [4, 4], [8, 4], [12, 4]],
    [[0, 2], [2, 2], [4, 4], [8, 6], [14, 2]],
    [[0, 6], [6, 2], [8, 4], [12, 4]],
    [[0, 3], [3, 3], [6, 2], [8, 8]],
    [[0, 4], [6, 2], [8, 4], [12, 4]],
  ],
  high: [
    [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
    [[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4]],
    [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 2], [14, 2]],
    [[0, 4], [4, 2], [6, 2], [8, 3], [11, 3], [14, 2]],
  ],
};

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Nearest tone of `chord` (scale degrees, any octave) to `deg`. */
function nearestChordTone(deg: number, chordRoot: number, rng: () => number): number {
  const cands: number[] = [];
  for (let o = -14; o <= 14; o += 7) for (const c of [0, 2, 4]) cands.push(chordRoot + c + o);
  cands.sort((a, b) => Math.abs(a - deg) - Math.abs(b - deg) || a - b);
  // mostly the nearest, sometimes the second nearest for variety
  return rng() < 0.75 ? cands[0] : cands[1];
}

/** A motif = rhythm cells + scale-step contour for two bars. */
interface Motif {
  rhythm: [number, number][][]; // per bar
  contour: number[][]; // per bar, per note: step from previous note (first of bar = chord-tone anchor)
  rests: boolean[][];
}

function makeMotif(rng: () => number, density: number): Motif {
  const pool = density < 0.35 ? RHYTHMS.low : density < 0.62 ? RHYTHMS.mid : RHYTHMS.high;
  const rhythm = [pick(rng, pool), pick(rng, density < 0.5 ? RHYTHMS.low : pool)];
  const contour = rhythm.map((cells) =>
    cells.map(() => {
      const r = rng();
      return r < 0.3 ? 1 : r < 0.6 ? -1 : r < 0.72 ? 2 : r < 0.84 ? -2 : r < 0.92 ? 0 : 3;
    }),
  );
  const rests = rhythm.map((cells) => cells.map((_, i) => i > 0 && rng() > 0.55 + density * 0.45));
  return { rhythm, contour, rests };
}

function clampDeg(d: number, lo: number, hi: number): number {
  while (d < lo) d += 2;
  while (d > hi) d -= 2;
  return d;
}

/**
 * Deterministic melody for one loop of `mood` (scale degrees, relative to the mood root).
 * Phrase plan per 8 bars: A (motif) · A' (sequenced) · B (new) · A + cadence on the tonic.
 * `variation` only changes the B section and ornaments, so loops stay recognisable.
 */
export function composeMelody(mood: Pick<MoodDef, 'prog' | 'seed'> & { lead: { density: number } | null }, variation = 0): MelodyNote[] {
  if (!mood.lead) return [];
  const density = mood.lead.density;
  const rngA = mulberry32(mood.seed);
  const rngB = mulberry32(mood.seed * 31 + 17 + variation * 7919);
  const motifA = makeMotif(rngA, density);
  const motifB = makeMotif(rngB, Math.min(1, density + 0.1));
  const bars = mood.prog.length;
  const out: MelodyNote[] = [];
  let prev = 4; // start around the fifth
  for (let bar = 0; bar < bars; bar++) {
    const phraseBar = bar % 8;
    const section = phraseBar < 4 ? 'A' : phraseBar < 6 ? 'B' : 'A';
    const motif = section === 'A' ? motifA : motifB;
    const rng = section === 'A' && phraseBar < 2 ? rngA : rngB;
    const half = phraseBar % 2;
    const chord = mood.prog[bar];
    const isCadence = phraseBar === 7;
    if (isCadence) {
      // resolve: one or two notes landing on the tonic
      const lead = nearestChordTone(prev, mood.prog[bar], rng);
      out.push({ bar, step: 0, len: 6, degree: clampDeg(lead, -3, 11), vel: 0.85 });
      const tonic = Math.abs(prev - 7) < Math.abs(prev) ? 7 : 0;
      out.push({ bar, step: 8, len: 8, degree: tonic, vel: 0.8 });
      prev = tonic;
      continue;
    }
    const cells = motif.rhythm[half];
    let deg = prev;
    cells.forEach(([step, len], i) => {
      if (i === 0) deg = nearestChordTone(prev + motif.contour[half][0] * 0.5, chord, rng);
      else deg = deg + motif.contour[half][i];
      // strong beats snap to chord tones
      if (step === 8) deg = nearestChordTone(deg, chord, rng);
      deg = clampDeg(deg, -3, 11);
      const rest = motif.rests[half][i] || (variation === 1 && section === 'A' && phraseBar >= 2 && i > 0 && rng() < 0.12);
      if (!rest) out.push({ bar, step, len, degree: deg, vel: step % 8 === 0 ? 0.9 : 0.7 });
    });
    prev = deg;
  }
  return out;
}

/** Parse a 16-step drum string into velocities. */
export function parsePattern(p: string | undefined): number[] {
  const out = new Array(16).fill(0);
  if (!p) return out;
  for (let i = 0; i < 16; i++) out[i] = p[i] === 'x' ? 1 : p[i] === 'o' ? 0.55 : 0;
  return out;
}

/** Bass notes for one bar: [step, len, degree offset from the chord root]. */
export function bassPattern(style: MoodDef['bass']['style'], nextChordDelta = 0): [number, number, number][] {
  switch (style) {
    case 'whole':
      return [[0, 16, 0]];
    case 'half':
      return [[0, 8, 0], [8, 8, 4]];
    case 'quarter':
      return [[0, 4, 0], [4, 4, 0], [8, 4, 4], [12, 4, 7]];
    case 'walk': {
      const approach = nextChordDelta >= 0 ? nextChordDelta - 1 : nextChordDelta + 1;
      return [[0, 4, 0], [4, 4, 2], [8, 4, 4], [12, 4, approach]];
    }
    case 'pulse':
      return [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, 2, s === 12 ? 4 : 0] as [number, number, number]);
    case 'bossa':
      return [[0, 6, 0], [6, 2, 4], [8, 6, 4], [14, 2, 0]];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Web Audio engine

const LOOKAHEAD = 0.25; // seconds scheduled ahead
const TICK_MS = 60;
const FADE = 2.5;

interface Player {
  def: MoodDef;
  root: number;
  out: GainNode;
  filter: BiquadFilterNode;
  nextTime: number;
  step: number; // global 16th counter
  melodies: Map<number, MelodyNote[]>[]; // per variation: key bar*16+step
  drums: { kick: number[]; snare: number[]; hat: number[]; rim: number[] };
  stopAt: number | null;
}

function indexMelody(notes: MelodyNote[]): Map<number, MelodyNote[]> {
  const m = new Map<number, MelodyNote[]>();
  for (const n of notes) {
    const k = n.bar * 16 + n.step;
    const arr = m.get(k);
    if (arr) arr.push(n);
    else m.set(k, [n]);
  }
  return m;
}

export class MusicEngine {
  readonly output: GainNode;
  private bus: GainNode;
  private duck: GainNode;
  private sting: GainNode;
  private delay: DelayNode;
  private delaySend: GainNode;
  private reverbSend: GainNode;
  private noise: AudioBuffer;
  private pulseWave: PeriodicWave | null = null;
  private current: Player | null = null;
  private fading: Player[] = [];
  private target: MoodId | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private quickSwitch = false;

  constructor(private ctx: AudioContext, destination: AudioNode) {
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    this.duck = ctx.createGain();
    this.sting = ctx.createGain();
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    // bus → dry / delay / reverb → duck → sting-dip → output
    const wet = ctx.createGain();
    this.bus.connect(wet);
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.2;
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.45;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2200;
    this.bus.connect(this.delaySend).connect(this.delay).connect(dlp).connect(fb).connect(this.delay);
    dlp.connect(wet);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.3;
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, 2.4);
    this.bus.connect(this.reverbSend).connect(conv).connect(wet);
    wet.connect(this.duck).connect(this.sting).connect(this.output).connect(destination);
    this.noise = noiseBuffer(ctx, 1);
    try {
      const n = 32;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      const d = 0.25;
      for (let i = 1; i < n; i++) {
        real[i] = Math.sin(2 * Math.PI * i * d) / (Math.PI * i);
        imag[i] = (1 - Math.cos(2 * Math.PI * i * d)) / (Math.PI * i);
      }
      this.pulseWave = ctx.createPeriodicWave(real, imag);
    } catch {
      this.pulseWave = null;
    }
  }

  get mood(): MoodId | null {
    return this.target;
  }

  /** 0..1 linear output level (already curved by the caller). */
  setVolume(v: number, time = 0.4) {
    this.output.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, time / 3);
  }

  /** 1 = no ducking. */
  setDuck(f: number) {
    this.duck.gain.setTargetAtTime(Math.max(0, Math.min(1, f)), this.ctx.currentTime, 0.12);
  }

  /** Change mood; the switch happens on the next bar line with a crossfade (or quickly for previews). */
  setMood(id: MoodId, quick = false) {
    if (!MOODS[id]) return;
    if (id === this.target && !quick) return;
    this.target = id;
    this.quickSwitch = quick;
    this.ensureRunning();
  }

  start() {
    this.ensureRunning();
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    const all = [this.current, ...this.fading].filter((p): p is Player => !!p);
    for (const p of all) this.retire(p, now, 0.6);
    this.current = null;
    this.fading = [];
    this.target = null;
    setTimeout(() => {
      for (const p of all) {
        try {
          p.out.disconnect();
        } catch {
          /* ignore */
        }
      }
    }, 1500);
  }

  /** Short musical sting (results screen). Dips the loop for a moment. */
  playSting(kind: 'good' | 'soft' = 'good') {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.55; // let the SFX jingle land first
    this.sting.gain.cancelScheduledValues(ctx.currentTime);
    this.sting.gain.setTargetAtTime(0.25, ctx.currentTime, 0.1);
    this.sting.gain.setTargetAtTime(1, t + 2.2, 0.8);
    const root = 72;
    const notes = kind === 'good' ? [0, 4, 7, 12, 16] : [0, 3, 7, 10];
    const dest = this.output; // bypass the dip
    notes.forEach((n, i) => {
      const tt = t + i * 0.11;
      this.voice('bell', midiToFreq(root + n), tt, 0.9 + (notes.length - i) * 0.1, 0.06, dest, 0.005, 0.8);
      this.voice('triangle', midiToFreq(root + n - 12), tt, 0.5, 0.035, dest, 0.01, 0.3);
    });
    this.voice('sine', midiToFreq(root - 24), t, 1.6, 0.08, dest, 0.02, 1);
  }

  dispose() {
    this.stop();
    try {
      this.output.disconnect();
    } catch {
      /* ignore */
    }
  }

  // ----- scheduling -----

  private ensureRunning() {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch {
        /* never throw from the audio clock */
      }
    }, TICK_MS);
    try {
      this.tick();
    } catch {
      /* ignore */
    }
  }

  private makePlayer(id: MoodId, at: number, root?: number): Player {
    const def = MOODS[id];
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = def.cutoff;
    filter.Q.value = 0.5;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    filter.connect(out).connect(this.bus);
    const d = def.drums ?? {};
    return {
      def,
      root: root ?? def.root,
      out,
      filter,
      nextTime: at,
      step: 0,
      melodies: [indexMelody(composeMelody(def, 0)), indexMelody(composeMelody(def, 1))],
      drums: { kick: parsePattern(d.kick), snare: parsePattern(d.snare), hat: parsePattern(d.hat), rim: parsePattern(d.rim) },
      stopAt: null,
    };
  }

  private fadeIn(p: Player, at: number, dur: number) {
    const g = p.out.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(0.0001, at);
    g.linearRampToValueAtTime(p.def.level, at + dur);
    const now = this.ctx.currentTime;
    this.reverbSend.gain.setTargetAtTime(p.def.reverb, Math.max(now, at), dur / 3);
    this.delaySend.gain.setTargetAtTime(p.def.delay, Math.max(now, at), dur / 3);
    const dotted8 = (60 / p.def.bpm) * 0.75;
    this.delay.delayTime.setTargetAtTime(dotted8, Math.max(now, at), dur / 3);
  }

  private retire(p: Player, at: number, dur: number) {
    const g = p.out.gain;
    try {
      g.cancelScheduledValues(at);
      g.setValueAtTime(Math.max(0.0001, g.value), at);
      g.linearRampToValueAtTime(0.0001, at + dur);
    } catch {
      /* ignore */
    }
    p.stopAt = at + dur;
    if (!this.fading.includes(p)) this.fading.push(p);
  }

  private tick() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (ctx.state !== 'running') return;
    const horizon = now + LOOKAHEAD;

    if (!this.current && this.target) {
      this.current = this.makePlayer(this.target, now + 0.08);
      this.fadeIn(this.current, now + 0.08, 1.5);
    } else if (this.quickSwitch) {
      this.quickSwitch = false;
      if (this.current && this.target && this.current.def.id !== this.target) {
      const at = now + 0.05;
      this.retire(this.current, at, 0.8);
      this.current = this.makePlayer(this.target, at, this.target === 'tension' ? this.current.root : undefined);
      this.fadeIn(this.current, at, 0.8);
      }
    }

    // a stalled clock (tab was suspended) would otherwise try to catch up
    for (const p of [this.current, ...this.fading]) if (p && p.nextTime < now - 0.2) p.nextTime = now + 0.05;

    const cur = this.current;
    if (cur) {
      while (cur.nextTime < horizon) {
        // bar line: switch to the target mood here (crossfade)
        if (cur.step % 16 === 0 && this.target && this.target !== cur.def.id && this.current === cur) {
          const at = cur.nextTime;
          const root = this.target === 'tension' ? cur.root : undefined;
          this.retire(cur, at, FADE);
          const next = this.makePlayer(this.target, at, root);
          this.fadeIn(next, at, FADE);
          this.current = next;
          break;
        }
        this.scheduleStep(cur, cur.step, cur.nextTime);
        cur.nextTime += 60 / cur.def.bpm / 4;
        cur.step++;
      }
      if (this.current !== cur) this.runPlayer(this.current!, horizon);
    }
    // keep fading layers playing until their fade ends
    this.fading = this.fading.filter((p) => {
      if (p.stopAt !== null && now > p.stopAt + 0.5) {
        try {
          p.out.disconnect();
        } catch {
          /* ignore */
        }
        return false;
      }
      this.runPlayer(p, Math.min(horizon, p.stopAt ?? horizon));
      return true;
    });
  }

  private runPlayer(p: Player, horizon: number) {
    while (p.nextTime < horizon) {
      this.scheduleStep(p, p.step, p.nextTime);
      p.nextTime += 60 / p.def.bpm / 4;
      p.step++;
    }
  }

  private scheduleStep(p: Player, step: number, time: number) {
    const def = p.def;
    const bars = def.prog.length;
    const s = step % 16;
    const bar = Math.floor(step / 16) % bars;
    const loop = Math.floor(step / 16 / bars);
    const sixteenth = 60 / def.bpm / 4;
    const t = time + (s % 4 === 2 ? def.swing * sixteenth : 0);
    const chord = def.prog[bar];
    const nextChord = def.prog[(bar + 1) % bars];
    const mode = def.mode;
    const root = p.root;
    const dest = p.filter;
    const size: 3 | 4 = def.sevenths ? 4 : 3;

    // comp
    const c = def.comp;
    if (c.style === 'pad' && s === 0) {
      const dur = sixteenth * 16;
      for (const m of chordMidi(root + c.octave, mode, chord, size)) {
        this.voice(c.wave, midiToFreq(m), t, dur, c.level, dest, Math.min(0.5, dur * 0.25), dur * 0.35, 6);
      }
    } else if (c.style === 'hits' && c.steps?.includes(s)) {
      const dur = sixteenth * (c.len ?? 1);
      for (const m of chordMidi(root + c.octave, mode, chord, size)) this.voice(c.wave, midiToFreq(m), t, dur, c.level, dest, 0.008, 0.06);
    } else if (c.style === 'arp' && s % 2 === 0) {
      const tones = chordMidi(root + c.octave, mode, chord, size);
      const seq = [0, 1, 2, 1, 0, 2, 1, tones.length - 1];
      const m = tones[seq[(s / 2) % seq.length] % tones.length];
      this.voice(c.wave, midiToFreq(m), t, sixteenth * 1.8, c.level * (s % 8 === 0 ? 1 : 0.75), dest, 0.006, 0.08);
    }

    // bass (two octaves below the lead root)
    if (def.bass.style !== 'none') {
      const pat = bassPattern(def.bass.style, nextChord - chord);
      for (const [bs, len, off] of pat) {
        if (bs !== s) continue;
        const m = degreeToMidi(root - 24, mode, chord + off);
        this.voice(def.bass.wave, midiToFreq(m), t, sixteenth * len * 0.92, def.bass.level, dest, 0.01, 0.08);
      }
    }

    // lead
    if (def.lead) {
      const notes = p.melodies[loop % 2].get(bar * 16 + s);
      if (notes) {
        for (const n of notes) {
          const m = degreeToMidi(root + def.lead.octave, mode, n.degree);
          this.voice(def.lead.wave, midiToFreq(m), t, sixteenth * n.len * 0.9, def.lead.level * n.vel, dest, 0.012, 0.12, 0, true);
        }
      }
    }

    // drums
    if (def.drums) {
      const lv = def.drumLevel;
      if (p.drums.kick[s]) this.kick(t, 0.22 * lv * p.drums.kick[s], dest);
      if (p.drums.snare[s]) this.noiseHit(t, 'bandpass', 1800, 0.14, 0.09 * lv * p.drums.snare[s], dest);
      if (p.drums.rim[s]) this.rim(t, 0.06 * lv * p.drums.rim[s], dest);
      if (p.drums.hat[s]) this.noiseHit(t, 'highpass', 7000, 0.035, 0.035 * lv * p.drums.hat[s], dest);
    }
  }

  // ----- instruments -----

  private voice(
    wave: Wave,
    freq: number,
    t: number,
    dur: number,
    level: number,
    dest: AudioNode,
    attack = 0.01,
    release = 0.1,
    detuneCents = 0,
    vibrato = false,
  ) {
    const ctx = this.ctx;
    if (level <= 0 || !Number.isFinite(freq)) return;
    const g = ctx.createGain();
    g.connect(dest);
    const end = t + dur + release;
    if (wave === 'bell') {
      // music-box / vibraphone: sine + bright partial, fast decay
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.4, dur + release));
      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = freq * 4.01;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.25, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o1.connect(g);
      o2.connect(g2).connect(g);
      const stopAt = t + Math.max(0.4, dur + release) + 0.05;
      o1.start(t);
      o2.start(t);
      o1.stop(stopAt);
      o2.stop(stopAt);
      return;
    }
    const sustain = level * 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.linearRampToValueAtTime(sustain, t + attack + Math.min(0.15, dur * 0.3));
    g.gain.setValueAtTime(sustain, t + Math.max(attack, dur));
    g.gain.linearRampToValueAtTime(0.0001, end);
    const oscs = detuneCents ? [-detuneCents, detuneCents] : [0];
    for (const dc of oscs) {
      const o = ctx.createOscillator();
      if (wave === 'pulse') {
        if (this.pulseWave) o.setPeriodicWave(this.pulseWave);
        else o.type = 'square';
      } else o.type = wave;
      o.frequency.value = freq;
      o.detune.value = dc;
      if (vibrato && dur > 0.35) {
        o.detune.setValueAtTime(dc, t + 0.25);
        o.detune.linearRampToValueAtTime(dc + 8, t + dur);
      }
      const og = ctx.createGain();
      og.gain.value = oscs.length > 1 ? 0.6 : 1;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(end + 0.02);
    }
  }

  private kick(t: number, level: number, dest: AudioNode) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.3);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, dur: number, level: number, dest: AudioNode) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.02);
  }

  private rim(t: number, level: number, dest: AudioNode) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 820;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.07);
    this.noiseHit(t, 'bandpass', 3000, 0.03, level * 0.5, dest);
  }
}

// ---------------------------------------------------------------------------
// shared buffers

export function noiseBuffer(ctx: BaseAudioContext, seconds: number, color: 'white' | 'pink' | 'brown' = 'white'): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') d[i] = w;
    else if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  // soften the loop seam
  const fade = Math.min(len >> 1, 256);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] *= k;
    d[len - 1 - i] *= k;
  }
  return buf;
}

/** Stereo reverb impulse: exponentially decaying noise. */
export function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3) * 0.5;
  }
  return buf;
}
