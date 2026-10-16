// S09 · abs 1320–1560 · PAYOFF — results screen on the drop, family dinner, mission montage.
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { PixelCanvas, rand, glow, grade, prog, EASE, clamp, lerp, camera, type DrawInfo } from '../lib/stage';
import { drawChar, drawPropAt, fx, drawIcon, item, fillTiles, drawMap, type Dir } from '../lib/art';
import { CUES, SCENES } from '../timeline';
import { UI, Sprite, panelStyle, PIXEL, BODY } from './C_kit';

const FROM = SCENES[8].from; // 1320
const DUR = SCENES[8].duration; // 240
const B_START = 75; // cut to dinner on the beat (abs 1395)
const C_START = 165; // montage (abs 1485, on the beat)
const L_GRAN = CUES.grandmaLine - FROM; // 120

// =============================== (a) RESULTS ===============================
const SCORES: [string, number][] = [
  ['Task accuracy', 95],
  ['Budget', 88],
  ['Time', 82],
  ['Planning', 90],
  ['Communication', 96],
  ['Problem-solving', 86],
  ['Responsibility', 98],
];

const drawResultsBg = (ctx: CanvasRenderingContext2D, { w, h, frame: f }: DrawInfo) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a1f4e');
  g.addColorStop(0.55, '#7a3b5e');
  g.addColorStop(1, '#f2a541');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // rotating god-rays from behind the panel
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(w / 2, h / 2);
  ctx.rotate(f * 0.006);
  for (let i = 0; i < 14; i++) {
    ctx.rotate((Math.PI * 2) / 14);
    ctx.fillStyle = 'rgba(255,209,102,0.06)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(320, -26);
    ctx.lineTo(320, 26);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // bokeh
  for (let i = 0; i < 26; i++) {
    const x = (rand(i, 1) * w + f * (0.1 + rand(i, 2) * 0.3)) % w;
    const y = h * (0.2 + rand(i, 3) * 0.8) - f * 0.15;
    glow(ctx, x, y, 6 + rand(i, 4) * 14, i % 3 ? '#ffd166' : '#f28ab2', 0.25);
  }
  confetti(ctx, w, h, f, 0, 90);
};

/** Tiny pixel-square confetti falling from the top (identity transform). */
function confetti(ctx: CanvasRenderingContext2D, w: number, h: number, f: number, seed: number, n: number) {
  const cols = ['#f2a541', '#3bb273', '#e4572e', '#2e86ab', '#ffd166', '#f28ab2', '#fff3dc'];
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < n; i++) {
    const sp = 0.6 + rand(i, seed, 1) * 1.2;
    const x0 = rand(i, seed, 2) * w;
    const y = ((rand(i, seed, 3) * (h + 40) + f * sp) % (h + 40)) - 20;
    const x = x0 + Math.sin(f * 0.08 + i) * 4;
    ctx.fillStyle = cols[i % cols.length];
    const flip = Math.sin(f * 0.25 + i * 1.3) > 0;
    ctx.fillRect(Math.round(x), Math.round(y), flip ? 2 : 1, flip ? 1 : 2);
  }
  ctx.restore();
}

const Radar: React.FC<{ f: number }> = ({ f }) => {
  const S = 520;
  const c = S / 2;
  const R = 138;
  const n = SCORES.length;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;
  };
  const vp = (i: number) => prog(f, 12 + i * 4.5, 19 + i * 4.5, EASE.back);
  const poly = (r: (i: number) => number) => SCORES.map((_, i) => pt(i, r(i)).join(',')).join(' ');
  const gridA = prog(f, 4, 14, EASE.out);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} style={{ overflow: 'visible' }}>
      <g opacity={gridA}>
        {[0.25, 0.5, 0.75, 1].map((k) => (
          <polygon key={k} points={poly(() => R * k * gridA)} fill={k === 1 ? 'rgba(11,13,31,0.6)' : 'none'} stroke="#4a5498" strokeWidth={k === 1 ? 4 : 2} strokeDasharray={k === 1 ? undefined : '4 6'} />
        ))}
        {SCORES.map((_, i) => {
          const [x, y] = pt(i, R * gridA);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#4a5498" strokeWidth={2} />;
        })}
      </g>
      <polygon points={poly((i) => (R * SCORES[i][1] * vp(i)) / 100)} fill="rgba(242,165,65,0.38)" stroke="#f2a541" strokeWidth={5} strokeLinejoin="miter" />
      {SCORES.map(([d, v], i) => {
        const p = vp(i);
        if (p <= 0) return null;
        const [x, y] = pt(i, (R * v * p) / 100);
        const s = 12 + (1 - clamp(p)) * 10;
        return <rect key={d} x={x - s / 2} y={y - s / 2} width={s} height={s} fill="#ffd166" stroke="#0b0d1f" strokeWidth={3} />;
      })}
      {SCORES.map(([d, v], i) => {
        const [x, y] = pt(i, R + 34);
        const anchor = Math.abs(x - c) < 10 ? 'middle' : x > c ? 'start' : 'end';
        const a = prog(f, 12 + i * 4.5, 18 + i * 4.5);
        return (
          <text key={d} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" opacity={a} style={{ fontFamily: BODY, fontWeight: 700, fontSize: 26, fill: '#c9cbe6' }}>
            <tspan>{d}</tspan>
            <tspan dx={8} fill="#ffd166" style={{ fontFamily: PIXEL, fontSize: 20 }}>
              {Math.round(v * a)}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
};

const Results: React.FC = () => {
  const f = useCurrentFrame();
  const enter = prog(f, 0, 10, EASE.back);
  const exit = prog(f, B_START - 8, B_START, EASE.in);
  const shake = f < 8 ? (1 - f / 8) * 14 : 0;
  const sx = (rand(f, 31) - 0.5) * shake * 2;
  const sy = (rand(f, 32) - 0.5) * shake * 2;
  const score = Math.round(92 * prog(f, 6, 40, EASE.out));
  const xp = prog(f, 28, 52, EASE.inOut);
  const xpStep = Math.floor(xp * 12) / 12;
  const badge = prog(f, 46, 56, EASE.back);
  const shine = prog(f, 54, 68, EASE.inOut);
  const head = prog(f, 3, 12, EASE.back);
  return (
    <AbsoluteFill>
      <PixelCanvas draw={drawResultsBg} />
      <div
        style={{
          position: 'absolute',
          left: 960,
          top: 540,
          width: 1660,
          transform: `translate(-50%,-50%) translate(${sx}px,${sy - exit * 220}px) scale(${(0.7 + 0.3 * enter) * (1 - exit * 0.15)}) rotate(${(1 - enter) * -3}deg)`,
          opacity: 1 - exit,
          filter: `blur(${exit * 8}px)`,
          ...panelStyle(4),
        }}
      >
        {/* modal head */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px 26px 14px', borderBottom: `4px solid ${UI.ink}`, boxShadow: `0 4px 0 ${UI.frame}`, margin: '4px 4px 0' }}>
          <Sprite src={() => item('milk-tetra')} id="milk" scale={3} />
          <span style={{ fontFamily: PIXEL, fontSize: 26, color: UI.gold, flex: 1 }}>Grocery Run</span>
          <span style={{ fontFamily: PIXEL, fontSize: 16, color: UI.muted }}>RESULTS</span>
        </div>
        <div style={{ display: 'flex', padding: '26px 34px 34px', gap: 30, alignItems: 'center' }}>
          {/* left column */}
          <div style={{ width: 700, flex: 'none', display: 'flex', flexDirection: 'column', gap: 30 }}>
            <div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
              <div
                style={{
                  width: 190,
                  height: 190,
                  flex: 'none',
                  display: 'grid',
                  placeItems: 'center',
                  background: UI.ink,
                  border: `4px solid ${UI.ink}`,
                  boxShadow: `inset 0 0 0 7px ${UI.orange}, 0 0 ${30 + (score === 92 ? 30 : 0)}px rgba(242,165,65,.45)`,
                  position: 'relative',
                  fontFamily: PIXEL,
                  fontSize: 64,
                  color: UI.gold,
                }}
              >
                <span style={{ transform: `translateY(-10px) scale(${score === 92 ? 1 + 0.15 * (1 - prog(f, 40, 48)) : 1})` }}>{score}</span>
                <small style={{ position: 'absolute', bottom: 22, fontSize: 16, color: UI.muted }}>/ 100</small>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontFamily: PIXEL, fontSize: 46, color: UI.mint, transform: `scale(${0.3 + 0.7 * head})`, transformOrigin: 'left center', opacity: head > 0 ? 1 : 0, textShadow: `4px 4px 0 ${UI.ink}` }}>COMPLETED!</div>
                <div style={{ fontFamily: BODY, fontSize: 30, color: UI.muted, opacity: prog(f, 10, 18) }}>Great work. Here is how it went.</div>
              </div>
            </div>
            {/* XP bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: prog(f, 22, 28) }}>
              <span style={{ fontFamily: PIXEL, fontSize: 20, color: '#fff6e6', background: UI.orangeD, border: `4px solid ${UI.ink}`, padding: '10px 14px', boxShadow: `inset 0 0 0 2px ${UI.frame}` }}>+{Math.round(120 * xp)} XP</span>
              <div style={{ flex: 1, height: 34, background: UI.ink, border: `4px solid ${UI.ink}`, boxShadow: `inset 0 0 0 2px ${UI.frame}`, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${xpStep * 100}%`, background: UI.orange, boxShadow: 'inset 0 -6px 0 rgba(0,0,0,.25)' }} />
              </div>
              <span style={{ fontFamily: PIXEL, fontSize: 18, color: UI.gold }}>LV {xp >= 1 ? 4 : 3}</span>
            </div>
            {/* badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: badge > 0 ? 1 : 0 }}>
              <div
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 24px',
                  background: UI.gold,
                  color: UI.ink,
                  border: `4px solid ${UI.ink}`,
                  boxShadow: `6px 6px 0 rgba(5,6,16,.75), 0 0 ${50 * badge}px rgba(255,209,102,.8)`,
                  fontFamily: PIXEL,
                  fontSize: 30,
                  transform: `scale(${badge}) rotate(${(1 - badge) * -12}deg)`,
                  transformOrigin: 'left center',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: 36 }}>★</span> SMART SHOPPER
                <div style={{ position: 'absolute', top: -20, bottom: -20, width: 70, left: `${-20 + shine * 120}%`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent)', transform: 'skewX(-20deg)' }} />
              </div>
              <span style={{ fontFamily: PIXEL, fontSize: 16, color: UI.mint, opacity: prog(f, 52, 58), whiteSpace: 'nowrap' }}>BADGE UNLOCKED</span>
            </div>
          </div>
          {/* radar */}
          <div style={{ flex: 1, height: 500, display: 'flex', alignItems: 'center', paddingLeft: 190 }}>
            <Radar f={f} />
          </div>
        </div>
      </div>
      <PixelCanvas draw={drawBadgeBurst} />
    </AbsoluteFill>
  );
};

// sparkle burst around the badge (logical coords; badge sits around x≈150, y≈178 logical)
const drawBadgeBurst = (ctx: CanvasRenderingContext2D, { frame: f }: DrawInfo) => {
  const t = f - 47;
  if (t < 0 || t > 22) return;
  const cx = 116;
  const cy = 182;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand(i, 5) * 0.3;
    const d = 6 + t * (2 + rand(i, 6) * 2.5);
    const x = cx + Math.cos(a) * d * 1.4;
    const y = cy + Math.sin(a) * d * 0.8;
    if (t > 14 && i % 2) continue;
    if (i % 3 === 0 && d > 26) drawIcon(ctx, fx('sparkle'), x, y, 0.75, 1 - t / 22);
    else {
      ctx.fillStyle = i % 2 ? '#ffd166' : '#fff3dc';
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  }
};

// =============================== (b) DINNER ===============================
const FAMILY: { who: string; x: number; y: number; dir: Dir; ph: number }[] = [
  { who: 'dad', x: 142, y: 86, dir: 'down', ph: 0 },
  { who: 'grandma', x: 160, y: 86, dir: 'down', ph: 5 },
  { who: 'mom', x: 178, y: 86, dir: 'down', ph: 10 },
  { who: 'sibling', x: 118, y: 106, dir: 'right', ph: 3 },
  { who: 'player', x: 202, y: 106, dir: 'left', ph: 8 },
];

const dinnerCam = (d: number) => {
  const zoom = lerp(2.0, 2.35, prog(d, 0, 90, EASE.inOut)) + 0.05 * prog(d, L_GRAN - B_START - 4, L_GRAN - B_START + 10, EASE.out);
  const cx = 160 + 0 * d;
  const cy = lerp(78, 74, prog(d, 0, 90));
  return { zoom, cx, cy };
};

const ROOM = [
  '########################',
  '########################',
  '########################',
  '########################',
];

const drawDinner = (ctx: CanvasRenderingContext2D, { w, h, frame }: DrawInfo) => {
  const d = frame - B_START;
  const { zoom, cx, cy } = dinnerCam(d);
  const beatHit = d % 15 === 0 ? 1 : 0;
  camera(ctx, w, h, cx, cy, zoom, beatHit ? 1.2 : 0, frame);
  // floor + walls
  fillTiles(ctx, 'wood', 0, 64, 20, 8);
  fillTiles(ctx, 'rug', 112, 72, 6, 3);
  drawMap(ctx, ROOM, { '#': 'wall' }, 0, 0);
  // window with evening sky
  const wx = 90;
  ctx.fillStyle = '#2b1d45';
  ctx.fillRect(wx, 22, 30, 22);
  const sky = ctx.createLinearGradient(0, 22, 0, 44);
  sky.addColorStop(0, '#3a2a6a');
  sky.addColorStop(0.6, '#c2557a');
  sky.addColorStop(1, '#f2a541');
  ctx.fillStyle = sky;
  ctx.fillRect(wx + 2, 24, 26, 18);
  ctx.fillStyle = '#fff3dc';
  ctx.fillRect(wx + 20, 27, 2, 2); // first star
  ctx.fillStyle = '#5c4033';
  ctx.fillRect(wx + 14, 24, 2, 18);
  ctx.fillRect(wx + 2, 32, 26, 2);
  drawPropAt(ctx, 'picture', 160, 44);
  drawPropAt(ctx, 'wall-clock', 200, 38);
  drawPropAt(ctx, 'window', 232, 46);
  drawPropAt(ctx, 'lamp', 230, 84);
  drawPropAt(ctx, 'plant', 92, 84);
  drawPropAt(ctx, 'bookshelf-full', 250, 72);
  // family behind the table (back row first)
  const hop = (ph: number, big = 1) => Math.round(-Math.abs(Math.sin(((d + ph) * Math.PI) / 15)) * 4 * big);
  const granBig = d >= L_GRAN - B_START ? 1.6 : 1;
  for (const m of FAMILY.slice(0, 3)) drawChar(ctx, m.who, m.x, m.y + hop(m.ph, m.who === 'grandma' ? granBig : 1), m.dir, (d + m.ph) / 4, true, 1);
  // the table
  drawPropAt(ctx, 'table-set', 144, 112);
  drawPropAt(ctx, 'table-set', 176, 112);
  // steam from the food
  for (let i = 0; i < 3; i++) {
    const t = (d + i * 10) % 30;
    drawIcon(ctx, fx('steam'), 148 + i * 12, 92 - t * 0.5, 0.6, (1 - t / 30) * 0.7);
  }
  for (const m of FAMILY.slice(3)) drawChar(ctx, m.who, m.x, m.y + hop(m.ph), m.dir, (d + m.ph) / 4, true, 1);
  // warm evening light
  grade(ctx, w, h, '#ffd2a0', 0.4);
  ctx.save();
  glow(ctx, 230, 62, 50, '#ffc56b', 0.45);
  glow(ctx, 160, 96, 70, '#ffb35c', 0.3);
  if (d >= L_GRAN - B_START - 2) glow(ctx, 160, 72, 26 + Math.sin(d * 0.4) * 3, '#fff1c0', 0.55 * prog(d, L_GRAN - B_START - 2, L_GRAN - B_START + 6));
  ctx.restore();
  // pops above heads: hearts and music notes, on the beat
  FAMILY.forEach((m, i) => {
    for (let k = 0; k < 3; k++) {
      const start = (i * 7 + k * 30) % 90;
      const t = d - start;
      if (t < 0 || t > 22) continue;
      const key = (i + k) % 2 ? 'heart' : 'music';
      const s = t < 4 ? t / 4 : 1;
      drawIcon(ctx, fx(key), m.x + Math.sin(t * 0.3 + i) * 4, m.y - 30 - t * 0.8, 0.75 * s, 1 - clamp((t - 14) / 8));
    }
  });
  // vignette edges of the room
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  confetti(ctx, w, h, d, 9, 70);
};

const GrandmaBubble: React.FC = () => {
  const f = useCurrentFrame();
  const s = prog(f, L_GRAN, L_GRAN + 7, EASE.back);
  const out = prog(f, C_START - 6, C_START, EASE.in);
  if (f < L_GRAN) return null;
  const d = f - B_START;
  const { zoom, cx, cy } = dinnerCam(d);
  const x = ((160 - cx) * zoom + 240) * 4;
  const y = ((52 - cy) * zoom + 135) * 4;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%,-100%) scale(${s * (1 - out)})`,
        transformOrigin: '50% 100%',
        background: '#fff3dc',
        color: UI.ink,
        border: `5px solid ${UI.ink}`,
        boxShadow: `inset 0 -6px 0 #e9d9b8, 8px 8px 0 rgba(5,6,16,.6)`,
        padding: '18px 30px',
        fontFamily: BODY,
        fontWeight: 900,
        fontSize: 50,
        whiteSpace: 'nowrap',
      }}
    >
      You did it! Well done!
      <div style={{ position: 'absolute', left: '50%', bottom: -24, width: 26, height: 26, background: '#fff3dc', borderRight: `5px solid ${UI.ink}`, borderBottom: `5px solid ${UI.ink}`, transform: 'translateX(-50%) rotate(45deg)' }} />
    </div>
  );
};

// =============================== (c) MONTAGE ===============================
const MISSIONS = [
  { icon: 'milk-tetra', name: 'Grocery Run' },
  { icon: 'crayons', name: 'Help Sibling' },
  { icon: 'soup-bowl', name: 'Cook Dinner' },
  { icon: 'pink-shirt', name: 'Laundry' },
  { icon: 'bus-ticket', name: 'Bus Trip' },
  { icon: 'health-card', name: 'Clinic Visit' },
  { icon: 'library-book', name: 'Errands' },
  { icon: 'wrapper', name: 'Clean Room' },
];

const drawMontageBg = (ctx: CanvasRenderingContext2D, { w, h, frame }: DrawInfo) => {
  const m = frame - C_START;
  ctx.fillStyle = '#141838';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(m * 0.01);
  for (let i = 0; i < 16; i++) {
    ctx.rotate((Math.PI * 2) / 16);
    ctx.fillStyle = i % 2 ? '#1b2048' : '#20275a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(400, -80);
    ctx.lineTo(400, 80);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const pulse = 1 - (m % 15) / 15;
  glow(ctx, w / 2, h / 2, 170 + pulse * 20, '#f2a541', 0.18 + pulse * 0.12 + prog(m, 55, 72) * 0.6);
  // speed specks
  for (let i = 0; i < 50; i++) {
    const a = rand(i, 51) * Math.PI * 2;
    const dd = ((rand(i, 52) * 300 + m * (3 + rand(i, 53) * 4)) % 300) + 20;
    ctx.fillStyle = 'rgba(255,236,190,0.45)';
    ctx.fillRect(Math.round(w / 2 + Math.cos(a) * dd), Math.round(h / 2 + Math.sin(a) * dd * 0.6), 2, 1);
  }
};

const Montage: React.FC = () => {
  const f = useCurrentFrame();
  const m = f - C_START;
  const conv = prog(m, 56, 70, EASE.in);
  const pulse = 1 + 0.025 * Math.max(0, 1 - (m % 15) / 5);
  const flash = interpolate(m, [66, 74], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.in });
  const TW = 300;
  const TH = 250;
  const GAP = 40;
  return (
    <AbsoluteFill>
      <PixelCanvas draw={drawMontageBg} />
      <AbsoluteFill style={{ transform: `scale(${pulse})` }}>
        {MISSIONS.map((ms, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const gx = 960 - (4 * TW + 3 * GAP) / 2 + col * (TW + GAP) + TW / 2;
          const gy = 540 - (2 * TH + GAP) / 2 + row * (TH + GAP) + TH / 2;
          const t0 = i * 7.5;
          const p = prog(m, t0, t0 + 8, EASE.back);
          if (m < t0) return null;
          const side = i % 4;
          const fromX = side === 0 ? -900 : side === 1 ? 0 : side === 2 ? 900 : 0;
          const fromY = side === 1 ? -700 : side === 3 ? 700 : 0;
          const x = lerp(gx + fromX * (1 - p), 960, conv);
          const y = lerp(gy + fromY * (1 - p), 540, conv);
          const land = Math.max(0, 1 - (m - t0 - 6) / 6);
          const s = (0.5 + 0.5 * p) * (1 - conv * 0.75);
          const rot = (1 - p) * (i % 2 ? 20 : -20) + conv * (i % 2 ? 140 : -140);
          return (
            <div
              key={ms.icon}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: TW,
                height: TH,
                transform: `translate(-50%,-50%) scale(${s}) rotate(${rot}deg)`,
                ...panelStyle(4),
                boxShadow: `inset 0 0 0 4px ${land > 0.05 ? UI.gold : UI.frame}, 8px 8px 0 rgba(5,6,16,.75), 0 0 ${60 * land}px rgba(255,209,102,.9)`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 18,
                filter: `brightness(${1 + land * 0.8})`,
              }}
            >
              <span style={{ position: 'absolute', top: 14, left: 16, fontFamily: PIXEL, fontSize: 16, color: UI.orange }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ position: 'absolute', top: 12, right: 16, fontFamily: PIXEL, fontSize: 18, color: UI.mint, opacity: prog(m, t0 + 6, t0 + 10) }}>✓</span>
              <Sprite src={() => item(ms.icon)} id={ms.icon} scale={7} style={{ transform: `translateY(${Math.sin((m + i * 4) * 0.25) * 4}px)` }} />
              <span style={{ fontFamily: BODY, fontWeight: 900, fontSize: 34, color: UI.text }}>{ms.name}</span>
            </div>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
    </AbsoluteFill>
  );
};

// ================================ scene ================================
export default function S09() {
  const f = useCurrentFrame();
  const cutFlash = (at: number) => interpolate(f, [at, at + 6], [0.85, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * (f >= at ? 1 : 0);
  return (
    <AbsoluteFill style={{ background: '#141838' }}>
      {f < B_START && <Results />}
      {f >= B_START && f < C_START && (
        <AbsoluteFill>
          <PixelCanvas draw={drawDinner} />
          <GrandmaBubble />
        </AbsoluteFill>
      )}
      {f >= C_START && <Montage />}
      {/* drop impact: white → scene; plus quick flashes on the cuts */}
      <AbsoluteFill style={{ background: '#fff', opacity: Math.max(interpolate(f, [0, 8], [1, 0], { extrapolateRight: 'clamp' }), cutFlash(B_START), cutFlash(C_START)) }} />
    </AbsoluteFill>
  );
}
