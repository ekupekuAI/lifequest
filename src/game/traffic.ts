// Street traffic for outdoor scenes: varied vehicles in both directions that
// accelerate and brake smoothly, queue behind each other, light up at night and
// — most importantly — react to the player like real drivers do: stop politely
// at the zebra, slam the brakes / honk / shout when someone wanders into the
// road anywhere else. Vehicles never touch the player (safety-first game), but
// the near misses feel real. The rules themselves live in core/roadSafety.ts.
import Phaser from 'phaser';
import { store } from '../core/store';
import { availableGuardian, conduct, intervene, recordConduct } from '../core/conduct';
import { mulberry32 } from '../core/systems';
import {
  DRIVER_LINES,
  LinePicker,
  LookTracker,
  NEAR_MISS_LINES,
  QUEUE_GAP,
  QUEUE_LINES,
  ROAD_LESSON,
  ROAD_LIMITS,
  VEHICLES,
  ZEBRA_DAWDLE,
  ZEBRA_THANKS,
  classifyIncident,
  decide,
  incidentCounts,
  nextSpawn,
  roadEscalation,
  scoldLevel,
  sideOf,
  speedToStop,
  zoneAt,
  type Decision,
  type Dir,
  type Facing,
  type Road,
  type VehicleType,
  type Zone,
} from '../core/roadSafety';
import { NPC_LOOKS } from '../domain/family';
import { PAL, type Ramp } from './art/palette';
import { makeCanvas } from './art/draw';
import { drawPixelText, measurePixelText } from './art/pixelFont';
import type { BusView } from './scenes/TownScene';

// ---------------------------------------------------------------- sound ---

let actx: AudioContext | null = null;
type Sound = 'honk' | 'beep' | 'screech' | 'bus';

/** Tiny local synth for horns and tyre screeches (respects the sound toggle). */
function play(sound: Sound) {
  if (!store.ui.sound || typeof window === 'undefined') return;
  try {
    actx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (actx.state === 'suspended') void actx.resume();
    const t0 = actx.currentTime;
    const out = actx.createGain();
    out.gain.value = 0.05;
    out.connect(actx.destination);
    const osc = (f: number, f2: number, start: number, dur: number, type: OscillatorType, vol = 1) => {
      const o = actx!.createOscillator();
      const g = actx!.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t0 + start);
      o.frequency.linearRampToValueAtTime(f2, t0 + start + dur);
      g.gain.setValueAtTime(vol, t0 + start);
      g.gain.setValueAtTime(vol, t0 + start + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      o.connect(g).connect(out);
      o.start(t0 + start);
      o.stop(t0 + start + dur + 0.02);
    };
    if (sound === 'honk') {
      osc(392, 388, 0, 0.16, 'square', 0.8);
      osc(494, 490, 0, 0.16, 'square', 0.6);
      osc(392, 388, 0.22, 0.28, 'square', 0.8);
      osc(494, 490, 0.22, 0.28, 'square', 0.6);
    } else if (sound === 'bus') {
      osc(262, 258, 0, 0.45, 'sawtooth', 0.7);
      osc(330, 326, 0, 0.45, 'sawtooth', 0.5);
    } else if (sound === 'beep') {
      osc(620, 620, 0, 0.09, 'square', 0.5);
      osc(620, 620, 0.14, 0.09, 'square', 0.5);
    } else {
      // tyre screech: filtered noise + a sliding whine
      const len = Math.floor(actx.sampleRate * 0.45);
      const buf = actx.createBuffer(1, len, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = actx.createBufferSource();
      src.buffer = buf;
      const bp = actx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(3200, t0);
      bp.frequency.linearRampToValueAtTime(1800, t0 + 0.45);
      bp.Q.value = 6;
      const g = actx.createGain();
      g.gain.value = 1.6;
      src.connect(bp).connect(g).connect(out);
      src.start(t0);
      osc(1500, 950, 0, 0.42, 'sawtooth', 0.25);
    }
  } catch {
    /* audio unavailable */
  }
}

// ---------------------------------------------------------------- textures ---

const WHITE: Ramp = ['#5d6275', '#9a9fb0', '#cfd3dd', '#e9ecf2', '#ffffff'];
const CAR_VARIANTS: Record<string, Ramp> = {
  'car-green': PAL.green,
  'car-white': WHITE,
  'car-yellow': PAL.yellow,
  'car-sport': PAL.orange,
  'car-slate': PAL.slate,
};
const CAR_LOOKS: Record<VehicleType['kind'], string[]> = {
  scooter: ['car-yellow', 'car-green'],
  car: ['car-red', 'car-blue', 'car-white', 'car-slate', 'car-green'],
  fast: ['car-sport'],
  bus: ['bus'],
};

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** Recoloured copies of the blue car (exact palette swap, so glass and lights stay). */
function ensureTextures(scene: Phaser.Scene) {
  const tx = scene.textures;
  if (tx.exists('car-blue')) {
    const src = tx.get('car-blue').getSourceImage() as HTMLCanvasElement;
    for (const [key, ramp] of Object.entries(CAR_VARIANTS)) {
      if (tx.exists(key)) continue;
      const [c, ctx] = makeCanvas(src.width, src.height);
      ctx.drawImage(src, 0, 0);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const from = PAL.blue.map(hex);
      const to = ramp.map(hex);
      for (let i = 0; i < img.data.length; i += 4) {
        const k = from.findIndex(([r, g, b]) => img.data[i] === r && img.data[i + 1] === g && img.data[i + 2] === b);
        if (k >= 0) [img.data[i], img.data[i + 1], img.data[i + 2]] = to[k];
      }
      ctx.putImageData(img, 0, 0);
      tx.addCanvas(key, c);
    }
  }
  if (!tx.exists('traffic:honk')) {
    const text = 'HONK!';
    const w = measurePixelText(text, 1) + 4;
    const [c, ctx] = makeCanvas(w, 9);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) drawPixelText(ctx, text, 2 + dx, 2 + dy, '#1b1325');
    drawPixelText(ctx, text, 2, 2, '#f2cf5a');
    tx.addCanvas('traffic:honk', c);
  }
  if (!tx.exists('traffic:beep')) {
    const text = 'beep';
    const w = measurePixelText(text, 1) + 4;
    const [c, ctx] = makeCanvas(w, 9);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawPixelText(ctx, text, 2 + dx, 2 + dy, '#1b1325');
    drawPixelText(ctx, text, 2, 2, '#c2e6ee');
    tx.addCanvas('traffic:beep', c);
  }
  if (!tx.exists('traffic:skid')) {
    const [c, ctx] = makeCanvas(16, 2);
    ctx.fillStyle = 'rgba(20,16,26,0.55)';
    ctx.fillRect(0, 0, 16, 2);
    tx.addCanvas('traffic:skid', c);
  }
}

/** Speech-bubble texture for a driver line (cached per line). */
function bubbleTexture(scene: Phaser.Scene, line: string): string {
  const text = line.replace(/[’‘]/g, "'").replace(/…/g, '...').replace(/[“”]/g, '');
  const key = `traffic:say:${text}`;
  if (scene.textures.exists(key)) return key;
  // wrap at ~100px
  const words = text.split(' ');
  const rows: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measurePixelText(next) > 100 && cur) {
      rows.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) rows.push(cur);
  const tw = Math.max(...rows.map((r) => measurePixelText(r)));
  const w = tw + 8;
  const h = rows.length * 7 + 5 + 4;
  const [c, ctx] = makeCanvas(w, h);
  const bh = h - 4;
  ctx.fillStyle = '#1b1325';
  ctx.fillRect(1, 0, w - 2, bh);
  ctx.fillRect(0, 1, w, bh - 2);
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(2, 1, w - 4, bh - 2);
  ctx.fillRect(1, 2, w - 2, bh - 4);
  // tail
  const tx = Math.round(w / 2) - 2;
  ctx.fillStyle = '#1b1325';
  ctx.fillRect(tx, bh - 1, 5, 2);
  ctx.fillRect(tx + 1, bh + 1, 3, 1);
  ctx.fillRect(tx + 2, bh + 2, 1, 2);
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(tx + 1, bh - 1, 3, 1);
  ctx.fillRect(tx + 2, bh, 1, 1);
  rows.forEach((r, i) => drawPixelText(ctx, r, Math.round((w - measurePixelText(r)) / 2), 3 + i * 7, '#1b1325'));
  scene.textures.addCanvas(key, c);
  return key;
}

// ---------------------------------------------------------------- types ---

export interface TrafficConfig {
  /** which stop this road serves (for logging) */
  place: string;
  road: Road;
  /** bottom y of vehicles in each lane (same order as road.lanes) */
  laneY: number[];
  /** map width in px */
  width: number;
  seed: number;
  /** the timetable bus, driven by its schedule but obeying the same rules */
  bus?: { view: BusView; lane: number };
  /** player area where being "in the road" is fine (e.g. boarding the docked bus) */
  safeSpot?: () => { x0: number; x1: number; y0: number; y1: number } | null;
}

interface Vehicle {
  id: number;
  type: VehicleType;
  lane: number;
  dir: Dir;
  img: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  len: number;
  /** centre x */
  x: number;
  v: number;
  mode: 'go' | 'yield' | 'brake' | 'queue';
  reason?: 'jaywalk' | 'zebra-late';
  honks: number;
  lastHonk: number;
  waved: boolean;
  bubble?: Phaser.GameObjects.Image;
  bubbleUntil: number;
  bus?: BusView;
}

const front = (v: Vehicle) => v.x + (v.dir * v.len) / 2;
const rear = (v: Vehicle) => v.x - (v.dir * v.len) / 2;

export interface TrafficHost {
  scene: Phaser.Scene;
  player: () => { x: number; y: number };
  facing: () => Facing;
}

// ---------------------------------------------------------------- traffic ---

export class Traffic {
  private vehicles: Vehicle[] = [];
  private rnd: () => number;
  private spawnIn: number[];
  private t = 0;
  private nextId = 1;
  private lines: LinePicker;
  private looks = new LookTracker(5000);
  private zone: Zone = 'off';
  private crossing: { from: -1 | 1; looked: boolean; zebra: boolean } | null = null;
  private lastIncidentAt: number | null = null;
  private blockingSince: number | null = null;
  private onZebraSince: number | null = null;
  private lastDawdle = -1e9;
  private busVeh?: Vehicle;
  private frameDelta = 16.7;
  private prevY = 0;

  constructor(
    private host: TrafficHost,
    private cfg: TrafficConfig,
  ) {
    const scene = host.scene;
    ensureTextures(scene);
    this.rnd = mulberry32(cfg.seed ^ Math.floor(store.state.clock.minutes));
    this.lines = new LinePicker(this.rnd);
    this.spawnIn = cfg.road.lanes.map(() => 400 + this.rnd() * 2500);
    // a few vehicles already on the road when you arrive
    cfg.road.lanes.forEach((_, lane) => {
      const n = 1 + Math.floor(this.rnd() * 2);
      for (let i = 0; i < n; i++) this.spawn(lane, 60 + this.rnd() * (cfg.width - 120));
    });
    if (cfg.bus) {
      const b = cfg.bus;
      this.busVeh = {
        id: 0,
        type: VEHICLES.bus,
        lane: b.lane,
        dir: cfg.road.lanes[b.lane].dir,
        img: b.view.image,
        len: 80,
        x: b.view.x,
        v: 0,
        mode: 'go',
        honks: 0,
        lastHonk: -1e9,
        waved: false,
        bubbleUntil: 0,
        bus: b.view,
      };
    }
  }

  private get scene() {
    return this.host.scene;
  }

  private spawn(lane: number, x?: number) {
    const cfgLane = this.cfg.road.lanes[lane];
    const dir = cfgLane.dir;
    const { kind } = nextSpawn(this.rnd, 1);
    const type = VEHICLES[kind];
    const looks = CAR_LOOKS[kind].filter((k) => this.scene.textures.exists(k));
    const key = looks[Math.floor(this.rnd() * looks.length)] ?? 'car-red';
    const sx = x ?? (dir === 1 ? -40 : this.cfg.width + 40);
    const y = this.cfg.laneY[lane];
    // don't spawn on top of another vehicle
    const len0 = kind === 'scooter' ? 20 : kind === 'fast' ? 35 : 32;
    if (this.inLane(lane).some((o) => Math.abs(o.x - sx) < (o.len + len0) / 2 + QUEUE_GAP + 6)) return false;
    const img = this.scene.add.image(sx, y, key).setOrigin(0.5, 1).setFlipX(dir === -1).setDepth(y);
    if (kind === 'scooter') img.setScale(0.62, 0.74);
    if (kind === 'fast') img.setScale(1.1, 0.92);
    const glow = this.scene.add.image(sx, y, 'lamp-glow').setBlendMode(Phaser.BlendModes.ADD).setScale(0.42, 0.3).setAlpha(0.7).setDepth(19990).setVisible(false);
    const veh: Vehicle = {
      id: this.nextId++,
      type,
      lane,
      dir,
      img,
      glow,
      len: img.displayWidth,
      x: sx,
      v: x === undefined ? type.cruise : type.cruise * (0.6 + this.rnd() * 0.4),
      mode: 'go',
      honks: 0,
      lastHonk: -1e9,
      waved: false,
      bubbleUntil: 0,
    };
    this.vehicles.push(veh);
    return true;
  }

  private inLane(lane: number): Vehicle[] {
    const list = this.vehicles.filter((v) => v.lane === lane);
    if (this.busVeh && this.busVeh.lane === lane && this.busVeh.img.visible) list.push(this.busVeh);
    return list;
  }

  /** Vehicles currently on the road (for debugging / tests in the browser). */
  get count() {
    return this.vehicles.length;
  }

  update(delta: number) {
    this.frameDelta = delta;
    const dt = Math.min(delta, 50) / 1000;
    const p = this.host.player();
    // bus position follows its timetable; keep the mirror vehicle in sync
    const bus = this.busVeh;
    if (store.blocking) {
      if (bus) {
        bus.bus!.hold = null;
        bus.bus!.sync(p, 0);
      }
      this.syncBubbles();
      return;
    }
    this.t += delta;
    const night = this.isNight();
    const road = this.cfg.road;
    const safe = this.cfg.safeSpot?.();
    const inSafe = !!safe && p.x >= safe.x0 && p.x <= safe.x1 && p.y >= safe.y0 && p.y <= safe.y1;
    const ped = inSafe ? null : p;

    this.trackCrossing(p);

    // ---- spawning ----
    const busy = night ? 0.6 : 1;
    this.spawnIn = this.spawnIn.map((ms, lane) => {
      ms -= delta;
      if (ms <= 0) {
        if (!this.spawn(lane)) return 900;
        return nextSpawn(this.rnd, busy).delayMs;
      }
      return ms;
    });

    // ---- driving ----
    let anyBraking = false;
    let anyYieldStopped = false;
    for (let lane = 0; lane < road.lanes.length; lane++) {
      const list = this.inLane(lane).sort((a, b) => (b.x - a.x) * a.dir); // front-most first
      for (let i = 0; i < list.length; i++) {
        const veh = list[i];
        const leader = i > 0 ? list[i - 1] : undefined;
        if (veh.bus) {
          this.driveBus(veh, leader, ped);
          if (veh.mode === 'brake' && veh.reason === 'jaywalk') anyBraking = true;
          continue;
        }
        const f = front(veh);
        let dec = decide(road, { type: veh.type, dir: veh.dir, lane, front: f, rear: rear(veh), v: veh.v }, ped);
        // stuck behind another vehicle that is closer than the pedestrian: that's queueing, not this driver's stop
        if (dec.action === 'brake' && leader && ped && (rear(leader) - f) * veh.dir < (ped.x - f) * veh.dir) dec = { action: 'go' };
        let want = veh.type.cruise;
        let mode: Vehicle['mode'] = 'go';
        if (dec.action !== 'go') {
          const brake = dec.action === 'yield' ? veh.type.brake : veh.type.brake * 1.8;
          want = Math.min(want, speedToStop(f, dec.stopX, veh.dir, brake));
          mode = dec.action;
        }
        if (leader) {
          const q = speedToStop(f, rear(leader) - veh.dir * QUEUE_GAP, veh.dir, veh.type.brake * 1.6);
          if (q < want) {
            want = q;
            if (mode === 'go') mode = 'queue';
          }
        }
        this.react(veh, dec, mode);
        if (want > veh.v) veh.v = Math.min(want, veh.v + veh.type.accel * dt);
        else veh.v = want;
        veh.x += veh.dir * veh.v * dt;
        if (veh.mode === 'brake' && veh.reason === 'jaywalk') anyBraking = true;
        if (veh.mode === 'yield' && veh.v < 2) anyYieldStopped = true;
      }
    }

    // a bus that is not on screen yet still follows its timetable (it appears when it is due)
    if (bus && !bus.img.visible) this.driveBus(bus, undefined, ped);

    // ---- despawn & visuals ----
    this.vehicles = this.vehicles.filter((veh) => {
      const gone = veh.dir === 1 ? veh.x > this.cfg.width + 70 : veh.x < -70;
      if (gone) {
        veh.img.destroy();
        veh.glow?.destroy();
        veh.bubble?.destroy();
        return false;
      }
      veh.img.x = Math.round(veh.x);
      if (veh.glow) {
        veh.glow.setVisible(night);
        veh.glow.setPosition(Math.round(front(veh) + veh.dir * 10), veh.img.y - veh.img.displayHeight / 2 + 4);
      }
      return true;
    });
    this.syncBubbles();

    // ---- episode bookkeeping ----
    if (anyBraking) {
      this.blockingSince ??= this.t;
      if (this.t - this.blockingSince > ROAD_LIMITS.lingerMs && incidentCounts(this.t, this.lastIncidentAt)) {
        this.blockingSince = this.t;
        this.incident({ severity: 1, nearMiss: false, hard: false }, 'kept standing in the road while traffic waited');
      }
      this.queueHonks();
    } else this.blockingSince = null;
    // dawdling on the zebra while cars wait
    if (this.zone === 'zebra') {
      this.onZebraSince ??= this.t;
      if (anyYieldStopped && this.t - this.onZebraSince > ROAD_LIMITS.dawdleMs && this.t - this.lastDawdle > 5000) {
        this.lastDawdle = this.t;
        const v = this.vehicles.find((x) => x.mode === 'yield' && x.v < 2);
        if (v) {
          play('beep');
          this.pop(v, 'traffic:beep');
          this.say(v, this.lines.pick(ZEBRA_DAWDLE), 2000);
        }
      }
    } else this.onZebraSince = null;
  }

  /** Bus: the timetable says where it should be; pedestrians and queued cars can hold it back. */
  private driveBus(veh: Vehicle, leader: Vehicle | undefined, ped: { x: number; y: number } | null) {
    const view = veh.bus!;
    veh.x = view.x;
    veh.v = view.v;
    const moving = view.phase === 'arriving' || view.phase === 'leaving';
    let hold: number | null = null;
    let dec: Decision = { action: 'go' };
    if (view.image.visible) {
      dec = decide(this.cfg.road, { type: veh.type, dir: veh.dir, lane: veh.lane, front: front(veh), rear: rear(veh), v: veh.v }, ped);
      // only matters while it is driving; a docked bus just waits
      if (dec.action !== 'go') hold = dec.stopX - (veh.dir * veh.len) / 2;
      if (leader) {
        const q = rear(leader) - veh.dir * (QUEUE_GAP + veh.len / 2);
        hold = hold === null ? q : veh.dir === -1 ? Math.max(hold, q) : Math.min(hold, q);
      }
    }
    view.hold = hold;
    view.sync(this.host.player(), this.frameDelta);
    veh.x = view.x;
    veh.v = view.v;
    const eff: Decision = moving || dec.action === 'yield' ? dec : { action: 'go' };
    this.react(veh, eff, eff.action === 'go' ? 'go' : eff.action);
    if (veh.glow === undefined) {
      veh.glow = this.scene.add.image(0, 0, 'lamp-glow').setBlendMode(Phaser.BlendModes.ADD).setScale(0.5, 0.36).setAlpha(0.7).setDepth(19990).setVisible(false);
    }
    veh.glow.setVisible(this.isNight() && view.image.visible);
    veh.glow.setPosition(Math.round(front(veh) + veh.dir * 10), view.image.y - 12);
  }


  private isNight() {
    const m = store.state.clock.minutes % 1440;
    return m > 18.75 * 60 || m < 6 * 60;
  }

  // ---------------------------------------------------------------- reactions ---

  /** React to a driving decision: polite waves at the zebra, screech + honk + scolding for jaywalkers. */
  private react(veh: Vehicle, dec: Decision, mode: Vehicle['mode']) {
    const prev = veh.mode;
    const prevReason = veh.reason;
    veh.mode = mode;
    veh.reason = dec.action === 'brake' ? dec.reason : undefined;
    if (dec.action === 'yield') {
      if (veh.v < 3 && !veh.waved && this.zone === 'zebra') {
        veh.waved = true;
        if (this.rnd() < 0.6) {
          this.emote(veh, this.rnd() < 0.5 ? 'fx:music' : 'fx:heart');
          if (this.rnd() < 0.5) this.say(veh, this.lines.pick(ZEBRA_THANKS), 1600);
        }
      }
      return;
    }
    if (dec.action !== 'brake') {
      if (prev !== 'yield') veh.waved = false;
      if (prev === 'brake' && mode !== 'brake') veh.honks = 0;
      return;
    }
    if (dec.reason === 'zebra-late') return; // the driver was already on the stripes: just stops
    const room = (dec.stopX - front(veh)) * veh.dir;
    if (prev !== 'brake' || prevReason !== 'jaywalk') {
      // the moment the driver spots someone in the road
      const inc = classifyIncident(veh.type, veh.v, Math.max(0, room));
      if (veh.v > 30) {
        play('screech');
        this.skid(veh, Math.max(10, room));
      }
      this.honk(veh, inc.nearMiss ? this.lines.pick(NEAR_MISS_LINES) : this.lines.pick(DRIVER_LINES[0]));
      if (inc.nearMiss) {
        this.scene.cameras.main.shake(280, 0.008);
        store.bus.emit('fx', { kind: 'exclaim' });
        store.state.stats.energy = Math.max(0, store.state.stats.energy - 3);
      } else if (inc.hard) this.scene.cameras.main.shake(140, 0.003);
      if (incidentCounts(this.t, this.lastIncidentAt)) {
        const what = veh.bus ? 'the bus' : veh.type.kind === 'fast' ? 'a speeding car' : veh.type.kind === 'scooter' ? 'a scooter' : 'a car';
        this.incident(inc, inc.nearMiss ? `${what} had to brake hard and nearly hit them` : `${what} had to stop for them in the road`, veh);
      }
      return;
    }
    // still standing there: honk again, angrier
    if (veh.v < 2 && this.t - veh.lastHonk > ROAD_LIMITS.rehonkMs) {
      veh.honks++;
      this.honk(veh, this.lines.pick(DRIVER_LINES[scoldLevel(veh.honks)]));
    }
  }

  private honk(veh: Vehicle, line?: string) {
    veh.lastHonk = this.t;
    play(veh.bus ? 'bus' : 'honk');
    this.pop(veh, 'traffic:honk');
    if (line) this.say(veh, line, 2200);
  }

  /** Cars stuck in the queue behind someone in the road lose patience too. */
  private queueHonks() {
    for (const veh of this.vehicles) {
      if (veh.mode !== 'queue' || veh.v > 2) continue;
      if (this.t - veh.lastHonk < 3200 + (veh.id % 4) * 700) continue;
      if (this.rnd() > 0.02) continue;
      veh.lastHonk = this.t;
      play('beep');
      this.pop(veh, 'traffic:honk');
      if (this.rnd() < 0.35) this.say(veh, this.lines.pick(QUEUE_LINES), 1600);
    }
  }

  // ---------------------------------------------------------------- consequences ---

  private incident(inc: { severity: 1 | 2 | 3; nearMiss: boolean; hard?: boolean }, what: string, veh?: Vehicle) {
    this.lastIncidentAt = this.t;
    const s = store;
    const c = conduct(s);
    c.roadWarnings += 1;
    const n = c.roadWarnings;
    const name = s.player.name.split(' ')[0];
    recordConduct(
      s,
      { kind: 'road', severity: inc.severity, by: 'npc:driver', text: `On the road (${this.cfg.place}): ${what}`, lesson: ROAD_LESSON },
      inc.nearMiss ? `Near miss: a driver had to brake hard for ${name} on the road (${this.cfg.place}).` : undefined,
    );
    // the first time today the driver has a proper word with you
    const flag = `road.driverTalk.${s.state.clock.day}`;
    if (!s.state.world[flag] && veh) {
      s.state.world[flag] = true;
      const driver = NPC_LOOKS.driver?.name ?? 'Driver';
      const line = inc.nearMiss ? 'I nearly hit you! Do you know how long a car needs to stop?' : 'You can’t just walk into the road like that!';
      this.scene.time.delayedCall(700, () =>
        s.say([
          { speaker: driver, portrait: 'npc:driver', text: line },
          { speaker: driver, portrait: 'npc:driver', text: 'Stop at the kerb, look both ways, and cross at the zebra — drivers stop for you there.' },
        ]),
      );
    }
    const esc = roadEscalation(n);
    if (esc === 'none') {
      if (n === 2) s.toast('⚠️ Second time in the road today — drivers are getting angry.', 'bad');
      return;
    }
    const who = availableGuardian(s);
    const serious = esc === 'serious';
    recordConduct(
      s,
      { kind: 'road', severity: serious ? 3 : 2, by: who?.id, text: serious ? `${n} road incidents today — a serious safety talk` : `Drivers had to stop for ${name} ${n} times today — family safety talk`, lesson: ROAD_LESSON },
      `${name} walked into traffic ${n} times today (${this.cfg.place}). ${serious ? 'They need a serious talk about road safety.' : 'A family member talked to them about road safety.'}`,
    );
    const lines = serious
      ? [
          `${n} times today?! Someone saw you in the middle of the road again.`,
          'Cars cannot always stop in time. I am not angry — I am scared for you.',
          'From now on: stop, look both ways, cross at the zebra. Every time. Promise me.',
        ]
      : [
          'A driver just told me they had to stop for you in the road — three times today!',
          'I know it feels quicker, but a car needs a long way to stop. Sometimes too long.',
          'Stop at the kerb, look both ways, and cross at the zebra. Okay?',
        ];
    this.scene.time.delayedCall(serious ? 400 : 1400, () => intervene(s, who, 'road', lines, () => who && s.trust(who.id, serious ? -4 : -2)));
  }

  /** Positive habit: looked left & right at the kerb, then crossed at the zebra. */
  private trackCrossing(p: { x: number; y: number }) {
    const road = this.cfg.road;
    const zone = zoneAt(road, p.x, p.y);
    if (!this.prevY) this.prevY = p.y;
    this.looks.sample(this.host.facing(), this.t, zone);
    const prev = this.zone;
    this.zone = zone;
    const onRoadNow = zone === 'zebra' || zone === 'road';
    const wasOff = prev !== 'zebra' && prev !== 'road';
    const mid = (road.top + road.bottom) / 2;
    if (onRoadNow && wasOff) {
      // stepped into the road: from which side, and did we look first?
      const from = sideOf(road, this.prevY) || (p.y < mid ? -1 : 1);
      this.crossing = { from, looked: this.looks.lookedBothWays(this.t), zebra: zone === 'zebra' };
    }
    if (!onRoadNow && this.crossing) {
      const side = sideOf(road, p.y);
      if (side !== 0 && side !== this.crossing.from && this.crossing.zebra) this.finishCrossing(this.crossing.looked);
      this.crossing = null;
    }
    this.prevY = p.y;
    if (zone === 'road' && this.crossing) this.crossing.zebra = false; // wandered off the stripes
  }

  private finishCrossing(looked: boolean) {
    const s = store;
    const day = s.state.clock.day;
    if (looked) {
      const total = Number(s.state.world['road.safeCrossings'] ?? 0) + 1;
      s.state.world['road.safeCrossings'] = total;
      const todayKey = `road.safe.${day}`;
      const today = Number(s.state.world[todayKey] ?? 0) + 1;
      s.state.world[todayKey] = today;
      if (today === 1 || today % 3 === 0) {
        s.toast(total >= 5 && today === 1 ? `Safe crossing ✓ — that's ${total} careful crossings!` : 'Safe crossing ✓ Looked both ways, used the zebra.', 'good');
        store.bus.emit('fx', { kind: 'check' });
      }
    } else {
      const key = `road.tip.${day}`;
      if (!s.state.world[key]) {
        s.state.world[key] = true;
        s.toast('Tip: at the kerb, look left and right before you step onto the zebra.', 'neutral');
      }
    }
  }

  // ---------------------------------------------------------------- fx ---

  private topOf(veh: Vehicle) {
    return veh.img.y - veh.img.displayHeight;
  }

  private pop(veh: Vehicle, key: string) {
    if (!this.scene.textures.exists(key)) return;
    const x = front(veh) - veh.dir * 6;
    const y = this.topOf(veh) - 2;
    const img = this.scene.add.image(x, y, key).setDepth(15000).setScale(0.6);
    this.scene.tweens.add({ targets: img, scale: 1, y: y - 10, duration: 220, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: img, alpha: 0, delay: 520, duration: 260, onComplete: () => img.destroy() });
  }

  private emote(veh: Vehicle, key: string) {
    if (!this.scene.textures.exists(key)) return;
    const y = this.topOf(veh) - 6;
    const img = this.scene.add.image(veh.x, y, key).setDepth(15000);
    this.scene.tweens.add({ targets: img, y: y - 14, alpha: 0, duration: 1100, ease: 'Sine.easeOut', onComplete: () => img.destroy() });
  }

  private say(veh: Vehicle, line: string, ms: number) {
    veh.bubble?.destroy();
    const key = bubbleTexture(this.scene, line);
    veh.bubble = this.scene.add.image(veh.x, this.topOf(veh) - 4, key).setOrigin(0.5, 1).setDepth(15500);
    veh.bubble.setData('line', line);
    veh.bubbleUntil = this.t + ms;
  }

  private syncBubbles() {
    const all = this.busVeh ? [...this.vehicles, this.busVeh] : this.vehicles;
    for (const veh of all) {
      if (!veh.bubble) continue;
      if (this.t > veh.bubbleUntil || !veh.img.visible) {
        veh.bubble.destroy();
        veh.bubble = undefined;
        continue;
      }
      // keep it on screen at the map edges
      const half = veh.bubble.width / 2;
      veh.bubble.setPosition(Phaser.Math.Clamp(Math.round(veh.img.x), half + 2, this.cfg.width - half - 2), Math.round(this.topOf(veh) - 4));
    }
  }

  private skid(veh: Vehicle, length: number) {
    const y = veh.img.y;
    const h = veh.img.displayHeight;
    const startX = rear(veh);
    for (const dy of [-h + 4, -3]) {
      const img = this.scene.add
        .image(startX, y + dy, 'traffic:skid')
        .setOrigin(veh.dir === 1 ? 0 : 1, 0.5)
        .setDepth(-900);
      img.setScale(Math.max(0.6, (length + veh.len * 0.6) / 16), 1);
      this.scene.tweens.add({ targets: img, alpha: 0, delay: 1800, duration: 1200, onComplete: () => img.destroy() });
    }
  }

  /** Debug snapshot for the browser console. */
  debug() {
    return {
      zone: this.zone,
      crossing: this.crossing,
      vehicles: this.vehicles.map((v) => ({ id: v.id, kind: v.type.kind, lane: v.lane, x: Math.round(v.x), v: Math.round(v.v), mode: v.mode, line: v.bubble?.getData('line') })),
      bus: this.busVeh && { x: Math.round(this.busVeh.x), v: Math.round(this.busVeh.v), mode: this.busVeh.mode, phase: this.busVeh.bus?.phase },
      roadWarnings: conduct(store).roadWarnings,
    };
  }
}
