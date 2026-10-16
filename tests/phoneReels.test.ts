import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PHONE_RATE,
  REEL_KINDS,
  accrue,
  batteryFor,
  compact,
  conductReflections,
  crossed,
  kindAt,
  makeFeed,
  makeReel,
  phoneLock,
  screenTier,
  tickedCount,
  todayConduct,
  unreadAlerts,
} from '../src/core/reels';
import { SCREEN_LIMITS, addScreenTime, conduct, phoneAllowed } from '../src/core/conduct';
import { newStore } from './helpers';

describe('reel generation', () => {
  it('is deterministic for the same seed and index', () => {
    expect(makeReel(7, 3)).toEqual(makeReel(7, 3));
    expect(makeFeed(99, 0, 25)).toEqual(makeFeed(99, 0, 25));
  });

  it('differs between seeds', () => {
    const a = makeFeed(1, 0, 10).map((r) => r.caption + r.kind);
    const b = makeFeed(2, 0, 10).map((r) => r.caption + r.kind);
    expect(a).not.toEqual(b);
  });

  it('never shows the same kind twice in a row, and covers every kind', () => {
    for (const seed of [1, 42, 4242, 31337]) {
      const kinds = Array.from({ length: 200 }, (_, i) => kindAt(seed, i));
      for (let i = 1; i < kinds.length; i++) expect(kinds[i]).not.toBe(kinds[i - 1]);
      expect(new Set(kinds.slice(0, REEL_KINDS.length)).size).toBe(REEL_KINDS.length);
    }
  });

  it('produces sane counters and unique ids', () => {
    const feed = makeFeed(5, 0, 50);
    expect(new Set(feed.map((r) => r.id)).size).toBe(50);
    for (const r of feed) {
      expect(r.likes).toBeGreaterThan(0);
      expect(r.comments).toBeLessThan(r.likes);
      expect(r.caption.length).toBeGreaterThan(5);
      expect(r.handle.startsWith('@')).toBe(true);
    }
  });

  it('ticks counters up while watching and formats compactly', () => {
    expect(tickedCount(100, 0, 3)).toBe(100);
    expect(tickedCount(100, 2.5, 3)).toBe(107);
    expect(tickedCount(100, -4, 3)).toBe(100);
    expect(compact(950)).toBe('950');
    expect(compact(12400)).toBe('12.4K');
    expect(compact(2000)).toBe('2K');
    expect(compact(1_250_000)).toBe('1.3M');
  });
});

describe('time accrual', () => {
  it('turns real seconds of scrolling into 2 game minutes each', () => {
    expect(PHONE_RATE.reels).toBe(2);
    expect(accrue(0, 1000, PHONE_RATE.reels)).toEqual({ minutes: 2, carry: 0 });
  });

  it('carries fractions between ticks without losing time', () => {
    let carry = 0;
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const r = accrue(carry, 125, PHONE_RATE.reels); // 8 ticks per second
      carry = r.carry;
      total += r.minutes;
    }
    expect(total).toBe(10); // 5 s × 2 min
    expect(carry).toBeCloseTo(0, 6);
  });

  it('ignores negative time and stops when locked', () => {
    expect(accrue(0.5, -500, 2)).toEqual({ minutes: 0, carry: 0.5 });
    expect(accrue(0, 10_000, PHONE_RATE.locked).minutes).toBe(0);
  });

  it('drains the battery but never to zero', () => {
    expect(batteryFor(0)).toBe(100);
    expect(batteryFor(50)).toBe(60);
    expect(batteryFor(500)).toBe(4);
  });
});

describe('screen tiers', () => {
  it('maps minutes to the conduct limits', () => {
    expect(screenTier(0)).toBe('none');
    expect(screenTier(5)).toBe('ok');
    expect(screenTier(SCREEN_LIMITS.nudge)).toBe('nudge');
    expect(screenTier(SCREEN_LIMITS.scold + 1)).toBe('scold');
    expect(screenTier(SCREEN_LIMITS.confiscate)).toBe('confiscate');
  });

  it('detects crossing a limit exactly once', () => {
    expect(crossed(28, 30, 30)).toBe(true);
    expect(crossed(30, 32, 30)).toBe(false);
    expect(crossed(10, 12, 30)).toBe(false);
  });

  it('suggests reflections that match the day', () => {
    expect(conductReflections({ screenMinutes: 0, fights: 0, roadWarnings: 0, napMinutes: 0 })).toEqual([]);
    const all = conductReflections({ screenMinutes: 45, fights: 1, roadWarnings: 2, napMinutes: 0 });
    expect(all).toContain("I'll put my phone down earlier");
    expect(all).toContain("I'll use words, not hands");
    expect(all).toContain("I'll cross at the zebra");
  });
});

describe('phone lock & conduct views (store)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads today without creating or mutating conduct state', () => {
    const s = newStore();
    delete s.state.conduct;
    const c = todayConduct(s.state);
    expect(c.screenMinutes).toBe(0);
    expect(s.state.conduct).toBeUndefined();
  });

  it('treats yesterday\'s counters as zero but keeps the log', () => {
    const s = newStore();
    const c = conduct(s);
    c.screenMinutes = 50;
    c.log.push({ at: 600, day: 1, kind: 'screen', severity: 1, text: 'x' });
    s.state.clock.day = 2;
    const t = todayConduct(s.state);
    expect(t.screenMinutes).toBe(0);
    expect(t.log).toHaveLength(1);
  });

  it('locks the phone after the confiscate limit, matching phoneAllowed', () => {
    const s = newStore();
    expect(phoneLock(s.state).locked).toBe(false);
    addScreenTime(s, SCREEN_LIMITS.confiscate, 'phone');
    expect(phoneAllowed(s)).toBe(false);
    const lock = phoneLock(s.state);
    expect(lock.locked).toBe(true);
    expect(lock.until).toBe(s.state.clock.minutes + 120);
    s.spendTime(121);
    expect(phoneLock(s.state).locked).toBe(false);
    expect(phoneAllowed(s)).toBe(true);
  });

  it('counts unread alerts raised by escalation', () => {
    const s = newStore();
    addScreenTime(s, SCREEN_LIMITS.scold, 'phone');
    expect(unreadAlerts(s.state)).toBeGreaterThan(0);
    conduct(s).alerts.forEach((a) => (a.read = true));
    expect(unreadAlerts(s.state)).toBe(0);
  });
});
