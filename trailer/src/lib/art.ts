// Bridge to the game's own procedural pixel-art engine (../../../src/game/art).
// Everything is deterministic, so Remotion renders identical frames every time.
import { drawProp, PROPS } from '../../../src/game/art/props';
import { drawTileset, TILE_INDEX, type TileName } from '../../../src/game/art/tiles';
import { drawItemIcon } from '../../../src/game/art/items';
import { drawFx } from '../../../src/game/art/fx';
import { drawCharacterSheet, drawPortrait, FRAME_W, FRAME_H, type CharKind } from '../../../src/game/art/characters';
import { drawPixelText, measurePixelText } from '../../../src/game/art/pixelFont';
import { setSignText } from '../../../src/game/art/signs';
import type { Appearance } from '../../../src/domain/types';

export { drawPixelText, measurePixelText, PROPS, TILE_INDEX, FRAME_W, FRAME_H };
export type { TileName };

setSignText({ kiosk: 'SHARMA STORE' });

const cache = new Map<string, HTMLCanvasElement>();
const memo = (key: string, make: () => HTMLCanvasElement) => {
  let c = cache.get(key);
  if (!c) cache.set(key, (c = make()));
  return c;
};

export const prop = (key: string) => memo(`p:${key}`, () => drawProp(key));
export const item = (id: string) => memo(`i:${id}`, () => drawItemIcon(id));
export const fx = (key: string) => memo(`f:${key}`, () => drawFx(key));
export const tileset = () => memo('tiles', () => drawTileset());

// ---------- cast ----------
const look = (skin: string, hair: string, hairStyle: Appearance['hairStyle'], shirt: string, pants: string): Appearance => ({ skin, hair, hairStyle, shirt, pants });
export const CAST: Record<string, { a: Appearance; kind: CharKind }> = {
  player: { a: look('#e8b48a', '#4a2c1a', 'short', '#f2c14e', '#3d5a80'), kind: 'adult' },
  mom: { a: look('#c98e62', '#1e1a1a', 'bun', '#c0392b', '#5c4033'), kind: 'adult' },
  dad: { a: look('#c98e62', '#1e1a1a', 'short', '#2e86ab', '#2b2d42'), kind: 'adult' },
  sibling: { a: look('#c98e62', '#4a2c1a', 'long', '#f28ab2', '#3d5a80'), kind: 'child' },
  grandma: { a: look('#c98e62', '#b8b8c0', 'bun', '#8e5ea2', '#6b705c'), kind: 'elder' },
  cashier: { a: look('#a86b45', '#1e1a1a', 'long', '#3bb273', '#2b2d42'), kind: 'adult' },
  helper: { a: look('#7a4a2c', '#1e1a1a', 'short', '#3bb273', '#2b2d42'), kind: 'adult' },
  cutter: { a: look('#e8b48a', '#8a5a2b', 'short', '#e4572e', '#14213d'), kind: 'adult' },
  elder: { a: look('#c98e62', '#b8b8c0', 'bun', '#8e5ea2', '#6b705c'), kind: 'elder' },
  driver: { a: look('#a86b45', '#1e1a1a', 'short', '#2e86ab', '#14213d'), kind: 'adult' },
  folk0: { a: look('#f6d3b3', '#d9a441', 'long', '#2e86ab', '#14213d'), kind: 'adult' },
  folk1: { a: look('#7a4a2c', '#1e1a1a', 'spiky', '#e4572e', '#2b2d42'), kind: 'adult' },
  folk2: { a: look('#e8b48a', '#c2453a', 'bun', '#3bb273', '#6b705c'), kind: 'adult' },
  folk3: { a: look('#5a3520', '#1e1a1a', 'short', '#f2c14e', '#3d5a80'), kind: 'adult' },
  folk4: { a: look('#c98e62', '#4a2c1a', 'long', '#8e5ea2', '#5c4033'), kind: 'adult' },
  folk5: { a: look('#a86b45', '#b8b8c0', 'bald', '#ffffff', '#2b2d42'), kind: 'elder' },
  folk6: { a: look('#f6d3b3', '#4a2c1a', 'short', '#f28ab2', '#14213d'), kind: 'child' },
  folk7: { a: look('#e8b48a', '#1e1a1a', 'spiky', '#2b2d42', '#3d5a80'), kind: 'adult' },
};

export type Dir = 'down' | 'left' | 'right' | 'up';
const ROW: Record<Dir, number> = { down: 0, left: 1, right: 2, up: 3 };

export const sheet = (who: keyof typeof CAST | string) => memo(`c:${who}`, () => drawCharacterSheet(CAST[who].a, CAST[who].kind));
export const portrait = (who: string, size = 32) => memo(`pt:${who}:${size}`, () => drawPortrait(CAST[who].a, CAST[who].kind, size));

/**
 * Draw a character bottom-centred at (x, y).
 * step: walk cycle position (frame/6 works well); pass walking=false for idle.
 */
export function drawChar(ctx: CanvasRenderingContext2D, who: string, x: number, y: number, dir: Dir = 'down', step = 0, walking = false, scale = 1) {
  const s = sheet(who);
  const col = walking ? [1, 0, 3, 2][Math.floor(step) % 4] : 0;
  const sx = col * FRAME_W;
  const sy = ROW[dir] * FRAME_H;
  const w = FRAME_W * scale;
  const h = FRAME_H * scale;
  // soft shadow
  const sh = fx('shadow');
  ctx.drawImage(sh, Math.round(x - (sh.width * scale) / 2), Math.round(y - sh.height * scale * 0.6), sh.width * scale, sh.height * scale);
  ctx.drawImage(s, sx, sy, FRAME_W, FRAME_H, Math.round(x - w / 2), Math.round(y - h), w, h);
}

/** Draw a prop bottom-centred at (x, y). */
export function drawPropAt(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, scale = 1) {
  const c = prop(key);
  ctx.drawImage(c, Math.round(x - (c.width * scale) / 2), Math.round(y - c.height * scale), c.width * scale, c.height * scale);
}

/** Draw an item icon / fx centred at (x, y). */
export function drawIcon(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, x: number, y: number, scale = 1, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(c, Math.round(x - (c.width * scale) / 2), Math.round(y - (c.height * scale) / 2), c.width * scale, c.height * scale);
  ctx.restore();
}

/**
 * Draw an ASCII tile map. legend maps chars to tile names; '#' with value 'wall'
 * auto-selects wallTop / wallFace like the game does.
 */
export function drawMap(ctx: CanvasRenderingContext2D, rows: string[], legend: Record<string, TileName | 'wall'>, ox = 0, oy = 0) {
  const ts = tileset();
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      let name = legend[ch];
      if (!name) return;
      if (name === 'wall') {
        const below = rows[y + 1]?.[x];
        name = below === undefined || legend[below] === 'wall' ? 'wallTop' : 'wallFace';
      }
      const idx = TILE_INDEX[name as TileName];
      ctx.drawImage(ts, idx * 16, 0, 16, 16, ox + x * 16, oy + y * 16, 16, 16);
    }),
  );
}

/** Fill a rectangle of the same tile. */
export function fillTiles(ctx: CanvasRenderingContext2D, name: TileName, x: number, y: number, cols: number, rowsN: number) {
  const ts = tileset();
  const idx = TILE_INDEX[name];
  for (let j = 0; j < rowsN; j++) for (let i = 0; i < cols; i++) ctx.drawImage(ts, idx * 16, 0, 16, 16, x + i * 16, y + j * 16, 16, 16);
}
