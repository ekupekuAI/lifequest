// LifeQuest launch trailer — original soundtrack, synthesized in pure JS.
// 60.0 s, 44.1 kHz stereo 16-bit, 120 BPM (beat = 0.5 s = 15 video frames), D major.
//
//   node scripts/compose.mjs        → public/audio/music.wav
//
// Structure (video frames @30fps → seconds):
//   0–270    (0–9 s)    intro: warm pad, music-box melody, bird chirps          Bm G D A
//   270–600  (9–20 s)   build: 16th pulse arp + rising filter, kick on 1&3, stab on SOLD OUT (492)
//   600–780  (20–26 s)  groove: kick/snare/hats, octave bass, lead hook; tape-stop 630–660
//   780–840  (26–28 s)  drop-out for the thunder (pad + music box only)
//   840–1140 (28–38 s)  groove back; montage hits at 930/975/1020/1065/1110
//   1140–1320(38–44 s)  breakdown: filtered pad, heartbeat kick, riser + snare roll, gap 1314–1320
//   1320–1560(44–52 s)  THE DROP: four-on-the-floor, claps, supersaw chords, hook + doubles
//   1560–1590(52–53 s)  held A chord + reverse cymbal
//   1590–1800(53–60 s)  logo impact, sustained D chord, final sting 1740, silence at 1800
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '..', 'public', 'audio', 'music.wav');

const SR = 44100;
const DUR = 60;
const N = SR * DUR;
const TAU = Math.PI * 2;
const BEAT = 0.5; // s
const F = (frame) => frame / 30; // video frame → seconds
const B = (beat) => beat * BEAT; // beat → seconds
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- deterministic noise ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20261016);
const noise = () => R() * 2 - 1;

// ---------- buses ----------
const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const BUS = {
  pad: bus(),
  cel: bus(),
  amb: bus(),
  arp: bus(),
  kick: bus(),
  drums: bus(),
  snare: bus(),
  bass: bus(),
  lead: bus(),
  chords: bus(),
  fx: bus(),
};

function panGains(p) {
  const a = ((p + 1) / 2) * (Math.PI / 2);
  return [Math.cos(a), Math.sin(a)];
}

/** Render a voice: fn(t, i) → mono sample, from `start` for `len` seconds into bus with pan. */
function render(b, start, len, pan, fn) {
  const s0 = Math.max(0, Math.round(start * SR));
  const s1 = Math.min(N, Math.round((start + len) * SR));
  const [gl, gr] = panGains(pan);
  for (let n = s0; n < s1; n++) {
    const t = (n - Math.round(start * SR)) / SR;
    const v = fn(t, n);
    b.L[n] += v * gl;
    b.R[n] += v * gr;
  }
}
/** Stereo variant: fn returns [l, r]. */
function render2(b, start, len, fn) {
  const s0 = Math.max(0, Math.round(start * SR));
  const s1 = Math.min(N, Math.round((start + len) * SR));
  const out = [0, 0];
  for (let n = s0; n < s1; n++) {
    const t = (n - Math.round(start * SR)) / SR;
    fn(t, out);
    b.L[n] += out[0];
    b.R[n] += out[1];
  }
}

// ---------- DSP primitives ----------
class Biquad {
  constructor(type = 'lp', f = 1000, q = 0.707, gainDb = 0) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.type = type;
    this.set(f, q, gainDb);
  }
  set(f, q = this.q, gainDb = this.g) {
    this.q = q;
    this.g = gainDb;
    f = Math.min(Math.max(f, 10), SR * 0.45);
    const w = (TAU * f) / SR;
    const cs = Math.cos(w);
    const sn = Math.sin(w);
    const al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    switch (this.type) {
      case 'hp':
        b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
        break;
      case 'bp':
        b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
        break;
      case 'hs': {
        const A = Math.pow(10, gainDb / 40);
        const sq = 2 * Math.sqrt(A) * al;
        b0 = A * (A + 1 + (A - 1) * cs + sq);
        b1 = -2 * A * (A - 1 + (A + 1) * cs);
        b2 = A * (A + 1 + (A - 1) * cs - sq);
        a0 = A + 1 - (A - 1) * cs + sq;
        a1 = 2 * (A - 1 - (A + 1) * cs);
        a2 = A + 1 - (A - 1) * cs - sq;
        break;
      }
      default: // lp
        b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
class Osc {
  constructor(phase = 0) { this.ph = phase; }
  saw(f) {
    const dt = f / SR;
    const t = this.ph;
    this.ph += dt; if (this.ph >= 1) this.ph -= 1;
    return 2 * t - 1 - polyblep(t, dt);
  }
  sq(f, pw = 0.5) {
    const dt = f / SR;
    const t = this.ph;
    this.ph += dt; if (this.ph >= 1) this.ph -= 1;
    let v = t < pw ? 1 : -1;
    v += polyblep(t, dt);
    v -= polyblep((t + 1 - pw) % 1, dt);
    return v;
  }
  sin(f) {
    const v = Math.sin(TAU * this.ph);
    this.ph += f / SR; if (this.ph >= 1) this.ph -= 1;
    return v;
  }
}

function adsr(t, dur, a, d, s, r) {
  if (t < 0) return 0;
  let v;
  if (t < a) v = t / a;
  else if (t < a + d) v = 1 - (1 - s) * ((t - a) / d);
  else v = s;
  if (t > dur) {
    const lvl = dur < a ? dur / a : dur < a + d ? 1 - (1 - s) * ((dur - a) / d) : s;
    v = lvl * Math.max(0, 1 - (t - dur) / r);
  }
  return v;
}
const lerp = (a, b, x) => a + (b - a) * x;
function auto(points, t) {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i][0]) {
      const [t0, v0] = points[i - 1];
      const [t1, v1] = points[i];
      return lerp(v0, v1, (t - t0) / (t1 - t0));
    }
  }
  return points[points.length - 1][1];
}

// ---------- harmony ----------
const CH = {
  D: { root: 38, pad: [57, 62, 66, 69], tones: [62, 66, 69, 74] },
  A: { root: 33, pad: [57, 61, 64, 69], tones: [61, 64, 69, 73] },
  Bm: { root: 35, pad: [59, 62, 66, 71], tones: [59, 62, 66, 71] },
  G: { root: 31, pad: [59, 62, 67, 71], tones: [59, 62, 67, 71] },
};
const CYCLE = ['D', 'A', 'Bm', 'G'];
const OVERRIDE = { 19: 'Bm', 20: 'G', 21: 'A', 26: 'A' };
const chordAtBar = (bar) => OVERRIDE[bar] ?? CYCLE[(bar + 2) % 4];
const chordAtBeat = (beat) => (beat >= 106 ? 'D' : chordAtBar(Math.floor(beat / 4)));

// The hook: one 4-bar phrase over D A Bm G, [beat, midi, lenBeats]
const HOOK = [
  [[0, 74, 1], [1, 76, 0.5], [1.5, 78, 1], [2.5, 76, 0.5], [3, 74, 1]],
  [[0, 73, 0.5], [0.5, 74, 0.5], [1, 76, 1.5], [2.5, 69, 0.5], [3, 73, 1]],
  [[0, 74, 1], [1, 78, 0.5], [1.5, 81, 1], [2.5, 78, 0.5], [3, 76, 1]],
  [[0, 74, 0.5], [0.5, 76, 0.5], [1, 78, 1], [2, 76, 1], [3, 74, 1]],
];
const hookIndex = (bar) => (bar + 2) % 4;

// Voice-over windows (frames): lead backs off so the lines stay intelligible.
const VO_WINDOWS = [[140, 262], [500, 562], [1022, 1110], [1150, 1224], [1440, 1508], [1620, 1716]];
const inVO = (frame) => VO_WINDOWS.some(([a, b]) => frame >= a && frame < b);

// ---------- instruments ----------
function pad(notes, start, dur, amp = 0.05, att = 0.9, rel = 1.6) {
  for (const m of notes) {
    const f = mtof(m);
    const detunes = [-0.09, 0, 0.08];
    detunes.forEach((cents, k) => {
      const o = new Osc(R());
      const fr = f * Math.pow(2, (cents * 1.0) / 12);
      const pan = (k - 1) * 0.6;
      render(BUS.pad, start, dur + rel, pan, (t) => o.saw(fr) * adsr(t, dur, att, 0.5, 0.85, rel) * amp);
    });
    const so = new Osc();
    render(BUS.pad, start, dur + rel, 0, (t) => so.sin(f / 2) * adsr(t, dur, att, 0.5, 0.85, rel) * amp * 0.8);
  }
}

function celesta(m, start, len = 2.4, amp = 0.16, pan = 0) {
  const f = mtof(m);
  const o1 = new Osc(), o2 = new Osc(), o3 = new Osc();
  render(BUS.cel, start, len, pan, (t) => {
    const a = Math.min(1, t / 0.002);
    return (
      a *
      amp *
      (o1.sin(f) * Math.exp(-t / 1.1) + 0.35 * o2.sin(f * 3.0) * Math.exp(-t / 0.35) + 0.12 * o3.sin(f * 5.43) * Math.exp(-t / 0.12))
    );
  });
}

function chirp(start, f0, pan) {
  const o = new Osc();
  const len = 0.07 + R() * 0.05;
  render(BUS.amb, start, len, pan, (t) => {
    const x = t / len;
    const f = f0 * (1.25 - 0.45 * x) + 300 * Math.sin(TAU * 38 * t);
    return o.sin(f) * Math.sin(Math.PI * x) ** 2 * 0.035;
  });
}

function pluck(m, start, len, amp, pan) {
  const o = new Osc(R());
  const f = mtof(m);
  render(BUS.arp, start, len + 0.08, pan, (t) => o.sq(f, 0.25) * adsr(t, len, 0.002, 0.09, 0.35, 0.08) * amp);
}

const KICKS = []; // [time, sidechainDepth]
function kick(start, amp = 0.9, sc = 0.6, tone = 1) {
  const o = new Osc();
  const lp = new Biquad('lp', 2500);
  KICKS.push([start, sc]);
  render(BUS.kick, start, 0.45, 0, (t) => {
    const f = 44 * tone + 120 * tone * Math.exp(-t / 0.028);
    const body = o.sin(f) * Math.exp(-t / 0.24);
    const click = lp.p(noise()) * Math.exp(-t / 0.004) * 0.6;
    return Math.tanh((body + click) * 1.6) * amp;
  });
}
function snare(start, amp = 0.5, pan = 0) {
  const o = new Osc();
  const bp = new Biquad('bp', 2600, 0.6);
  const hp = new Biquad('hp', 700);
  render(BUS.snare, start, 0.35, pan, (t) => {
    const tone = o.sin(190 - 30 * Math.min(1, t / 0.05)) * Math.exp(-t / 0.06) * 0.55;
    const nz = hp.p(bp.p(noise()) * 2.2) * Math.exp(-t / 0.13);
    return (tone + nz) * amp;
  });
}
function hat(start, amp = 0.12, open = false, pan = 0.25) {
  const hp = new Biquad('hp', 7500, 0.8);
  const len = open ? 0.35 : 0.06;
  render(BUS.drums, start, len, pan, (t) => hp.p(noise()) * Math.exp(-t / (open ? 0.14 : 0.022)) * amp);
}
function clap(start, amp = 0.45) {
  const bp = new Biquad('bp', 1300, 1.2);
  const bp2 = new Biquad('bp', 1300, 1.2);
  render2(BUS.snare, start, 0.4, (t, out) => {
    let e = 0;
    for (const o of [0, 0.011, 0.022]) if (t >= o) e += Math.exp(-(t - o) / 0.005);
    if (t >= 0.03) e += 0.7 * Math.exp(-(t - 0.03) / 0.11);
    out[0] = bp.p(noise()) * e * amp * 2;
    out[1] = bp2.p(noise()) * e * amp * 2;
  });
}
function crash(start, amp = 0.22, len = 2.6, dest = BUS.drums) {
  const hl = new Biquad('hp', 4200, 0.7);
  const hr = new Biquad('hp', 4200, 0.7);
  render2(dest, start, len, (t, out) => {
    const e = Math.min(1, t / 0.003) * Math.exp(-t / (len * 0.35));
    out[0] = hl.p(noise()) * e * amp;
    out[1] = hr.p(noise()) * e * amp;
  });
}
function bass(m, start, len, amp = 0.32) {
  const o = new Osc(), s = new Osc();
  const lp = new Biquad('lp', 1200, 1.1);
  const f = mtof(m);
  let i = 0;
  render(BUS.bass, start, len + 0.06, 0, (t) => {
    if ((i++ & 15) === 0) lp.set(260 + 1700 * Math.exp(-t / 0.07), 1.1);
    const v = lp.p(o.saw(f)) * 0.7 + s.sin(f) * 0.6;
    return Math.tanh(v * 1.3) * adsr(t, len, 0.003, 0.15, 0.7, 0.06) * amp;
  });
}
function subNote(m, start, len, amp = 0.3, rel = 0.8) {
  const s = new Osc();
  const f = mtof(m);
  render(BUS.bass, start, len + rel, 0, (t) => s.sin(f) * adsr(t, len, 0.05, 0.3, 0.8, rel) * amp);
}
function lead(m, start, len, amp = 0.15, pan = 0, octDouble = false) {
  const o1 = new Osc(R()), o2 = new Osc(R());
  const lp = new Biquad('lp', 4200, 0.8);
  const f = mtof(m) * (octDouble ? 2 : 1);
  render(BUS.lead, start, len + 0.15, pan, (t) => {
    const vib = t > 0.15 ? 1 + 0.0085 * Math.sin(TAU * 5.6 * t) * Math.min(1, (t - 0.15) / 0.2) : 1;
    const v = o1.sq(f * vib, 0.5) * 0.6 + o2.saw(f * vib * 1.004) * 0.45;
    return lp.p(v) * adsr(t, len, 0.006, 0.12, 0.72, 0.13) * amp;
  });
}
function supersaw(notes, start, dur, amp = 0.022, att = 0.012, rel = 0.35, cutoff = 3800) {
  const detune = [-0.16, -0.07, 0, 0.07, 0.16];
  const lpL = new Biquad('lp', cutoff, 0.7);
  const lpR = new Biquad('lp', cutoff, 0.7);
  const voices = [];
  for (const m of notes) detune.forEach((d, k) => voices.push({ o: new Osc(R()), f: mtof(m) * Math.pow(2, d / 12), pan: (k - 2) / 2 }));
  render2(BUS.chords, start, dur + rel, (t, out) => {
    let l = 0, r = 0;
    for (const v of voices) {
      const s = v.o.saw(v.f);
      l += s * (1 - v.pan) * 0.5;
      r += s * (1 + v.pan) * 0.5;
    }
    const e = adsr(t, dur, att, 0.4, 0.75, rel) * amp;
    out[0] = lpL.p(l) * e;
    out[1] = lpR.p(r) * e;
  });
}
function stab(start, chord, amp = 0.05) {
  const notes = [...CH[chord].pad, CH[chord].pad[0] + 12, CH[chord].root + 12];
  const lp = new Biquad('lp', 6000, 1.4);
  const lp2 = new Biquad('lp', 6000, 1.4);
  const voices = notes.flatMap((m) => [-0.1, 0.1].map((d) => ({ o: new Osc(R()), f: mtof(m) * Math.pow(2, d / 12) })));
  let i = 0;
  render2(BUS.fx, start, 0.9, (t, out) => {
    if ((i++ & 15) === 0) { const c = 700 + 6000 * Math.exp(-t / 0.09); lp.set(c, 1.4); lp2.set(c, 1.4); }
    let s = 0, s2 = 0;
    voices.forEach((v, k) => { const x = v.o.saw(v.f); if (k & 1) s2 += x; else s += x; });
    const e = Math.min(1, t / 0.004) * Math.exp(-t / 0.28) * amp;
    out[0] = lp.p(s) * e;
    out[1] = lp2.p(s2) * e;
  });
  // timpani-ish low hit
  const o = new Osc();
  render(BUS.fx, start, 0.8, 0, (t) => o.sin(mtof(CH[chord].root + 12) * (1 + 0.15 * Math.exp(-t / 0.04))) * Math.exp(-t / 0.3) * amp * 4);
}
function impact(start, amp = 0.8, len = 4) {
  const o = new Osc();
  const lp = new Biquad('lp', 900, 0.7);
  render(BUS.fx, start, len, 0, (t) => {
    const f = 30 + 45 * Math.exp(-t / 0.18);
    const sub = o.sin(f) * Math.exp(-t / (len * 0.3));
    const nz = lp.p(noise()) * Math.exp(-t / 0.25) * 0.8;
    return Math.tanh((sub + nz) * 1.4) * amp;
  });
  crash(start, 0.28, len, BUS.fx);
}
function riser(start, end, amp = 0.12, f0 = 300, f1 = 9000) {
  const len = end - start;
  const bpL = new Biquad('bp', f0, 2.5);
  const bpR = new Biquad('bp', f0, 2.5);
  const o = new Osc();
  let i = 0;
  render2(BUS.fx, start, len, (t, out) => {
    const x = t / len;
    if ((i++ & 31) === 0) { const c = f0 * Math.pow(f1 / f0, x * x); bpL.set(c, 2.5); bpR.set(c, 2.5); }
    const e = Math.pow(x, 2.2) * amp;
    const tone = o.saw(110 * Math.pow(2, 3 * x * x)) * 0.12;
    out[0] = (bpL.p(noise()) * 3 + tone) * e;
    out[1] = (bpR.p(noise()) * 3 + tone) * e;
  });
}
function reverseCymbal(start, end, amp = 0.3) {
  const len = end - start;
  const hl = new Biquad('hp', 3000, 0.7);
  const hr = new Biquad('hp', 3000, 0.7);
  render2(BUS.fx, start, len, (t, out) => {
    const e = Math.exp((t - len) / (len * 0.28)) * Math.min(1, (len - t) / 0.004) * amp;
    out[0] = hl.p(noise()) * e;
    out[1] = hr.p(noise()) * e;
  });
}
function downlifter(start, len, amp = 0.1) {
  const lp = new Biquad('lp', 8000, 1.5);
  let i = 0;
  render(BUS.fx, start, len, 0, (t) => {
    const x = t / len;
    if ((i++ & 31) === 0) lp.set(8000 * Math.pow(200 / 8000, x), 1.5);
    return lp.p(noise()) * (1 - x) * Math.min(1, t / 0.01) * amp;
  });
}

// ---------- arrangement ----------
// --- pad & chords, bar by bar ---
for (let bar = 0; bar < 30; bar++) {
  const t0 = B(bar * 4);
  const f0 = bar * 60;
  if (bar === 26) {
    // 1560–1590: held A (sus feel) into the logo
    pad(CH.A.pad, t0, 1.0, 0.045, 0.3, 0.3);
    supersaw([57, 62, 64, 69], t0, 1.0, 0.012, 0.6, 0.05, 2500);
    continue;
  }
  if (bar >= 27) continue; // logo handled below
  const c = chordAtBar(bar);
  const amp = bar < 5 ? 0.038 : bar >= 19 && bar < 22 ? 0.05 : 0.04;
  pad(CH[c].pad, t0, 2.0, amp, bar === 0 ? 2.5 : 0.6, 1.2);
  // supersaw chords in the drop (pumping via sidechain) and quieter in the groove
  if (bar >= 22 && bar < 26) supersaw(CH[c].pad.map((m) => m + 12).concat([CH[c].pad[0]]), t0, 1.95, 0.016);
  else if ((bar >= 10 && bar < 13) || (bar >= 14 && bar < 19)) supersaw(CH[c].pad, t0, 1.95, 0.008, 0.02, 0.2, 2600);
  void f0;
}

// --- intro (0–270): music box + chirps ---
const INTRO = [
  [0, 78, 1.5], [1.5, 76, 0.5], [2, 74, 1], [3, 71, 1],
  [4, 74, 1.5], [5.5, 76, 0.5], [6, 74, 1], [7, 71, 0.5], [7.5, 69, 0.5],
  [8, 74, 1], [9, 76, 0.5], [9.5, 78, 1], [10.5, 76, 0.5], [11, 74, 1],
  [12, 76, 1], [13, 73, 1], [14, 69, 1], [15, 76, 1],
  [16, 74, 2],
];
for (const [b, m] of INTRO) celesta(m + 12, B(b), 2.6, 0.14, Math.sin(b) * 0.3);
// soft countermelody bell under the last bar
celesta(66 + 12, B(17), 2, 0.06, -0.4);
for (let i = 0; i < 14; i++) {
  const t = 0.4 + R() * 8.2;
  const f0 = 3200 + R() * 1800;
  const pan = R() * 1.6 - 0.8;
  const reps = 1 + Math.floor(R() * 3);
  for (let k = 0; k < reps; k++) chirp(t + k * (0.09 + R() * 0.04), f0 * (1 + k * 0.04), pan);
}

// --- arp (16ths) ---
function arpOn(frame) {
  if (frame >= 270 && frame < 600) return !(frame >= 492 && frame < 510);
  if (frame >= 600 && frame < 780) return true;
  if (frame >= 840 && frame < 1140) return true;
  if (frame >= 1320 && frame < 1560) return true;
  return false;
}
const ARP_PAT = [0, 1, 2, 3, 1, 2, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2];
for (let step = 0; step < 120 * 4; step++) {
  const beat = step / 4;
  const frame = beat * 15;
  if (!arpOn(frame)) continue;
  const c = CH[chordAtBeat(beat)];
  const m = c.tones[ARP_PAT[step % 16] % 4] + 12;
  const amp = frame < 600 ? lerp(0.05, 0.085, (frame - 270) / 330) : frame >= 1320 ? 0.05 : 0.045;
  pluck(m, B(beat), B(0.22), amp, step % 2 ? 0.35 : -0.35);
}

// --- build (270–600): kick 1&3, bass, hats, snare build ---
for (let beat = 20; beat < 40; beat += 2) kick(B(beat), 0.75, 0.35);
for (let bar = 7; bar < 10; bar++) subNote(CH[chordAtBar(bar)].root + 12, B(bar * 4), 1.9, 0.22, 0.2);
for (let beat = 36; beat < 40; beat += 0.5) hat(B(beat), 0.07 + (beat - 36) * 0.01, false, beat % 1 ? 0.3 : -0.2);
for (let k = 0; k < 8; k++) snare(B(38 + k * 0.25), 0.12 + k * 0.035); // 570–600 roll into the groove
// SOLD OUT stamp hit (frame 492, deliberately on the visual, not the grid)
stab(F(492), chordAtBeat(492 / 15), 0.045); // the stamp + impact SFX carry the transient
crash(F(492), 0.15, 2.2);

// --- groove ---
function grooveBar(bar, fillLast = false) {
  const b0 = bar * 4;
  const c = CH[chordAtBar(bar)];
  for (const k of [0, 1.5, 2, 3.5]) kick(B(b0 + k), k % 1 ? 0.55 : 0.75, 0.5);
  snare(B(b0 + 1), 0.42);
  if (fillLast) for (let k = 0; k < 4; k++) snare(B(b0 + 3 + k * 0.25), 0.25 + k * 0.08, (k - 1.5) * 0.2);
  else snare(B(b0 + 3), 0.42);
  for (let k = 0; k < 8; k++) hat(B(b0 + k * 0.5), k % 2 ? 0.12 : 0.07, false, 0.25);
  if (bar % 2) hat(B(b0 + 3.5), 0.1, true, -0.2);
  // octave bass, 8ths
  for (let k = 0; k < 8; k++) bass(c.root + 12 + (k % 2 ? 12 : 0), B(b0 + k * 0.5), B(0.42), 0.25);
}
function leadBar(bar, gainFor) {
  for (const [b, m, len] of HOOK[hookIndex(bar)]) {
    const beat = bar * 4 + b;
    const g = gainFor(beat * 15);
    if (g <= 0) continue;
    lead(m, B(beat), B(len) * 0.92, 0.11 * g, 0.05);
  }
}
const voGain = (low) => (frame) => (inVO(frame) ? low : 1);

for (let bar = 10; bar < 13; bar++) grooveBar(bar, bar === 12);
for (let bar = 10; bar < 13; bar++) leadBar(bar, voGain(0.3));
// 630–660: the tape stops (applied on the mix below); 660 rewind riser
riser(F(645), F(662), 0.08, 1500, 9000);
// 750–780: reverse cymbal into the thunder; 780–840 drop-out (pad + music box only)
reverseCymbal(F(750), F(780), 0.22);
for (const [b, m] of [[0, 74], [1, 76], [1.5, 78], [3, 74]]) celesta(m + 12, B(52 + b), 2.4, 0.09, -0.2);
for (const [b, m] of [[0, 71], [1, 74], [2, 76], [3, 73]]) celesta(m + 12, B(54 + b), 2.4, 0.08, 0.2);
for (let k = 0; k < 8; k++) snare(B(55 + k * 0.125), 0.1 + k * 0.05); // fill back in
crash(F(840), 0.2, 2.4);
for (let bar = 14; bar < 19; bar++) grooveBar(bar, bar === 18);
for (let bar = 14; bar < 19; bar++) leadBar(bar, voGain(0.3));
// montage hits every 3 beats
for (const fr of [930, 975, 1020, 1065, 1110]) {
  stab(F(fr), chordAtBeat(fr / 15), 0.045);
  crash(F(fr), 0.16, 1.6);
  kick(F(fr), 0.6, 0.6);
}
downlifter(F(1125), F(1155) - F(1125), 0.12);

// --- breakdown (1140–1320) ---
for (let beat = 76; beat < 87; beat += 2) {
  kick(B(beat), 0.55, 0.0, 0.9);
  kick(B(beat + 0.55), 0.38, 0.0, 0.9);
}
subNote(CH.Bm.root + 12, B(76), 1.9, 0.2, 0.3);
subNote(CH.G.root + 12, B(80), 1.9, 0.2, 0.3);
subNote(CH.A.root + 12, B(84), 1.4, 0.2, 0.2);
// music box hook fragment after the narrator + slam
for (const [b, m, len] of [[82, 74, 1], [83, 76, 0.5], [83.5, 78, 1], [84.5, 76, 0.5], [85, 73, 1], [86, 76, 0.5], [86.5, 78, 0.5]]) {
  celesta(m + 12, B(b), 2.2, 0.1, 0.2);
  void len;
}
riser(F(1230), F(1316), 0.16);
for (let k = 0; k < 4; k++) snare(B(84 + k * 0.5), 0.12 + k * 0.03);
for (let k = 0; k < 4; k++) snare(B(86 + k * 0.25), 0.25 + k * 0.03);
for (let k = 0; k < 5; k++) snare(B(87 + k * 0.125), 0.38 + k * 0.04);

// --- THE DROP (1320–1560) ---
impact(F(1320), 0.4, 3.2);
crash(F(1320), 0.26, 3);
crash(F(1440), 0.2, 2.5);
for (let bar = 22; bar < 26; bar++) {
  const b0 = bar * 4;
  const c = CH[chordAtBar(bar)];
  for (let k = 0; k < 4; k++) kick(B(b0 + k), 0.95, 0.7);
  clap(B(b0 + 1), 0.4); clap(B(b0 + 3), 0.4);
  snare(B(b0 + 1), 0.3); snare(B(b0 + 3), 0.3);
  for (let k = 0; k < 4; k++) hat(B(b0 + k + 0.5), 0.1, true, -0.25);
  for (let k = 0; k < 16; k++) if (k % 2) hat(B(b0 + k * 0.25), 0.06, false, 0.3);
  for (let k = 0; k < 8; k++) bass(c.root + 12 + (k % 2 ? 12 : 0), B(b0 + k * 0.5), B(0.42), 0.32);
  subNote(c.root, B(b0), 1.9, 0.18, 0.1);
  const g = voGain(0.4);
  for (const [b, m, len] of HOOK[hookIndex(bar)]) {
    const beat = b0 + b;
    const gg = g(beat * 15);
    lead(m, B(beat), B(len) * 0.92, 0.14 * gg, -0.1);
    lead(m, B(beat), B(len) * 0.92, 0.05 * gg, 0.3, true);
    celesta(m + 24, B(beat), 1.4, 0.06 * gg, 0.35);
  }
}
for (let k = 0; k < 8; k++) snare(B(102 + k * 0.25), 0.2 + k * 0.04, (k % 2 ? 0.2 : -0.2)); // 1530–1560 fill

// --- logo (1560–1800) ---
reverseCymbal(F(1530), F(1590), 0.32);
riser(F(1560), F(1590), 0.08, 800, 7000);
impact(F(1590), 0.75, 5);
kick(F(1590), 0.7, 0.0);
{
  const t0 = F(1590);
  const hold = F(1740) - t0;
  pad([50, 57, 62, 66, 69, 74], t0, hold, 0.04, 0.05, 2.2);
  supersaw([62, 66, 69, 74, 78], t0, hold - 0.4, 0.014, 0.01, 2.0, 3000);
  subNote(26, t0, hold - 0.5, 0.26, 2.0); // D1
  subNote(38, t0, hold - 0.5, 0.14, 2.0);
  for (const [k, m] of [[0, 74], [1, 78], [2, 81], [3, 86]]) celesta(m + 12, t0 + B(k * 0.5), 3, 0.08, (k - 1.5) * 0.3);
}
// final sting 1740: bright arpeggio + bell + soft hit, tail to silence
{
  const t0 = F(1740);
  for (const [k, m] of [[0, 74], [1, 78], [2, 81], [3, 86], [4, 90]]) celesta(m + 12, t0 + k * 0.06, 1.9, 0.11, (k - 2) * 0.25);
  celesta(74 + 12, t0 + 0.3, 1.7, 0.08, 0);
  crash(t0, 0.12, 1.8);
  kick(t0, 0.7, 0.0);
  pad([62, 66, 69, 74], t0, 0.6, 0.03, 0.02, 1.2);
}

// ---------- mix ----------
console.log('rendered voices; mixing…');
// sidechain envelope
const sc = new Float32Array(N).fill(1);
for (const [tk, d] of KICKS) {
  if (d <= 0) continue;
  const s0 = Math.round(tk * SR);
  const s1 = Math.min(N, s0 + Math.round(0.32 * SR));
  for (let n = Math.max(0, s0); n < s1; n++) {
    const t = (n - s0) / SR;
    const g = 1 - d * (t < 0.006 ? t / 0.006 : Math.exp(-(t - 0.006) / 0.085));
    if (g < sc[n]) sc[n] = g;
  }
}

function filterBus(b, type, cutoffAt, q = 0.7) {
  const fl = new Biquad(type, cutoffAt(0), q);
  const fr = new Biquad(type, cutoffAt(0), q);
  for (let n = 0; n < N; n++) {
    if ((n & 63) === 0) { const c = cutoffAt(n / SR); fl.set(c, q); fr.set(c, q); }
    b.L[n] = fl.p(b.L[n]);
    b.R[n] = fr.p(b.R[n]);
  }
}
function applySC(b, amount = 1) {
  for (let n = 0; n < N; n++) {
    const g = 1 - (1 - sc[n]) * amount;
    b.L[n] *= g; b.R[n] *= g;
  }
}

const padCut = [[0, 1100], [9, 1500], [20, 4200], [26, 2000], [28, 4200], [38, 600], [41, 600], [44, 7000], [52, 7000], [53, 3500], [60, 3500]];
filterBus(BUS.pad, 'lp', (t) => auto(padCut, t), 0.8);
const arpCut = [[9, 280], [20, 5200], [26, 3000], [28, 4500], [44, 6500], [60, 6500]];
filterBus(BUS.arp, 'lp', (t) => auto(arpCut, t), 1.2);
applySC(BUS.pad, 0.8);
applySC(BUS.arp, 0.6);
applySC(BUS.chords, 1);
applySC(BUS.bass, 1);
applySC(BUS.lead, 0.25);

// --- effects: Freeverb-style reverb + ping-pong delay ---
function reverb(inL, inR, room = 0.86, damp = 0.25) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const alls = [556, 441, 341, 225];
  const mk = (spread) => ({
    c: combs.map((d) => ({ buf: new Float32Array(d + spread), i: 0, st: 0 })),
    a: alls.map((d) => ({ buf: new Float32Array(d + spread), i: 0 })),
  });
  const chL = mk(0), chR = mk(23);
  const outL = new Float32Array(N), outR = new Float32Array(N);
  const run = (ch, x) => {
    let o = 0;
    for (const c of ch.c) {
      const y = c.buf[c.i];
      c.st = y * (1 - damp) + c.st * damp;
      c.buf[c.i] = x + c.st * room;
      if (++c.i >= c.buf.length) c.i = 0;
      o += y;
    }
    for (const a of ch.a) {
      const b = a.buf[a.i];
      const y = -o + b;
      a.buf[a.i] = o + b * 0.5;
      if (++a.i >= a.buf.length) a.i = 0;
      o = y;
    }
    return o;
  };
  const hpL = new Biquad('hp', 220), hpR = new Biquad('hp', 220);
  for (let n = 0; n < N; n++) {
    const x = (inL[n] + inR[n]) * 0.015;
    outL[n] = run(chL, hpL.p(x + inL[n] * 0.01));
    outR[n] = run(chR, hpR.p(x + inR[n] * 0.01));
  }
  return [outL, outR];
}
function pingpong(inL, inR, time = 0.375, fb = 0.38) {
  const d = Math.round(time * SR);
  const bl = new Float32Array(d), br = new Float32Array(d);
  const lpL = new Biquad('lp', 3500), lpR = new Biquad('lp', 3500);
  const outL = new Float32Array(N), outR = new Float32Array(N);
  let i = 0;
  for (let n = 0; n < N; n++) {
    const yl = bl[i], yr = br[i];
    bl[i] = lpL.p((inL[n] + inR[n]) * 0.5 + yr * fb);
    br[i] = lpR.p(yl * fb);
    outL[n] = yl; outR[n] = yr;
    if (++i >= d) i = 0;
  }
  return [outL, outR];
}

const sendRev = { pad: 0.35, cel: 0.6, amb: 0.7, arp: 0.25, snare: 0.35, drums: 0.08, lead: 0.3, chords: 0.3, fx: 0.5, kick: 0.03, bass: 0 };
const sendDly = { cel: 0.35, arp: 0.2, lead: 0.28 };
const gainOf = { pad: 1, cel: 1, amb: 1.3, arp: 1.4, kick: 0.6, drums: 1, snare: 1.4, bass: 1.2, lead: 2.2, chords: 4, fx: 1 };

function busRms(b, t0, t1) {
  let s = 0;
  const a = Math.round(t0 * SR), z = Math.round(t1 * SR);
  for (let n = a; n < z; n++) s += b.L[n] * b.L[n] + b.R[n] * b.R[n];
  return (10 * Math.log10(s / (2 * (z - a)) + 1e-12)).toFixed(1);
}
console.log('bus RMS dB  [intro 2-8s | build 14-19s | groove 28-30s | drop 46-50s]');
for (const [name, b] of Object.entries(BUS)) console.log(`  ${name.padEnd(7)} ${busRms(b, 2, 8)} | ${busRms(b, 14, 19)} | ${busRms(b, 28, 30)} | ${busRms(b, 46, 50)}`);
const revInL = new Float32Array(N), revInR = new Float32Array(N);
const dlyInL = new Float32Array(N), dlyInR = new Float32Array(N);
const dryL = new Float32Array(N), dryR = new Float32Array(N);
for (const [name, b] of Object.entries(BUS)) {
  const g = gainOf[name];
  const rs = sendRev[name] ?? 0;
  const ds = sendDly[name] ?? 0;
  for (let n = 0; n < N; n++) {
    const l = b.L[n] * g, r = b.R[n] * g;
    dryL[n] += l; dryR[n] += r;
    if (rs) { revInL[n] += l * rs; revInR[n] += r * rs; }
    if (ds) { dlyInL[n] += l * ds; dlyInR[n] += r * ds; }
  }
}
const [dL, dR] = pingpong(dlyInL, dlyInR);
for (let n = 0; n < N; n++) { dryL[n] += dL[n] * 0.8; dryR[n] += dR[n] * 0.8; revInL[n] += dL[n] * 0.2; revInR[n] += dR[n] * 0.2; }
const [rL, rR] = reverb(revInL, revInR);
let mixL = new Float32Array(N), mixR = new Float32Array(N);
for (let n = 0; n < N; n++) { mixL[n] = dryL[n] + rL[n] * 1.0; mixR[n] = dryR[n] + rR[n] * 1.0; }

// --- tape stop 630→660 ---
{
  const a = Math.round(F(630) * SR), b = Math.round(F(660) * SR), L = b - a;
  const srcL = mixL.slice(a - 10, b + 10), srcR = mixR.slice(a - 10, b + 10);
  for (let n = a; n < b; n++) {
    const x = n - a;
    const p = x - (x * x) / (2 * L) + 10;
    const i = Math.floor(p), fr = p - i;
    const g = Math.pow(1 - x / L, 0.6);
    mixL[n] = (srcL[i] * (1 - fr) + srcL[i + 1] * fr) * g;
    mixR[n] = (srcR[i] * (1 - fr) + srcR[i + 1] * fr) * g;
  }
  const ramp = Math.round(0.004 * SR);
  for (let k = 0; k < ramp; k++) { mixL[b + k] *= k / ramp; mixR[b + k] *= k / ramp; }
}
// --- gap before the drop 1314→1320 ---
function gate(f0, f1, rampS = 0.006) {
  const a = Math.round(F(f0) * SR), b = Math.round(F(f1) * SR), r = Math.round(rampS * SR);
  for (let n = a - r; n < b + r; n++) {
    const g = n < a ? (a - n) / r : n >= b ? (n - b) / r : 0;
    mixL[n] *= g; mixR[n] *= g;
  }
}
gate(1314, 1320);
gate(1005, 1011); // S07 freeze frame: record scratch + silence
// --- fade to silence 1770→1800 ---
{
  const a = Math.round(F(1770) * SR);
  for (let n = a; n < N; n++) {
    const x = (n - a) / (N - a);
    const g = 0.5 * (1 + Math.cos(Math.PI * Math.min(1, x * 1.05)));
    mixL[n] *= g; mixR[n] *= g;
  }
}

// ---------- master: loudness (BS.1770-ish), soft clip, -1 dBFS ceiling ----------
function lufs(L, R) {
  const kw = () => [new Biquad('hs', 1681, 0.7071, 4), new Biquad('hp', 38, 0.5)];
  const [a1, a2] = kw(), [b1, b2] = kw();
  const blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const sq = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const l = a2.p(a1.p(L[n])), r = b2.p(b1.p(R[n]));
    sq[n] = l * l + r * r;
  }
  const cum = new Float64Array(N + 1);
  for (let n = 0; n < N; n++) cum[n + 1] = cum[n] + sq[n];
  const blocks = [];
  for (let s = 0; s + blk <= N; s += hop) blocks.push((cum[s + blk] - cum[s]) / blk);
  const toL = (p) => -0.691 + 10 * Math.log10(p);
  let g = blocks.filter((p) => toL(p) > -70);
  const rel = toL(g.reduce((a, b) => a + b, 0) / g.length) - 10;
  g = g.filter((p) => toL(p) > rel);
  return toL(g.reduce((a, b) => a + b, 0) / g.length);
}
const CEIL = 0.83; // sample peak ≈ -1.6 dBFS so the true peak stays under -1 dBFS
const T = 0.55;
const soft = (x) => {
  const a = Math.abs(x);
  if (a <= T) return x;
  return Math.sign(x) * (T + (1 - T) * Math.tanh((a - T) / (1 - T)));
};
function master(gain) {
  const L = new Float32Array(N), Rr = new Float32Array(N);
  for (let n = 0; n < N; n++) { L[n] = soft(mixL[n] * gain) * CEIL; Rr[n] = soft(mixR[n] * gain) * CEIL; }
  return [L, Rr];
}
const TARGET = -14;
let gain = Math.pow(10, (TARGET - lufs(mixL, mixR)) / 20);
let out;
for (let it = 0; it < 4; it++) {
  out = master(gain);
  const l = lufs(out[0], out[1]);
  console.log(`master pass ${it}: gain ${gain.toFixed(3)} → ${l.toFixed(2)} LUFS`);
  if (Math.abs(l - TARGET) < 0.2) break;
  gain *= Math.pow(10, (TARGET - l) / 20);
}
const [oL, oR] = out;
let peak = 0;
for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(oL[n]), Math.abs(oR[n]));
console.log(`peak ${(20 * Math.log10(peak)).toFixed(2)} dBFS`);

// ---------- write WAV ----------
const data = Buffer.alloc(N * 4);
for (let n = 0; n < N; n++) {
  const d1 = (R() - R()) / 32768, d2 = (R() - R()) / 32768;
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((oL[n] + d1) * 32767))), n * 4);
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((oR[n] + d2) * 32767))), n * 4 + 2);
}
// clean last samples (exact silence at 60 s)
data.fill(0, (N - 64) * 4);
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8);
hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([hdr, data]));
console.log(`wrote ${OUT}`);
