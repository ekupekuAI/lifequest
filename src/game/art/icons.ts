// React-side helpers: cached, nearest-neighbour scaled PNG data URLs.

import type { Appearance } from '../../domain/types';
import { scaled } from './draw';
import { drawItemIcon } from './items';
import { drawPortrait, drawCharacterSheet, FRAME_W, FRAME_H, type CharKind } from './characters';
import { drawProp } from './props';
import { drawFx } from './fx';
import { makeCanvas } from './draw';
import { onSignTextChange } from './signs';

const urls = new Map<string, string>();

onSignTextChange(() => {
  for (const k of [...urls.keys()]) if (k.startsWith('prop:')) urls.delete(k);
});

function toUrl(key: string, make: () => HTMLCanvasElement, scale: number): string {
  const k = `${key}@${scale}`;
  const hit = urls.get(k);
  if (hit) return hit;
  let url = '';
  try {
    url = scaled(make(), Math.max(1, Math.round(scale))).toDataURL('image/png');
  } catch {
    url = '';
  }
  urls.set(k, url);
  return url;
}

export function iconUrl(itemId: string, scale = 3): string {
  return toUrl(`item:${itemId}`, () => drawItemIcon(itemId), scale);
}

export function portraitUrl(key: string, a: Appearance, kind: CharKind, scale = 3): string {
  return toUrl(`portrait:${key}:${kind}:${JSON.stringify(a)}`, () => drawPortrait(a, kind, 32), scale);
}

export function characterPreviewUrl(a: Appearance, kind: CharKind, scale = 4): string {
  return toUrl(
    `char:${kind}:${JSON.stringify(a)}`,
    () => {
      const [c, ctx] = makeCanvas(FRAME_W, FRAME_H);
      ctx.drawImage(drawCharacterSheet(a, kind), 0, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
      return c;
    },
    scale,
  );
}

export function propUrl(key: string, scale = 3): string {
  return toUrl(`prop:${key}`, () => drawProp(key), scale);
}

export function fxUrl(key: string, scale = 3): string {
  return toUrl(`fx:${key}`, () => drawFx(key), scale);
}
