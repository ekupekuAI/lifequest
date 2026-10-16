// The 3D diorama renderer. Phaser stays the source of truth; every frame we read the
// active WorldScene (runtime.activeWorldView) and mirror its tiles + display list into a
// small three.js scene: pixel textures on pop-up boxes, upright billboards and floor decals.
import * as THREE from 'three';
import type Phaser from 'phaser';
import { store } from '../../core/store';
import { activeWorldView, getGame, type WorldView3D } from '../runtime';
import { TILE_INDEX } from '../art/tiles';
import { TexLib } from './textures';
import { U, riseK, patchMaterial, riseDepthMaterial } from './shaders';
import { WALL_H, boxGeometry, floorGeometry, quadGeometry, raisedGeometry, setQuadUV } from './geometry';

const DEG = Math.PI / 180;
const PI = Math.PI;
const FOV = 35;
const REST_PITCH = 54;
const RISE_S = 1.4;
const FALL_S = 1.1;
const FADE_S = 0.2;
const ADD_BLEND = 1; // Phaser.BlendModes.ADD

type Kind = 'char' | 'box' | 'quad' | 'decal' | 'wall' | 'glow' | 'fx' | 'shadow';
type GO = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
type Phase = 'off' | 'fadein' | 'rise' | 'on' | 'fall' | 'fadeout';

interface Mirror {
  kind: Kind;
  sig: string;
  mesh: THREE.Mesh;
  own?: THREE.Material;
  dPx: number; // box depth in sprite px
  frame?: unknown;
  flip?: boolean;
  wallZ?: number;
  wallMid?: number;
  // per-frame scratch (tiles)
  cx: number;
  bottom: number; // z of the bottom edge
  top: number; // z of the top edge (2D)
  left: number;
  right: number;
  w: number;
  h: number;
  depth: number;
  rank: number;
  // box only
  W: number;
  L: number;
  D: number;
  k: number; // current rise factor
}

const BUILDINGS = new Set(['store-front', 'kiosk', 'clinic-front', 'school', 'library-front', 'post-office-front', 'bus-shelter-city', 'bus-stop']);
const UPRIGHT = new Set(['tree', 'tree-small', 'streetlamp', 'plant', 'lamp', 'bush', 'mailbox', 'ticket-machine', 'sign-arrow', 'open-sign', 'closed-sign', 'queue-sign', 'coat-hook', 'school-bag', 'basket-stack', 'water-cooler']);
const FLOOR = new Set(['rug', 'manhole', 'doormat']);

function classify(key: string, o: GO, hasSolid: boolean): Kind {
  if (key === 'fx:shadow') return 'shadow';
  if (key.startsWith('char:')) return 'char';
  if (o.blendMode === ADD_BLEND || key === 'lamp-glow') return 'glow';
  if (key.startsWith('fx:')) return 'fx';
  if (o.depth === -500) return 'wall';
  // loose items on the floor stand up as little paper cut-outs (they read better in 3D)
  if (key.startsWith('item:') && o.depth === -400) return 'quad';
  if (o.depth <= -400 || FLOOR.has(key) || key.startsWith('rug')) return 'decal';
  if (o.depth >= 10000) return 'fx';
  if (key.startsWith('house-') || BUILDINGS.has(key) || key === 'bus' || key === 'bus-7' || key.startsWith('car-')) return 'box';
  if (UPRIGHT.has(key) || key.includes('sign') || key.startsWith('item:')) return 'quad';
  return hasSolid ? 'box' : 'quad';
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---- time-of-day palette (outdoor) ----
interface Sky {
  sun: number;
  sunI: number;
  sky: number;
  ground: number;
  hemiI: number;
  bg: number;
  elev: number;
}
const SKY_STOPS: [number, Sky][] = [
  [0, { sun: 0x6878c8, sunI: 0.22, sky: 0x3c4a8a, ground: 0x1a1a34, hemiI: 0.5, bg: 0x10132c, elev: 50 }],
  [5.5 * 60, { sun: 0x6878c8, sunI: 0.22, sky: 0x3c4a8a, ground: 0x1a1a34, hemiI: 0.5, bg: 0x10132c, elev: 50 }],
  [7 * 60, { sun: 0xffe0bc, sunI: 0.55, sky: 0xc4dcff, ground: 0x9a8a70, hemiI: 0.52, bg: 0x2c3a5c, elev: 35 }],
  [16.5 * 60, { sun: 0xfff1da, sunI: 0.72, sky: 0xd4e6ff, ground: 0xa58e6a, hemiI: 0.52, bg: 0x2a3858, elev: 52 }],
  [18 * 60, { sun: 0xffc07a, sunI: 0.7, sky: 0xffdcb6, ground: 0x8f6c58, hemiI: 0.5, bg: 0x4a3248, elev: 34 }],
  [19 * 60, { sun: 0xff8a6e, sunI: 0.42, sky: 0xb58ccc, ground: 0x5a4060, hemiI: 0.54, bg: 0x3a2850, elev: 24 }],
  [19.75 * 60, { sun: 0x8f7cd6, sunI: 0.3, sky: 0x6c6ab4, ground: 0x302848, hemiI: 0.5, bg: 0x1e1a40, elev: 40 }],
  [20.5 * 60, { sun: 0x6878c8, sunI: 0.22, sky: 0x3c4a8a, ground: 0x1a1a34, hemiI: 0.5, bg: 0x10132c, elev: 50 }],
  [24 * 60, { sun: 0x6878c8, sunI: 0.22, sky: 0x3c4a8a, ground: 0x1a1a34, hemiI: 0.5, bg: 0x10132c, elev: 50 }],
];
const _ca = new THREE.Color();
const _cb = new THREE.Color();
function skyAt(m: number) {
  let i = 0;
  while (i < SKY_STOPS.length - 2 && m >= SKY_STOPS[i + 1][0]) i++;
  const [t0, a] = SKY_STOPS[i];
  const [t1, b] = SKY_STOPS[i + 1];
  const k = clamp((m - t0) / Math.max(1, t1 - t0), 0, 1);
  const mix = (x: number, y: number) => _ca.setHex(x).lerp(_cb.setHex(y), k).getHex();
  return {
    sun: mix(a.sun, b.sun),
    sunI: lerp(a.sunI, b.sunI, k),
    sky: mix(a.sky, b.sky),
    ground: mix(a.ground, b.ground),
    hemiI: lerp(a.hemiI, b.hemiI, k),
    bg: mix(a.bg, b.bg),
    elev: lerp(a.elev, b.elev, k),
    night: m % 1440 > 19.6 * 60 || m % 1440 < 6 * 60,
  };
}

export interface EngineHooks {
  onExited(): void;
  onRested(): void;
}

export class DioramaEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.3, 160);
  private lib = new TexLib();
  private quadGeo = quadGeometry();
  private world: THREE.Group | null = null;
  private worldGeos: THREE.BufferGeometry[] = [];
  private worldMats: THREE.Material[] = [];
  private worldPlayer: unknown = null;
  private mirrors = new Map<GO, Mirror>();
  private specs = new Map<GO, { solid?: number | { w: number; h: number; dy?: number } }>();
  private ambient = new THREE.AmbientLight(0xffffff, PI);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0);
  private sun = new THREE.DirectionalLight(0xffffff, 0);
  private points: THREE.PointLight[] = [];
  private floorMat: THREE.MeshLambertMaterial | null = null;
  private wallMesh: THREE.Mesh | null = null;
  private rain: THREE.LineSegments | null = null;
  private rainPos: Float32Array | null = null;
  private marker: THREE.Group;
  private arrow: THREE.Mesh;
  private view: WorldView3D | null = null;

  private phase: Phase = 'off';
  private S = 0; // 0 = flat 2D, 1 = full diorama
  private opacity = 0;
  private sceneFade = 0;
  private raf = 0;
  private last = 0;
  private time = 0;
  private follow = new THREE.Vector3();
  private followInit = false;
  private origin = new THREE.Vector2();
  private yawOff = 0;
  private pitchOff = 0;
  private dragging = false;
  private dragLast = { x: 0, y: 0 };
  private frameEMA = 16;
  private resScale = 1;
  private resTimer = 0;
  private basePR = Math.min(window.devicePixelRatio || 1, 2);
  private ro: ResizeObserver;
  private rested = false;
  private disposed = false;
  private phaserHidden = false;

  constructor(
    private host: HTMLDivElement,
    private fadeEl: HTMLDivElement,
    private reduced: boolean,
    private hooks: EngineHooks,
  ) {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.basePR);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x14112a, 1);
    const c = this.renderer.domElement;
    c.className = 'w3d-canvas';
    host.prepend(c);
    host.style.opacity = '0';

    this.scene.background = new THREE.Color(0x14112a);
    this.scene.add(this.ambient, this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    const sm = coarse ? 1024 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -13;
    sc.right = 13;
    sc.top = 13;
    sc.bottom = -13;
    sc.near = 0.5;
    sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    for (let i = 0; i < 4; i++) {
      const p = new THREE.PointLight(0xffc77a, 0, 9, 1.4);
      this.points.push(p);
      this.scene.add(p);
    }
    this.camera.up.set(0, 0, -1);

    // objective marker (replaces the 2D guide arrow, which is not mirrored)
    this.marker = new THREE.Group();
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshLambertMaterial({ color: 0xf2a541, emissive: 0x7a4a10, flatShading: true }),
    );
    gem.scale.set(1, 1.45, 1);
    gem.castShadow = true;
    this.marker.add(gem);
    this.scene.add(this.marker);
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.55);
    arrowShape.lineTo(0.32, 0.1);
    arrowShape.lineTo(0.12, 0.1);
    arrowShape.lineTo(0.12, -0.4);
    arrowShape.lineTo(-0.12, -0.4);
    arrowShape.lineTo(-0.12, 0.1);
    arrowShape.lineTo(-0.32, 0.1);
    arrowShape.closePath();
    this.arrow = new THREE.Mesh(
      new THREE.ShapeGeometry(arrowShape),
      new THREE.MeshBasicMaterial({ color: 0xf2a541, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.scene.add(this.arrow);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();

    const area = host.parentElement ?? host;
    area.addEventListener('pointerdown', this.onDown, true);
    area.addEventListener('contextmenu', this.onContext, true);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    document.addEventListener('visibilitychange', this.onVis);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------- public ----------------
  setOn(on: boolean) {
    if (on) {
      if (this.phase === 'off' || this.phase === 'fadeout') this.phase = 'fadein';
      else if (this.phase === 'fall') this.startRise();
    } else {
      if (this.phase === 'rise' || this.phase === 'on') {
        if (this.reduced) this.toFadeout();
        else {
          this.phase = 'fall';
          this.setOrigin();
        }
      } else if (this.phase === 'fadein') this.toFadeout();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.showPhaser(true);
    this.ro.disconnect();
    const area = this.host.parentElement ?? this.host;
    area.removeEventListener('pointerdown', this.onDown, true);
    area.removeEventListener('contextmenu', this.onContext, true);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('visibilitychange', this.onVis);
    this.clearWorld();
    this.lib.dispose();
    this.quadGeo.dispose();
    this.marker.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.arrow.geometry.dispose();
    (this.arrow.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ---------------- input (optional orbit) ----------------
  private onContext = (e: Event) => {
    if (this.phase !== 'off') e.preventDefault();
  };
  private onDown = (e: PointerEvent) => {
    if (e.button !== 2 || this.phase !== 'on') return;
    this.dragging = true;
    this.dragLast = { x: e.clientX, y: e.clientY };
  };
  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.yawOff = clamp(this.yawOff - (e.clientX - this.dragLast.x) * 0.3 * DEG, -30 * DEG, 30 * DEG);
    this.pitchOff = clamp(this.pitchOff + (e.clientY - this.dragLast.y) * 0.2 * DEG, -14 * DEG, 18 * DEG);
    this.dragLast = { x: e.clientX, y: e.clientY };
  };
  private onUp = () => {
    this.dragging = false;
  };
  private onVis = () => {
    this.last = performance.now();
  };

  // ---------------- phases ----------------
  private startRise() {
    this.phase = 'rise';
    this.setOrigin();
  }
  private toFadeout() {
    this.showPhaser(true);
    this.phase = 'fadeout';
  }
  private setOrigin() {
    const p = this.view?.player;
    if (p) this.origin.set(p.x / 16, p.y / 16);
    U.uOrigin.value.copy(this.origin);
  }
  private showPhaser(show: boolean) {
    const c = getGame()?.canvas;
    if (!c) return;
    if (show && this.phaserHidden) {
      c.style.opacity = '';
      this.phaserHidden = false;
    } else if (!show && !this.phaserHidden) {
      c.style.opacity = '0';
      this.phaserHidden = true;
    }
  }

  /** dev only: pin the transition amount (0..1) for screenshots */
  debugS: number | null = null;

  private stepPhase(dt: number) {
    if (this.debugS !== null && this.phase !== 'off') {
      this.S = this.debugS;
      this.opacity = 1;
      this.host.style.opacity = '1';
      this.showPhaser(false);
      return;
    }
    switch (this.phase) {
      case 'fadein':
        this.S = this.reduced ? 1 : 0;
        this.opacity = Math.min(1, this.opacity + dt / FADE_S);
        if (this.opacity >= 1) {
          this.showPhaser(false);
          if (this.reduced) this.phase = 'on';
          else this.startRise();
        }
        break;
      case 'rise':
        this.opacity = 1;
        this.S = Math.min(1, this.S + dt / RISE_S);
        if (this.S >= 1) this.phase = 'on';
        break;
      case 'on':
        this.S = 1;
        this.opacity = 1;
        if (!this.rested) {
          this.rested = true;
          this.hooks.onRested();
        }
        break;
      case 'fall':
        this.S = Math.max(0, this.S - dt / FALL_S);
        if (this.S <= 0) this.toFadeout();
        break;
      case 'fadeout':
        this.opacity = Math.max(0, this.opacity - dt / FADE_S);
        if (this.opacity <= 0) {
          this.phase = 'off';
          this.hooks.onExited();
        }
        break;
    }
    this.host.style.opacity = String(this.opacity);
  }

  // ---------------- loop ----------------
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.stepPhase(dt);
    if (this.phase === 'off') return;
    const view = activeWorldView();
    this.view = view;
    if (!view) return;
    if (view.player !== this.worldPlayer) this.buildWorld(view);
    this.frame(view, dt);
    this.renderer.render(this.scene, this.camera);
    this.adaptResolution(dt);
  };

  private adaptResolution(dt: number) {
    if (this.phase !== 'on') return;
    this.frameEMA = this.frameEMA * 0.95 + dt * 1000 * 0.05;
    this.resTimer += dt;
    if (this.resTimer < 1.5) return;
    if (this.frameEMA > 20 && this.resScale > 0.5) {
      this.resScale = Math.max(0.5, this.resScale - 0.15);
      this.renderer.setPixelRatio(this.basePR * this.resScale);
      this.resize();
      this.resTimer = 0;
    } else if (this.frameEMA < 13 && this.resScale < 1 && this.resTimer > 4) {
      this.resScale = Math.min(1, this.resScale + 0.1);
      this.renderer.setPixelRatio(this.basePR * this.resScale);
      this.resize();
      this.resTimer = 0;
    }
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------- world (per scene) ----------------
  private clearWorld() {
    for (const m of this.mirrors.values()) this.dropMirror(m);
    this.mirrors.clear();
    this.specs.clear();
    if (this.world) this.scene.remove(this.world);
    this.world = null;
    for (const g of this.worldGeos) g.dispose();
    for (const m of this.worldMats) m.dispose();
    this.worldGeos = [];
    this.worldMats = [];
    this.wallMesh = null;
    this.floorMat = null;
    if (this.rain) {
      this.scene.remove(this.rain);
      this.rain.geometry.dispose();
      (this.rain.material as THREE.Material).dispose();
      this.rain = null;
      this.rainPos = null;
    }
  }

  private buildWorld(view: WorldView3D) {
    this.clearWorld();
    this.worldPlayer = view.player;
    this.followInit = false;
    this.sceneFade = this.phase === 'fadein' ? 0 : 1;
    const group = new THREE.Group();
    this.world = group;
    this.scene.add(group);
    const tilesSrc = view.scene.textures.get('tiles').getSourceImage() as HTMLCanvasElement;
    const tinfo = this.lib.info(tilesSrc);
    const stripW = tinfo.w;
    const rows = view.tiles.length;
    const cols = view.tiles[0]?.length ?? 0;

    // floor
    const floorGeo = floorGeometry(view.tiles, stripW);
    const floorMat = new THREE.MeshLambertMaterial({ map: tinfo.tex });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    group.add(floor);
    this.floorMat = floorMat;
    this.worldGeos.push(floorGeo);
    this.worldMats.push(floorMat);

    // diorama base slab
    const slabGeo = new THREE.BoxGeometry(cols + 0.6, 0.7, rows + 0.6);
    const slabMat = new THREE.MeshLambertMaterial({ color: view.outdoor ? 0x4a3a2c : 0x2e2438 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(cols / 2, -0.351, rows / 2);
    slab.receiveShadow = true;
    group.add(slab);
    this.worldGeos.push(slabGeo);
    this.worldMats.push(slabMat);

    // raised tiles
    const [wallTop, wallFace] = view.wallTiles;
    const wallSet = new Set(view.wallTiles);
    const lowH: Record<number, number> = { [TILE_INDEX.hedge]: 0.75, [TILE_INDEX.fence]: 0.5 };
    const solidSet = new Set(view.solidTiles.filter((i) => i !== TILE_INDEX.water));
    const heightOf = (i: number) => (wallSet.has(i) ? WALL_H : solidSet.has(i) ? lowH[i] ?? 0.6 : 0);
    const wallGeo = raisedGeometry(
      view.tiles,
      stripW,
      heightOf,
      (i) => (wallSet.has(i) ? wallTop : i),
      (i) => (wallSet.has(i) ? wallFace : i),
    );
    if (wallGeo.getAttribute('position').count > 0) {
      const wallMat = new THREE.MeshLambertMaterial({ map: tinfo.tex, vertexColors: true });
      patchMaterial(wallMat, { cut: true, rise: true });
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.customDepthMaterial = riseDepthMaterial();
      this.worldMats.push(wall.customDepthMaterial);
      group.add(wall);
      this.wallMesh = wall;
      this.worldMats.push(wallMat);
    }
    this.worldGeos.push(wallGeo);

    // rain (created lazily per world, toggled by state)
    if (view.outdoor) {
      const N = 900;
      const pos = new Float32Array(N * 6);
      for (let i = 0; i < N; i++) this.resetDrop(pos, i, true);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.LineBasicMaterial({ color: 0xbcd0ff, transparent: true, opacity: 0.6, depthWrite: false });
      this.rain = new THREE.LineSegments(g, m);
      this.rain.frustumCulled = false;
      this.rain.visible = false;
      this.rainPos = pos;
      this.scene.add(this.rain);
    }

    // prop specs (solid footprints → box depth)
    const dyn = (view.scene as unknown as { dyn?: { img: GO; spec: { solid?: number | { w: number; h: number; dy?: number } } }[] }).dyn;
    if (dyn) for (const d of dyn) this.specs.set(d.img, d.spec);
    if (!this.followInit) this.setOrigin();
  }

  private resetDrop(pos: Float32Array, i: number, scatter: boolean) {
    const cx = this.follow.x;
    const cz = this.follow.z;
    const x = cx + (Math.random() - 0.5) * 30;
    const z = cz + (Math.random() - 0.5) * 26;
    const y = scatter ? Math.random() * 12 : 10 + Math.random() * 3;
    pos[i * 6] = x;
    pos[i * 6 + 1] = y;
    pos[i * 6 + 2] = z;
    pos[i * 6 + 3] = x + 0.08;
    pos[i * 6 + 4] = y + 0.55;
    pos[i * 6 + 5] = z - 0.02;
  }

  // ---------------- mirrors ----------------
  private dropMirror(m: Mirror) {
    m.mesh.parent?.remove(m.mesh);
    if (m.mesh.geometry !== this.quadGeo) m.mesh.geometry.dispose();
    m.own?.dispose();
  }

  private makeMirror(o: GO, key: string, sig: string): Mirror | null {
    const src = o.texture.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
    if (!src || !(src instanceof HTMLCanvasElement || src instanceof HTMLImageElement)) return null;
    let spec = this.specs.get(o);
    if (!spec && this.view) {
      const dyn = (this.view.scene as unknown as { dyn?: { img: GO; spec: { solid?: number | { w: number; h: number; dy?: number } } }[] }).dyn;
      const d = dyn?.find((x) => x.img === o);
      if (d) this.specs.set(o, (spec = d.spec));
    }
    const isWhole = o.frame.name === '__BASE';
    let kind = classify(key, o, !!spec?.solid);
    if (kind === 'box' && !isWhole) kind = 'quad';
    const info = this.lib.info(src);
    const base: Mirror = {
      kind,
      sig,
      mesh: null as unknown as THREE.Mesh,
      dPx: 0,
      cx: 0,
      bottom: 0,
      top: 0,
      left: 0,
      right: 0,
      w: 0,
      h: 0,
      depth: 0,
      rank: 0,
      W: 0,
      L: 0,
      D: 0,
      k: 0,
    };
    let mesh: THREE.Mesh;
    if (kind === 'box') {
      const b = info.bounds;
      const hPx = b.y1 - b.y0;
      let d: number;
      const s = spec?.solid;
      if (typeof s === 'number') d = s;
      else if (s) d = s.h + (s.dy ?? 0);
      else d = Math.round(hPx * (key.startsWith('car-') || key.startsWith('bus') ? 0.45 : 0.5));
      if (key.startsWith('house-') || BUILDINGS.has(key)) d = Math.max(d, Math.round(hPx * 0.42));
      d = clamp(Math.round(d), 2, Math.max(2, hPx - 3));
      base.dPx = d;
      const geo = boxGeometry(info, d, o.flipX);
      mesh = new THREE.Mesh(geo, [this.lib.mat(src, 'lit'), this.lib.sideMat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else {
      const geo = kind === 'char' || !isWhole || o.flipX ? this.quadGeo.clone() : this.quadGeo;
      if (geo !== this.quadGeo) {
        const f = o.frame;
        setQuadUV(geo, info.w, info.h, f.cutX, f.cutY, f.cutWidth, f.cutHeight, o.flipX);
        base.frame = f.name;
        base.flip = o.flipX;
      }
      let mat: THREE.Material;
      if (kind === 'glow') {
        mat = base.own = new THREE.MeshBasicMaterial({ map: info.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      } else if (kind === 'fx') {
        mat = base.own = new THREE.MeshBasicMaterial({ map: info.tex, transparent: true, alphaTest: 0.05, depthWrite: false, side: THREE.DoubleSide });
      } else if (kind === 'shadow') mat = this.lib.mat(src, 'soft');
      else if (kind === 'decal') mat = this.lib.mat(src, 'decal');
      else if (kind === 'char') mat = this.lib.mat(src, 'char');
      else mat = this.lib.mat(src, 'lit');
      mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = kind === 'char' || kind === 'quad';
      mesh.receiveShadow = kind === 'decal' || kind === 'wall' || kind === 'quad' || kind === 'char';
      if (kind === 'fx' || kind === 'glow') mesh.renderOrder = 5;
    }
    mesh.matrixAutoUpdate = false;
    base.mesh = mesh;
    if (kind === 'wall') this.placeOnWall(base, o);
    this.world?.add(mesh);
    return base;
  }

  /** Find the front face of the wall a decoration hangs on. */
  private placeOnWall(m: Mirror, o: GO) {
    const v = this.view!;
    const wall = new Set(v.wallTiles);
    const col = clamp(Math.floor(o.x / 16), 0, v.tiles[0].length - 1);
    const dh = o.displayHeight;
    const bottomPx = o.y + (1 - o.originY) * dh;
    const r0 = Math.floor((bottomPx - 1) / 16);
    let front = -1;
    for (const r of [r0, r0 - 1, r0 + 1, r0 - 2]) {
      if (r < 0 || r >= v.tiles.length) continue;
      if (wall.has(v.tiles[r][col]) && !wall.has(v.tiles[r + 1]?.[col] ?? -1)) {
        front = r;
        break;
      }
    }
    if (front < 0) {
      m.kind = 'quad';
      return;
    }
    const zf = front + 1;
    const hT = dh / 16;
    const centre2D = zf - (bottomPx / 16 - hT / 2); // tiles above the front edge (2D)
    const mid = clamp(centre2D * WALL_H * 0.9, hT / 2 + 0.06, WALL_H - hT / 2 - 0.04);
    m.wallZ = zf;
    m.wallMid = mid;
  }

  private frame(view: WorldView3D, dt: number) {
    const e = easeInOutCubic(this.S);
    U.uS.value = this.S;
    const player = view.player;
    const pz = player.y / 16;
    const px = player.x / 16;
    U.uPlayer.value.set(px, pz);
    U.uCut.value = this.S > 0.6 ? 1 : 0;

    // ---------- camera ----------
    const cam = view.scene.cameras.main;
    const wv = cam.worldView;
    const vh = Math.max(4, wv.height / 16);
    const tanH = Math.tan((FOV / 2) * DEG);
    const d0 = vh / 2 / tanH;
    const dRest = clamp(d0 * 0.78, 11, 19);
    const tgt = new THREE.Vector3(px, 0, pz - 0.4);
    if (!this.followInit) {
      this.follow.copy(tgt);
      this.followInit = true;
    } else this.follow.lerp(tgt, 1 - Math.exp(-dt * 5));
    const mapW = view.mapW / 16;
    const mapH = view.mapH / 16;
    const pitch = lerp(90, REST_PITCH, e) * DEG + this.pitchOff * e;
    const dist = lerp(d0, dRest, e);
    const halfW = dist * tanH * this.camera.aspect * 0.78;
    const halfH = (dist * tanH) / Math.sin(pitch) * 0.7;
    const fx = mapW > halfW * 2 ? clamp(this.follow.x, halfW, mapW - halfW) : mapW / 2;
    const fz = mapH > halfH * 2 ? clamp(this.follow.z, halfH * 0.85, mapH - halfH * 0.8) : mapH / 2;
    const cx = lerp(wv.centerX / 16, fx, e);
    const cz = lerp(wv.centerY / 16, fz, e);
    if (!this.dragging) {
      this.yawOff *= Math.exp(-dt * 3);
      this.pitchOff *= Math.exp(-dt * 3);
    }
    const yaw = (Math.sin(this.time * 0.23) * 1.6 * DEG) * e + this.yawOff * e;
    const pitchS = pitch + Math.sin(this.time * 0.31) * 0.5 * DEG * e;
    const off = new THREE.Vector3(0, Math.sin(pitchS) * dist, Math.cos(pitchS) * dist).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.camera.position.set(cx + off.x, off.y, cz + off.z);
    this.camera.up.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.camera.lookAt(cx, 0, cz);
    this.camera.updateMatrixWorld();

    // ---------- lighting ----------
    const outdoor = view.outdoor;
    const sky = skyAt(store.state.clock.minutes % 1440);
    const raining = outdoor && !!store.state.world['rainUntil'];
    const tint = view.lightTint ?? 0xffffff;
    this.ambient.color.setHex(tint);
    this.ambient.intensity = PI * (1 - e);
    let sunI: number;
    if (outdoor) {
      this.hemi.color.setHex(sky.sky);
      this.hemi.groundColor.setHex(sky.ground);
      this.hemi.intensity = PI * sky.hemiI * (raining ? 0.85 : 1) * e;
      this.sun.color.setHex(sky.sun);
      sunI = sky.sunI * (raining ? 0.45 : 1);
    } else {
      this.hemi.color.setHex(0xfff2e0).lerp(_cb.setHex(sky.sky), 0.15);
      this.hemi.groundColor.setHex(0x9a8070);
      this.hemi.intensity = PI * 0.64 * e;
      this.sun.color.setHex(0xfff0d8).lerp(_cb.setHex(sky.sun), 0.35);
      sunI = 0.62;
    }
    this.sun.intensity = PI * sunI * e;
    const elev = Math.min(outdoor ? sky.elev : 46, 44) * DEG;
    const az = -36 * DEG;
    const sd = 22;
    this.sun.position.set(this.follow.x + Math.sin(az) * Math.cos(elev) * sd, Math.sin(elev) * sd, this.follow.z + Math.cos(az) * Math.cos(elev) * sd);
    this.sun.target.position.set(this.follow.x, 0, this.follow.z);
    this.sun.target.updateMatrixWorld();
    this.sun.castShadow = e > 0.02;
    const bgOut = _ca.setHex(sky.bg);
    const bg = (this.scene.background as THREE.Color).setHex(0x14112a).lerp(outdoor ? bgOut : _cb.setHex(0x1a1428), e);
    if (outdoor) {
      if (!this.scene.fog) this.scene.fog = new THREE.Fog(bg.getHex(), 30, 70);
      const f = this.scene.fog as THREE.Fog;
      f.color.copy(bg);
      f.near = lerp(400, 22, e);
      f.far = lerp(800, 60, e);
    } else this.scene.fog = null;
    if (this.floorMat) this.floorMat.color.setScalar(raining ? lerp(1, 0.8, e) : 1);

    // ---------- mirror display list ----------
    const list = view.scene.children.list as Phaser.GameObjects.GameObject[];
    const seen = new Set<GO>();
    const boxes: { m: Mirror; o: GO }[] = [];
    const items: { m: Mirror; o: GO }[] = [];
    const glows: Mirror[] = [];
    let rank = 0;
    const prompt = [...view.ignore].find((g) => (g as GO).texture?.key === 'fx:prompt') as GO | undefined;
    const all = prompt ? [...list, prompt] : list;
    for (const g of all) {
      rank++;
      if (g !== prompt && view.ignore.has(g)) continue;
      if (g.type !== 'Image' && g.type !== 'Sprite') continue;
      const o = g as GO;
      const key = o.texture?.key;
      if (!key || key === '__MISSING' || key === '__DEFAULT') continue;
      const isChar = key.startsWith('char:');
      const sig = `${key}|${isChar ? '' : String(o.frame.name)}|${isChar ? '' : o.flipX ? 1 : 0}|${o.depth === -500 ? 'w' : ''}`;
      let m = this.mirrors.get(o);
      if (m && m.sig !== sig) {
        this.dropMirror(m);
        this.mirrors.delete(o);
        m = undefined;
      }
      if (!m) {
        const nm = this.makeMirror(o, key, sig);
        if (!nm) continue;
        m = nm;
        this.mirrors.set(o, m);
      }
      seen.add(o);
      const visible = o.visible && o.alpha > 0.01 && (g === prompt ? o.visible : true);
      m.mesh.visible = visible;
      if (!visible) continue;
      // frame changes (walk cycles) for animated sprites
      if (m.frame !== undefined && (m.frame !== o.frame.name || m.flip !== o.flipX)) {
        const info = this.lib.info(o.texture.getSourceImage() as HTMLCanvasElement);
        const f = o.frame;
        setQuadUV(m.mesh.geometry, info.w, info.h, f.cutX, f.cutY, f.cutWidth, f.cutHeight, o.flipX);
        m.frame = f.name;
        m.flip = o.flipX;
      }
      const dw = o.displayWidth;
      const dh = o.displayHeight;
      const left = o.x - o.originX * dw;
      const topPx = o.y - o.originY * dh;
      m.left = left / 16;
      m.right = (left + dw) / 16;
      m.cx = (left + dw / 2) / 16;
      m.top = topPx / 16;
      m.bottom = (topPx + dh) / 16;
      m.w = dw / 16;
      m.h = dh / 16;
      m.depth = o.depth;
      m.rank = rank;
      if (m.own) (m.own as THREE.MeshBasicMaterial).opacity = o.alpha;
      if (m.kind === 'box') {
        const info = this.lib.info(o.texture.getSourceImage() as HTMLCanvasElement);
        const b = info.bounds;
        const sx = dw / info.w;
        const sy = dh / info.h;
        const bcx = o.flipX ? info.w - (b.x0 + b.x1) / 2 : (b.x0 + b.x1) / 2;
        m.cx = (left + bcx * sx) / 16;
        m.left = (left + (o.flipX ? info.w - b.x1 : b.x0) * sx) / 16;
        m.right = m.left + ((b.x1 - b.x0) * sx) / 16;
        m.bottom = (topPx + b.y1 * sy) / 16;
        m.top = (topPx + b.y0 * sy) / 16;
        m.W = ((b.x1 - b.x0) * sx) / 16;
        m.D = (m.dPx * sy) / 16;
        m.L = ((b.y1 - b.y0 - m.dPx) * sy) / 16;
        boxes.push({ m, o });
      } else items.push({ m, o });
      if (m.kind === 'glow') glows.push(m);
    }
    for (const [o, m] of this.mirrors)
      if (!seen.has(o)) {
        this.dropMirror(m);
        this.mirrors.delete(o);
      }

    const liftOf = (m: Mirror) => (0.003 + m.rank * 0.0007) * (1 - e);
    const kOf = (x: number, z: number) => riseK(Math.hypot(x - this.origin.x, z - this.origin.y), this.S);
    const mat = new THREE.Matrix4();
    const X = new THREE.Vector3();
    const Y = new THREE.Vector3();
    const Z = new THREE.Vector3();
    const P = new THREE.Vector3();
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const rotY = (v: THREE.Vector3) => v.set(v.x * cy + v.z * sy, v.y, -v.x * sy + v.z * cy);

    for (const { m } of boxes) {
      const k = kOf(m.cx, m.bottom - m.D / 2);
      m.k = k;
      const th = Math.max(0.012, k) * (PI / 2);
      X.set(m.W, 0, 0);
      Y.set(0, m.L * Math.sin(th), -m.L * Math.cos(th));
      Z.set(0, 0, m.D);
      P.set(m.cx, liftOf(m), m.bottom);
      m.mesh.matrix.makeBasis(X, Y, Z).setPosition(P);
      m.mesh.matrixWorldNeedsUpdate = true;
    }

    // fold-up quad helper: base point + rise factor, facing camera yaw when billboard
    // billboards lean back a little toward the camera so they keep ~80% of their 2D height
    const billTilt = clamp(125 - pitch / DEG, 0, 90) / 90;
    const setFold = (m: Mirror, bx: number, by: number, bz: number, k: number, billboard: boolean) => {
      const th = clamp(k, 0.0, 1.06) * (PI / 2) * (billboard ? billTilt : 1);
      X.set(m.w, 0, 0);
      Y.set(0, m.h * Math.sin(th), -m.h * Math.cos(th));
      Z.set(0, Math.cos(th), Math.sin(th));
      if (billboard) {
        rotY(X);
        rotY(Y);
        rotY(Z);
      }
      P.set(bx, by, bz);
      m.mesh.matrix.makeBasis(X, Y, Z).setPosition(P);
      m.mesh.matrixWorldNeedsUpdate = true;
    };

    for (const { m, o } of items) {
      const lift = liftOf(m);
      switch (m.kind) {
        case 'shadow':
        case 'decal': {
          X.set(m.w, 0, 0);
          Y.set(0, 0, -m.h);
          Z.set(0, 1, 0);
          P.set(m.cx, m.kind === 'shadow' ? 0.012 + lift : 0.006 + lift, m.bottom);
          m.mesh.matrix.makeBasis(X, Y, Z).setPosition(P);
          m.mesh.matrixWorldNeedsUpdate = true;
          break;
        }
        case 'wall': {
          const k = clamp(kOf(m.cx, (m.wallZ ?? m.bottom) - 0.5), 0, 1.06);
          const kk = Math.min(1, k);
          const tz = (m.wallZ ?? m.bottom) + 0.03;
          const th = (m.wallMid ?? 0.8) - m.h / 2;
          setFold(m, m.cx, lerp(lift + 0.002, th * k, kk), lerp(m.bottom, tz, kk), k, false);
          break;
        }
        case 'fx': {
          const isPrompt = o.texture.key === 'fx:prompt';
          const G = isPrompt ? 20 : 24;
          const ground = (o.y + G) / 16;
          const k = this.S >= 1 ? 1 : easeInOutCubic(this.S);
          const hb = ((G - (o.y - m.top * 16)) / 16) * 1.25 + (isPrompt ? 0.15 : 0);
          setFold(m, m.cx, lerp(lift + 0.02, hb, k), lerp(m.bottom, ground, k), k, true);
          break;
        }
        case 'glow': {
          const k = kOf(m.cx, m.bottom);
          setFold(m, m.cx, lerp(lift + 0.02, 0.7, Math.min(1, k)), lerp(m.bottom, m.bottom - 0.4, Math.min(1, k)), k, true);
          break;
        }
        default: {
          // char / quad — maybe standing on top of a box (items on counters, plates…)
          const k = kOf(m.cx, m.bottom);
          let by = lift;
          let bz = m.bottom;
          if (m.kind !== 'char') {
            for (const { m: b } of boxes) {
              if (b.depth > m.depth || !b.mesh.visible) continue;
              if (m.cx < b.left || m.cx > b.right || m.bottom < b.top || m.bottom > b.bottom + 0.01) continue;
              const dTop = b.D;
              const rel = m.bottom - b.top; // tiles from the sprite top
              const kb = Math.min(1, b.k);
              const onFront = o.texture.key.includes('slot');
              let tz: number;
              let ty: number;
              if (onFront) {
                tz = b.bottom + 0.02;
                ty = (b.bottom - m.bottom) * kb;
              } else {
                tz = rel <= dTop ? b.bottom - dTop + rel : b.bottom - 0.12;
                tz = clamp(tz, b.bottom - dTop + 0.05, b.bottom - 0.05);
                ty = b.L * Math.sin(Math.max(0.012, b.k) * (PI / 2));
              }
              by = lerp(lift, ty + 0.004, kb);
              bz = lerp(m.bottom, tz, kb);
              break;
            }
          }
          const kk = m.kind === 'char' ? Math.min(1, kOf(m.cx, m.bottom) * 1.02) : k;
          setFold(m, m.cx, by, bz, kk, true);
        }
      }
    }

    // ---------- point lights (lamps at night / indoor ceiling light) ----------
    for (const p of this.points) p.intensity = 0;
    if (!outdoor) {
      const p = this.points[0];
      p.color.setHex(0xffd8a0);
      p.position.set(px, 3.4, pz - 1.2);
      p.distance = 16;
      p.decay = 1;
      p.intensity = 5.5 * e * (sky.night ? 1.25 : 0.8);
    } else if (glows.length) {
      glows.sort((a, b) => Math.hypot(a.cx - px, a.bottom - pz) - Math.hypot(b.cx - px, b.bottom - pz));
      glows.slice(0, this.points.length).forEach((g, i) => {
        const p = this.points[i];
        p.color.setHex(0xffc27a);
        p.position.set(g.cx, 1.9, g.bottom - 1.1);
        p.distance = 8;
        p.decay = 1.3;
        p.intensity = 9 * e;
      });
    }

    // ---------- objective marker ----------
    const gp = view.guide;
    const near = gp ? Math.hypot(gp.x / 16 - px, gp.y / 16 - pz) : 0;
    this.marker.visible = !!gp && e > 0.3 && near > 1.6;
    if (gp) {
      this.marker.position.set(gp.x / 16, 1.9 + Math.sin(this.time * 3.2) * 0.12, gp.y / 16);
      this.marker.rotation.y = this.time * 1.8;
      this.marker.scale.setScalar(e);
    }
    this.arrow.visible = !!gp && e > 0.5 && near > 5;
    if (gp) {
      const ang = Math.atan2(gp.x / 16 - px, gp.y / 16 - pz);
      const r = 1.1 + Math.sin(this.time * 4) * 0.08;
      this.arrow.position.set(px + Math.sin(ang) * r, 0.03, pz + Math.cos(ang) * r);
      this.arrow.rotation.set(-PI / 2, 0, ang + PI);
      (this.arrow.material as THREE.MeshBasicMaterial).opacity = 0.85 * e;
    }

    // ---------- walls ----------
    if (this.wallMesh) this.wallMesh.visible = this.S > 0.01;

    // ---------- rain ----------
    if (this.rain && this.rainPos) {
      this.rain.visible = raining && e > 0.05;
      if (this.rain.visible) {
        const pos = this.rainPos;
        const n = pos.length / 6;
        const fall = dt * 17;
        for (let i = 0; i < n; i++) {
          pos[i * 6 + 1] -= fall;
          pos[i * 6 + 4] -= fall;
          pos[i * 6] -= fall * 0.12;
          pos[i * 6 + 3] -= fall * 0.12;
          if (pos[i * 6 + 1] < 0) this.resetDrop(pos, i, false);
        }
        (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        (this.rain.material as THREE.LineBasicMaterial).opacity = 0.6 * e;
      }
    }

    // ---------- scene-change fade (mirrors Phaser's camera fade) ----------
    const fe = cam.fadeEffect as unknown as { isRunning: boolean; isComplete: boolean; alpha: number };
    const phaserFade = fe && (fe.isRunning || fe.isComplete) ? fe.alpha : 0;
    this.sceneFade = Math.max(0, this.sceneFade - dt / 0.3);
    this.fadeEl.style.opacity = String(Math.max(phaserFade, this.sceneFade));
  }
}
