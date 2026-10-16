// LifeQuest trailer — synthesized sound effects (pure JS). 44.1 kHz stereo 16-bit WAVs,
// each peak-normalised to about -3 dBFS; levels are set per cue in src/audio.tsx.
//
//   node scripts/sfx.mjs   → public/sfx/*.wav
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '..', 'public', 'sfx');
fs.mkdirSync(OUT, { recursive: true });

const SR = 44100;
const TAU = Math.PI * 2;
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
let R = rng(7);
const noise = () => R() * 2 - 1;

class Biquad {
  constructor(type = 'lp', f = 1000, q = 0.707) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.type = type;
    this.set(f, q);
  }
  set(f, q = this.q) {
    this.q = q;
    f = Math.min(Math.max(f, 10), SR * 0.45);
    const w = (TAU * f) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
    if (this.type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
    else if (this.type === 'bp') { b0 = al; b1 = 0; b2 = -al; }
    else { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}
class Osc {
  constructor(ph = 0) { this.ph = ph; }
  sin(f) { const v = Math.sin(TAU * this.ph); this.ph = (this.ph + f / SR) % 1; return v; }
  saw(f) { const v = 2 * this.ph - 1; this.ph = (this.ph + f / SR) % 1; return v; }
  sq(f, pw = 0.5) { const v = this.ph < pw ? 1 : -1; this.ph = (this.ph + f / SR) % 1; return v; }
}

const buf = (sec) => ({ L: new Float32Array(Math.round(sec * SR)), R: new Float32Array(Math.round(sec * SR)) });
/** add mono fn(t) at `start` seconds with pan (-1..1) */
function add(b, start, len, pan, fn) {
  const a = ((pan + 1) / 2) * (Math.PI / 2), gl = Math.cos(a), gr = Math.sin(a);
  const s0 = Math.round(start * SR), s1 = Math.min(b.L.length, s0 + Math.round(len * SR));
  for (let n = s0; n < s1; n++) { const v = fn((n - s0) / SR); b.L[n] += v * gl; b.R[n] += v * gr; }
}
function addStereo(b, start, len, fn) {
  const s0 = Math.round(start * SR), s1 = Math.min(b.L.length, s0 + Math.round(len * SR));
  const o = [0, 0];
  for (let n = s0; n < s1; n++) { fn((n - s0) / SR, o); b.L[n] += o[0]; b.R[n] += o[1]; }
}
function reverb(b, wet = 0.3, room = 0.82, damp = 0.3) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], alls = [556, 441, 341, 225];
  const mk = (sp) => ({ c: combs.map((d) => ({ buf: new Float32Array(d + sp), i: 0, st: 0 })), a: alls.map((d) => ({ buf: new Float32Array(d + sp), i: 0 })) });
  const run = (ch, x) => {
    let o = 0;
    for (const c of ch.c) { const y = c.buf[c.i]; c.st = y * (1 - damp) + c.st * damp; c.buf[c.i] = x + c.st * room; if (++c.i >= c.buf.length) c.i = 0; o += y; }
    for (const a of ch.a) { const v = a.buf[a.i]; const y = -o + v; a.buf[a.i] = o + v * 0.5; if (++a.i >= a.buf.length) a.i = 0; o = y; }
    return o;
  };
  const l = mk(0), r = mk(23);
  for (let n = 0; n < b.L.length; n++) {
    const x = (b.L[n] + b.R[n]) * 0.015;
    const wl = run(l, x), wr = run(r, x);
    b.L[n] += wl * wet; b.R[n] += wr * wet;
  }
  return b;
}
function write(name, b, peakDb = -3) {
  const n = b.L.length;
  let pk = 1e-9;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(b.L[i]), Math.abs(b.R[i]));
  const g = Math.pow(10, peakDb / 20) / pk;
  // 3 ms fade at both ends
  const f = Math.round(0.003 * SR);
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const e = Math.min(1, i / f, (n - 1 - i) / f);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.L[i] * g * e)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.R[i] * g * e)) * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(OUT, `${name}.wav`), Buffer.concat([h, data]));
  console.log(`${name}.wav  ${(n / SR).toFixed(2)} s`);
}

// ---------- whooshes ----------
function whoosh(name, len, f0, f1, seed, panFrom, panTo) {
  R = rng(seed);
  const b = buf(len + 0.4);
  const bl = new Biquad('bp', f0, 1.4), br = new Biquad('bp', f0, 1.4);
  const lp = new Biquad('lp', 6000), lp2 = new Biquad('lp', 6000);
  let i = 0;
  addStereo(b, 0, len, (t, o) => {
    const x = t / len;
    if ((i++ & 31) === 0) { const c = f0 * Math.pow(f1 / f0, Math.sin((x * Math.PI) / 2)); bl.set(c, 1.4); br.set(c, 1.4); }
    const env = Math.pow(Math.sin(Math.PI * Math.pow(x, 0.7)), 2);
    const pan = panFrom + (panTo - panFrom) * x;
    const gl = Math.cos(((pan + 1) / 2) * (Math.PI / 2)), gr = Math.sin(((pan + 1) / 2) * (Math.PI / 2));
    const s = (bl.p(noise()) + br.p(noise())) * 1.5 + lp.p(noise()) * 0.15;
    o[0] = s * env * gl; o[1] = lp2.p(s) * env * gr;
  });
  write(name, reverb(b, 0.25));
}
whoosh('whoosh_1', 0.55, 400, 3500, 11, -0.8, 0.8);
whoosh('whoosh_2', 0.4, 900, 6000, 12, 0.7, -0.7);
whoosh('whoosh_3', 0.8, 250, 2200, 13, -0.5, 0.6); // heavier, slower
whoosh('whoosh_short', 0.25, 1200, 7000, 14, 0.4, -0.4);

// ---------- impact / boom ----------
{
  R = rng(21);
  const b = buf(4);
  const o = new Osc(), lp = new Biquad('lp', 1200);
  add(b, 0, 4, 0, (t) => {
    const sub = o.sin(28 + 55 * Math.exp(-t / 0.15)) * Math.exp(-t / 1.1);
    const crack = lp.p(noise()) * Math.exp(-t / 0.18);
    return Math.tanh((sub * 1.2 + crack * 0.9) * 1.5);
  });
  const hl = new Biquad('hp', 3500), hr = new Biquad('hp', 3500);
  addStereo(b, 0, 3, (t, o2) => { const e = Math.exp(-t / 0.7) * 0.25; o2[0] = hl.p(noise()) * e; o2[1] = hr.p(noise()) * e; });
  write('impact', reverb(b, 0.45, 0.88));
}
// logo boom: bigger, longer
{
  R = rng(22);
  const b = buf(6);
  const o = new Osc(), o2 = new Osc(), lp = new Biquad('lp', 700);
  add(b, 0, 6, 0, (t) => {
    const sub = o.sin(26 + 60 * Math.exp(-t / 0.2)) * Math.exp(-t / 1.8) + 0.4 * o2.sin(52 + 40 * Math.exp(-t / 0.1)) * Math.exp(-t / 0.6);
    const thump = lp.p(noise()) * Math.exp(-t / 0.3);
    return Math.tanh((sub + thump) * 1.6);
  });
  write('boom', reverb(b, 0.5, 0.9));
}

// ---------- stamp slam ----------
{
  R = rng(31);
  const b = buf(1.2);
  const o = new Osc(), lp = new Biquad('lp', 2500), bp = new Biquad('bp', 1800, 1.2);
  add(b, 0, 1.2, 0, (t) => {
    const thud = o.sin(70 + 110 * Math.exp(-t / 0.02)) * Math.exp(-t / 0.12);
    const slap = bp.p(noise()) * Math.exp(-t / 0.025) * 2.2;
    const body = lp.p(noise()) * Math.exp(-t / 0.05) * 0.8;
    return Math.tanh((thud + slap + body) * 1.8);
  });
  write('stamp', reverb(b, 0.2, 0.7));
}

// ---------- coin ping helper ----------
function ping(b, start, f, amp, pan, dec = 0.35) {
  const o1 = new Osc(), o2 = new Osc(), o3 = new Osc();
  add(b, start, dec * 5, pan, (t) =>
    Math.min(1, t / 0.0008) * amp * (o1.sin(f) * Math.exp(-t / dec) + 0.6 * o2.sin(f * 2.76) * Math.exp(-t / (dec * 0.5)) + 0.4 * o3.sin(f * 5.4) * Math.exp(-t / (dec * 0.25))));
}
// coin drop sparkle: a coin bounces (accelerating) + sparkle
{
  R = rng(41);
  const b = buf(1.6);
  let t = 0, gap = 0.16, amp = 1;
  for (let k = 0; k < 9; k++) { ping(b, t, 3100 + R() * 300, amp, (R() - 0.5) * 0.4, 0.12); t += gap; gap *= 0.72; amp *= 0.78; }
  for (let k = 0; k < 10; k++) ping(b, 0.05 + R() * 0.7, 5000 + R() * 4000, 0.15, R() * 1.6 - 0.8, 0.2);
  write('coins', reverb(b, 0.3));
}
// cash register ka-ching
{
  R = rng(51);
  const b = buf(2.2);
  const bp = new Biquad('bp', 2500, 2);
  add(b, 0, 0.08, 0, (t) => bp.p(noise()) * Math.exp(-t / 0.012) * 2); // "ka" mechanical clack
  const bp2 = new Biquad('bp', 1200, 1.5);
  add(b, 0.05, 0.1, 0, (t) => bp2.p(noise()) * Math.exp(-t / 0.02) * 1.5);
  ping(b, 0.14, 2093, 0.9, -0.1, 0.5); // "ching" bell (C7 + E7)
  ping(b, 0.14, 2637, 0.7, 0.1, 0.45);
  ping(b, 0.15, 4186, 0.25, 0, 0.3);
  // drawer slide
  const lp = new Biquad('bp', 600, 0.8);
  add(b, 0.12, 0.35, 0, (t) => lp.p(noise()) * Math.sin(Math.PI * (t / 0.35)) * 0.3);
  write('register', reverb(b, 0.25));
}

// ---------- door creak + light swell ----------
{
  R = rng(61);
  const b = buf(2.6);
  const o = new Osc(), f1 = new Biquad('bp', 900, 6), f2 = new Biquad('bp', 2300, 8);
  let jitter = 0;
  add(b, 0, 1.2, -0.2, (t) => {
    jitter += (noise() * 0.5 - jitter) * 0.002;
    const f = 70 + 60 * Math.sin(Math.PI * t / 1.2) + 40 * jitter + 25 * Math.sin(TAU * 7 * t);
    const v = o.saw(f);
    const env = Math.min(1, t / 0.08) * Math.min(1, (1.2 - t) / 0.2);
    return (f1.p(v) * 3 + f2.p(v) * 2) * env * 0.8;
  });
  // light swell: soft chord shimmer rising
  for (const [m, d] of [[74, 0], [78, 0.05], [81, 0.1], [86, 0.15]]) {
    const o2 = new Osc(R()), o3 = new Osc(R());
    const f = 440 * Math.pow(2, (m - 69) / 12);
    add(b, 0.6 + d, 2.0, (m % 3) * 0.3 - 0.3, (t) => {
      const e = Math.pow(Math.min(1, t / 0.9), 2) * Math.exp(-Math.max(0, t - 0.9) / 0.4);
      return (o2.sin(f) + 0.3 * o3.sin(f * 2.001)) * e * 0.12;
    });
  }
  write('door', reverb(b, 0.4, 0.85));
}

// ---------- footsteps (soft, 4 steps) ----------
{
  R = rng(71);
  const b = buf(2.1);
  for (let k = 0; k < 4; k++) {
    const lp = new Biquad('lp', 900 + R() * 300), hp = new Biquad('bp', 3000, 1);
    const st = k * 0.5;
    add(b, st, 0.2, k % 2 ? 0.15 : -0.15, (t) => lp.p(noise()) * Math.exp(-t / 0.035) * 1.2 + hp.p(noise()) * Math.exp(-Math.max(0, t - 0.03) / 0.02) * (t > 0.03 ? 0.25 : 0));
  }
  write('footsteps', b);
}

// ---------- car pass + brake ----------
{
  R = rng(81);
  const len = 2.6;
  const b = buf(len);
  const o = new Osc(), o2 = new Osc(), lp = new Biquad('lp', 900), nl = new Biquad('lp', 1200);
  addStereo(b, 0, 1.9, (t, out) => {
    const x = (t - 0.95) / 0.5; // closest approach at 0.95 s
    const dop = 1 + 0.08 * Math.tanh(-x * 1.5);
    const near = 1 / (1 + x * x);
    const engine = lp.p(o.saw(48 * dop) * 0.6 + o2.sq(96 * dop) * 0.3);
    const road = nl.p(noise()) * 0.8;
    const v = (engine + road) * near * Math.min(1, (1.9 - t) / 0.3);
    const pan = Math.tanh(x);
    out[0] = v * (1 - pan) * 0.6; out[1] = v * (1 + pan) * 0.6;
  });
  // brake squeal + tyre noise at 1.5 s
  const sq = new Osc(), bp = new Biquad('bp', 2800, 4);
  add(b, 1.5, 0.9, 0.5, (t) => {
    const e = Math.min(1, t / 0.05) * Math.exp(-t / 0.4);
    return (sq.sin(2900 + 120 * Math.sin(TAU * 11 * t)) * 0.35 + bp.p(noise()) * 1.2) * e;
  });
  write('car_pass', reverb(b, 0.15));
}

// ---------- bus air-brake hiss ----------
{
  R = rng(91);
  const b = buf(2.2);
  const hp = new Biquad('hp', 2500), bp = new Biquad('bp', 5500, 1);
  const vc = new Biquad('bp', 1500, 3);
  add(b, 0, 0.12, 0, (t) => vc.p(noise()) * Math.exp(-t / 0.02) * 3); // valve click
  const hl = new Biquad('hp', 2200), hr = new Biquad('hp', 2200);
  addStereo(b, 0.08, 1.6, (t, o) => {
    const e = Math.min(1, t / 0.015) * (t < 0.25 ? 1 : Math.exp(-(t - 0.25) / 0.35));
    o[0] = (hl.p(noise()) + bp.p(noise()) * 0.6) * e; o[1] = (hr.p(noise()) + hp.p(noise()) * 0.3) * e;
  });
  const o = new Osc(), lp = new Biquad('lp', 200);
  add(b, 0, 2.1, 0, (t) => (o.saw(38) * 0.3 + lp.p(noise())) * 0.5 * Math.exp(-t / 1.2)); // engine idle rumble
  write('bus_brake', reverb(b, 0.2));
}

// ---------- thunder crack + rumble ----------
{
  R = rng(101);
  const b = buf(6);
  const hp = new Biquad('hp', 1200);
  add(b, 0, 0.5, 0, (t) => {
    let e = 0;
    for (const o of [0, 0.03, 0.07, 0.12]) if (t >= o) e += Math.exp(-(t - o) / 0.03);
    return hp.p(noise()) * e * 0.8;
  });
  const ll = new Biquad('lp', 260), lr = new Biquad('lp', 260), ml = new Biquad('lp', 900), mr = new Biquad('lp', 900);
  let mod = 0;
  addStereo(b, 0.05, 5.9, (t, o) => {
    mod += (Math.abs(noise()) - mod) * 0.0006;
    const e = Math.min(1, t / 0.15) * Math.exp(-t / 1.6) * (0.5 + mod * 1.8);
    o[0] = (ll.p(noise()) * 4 + ml.p(noise()) * 0.6) * e;
    o[1] = (lr.p(noise()) * 4 + mr.p(noise()) * 0.6) * e;
  });
  write('thunder', reverb(b, 0.4, 0.9));
}

// ---------- rain loop (8 s, seamless) ----------
{
  R = rng(111);
  const len = 8, xf = 1;
  const b = buf(len + xf);
  const hl = new Biquad('bp', 3500, 0.5), hr = new Biquad('bp', 3500, 0.5), ll = new Biquad('lp', 900), lr = new Biquad('lp', 900);
  addStereo(b, 0, len + xf, (t, o) => {
    o[0] = hl.p(noise()) * 0.5 + ll.p(noise()) * 0.25;
    o[1] = hr.p(noise()) * 0.5 + lr.p(noise()) * 0.25;
  });
  for (let k = 0; k < 900; k++) {
    const st = R() * (len + xf - 0.05), f = 2500 + R() * 5000, bp = new Biquad('bp', f, 3);
    const amp = 0.2 + R() * 0.5;
    add(b, st, 0.03, R() * 2 - 1, (t) => bp.p(noise()) * Math.exp(-t / 0.006) * amp);
  }
  // fold the extra second over the start so the loop is seamless
  const n = len * SR, x = xf * SR;
  const out = buf(len);
  for (let i = 0; i < n; i++) {
    if (i < x) {
      const g = i / x;
      out.L[i] = b.L[i] * Math.sqrt(g) + b.L[n + i] * Math.sqrt(1 - g);
      out.R[i] = b.R[i] * Math.sqrt(g) + b.R[n + i] * Math.sqrt(1 - g);
    } else { out.L[i] = b.L[i]; out.R[i] = b.R[i]; }
  }
  // write without end fades (they would break the loop)
  let pk = 1e-9;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(out.L[i]), Math.abs(out.R[i]));
  const g = Math.pow(10, -6 / 20) / pk;
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) { data.writeInt16LE(Math.round(out.L[i] * g * 32767), i * 4); data.writeInt16LE(Math.round(out.R[i] * g * 32767), i * 4 + 2); }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(OUT, 'rain_loop.wav'), Buffer.concat([h, data]));
  console.log('rain_loop.wav  8.00 s (seamless)');
}

// ---------- pot sizzle / smoke ----------
{
  R = rng(121);
  const b = buf(1.6);
  const hl = new Biquad('hp', 3000), hr = new Biquad('hp', 3000);
  addStereo(b, 0, 1.6, (t, o) => {
    const e = Math.min(1, t / 0.02) * (t < 0.9 ? 1 : Math.exp(-(t - 0.9) / 0.25)) * (0.6 + 0.4 * Math.sin(TAU * 3 * t + R() * 0.3));
    o[0] = hl.p(noise()) * e * 0.5; o[1] = hr.p(noise()) * e * 0.5;
  });
  for (let k = 0; k < 60; k++) {
    const st = R() * 1.3, bp = new Biquad('bp', 2000 + R() * 4000, 2);
    add(b, st, 0.02, R() * 1.4 - 0.7, (t) => bp.p(noise()) * Math.exp(-t / 0.003) * 2.5);
  }
  // smoke whoosh puff
  const lp = new Biquad('bp', 800, 0.7);
  add(b, 0.1, 1.2, 0, (t) => lp.p(noise()) * Math.sin(Math.PI * t / 1.2) * 0.4);
  write('sizzle', reverb(b, 0.2));
}

// ---------- washing machine thump ----------
{
  R = rng(131);
  const b = buf(1.6);
  for (const st of [0, 0.36, 0.72]) {
    const o = new Osc(), lp = new Biquad('lp', 300);
    add(b, st, 0.35, 0, (t) => Math.tanh((o.sin(55 + 40 * Math.exp(-t / 0.03)) * Math.exp(-t / 0.12) + lp.p(noise()) * Math.exp(-t / 0.05)) * 2));
    const bp = new Biquad('bp', 1400, 3);
    add(b, st + 0.01, 0.15, 0.3, (t) => bp.p(noise()) * Math.exp(-t / 0.03) * 0.8); // metal rattle
  }
  const o = new Osc(), lp = new Biquad('lp', 160);
  add(b, 0, 1.5, 0, (t) => lp.p(o.saw(32)) * 0.25 * Math.exp(-t / 0.8)); // drum hum
  write('washer', reverb(b, 0.15));
}

// ---------- door rattle (montage) ----------
{
  R = rng(141);
  const b = buf(0.9);
  for (let k = 0; k < 7; k++) {
    const bp = new Biquad('bp', 900 + R() * 900, 4), o = new Osc();
    const st = k * 0.065 + R() * 0.01;
    add(b, st, 0.12, (R() - 0.5) * 0.4, (t) => (bp.p(noise()) * 2 + o.sin(420 + R() * 3) * 0.3) * Math.exp(-t / 0.025) * (1 - k * 0.08));
  }
  write('door_rattle', reverb(b, 0.2, 0.6));
}

// ---------- UI pop ----------
{
  const b = buf(0.3);
  const o = new Osc();
  add(b, 0, 0.25, 0, (t) => o.sin(380 + 900 * Math.exp(-t / 0.025)) * Math.exp(-t / 0.05));
  write('pop', b);
}
// ---------- button click ----------
{
  R = rng(151);
  const b = buf(0.12);
  const bp = new Biquad('bp', 3500, 3), o = new Osc();
  add(b, 0, 0.1, 0, (t) => bp.p(noise()) * Math.exp(-t / 0.004) * 2 + o.sin(1800) * Math.exp(-t / 0.01) * 0.4);
  const bp2 = new Biquad('bp', 2200, 3);
  add(b, 0.035, 0.06, 0, (t) => bp2.p(noise()) * Math.exp(-t / 0.003) * 2);
  write('click', b);
}
// ---------- heart chime ----------
{
  R = rng(161);
  const b = buf(2.4);
  ping(b, 0, 1174.7, 0.8, -0.2, 0.6); // D6
  ping(b, 0.11, 1480, 0.8, 0.2, 0.6); // F#6
  ping(b, 0.22, 1760, 0.6, 0, 0.7); // A6
  for (let k = 0; k < 8; k++) ping(b, 0.2 + R() * 0.5, 4000 + R() * 4000, 0.08, R() * 1.6 - 0.8, 0.2);
  write('heart_chime', reverb(b, 0.4, 0.85));
}
// ---------- glitch / fast-forward tape whirr ----------
{
  R = rng(171);
  const len = 1.0;
  const b = buf(len + 0.1);
  const o = new Osc(), o2 = new Osc(), bp = new Biquad('bp', 1500, 1.2);
  add(b, 0, len, 0, (t) => {
    const x = t / len;
    const f = 180 * Math.pow(8, x);
    const trem = 0.6 + 0.4 * Math.sign(Math.sin(TAU * (14 + 30 * x) * t));
    const gl = Math.floor(t * 40) % 7 === 3 ? 0 : 1; // stutter gaps
    const env = Math.min(1, t / 0.03) * Math.min(1, (len - t) / 0.05);
    return (o.sq(f, 0.3) * 0.35 + o2.saw(f * 1.5) * 0.2 + bp.p(noise()) * 0.6) * trem * gl * env;
  });
  write('ff_whirr', b);
}
// ---------- sparkle shimmer ----------
{
  R = rng(181);
  const b = buf(3);
  const notes = [86, 90, 93, 98, 102, 105];
  for (let k = 0; k < 28; k++) {
    const m = notes[Math.floor(R() * notes.length)];
    ping(b, R() * 1.4, 440 * Math.pow(2, (m - 69) / 12), 0.25 * (1 - k / 40), R() * 1.8 - 0.9, 0.3);
  }
  const hl = new Biquad('hp', 8000), hr = new Biquad('hp', 8000);
  addStereo(b, 0, 2, (t, o) => { const e = Math.sin(Math.PI * t / 2) * 0.06; o[0] = hl.p(noise()) * e; o[1] = hr.p(noise()) * e; });
  write('shimmer', reverb(b, 0.5, 0.88));
}
// ---------- riser (3 s) ----------
{
  R = rng(191);
  const len = 3;
  const b = buf(len);
  const bl = new Biquad('bp', 300, 2.5), br = new Biquad('bp', 300, 2.5), o = new Osc(), o2 = new Osc();
  let i = 0;
  addStereo(b, 0, len, (t, out) => {
    const x = t / len;
    if ((i++ & 31) === 0) { const c = 300 * Math.pow(30, x * x); bl.set(c, 2.5); br.set(c, 2.5); }
    const e = Math.pow(x, 2) * Math.min(1, (len - t) / 0.01);
    const tone = (o.saw(110 * Math.pow(2, 3 * x)) + o2.saw(110 * Math.pow(2, 3 * x) * 1.01)) * 0.08;
    out[0] = (bl.p(noise()) * 3 + tone) * e; out[1] = (br.p(noise()) * 3 + tone) * e;
  });
  write('riser', reverb(b, 0.3));
}

// ---------- record scratch (freeze frame) ----------
{
  R = rng(201);
  const len = 0.45;
  const b = buf(len + 0.1);
  const bp = new Biquad('bp', 1200, 2), o = new Osc();
  let i = 0;
  add(b, 0, len, 0, (t) => {
    const x = t / len;
    // forward-back-forward "wicka" motion
    const sp = Math.sin(TAU * 2.2 * t) * (1 - x * 0.5);
    if ((i++ & 15) === 0) bp.set(500 + 2600 * Math.abs(sp), 2);
    return (bp.p(noise()) * 2.5 + o.saw(120 + 500 * Math.abs(sp)) * 0.25) * Math.abs(sp) * Math.min(1, (len - t) / 0.03);
  });
  write('record_scratch', b);
}
// ---------- ding (correct bus / check mark) ----------
{
  R = rng(211);
  const b = buf(1.8);
  ping(b, 0, 1568, 0.9, 0, 0.55); // G6
  ping(b, 0.09, 2349, 0.7, 0.1, 0.6); // D7
  write('ding', reverb(b, 0.3));
}
// ---------- tick (count-up / typing) ----------
{
  R = rng(221);
  const b = buf(0.06);
  const bp = new Biquad('bp', 4200, 4), o = new Osc();
  add(b, 0, 0.05, 0, (t) => (bp.p(noise()) * 1.5 + o.sin(2600) * 0.5) * Math.exp(-t / 0.006));
  write('tick', b);
}
// ---------- thud (slot-in / padlock clunk) ----------
{
  R = rng(231);
  const b = buf(0.6);
  const o = new Osc(), lp = new Biquad('lp', 600), bp = new Biquad('bp', 1600, 5);
  add(b, 0, 0.5, 0, (t) => Math.tanh((o.sin(85 + 60 * Math.exp(-t / 0.02)) * Math.exp(-t / 0.08) + lp.p(noise()) * Math.exp(-t / 0.03) + bp.p(noise()) * Math.exp(-t / 0.04) * 0.8) * 1.6));
  write('thud', reverb(b, 0.12, 0.6));
}
// ---------- single coin (one per coin) ----------
{
  R = rng(241);
  const b = buf(0.9);
  let t = 0, gap = 0.07, amp = 1;
  for (let k = 0; k < 4; k++) { ping(b, t, 3400 + k * 40, amp, 0, 0.1); t += gap; gap *= 0.7; amp *= 0.6; }
  write('coin', reverb(b, 0.2));
}
