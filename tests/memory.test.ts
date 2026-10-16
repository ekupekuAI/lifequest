import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStore } from '../src/core/store';
import type { MissionResult } from '../src/domain/types';
import { FAMILY_PRESETS } from '../src/domain/family';
import { money } from '../src/domain/region';
import { ALLOWANCE_BASE } from '../src/domain/world';
import { MEMORY_CHAT_CHANCE, TRUST_UNLOCK, chatRoll, memoryChat, missionLock, rememberResult } from '../src/core/memory';
import { getMission } from '../src/missions/registry';
import { byLabel, idOf, newStore, settle } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

let n = 0;
function fakeResult(s: GameStore, patch: Partial<MissionResult>): MissionResult {
  const missionId = patch.missionId ?? 'grocery-run';
  return {
    id: `r-test-${n++}`,
    missionId,
    title: getMission(missionId)?.title ?? missionId,
    outcome: 'completed',
    scores: {},
    overall: 60,
    xp: 10,
    skillsPracticed: [],
    objectivesDone: [],
    objectivesMissed: [],
    moneySpent: 0,
    budget: null,
    timeUsed: 30,
    challenges: [],
    decisions: [],
    feedback: [],
    finishedAt: s.state.clock.minutes,
    day: s.state.clock.day,
    ...patch,
  };
}

const mems = (s: GameStore) => s.state.memories ?? [];
const lockOf = (s: GameStore, id: string) => missionLock(s, getMission(id)!);
const avail = (s: GameStore, id: string) => s.availableMissions().find((m) => m.def.id === id)!.avail;

describe('rememberResult', () => {
  it('creates memories from a grocery result (kind elder + change returned)', () => {
    const s = newStore();
    const mother = idOf(s, 'mother');
    rememberResult(
      s,
      fakeResult(s, {
        budget: 150,
        moneySpent: 120,
        feedback: ['You bought everything on the list.', 'Letting the elderly lady go first was a kind choice.'],
      }),
    );
    const list = mems(s);
    expect(list.map((m) => m.kind)).toEqual(['kind', 'thrifty']);
    expect(list.every((m) => m.who === mother && m.day === 1 && !m.used)).toBe(true);
    expect(list[0].text).toMatch(/elderly lady/);
    expect(list[1].effect).toMatchObject({ type: 'bonus', amount: money(5) });
  });

  it('keeps at most 3 memories per result and initialises the list', () => {
    const s = newStore();
    expect(s.state.memories).toBeUndefined();
    rememberResult(
      s,
      fakeResult(s, {
        overall: 95,
        budget: 150,
        moneySpent: 100,
        feedback: ['Letting the elderly lady go first was a kind choice.', 'When milk was sold out, you asked before choosing a substitute.'],
      }),
    );
    expect(mems(s).length).toBe(3);
  });

  it('remembers honesty and hiding in the laundry, and calm vs snappy with a sibling', () => {
    const s = newStore();
    rememberResult(s, fakeResult(s, { missionId: 'laundry', feedback: ['Telling the truth about the pink shirts built trust.'] }));
    rememberResult(s, fakeResult(s, { missionId: 'help-sibling', decisions: [{ at: 0, text: 'A misunderstanding: "Relax!"', consequence: '', tone: 'neutral' }] }));
    const [told, snapped] = mems(s);
    expect(told.kind).toBe('honest');
    expect(told.effect).toMatchObject({ type: 'trust', delta: 2 });
    expect(snapped.kind).toBe('careless');
    expect(snapped.who).toBe(idOf(s, 'younger-sibling'));
  });

  it('no memories for an unremarkable result', () => {
    const s = newStore();
    rememberResult(s, fakeResult(s, { missionId: 'clean-room', overall: 60 }));
    expect(mems(s)).toEqual([]);
  });
});

describe('onNewDay effects', () => {
  it('applies effects exactly once on the next day', () => {
    const s = newStore();
    const mother = idOf(s, 'mother');
    const trust0 = s.member(mother)!.trust;
    rememberResult(s, fakeResult(s, { budget: 150, moneySpent: 120, overall: 90 }));
    // thrifty (+bonus, +1 trust) and trusted-more (+2 trust)
    expect(mems(s).map((m) => m.id.split('@')[0])).toEqual(['change-back', 'trusted-more']);

    // nothing happens on the same day
    const bal0 = s.state.wallet.balance;
    s.nextDay();
    expect(s.state.wallet.balance).toBe(bal0 + money(ALLOWANCE_BASE) + money(5));
    expect(s.member(mother)!.trust).toBe(trust0 + 3);
    expect(mems(s).every((m) => m.used)).toBe(true);

    // a morning chat, at most 3 lines, spoken by family members with portraits
    const d = s.ui.dialogue!;
    expect(d.length).toBeGreaterThan(0);
    expect(d.length).toBeLessThanOrEqual(3);
    expect(d[0].portrait).toBe(mother);
    settle(s);

    const bal1 = s.state.wallet.balance;
    s.nextDay();
    expect(s.state.wallet.balance).toBe(bal1 + money(ALLOWANCE_BASE));
    expect(s.member(mother)!.trust).toBe(trust0 + 3);
    expect(s.ui.dialogue).toBeNull();
  });

  it('extras bought with the shopping money come out of tomorrow’s pocket money (capped)', () => {
    const s = newStore();
    s.acceptMission('grocery-run', idOf(s, 'mother'));
    const run = s.state.run!;
    s.state.receipts.push({
      at: run.startedAt + 5,
      day: 1,
      store: 'FreshMart',
      total: 140,
      lines: [
        { id: 'tomato', name: 'Tomato', qty: 2, price: 20 },
        { id: 'chips', name: 'Chips', qty: 1, price: 12 },
        { id: 'paper-bag', name: 'Paper bag', qty: 1, price: 5 },
      ],
    });
    run.flags['returnedChange'] = 10;
    rememberResult(s, fakeResult(s, { budget: run.cashGiven, moneySpent: run.cashGiven - 10 }));
    const cut = mems(s).find((m) => m.effect?.type === 'pocket-cut')!;
    expect(cut.effect!.amount).toBe(Math.min(money(20), 12)); // the paper bag is not counted
    expect(mems(s).some((m) => m.effect?.type === 'bonus')).toBe(false);

    s.state.run = null;
    const bal = s.state.wallet.balance;
    s.nextDay();
    expect(s.state.wallet.balance).toBe(bal + money(ALLOWANCE_BASE) - 12);
    expect(s.state.wallet.ledger.some((t) => /Extras from the shopping money/.test(t.label))).toBe(true);
    expect(s.ui.dialogue!.map((l) => l.text).join(' ')).toMatch(/pocket money/);
  });

  it('does not charge twice when the overspend already came from the wallet', () => {
    const s = newStore();
    s.acceptMission('grocery-run', idOf(s, 'mother'));
    const run = s.state.run!;
    s.state.receipts.push({ at: run.startedAt + 5, day: 1, store: 'FreshMart', total: 30, lines: [{ id: 'chips', name: 'Chips', qty: 1, price: 30 }] });
    rememberResult(s, fakeResult(s, { budget: run.cashGiven, moneySpent: run.cashGiven + 30 }));
    expect(mems(s).find((m) => m.effect?.type === 'pocket-cut')).toBeUndefined();
    expect(mems(s).some((m) => m.id.startsWith('over-budget@'))).toBe(true);
  });

  it('missing milk: gentle reminder and −1 trust next morning', () => {
    const s = newStore();
    const mother = idOf(s, 'mother');
    const t0 = s.member(mother)!.trust;
    rememberResult(s, fakeResult(s, { outcome: 'incomplete', decisions: [{ at: 0, text: 'Explained honestly why milk was missing', consequence: '', tone: 'neutral' }] }));
    s.nextDay();
    expect(s.member(mother)!.trust).toBe(t0 - 1);
    expect(s.ui.dialogue![0].text).toMatch(/No milk/);
    expect(s.ui.toasts.some((t) => /call home/.test(t.text))).toBe(true);
  });

  it('real laundry: hiding the pink shirt is found out the next day (trust −3)', () => {
    const s = newStore();
    const who = idOf(s, 'father');
    s.acceptMission('laundry', who);
    s.interact('pile-whites');
    s.interact('pile-colors');
    s.interact('washer');
    settle(s, byLabel(/everything together|Pour in lots|Start the machine/));
    s.interact('washer');
    settle(s, byLabel(/Sit and watch/));
    s.interact('washer');
    settle(s, byLabel(/say nothing/));
    s.interact('drying-rack');
    s.talkTo(who);
    settle(s);
    expect(s.state.results[0].missionId).toBe('laundry');
    const hidden = mems(s).find((m) => m.id.startsWith('pink-hidden@'))!;
    expect(hidden).toBeDefined();
    expect(hidden.who).toBe(who);
    const t = s.member(who)!.trust;
    s.nextDay();
    expect(s.member(who)!.trust).toBe(t - 3);
    const said = s.ui.dialogue!.map((l) => l.text).join(' ');
    expect(said).toMatch(/pink shirt/);
    expect(said).toMatch(/rather hear it from you/);
  });
});

describe('memoryChat', () => {
  it('returns null without memories', () => {
    const s = newStore();
    expect(memoryChat(s, s.memberByRole('mother')!)).toBeNull();
  });

  it('is deterministic and only speaks up sometimes', () => {
    const s = newStore();
    rememberResult(s, fakeResult(s, { feedback: ['Letting the elderly lady go first was a kind choice.'] }));
    const mother = s.memberByRole('mother')!;
    let hits = 0;
    for (let b = 0; b < 40; b++) {
      s.state.clock.minutes = 8 * 60 + b * 30;
      const a = memoryChat(s, mother);
      expect(memoryChat(s, mother)).toBe(a);
      const expectHit = chatRoll(s.state.clock.day, mother.id, s.state.clock.minutes) < MEMORY_CHAT_CHANCE;
      expect(a !== null).toBe(expectHit);
      if (a) {
        hits++;
        expect(a).toMatch(/elderly lady/);
      }
    }
    expect(hits).toBeGreaterThan(5);
    expect(hits).toBeLessThan(35);
  });

  it('gives each role its own voice, and stops after a few days', () => {
    const s = newStore({ preset: FAMILY_PRESETS.find((p) => p.id === 'big')! });
    rememberResult(s, fakeResult(s, { feedback: ['Letting the elderly lady go first was a kind choice.'] }));
    const say = (role: Parameters<GameStore['memberByRole']>[0]) => {
      const m = s.memberByRole(role)!;
      for (let b = 0; b < 48; b++) {
        s.state.clock.minutes = b * 30;
        const line = memoryChat(s, m);
        if (line) return line;
      }
      return null;
    };
    expect(say('grandparent')).toMatch(/Kindness/);
    expect(say('older-sibling')).toMatch(/lazy/);
    expect(say('younger-sibling')).toMatch(/superhero/);
    s.state.clock.day += 5;
    expect(say('grandparent')).toBeNull();
  });
});

describe('missionLock', () => {
  it('a fresh game keeps the town trips and cooking locked with friendly reasons', () => {
    const s = newStore();
    expect(lockOf(s, 'bus-trip')).toMatch(/Earn a bit more trust first: complete The Grocery Run/);
    expect(lockOf(s, 'errands')).toMatch(/The Grocery Run/);
    expect(lockOf(s, 'cook-meal')).toMatch(/Clean Your Room/);
    expect(lockOf(s, 'grocery-run')).toBeNull();
    expect(avail(s, 'bus-trip').ok).toBe(false);
  });

  it('every family preset starts with at least 3 missions available', () => {
    for (const preset of FAMILY_PRESETS) {
      const s = newStore({ preset });
      const ok = s.availableMissions().filter((m) => m.avail.ok);
      expect(ok.length, preset.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('completing the grocery run unlocks the bus trip and errands; clean room unlocks cooking', () => {
    const s = newStore();
    rememberResult(s, fakeResult(s, { missionId: 'grocery-run', outcome: 'incomplete' }));
    expect(lockOf(s, 'bus-trip')).not.toBeNull();
    rememberResult(s, fakeResult(s, { missionId: 'grocery-run' }));
    expect(lockOf(s, 'bus-trip')).toBeNull();
    expect(lockOf(s, 'errands')).toBeNull();
    expect(lockOf(s, 'cook-meal')).not.toBeNull();
    // the unlock survives the 30-result history cap
    s.state.results = [];
    expect(lockOf(s, 'bus-trip')).toBeNull();
    rememberResult(s, fakeResult(s, { missionId: 'clean-room', outcome: 'completed-late' }));
    expect(lockOf(s, 'cook-meal')).toBeNull();
  });

  it('enough trust opens the town trips early', () => {
    const s = newStore();
    s.memberByRole('mother')!.trust = TRUST_UNLOCK;
    expect(lockOf(s, 'bus-trip')).toBeNull();
    expect(lockOf(s, 'cook-meal')).not.toBeNull();
  });

  it('acceptMission still starts a locked mission directly', () => {
    const s = newStore();
    s.acceptMission('bus-trip', idOf(s, 'mother'));
    expect(s.state.run?.missionId).toBe('bus-trip');
  });
});
