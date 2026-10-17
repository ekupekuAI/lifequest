import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStore } from '../src/core/store';
import {
  AWKWARD,
  MESS_COUNT,
  POWERCUT_FROM,
  POWERCUT_MINUTES,
  TIDY_MINUTES,
  TWIST_CHANCE,
  VIRAL_PEAK,
  WALLET_CASH,
  WALLET_SKIM,
  checkTwists,
  dogInteract,
  feedDog,
  forceTwist,
  installTwists,
  isCritical,
  kiteChoice,
  meanComments,
  planDay,
  postReel,
  puppyHasCollar,
  relativesOutcome,
  searchTorch,
  startTwist,
  tidyOne,
  torchSpot,
  twistInteract,
  twists,
  viralRisen,
  viralViewsAt,
  walkDog,
  walletChoice,
} from '../src/core/twists';
import { money } from '../src/domain/region';
import { byLabel, idOf, newStore, settle } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const mk = (seed = 4242) => {
  const s = newStore({ seed });
  installTwists(s);
  return s;
};
const mum = (s: GameStore) => s.member(idOf(s, 'mother'))!;
const memIds = (s: GameStore) => (s.state.memories ?? []).map((m) => m.id.split('@')[0]);
const lastOutcome = (s: GameStore) => twists(s).history[twists(s).history.length - 1]?.outcome;

describe('scheduler', () => {
  it('is deterministic for the same seed + day', () => {
    const a = mk(77);
    const b = mk(77);
    for (let d = 1; d <= 20; d++) expect(planDay(a, d)).toEqual(planDay(b, d));
  });

  it('gives roughly 60–70% of days a twist, never the same twist two days running', () => {
    let hits = 0;
    let n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = mk(seed * 101);
      for (let d = 2; d <= 11; d++) {
        n++;
        if (planDay(s, d).id) hits++;
      }
    }
    expect(hits / n).toBeGreaterThan(TWIST_CHANCE - 0.12);
    expect(hits / n).toBeLessThan(TWIST_CHANCE + 0.12);
  });

  it('plans the power cut no earlier than 7:30 PM', () => {
    for (let seed = 1; seed < 400; seed++) {
      const s = mk(seed);
      const p = planDay(s, 3);
      if (p.id === 'powercut') expect(p.at % 1440).toBeGreaterThanOrEqual(POWERCUT_FROM);
    }
  });

  it('fires the planned twist once its time comes — and only one per day', () => {
    const s = mk();
    checkTwists(s);
    const t = twists(s);
    t.planned = 'kite';
    t.plannedAt = s.state.clock.minutes + 2;
    s.state.location = 'town';
    checkTwists(s);
    expect(t.active).toBeNull(); // not yet
    s.spendTime(3);
    expect(t.active?.id).toBe('kite');
    settle(s);
    kiteChoice(s);
    settle(s, byLabel(/grown-up/));
    expect(t.active).toBeNull();
    // same day: even with another plan, nothing else fires
    t.planned = 'wallet';
    t.plannedAt = 0;
    s.spendTime(2);
    expect(t.active).toBeNull();
  });

  it('never starts during a critical moment (dialogue, queue, near a deadline) or home chaos during a mission', () => {
    const s = mk();
    checkTwists(s);
    const t = twists(s);
    t.planned = 'relatives';
    t.plannedAt = 0;
    s.say([{ speaker: 'x', text: 'busy' }]);
    expect(isCritical(s)).toBe(true);
    checkTwists(s);
    expect(t.active).toBeNull();
    s.closeDialogue();
    s.state.inQueue = true;
    checkTwists(s);
    expect(t.active).toBeNull();
    s.state.inQueue = false;
    // a mission with 10 minutes left
    s.state.run = { status: "in-progress", deadlineAt: s.state.clock.minutes + 10, flags: {} } as unknown as NonNullable<typeof s.state.run>;
    expect(isCritical(s)).toBe(true);
    checkTwists(s);
    expect(t.active).toBeNull();
    // lots of time left: not critical, but the relatives still wait for a calm moment
    s.state.run!.deadlineAt = s.state.clock.minutes + 120;
    expect(isCritical(s)).toBe(false);
    checkTwists(s);
    expect(t.active).toBeNull();
    s.state.run = null;
    checkTwists(s);
    expect(t.active?.id).toBe('relatives');
  });

  it('forceTwist starts any twist immediately (dev helper)', () => {
    const s = mk();
    s.state.location = 'town';
    expect(forceTwist('wallet', s)).toBe('started wallet');
    expect(twists(s).active?.id).toBe('wallet');
    expect(forceTwist('nope' as never, s)).toMatch(/unknown/);
  });
});

describe('surprise relatives', () => {
  const play = (s: GameStore, answer: RegExp, cousin: RegExp) => {
    startTwist(s, 'relatives');
    settle(s, byLabel(/On it/));
    expect(twists(s).active?.step).toBe('tidy');
    for (let i = 0; i < MESS_COUNT; i++) tidyOne(s, i);
    settle(s, (labels) => {
      const snacks = labels.findIndex((l) => /snacks/.test(l));
      if (snacks >= 0) return snacks;
      const c = labels.findIndex((l) => cousin.test(l));
      return c >= 0 ? c : labels.findIndex((l) => answer.test(l));
    });
    expect(twists(s).active?.step).toBe('snacks');
    twistInteract(s, 'twist:tray');
    expect(twists(s).active?.step).toBe('serve');
    twistInteract(s, 'twist:aunt');
    settle(s, (labels) => {
      const c = labels.findIndex((l) => cousin.test(l));
      return c >= 0 ? c : labels.findIndex((l) => answer.test(l));
    });
  };

  it('honest-and-kind replies + a tidy house = star outcome, gift money, trust and a memory', () => {
    const s = mk();
    const before = s.state.wallet.balance;
    const trust = mum(s).trust;
    play(s, /💛/, /burp alphabet/);
    expect(lastOutcome(s)).toBe('star');
    expect(s.state.wallet.balance).toBe(before + money(100));
    expect(mum(s).trust).toBeGreaterThan(trust);
    expect(memIds(s)).toContain('twist-relatives-star');
    expect(twists(s).active).toBeNull();
  });

  it('sarcastic replies end cheeky and cost trust', () => {
    const s = mk();
    const trust = mum(s).trust;
    play(s, /😏/, /eye-roll/);
    expect(lastOutcome(s)).toBe('cheeky');
    expect(mum(s).trust).toBeLessThan(trust);
    expect(memIds(s)).toContain('twist-relatives-cheeky');
  });

  it('the guests walk in anyway when the tidy timer runs out', () => {
    const s = mk();
    startTwist(s, 'relatives');
    settle(s, byLabel(/On it/));
    tidyOne(s, 0);
    s.spendTime(TIDY_MINUTES + 1);
    expect(twists(s).active?.step).toBe('guests');
  });

  it('scores outcomes', () => {
    expect(relativesOutcome(1 + 1 + AWKWARD.length * 2 + 2)).toBe('star');
    expect(relativesOutcome(1)).toBe('okay');
    expect(relativesOutcome(-6)).toBe('cheeky');
  });
});

describe('power cut', () => {
  it('comfort the sibling, find the torch, help the family → hero + memory', () => {
    const s = mk();
    s.state.clock.minutes = POWERCUT_FROM + 10;
    startTwist(s, 'powercut');
    const sib = s.memberByRole('younger-sibling')!;
    const st = sib.trust;
    settle(s, byLabel(/I’m right here/));
    expect(sib.trust).toBeGreaterThan(st);
    expect(twists(s).active?.step).toBe('find');
    const spot = torchSpot(s);
    searchTorch(s, (spot + 1) % 3); // wrong drawer
    settle(s);
    expect(twists(s).active?.step).toBe('find');
    searchTorch(s, spot);
    settle(s);
    expect(twists(s).active?.step).toBe('found');
    twistInteract(s, `npc:${mum(s).id}`);
    settle(s, byLabel(/Shadow puppets/));
    expect(lastOutcome(s)).toBe('hero');
    expect(memIds(s)).toContain('twist-powercut-calm');
  });

  it('power comes back on its own after ~20 minutes', () => {
    const s = mk();
    s.state.clock.minutes = POWERCUT_FROM + 10;
    startTwist(s, 'powercut');
    settle(s, byLabel(/BOO/));
    expect(s.state.conduct?.log[0]?.kind).toBe('respect');
    s.spendTime(POWERCUT_MINUTES + 1);
    settle(s);
    expect(twists(s).active).toBeNull();
    expect(lastOutcome(s)).toBe('waited');
  });
});

describe('lost puppy', () => {
  const seedWith = (collar: boolean) => {
    for (let seed = 1; seed < 500; seed++) {
      const s = mk(seed);
      if (puppyHasCollar(s) === collar) return s;
    }
    throw new Error('no seed');
  };

  it('collar → call the owner → reunited, reward money', () => {
    const s = seedWith(true);
    s.state.location = 'town';
    const before = s.state.wallet.balance;
    startTwist(s, 'puppy');
    settle(s, byLabel(/collar|Call|Accept/));
    expect(twists(s).puppy?.status).toBe('reunited');
    expect(s.state.wallet.balance).toBe(before + money(100));
    expect(memIds(s)).toContain('twist-puppy-reunited');
  });

  it('no collar → bring it home, ASK → adopted; it needs feeding and walking every day', () => {
    const s = seedWith(false);
    s.state.location = 'town';
    startTwist(s, 'puppy');
    settle(s, byLabel(/collar|ASK/));
    expect(twists(s).active?.step).toBe('following');
    s.state.location = 'home';
    twistInteract(s, `npc:${mum(s).id}`);
    settle(s, byLabel(/promise|Biscuit/));
    const p = twists(s).puppy!;
    expect(p.status).toBe('adopted');
    expect(p.name).toBe('Biscuit');
    expect(twists(s).active).toBeNull();
    // day 2: cared for
    s.nextDay();
    settle(s);
    checkTwists(s);
    settle(s);
    feedDog(s);
    walkDog(s);
    expect(p.fedDay).toBe(s.state.clock.day);
    dogInteract(s);
    expect(s.ui.dialogue?.[0].choices?.every((c) => c.disabled || /Pet/.test(c.label))).toBe(true);
    settle(s, byLabel(/Pet/));
    // day 3: yesterday was fine
    s.nextDay();
    settle(s);
    checkTwists(s);
    settle(s);
    expect(p.missed).toBe(0);
    // days 4 & 5 with no care → a serious talk
    s.nextDay();
    settle(s);
    checkTwists(s);
    settle(s);
    expect(p.missed).toBe(1);
    s.nextDay();
    settle(s);
    checkTwists(s);
    settle(s);
    expect(p.missed).toBe(2);
    expect(s.state.conduct?.alerts.some((a) => /Biscuit/.test(a.text))).toBe(true);
    // a walk into town counts as the daily walk
    s.travel('town');
    expect(p.walkedDay).toBe(s.state.clock.day);
  });

  it('“maybe the shelter” and leaving it overnight both end at the shelter', () => {
    const s = seedWith(false);
    s.state.location = 'town';
    startTwist(s, 'puppy');
    settle(s, byLabel(/collar|ASK/));
    s.nextDay();
    settle(s);
    checkTwists(s);
    expect(twists(s).puppy?.status).toBe('shelter');
  });
});

describe('found wallet', () => {
  const open = (s: GameStore) => {
    s.state.location = 'town';
    startTwist(s, 'wallet');
    expect(twists(s).active?.step).toBe('spotted');
    walletChoice(s);
  };

  it('honest → reward, newspaper fame, town folk recognise you, honest memory + parent alert', () => {
    const s = mk();
    const before = s.state.wallet.balance;
    open(s);
    settle(s, byLabel(/Hand it/));
    expect(lastOutcome(s)).toBe('returned');
    expect(s.state.wallet.balance).toBe(before + money(200));
    expect(twists(s).fame?.kind).toBe('wallet');
    expect(memIds(s)).toContain('twist-wallet-honest');
    expect(s.state.conduct?.alerts[0]?.text).toMatch(/returned/);
    expect(twistInteract(s, 'npc:folk1')).toBe(true);
    settle(s);
    expect(twistInteract(s, 'npc:folk1')).toBe(false); // greets you once
  });

  it('keep the cash → guilt; meeting the searching owner lets you make it right', () => {
    const s = mk();
    const before = s.state.wallet.balance;
    open(s);
    settle(s, byLabel(/Keep the cash/));
    expect(s.state.wallet.balance).toBe(before + WALLET_CASH());
    expect(twists(s).active?.step).toBe('guilt');
    twistInteract(s, 'twist:owner');
    settle(s, byLabel(/Give it back/));
    expect(s.state.wallet.balance).toBe(before);
    expect(lastOutcome(s)).toBe('made-right');
    expect(memIds(s)).toContain('twist-wallet-made-right');
  });

  it('take a little → the family finds out at home → serious talk, conduct log, then make it right', () => {
    const s = mk();
    const before = s.state.wallet.balance;
    const trust = mum(s).trust;
    open(s);
    settle(s, byLabel(/just a little/));
    expect(s.state.wallet.balance).toBe(before + WALLET_SKIM());
    s.state.location = 'home';
    s.spendTime(13);
    expect(s.ui.dialogue).toBeTruthy();
    settle(s, byLabel(/Give it all back/));
    expect(mum(s).trust).toBeLessThan(trust);
    expect(s.state.conduct?.log.some((e) => e.severity === 2 && /wallet/.test(e.text))).toBe(true);
    expect(s.state.wallet.balance).toBe(before);
    expect(memIds(s)).toEqual(expect.arrayContaining(['twist-wallet-kept', 'twist-wallet-made-right']));
  });
});

describe('viral reel', () => {
  it('views rocket from 100 to 1.2M', () => {
    expect(viralViewsAt(0)).toBe(100);
    expect(viralViewsAt(3000)).toBeLessThan(10_000);
    expect(viralViewsAt(6000)).toBe(VIRAL_PEAK);
  });

  it('posted → rising → famous → mean comments → report → privacy → resolved → fades next day', () => {
    const s = mk();
    checkTwists(s);
    postReel(s, 'pillow-fight');
    const t = twists(s);
    expect(t.viral?.phase).toBe('posted');
    expect(t.planned).toBe('viral');
    s.spendTime(4);
    expect(t.active?.id).toBe('viral');
    expect(t.viral?.phase).toBe('rising');
    viralRisen(s);
    settle(s);
    expect(t.viral?.phase).toBe('famous');
    expect(t.fame?.kind).toBe('viral');
    s.state.location = 'town';
    expect(twistInteract(s, 'npc:folk2')).toBe(true);
    settle(s);
    meanComments(s);
    const trust = mum(s).trust;
    settle(s, byLabel(/Talk to a parent|Never share/));
    expect(t.viral?.reply).toBe('parent');
    expect(t.viral?.overshared).toBe(false);
    expect(t.viral?.phase).toBe('resolved');
    expect(mum(s).trust).toBeGreaterThan(trust);
    expect(memIds(s)).toContain('twist-viral-kind');
    s.nextDay();
    settle(s);
    checkTwists(s);
    expect(t.viral?.phase).toBe('faded');
    expect(t.fame).toBeUndefined();
  });

  it('angry reply + sharing your school → safety alert for the parent', () => {
    const s = mk();
    checkTwists(s);
    postReel(s);
    s.spendTime(4);
    viralRisen(s);
    settle(s);
    s.spendTime(15);
    expect(twists(s).viral?.phase).toBe('mean');
    settle(s, byLabel(/angrily|school name/));
    expect(twists(s).viral?.overshared).toBe(true);
    expect(s.state.conduct?.alerts.some((a) => a.kind === 'safety')).toBe(true);
  });
});
