// Road safety rules — pure logic, no Phaser. Where is a pedestrian (sidewalk,
// zebra, live lane)? How far does a vehicle need to stop? Should a driver yield
// politely (zebra) or slam the brakes and honk (jaywalking)? How serious was it,
// and when does a family member need to step in? Traffic in the scenes
// (src/game/traffic.ts) asks these questions every frame; tests pin the answers.

export type Dir = 1 | -1;
export type VehicleKind = 'scooter' | 'car' | 'fast' | 'bus';
export type Zone = 'off' | 'curb' | 'zebra-curb' | 'zebra' | 'road';

export interface Lane {
  /** +1 drives left→right, -1 right→left */
  dir: Dir;
  /** pedestrian band (feet y) that counts as standing in this lane */
  top: number;
  bottom: number;
}

export interface Zebra {
  x0: number;
  x1: number;
}

export interface Road {
  top: number;
  bottom: number;
  lanes: Lane[];
  zebras: Zebra[];
  /** how far from the kerb (px) still counts as "waiting at the kerb" */
  curb?: number;
}

export interface VehicleType {
  kind: VehicleKind;
  /** cruise speed px/s */
  cruise: number;
  /** comfortable acceleration / braking px/s² */
  accel: number;
  brake: number;
  /** strongest braking the driver can manage px/s² */
  hardBrake: number;
  /** how far ahead (px) the driver notices someone in the lane, beyond their braking distance */
  attention: number;
  /** gap (px) the driver leaves in front of a pedestrian when stopping for one */
  stopGap: number;
}

export const VEHICLES: Record<VehicleKind, VehicleType> = {
  scooter: { kind: 'scooter', cruise: 42, accel: 40, brake: 70, hardBrake: 220, attention: 70, stopGap: 22 },
  car: { kind: 'car', cruise: 68, accel: 48, brake: 80, hardBrake: 260, attention: 46, stopGap: 16 },
  fast: { kind: 'fast', cruise: 112, accel: 70, brake: 90, hardBrake: 300, attention: 12, stopGap: 7 },
  bus: { kind: 'bus', cruise: 58, accel: 30, brake: 60, hardBrake: 200, attention: 60, stopGap: 20 },
};

/** Half the width of the pedestrian's body (px) — vehicles stop this much before the feet. */
export const PED_HALF = 6;
/** Vehicles queue this far (px) behind the vehicle ahead. */
export const QUEUE_GAP = 8;
/** Vehicles stop this far before the zebra stripes. */
export const ZEBRA_GAP = 6;

export const ROAD_LIMITS = {
  /** a family member steps in for a safety talk on this many incidents in a day */
  intervene: 3,
  /** a second, more serious talk (and a trust hit) */
  serious: 6,
  /** two incidents need at least this many ms between them to both count */
  cooldownMs: 4000,
  /** standing in the road this long (ms) counts as a fresh incident */
  lingerMs: 8000,
  /** honk again every this many ms while the pedestrian stays in the lane */
  rehonkMs: 2600,
  /** a gentle tap of the horn if someone dawdles on the zebra this long (ms) */
  dawdleMs: 6000,
};

// ---------------------------------------------------------------- zones ---

export const inZebra = (x: number, z: Zebra, pad = 2) => x >= z.x0 - pad && x <= z.x1 + pad;
export const zebraAt = (road: Road, x: number, pad = 2) => road.zebras.find((z) => inZebra(x, z, pad));
export const onRoad = (road: Road, y: number) => y >= road.top + 2 && y <= road.bottom + 3;

/** Where a pedestrian with feet at (x, y) stands relative to the road. */
export function zoneAt(road: Road, x: number, y: number): Zone {
  const curb = road.curb ?? 18;
  if (onRoad(road, y)) return zebraAt(road, x) ? 'zebra' : 'road';
  const nearCurb = (y < road.top + 2 && y >= road.top - curb) || (y > road.bottom + 3 && y <= road.bottom + curb);
  if (!nearCurb) return 'off';
  return zebraAt(road, x, 0) ? 'zebra-curb' : 'curb';
}

/** Which lanes (indices) the pedestrian's feet are in. Standing on the centre line blocks both. */
export function lanesAt(road: Road, y: number): number[] {
  if (!onRoad(road, y)) return [];
  const out: number[] = [];
  road.lanes.forEach((l, i) => {
    if (y >= l.top - 3 && y <= l.bottom + 3) out.push(i);
  });
  return out;
}

/** Which side of the road the pedestrian's feet are on (-1 north/top, +1 south/bottom, 0 on it / far). */
export const sideOf = (road: Road, y: number): -1 | 0 | 1 => (y < road.top + 2 ? -1 : y > road.bottom + 3 ? 1 : 0);

// ---------------------------------------------------------------- physics ---

/** Distance (px) needed to stop from speed v (px/s) with deceleration a (px/s²). */
export const stoppingDistance = (v: number, a: number) => (v <= 0 ? 0 : (v * v) / (2 * a));
/** Deceleration needed to stop from v within distance d. Infinity when there is no room. */
export const decelNeeded = (v: number, d: number) => (v <= 0 ? 0 : d <= 0 ? Infinity : (v * v) / (2 * d));

/** How far ahead (px of its front bumper) a driver notices a pedestrian in its lane. */
export function noticeRange(t: VehicleType, v: number) {
  return stoppingDistance(v, t.hardBrake) + t.stopGap + PED_HALF + t.attention + v * 0.25;
}

/**
 * Highest speed allowed right now so the front can still halt at `stopX` braking at `brake`
 * (0 once there). Vehicles never exceed it, so they never overshoot the stop line.
 */
export function speedToStop(front: number, stopX: number, dir: Dir, brake: number) {
  const d = (stopX - front) * dir;
  if (d <= 0.5) return 0;
  return Math.sqrt(2 * brake * d);
}

// ---------------------------------------------------------------- decisions ---

export interface Ped {
  x: number;
  y: number;
}

export interface VehicleView {
  type: VehicleType;
  dir: Dir;
  lane: number;
  /** x of the front bumper */
  front: number;
  /** x of the rear bumper */
  rear: number;
  v: number;
}

export type Decision =
  | { action: 'go' }
  /** polite stop before the zebra stripes */
  | { action: 'yield'; stopX: number; zebra: Zebra }
  /** someone is in the lane where they should not be: brake, honk, scold */
  | { action: 'brake'; stopX: number; reason: 'jaywalk' | 'zebra-late' };

/**
 * What a driver does about the pedestrian. Rules:
 * - someone on the zebra (either lane) or waiting at its kerb → stop before the stripes, if not already past them;
 * - someone in this lane ahead (not on a zebra, or on a zebra the car is already crossing) → brake and stop short;
 * - otherwise carry on.
 */
export function decide(road: Road, veh: VehicleView, ped: Ped | null): Decision {
  if (!ped) return { action: 'go' };
  const zone = zoneAt(road, ped.x, ped.y);
  const ahead = (ped.x - veh.front) * veh.dir; // px from the front bumper to the pedestrian
  const alongside = (ped.x - veh.rear) * veh.dir > -PED_HALF && ahead < PED_HALF; // walked into its side
  const inLane = lanesAt(road, ped.y).includes(veh.lane);
  const range = noticeRange(veh.type, veh.v);

  if (zone === 'zebra' || zone === 'zebra-curb') {
    const z = zebraAt(road, ped.x)!;
    const stopX = veh.dir === 1 ? z.x0 - ZEBRA_GAP : z.x1 + ZEBRA_GAP;
    const toLine = (stopX - veh.front) * veh.dir;
    // waiting at the kerb only matters to the lane next to the pedestrian (and both once they step out)
    const relevant = zone === 'zebra' || nearSideLane(road, ped.y) === veh.lane;
    if (relevant && toLine >= -2 && toLine < range + 40) return { action: 'yield', stopX, zebra: z };
    if (zone === 'zebra' && inLane && (alongside || (ahead > -PED_HALF && ahead < range)))
      return { action: 'brake', stopX: ped.x - veh.dir * (veh.type.stopGap * 0.6 + PED_HALF), reason: 'zebra-late' };
    return { action: 'go' };
  }
  if (zone === 'road' && inLane && (alongside || (ahead > -PED_HALF && ahead < range)))
    return { action: 'brake', stopX: ped.x - veh.dir * (veh.type.stopGap + PED_HALF), reason: 'jaywalk' };
  return { action: 'go' };
}

/** The lane closest to a pedestrian standing at the kerb. */
export function nearSideLane(road: Road, y: number): number {
  let best = 0;
  let bd = Infinity;
  road.lanes.forEach((l, i) => {
    const d = Math.abs((l.top + l.bottom) / 2 - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Where the front bumper must stop so it queues behind the rear of the vehicle ahead. */
export const queueStop = (aheadRear: number, dir: Dir) => aheadRear - dir * QUEUE_GAP;

// ---------------------------------------------------------------- incidents ---

export interface Incident {
  severity: 1 | 2 | 3;
  nearMiss: boolean;
  hard: boolean;
}

/**
 * How bad a sudden stop was, from the speed when the driver hit the brakes and
 * the room they had. A fast car that needs more than its hardest braking (or
 * ends up a few pixels away) is a near miss.
 */
export function classifyIncident(t: VehicleType, v: number, room: number): Incident {
  const need = decelNeeded(v, Math.max(0.01, room));
  const nearMiss = v > 30 && (need > t.hardBrake * 0.85 || room < 14 || (v > 90 && room < 80));
  const hard = v > 25 && need > t.brake * 1.2;
  return { severity: nearMiss ? 3 : hard ? 2 : 1, nearMiss, hard };
}

export type Escalation = 'none' | 'intervene' | 'serious';

/** What happens on the n-th road incident of the day. */
export function roadEscalation(count: number): Escalation {
  if (count === ROAD_LIMITS.serious) return 'serious';
  if (count === ROAD_LIMITS.intervene) return 'intervene';
  return 'none';
}

/** Can a new incident count yet? (one stop by three cars at once is still one incident) */
export const incidentCounts = (now: number, lastAt: number | null) => lastAt === null || now - lastAt >= ROAD_LIMITS.cooldownMs;

// ---------------------------------------------------------------- lines ---

export const DRIVER_LINES: string[][] = [
  // 0 — first honk
  ['Hey! Get off the road!', 'Use the zebra crossing!', 'Look before you cross!', 'Whoa! Watch where you walk!', 'The crossing is right there!', 'Careful! Cars come fast here!'],
  // 1 — still there
  ['Are you trying to get hurt?!', 'Move! You are blocking traffic!', 'This is a road, not a playground!', 'Please, get back on the sidewalk!', 'I almost didn’t see you!'],
  // 2 — really?!
  ['I am calling your parents!', 'Everyone is waiting! Off the road, now!', 'Do your parents know you do this?!', 'One day a driver won’t stop in time!'],
];

export const NEAR_MISS_LINES = ['WHOA! I nearly hit you!', 'That was way too close!', 'My heart! Look before you step out!', 'Stop, look, then cross. Always!'];
export const ZEBRA_THANKS = ['Go ahead!', 'After you!', 'Safe crossing!', 'Take care!'];
export const ZEBRA_DAWDLE = ['Take your time… but do cross!', 'All good? Off you go!', 'We are waiting, buddy!'];
export const QUEUE_LINES = ['What’s the hold-up?!', 'Come on, move!', 'Someone is in the road!'];

export const ROAD_LESSON = 'Stop, look both ways, cross at the zebra.';

/** Escalation level for the n-th honk at the same pedestrian (0-based). */
export const scoldLevel = (honks: number) => Math.min(DRIVER_LINES.length - 1, Math.floor(honks / 2));

/**
 * Picks lines without repeating until every line of a pool has been used
 * (and never the same line twice in a row across a pool refill).
 */
export class LinePicker {
  private used = new Map<readonly string[], string[]>();
  private last: string | null = null;
  constructor(private rnd: () => number = Math.random) {}

  pick(pool: readonly string[]): string {
    let left = (this.used.get(pool) ?? []).length ? this.used.get(pool)! : [];
    if (!left.length) left = pool.filter((l) => l !== this.last || pool.length === 1);
    const i = Math.floor(this.rnd() * left.length) % left.length;
    const line = left[i];
    this.used.set(
      pool,
      left.filter((_, j) => j !== i),
    );
    this.last = line;
    return line;
  }
}

// ---------------------------------------------------------------- looking ---

export type Facing = 'left' | 'right' | 'up' | 'down';

/**
 * Remembers which way the pedestrian has been facing while waiting at the kerb,
 * so stepping onto the zebra after looking left AND right counts as a safe crossing.
 */
export class LookTracker {
  private seen: { facing: Facing; at: number }[] = [];
  /** looks older than this (ms) are forgotten */
  constructor(readonly windowMs = 5000) {}

  sample(facing: Facing, at: number, zone: Zone) {
    if (zone !== 'curb' && zone !== 'zebra-curb') return;
    if (facing !== 'left' && facing !== 'right') return;
    const last = this.seen[this.seen.length - 1];
    if (last && last.facing === facing) last.at = at;
    else this.seen.push({ facing, at });
    this.seen = this.seen.filter((s) => at - s.at <= this.windowMs).slice(-8);
  }

  lookedBothWays(at: number): boolean {
    const recent = this.seen.filter((s) => at - s.at <= this.windowMs);
    return recent.some((s) => s.facing === 'left') && recent.some((s) => s.facing === 'right');
  }

  reset() {
    this.seen = [];
  }
}

// ---------------------------------------------------------------- spawning ---

/** Deterministic-ish spawn schedule: kind and delay (ms) for the next vehicle in a lane. */
export function nextSpawn(rnd: () => number, busy = 1): { kind: Exclude<VehicleKind, 'bus'>; delayMs: number } {
  const r = rnd();
  const kind = r < 0.28 ? 'scooter' : r < 0.84 ? 'car' : 'fast';
  const delayMs = Math.round((2600 + rnd() * 5200) / busy);
  return { kind, delayMs };
}
