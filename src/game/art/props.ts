// Prop registry: every placeable object sprite, drawn on demand and cached.

import { OUTLINE } from './palette';
import { makeCanvas, outlineInner } from './draw';
import { HOME_PROPS } from './props-home';
import { TOWN_PROPS } from './props-town';
import { SHOP_PROPS } from './props-shop';
import { CITY_PROPS } from './props-city';
import { HOME_EXTRA_PROPS, HOME_EXTRA_NO_OUTLINE } from './props-home-extra';
import { onSignTextChange } from './signs';

export { SIGN_TEXT, SIGN_DEFAULTS, SIGN_PROP_KEYS, setSignText, fitText, drawFittedText } from './signs';

export interface PropDef {
  w: number;
  h: number;
  draw(ctx: CanvasRenderingContext2D): void;
}

export const PROPS: Record<string, PropDef> = {
  ...HOME_PROPS,
  ...TOWN_PROPS,
  ...SHOP_PROPS,
  ...CITY_PROPS,
  ...HOME_EXTRA_PROPS,
};

/** Props that must stay soft / borderless (glows, overlays). */
const NO_OUTLINE = new Set(['lamp-glow', 'shelf-dairy-empty-slot', 'manhole', ...HOME_EXTRA_NO_OUTLINE]);

const cache = new Map<string, HTMLCanvasElement>();

// sign text changed -> every cached prop may be stale (cheap to redraw)
onSignTextChange(() => cache.clear());

/** Render a prop by key (cached). Unknown keys -> a small magenta-free placeholder crate. */
export function drawProp(key: string): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const def = PROPS[key];
  let c: HTMLCanvasElement;
  if (!def) {
    const [pc, ctx] = makeCanvas(16, 16);
    ctx.fillStyle = '#a8673f';
    ctx.fillRect(2, 4, 12, 11);
    ctx.fillStyle = '#c98b57';
    ctx.fillRect(2, 4, 12, 2);
    ctx.fillStyle = '#5e3424';
    ctx.fillRect(7, 4, 2, 11);
    outlineInner(pc, OUTLINE);
    c = pc;
  } else {
    const [pc, ctx] = makeCanvas(def.w, def.h);
    def.draw(ctx);
    if (!NO_OUTLINE.has(key)) outlineInner(pc, OUTLINE);
    c = pc;
  }
  cache.set(key, c);
  return c;
}
