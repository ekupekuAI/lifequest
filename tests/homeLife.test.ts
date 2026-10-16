import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStore } from '../src/core/store';
import { TENSION, conduct } from '../src/core/conduct';
import {
  COOL_EVERY,
  FIGHT_MS,
  NAP_MS,
  SNOOZE_MS,
  TENSION_STEP,
  addTension,
  cooled,
  isSulky,
  isWatchingTv,
  pickConsequence,
  pickWakeScenario,
  provoke,
  sayingSorry,
  scoldLines,
  siblingOf,
  snoozeOutcome,
  startNap,
  tease,
  tension,
  timeoutLeft,
  tvInteract,
  watchTv,
  type FightContext,
  type WakeContext,
} from '../src/core/homeLife';
import { byLabel, idOf, newStore, settle } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type Intervention = { memberId: string; reason: string };
/** Record every `conduct` intervention; optionally act like a scene that walks the member over. */
function watchBus(s: GameStore, handle = false) {
  const seen: Intervention[] = [];
  s.bus.on('conduct', (ev) => {
    seen.push({ memberId: ev.memberId, reason: ev.reason });
    if (handle) {
      ev.handled = true;
      setTimeout(ev.arrive, 500); // "walking"
    }
  });
  return seen;
}
const fxKinds = (s: GameStore) => {
  const kinds: string[] = [];
  s.bus.on('fx', (f) => kinds.push(f.kind));
  return kinds;
};
const sib = (s: GameStore) => siblingOf(s)!;

const ctx = (over: Partial<FightContext> = {}): FightContext => ({
  playerName: 'Test',
  siblingName: 'Mia',
  siblingRole: 'younger-sibling',
  responderName: 'Mum',
  responderRole: 'mother',
  starter: 'player',
  fightsToday: 1,
  minuteOfDay: 17 * 60,
  pendingTask: null,
  byPhone: false,
  ...over,
});

describe('tension math', () => {
  it('cools by 1 every COOL_EVERY minutes and never goes negative', () => {
    expect(cooled(30, 0)).toBe(30);
    expect(cooled(30, COOL_EVERY * 5)).toBe(25);
    expect(cooled(30, COOL_EVERY * 5 + 1)).toBe(25);
    expect(cooled(3, 999)).toBe(0);
    expect(cooled(10, -5)).toBe(10);
  });

  it('cools lazily as game time passes', () => {
    const s = newStore();
    addTension(s, 30);
    expect(tension(s)).toBe(30);
    s.spendTime(10);
    expect(tension(s)).toBe(25);
    s.spendTime(100);
    expect(tension(s)).toBe(0);
  });

  it('reports threshold crossings', () => {
    const s = newStore();
    const a = addTension(s, TENSION.loud - 1);
    expect(a.loud).toBe(false);
    const b = addTension(s, 1);
    expect(b.loud).toBe(true);
    expect(b.parent).toBe(false);
    const c = addTension(s, TENSION.parent - TENSION.loud);
    expect(c.parent).toBe(true);
    expect(addTension(s, 500).after).toBe(100);
  });
});

describe('sibling talk & teasing', () => {
  it('offers positive and mischievous options outside missions', () => {
    const s = newStore();
    s.talkTo(sib(s).id);
    const labels = s.ui.dialogue![0].choices!.map((c) => c.label).join(' | ');
    expect(labels).toMatch(/Play together/);
    expect(labels).toMatch(/Help with homework/); // younger sibling does homework at 4:30 PM
    expect(labels).toMatch(/Tease them/);
    expect(labels).toMatch(/Grab their pencil case/);
    expect(labels).toMatch(/Pillow fight/);
    expect(labels).not.toMatch(/Say sorry/); // nothing to apologise for yet
  });

  it('teasing raises tension, logs conduct and the sibling reacts', () => {
    const s = newStore();
    const kinds = fxKinds(s);
    s.talkTo(sib(s).id);
    const seen = settle(s, byLabel(/Tease/));
    expect(tension(s)).toBe(TENSION_STEP.tease);
    expect(conduct(s).log[0]).toMatchObject({ kind: 'fight', severity: 1 });
    expect(seen.join(' ')).toMatch(/Stop it!/);
    expect(kinds).toContain('home:stomp');
    // now "Say sorry" is available and lowers tension again
    s.talkTo(sib(s).id);
    settle(s, byLabel(/Say sorry/));
    expect(tension(s)).toBe(0);
  });

  it('the sibling cries at TENSION.loud', () => {
    const s = newStore();
    addTension(s, TENSION.loud - 5);
    tease(s, sib(s));
    s.advanceDialogue(); // the sibling's reply closes → the crying kicks in
    expect(s.ui.toasts.some((t) => /crying/.test(t.text))).toBe(true);
  });

  it('crossing TENSION.parent sends a guardian over (via the bus) with a consequence', () => {
    const s = newStore();
    const mum = idOf(s, 'mother');
    const trust0 = s.member(mum)!.trust;
    const calls = watchBus(s, true);
    addTension(s, TENSION.parent - 5);
    tease(s, sib(s));
    const seen = settle(s);
    expect(calls).toEqual([{ memberId: mum, reason: 'fight' }]);
    expect(seen.join(' ')).toMatch(/You're the older one/);
    expect(seen.join(' ')).toMatch(/time-out/);
    expect(s.member(mum)!.trust).toBe(trust0 - 4);
    expect(timeoutLeft(s)).toBeGreaterThan(0);
    expect(isSulky(s)).toBe(true);
    expect(conduct(s).alerts.length).toBe(1);
  });
});

describe('fights', () => {
  it('a fight resolves after the scene, counts, alerts and leaves the sibling sulky', () => {
    const s = newStore();
    const calls = watchBus(s);
    const kinds = fxKinds(s);
    provoke(s, sib(s), 'player');
    expect(kinds).toContain('home:fight');
    expect(conduct(s).fights).toBe(0);
    vi.advanceTimersByTime(FIGHT_MS);
    expect(conduct(s).fights).toBe(1);
    expect(tension(s)).toBe(TENSION_STEP.fight);
    expect(conduct(s).alerts[0].kind).toBe('fight');
    expect(isSulky(s)).toBe(true);
    expect(calls).toEqual([]); // one scuffle: no parent yet
    settle(s);
    // the second fight today brings a parent, with the second-fight consequence
    provoke(s, sib(s), 'player');
    vi.advanceTimersByTime(FIGHT_MS);
    const seen = settle(s);
    expect(calls.map((c) => c.reason)).toEqual(['fight']);
    expect(seen.join(' ')).toMatch(/second time today/);
    expect(seen.join(' ')).toMatch(/dishes/);
    expect(conduct(s).log.some((e) => e.severity === 3)).toBe(true);
  });

  it('making up restores trust and clears the sulk', () => {
    const s = newStore();
    const kid = sib(s);
    provoke(s, kid, 'player');
    vi.advanceTimersByTime(FIGHT_MS);
    settle(s);
    const t0 = kid.trust;
    // sulky sibling only offers sorry / mischief, not play
    s.talkTo(kid.id);
    expect(s.ui.dialogue![0].choices!.map((c) => c.label).join('|')).not.toMatch(/Play together/);
    settle(s, byLabel(/Say sorry/));
    expect(isSulky(s)).toBe(false);
    expect(kid.trust).toBe(t0 + 4);
    expect(tension(s)).toBe(TENSION_STEP.fight - 30);
    expect(s.state.memories?.some((m) => m.id.startsWith('made-up@'))).toBe(true);
  });

  it('a pillow fight is playful when tempers are calm, and gets out of hand when they are not', () => {
    const s = newStore();
    s.talkTo(sib(s).id);
    settle(s, byLabel(/Pillow fight/));
    vi.advanceTimersByTime(FIGHT_MS);
    settle(s);
    expect(conduct(s).fights).toBe(0);
    addTension(s, TENSION.loud);
    s.talkTo(sib(s).id);
    // tension ≥ 25 swaps the pillow fight for a shove; use the pillow path directly
    const choice = s.ui.dialogue![0].choices!.find((c) => /Shove/.test(c.label));
    expect(choice).toBeTruthy();
    s.closeDialogue();
  });

  it('saying sorry with nothing wrong is still sweet', () => {
    const s = newStore();
    addTension(s, 10);
    sayingSorry(s, sib(s));
    expect(tension(s)).toBe(0);
  });
});

describe('consequences & scolding are context-aware', () => {
  it('picks a fair consequence', () => {
    expect(pickConsequence(ctx({ starter: 'sibling' }))).toBe('warning');
    expect(pickConsequence(ctx({ starter: 'both' }))).toBe('warning');
    expect(pickConsequence(ctx({ starter: 'player' }))).toBe('timeout');
    expect(pickConsequence(ctx({ fightsToday: 2 }))).toBe('chores');
    expect(pickConsequence(ctx({ fightsToday: 2, pendingTask: 'Help Make Dinner' }))).toBe('task-now');
    expect(pickConsequence(ctx({ fightsToday: 3 }))).toBe('tv-ban');
  });

  it('chooses lines by who started it, fight count, time of day and pending tasks', () => {
    expect(scoldLines(ctx()).join(' ')).toMatch(/What is going on/);
    expect(scoldLines(ctx({ siblingRole: 'older-sibling' })).join(' ')).toMatch(/may be bigger/);
    expect(scoldLines(ctx({ starter: 'both' })).join(' ')).toMatch(/takes two/);
    expect(scoldLines(ctx({ starter: 'sibling' })).join(' ')).toMatch(/no hitting back/);
    expect(scoldLines(ctx({ fightsToday: 2 })).join(' ')).toMatch(/second time/);
    expect(scoldLines(ctx({ fightsToday: 3 })).join(' ')).toMatch(/had enough/);
    expect(scoldLines(ctx({ minuteOfDay: 19 * 60 })).join(' ')).toMatch(/Dinner is on the table/);
    expect(scoldLines(ctx({ minuteOfDay: 21 * 60 + 30 })).join(' ')).toMatch(/bedtime/);
    expect(scoldLines(ctx({ pendingTask: 'Laundry Day' })).join(' ')).toMatch(/"Laundry Day" still isn't done/);
    expect(scoldLines(ctx({ byPhone: true })).join(' ')).toMatch(/phoned me/);
    expect(scoldLines(ctx({ responderRole: 'older-sibling' })).join(' ')).toMatch(/Break it up/i);
    expect(scoldLines(ctx()).join(' ')).toMatch(/Use words, not hands/);
  });
});

describe('naps & sleep', () => {
  it('a nap fast-forwards the clock and restores energy', () => {
    const s = newStore();
    s.state.stats.energy = 40;
    const t0 = s.state.clock.minutes;
    s.interact('bed');
    settle(s, byLabel(/nap \(30/i));
    expect(s.state.clock.minutes).toBeLessThan(t0 + 30);
    vi.advanceTimersByTime(NAP_MS + 50);
    expect(s.state.clock.minutes).toBeCloseTo(t0 + 30, 5);
    expect(s.state.stats.energy).toBe(64);
    expect(conduct(s).napMinutes).toBe(30);
  });

  it('picks wake-up scenarios from context', () => {
    const w = (over: Partial<WakeContext>): WakeContext => ({ hasRun: false, timeLeft: null, minuteOfDay: 17 * 60, napMins: 30, siblingHome: false, siblingUpset: false, day: 1, ...over });
    expect(pickWakeScenario(w({ hasRun: true, timeLeft: 5 }))).toBe('late-task');
    expect(pickWakeScenario(w({ hasRun: true, timeLeft: -20 }))).toBe('late-task');
    expect(pickWakeScenario(w({ hasRun: true, timeLeft: 60 }))).toBe('task-reminder');
    expect(pickWakeScenario(w({ minuteOfDay: 18 * 60 + 50 }))).toBe('dinner');
    expect(pickWakeScenario(w({ napMins: 60 }))).toBe('groggy');
    expect(pickWakeScenario(w({ siblingHome: true, day: 2, minuteOfDay: 17 * 60 }))).toBe('sibling-jump');
    expect(pickWakeScenario(w({ siblingHome: true, siblingUpset: true, day: 2 }))).toBe('refreshed');
    expect(pickWakeScenario(w({}))).toBe('refreshed');
  });

  it('napping through a task brings the parent in, logs it and alerts', () => {
    const s = newStore();
    const mum = idOf(s, 'mother');
    s.acceptMission('cook-meal', mum);
    settle(s);
    s.state.run!.deadlineAt = s.state.clock.minutes + 40;
    const calls = watchBus(s, true);
    const trust0 = s.member(mum)!.trust;
    startNap(s, 30);
    vi.advanceTimersByTime(NAP_MS + 50);
    const seen = settle(s);
    expect(calls).toEqual([{ memberId: mum, reason: 'sleep' }]);
    expect(seen.join(' ')).toMatch(/You were SLEEPING\?! The soup!/);
    expect(s.member(mum)!.trust).toBe(trust0 - 4);
    expect(conduct(s).alerts.some((a) => a.kind === 'sleep')).toBe(true);
    // later, mum mentions it in chat
    s.state.run = null;
    s.talkTo(mum);
    expect(s.ui.dialogue![0].text).toMatch(/fell asleep with a task/);
  });

  it('a long nap leaves you groggy', () => {
    const s = newStore();
    startNap(s, 60);
    vi.advanceTimersByTime(NAP_MS + 50);
    expect(s.state.world['home.groggyUntil']).toBeGreaterThan(s.state.clock.minutes);
  });

  it('snooze escalation', () => {
    expect(snoozeOutcome(0)).toBe('prompt');
    expect(snoozeOutcome(1)).toBe('late');
    expect(snoozeOutcome(2)).toBe('parent');
  });

  it('sleeping for the night opens the day summary, then the morning alarm rings', () => {
    const s = newStore();
    const mum = idOf(s, 'mother');
    s.interact('bed');
    s.choose(s.ui.dialogue![0].choices!.findIndex((c) => /Sleep for the night/.test(c.label)));
    vi.advanceTimersByTime(1000);
    expect(s.ui.modal?.type).toBe('day-summary');
    s.nextDay();
    expect(s.ui.dialogue![0].text).toMatch(/RING RING/);
    const t0 = s.member(mum)!.trust;
    settle(s, byLabel(/Get up/));
    expect(s.member(mum)!.trust).toBe(t0 + 1);
  });

  it('snoozing twice makes a parent come in', () => {
    const s = newStore();
    const mum = idOf(s, 'mother');
    const calls = watchBus(s, true);
    s.state.world['home.bedSleep'] = s.state.clock.day;
    s.nextDay();
    const t0 = s.member(mum)!.trust;
    s.choose(1); // snooze
    vi.advanceTimersByTime(SNOOZE_MS);
    expect(s.ui.dialogue![0].text).toMatch(/7:10 AM/);
    s.choose(1); // snooze again
    const seen = settle(s);
    expect(calls).toEqual([{ memberId: mum, reason: 'sleep' }]);
    expect(seen.join(' ')).toMatch(/late for school/);
    expect(s.member(mum)!.trust).toBe(t0 - 2);
  });

  it('a normal new day (no bed) skips the alarm', () => {
    const s = newStore();
    s.nextDay();
    expect(s.ui.dialogue?.[0]?.text ?? '').not.toMatch(/RING/);
  });
});

describe('TV time', () => {
  it('watching passes time, escalates screen time and ends in a ban', () => {
    const s = newStore();
    const calls = watchBus(s, true);
    tvInteract(s);
    expect(isWatchingTv(s)).toBe(true);
    const t0 = s.state.clock.minutes;
    watchTv(s, 6000); // 6 s → 30 game minutes
    expect(Math.round(s.state.clock.minutes - t0)).toBe(30);
    expect(conduct(s).screenMinutes).toBe(30);
    expect(isWatchingTv(s)).toBe(true);
    watchTv(s, 6000); // reaches 60 → a parent comes over, TV stops
    expect(isWatchingTv(s)).toBe(false);
    expect(calls.map((c) => c.reason)).toEqual(['screen']);
    settle(s);
    tvInteract(s);
    watchTv(s, 6000); // 90 → banned
    expect(conduct(s).tvBanned).toBe(true);
    expect(isWatchingTv(s)).toBe(false);
    settle(s);
    s.interact('tv');
    expect(s.ui.dialogue![0].text).toMatch(/switched it off for today/);
  });

  it('interacting again (or the sofa) stops watching', () => {
    const s = newStore();
    s.interact('sofa');
    expect(isWatchingTv(s)).toBe(true);
    s.interact('tv');
    expect(isWatchingTv(s)).toBe(false);
  });
});
