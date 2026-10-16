// Geometry builders for the diorama: floor plane, raised walls/hedges, pop-up boxes, quads.
import * as THREE from 'three';
import type { Bounds } from './textures';

export const WALL_H = 1.5;

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  ctr: number[] = [];
  idx: number[] = [];
  /** a, b, c, d = bottom-left, bottom-right, top-right, top-left as seen from outside */
  quad(
    a: number[],
    b: number[],
    c: number[],
    d: number[],
    n: number[],
    uv: [number, number, number, number], // u0, v0 (bottom), u1, v1 (top)
    shade: THREE.Color | number,
    center?: [number, number],
  ) {
    const base = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) this.nrm.push(...n);
    const [u0, v0, u1, v1] = uv;
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    const r = typeof shade === 'number' ? shade : shade.r;
    const g = typeof shade === 'number' ? shade : shade.g;
    const bl = typeof shade === 'number' ? shade : shade.b;
    for (let i = 0; i < 4; i++) this.col.push(r, g, bl);
    if (center) for (let i = 0; i < 4; i++) this.ctr.push(center[0], center[1]);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  build(withCenter = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (withCenter) g.setAttribute('aCenter', new THREE.Float32BufferAttribute(this.ctr, 2));
    g.setIndex(this.idx);
    return g;
  }
}

function tileUV(i: number, stripW: number, vTop = 1): [number, number, number, number] {
  const e = 0.02;
  return [(i * 16 + e) / stripW, 0, ((i + 1) * 16 - e) / stripW, vTop];
}

/** One merged plane for the whole map (including wall tiles, so the flat state matches 2D). */
export function floorGeometry(tiles: number[][], stripW: number, skip?: (i: number) => boolean) {
  const b = new Builder();
  for (let r = 0; r < tiles.length; r++)
    for (let c = 0; c < tiles[r].length; c++) {
      const i = tiles[r][c];
      if (skip?.(i)) continue;
      b.quad([c, 0, r + 1], [c + 1, 0, r + 1], [c + 1, 0, r], [c, 0, r], [0, 1, 0], tileUV(i, stripW), 1);
    }
  return b.build();
}

/** Raised tiles: walls (tall, wallTop on top, wallFace on the sides) and hedges/fences (low). */
export function raisedGeometry(
  tiles: number[][],
  stripW: number,
  heightOf: (i: number) => number,
  topOf: (i: number) => number,
  faceOf: (i: number) => number,
) {
  const b = new Builder();
  const H = (r: number, c: number) => (r < 0 || c < 0 || r >= tiles.length || c >= tiles[0].length ? 0 : heightOf(tiles[r][c]));
  for (let r = 0; r < tiles.length; r++)
    for (let c = 0; c < tiles[r].length; c++) {
      const i = tiles[r][c];
      const h = heightOf(i);
      if (h <= 0) continue;
      const ctr: [number, number] = [c + 0.5, r + 0.5];
      const top = tileUV(topOf(i), stripW);
      const face = tileUV(faceOf(i), stripW);
      b.quad([c, h, r + 1], [c + 1, h, r + 1], [c + 1, h, r], [c, h, r], [0, 1, 0], top, 1, ctr);
      if (H(r + 1, c) < h) b.quad([c, 0, r + 1], [c + 1, 0, r + 1], [c + 1, h, r + 1], [c, h, r + 1], [0, 0, 1], face, 0.9, ctr);
      if (H(r, c + 1) < h) b.quad([c + 1, 0, r + 1], [c + 1, 0, r], [c + 1, h, r], [c + 1, h, r + 1], [1, 0, 0], face, 0.72, ctr);
      if (H(r, c - 1) < h) b.quad([c, 0, r], [c, 0, r + 1], [c, h, r + 1], [c, h, r], [-1, 0, 0], face, 0.72, ctr);
      if (H(r - 1, c) < h) b.quad([c + 1, 0, r], [c, 0, r], [c, h, r], [c + 1, h, r], [0, 0, -1], face, 0.62, ctr);
    }
  return b.build(true);
}

/**
 * Pop-up box in a unit frame: x ∈ [-0.5, 0.5], y (height axis) ∈ [0, 1], z (depth axis) ∈ [-1, 0].
 * The object matrix shears it so it can fold flat onto the floor (exactly the 2D sprite) and
 * stand up into a box. Group 0 = textured front + top, group 1 = solid-colour sides/back.
 */
export function boxGeometry(info: { w: number; h: number; bounds: Bounds; side: THREE.Color }, dPx: number, flip: boolean) {
  const { bounds: bb, w, h } = info;
  const b = new Builder();
  let u0 = bb.x0 / w;
  let u1 = bb.x1 / w;
  if (flip) [u0, u1] = [1 - u0, 1 - u1];
  const v = (row: number) => 1 - row / h;
  const frontTop = bb.y0 + dPx;
  // front
  b.quad([-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0], [0, 0, 1], [u0, v(bb.y1), u1, v(frontTop)], 1);
  // top (front edge = row frontTop, back edge = row y0)
  b.quad([-0.5, 1, 0], [0.5, 1, 0], [0.5, 1, -1], [-0.5, 1, -1], [0, 1, 0], [u0, v(frontTop), u1, v(bb.y0)], 1);
  const nTex = b.idx.length;
  const s1 = info.side.clone().multiplyScalar(0.82);
  const s2 = info.side.clone().multiplyScalar(0.6);
  b.quad([0.5, 0, 0], [0.5, 0, -1], [0.5, 1, -1], [0.5, 1, 0], [1, 0, 0], [0, 0, 0, 0], s1);
  b.quad([-0.5, 0, -1], [-0.5, 0, 0], [-0.5, 1, 0], [-0.5, 1, -1], [-1, 0, 0], [0, 0, 0, 0], s1);
  b.quad([0.5, 0, -1], [-0.5, 0, -1], [-0.5, 1, -1], [0.5, 1, -1], [0, 0, -1], [0, 0, 0, 0], s2);
  const g = b.build();
  g.addGroup(0, nTex, 0);
  g.addGroup(nTex, b.idx.length - nTex, 1);
  return g;
}

/** Unit quad: x ∈ [-0.5, 0.5], y ∈ [0, 1], facing +Z. */
export function quadGeometry() {
  const b = new Builder();
  b.quad([-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0], [0, 0, 1], [0, 0, 1, 1], 1);
  return b.build();
}

/** Set a quad geometry's UVs to a sub-rectangle (texture px), optionally mirrored. */
export function setQuadUV(g: THREE.BufferGeometry, texW: number, texH: number, x: number, y: number, w: number, h: number, flip: boolean) {
  let u0 = x / texW;
  let u1 = (x + w) / texW;
  if (flip) [u0, u1] = [u1, u0];
  const vb = 1 - (y + h) / texH;
  const vt = 1 - y / texH;
  const a = g.getAttribute('uv') as THREE.BufferAttribute;
  a.setXY(0, u0, vb);
  a.setXY(1, u1, vb);
  a.setXY(2, u1, vt);
  a.setXY(3, u0, vt);
  a.needsUpdate = true;
}
