// Texture + material cache for the 3D diorama. Phaser textures are canvases
// (BootScene uses textures.addCanvas), so we wrap the very same canvas in a
// THREE texture with nearest-neighbour filtering — the pixel art stays crisp.
import * as THREE from 'three';
import { patchMaterial } from './shaders';

type Src = HTMLCanvasElement | HTMLImageElement;

export interface Bounds {
  x0: number;
  y0: number;
  x1: number; // exclusive
  y1: number; // exclusive
}

export interface TexInfo {
  tex: THREE.Texture;
  w: number;
  h: number;
  /** opaque pixel bounds (whole texture when unreadable) */
  bounds: Bounds;
  /** average opaque colour of the lower half (used for box sides) */
  side: THREE.Color;
  /** average colour of the top rows (roof tint) */
  top: THREE.Color;
}

export type MatVariant = 'lit' | 'char' | 'decal' | 'soft';

export class TexLib {
  private infos = new Map<Src, TexInfo>();
  private mats = new Map<Src, Map<MatVariant, THREE.Material>>();
  readonly sideMat: THREE.MeshLambertMaterial;

  constructor() {
    this.sideMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    patchMaterial(this.sideMat, { cut: true });
  }

  info(src: Src): TexInfo {
    let i = this.infos.get(src);
    if (i) return i;
    const tex = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const w = src.width;
    const h = src.height;
    let bounds: Bounds = { x0: 0, y0: 0, x1: w, y1: h };
    const side = new THREE.Color(0x6b5a6e);
    const top = new THREE.Color(0x8a7a8e);
    try {
      let ctx: CanvasRenderingContext2D | null = null;
      if (src instanceof HTMLCanvasElement) ctx = src.getContext('2d', { willReadFrequently: false } as CanvasRenderingContext2DSettings);
      if (!ctx) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        ctx = c.getContext('2d');
        ctx?.drawImage(src, 0, 0);
      }
      if (ctx && w * h <= 512 * 512) {
        const d = ctx.getImageData(0, 0, w, h).data;
        let x0 = w,
          y0 = h,
          x1 = 0,
          y1 = 0;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            if (d[(y * w + x) * 4 + 3] > 40) {
              if (x < x0) x0 = x;
              if (y < y0) y0 = y;
              if (x + 1 > x1) x1 = x + 1;
              if (y + 1 > y1) y1 = y + 1;
            }
        if (x1 > x0 && y1 > y0) bounds = { x0, y0, x1, y1 };
        const avg = (ya: number, yb: number, out: THREE.Color) => {
          let r = 0,
            g = 0,
            b = 0,
            n = 0;
          for (let y = Math.max(0, ya); y < Math.min(h, yb); y++)
            for (let x = bounds.x0 + 1; x < bounds.x1 - 1; x++) {
              const k = (y * w + x) * 4;
              if (d[k + 3] < 200) continue;
              // skip the near-black outline so sides are not muddy
              if (d[k] + d[k + 1] + d[k + 2] < 90) continue;
              r += d[k];
              g += d[k + 1];
              b += d[k + 2];
              n++;
            }
          if (n) out.setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
        };
        const mid = Math.round((bounds.y0 + bounds.y1) / 2);
        avg(mid, bounds.y1, side);
        avg(bounds.y0, bounds.y0 + Math.max(2, Math.round((bounds.y1 - bounds.y0) * 0.25)), top);
      }
    } catch {
      /* tainted / unreadable: keep defaults */
    }
    i = { tex, w, h, bounds, side, top };
    this.infos.set(src, i);
    return i;
  }

  mat(src: Src, variant: MatVariant): THREE.Material {
    let m = this.mats.get(src);
    if (!m) this.mats.set(src, (m = new Map()));
    let mat = m.get(variant);
    if (mat) return mat;
    const map = this.info(src).tex;
    if (variant === 'decal') {
      mat = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    } else if (variant === 'soft') {
      mat = new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    } else {
      mat = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
      if (variant === 'lit') patchMaterial(mat as THREE.MeshLambertMaterial, { cut: true });
    }
    m.set(variant, mat);
    return mat;
  }

  dispose() {
    for (const m of this.mats.values()) for (const mat of m.values()) mat.dispose();
    for (const i of this.infos.values()) i.tex.dispose();
    this.sideMat.dispose();
    this.mats.clear();
    this.infos.clear();
  }
}
