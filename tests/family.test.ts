import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  CODE_ENTROPY_BITS,
  CODE_WORDS,
  STATUS_STALE_MS,
  codeKind,
  currentSession,
  formatCode,
  generateFamilyCode,
  generateParentCode,
  normalizeCode,
  randomCodeChars,
  shapeStatus,
} from '../src/services/family';

describe('family codes', () => {
  it('alphabet has no ambiguous characters', () => {
    for (const ch of '01OIL') expect(CODE_ALPHABET).not.toContain(ch);
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
    expect(CODE_ALPHABET.length).toBe(31);
  });

  it('word list is 64 unique upper-case words of 4-6 letters', () => {
    expect(CODE_WORDS.length).toBe(64);
    expect(new Set(CODE_WORDS).size).toBe(64);
    for (const w of CODE_WORDS) expect(w).toMatch(/^[A-Z]{4,6}$/);
  });

  it('both code kinds carry at least 40 bits of entropy', () => {
    expect(CODE_ENTROPY_BITS.family).toBeGreaterThanOrEqual(40);
    expect(CODE_ENTROPY_BITS.parent).toBeGreaterThanOrEqual(40);
  });

  it('generates well-formed family and parent codes', () => {
    for (let i = 0; i < 200; i++) {
      const f = generateFamilyCode();
      const p = generateParentCode();
      expect(f).toMatch(new RegExp(`^[A-Z]{4,6}-[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{4}$`));
      expect(p).toMatch(new RegExp(`^P-[${CODE_ALPHABET}]{5}-[${CODE_ALPHABET}]{5}$`));
      expect(codeKind(f)).toBe('child');
      expect(codeKind(p)).toBe('parent');
    }
  });

  it('random chars reject biased bytes', () => {
    // 248..255 must be skipped; 0 -> '2', 30 -> 'Z', 31 -> '2'
    const bytes = [255, 248, 0, 30, 31];
    let i = 0;
    const rand = (n: number) => Uint8Array.from({ length: n }, () => bytes[i++ % bytes.length]);
    expect(randomCodeChars(3, rand)).toBe('2Z2');
  });

  it('normalises user input', () => {
    expect(normalizeCode(' sunny-7kd2 q9xm ')).toBe('SUNNY7KD2Q9XM');
    expect(normalizeCode('p-7kd2q-9xmrt')).toBe('P7KD2Q9XMRT');
    expect(normalizeCode('')).toBe('');
  });

  it('classifies codes by shape', () => {
    expect(codeKind('sunny 7kd2 q9xm')).toBe('child');
    expect(codeKind('PEARL-7KD2-Q9XM')).toBe('child'); // word starting with P is still a family code
    expect(codeKind('p 7kd2q 9xmrt')).toBe('parent');
    expect(codeKind('P-7KD2Q-9XMR')).toBeNull(); // too short
    expect(codeKind('SUNNY-7KD2-Q9X0')).toBeNull(); // 0 is not in the alphabet
    expect(codeKind('hello')).toBeNull();
    expect(codeKind('')).toBeNull();
  });

  it('formats codes for display', () => {
    expect(formatCode('sunny7kd2q9xm')).toBe('SUNNY-7KD2-Q9XM');
    expect(formatCode('p7kd2q9xmrt')).toBe('P-7KD2Q-9XMRT');
    expect(formatCode('what?')).toBe('WHAT');
  });
});

describe('live status shaping', () => {
  const now = Date.parse('2026-10-17T10:00:00Z');

  it('fills safe defaults for garbage input', () => {
    const s = shapeStatus(null, { gameMemberId: 'player', name: 'Asha', updatedAt: '2026-10-17T10:00:00Z' });
    expect(s.gameMemberId).toBe('player');
    expect(s.name).toBe('Asha');
    expect(s.location).toBe('home');
    expect(s.clock).toEqual({ day: 1, minutes: 0 });
    expect(s.mission).toBeNull();
    expect(s.lastResult).toBeNull();
    expect(s.reflections).toEqual([]);
    expect(s.skills).toEqual({});
    expect(s.online).toBe(false);
  });

  it('keeps valid fields, clamps and trims the rest', () => {
    const s = shapeStatus(
      {
        gameMemberId: 'spoofed',
        name: 'Spoofed',
        online: true,
        location: 'grocery',
        clock: { day: 3, minutes: 612.7 },
        wallet: 120.456,
        currency: '₹',
        energy: 180,
        mission: { id: 'grocery-run', title: 'Groceries', icon: '🛒', objectivesDone: 2, objectivesTotal: 5, nextObjective: 'Pay', timeLeft: 30, budget: 200, spent: 80 },
        lastResult: { title: 'Laundry', outcome: 'success', overall: 88, day: 2, feedback: 'x'.repeat(1000) },
        reflections: [{ day: 1, mood: 'happy', wentWell: 'a', improve: 'b' }, 'junk', {}, {}, {}],
        skills: { budget: 3, bad: 'x' as unknown as number },
        xp: 42.9,
      },
      { gameMemberId: 'child-2', name: 'Ravi', updatedAt: '2026-10-17T09:59:50Z' },
      now,
    );
    expect(s.gameMemberId).toBe('child-2'); // seat identity wins over the payload
    expect(s.name).toBe('Ravi');
    expect(s.online).toBe(true);
    expect(s.location).toBe('grocery');
    expect(s.clock).toEqual({ day: 3, minutes: 612 });
    expect(s.wallet).toBe(120.46);
    expect(s.energy).toBe(100);
    expect(s.mission?.objectivesDone).toBe(2);
    expect(s.lastResult?.feedback.length).toBe(280);
    expect(s.reflections.length).toBe(3);
    expect(s.skills).toEqual({ budget: 3 });
    expect(s.xp).toBe(42);
  });

  it('marks stale statuses offline', () => {
    const old = new Date(now - STATUS_STALE_MS - 1000).toISOString();
    expect(shapeStatus({ online: true }, { updatedAt: old }, now).online).toBe(false);
    const fresh = new Date(now - 5000).toISOString();
    expect(shapeStatus({ online: true }, { updatedAt: fresh }, now).online).toBe(true);
  });

  it('rejects unknown locations', () => {
    expect(shapeStatus({ location: 'moon' }).location).toBe('home');
  });
});

describe('session', () => {
  it('has no session without storage', () => {
    expect(currentSession()).toBeNull();
  });
});
