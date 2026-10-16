// Shared helpers for scenes S08–S10: game-UI look (navy pixel panels, keycaps) and
// a tiny component that shows any of the game's procedural sprites as a crisp element.
import { useLayoutEffect, useRef } from 'react';
import { PIXEL, BODY } from '../lib/type';

export const UI = {
  ink: '#0b0d1f',
  navy: '#1b1f3b',
  panel: '#191d3d',
  panel2: '#242a55',
  panel3: '#2f3670',
  frame: '#4a5498',
  text: '#f4ecdc',
  muted: '#a9acc9',
  orange: '#f2a541',
  orangeD: '#c27a1c',
  mint: '#3bb273',
  mintD: '#23804f',
  coral: '#e4572e',
  coralD: '#a8381a',
  sky: '#2e86ab',
  gold: '#ffd166',
};

/** The game's `.panel` look, scaled up for 1080p. */
export const panelStyle = (k = 3): React.CSSProperties => ({
  background: 'rgba(22, 26, 56, 0.96)',
  border: `${k}px solid ${UI.ink}`,
  boxShadow: `inset 0 0 0 ${k}px ${UI.frame}, ${k * 2}px ${k * 2}px 0 rgba(5,6,16,.75)`,
});

/** Show a procedural sprite canvas (from lib/art) as an upscaled, pixelated element. */
export const Sprite: React.FC<{ src: () => HTMLCanvasElement; id: string; scale: number; style?: React.CSSProperties }> = ({ src, id, scale, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const c = src();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext('2d')!;
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(c, 0, 0);
  }, [id, c]);
  return <canvas ref={ref} width={c.width} height={c.height} style={{ width: c.width * scale, height: c.height * scale, imageRendering: 'pixelated', display: 'block', ...style }} />;
};

/** Numbered keycap like `.choice .num`. */
export const Keycap: React.FC<{ n: string; size?: number }> = ({ n, size = 22 }) => (
  <span
    style={{
      fontFamily: PIXEL,
      fontSize: size,
      color: UI.ink,
      background: UI.text,
      padding: `${size * 0.45}px ${size * 0.55}px`,
      border: `3px solid ${UI.ink}`,
      borderBottomWidth: 6,
      lineHeight: 1,
      flex: 'none',
    }}
  >
    {n}
  </span>
);

export const fontPx = (size: number, fam: string) => `${size}px ${fam.includes('"') || fam.includes("'") ? fam : `"${fam}"`}`;
export { PIXEL, BODY };
