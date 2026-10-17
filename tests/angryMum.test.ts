import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALLOWED_CONSEQUENCES,
  ANGRY,
  CHASE_LINES,
  DETECT,
  LECTURES,
  MAKE_UP_LINES,
  TRIGGERS,
  angryActive,
  angryPhase,
  bannedAttempt,
  bumpGate,
  canGetAngry,
  chaseSpeed,
  choiceOutcome,
  detectionStep,
  fullNameYell,
  isFound,
  isNonPhysical,
  modeTitle,
  pickConsequences,
  resetAngry,
  searchOver,
  setAngryStage,
  triggerAngry,
  triggerFrom,
  type AngryPath,
  type AngryStage,
  type AngryTrigger,
  type ChaseHooks,
} from '../src/core/angryMum';
import { conduct } from '../src/core/conduct';
import { newStore, settle } from './helpers';

const PATHS: AngryPath[] = ['apology', 'explained', 'lecture', 'talkback', 'caught', 'came-back'];
const ALL_TRIGGERS = Object.keys(TRIGGERS) as AngryTrigger[];

describe('trigger rules & cooldown', () => {
  it('allows the first moment of a day, then a cooldown, then a daily cap', () => {
    expect(canGetAngry(undefined, 3, 600)).toBe(true);
    let g = bumpGate(undefined, 3, 600);
    expect(g).toEqual({ day: 3, count: 1, lastAt: 600 });
    expect(canGetAngry(g, 3, 600 + ANGRY.cooldownMin - 1)).toBe(false);
    expect(canGetAngry(g, 3, 600 + ANGRY.cooldownMin)).toBe(true);
    g = bumpGate(g, 3, 600 + ANGRY.cooldownMin);
    expect(g.count).toBe(2);
    expect(canGetAngry(g, 3, 2000)).toBe(false); // max 2 per day
    expect(canGetAngry(g, 4, 2000)).toBe(true); // new day resets
    expect(bumpGate(g, 4, 2000)).toEqual({ day: 4, count: 1, lastAt: 2000 });
  });

  it('maps behaviour to triggers (first banned attempt is only a warning)', () => {
    expect(triggerFrom({})).toBeNull();
    expect(triggerFrom({ fightsToday: 2 })).toBeNull();
    expect(triggerFrom({ fightsToday: 3 })).toBe('fights');
    expect(triggerFrom({ tension: 99 })).toBeNull();
    expect(triggerFrom({ tension: 100 })).toBe('tension');
    expect(triggerFrom({ snoozes: 2 })).toBeNull();
    expect(triggerFrom({ snoozes: 3 })).toBe('snooze');
    expect(triggerFrom({ ignoredCalls: 1 })).toBe('ignored-call');
    expect(triggerFrom({ phoneAttempts: 1 })).toBeNull();
    expect(triggerFrom({ phoneAttempts: 2 })).toBe('phone');
    expect(triggerFrom({ tvAttempts: 2 })).toBe('tv');
    expect(triggerFrom({ liesToday: 1 })).toBe('lie');
    expect(triggerFrom({ messes: 2 })).toBeNull();
    expect(triggerFrom({ messes: 3 })).toBe('mess');
  });

  it('always explains why she is angry', () => {
    for (const t of ALL_TRIGGERS) expect(TRIGGERS[t].why.length).toBeGreaterThan(10);
  });
});

describe('countdown choices', () => {
  it('a sincere apology always deflates her', () => {
    expect(choiceOutcome('apologise', true, 1)).toEqual({ next: 'deflate', anger: 0, path: 'apology' });
    expect(choiceOutcome('apologise', true, 3).next).toBe('deflate');
  });
  it('explaining calmly works only when it really was not your fault', () => {
    expect(choiceOutcome('explain', false, 1)).toMatchObject({ next: 'calm', path: 'explained' });
    expect(choiceOutcome('explain', true, 1)).toMatchObject({ next: 'lecture', path: 'lecture' });
  });
  it('talking back escalates, then goes straight to the lecture', () => {
    expect(choiceOutcome('talkback', true, 1)).toEqual({ next: 'escalate', anger: 2 });
    expect(choiceOutcome('talkback', true, 2)).toMatchObject({ next: 'lecture', path: 'talkback', anger: 3 });
  });
  it('running starts the chase', () => {
    expect(choiceOutcome('run', true, 1).next).toBe('chase');
  });
});

describe('consequences', () => {
  it('are proportional: apology keeps most trust, running costs the most', () => {
    const t = (p: AngryPath) => pickConsequences(p, 'fights', 1).trust;
    expect(t('explained')).toBeGreaterThan(0);
    expect(t('apology')).toBeGreaterThan(t('lecture'));
    expect(t('lecture')).toBeGreaterThan(t('talkback'));
    expect(t('talkback')).toBeGreaterThan(t('caught'));
    expect(pickConsequences('explained', 'fights').list).toEqual([]);
    expect(pickConsequences('caught', 'fights').severity).toBe(3);
    expect(pickConsequences('apology', 'fights').list).toHaveLength(1);
  });
  it('fit the trigger', () => {
    expect(pickConsequences('lecture', 'phone').list[0].kind).toBe('phone');
    expect(pickConsequences('lecture', 'tv').list[0].kind).toBe('tv');
    expect(pickConsequences('lecture', 'snooze').list[0].kind).toBe('early-bed');
    expect(pickConsequences('lecture', 'mess').list[0]).toMatchObject({ kind: 'chore', chore: 'clean-room' });
    const caught = pickConsequences('caught', 'fights', 0).list.map((c) => c.kind);
    expect(caught).toEqual(expect.arrayContaining(['phone', 'tv', 'chore']));
    expect(new Set(caught).size).toBe(caught.length); // no duplicates
  });
  it('are NEVER physical', () => {
    for (const p of PATHS)
      for (const t of ALL_TRIGGERS)
        for (const seed of [0, 1, 2, 7]) for (const c of pickConsequences(p, t, seed).list) {
          expect(ALLOWED_CONSEQUENCES).toContain(c.kind);
          expect(isNonPhysical(c)).toBe(true);
        }
    expect(isNonPhysical({ kind: 'chore', label: 'a slipper throw' })).toBe(false);
    const allText = [...LECTURES.flat(), ...CHASE_LINES, ...MAKE_UP_LINES].join(' ');
    expect(allText).not.toMatch(/\b(hit|slap|spank|beat you|smack|pinch|slipper|belt|chappal|cane)\b/i);
  });
});

describe('hiding: detection meter', () => {
  it('holding still lowers it, moving near her fills it fast', () => {
    expect(detectionStep(50, { moving: false, dist: 60, sameRoom: true, dtMs: 1000 })).toBe(50 - DETECT.stillDecay);
    const near = detectionStep(0, { moving: true, dist: 10, sameRoom: true, dtMs: 1000 });
    const far = detectionStep(0, { moving: true, dist: 80, sameRoom: true, dtMs: 1000 });
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(detectionStep(40, { moving: true, dist: 50, sameRoom: false, dtMs: 1000 })).toBeLessThan(40);
    expect(detectionStep(10, { moving: false, dist: 10, sameRoom: true, dtMs: 1000 })).toBeGreaterThan(10); // right on top of you
  });
  it('is clamped and found at 100; she gives up after the search time', () => {
    expect(detectionStep(95, { moving: true, dist: 0, sameRoom: true, dtMs: 5000 })).toBe(100);
    expect(isFound(100)).toBe(true);
    expect(detectionStep(1, { moving: false, dist: 99, sameRoom: false, dtMs: 9999 })).toBe(0);
    expect(searchOver(ANGRY.searchGiveUpMs - 1)).toBe(false);
    expect(searchOver(ANGRY.searchGiveUpMs)).toBe(true);
    expect(chaseSpeed(72)).toBeGreaterThan(72);
  });
});

describe('names & titles', () => {
  it('yells the full name, or the name thrice', () => {
    expect(fullNameYell('Alex', 'Sharma').text).toBe('ALEX SHARMA!!!');
    expect(fullNameYell('Alex', 'Family').text).toBe('ALEX… ALEX… ALEX!!!');
    expect(fullNameYell('Alex', '').text).toMatch(/ALEX… ALEX/);
  });
  it('names the mode from the guardian role', () => {
    expect(modeTitle('father')).toBe('ANGRY DAD MODE');
    expect(modeTitle('mother')).toMatch(/ANGRY M(U|O)M MODE/);
  });
});

describe('the flow (with a fake stage)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    setAngryStage(null);
    vi.useRealTimers();
  });

  function fakeStage(log: string[], chase?: (h: ChaseHooks) => void): AngryStage {
    return {
      ready: () => true,
      transform: (_id, title, done) => {
        log.push(`transform:${title}`);
        done();
      },
      yell: (t) => log.push(`yell:${t}`),
      count: (l) => l && log.push(`count:${l}`),
      deflate: () => log.push('deflate'),
      angrier: () => log.push('angrier'),
      chase: (_id, h) => (log.push('chase'), chase?.(h)),
      escort: (_id, done) => (log.push('escort'), done()),
      lecture: (_id, on) => log.push(`lecture:${on}`),
      calm: () => log.push('calm'),
      approach: (_id, done) => (log.push('approach'), done()),
      bubble: () => {},
      distanceTo: () => 100,
    };
  }

  it('does nothing without a stage (callers fall back to the normal scolding)', () => {
    const s = newStore();
    resetAngry(s);
    expect(triggerAngry(s, 'demo', { force: true })).toBe(false);
    expect(angryActive(s)).toBe(false);
  });

  it('apology path: transform → yell → countdown → deflate, small consequence, alert, memory', () => {
    const s = newStore();
    resetAngry(s);
    const log: string[] = [];
    setAngryStage(fakeStage(log));
    const mum = s.memberByRole('mother', 'father', 'guardian', 'grandparent')!;
    const t0 = mum.trust;
    expect(triggerAngry(s, 'fights')).toBe(true);
    expect(angryActive(s)).toBe(true);
    expect(s.ui.dialogue![0].mood).toBe('angry');
    expect(s.ui.dialogue![0].text).toMatch(/!!!/);
    s.advanceDialogue(); // → countdown
    expect(angryPhase(s)).toBe('countdown');
    const labels = s.ui.dialogue![0].choices!.map((c) => c.label);
    expect(labels).toHaveLength(4);
    expect(labels[0]).toMatch(/sorry/);
    s.choose(0);
    settle(s);
    expect(log).toEqual(expect.arrayContaining(['deflate', 'calm']));
    expect(log.some((l) => l.startsWith('yell:'))).toBe(true);
    expect(mum.trust).toBe(t0 - 1);
    expect(conduct(s).alerts[0].text).toMatch(/ANGRY/);
    expect(s.state.memories!.some((m) => m.id.startsWith('angry@') && m.kind === 'honest')).toBe(true);
    // cooldown: can't immediately happen again
    expect(triggerAngry(s, 'fights')).toBe(false);
  });

  it('run → caught → escort → lecture → grounded (phone, TV, chore)', () => {
    const s = newStore();
    resetAngry(s);
    const log: string[] = [];
    setAngryStage(fakeStage(log, (h) => setTimeout(() => h.caught(), 100)));
    const t0 = s.state.clock.minutes;
    triggerAngry(s, 'demo', { force: true });
    s.advanceDialogue();
    s.choose(s.ui.dialogue![0].choices!.findIndex((c) => /RUN/.test(c.label)));
    expect(angryPhase(s)).toBe('chase');
    settle(s);
    expect(log).toEqual(expect.arrayContaining(['chase', 'escort', 'lecture:true', 'lecture:false', 'calm']));
    const c = conduct(s);
    expect(c.tvBanned).toBe(true);
    expect(c.phoneTakenUntil).toBeGreaterThan(t0);
    expect(c.alerts[0].text).toMatch(/caught/);
    expect(s.state.clock.minutes - t0).toBeGreaterThanOrEqual(ANGRY.lectureMin); // lecture time-lapse
    expect(angryPhase(s)).toBe('cool');
  });

  it('a banned TV attempt warns first, then (with a stage) unleashes the mode', () => {
    const s = newStore();
    resetAngry(s);
    const log: string[] = [];
    setAngryStage(fakeStage(log));
    expect(bannedAttempt(s, 'tv')).toBe('warned');
    expect(bannedAttempt(s, 'tv')).toBe('angry');
    expect(log[0]).toMatch(/^transform:ANGRY/);
  });
});
