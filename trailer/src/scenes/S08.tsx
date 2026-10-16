// S08 · abs 1140–1320 · EVERY CHOICE COUNTS — the slow-mo breakdown, then the world carousel.
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { PixelCanvas, rand, glow, prog, EASE, clamp, lerp, type DrawInfo } from '../lib/stage';
import { drawChar, portrait, fx, drawIcon } from '../lib/art';
import { SlamText, COLORS } from '../lib/type';
import { CUES, SCENES } from '../timeline';
import { UI, Sprite, Keycap, PIXEL, BODY } from './C_kit';

const FROM = SCENES[7].from; // 1140
const L_LINE = CUES.narratorLine1 - FROM; // 10
const L_SLAM = CUES.choiceSlam - FROM; // 60
const L_PULL = 104; // camera pulls back to the world ring
const END = SCENES[7].duration; // 180

const CHOICES = [
  { n: '1', t: 'Ask for help', c: UI.mint },
  { n: '2', t: 'Wait your turn', c: UI.orange },
  { n: '3', t: 'Go back home', c: UI.coral },
  { n: '4', t: 'Say sorry', c: UI.sky },
];

const WORLD = [
  { tag: 'IN', cur: '₹', who: 'mom', wall: '#f2a541' },
  { tag: 'US', cur: '$', who: 'folk0', wall: '#2e86ab' },
  { tag: 'UK', cur: '£', who: 'folk7', wall: '#8e5ea2' },
  { tag: 'EU', cur: '€', who: 'folk2', wall: '#3bb273' },
  { tag: 'NG', cur: '₦', who: 'helper', wall: '#e4572e' },
  { tag: 'JP', cur: '¥', who: 'folk6', wall: '#f28ab2' },
  { tag: 'BR', cur: 'R$', who: 'folk3', wall: '#ffd166' },
  { tag: 'MX', cur: '$', who: 'cashier', wall: '#c2453a' },
];

// zoom of the pixel world: slow push-in, then pull back for the ring
const zoomAt = (f: number) => {
  const push = 1 + 0.06 * prog(f, 0, L_SLAM, EASE.inOut);
  const pull = prog(f, L_PULL, L_PULL + 26, EASE.inOut);
  return lerp(push, 0.72, pull);
};

// --------------- background canvas: navy void, spotlight, dust ---------------
const drawBg = (ctx: CanvasRenderingContext2D, { w, h, frame: f }: DrawInfo) => {
  const g = ctx.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, w * 0.7);
  g.addColorStop(0, '#232a5c');
  g.addColorStop(0.55, '#141838');
  g.addColorStop(1, '#07081a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const z = zoomAt(f);
  const cx = w / 2;
  const floorY = h / 2 + 34 * z;
  // pixel floor grid fading into darkness (perspective lines)
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#4a5498';
  for (let i = -12; i <= 12; i++) {
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      const y = floorY + t * 90;
      const x = cx + i * (14 + t * 40) * z;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  for (let r = 0; r < 8; r++) {
    const y = Math.round(floorY + Math.pow(r / 8, 1.6) * 90);
    for (let x = 0; x < w; x += 2) ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
  // spotlight cone
  const spotA = 0.85 - 0.5 * prog(f, L_PULL, L_PULL + 30);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cone = ctx.createLinearGradient(0, 0, 0, floorY);
  cone.addColorStop(0, 'rgba(255,230,180,0)');
  cone.addColorStop(1, `rgba(255,220,160,${0.16 * spotA})`);
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(cx - 10, -10);
  ctx.lineTo(cx + 10, -10);
  ctx.lineTo(cx + 46 * z, floorY + 6);
  ctx.lineTo(cx - 46 * z, floorY + 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // pool of light on the floor
  ctx.save();
  ctx.globalAlpha = spotA;
  ctx.fillStyle = 'rgba(255,224,170,0.10)';
  ctx.beginPath();
  ctx.ellipse(cx, floorY, 50 * z, 12 * z, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,224,170,0.10)';
  ctx.beginPath();
  ctx.ellipse(cx, floorY, 32 * z, 7 * z, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  glow(ctx, cx, floorY - 20 * z, 90 * z, '#ffcf8a', 0.18 * spotA);
  // slow-mo dust motes
  for (let i = 0; i < 70; i++) {
    const sp = 0.05 + rand(i, 3) * 0.12;
    const x = (rand(i, 1) * (w + 20) + f * sp * (rand(i, 5) > 0.5 ? 1 : -1) + 2000) % (w + 20) - 10;
    const y = (rand(i, 2) * h - f * sp * 0.6 + 2000) % h;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(f * 0.05 + i));
    ctx.fillStyle = rand(i, 4) > 0.7 ? `rgba(255,209,102,${0.5 * tw})` : `rgba(180,190,255,${0.35 * tw})`;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
};

// --------------- foreground canvas: the player (transparent) ---------------
const drawFg = (ctx: CanvasRenderingContext2D, { w, h, frame: f }: DrawInfo) => {
  const z = zoomAt(f);
  const shake = f >= L_SLAM && f < L_SLAM + 14 ? (1 - (f - L_SLAM) / 14) * 4 : 0;
  const sx = shake ? Math.round((rand(f, 11) - 0.5) * shake * 2) : 0;
  const sy = shake ? Math.round((rand(f, 12) - 0.5) * shake * 2) : 0;
  // the player glances around: down → left → right → down (facing camera for the slam)
  let dir: 'down' | 'left' | 'right' = 'down';
  if (f > 18 && f < 32) dir = 'left';
  else if (f >= 32 && f < 46) dir = 'right';
  const scale = Math.max(1, Math.round(2 * z * 2) / 2);
  const breathe = Math.round(Math.sin(f * 0.12) * 0.6);
  const feetY = h / 2 + 34 * z;
  // rim light behind the player
  glow(ctx, w / 2 + sx, feetY - 24 * z + sy, 34 * z, '#ffe6b0', 0.22 + (f >= L_SLAM && f < L_SLAM + 10 ? 0.4 : 0));
  ctx.save();
  if (scale !== 2 * z) {
    ctx.translate(w / 2 + sx, feetY + sy);
    const k = (2 * z) / scale;
    ctx.scale(k, k);
    drawChar(ctx, 'player', 0, breathe, dir, 0, false, scale);
  } else drawChar(ctx, 'player', w / 2 + sx, feetY + sy + breathe, dir, 0, false, scale);
  ctx.restore();
  // a little "?" of doubt before the slam
  if (f > 22 && f < 54) {
    const a = clamp((f - 22) / 6) * clamp((54 - f) / 6);
    drawIcon(ctx, fx('cloud'), w / 2 + 18 * z, feetY - 58 * z - Math.sin(f * 0.1) * 2, 1, a * 0.9);
  }
  if (f >= L_SLAM - 2 && f < L_SLAM + 12) drawIcon(ctx, fx('exclaim'), w / 2, feetY - 56 * z - (f - L_SLAM) * 0.5, 2, clamp((L_SLAM + 12 - f) / 6));
};

// ---------------------------------- cards -----------------------------------
const Cards: React.FC<{ layer: 'back' | 'front' }> = ({ layer }) => {
  const f = useCurrentFrame();
  if (f >= L_SLAM + 3) return null;
  const snap = prog(f, L_SLAM - 9, L_SLAM, EASE.in);
  const appear = prog(f, 0, 14, EASE.out);
  return (
    <AbsoluteFill style={{ perspective: 1400 }}>
      {CHOICES.map((c, i) => {
        const a = (i * Math.PI) / 2 + 0.6 + f * 0.016;
        const depth = Math.sin(a);
        if ((layer === 'front') !== depth > 0) return null;
        const rx = 640 * (0.7 + 0.3 * appear);
        const x0 = 960 + Math.cos(a) * rx;
        const y0 = 500 + depth * 190 + Math.sin(f * 0.07 + i * 1.7) * 12;
        const x = lerp(x0, 960, snap);
        const y = lerp(y0, 520, snap);
        const s = (0.78 + 0.24 * depth) * (1 - snap * 0.85) * (0.6 + 0.4 * appear);
        const op = (0.55 + 0.45 * (depth + 1) * 0.5) * appear * (1 - clamp((f - L_SLAM + 1) / 3));
        const blur = depth < 0 ? -depth * 2.4 : 0;
        const flash = f >= L_SLAM - 3 ? 1 : 0;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: `translate(-50%,-50%) rotateY(${-Math.cos(a) * 26 * (1 - snap)}deg) rotateZ(${Math.sin(f * 0.05 + i) * 2 + snap * 25 * (i % 2 ? 1 : -1)}deg) scale(${s})`,
              opacity: op,
              filter: `blur(${blur}px) brightness(${1 + flash * 1.8})`,
              display: 'flex',
              alignItems: 'center',
              gap: 22,
              padding: '18px 30px 18px 22px',
              minWidth: 430,
              background: UI.panel2,
              border: `4px solid ${UI.ink}`,
              boxShadow: `inset 8px 0 0 ${c.c}, inset 0 0 0 4px ${UI.frame}, 8px 8px 0 rgba(5,6,16,.75), 0 0 ${40 + flash * 60}px rgba(255,209,102,${0.12 + flash * 0.6})`,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 4 }} />
            <Keycap n={c.n} size={24} />
            <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 44, color: UI.text, letterSpacing: 0.5 }}>{c.t}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ------------------------------ world carousel ------------------------------
const ring = (f: number, i: number) => {
  const t = f - L_PULL;
  const grow = prog(f, L_PULL + 4, L_PULL + 30, EASE.out);
  const spin = 0.3 + t * 0.012 + Math.pow(Math.max(0, t), 2) * 0.00045;
  const a = (i / WORLD.length) * Math.PI * 2 + spin;
  const depth = Math.sin(a);
  const rush = prog(f, END - 12, END, EASE.in);
  return {
    x: 960 + Math.cos(a) * 720 * grow * (1 + rush * 0.4),
    y: 530 + depth * 205 * grow - 30,
    depth,
    s: (0.5 + 0.38 * (depth + 1) * 0.5) * (0.3 + 0.7 * grow) * (1 + rush * 0.7),
    a,
  };
};

const Carousel: React.FC<{ layer: 'back' | 'front' }> = ({ layer }) => {
  const f = useCurrentFrame();
  if (f < L_PULL + 4) return null;
  const fadeIn = prog(f, L_PULL + 4, L_PULL + 16, EASE.out);
  return (
    <AbsoluteFill style={{ zIndex: 0 }}>
      {WORLD.map((r, i) => {
        const p = ring(f, i);
        if ((layer === 'front') !== p.depth > 0) return null;
        const pop = prog(f, L_PULL + 18 + i * 5, L_PULL + 26 + i * 5, EASE.back);
        const shade = 0.55 + 0.45 * (p.depth + 1) * 0.5;
        return (
          <div
            key={r.tag}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              transform: `translate(-50%,-50%) scale(${p.s}) rotateZ(${Math.sin(f * 0.06 + i) * 2}deg)`,
              opacity: fadeIn,
              filter: `brightness(${shade}) blur(${p.depth < 0 ? -p.depth * 1.8 : 0}px)`,
              zIndex: Math.round(p.depth * 100) + 200,
            }}
          >
            {/* currency coin popping above */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: -78,
                transform: `translate(-50%,0) scale(${pop}) translateY(${Math.sin(f * 0.12 + i) * 6}px)`,
                width: 96,
                height: 96,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 30%, #fff2b8 0 18%, #ffd166 19% 62%, #c27a1c 63%)',
                border: `5px solid ${UI.ink}`,
                display: 'grid',
                placeItems: 'center',
                fontFamily: BODY,
                fontWeight: 900,
                fontSize: r.cur.length > 1 ? 40 : 54,
                color: UI.ink,
                boxShadow: '0 0 30px rgba(255,209,102,.7)',
                zIndex: 2,
              }}
            >
              {r.cur}
            </div>
            <div style={{ width: 230, padding: 8, background: UI.panel2, border: `5px solid ${UI.ink}`, boxShadow: `inset 0 0 0 5px ${UI.frame}, 10px 10px 0 rgba(5,6,16,.75)` }}>
              <div
                style={{
                  height: 200,
                  margin: 5,
                  background: `linear-gradient(180deg, ${r.wall} 0 62%, #6b4a3a 62% 100%)`,
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  border: `4px solid ${UI.ink}`,
                }}
              >
                {/* window with warm light */}
                <div style={{ position: 'absolute', left: 16, top: 16, width: 46, height: 40, background: '#ffe9a8', border: `4px solid ${UI.ink}`, boxShadow: '0 0 24px #ffe9a8' }} />
                <div style={{ position: 'absolute', right: 18, top: 22, width: 30, height: 30, background: '#fff3dc', border: `4px solid ${UI.ink}` }} />
                <Sprite src={() => portrait(r.who, 32)} id={r.who} scale={5} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 0 6px' }}>
                <span style={{ fontFamily: PIXEL, fontSize: 30, color: UI.gold }}>{r.tag}</span>
              </div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// sparkles + light streaks over the carousel (pixel canvas, transparent)
const drawSpark = (ctx: CanvasRenderingContext2D, { w, h, frame: f }: DrawInfo) => {
  if (f < L_PULL + 18) return;
  for (let i = 0; i < WORLD.length; i++) {
    const t = f - (L_PULL + 22 + i * 5);
    if (t < 0 || t > 14) continue;
    const p = ring(f, i);
    const x = p.x / 4;
    const y = (p.y - 70 * p.s) / 4;
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2 + i;
      const d = 4 + t * 2.2;
      ctx.fillStyle = k % 2 ? '#ffd166' : '#fff3dc';
      const sz = t < 8 ? 2 : 1;
      ctx.fillRect(Math.round(x + Math.cos(ang) * d), Math.round(y + Math.sin(ang) * d), sz, sz);
    }
  }
  // tension: streaks rushing to centre near the end
  const rush = prog(f, END - 40, END, EASE.in);
  if (rush > 0) {
    for (let i = 0; i < 60; i++) {
      const ang = rand(i, 41) * Math.PI * 2;
      const d = ((1 - ((f * (0.02 + rand(i, 42) * 0.03)) % 1)) * w) / 1.4;
      const x = w / 2 + Math.cos(ang) * d;
      const y = h / 2 + Math.sin(ang) * d * 0.6;
      ctx.strokeStyle = `rgba(255,236,190,${0.5 * rush})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * 10 * rush, y + Math.sin(ang) * 6 * rush);
      ctx.stroke();
    }
    glow(ctx, w / 2, h / 2, 160, '#fff1d0', 0.35 * rush);
  }
};

const NarratorLine: React.FC = () => {
  const f = useCurrentFrame();
  const a = interpolate(f, [L_LINE, L_LINE + 14, L_SLAM - 8, L_SLAM - 2], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ls = interpolate(f, [L_LINE, L_SLAM], [10, 3], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 828, textAlign: 'center', fontFamily: BODY, fontWeight: 400, fontSize: 46, letterSpacing: ls, color: COLORS.cream, opacity: a, textShadow: '0 4px 30px rgba(0,0,0,.8)' }}>
      Real life doesn’t come with a tutorial.
    </div>
  );
};

const Slam: React.FC = () => {
  const f = useCurrentFrame();
  if (f < L_SLAM - 1 || f > L_PULL + 16) return null;
  const amp = f < L_SLAM + 16 ? (1 - (f - L_SLAM) / 16) * 26 : 0;
  const sx = (rand(f, 21) - 0.5) * amp * 2;
  const sy = (rand(f, 22) - 0.5) * amp * 2;
  const out = prog(f, L_PULL, L_PULL + 14, EASE.in);
  const breathe = 1 + 0.03 * prog(f, L_SLAM + 10, L_PULL, EASE.out);
  return (
    <AbsoluteFill style={{ transform: `translate(${sx}px,${sy}px) scale(${breathe * (1 + out * 2.4)})`, opacity: 1 - out, filter: `blur(${out * 6}px)` }}>
      <SlamText text="EVERY CHOICE" start={L_SLAM} size={118} y="40%" stagger={1} />
      <SlamText text="COUNTS" start={L_SLAM + 7} size={200} y="60%" stagger={2} color={UI.gold} shadow={COLORS.coral} />
    </AbsoluteFill>
  );
};

const Flashes: React.FC = () => {
  const f = useCurrentFrame();
  const slam = interpolate(f, [L_SLAM - 2, L_SLAM, L_SLAM + 8], [0, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const end = interpolate(f, [END - 9, END - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.in });
  // darken behind the slam text for legibility
  const dim = interpolate(f, [L_SLAM, L_SLAM + 4, L_PULL, L_PULL + 10], [0, 0.45, 0.45, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(7,8,26,.2) 20%, rgba(7,8,26,.9) 80%)', opacity: dim }} />
      <AbsoluteFill style={{ background: '#fff', opacity: Math.max(slam, end) }} />
    </>
  );
};

export default function S08() {
  return (
    <AbsoluteFill style={{ background: '#07081a' }}>
      <PixelCanvas draw={drawBg} />
      <Cards layer="back" />
      <Carousel layer="back" />
      <PixelCanvas draw={drawFg} />
      <Cards layer="front" />
      <Carousel layer="front" />
      <PixelCanvas draw={drawSpark} />
      <NarratorLine />
      <Slam />
      <Flashes />
    </AbsoluteFill>
  );
}
