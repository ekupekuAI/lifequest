// Tiny built-in 3x5 pixel font (variable width; M/W/N/₹ are wider).
// Uppercase only — lowercase input is upper-cased.

type Ctx = CanvasRenderingContext2D;

const G: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  '₹': ['####', '..#.', '####', '.#..', '..##'],
  ' ': ['..', '..', '..', '..', '..'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '#', '#'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  '-': ['...', '...', '###', '...', '...'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  ':': ['.', '#', '.', '#', '.'],
  "'": ['#', '#', '.', '.', '.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '&': ['.#.', '#.#', '.#.', '#.#', '.##'],
  '(': ['.#', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '#.'],
  '#': ['#.#', '###', '#.#', '###', '#.#'],
  '=': ['...', '###', '...', '###', '...'],
  '*': ['...', '#.#', '.#.', '#.#', '...'],
  '<': ['..#', '.#.', '#..', '.#.', '..#'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '→': ['.....', '...#.', '#####', '...#.', '.....'],
  '←': ['.....', '.#...', '#####', '.#...', '.....'],
  '♪': ['.##', '.#.', '.#.', '##.', '##.'],
  '"': ['#.#', '#.#', '...', '...', '...'],
};

const FALLBACK = ['###', '#.#', '#.#', '#.#', '###'];

export const FONT_H = 5;

function glyph(ch: string): string[] {
  return G[ch] ?? G[ch.toUpperCase()] ?? FALLBACK;
}

/**
 * Width in pixels of `text` (no trailing gap). `gap` is the letter spacing in
 * output pixels; defaults to one font pixel (= scale).
 */
export function measurePixelText(text: string, scale = 1, gap = scale): number {
  const chars = Array.from(text.toUpperCase());
  if (!chars.length) return 0;
  let w = 0;
  for (const ch of chars) w += glyph(ch)[0].length * scale + gap;
  return w - gap;
}

/** Draw uppercase pixel text with its top-left at (x, y). Returns the width drawn. */
export function drawPixelText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
  gap = scale,
): number {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of Array.from(text.toUpperCase())) {
    const g = glyph(ch);
    for (let j = 0; j < g.length; j++)
      for (let i = 0; i < g[j].length; i++)
        if (g[j][i] === '#') ctx.fillRect(cx + i * scale, cy + j * scale, scale, scale);
    cx += g[0].length * scale + gap;
  }
  return cx - Math.round(x) - gap;
}

/** Draw text horizontally centred on `cx`. */
export function drawPixelTextCentered(ctx: Ctx, text: string, cx: number, y: number, color: string, scale = 1) {
  const w = measurePixelText(text, scale);
  return drawPixelText(ctx, text, Math.round(cx - w / 2), y, color, scale);
}
