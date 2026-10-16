// Dev-only visual preview of every generated sprite (open /art-preview.html).

import type { Appearance } from '../../domain/types';
import { ITEMS } from '../../domain/items';
import { NPC_LOOKS } from '../../domain/family';
import {
  drawTileset,
  TILE_NAMES,
  TILE_INDEX,
  TILE,
  type TileName,
  PROPS,
  drawProp,
  drawItemIcon,
  drawFx,
  FX_KEYS,
  drawCharacterSheet,
  drawPortrait,
  FRAME_W,
  FRAME_H,
  type CharKind,
  drawPixelText,
} from './index';

const S = 3;
const root = document.getElementById('app')!;

function section(title: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  root.appendChild(h);
  const d = document.createElement('div');
  d.className = 'grid';
  root.appendChild(d);
  return d;
}

function show(parent: HTMLElement, src: HTMLCanvasElement, label: string, scale = S) {
  const fig = document.createElement('figure');
  const c = document.createElement('canvas');
  c.width = src.width * scale;
  c.height = src.height * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  fig.appendChild(c);
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  fig.appendChild(cap);
  parent.appendChild(fig);
}

function tileCanvas(): HTMLCanvasElement {
  return drawTileset();
}

function blit(ctx: CanvasRenderingContext2D, name: TileName, x: number, y: number) {
  ctx.drawImage(tileCanvas(), TILE_INDEX[name] * TILE, 0, TILE, TILE, x, y, TILE, TILE);
}

function frame(a: Appearance, kind: CharKind, row: number, col: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FRAME_W;
  c.height = FRAME_H;
  c.getContext('2d')!.drawImage(drawCharacterSheet(a, kind), col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
  return c;
}

function placeProp(ctx: CanvasRenderingContext2D, key: string, x: number, bottomY: number) {
  const p = drawProp(key);
  ctx.drawImage(p, x, bottomY - p.height);
}

function placeChar(ctx: CanvasRenderingContext2D, a: Appearance, kind: CharKind, x: number, bottomY: number, row = 0, col = 0) {
  ctx.drawImage(drawFx('shadow'), x, bottomY - 5);
  ctx.drawImage(frame(a, kind, row, col), x, bottomY - FRAME_H);
}

const LOOKS: { a: Appearance; kind: CharKind; label: string }[] = [
  { a: { skin: '#e8b48a', hair: '#4a2c1a', hairStyle: 'short', shirt: '#f2c14e', pants: '#3d5a80' }, kind: 'adult', label: 'player short' },
  { a: { skin: '#c98e62', hair: '#1e1a1a', hairStyle: 'bun', shirt: '#c0392b', pants: '#5c4033' }, kind: 'adult', label: 'mother bun' },
  { a: { skin: '#c98e62', hair: '#4a2c1a', hairStyle: 'long', shirt: '#f28ab2', pants: '#3d5a80' }, kind: 'child', label: 'sister long (child)' },
  { a: { skin: '#a86b45', hair: '#4a2c1a', hairStyle: 'spiky', shirt: '#3bb273', pants: '#3d5a80' }, kind: 'adult', label: 'brother spiky' },
  { a: { skin: '#c98e62', hair: '#b8b8c0', hairStyle: 'bald', shirt: '#8e5ea2', pants: '#6b705c' }, kind: 'elder', label: 'grandpa bald (elder)' },
  { a: { skin: '#5a3520', hair: '#c2453a', hairStyle: 'long', shirt: '#ffffff', pants: '#14213d' }, kind: 'adult', label: 'white shirt long' },
];

function interiorScene(): HTMLCanvasElement {
  const W = 14 * TILE;
  const H = 10 * TILE;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 14; x++) {
      let t: TileName = 'wood';
      if (y === 0) t = 'wallTop';
      else if (y === 1) t = 'wallFace';
      else if (x >= 9 && y >= 2 && y <= 5) t = 'kitchen';
      else if (x >= 3 && x <= 6 && y >= 5 && y <= 7) t = 'rug';
      if (x === 8 && y > 0) t = y === 1 ? 'wallFace' : y === 2 ? 'wallTop' : t;
      blit(ctx, t, x * TILE, y * TILE);
    }
  placeProp(ctx, 'window', 2 * TILE, 2 * TILE);
  placeProp(ctx, 'picture', 4 * TILE, 2 * TILE - 2);
  placeProp(ctx, 'wall-clock', 6 * TILE + 2, 2 * TILE - 3);
  placeProp(ctx, 'bookshelf-full', 0, 3 * TILE);
  placeProp(ctx, 'sofa', 3 * TILE, 5 * TILE);
  placeProp(ctx, 'coffee-table', 3 * TILE + 8, 7 * TILE);
  placeProp(ctx, 'tv', 3 * TILE + 8, 9 * TILE + 8);
  placeProp(ctx, 'plant', 7 * TILE, 3 * TILE);
  placeProp(ctx, 'fridge', 13 * TILE, 3 * TILE);
  placeProp(ctx, 'counter', 9 * TILE, 3 * TILE);
  placeProp(ctx, 'stove', 10 * TILE, 3 * TILE);
  placeProp(ctx, 'sink', 11 * TILE, 3 * TILE);
  placeProp(ctx, 'counter', 12 * TILE, 3 * TILE);
  placeProp(ctx, 'dining-table', 10 * TILE, 8 * TILE);
  placeProp(ctx, 'laundry-full', 0, 8 * TILE);
  placeProp(ctx, 'bin-full', 7 * TILE, 9 * TILE);
  placeProp(ctx, 'lamp', 0, 6 * TILE);
  const it = drawItemIcon('toy-car');
  ctx.drawImage(it, 8 * TILE + 4, 7 * TILE);
  ctx.drawImage(drawItemIcon('socks'), 2 * TILE, 8 * TILE + 4);
  placeChar(ctx, LOOKS[0].a, 'adult', 6 * TILE, 8 * TILE + 8, 0, 0);
  placeChar(ctx, LOOKS[1].a, 'adult', 11 * TILE, 5 * TILE + 8, 1, 0);
  placeChar(ctx, LOOKS[2].a, 'child', 8 * TILE + 4, 9 * TILE + 12, 2, 1);
  placeChar(ctx, LOOKS[4].a, 'elder', 1 * TILE + 4, 9 * TILE + 12, 0, 0);
  ctx.drawImage(drawFx('heart'), 6 * TILE, 8 * TILE + 8 - 34);
  return c;
}

function townScene(): HTMLCanvasElement {
  const W = 24 * TILE;
  const H = 12 * TILE;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 24; x++) {
      let t: TileName = (x * 7 + y * 3) % 11 === 0 ? 'grassFlowers' : 'grass';
      if (y === 6) t = 'sidewalk';
      if (y === 7 || y === 9) t = 'road';
      if (y === 8) t = x === 12 ? 'crosswalk' : 'roadLine';
      if ((y === 7 || y === 9) && x === 12) t = 'crosswalk';
      if (y === 10) t = 'sidewalk';
      if (y === 11) t = x < 4 ? 'water' : x === 4 ? 'hedge' : 'path';
      if (y === 5 && (x === 4 || x === 13)) t = 'path';
      if (y === 5 && (x === 0 || x === 1 || x === 2)) t = 'fence';
      blit(ctx, t, x * TILE, y * TILE);
    }
  placeProp(ctx, 'house-player', 0, 5 * TILE + 8);
  placeProp(ctx, 'house-a', 5 * TILE + 8, 5 * TILE + 8);
  placeProp(ctx, 'store-front', 10 * TILE, 5 * TILE + 8);
  placeProp(ctx, 'tree', 17 * TILE, 5 * TILE + 4);
  placeProp(ctx, 'kiosk', 19 * TILE, 5 * TILE + 8);
  placeProp(ctx, 'streetlamp', 9 * TILE + 4, 6 * TILE + 12);
  placeProp(ctx, 'mailbox', 4 * TILE + 8, 6 * TILE + 12);
  placeProp(ctx, 'bench', 14 * TILE, 6 * TILE + 14);
  placeProp(ctx, 'bus-stop', 20 * TILE, 6 * TILE + 14);
  placeProp(ctx, 'car-red', 3 * TILE, 7 * TILE + 14);
  placeProp(ctx, 'car-blue', 16 * TILE, 9 * TILE + 14);
  placeProp(ctx, 'manhole', 8 * TILE, 10 * TILE - 1);
  placeProp(ctx, 'flower-bed', 6 * TILE, 11 * TILE);
  placeProp(ctx, 'bush', 9 * TILE, 11 * TILE);
  placeProp(ctx, 'tree-small', 22 * TILE, 11 * TILE + 8);
  placeProp(ctx, 'sign-arrow', 11 * TILE, 11 * TILE);
  placeChar(ctx, LOOKS[0].a, 'adult', 12 * TILE, 6 * TILE + 14, 0, 1);
  placeChar(ctx, LOOKS[3].a, 'adult', 18 * TILE, 6 * TILE + 12, 1, 3);
  placeChar(ctx, NPC_LOOKS.sharma.appearance, 'adult', 21 * TILE + 8, 5 * TILE + 14, 0, 0);
  ctx.drawImage(drawFx('exclaim'), 21 * TILE + 8, 5 * TILE + 14 - 40);
  return c;
}

function nightVersion(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#4a4a8a';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'lighter';
  const glow = drawProp('lamp-glow');
  ctx.drawImage(glow, 9 * TILE + 8 - 24, 6 * TILE + 12 - 40 - 12);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

// ------------------------------------------------------------------ build ---

{
  const g = section('Scenes (composed) — interior / town / town at night');
  show(g, interiorScene(), 'interior mock');
  const town = townScene();
  show(g, town, 'town mock');
  show(g, nightVersion(town), 'town night + lamp-glow (lighter)');
}
{
  const g = section('Tileset strip + 3x3 seam test');
  show(g, drawTileset(), 'tileset strip');
  for (const n of TILE_NAMES) {
    const c = document.createElement('canvas');
    c.width = c.height = TILE * 3;
    const ctx = c.getContext('2d')!;
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) blit(ctx, n, x * TILE, y * TILE);
    show(g, c, n, 2);
  }
}
{
  const g = section('Characters (rows: down, left, right, up — cols: idle, stepA, idle, stepB)');
  for (const l of LOOKS) {
    show(g, drawCharacterSheet(l.a, l.kind), l.label, 4);
    show(g, drawPortrait(l.a, l.kind), 'portrait', 4);
  }
  for (const [k, v] of Object.entries(NPC_LOOKS)) {
    show(g, frame(v.appearance, v.kind ?? 'adult', 0, 0), k, 4);
    show(g, drawPortrait(v.appearance, v.kind ?? 'adult'), k, 3);
  }
}
{
  const g = section('Props');
  for (const k of Object.keys(PROPS)) show(g, drawProp(k), `${k} ${PROPS[k].w}x${PROPS[k].h}`);
}
{
  const g = section('Item icons');
  const ids = [...Object.keys(ITEMS), 'notebook', 'appointment-slip', 'coin', 'receipt', 'unknown-thing'];
  for (const id of ids) show(g, drawItemIcon(id), id, 4);
}
{
  const g = section('FX');
  for (const k of FX_KEYS) show(g, drawFx(k), k, 4);
}
{
  const g = section('Pixel font');
  const c = document.createElement('canvas');
  c.width = 200;
  c.height = 30;
  const ctx = c.getContext('2d')!;
  drawPixelText(ctx, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 2, 2, '#fbe89a');
  drawPixelText(ctx, '0123456789 ₹250 .,!?-+:/%&()#=*<>', 2, 10, '#ffffff');
  drawPixelText(ctx, 'FRESHMART SHARMA STORE', 2, 18, '#8ad67e');
  show(g, c, 'font', 3);
}
