import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_CONFIG, advanceClock, formatClock, formatDuration } from '../src/core/systems';
import { newStore } from './helpers';

describe('formatClock', () => {
  it('formats afternoon times in 12h', () => {
    expect(formatClock(16 * 60 + 30)).toBe('4:30 PM');
    expect(formatClock(TIME_CONFIG.dayStart)).toBe('4:30 PM');
  });
  it('handles midnight and noon', () => {
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(12 * 60)).toBe('12:00 PM');
    expect(formatClock(11 * 60 + 59)).toBe('11:59 AM');
    expect(formatClock(23 * 60 + 5)).toBe('11:05 PM');
  });
  it('floors fractional minutes and wraps past 24h', () => {
    expect(formatClock(16 * 60 + 30.9)).toBe('4:30 PM');
    expect(formatClock(24 * 60 + 61)).toBe('1:01 AM');
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(7.4)).toBe('7 min');
    expect(formatDuration(59)).toBe('59 min');
    expect(formatDuration(60)).toBe('1h 0m');
    expect(formatDuration(135)).toBe('2h 15m');
  });
  it('clamps negatives to 0', () => {
    expect(formatDuration(-5)).toBe('0 min');
  });
});

describe('advanceClock', () => {
  it('advances by positive minutes without mutating', () => {
    const c = { minutes: 100, day: 2 };
    expect(advanceClock(c, 5)).toEqual({ minutes: 105, day: 2 });
    expect(c.minutes).toBe(100);
  });
  it('ignores negative minutes', () => {
    expect(advanceClock({ minutes: 100, day: 1 }, -30)).toEqual({ minutes: 100, day: 1 });
  });
});

describe('GameStore.tick', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('advances 1 game minute per realMsPerGameMinute while walking', () => {
    const s = newStore();
    const t0 = s.state.clock.minutes;
    s.tick(TIME_CONFIG.realMsPerGameMinute, false);
    expect(s.state.clock.minutes).toBeCloseTo(t0 + 1);
  });

  it('does not advance time while a dialogue is open', () => {
    const s = newStore();
    s.say([{ speaker: 'Mom', text: 'Hello' }]);
    expect(s.blocking).toBe(true);
    const t0 = s.state.clock.minutes;
    s.tick(5000, true);
    expect(s.state.clock.minutes).toBe(t0);
    s.advanceDialogue();
    s.tick(1000, false);
    expect(s.state.clock.minutes).toBeCloseTo(t0 + 1);
  });

  it('does not advance time while a modal is open or off the game screen', () => {
    const s = newStore();
    const t0 = s.state.clock.minutes;
    s.openModal({ type: 'pause' });
    s.tick(5000, false);
    expect(s.state.clock.minutes).toBe(t0);
    s.openModal(null);
    s.goToScreen('parent');
    s.tick(5000, false);
    expect(s.state.clock.minutes).toBe(t0);
  });

  it('advances waitMultiplier (8x) faster while waiting in a queue', () => {
    const s = newStore();
    s.state.inQueue = true;
    s.queueWait(true);
    const t0 = s.state.clock.minutes;
    s.tick(1000, false);
    expect(s.state.clock.minutes).toBeCloseTo(t0 + TIME_CONFIG.waitMultiplier);
    expect(TIME_CONFIG.waitMultiplier).toBe(8);
    // standing in the queue without pressing "Wait" runs at normal speed
    s.queueWait(false);
    const t1 = s.state.clock.minutes;
    s.tick(1000, false);
    expect(s.state.clock.minutes).toBeCloseTo(t1 + 1);
  });

  it('drains energy only while moving', () => {
    const s = newStore();
    s.tick(10_000, false);
    expect(s.state.stats.energy).toBe(100);
    s.tick(10_000, true);
    expect(s.state.stats.energy).toBeCloseTo(100 - 0.35 * 10);
  });
});
