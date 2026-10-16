// Shared rendering helpers for every scene.
import { useLayoutEffect, useRef } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';

export interface DrawInfo {
  /** frame within the scene (Sequence-local) */
  frame: number;
  fps: number;
  /** logical canvas size (1920/scale × 1080/scale) */
  w: number;
  h: number;
  /** seconds within the scene */
  t: number;
}

/**
 * A full-frame pixel-art canvas. Draw at low "logical" resolution (default 480×270)
 * and it is upscaled with nearest-neighbour to 1920×1080 — crisp game pixels.
 * The draw function MUST be deterministic for a given frame (no Math.random — use rand()).
 */
export const PixelCanvas: React.FC<{ scale?: number; draw: (ctx: CanvasRenderingContext2D, info: DrawInfo) => void; style?: React.CSSProperties }> = ({ scale = 4, draw, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const w = Math.round(width / scale);
  const h = Math.round(height / scale);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    draw(ctx, { frame, fps, w, h, t: frame / fps });
  }, [frame, fps, w, h, draw]);
  return <canvas ref={ref} width={w} height={h} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated', ...style }} />;
};

/** Deterministic pseudo-random in [0,1) from integers. */
export function rand(a: number, b = 0, c = 0): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Eased 0→1 progress between two frames. */
export function prog(frame: number, from: number, to: number, ease: (t: number) => number = Easing.inOut(Easing.cubic)) {
  return interpolate(frame, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
}

export const EASE = {
  out: Easing.out(Easing.cubic),
  in: Easing.in(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
  back: Easing.out(Easing.back(1.8)),
  elastic: Easing.out(Easing.elastic(1.2)),
  expo: Easing.out(Easing.exp),
};

/** Camera: translate+zoom around a focus point (cx,cy) in logical px, with optional shake. */
export function camera(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, zoom = 1, shake = 0, frame = 0) {
  const sx = shake ? (rand(frame, 1) - 0.5) * shake * 2 : 0;
  const sy = shake ? (rand(frame, 2) - 0.5) * shake * 2 : 0;
  ctx.setTransform(zoom, 0, 0, zoom, Math.round(w / 2 - cx * zoom + sx), Math.round(h / 2 - cy * zoom + sy));
}

/** Full-screen colour grade (multiply) — golden hour, dusk, night. */
export function grade(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, alpha = 1, op: GlobalCompositeOperation = 'multiply') {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = op;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Soft radial light (additive) at logical coords. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 0.5) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Rain streaks (deterministic). */
export function rain(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number, density = 120, alpha = 0.6) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = `rgba(190,215,255,${alpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < density; i++) {
    const x = (rand(i, 7) * (w + 60) + frame * 3) % (w + 60) - 30;
    const y = (rand(i, 9) * h + frame * (9 + rand(i, 3) * 5)) % h;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y + 7);
  }
  ctx.stroke();
  ctx.restore();
}

/** Pixel dissolve wipe: 0 = fully visible, 1 = fully covered by colour. */
export function pixelWipe(ctx: CanvasRenderingContext2D, w: number, h: number, p: number, color = '#0e0c1d', cell = 8) {
  if (p <= 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color;
  for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) if (rand(x, y, 5) < p) ctx.fillRect(x, y, cell, cell);
  ctx.restore();
}
