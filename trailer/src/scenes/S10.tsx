// S10 · abs 1560–1800 · LOGO REVEAL & CALL TO ACTION.
// Thousands of pixel squares assemble "LIFEQUEST" exactly on CUES.logoHit, over a golden-hour
// neighbourhood skyline; the whole cast walks in; tagline, CTA, final sting.
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { PixelCanvas, rand, glow, prog, EASE, clamp, lerp, type DrawInfo } from '../lib/stage';
import { drawChar, prop, type Dir } from '../lib/art';
import { CUES, SCENES } from '../timeline';
import { UI, PIXEL, BODY, fontPx } from './C_kit';

const FROM = SCENES[9].from; // 1560
const L_HIT = CUES.logoHit - FROM; // 30
const L_TAG = CUES.narratorLine2 - FROM; // 60
const L_CTA = 120;
const L_STING = CUES.finalSting - FROM; // 180

// ------------------------------------------------------------ logo bitmap
const LOGO_TEXT = 'LIFEQUEST';
const FS = 80; // logo font size on the 960×540 logo canvas (=160px on screen)
const PAD = 24;
const EXT = 10; // extrusion depth
let logoCache: { c: HTMLCanvasElement; pts: Float32Array; cols: string[]; n: number } | null = null;

function logo() {
  if (logoCache) return logoCache;
  const font = fontPx(FS, PIXEL);
  const ready = typeof document !== 'undefined' && document.fonts ? document.fonts.check(font) : true;
  const tmp = document.createElement('canvas').getContext('2d')!;
  tmp.font = font;
  const tw = Math.ceil(tmp.measureText(LOGO_TEXT).width);
  const c = document.createElement('canvas');
  c.width = tw + PAD * 2;
  c.height = FS + PAD * 2 + EXT;
  const ctx = c.getContext('2d')!;
  ctx.font = font;
  ctx.textBaseline = 'top';
  // extrusion (deep coral → plum)
  for (let k = EXT; k >= 1; k--) {
    ctx.fillStyle = k > EXT / 2 ? '#3a1838' : '#a8381a';
    ctx.fillText(LOGO_TEXT, PAD, PAD + k);
  }
  // dark outline
  ctx.strokeStyle = '#1b1f3b';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'miter';
  ctx.strokeText(LOGO_TEXT, PAD, PAD + EXT);
  ctx.strokeText(LOGO_TEXT, PAD, PAD);
  // face: cream → gold → sunset banded (pixel bands, no smooth gradient)
  const bands = ['#fffaf0', '#fff3dc', '#ffe6a6', '#ffd166', '#ffc24d', '#f2a541', '#e8892f'];
  ctx.fillStyle = bands[3];
  ctx.fillText(LOGO_TEXT, PAD, PAD);
  for (let i = 0; i < bands.length; i++) {
    ctx.save();
    ctx.beginPath();
    const y0 = Math.floor(PAD + (i * FS) / bands.length);
    ctx.rect(0, y0, c.width, Math.floor(PAD + ((i + 1) * FS) / bands.length) - y0 + (i === bands.length - 1 ? 8 : 0));
    ctx.clip();
    ctx.fillStyle = bands[i];
    ctx.fillText(LOGO_TEXT, PAD, PAD);
    ctx.restore();
  }
  // top highlight
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, PAD, c.width, 10);
  ctx.clip();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillRect(0, PAD, c.width, 10);
  ctx.restore();
  // sample particles
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const pts: number[] = [];
  const cols: string[] = [];
  const STEP = 2;
  for (let y = 0; y < c.height; y += STEP)
    for (let x = 0; x < c.width; x += STEP) {
      const o = (y * c.width + x) * 4;
      if (data[o + 3] > 160) {
        pts.push(x, y);
        cols.push(`rgb(${data[o]},${data[o + 1]},${data[o + 2]})`);
      }
    }
  const res = { c, pts: new Float32Array(pts), cols, n: cols.length };
  if (ready) logoCache = res;
  return res;
}

const LOGO_CY = 165; // logo centre on the 960×540 canvas (=330px on screen)

const logoScale = (f: number) => (f < L_HIT ? 1 : 1.22 - 0.22 * prog(f, L_HIT, L_HIT + 22, EASE.elastic));

// ------------------------------------------------------------ logo canvas (scale 2)
const drawLogo = (ctx: CanvasRenderingContext2D, { w, h, frame: f }: DrawInfo) => {
  const L = logo();
  const ox = Math.round(w / 2 - L.c.width / 2);
  const oy = Math.round(LOGO_CY - L.c.height / 2);
  if (f < L_HIT) {
    // particles fly in from the flash and lock exactly on the hit
    const { pts, cols, n } = L;
    for (let i = 0; i < n; i++) {
      const tx = ox + pts[i * 2];
      const ty = oy + pts[i * 2 + 1];
      const delay = rand(i, 1) * 14;
      const p = clamp((f - delay) / (L_HIT - delay));
      if (p <= 0 && rand(i, 7) > 0.25) continue;
      const e = 1 - Math.pow(1 - p, 3);
      const ang = rand(i, 2) * Math.PI * 2;
      const dist = 220 + rand(i, 3) * 420;
      const sx = w / 2 + Math.cos(ang) * dist * (rand(i, 6) > 0.5 ? 1 : 0.15);
      const sy = LOGO_CY + Math.sin(ang) * dist * 0.6;
      const swirl = (1 - e) * (1.6 + rand(i, 4));
      const dx = sx - tx;
      const dy = sy - ty;
      const cs = Math.cos(swirl);
      const sn = Math.sin(swirl);
      const x = tx + (dx * cs - dy * sn) * (1 - e);
      const y = ty + (dx * sn + dy * cs) * (1 - e);
      const dark = parseInt(cols[i].slice(4), 10) < 120; // outline / plum pixels → glow while flying
      ctx.fillStyle = p < 0.85 && (dark || rand(i, 5) > 0.6) ? (rand(i, 9) > 0.5 ? '#fff3dc' : '#ffd166') : cols[i];
      const s = p > 0.9 ? 2 : 2 + Math.round(rand(i, 8) * 2);
      ctx.fillRect(Math.round(x), Math.round(y), s, s);
    }
    glow(ctx, w / 2, LOGO_CY, 220, '#ffd9a0', 0.15 + 0.5 * prog(f, 18, L_HIT, EASE.in));
    return;
  }
  const s = logoScale(f);
  const t = f - L_HIT;
  // bloom
  ctx.save();
  ctx.translate(w / 2, LOGO_CY);
  ctx.scale(s, s);
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(14px)';
  ctx.globalAlpha = 0.25 + 0.75 * Math.exp(-t / 8) + 0.06 * Math.sin(f * 0.1);
  ctx.drawImage(L.c, -L.c.width / 2, -L.c.height / 2);
  ctx.restore();
  // crisp logo
  ctx.save();
  ctx.translate(w / 2, LOGO_CY + Math.sin(f * 0.05) * 1.5);
  ctx.scale(s, s);
  ctx.drawImage(L.c, Math.round(-L.c.width / 2), Math.round(-L.c.height / 2));
  ctx.restore();
  // shimmer sweeps (small at 96, big on the final sting)
  const sweep = (start: number, len: number, width: number, alpha: number) => {
    const p = (f - start) / len;
    if (p < 0 || p > 1) return;
    const sh = shimmerCanvas(L.c, p, width, alpha);
    ctx.save();
    ctx.translate(w / 2, LOGO_CY + Math.sin(f * 0.05) * 1.5);
    ctx.scale(s, s);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sh, Math.round(-L.c.width / 2), Math.round(-L.c.height / 2));
    ctx.restore();
  };
  sweep(L_HIT + 4, 16, 60, 0.8);
  sweep(96, 18, 50, 0.6);
  sweep(L_STING, 22, 110, 1);
  // shockwave rings
  for (const [st, k] of [
    [L_HIT, 1],
    [L_HIT + 5, 0.6],
    [L_STING, 0.7],
  ] as const) {
    const p = prog(f, st, st + 24, EASE.out);
    if (f < st || p >= 1) continue;
    ctx.save();
    ctx.strokeStyle = `rgba(255,243,220,${(1 - p) * 0.9 * k})`;
    ctx.lineWidth = Math.max(1, (1 - p) * 10);
    ctx.beginPath();
    ctx.ellipse(w / 2, LOGO_CY, 60 + p * 560, 20 + p * 220, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // impact debris + sting sparkle burst
  const burst = (st: number, n: number, seed: number) => {
    const tt = f - st;
    if (tt < 0 || tt > 40) return;
    for (let i = 0; i < n; i++) {
      const a = rand(i, seed) * Math.PI * 2;
      const sp = 3 + rand(i, seed + 1) * 9;
      const d = sp * tt * (1 - tt / 90);
      const x = w / 2 + Math.cos(a) * d * 1.6 + (rand(i, seed + 2) - 0.5) * 600;
      const y = LOGO_CY + Math.sin(a) * d * 0.8 + tt * tt * 0.04;
      const al = 1 - tt / 40;
      ctx.fillStyle = i % 3 === 0 ? `rgba(255,209,102,${al})` : i % 3 === 1 ? `rgba(255,243,220,${al})` : `rgba(242,165,65,${al})`;
      const sz = i % 7 === 0 ? 4 : 2;
      ctx.fillRect(Math.round(x), Math.round(y), sz, sz);
      if (i % 9 === 0 && tt < 30) {
        // 4-point star sparkle
        ctx.fillRect(Math.round(x) - 4, Math.round(y) + 1, 10, 1);
        ctx.fillRect(Math.round(x) + 1, Math.round(y) - 4, 1, 10);
      }
    }
  };
  burst(L_HIT, 220, 11);
  burst(L_STING, 160, 21);
  // gentle twinkles on the logo, forever
  for (let i = 0; i < 4; i++) {
    const cyc = 40;
    const tt = (f + i * 11) % cyc;
    if (tt > 12) continue;
    const k = Math.floor((f + i * 11) / cyc);
    const x = w / 2 + (rand(k, i, 1) - 0.5) * L.c.width * 0.9;
    const y = LOGO_CY + (rand(k, i, 2) - 0.5) * FS * 0.8;
    const r = Math.round(Math.sin((tt / 12) * Math.PI) * 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x) - r, Math.round(y), r * 2 + 1, 1);
    ctx.fillRect(Math.round(x), Math.round(y) - r, 1, r * 2 + 1);
  }
};

let shimmerBuf: HTMLCanvasElement | null = null;
function shimmerCanvas(src: HTMLCanvasElement, p: number, width: number, alpha: number) {
  if (!shimmerBuf) shimmerBuf = document.createElement('canvas');
  const c = shimmerBuf;
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  const x = lerp(-width * 2, c.width + width, p);
  const g = ctx.createLinearGradient(x, 0, x + width, c.height * 0.4);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

// ------------------------------------------------------------ world canvas (scale 4)
const silCache = new Map<string, HTMLCanvasElement>();
function silhouette(key: string, color: string) {
  const id = `${key}|${color}`;
  let c = silCache.get(id);
  if (c) return c;
  const src = prop(key);
  c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  silCache.set(id, c);
  return c;
}

const GROUND = 236;
const FAR = ['school', 'house-b', 'tree', 'library-front', 'house-a', 'tree-small', 'clinic-front', 'house-b', 'tree', 'post-office-front'];
const NEAR = ['house-player', 'tree', 'streetlamp', 'kiosk', 'tree-small', 'streetlamp', 'store-front', 'tree', 'house-a', 'streetlamp', 'tree-small'];

const CAST_L = ['player', 'mom', 'dad', 'sibling', 'grandma', 'cashier', 'helper'];
const CAST_R = ['folk6', 'folk0', 'driver', 'folk2', 'folk5', 'folk3', 'folk7'];

function castState(f: number, i: number, fromLeft: boolean) {
  // slots: 14 spaced across the ground, centre-most filled first
  const SP = 31;
  const slot = fromLeft ? 6 - i : 7 + i;
  const tx = 240 + (slot - 6.5) * SP;
  const start = 26 + i * 6;
  const speed = 3.1;
  const sx = fromLeft ? -16 : 496;
  const dist = Math.abs(tx - sx);
  const t = Math.max(0, f - start);
  const travelled = Math.min(dist, t * speed);
  const x = fromLeft ? sx + travelled : sx - travelled;
  const walking = travelled < dist && f >= start;
  const arrivedAt = start + dist / speed;
  return { x, walking, arrivedAt, visible: f >= start };
}

const drawWorld = (ctx: CanvasRenderingContext2D, { w, h, frame: f }: DrawInfo) => {
  // golden-hour sky in pixel bands with a dither between bands
  const bands = ['#241d4a', '#33235a', '#4a2a68', '#6b3270', '#8e3d72', '#b44f72', '#d4646c', '#e97f5f', '#f29e57', '#f7bb5e', '#fbd77a', '#ffe9a6'];
  const bh = GROUND / bands.length;
  for (let i = 0; i < bands.length; i++) {
    ctx.fillStyle = bands[i];
    ctx.fillRect(0, Math.floor(i * bh), w, Math.ceil(bh) + 1);
    if (i + 1 < bands.length) {
      ctx.fillStyle = bands[i + 1];
      const y = Math.floor((i + 1) * bh) - 2;
      for (let x = (i % 2) * 2; x < w; x += 4) ctx.fillRect(x, y, 2, 1);
      for (let x = ((i + 1) % 2) * 2 + 1; x < w; x += 4) ctx.fillRect(x, y + 1, 2, 1);
    }
  }
  // stars fading in the top
  for (let i = 0; i < 40; i++) {
    const tw = 0.3 + 0.7 * Math.abs(Math.sin(f * 0.06 + i * 2.1));
    ctx.fillStyle = `rgba(255,243,220,${tw * 0.6})`;
    ctx.fillRect(Math.floor(rand(i, 61) * w), Math.floor(rand(i, 62) * 50), 1, 1);
  }
  // sun
  const sunX = 372;
  const sunY = 172;
  glow(ctx, sunX, sunY, 150, '#ffb347', 0.45);
  glow(ctx, sunX, sunY, 60, '#fff1c0', 0.6);
  ctx.fillStyle = '#ffe9a6';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff6d6';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 24, 0, Math.PI * 2);
  ctx.fill();
  // sun stripes (retro)
  ctx.fillStyle = '#f7bb5e';
  for (let k = 0; k < 4; k++) ctx.fillRect(sunX - 32, sunY + 8 + k * 6, 64, 1 + k);
  // pixel clouds drifting
  for (let i = 0; i < 7; i++) {
    const cw = 30 + rand(i, 71) * 40;
    const x = ((rand(i, 72) * (w + 120) + f * (0.08 + rand(i, 73) * 0.12)) % (w + 120)) - 60;
    const y = 20 + rand(i, 74) * 110;
    pixelCloud(ctx, Math.round(x), Math.round(y), Math.round(cw), y < 70 ? '#c46a8a' : '#f6b38a', y < 70 ? '#8e4a7a' : '#d9806e');
  }
  // far skyline
  let x = -20;
  FAR.forEach((k, i) => {
    const s = silhouette(k, '#7a3a6a');
    ctx.drawImage(s, Math.round(x), GROUND - s.height - 4);
    x += s.width - 6 + rand(i, 81) * 8;
  });
  // near skyline with lit windows and lamps
  x = -30;
  NEAR.forEach((k, i) => {
    const s = silhouette(k, '#2a1838');
    const y = GROUND - s.height + 2;
    ctx.drawImage(s, Math.round(x), y);
    if (k === 'streetlamp') {
      glow(ctx, x + 4, y + 4, 22, '#ffd166', 0.55 + 0.1 * Math.sin(f * 0.2 + i));
      ctx.fillStyle = '#ffe9a6';
      ctx.fillRect(Math.round(x) + 2, y + 3, 4, 3);
    } else if (!k.startsWith('tree')) {
      for (let j = 0; j < 5; j++) {
        if (rand(i, j, 91) < 0.35) continue;
        const wx = Math.round(x + 10 + rand(i, j, 92) * (s.width - 24));
        const wy = Math.round(y + s.height * 0.45 + rand(i, j, 93) * s.height * 0.35);
        ctx.fillStyle = '#ffd98a';
        ctx.fillRect(wx, wy, 4, 5);
        glow(ctx, wx + 2, wy + 2, 8, '#ffc56b', 0.25);
      }
    }
    x += s.width + 8 + rand(i, 82) * 14;
  });
  // ground
  ctx.fillStyle = '#1e1230';
  ctx.fillRect(0, GROUND, w, h - GROUND);
  ctx.fillStyle = '#5a2e52';
  ctx.fillRect(0, GROUND, w, 1);
  ctx.fillStyle = '#3a1f44';
  for (let gx = 0; gx < w; gx += 6) ctx.fillRect(gx, GROUND + 9, 3, 1);
  // warm light pool on the ground
  glow(ctx, w / 2, GROUND + 18, 200, '#ffb35c', 0.18);
  // the cast walks in from both sides, stops, faces camera
  const people: { who: string; x: number; dir: Dir; walking: boolean; bob: number; step: number }[] = [];
  const add = (list: string[], fromLeft: boolean) =>
    list.forEach((who, i) => {
      const st = castState(f, i, fromLeft);
      if (!st.visible) return;
      const turned = f > st.arrivedAt + 2;
      const dir: Dir = st.walking || !turned ? (fromLeft ? 'right' : 'left') : 'down';
      const hop = f >= L_STING && f < L_STING + 16 ? Math.round(-Math.sin(((f - L_STING - i * 0.7) / 16) * Math.PI) * 6) : 0;
      const idle = !st.walking ? Math.round(Math.sin(f * 0.15 + i * 1.3) * 0.6) : 0;
      people.push({ who, x: st.x, dir, walking: st.walking, bob: Math.min(0, hop) + idle, step: f / 5 + i });
    });
  add(CAST_L, true);
  add(CAST_R, false);
  for (const p of people) {
    glow(ctx, p.x, GROUND + 10, 14, '#ffcf8a', 0.15);
    drawChar(ctx, p.who, Math.round(p.x), GROUND + 24 + p.bob, p.dir, p.step, p.walking, 1);
  }
};

function pixelCloud(ctx: CanvasRenderingContext2D, x: number, y: number, cw: number, light: string, dark: string) {
  ctx.fillStyle = dark;
  ctx.fillRect(x + 2, y + 6, cw - 4, 4);
  ctx.fillStyle = light;
  ctx.fillRect(x, y + 4, cw, 4);
  ctx.fillRect(x + Math.round(cw * 0.18), y, Math.round(cw * 0.4), 5);
  ctx.fillRect(x + Math.round(cw * 0.5), y + 1, Math.round(cw * 0.3), 4);
  ctx.fillRect(x + Math.round(cw * 0.25), y - 2, Math.round(cw * 0.2), 3);
}

// ------------------------------------------------------------ HTML overlays
const Tagline: React.FC = () => {
  const f = useCurrentFrame();
  const words = ['Real', 'life.', 'Your', 'rules.'];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 452, textAlign: 'center', fontFamily: BODY, fontWeight: 700, fontSize: 70, color: '#fff3dc', letterSpacing: 2, textShadow: '0 4px 0 rgba(27,19,56,.55), 0 0 40px rgba(36,20,60,.75)' }}>
      {words.map((wd, i) => {
        const st = L_TAG + (i < 2 ? i * 4 : 14 + (i - 2) * 4);
        const p = prog(f, st, st + 10, EASE.out);
        return (
          <span key={i} style={{ display: 'inline-block', margin: '0 12px', opacity: p, transform: `translateY(${(1 - p) * 26}px)`, filter: `blur(${(1 - p) * 8}px)`, color: i >= 2 ? '#ffd166' : undefined }}>
            {wd}
          </span>
        );
      })}
    </div>
  );
};

const CTA: React.FC = () => {
  const f = useCurrentFrame();
  const pop = prog(f, L_CTA, L_CTA + 10, EASE.back);
  const url = 'ekupekuai.github.io/lifequest';
  const typed = Math.round(url.length * prog(f, L_CTA + 6, L_CTA + 26, (t) => t));
  const info = prog(f, L_CTA + 16, L_CTA + 28, EASE.out);
  const glint = prog(f, L_STING + 2, L_STING + 18, EASE.inOut);
  const pulse = 1 + 0.02 * Math.sin(f * 0.21);
  const tags = ['IN', 'US', 'UK', 'EU', 'NG', 'JP', 'BR', 'MX'];
  return (
    <>
      <div style={{ position: 'absolute', left: 960, top: 612, transform: `translate(-50%,-50%) scale(${pop * (f > L_CTA + 12 ? pulse : 1)})`, opacity: pop > 0 ? 1 : 0 }}>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            padding: '24px 40px',
            background: UI.orange,
            color: UI.ink,
            border: `5px solid ${UI.ink}`,
            boxShadow: `inset -6px -6px 0 rgba(0,0,0,.28), inset 6px 6px 0 rgba(255,255,255,.3), 8px 8px 0 rgba(5,6,16,.7), 0 0 50px rgba(255,190,90,.55)`,
            fontFamily: PIXEL,
            fontSize: 30,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 0, height: 0, borderTop: '14px solid transparent', borderBottom: '14px solid transparent', borderLeft: `22px solid ${UI.ink}` }} />
          PLAY FREE IN YOUR BROWSER
          <div style={{ position: 'absolute', top: -30, bottom: -30, width: 90, left: `${-15 + glint * 130}%`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.85), transparent)', transform: 'skewX(-20deg)' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 690, textAlign: 'center', fontFamily: PIXEL, fontSize: 28, color: '#fff3dc', textShadow: '4px 4px 0 #1b1f3b', opacity: pop > 0 ? 1 : 0, whiteSpace: 'pre' }}>
        {url.slice(0, typed)}
        <span style={{ opacity: typed < url.length || Math.floor(f / 8) % 2 ? 1 : 0, color: UI.gold }}>_</span>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 752, textAlign: 'center', fontFamily: BODY, fontWeight: 700, fontSize: 34, color: '#ffe6c4', opacity: info, transform: `translateY(${(1 - info) * 16}px)`, textShadow: '0 3px 14px rgba(20,10,40,.9)' }}>
        8 missions · 8 countries · every voice
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 812, display: 'flex', justifyContent: 'center', gap: 14 }}>
        {tags.map((t, i) => {
          const p = prog(f, L_CTA + 22 + i * 2.5, L_CTA + 30 + i * 2.5, EASE.back);
          const hop = f >= L_STING ? Math.max(0, Math.sin(((f - L_STING - i * 2) / 10) * Math.PI)) * (f - L_STING - i * 2 < 10 ? 8 : 0) : 0;
          return (
            <span
              key={t}
              style={{
                fontFamily: PIXEL,
                fontSize: 18,
                color: UI.gold,
                background: 'rgba(25,29,61,.92)',
                border: `3px solid ${UI.ink}`,
                boxShadow: `inset 0 0 0 2px ${UI.frame}`,
                padding: '9px 12px',
                transform: `scale(${p}) translateY(${-hop}px)`,
                opacity: p > 0 ? 1 : 0,
              }}
            >
              {t}
            </span>
          );
        })}
      </div>
    </>
  );
};

export default function S10() {
  const f = useCurrentFrame();
  const push = 1 + 0.012 * prog(f, L_HIT, L_STING, EASE.inOut) + 0.035 * prog(f, L_STING, 240, EASE.out);
  const shake = f >= L_HIT && f < L_HIT + 12 ? (1 - (f - L_HIT) / 12) * 16 : 0;
  const sx = (rand(f, 101) - 0.5) * shake * 2;
  const sy = (rand(f, 102) - 0.5) * shake * 2;
  const white = Math.max(
    interpolate(f, [0, 7], [1, 0], { extrapolateRight: 'clamp' }),
    interpolate(f, [L_HIT, L_HIT + 1, L_HIT + 8], [0, 0.85, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(f, [L_STING, L_STING + 1, L_STING + 6], [0, 0.35, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );
  // world dims slightly during particle assembly so the squares read
  const dim = interpolate(f, [0, L_HIT - 2, L_HIT + 10], [0.55, 0.45, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#241d4a', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${sx}px,${sy}px) scale(${push})`, transformOrigin: '50% 40%' }}>
        <PixelCanvas draw={drawWorld} />
        <AbsoluteFill style={{ background: '#120c26', opacity: dim }} />
        <PixelCanvas draw={drawLogo} scale={2} />
        <Tagline />
        <CTA />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#fff', opacity: white }} />
    </AbsoluteFill>
  );
}
