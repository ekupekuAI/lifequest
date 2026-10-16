// Region-configurable building sign text + a "make it fit" pixel text layout.
//
// Buildings read their names from SIGN_TEXT at draw time. Call setSignText()
// to localise (e.g. { kiosk: 'TIENDA LUPITA' }); it clears the prop caches so
// the next drawProp() renders the new text. NOTE: textures already uploaded
// to Phaser (BootScene) must be re-added for the change to show in-game, so
// call setSignText() before boot or refresh SIGN_PROP_KEYS afterwards.

import { type Ctx } from './draw';
import { drawPixelText, measurePixelText, FONT_H } from './pixelFont';

export const SIGN_DEFAULTS: Readonly<Record<string, string>> = {
  kiosk: 'SHARMA STORE',
  store: 'FRESHMART',
  clinic: 'CLINIC',
  school: 'SCHOOL',
  library: 'LIBRARY',
  post: 'POST OFFICE',
};

export const SIGN_TEXT: Record<string, string> = { ...SIGN_DEFAULTS };

/** Prop keys whose pixels depend on SIGN_TEXT (refresh these textures after setSignText). */
export const SIGN_PROP_KEYS = ['kiosk', 'store-front', 'clinic-front', 'school', 'library-front', 'post-office-front'];

const listeners = new Set<() => void>();

/** Internal: caches register here so they can be flushed when sign text changes. */
export function onSignTextChange(fn: () => void) {
  listeners.add(fn);
}

/** Update sign text (empty / undefined values reset to the default) and flush prop caches. */
export function setSignText(patch: Partial<Record<string, string>>) {
  for (const [k, v] of Object.entries(patch)) {
    const t = (v ?? '').trim();
    SIGN_TEXT[k] = t ? t.toUpperCase() : (SIGN_DEFAULTS[k] ?? '');
  }
  for (const fn of listeners) fn();
}

export function signText(key: string): string {
  return SIGN_TEXT[key] ?? SIGN_DEFAULTS[key] ?? '';
}

export interface FitResult {
  scale: number;
  gap: number;
  lines: string[];
  w: number;
  h: number;
}

/**
 * Pick the biggest readable layout of `text` that fits in w x h:
 * scale 2 (normal, then tight spacing) -> scale 1 -> two lines -> truncated.
 */
export function fitText(text: string, w: number, h: number, maxScale = 2): FitResult {
  const t = text.toUpperCase();
  const tries: [number, number][] = [];
  for (let s = maxScale; s >= 1; s--) {
    tries.push([s, s]);
    if (s > 1) tries.push([s, s - 1]);
  }
  for (const [s, g] of tries) {
    const tw = measurePixelText(t, s, g);
    if (tw <= w && FONT_H * s <= h) return { scale: s, gap: g, lines: [t], w: tw, h: FONT_H * s };
  }
  // two lines (split at the space nearest the middle)
  const words = t.split(' ');
  if (words.length > 1) {
    for (let s = Math.min(maxScale, 2); s >= 1; s--) {
      if (FONT_H * s * 2 + s > h) continue;
      let best: string[] | null = null;
      let bestW = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' ');
        const b = words.slice(i).join(' ');
        const mw = Math.max(measurePixelText(a, s), measurePixelText(b, s));
        if (mw <= w && mw < bestW) {
          best = [a, b];
          bestW = mw;
        }
      }
      if (best) return { scale: s, gap: s, lines: best, w: bestW, h: FONT_H * s * 2 + s };
    }
  }
  // truncate (drop trailing chars, end on a '.')
  let cut = t;
  while (cut.length > 1 && measurePixelText(cut + '.', 1) > w) cut = cut.slice(0, -1);
  cut = cut.trimEnd() + '.';
  return { scale: 1, gap: 1, lines: [cut], w: measurePixelText(cut, 1), h: FONT_H };
}

/** Draw `text` fitted & centred in the box, with an optional 1px drop shadow. */
export function drawFittedText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fg: string,
  shadow?: string,
  maxScale = 2,
): FitResult {
  const f = fitText(text, w, h, maxScale);
  let ly = y + Math.floor((h - f.h) / 2);
  for (const ln of f.lines) {
    const lw = measurePixelText(ln, f.scale, f.gap);
    const lx = x + Math.floor((w - lw) / 2);
    if (shadow) drawPixelText(ctx, ln, lx + 1, ly + 1, shadow, f.scale, f.gap);
    drawPixelText(ctx, ln, lx, ly, fg, f.scale, f.gap);
    ly += FONT_H * f.scale + f.scale;
  }
  return f;
}
