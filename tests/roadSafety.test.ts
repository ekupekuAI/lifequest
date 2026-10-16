import { describe, expect, it } from 'vitest';
import {
  DRIVER_LINES,
  LinePicker,
  LookTracker,
  ROAD_LIMITS,
  VEHICLES,
  classifyIncident,
  decelNeeded,
  decide,
  incidentCounts,
  lanesAt,
  nextSpawn,
  noticeRange,
  roadEscalation,
  scoldLevel,
  speedToStop,
  stoppingDistance,
  zoneAt,
  type Road,
  type VehicleView,
} from '../src/core/roadSafety';
import { mulberry32 } from '../src/core/systems';

// Town road: rows 11–13 (y 176..224), centre line at 200, zebras at x 96..128 and 384..416
const ROAD: Road = {
  top: 176,
  bottom: 224,
  lanes: [
    { dir: 1, top: 176, bottom: 200 },
    { dir: -1, top: 200, bottom: 224 },
  ],
  zebras: [
    { x0: 96, x1: 128 },
    { x0: 384, x1: 416 },
  ],
};

const car = (front: number, v = VEHICLES.car.cruise, lane = 0, kind: keyof typeof VEHICLES = 'car'): VehicleView => {
  const dir = ROAD.lanes[lane].dir;
  return { type: VEHICLES[kind], dir, lane, front, rear: front - dir * 32, v };
};

describe('zones and lanes', () => {
  it('tells sidewalk, kerb, zebra and live lane apart', () => {
    expect(zoneAt(ROAD, 250, 120)).toBe('off');
    expect(zoneAt(ROAD, 250, 170)).toBe('curb');
    expect(zoneAt(ROAD, 110, 170)).toBe('zebra-curb');
    expect(zoneAt(ROAD, 110, 190)).toBe('zebra');
    expect(zoneAt(ROAD, 250, 190)).toBe('road');
    expect(zoneAt(ROAD, 250, 232)).toBe('curb');
  });

  it('finds the lane under the feet; the centre line blocks both lanes', () => {
    expect(lanesAt(ROAD, 185)).toEqual([0]);
    expect(lanesAt(ROAD, 215)).toEqual([1]);
    expect(lanesAt(ROAD, 200)).toEqual([0, 1]);
    expect(lanesAt(ROAD, 150)).toEqual([]);
  });
});

describe('stopping physics', () => {
  it('stopping distance grows with the square of speed', () => {
    expect(stoppingDistance(0, 100)).toBe(0);
    expect(stoppingDistance(40, 100)).toBe(8);
    expect(stoppingDistance(80, 100)).toBe(32);
    expect(decelNeeded(80, 32)).toBe(100);
    expect(decelNeeded(80, 0)).toBe(Infinity);
  });

  it('fast cars notice later relative to their braking need', () => {
    const fast = VEHICLES.fast;
    const slow = VEHICLES.scooter;
    const spareFast = noticeRange(fast, fast.cruise) - stoppingDistance(fast.cruise, fast.brake);
    const spareSlow = noticeRange(slow, slow.cruise) - stoppingDistance(slow.cruise, slow.brake);
    expect(spareSlow).toBeGreaterThan(spareFast);
  });

  it('speedToStop never overshoots the stop line', () => {
    let x = 0;
    let v = 70;
    for (let i = 0; i < 400; i++) {
      v = Math.min(v, speedToStop(x, 50, 1, 80));
      x += v / 60;
    }
    expect(x).toBeLessThanOrEqual(50);
    expect(x).toBeGreaterThan(48);
    expect(speedToStop(60, 50, 1, 80)).toBe(0);
    expect(speedToStop(0, 50, 1, 80)).toBeCloseTo(Math.sqrt(2 * 80 * 50));
  });
});

describe('zebra vs jaywalk decisions', () => {
  it('yields before the stripes for someone on the zebra, in either lane', () => {
    const d = decide(ROAD, car(60), { x: 112, y: 212 });
    expect(d.action).toBe('yield');
    if (d.action === 'yield') expect(d.stopX).toBeLessThan(96);
    const w = decide(ROAD, car(170, 68, 1), { x: 112, y: 186 });
    expect(w.action).toBe('yield');
    if (w.action === 'yield') expect(w.stopX).toBeGreaterThan(128);
  });

  it('yields for someone waiting at the zebra kerb on its side', () => {
    expect(decide(ROAD, car(60), { x: 112, y: 168 }).action).toBe('yield');
    expect(decide(ROAD, car(170, 68, 1), { x: 112, y: 168 }).action).toBe('go'); // far lane waits until they step out
  });

  it('brakes, stopping short, for a jaywalker in its lane', () => {
    const d = decide(ROAD, car(200), { x: 260, y: 186 });
    expect(d.action).toBe('brake');
    if (d.action === 'brake') {
      expect(d.reason).toBe('jaywalk');
      expect(d.stopX).toBeLessThan(260 - 6);
    }
  });

  it('ignores pedestrians in the other lane, behind, or far ahead', () => {
    expect(decide(ROAD, car(200), { x: 260, y: 215 }).action).toBe('go');
    expect(decide(ROAD, car(300), { x: 260, y: 186 }).action).toBe('go');
    expect(decide(ROAD, car(0), { x: 600, y: 186 }).action).toBe('go');
    expect(decide(ROAD, car(200), null).action).toBe('go');
  });

  it('a car already on the stripes stops for the walker without a telling-off reason', () => {
    const d = decide(ROAD, car(100), { x: 120, y: 186 });
    expect(d).toMatchObject({ action: 'brake', reason: 'zebra-late' });
  });
});

describe('incidents and escalation', () => {
  it('rates sudden stops by speed and room', () => {
    expect(classifyIncident(VEHICLES.scooter, 40, 60).severity).toBe(1);
    expect(classifyIncident(VEHICLES.car, 68, 20)).toMatchObject({ severity: 2, hard: true, nearMiss: false });
    expect(classifyIncident(VEHICLES.fast, 112, 12)).toMatchObject({ severity: 3, nearMiss: true });
  });

  it('a family member steps in on the third incident, more seriously on the sixth', () => {
    const steps = Array.from({ length: 7 }, (_, i) => roadEscalation(i + 1));
    expect(steps).toEqual(['none', 'none', 'intervene', 'none', 'none', 'serious', 'none']);
    expect(ROAD_LIMITS.intervene).toBe(3);
  });

  it('several cars stopping at once count as one incident', () => {
    expect(incidentCounts(1000, null)).toBe(true);
    expect(incidentCounts(2000, 1000)).toBe(false);
    expect(incidentCounts(1000 + ROAD_LIMITS.cooldownMs, 1000)).toBe(true);
  });

  it('driver lines escalate the longer you stay', () => {
    expect(scoldLevel(0)).toBe(0);
    expect(scoldLevel(2)).toBe(1);
    expect(scoldLevel(50)).toBe(DRIVER_LINES.length - 1);
  });
});

describe('line variety', () => {
  it('uses every line of a pool before repeating, never twice in a row', () => {
    const p = new LinePicker(mulberry32(3));
    const pool = DRIVER_LINES[0];
    const first = Array.from({ length: pool.length }, () => p.pick(pool));
    expect(new Set(first).size).toBe(pool.length);
    let prev = first[first.length - 1];
    for (let i = 0; i < 40; i++) {
      const l = p.pick(pool);
      expect(l).not.toBe(prev);
      prev = l;
    }
  });
});

describe('looking both ways', () => {
  it('counts only when the player faced left and right at the kerb recently', () => {
    const t = new LookTracker(4000);
    t.sample('left', 0, 'zebra-curb');
    expect(t.lookedBothWays(100)).toBe(false);
    t.sample('right', 600, 'zebra-curb');
    expect(t.lookedBothWays(700)).toBe(true);
    expect(t.lookedBothWays(6000)).toBe(false); // too long ago
    t.reset();
    t.sample('left', 0, 'off');
    t.sample('right', 100, 'off');
    expect(t.lookedBothWays(200)).toBe(false); // not at the kerb
  });
});

describe('spawning', () => {
  it('is deterministic for a seed and mixes vehicle types', () => {
    const a = mulberry32(9);
    const b = mulberry32(9);
    const sa = Array.from({ length: 40 }, () => nextSpawn(a));
    const sb = Array.from({ length: 40 }, () => nextSpawn(b));
    expect(sa).toEqual(sb);
    expect(new Set(sa.map((s) => s.kind)).size).toBe(3);
    expect(Math.min(...sa.map((s) => s.delayMs))).toBeGreaterThanOrEqual(2600);
  });
});
