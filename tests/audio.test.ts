import { describe, expect, it } from 'vitest';
import {
  MOODS,
  MOOD_IDS,
  SCALES,
  bassPattern,
  chordDegrees,
  chordMidi,
  composeMelody,
  degreeToMidi,
  midiToFreq,
  mulberry32,
  parsePattern,
  pickMood,
  timeOfDay,
  type MoodInput,
} from '../src/core/music';
import { isRaining, pickAmbience } from '../src/core/ambience';

const H = 60;
function snap(over: { screen?: string; modal?: string | null; location?: string; minutes?: number; inQueue?: boolean; deadlineAt?: number | null; rainUntil?: number } = {}): MoodInput & { state: { world: Record<string, unknown> } } {
  return {
    ui: { screen: over.screen ?? 'game', modal: over.modal ? { type: over.modal } : null },
    state: {
      location: over.location ?? 'home',
      clock: { minutes: over.minutes ?? 9 * H },
      inQueue: over.inQueue ?? false,
      run: over.deadlineAt === undefined ? null : { deadlineAt: over.deadlineAt },
      world: over.rainUntil !== undefined ? { rainUntil: over.rainUntil } : {},
    },
  };
}

describe('timeOfDay', () => {
  it('splits day / evening / night at 6 PM and 8 PM', () => {
    expect(timeOfDay(9 * H)).toBe('day');
    expect(timeOfDay(17 * H + 59)).toBe('day');
    expect(timeOfDay(18 * H)).toBe('evening');
    expect(timeOfDay(19 * H + 59)).toBe('evening');
    expect(timeOfDay(20 * H)).toBe('night');
    expect(timeOfDay(2 * H)).toBe('night');
    expect(timeOfDay(1440 + 10 * H)).toBe('day'); // wraps past midnight
  });
});

describe('pickMood', () => {
  it('uses the title tune outside the game', () => {
    expect(pickMood(snap({ screen: 'start' }))).toBe('title');
    expect(pickMood(snap({ screen: 'setup' }))).toBe('title');
    expect(pickMood(snap({ screen: 'parent' }))).toBe('title');
  });
  it('follows location and time of day', () => {
    expect(pickMood(snap({ location: 'home', minutes: 9 * H }))).toBe('home-day');
    expect(pickMood(snap({ location: 'home', minutes: 19 * H }))).toBe('home-evening');
    expect(pickMood(snap({ location: 'home', minutes: 21 * H }))).toBe('night');
    expect(pickMood(snap({ location: 'town', minutes: 9 * H }))).toBe('town-day');
    expect(pickMood(snap({ location: 'town', minutes: 18.5 * H }))).toBe('town-evening');
    expect(pickMood(snap({ location: 'town', minutes: 22 * H }))).toBe('night');
    expect(pickMood(snap({ location: 'grocery' }))).toBe('shop');
    expect(pickMood(snap({ location: 'clinic' }))).toBe('clinic');
    expect(pickMood(snap({ location: 'city' }))).toBe('city');
    expect(pickMood(snap({ location: 'library' }))).toBe('library');
  });
  it('queue and tension override the location', () => {
    expect(pickMood(snap({ location: 'grocery', inQueue: true }))).toBe('queue');
    expect(pickMood(snap({ location: 'grocery', minutes: 600, deadlineAt: 605 }))).toBe('tension');
    expect(pickMood(snap({ location: 'grocery', minutes: 600, deadlineAt: 605, inQueue: true }))).toBe('tension');
    expect(pickMood(snap({ location: 'grocery', minutes: 600, deadlineAt: 620 }))).toBe('shop');
    expect(pickMood(snap({ location: 'grocery', minutes: 600, deadlineAt: 590 }))).toBe('shop'); // already late
    expect(pickMood(snap({ location: 'grocery', minutes: 600, deadlineAt: null }))).toBe('shop');
  });
  it('calms down on the results screen', () => {
    expect(pickMood(snap({ modal: 'results', minutes: 600, deadlineAt: 605 }))).toBe('home-evening');
  });
  it('every mood id has a definition with the requested tempo', () => {
    const bpm: Record<string, number> = { title: 92, 'home-day': 84, 'home-evening': 76, 'town-day': 100, 'town-evening': 88, night: 70, shop: 96, clinic: 66, city: 104, library: 72, tension: 112, queue: 80 };
    for (const id of MOOD_IDS) expect(MOODS[id].bpm).toBe(bpm[id]);
    expect(MOOD_IDS).toHaveLength(12);
  });
});

describe('scales & chords', () => {
  it('maps scale degrees to MIDI across octaves', () => {
    expect(degreeToMidi(60, 'major', 0)).toBe(60);
    expect(degreeToMidi(60, 'major', 2)).toBe(64);
    expect(degreeToMidi(60, 'major', 7)).toBe(72);
    expect(degreeToMidi(60, 'major', -1)).toBe(59);
    expect(degreeToMidi(57, 'minor', 2)).toBe(60);
    expect(SCALES.dorian[5]).toBe(9);
  });
  it('builds diatonic triads and sevenths', () => {
    expect(chordDegrees(0)).toEqual([0, 2, 4]);
    expect(chordMidi(60, 'major', 0)).toEqual([60, 64, 67]); // C
    expect(chordMidi(60, 'major', 5)).toEqual([69, 72, 76]); // Am
    expect(chordMidi(60, 'major', 4, 4)).toEqual([67, 71, 74, 77]); // G7
    expect(chordMidi(60, 'major', 0, 4)).toEqual([60, 64, 67, 71]); // Cmaj7
  });
  it('converts MIDI to frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });
  it('parses drum strings and bass patterns fit in a bar', () => {
    expect(parsePattern('x.o.............').slice(0, 3)).toEqual([1, 0, 0.55]);
    for (const st of ['whole', 'half', 'quarter', 'walk', 'pulse', 'bossa'] as const) {
      for (const [s, len] of bassPattern(st, 3)) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s + len).toBeLessThanOrEqual(16);
      }
    }
  });
});

describe('seeded melodies', () => {
  it('mulberry32 is deterministic', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it('the same mood composes the same melody every time', () => {
    for (const id of MOOD_IDS) {
      expect(composeMelody(MOODS[id], 0)).toEqual(composeMelody(MOODS[id], 0));
      expect(composeMelody(MOODS[id], 1)).toEqual(composeMelody(MOODS[id], 1));
    }
  });
  it('variations keep the opening motif but change the B section', () => {
    const m = MOODS['town-day'];
    const v0 = composeMelody(m, 0);
    const v1 = composeMelody(m, 1);
    const bar = (ns: typeof v0, b: number) => ns.filter((n) => n.bar === b).map((n) => [n.step, n.degree]);
    expect(bar(v1, 0)).toEqual(bar(v0, 0));
    expect(JSON.stringify(v1.filter((n) => n.bar === 4 || n.bar === 5))).not.toEqual(JSON.stringify(v0.filter((n) => n.bar === 4 || n.bar === 5)));
  });
  it('melodies stay in range, inside their bar, and end on the tonic', () => {
    for (const id of MOOD_IDS) {
      const ns = composeMelody(MOODS[id], 0);
      expect(ns.length).toBeGreaterThan(4);
      for (const n of ns) {
        expect(n.degree).toBeGreaterThanOrEqual(-3);
        expect(n.degree).toBeLessThanOrEqual(11);
        expect(n.step + n.len).toBeLessThanOrEqual(16);
        expect(n.bar).toBeLessThan(MOODS[id].prog.length);
      }
      const last = ns[ns.length - 1];
      expect(last.bar).toBe(7);
      expect(last.degree % 7).toBe(0);
    }
  });
});

describe('pickAmbience', () => {
  it('is silent outside the game', () => {
    const sc = pickAmbience(snap({ screen: 'start' }));
    expect(sc.beds).toEqual({});
    expect(sc.events).toEqual({});
  });
  it('birds and traffic in town by day, crickets at night', () => {
    const day = pickAmbience(snap({ location: 'town', minutes: 10 * H }));
    expect(day.events.bird).toBeGreaterThan(0);
    expect(day.beds.traffic).toBeGreaterThan(0);
    expect(day.indoor).toBe(false);
    const night = pickAmbience(snap({ location: 'town', minutes: 22 * H }));
    expect(night.events.cricket).toBeGreaterThan(0);
    expect(night.events.bird).toBeUndefined();
  });
  it('rain outdoors vs muffled rain on the roof indoors', () => {
    const out = pickAmbience(snap({ location: 'town', minutes: 600, rainUntil: 700 }));
    expect(out.beds.rain).toBe(1);
    expect(out.events.bird).toBeUndefined();
    const home = pickAmbience(snap({ location: 'home', minutes: 600, rainUntil: 700 }));
    expect(home.beds.rainRoof).toBeGreaterThan(0);
    expect(home.beds.rain).toBeUndefined();
    expect(isRaining({ location: 'town', clock: { minutes: 800 }, world: { rainUntil: 700 } })).toBe(false);
  });
  it('indoor places have their own beds', () => {
    expect(pickAmbience(snap({ location: 'grocery' })).events.beep).toBeGreaterThan(0);
    expect(pickAmbience(snap({ location: 'clinic' })).beds.aircon).toBeGreaterThan(0);
    expect(pickAmbience(snap({ location: 'library' })).events.page).toBeGreaterThan(0);
    expect(pickAmbience(snap({ location: 'home', minutes: 19 * H })).tick).toBe(true);
    expect(pickAmbience(snap({ location: 'home', minutes: 10 * H })).tick).toBe(false);
  });
});
