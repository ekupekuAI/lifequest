import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DUTY,
  angerAfter,
  angerFace,
  angerLevel,
  angryPhase,
  choreDutyActive,
  choreInteract,
  choreSlack,
  choreTick,
  dutyShouldEnd,
  dutyView,
  pickChores,
  resetAngry,
  setAngryStage,
  startAnger,
  startChoreDuty,
  triggerAngry,
  type AngryStage,
  type ChoreId,
} from '../src/core/angryMum';
import { conduct } from '../src/core/conduct';
import { ROOM_OBJECTS } from '../src/domain/homeLayout';
import { newStore, settle } from './helpers';

function fakeStage(log: string[]): AngryStage {
  return {
    ready: () => true,
    transform: (_id, _t, done) => done(),
    yell: () => {},
    count: () => {},
    deflate: () => log.push('deflate'),
    angrier: () => log.push('angrier'),
    chase: () => log.push('chase'),
    escort: (_id, done) => done(),
    lecture: () => {},
    calm: () => log.push('calm'),
    approach: (_id, done) => (log.push('approach'), done()),
    bubble: (_id, text) => text && log.push(`bubble:${text}`),
    distanceTo: () => 30,
    confiscate: (_id, done) => (log.push('confiscate'), done()),
    duty: (_id, on) => log.push(`duty:${on}`),
    dutyFx: (_id, kind) => log.push(`fx:${kind}`),
  };
}

describe('chore selection', () => {
  it('picks 3 chores by time of day (4 when furious), no duplicates', () => {
    const morning = pickChores(8 * 60, 1, 70);
    const evening = pickChores(19 * 60, 1, 70);
    expect(morning).toHaveLength(3);
    expect(morning[0]).toBe('clean-room');
    expect(evening[0]).toBe('dishes');
    expect(pickChores(14 * 60, 2, 70)[0]).toBe('sweep');
    expect(pickChores(19 * 60, 3, 95)).toHaveLength(4);
    for (const m of [0, 7 * 60, 13 * 60, 18 * 60, 22 * 60]) for (let seed = 0; seed < 6; seed++) {
      const c = pickChores(m, seed, 95);
      expect(new Set(c).size).toBe(c.length);
    }
    // the order of the rest varies with the seed
    const variants = new Set([0, 1, 2].map((seed) => pickChores(19 * 60, seed, 70).join()));
    expect(variants.size).toBeGreaterThan(1);
  });
});

describe('anger math', () => {
  it('starts high, chores cool her down (quick = more), slacking heats her up, clamped 0..100', () => {
    expect(startAnger('lecture')).toBeGreaterThanOrEqual(70);
    expect(startAnger('caught')).toBeGreaterThan(startAnger('lecture'));
    expect(angerAfter(80, { type: 'chore', quick: false })).toBe(80 - DUTY.choreDrop);
    expect(angerAfter(80, { type: 'chore', quick: true })).toBe(80 - DUTY.choreDrop - DUTY.quickBonus);
    expect(angerAfter(80, { type: 'step' })).toBeLessThan(80);
    for (const k of ['idle', 'leave', 'phone', 'sofa', 'snack', 'bed'] as const) expect(angerAfter(50, { type: 'slack', kind: k })).toBeGreaterThan(50);
    expect(angerAfter(98, { type: 'slack', kind: 'phone' })).toBe(100);
    expect(angerAfter(5, { type: 'chore', quick: true })).toBe(0);
    expect(angerFace(95)).toBe('😡');
    expect(angerFace(60)).toBe('😠');
    expect(angerFace(30)).toBe('😤');
    expect(angerFace(10)).toBe('🙂');
  });
  it('ends below ~20 anger or when every chore is done', () => {
    expect(dutyShouldEnd(19, 2)).toBe(true);
    expect(dutyShouldEnd(20, 1)).toBe(false);
    expect(dutyShouldEnd(70, 0)).toBe(true);
  });
});

describe('the duty flow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    setAngryStage(null);
    vi.useRealTimers();
  });

  function begin(minutes = 19 * 60) {
    const s = newStore();
    resetAngry(s);
    const log: string[] = [];
    setAngryStage(fakeStage(log));
    s.state.clock.minutes = Math.floor(s.state.clock.minutes / 1440) * 1440 + minutes;
    const mum = s.memberByRole('mother', 'father', 'guardian', 'grandparent')!;
    expect(choreDutyActive(s)).toBe(false);
    expect(angerLevel(s)).toBe(0);
    expect(startChoreDuty(s, { path: 'lecture', memberId: mum.id })).toBe(true);
    settle(s);
    return { s, log, mum };
  }

  function finishChore(s: ReturnType<typeof newStore>, id: ChoreId) {
    const w = s.state.world;
    if (id === 'dishes') for (let i = 0; i < DUTY.dishes; i++) choreInteract(s, 'duty:dish');
    if (id === 'sweep') for (let i = 0; i < DUTY.dust; i++) choreInteract(s, `duty:dust:${i}`);
    if (id === 'laundry') for (let i = 0; i < DUTY.fold; i++) choreInteract(s, 'duty:fold');
    if (id === 'trash') {
      choreInteract(s, 'duty:trash');
      choreInteract(s, 'duty:trash-out');
    }
    if (id === 'clean-room')
      for (const o of ROOM_OBJECTS) {
        choreInteract(s, `duty:room:${o.id}`);
        expect(w[`room.${o.id}`]).toBe('held');
        choreInteract(s, `duty:put:${o.dest}`);
        expect(w[`room.${o.id}`]).toBe('placed');
      }
    settle(s);
  }

  it('confiscates the phone and the TV, exposes choreDutyActive / angerLevel', () => {
    const { s, log } = begin();
    expect(log).toEqual(expect.arrayContaining(['confiscate', 'duty:true']));
    expect(choreDutyActive(s)).toBe(true);
    expect(angerLevel(s)).toBe(startAnger('lecture'));
    const c = conduct(s);
    expect(c.tvBanned).toBe(true);
    expect(c.phoneTakenUntil! - s.state.clock.minutes).toBeGreaterThan(600);
    expect(dutyView(s)!.chores.length).toBe(3);
    // the declaration line was said
    expect(triggerAngry(s, 'demo', { force: true })).toBe(false); // no new episode during duty
  });

  it('snacks, sofa and leaving are refused and raise anger; standing still too', () => {
    const { s, log } = begin();
    const a0 = angerLevel(s);
    choreInteract(s, 'duty:no:fridge');
    expect(log.some((l) => l === 'bubble:Nice try.')).toBe(true);
    expect(angerLevel(s)).toBe(a0 + DUTY.slack.snack);
    expect(choreSlack(s, 'snack')).toBeNull(); // not twice in a row
    choreInteract(s, 'duty:no:sofa');
    expect(angerLevel(s)).toBe(a0 + DUTY.slack.snack + DUTY.slack.sofa);
    choreSlack(s, 'leave');
    expect(s.ui.dialogue?.[0].text).toMatch(/Where do you think you're going/);
    expect(s.ui.dialogue?.[0].mood).toBe('stern');
    settle(s);
    const a1 = angerLevel(s);
    choreTick(s, DUTY.idleMs + 10, false);
    expect(angerLevel(s)).toBe(Math.min(100, a1 + DUTY.slack.idle));
  });

  it('completing every chore ends duty: phone & TV back, conduct + memory, making-up follows', () => {
    const { s, log, mum } = begin();
    const t0 = mum.trust;
    const chores = dutyView(s)!.chores.map((c) => c.id);
    const a0 = angerLevel(s);
    finishChore(s, chores[0]);
    expect(angerLevel(s)).toBeLessThan(a0 - DUTY.choreDrop + 1);
    for (const c of chores.slice(1)) if (choreDutyActive(s)) finishChore(s, c);
    expect(choreDutyActive(s)).toBe(false);
    expect(angerLevel(s)).toBe(0);
    const c = conduct(s);
    expect(c.phoneTakenUntil).toBeUndefined();
    expect(c.tvBanned).toBe(false);
    expect(c.log.some((e) => e.kind === 'respect' && e.severity === 2 && /chore duty/i.test(e.text))).toBe(true);
    expect(s.state.memories!.some((m) => m.id.startsWith('chores@'))).toBe(true);
    expect(mum.trust).toBeGreaterThan(t0);
    expect(log).toContain('duty:false');
    expect(angryPhase(s)).toBe('cool');
  });

  it('a severe episode keeps a short phone lock after duty', () => {
    const s = newStore();
    resetAngry(s);
    setAngryStage(fakeStage([]));
    const mum = s.memberByRole('mother', 'father', 'guardian', 'grandparent')!;
    startChoreDuty(s, { path: 'caught', memberId: mum.id, anger: 30 });
    settle(s);
    const first = dutyView(s)!.chores[0].id;
    finishChore(s, first); // 30 → below 20: she softens early
    expect(choreDutyActive(s)).toBe(false);
    const c = conduct(s);
    expect(c.phoneTakenUntil! - s.state.clock.minutes).toBeGreaterThan(0);
    expect(c.phoneTakenUntil! - s.state.clock.minutes).toBeLessThanOrEqual(30);
  });

  it('expires with the day (sleeping through it never keeps it forever)', () => {
    const { s } = begin();
    s.state.clock = { ...s.state.clock, day: s.state.clock.day + 1 };
    choreTick(s, 16, true);
    expect(choreDutyActive(s)).toBe(false);
    expect(s.state.world['duty.on']).toBeUndefined();
  });

  it('a lecture path ends in chore duty instead of instant chores', () => {
    const s = newStore();
    resetAngry(s);
    const log: string[] = [];
    setAngryStage({ ...fakeStage(log), chase: (_id, h) => setTimeout(() => h.caught(), 50) });
    triggerAngry(s, 'demo', { force: true });
    s.advanceDialogue();
    s.choose(s.ui.dialogue![0].choices!.findIndex((c) => /RUN/.test(c.label)));
    settle(s);
    expect(choreDutyActive(s)).toBe(true);
    expect(angerLevel(s)).toBe(startAnger('caught'));
    expect(log).toContain('confiscate');
  });
});
