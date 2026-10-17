import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStore } from '../src/core/store';
import type { ChallengeDef } from '../src/missions/types';
import {
  MAX_CHECKPOINTS,
  REWINDS_PER_DAY,
  REWIND_MS,
  _resetPhaseForTests,
  canRewind,
  checkpoints,
  rewindNow,
  rewinding,
  rewindsLeft,
  startRewind,
} from '../src/core/rewind';
import { byLabel, idOf, last, newStore, settle } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
  _resetPhaseForTests();
});
afterEach(() => vi.useRealTimers());

/** A self-contained challenge: one option spends money and takes an item, the other doesn't. */
const SPLURGE: ChallengeDef = {
  id: 'test-splurge',
  category: 'money',
  title: 'Shiny gadget',
  trigger: 'manual',
  prompt: () => ({ speaker: 'Shopkeeper', text: 'Want this shiny gadget?' }),
  options: [
    {
      id: 'buy',
      label: 'Buy it',
      tone: 'bad',
      whatIf: 'Money gone',
      apply: (s) => {
        s.pay(10, 'Gadget');
        s.giveItem('chocolate', 1);
        s.spendTime(15);
        return 'You bought it.';
      },
    },
    { id: 'skip', label: 'Walk away', tone: 'good', whatIf: 'Money kept', apply: () => 'You kept your money.' },
  ],
};

function startTask(s: GameStore) {
  s.acceptMission('grocery-run', idOf(s, 'mother'));
  settle(s);
}

const choices = (s: GameStore) => s.ui.dialogue?.[0]?.choices?.map((c) => c.label) ?? [];

describe('Rewind Time', () => {
  it('captures a checkpoint before each challenge and each task start', () => {
    const s = newStore();
    expect(checkpoints(s)).toHaveLength(0);
    startTask(s);
    expect(checkpoints(s).map((c) => c.kind)).toEqual(['mission']);
    s.presentChallenge(SPLURGE);
    const cps = checkpoints(s);
    expect(last(cps)!.kind).toBe('challenge');
    expect(last(cps)).toMatchObject({ challengeId: 'test-splurge', title: 'Shiny gadget' });
    // the snapshot never contains the big mission-start snapshot (no recursion)
    expect(JSON.parse(last(cps)!.json).rewind).toBeUndefined();
  });

  it(`keeps only the last ${MAX_CHECKPOINTS} checkpoints`, () => {
    const s = newStore();
    startTask(s);
    for (let i = 0; i < 9; i++) {
      s.presentChallenge(SPLURGE);
      settle(s, byLabel(/Walk away/));
    }
    expect(checkpoints(s)).toHaveLength(MAX_CHECKPOINTS);
  });

  it('restores money, inventory, clock and location exactly and re-presents the same challenge', () => {
    const s = newStore();
    startTask(s);
    s.travel('town');
    settle(s);
    const before = { bal: s.state.wallet.balance, items: { ...s.state.inventory.items }, clock: { ...s.state.clock }, loc: s.state.location, ledger: s.state.wallet.ledger.length };
    s.presentChallenge(SPLURGE);
    settle(s, byLabel(/Buy it/));
    s.travel('home'); // wander off afterwards
    settle(s);
    expect(s.state.wallet.balance).toBe(before.bal - 10);
    expect(s.state.location).toBe('home');

    const scenes: string[] = [];
    s.bus.on('scene', (e) => scenes.push(e.goto));
    expect(rewindNow(s).ok).toBe(true);
    expect(s.state.wallet.balance).toBe(before.bal);
    expect(s.state.wallet.ledger).toHaveLength(before.ledger);
    expect(s.state.inventory.items).toEqual(before.items);
    expect(s.state.clock).toEqual(before.clock);
    expect(s.state.location).toBe('town');
    expect(scenes).toEqual(['town']); // the right map loads
    // the same decision is on screen again
    expect(choices(s)).toEqual(['Buy it', 'Walk away']);
  });

  it('annotates the decision log honestly', () => {
    const s = newStore();
    startTask(s);
    s.presentChallenge(SPLURGE);
    settle(s, byLabel(/Buy it/));
    rewindNow(s);
    settle(s, byLabel(/Walk away/));
    const log = s.state.run!.decisions.map((d) => `${d.text} | ${d.consequence}`);
    expect(log.some((l) => /Rewound time: Shiny gadget/.test(l) && /chose differently/.test(l) && /Buy it/.test(l))).toBe(true);
    expect(last(s.state.run!.decisions)!.text).toBe('Shiny gadget: Walk away');
    expect(log.some((l) => l.startsWith('Shiny gadget: Buy it'))).toBe(false); // the undone choice is gone
    expect(s.state.run!.flags.rewinds).toBe(1);
  });

  it(`allows ${REWINDS_PER_DAY} rewinds per day and refills on a new day`, () => {
    const s = newStore();
    startTask(s);
    for (let i = 0; i < REWINDS_PER_DAY; i++) {
      s.presentChallenge(SPLURGE);
      settle(s, byLabel(/Buy it/));
      expect(rewindNow(s).ok).toBe(true);
      settle(s, byLabel(/Walk away/));
    }
    expect(rewindsLeft(s)).toBe(0);
    s.presentChallenge(SPLURGE);
    settle(s, byLabel(/Buy it/));
    const c = canRewind(s);
    expect(c.ok).toBe(false);
    expect(c.reason).toMatch(/No rewinds left/);
    // rewinding does not refund itself by restoring an older counter
    expect(s.state.rewinds).toMatchObject({ used: REWINDS_PER_DAY });

    s.abandonMission();
    s.openModal(null);
    s.nextDay();
    settle(s);
    expect(rewindsLeft(s)).toBe(REWINDS_PER_DAY);
  });

  it('is disabled with a reason when there is nothing to rewind or the task is over', () => {
    const s = newStore();
    const none = canRewind(s);
    expect(none.ok).toBe(false);
    expect(none.reason).toMatch(/Nothing to rewind/);

    startTask(s);
    s.presentChallenge(SPLURGE);
    settle(s, byLabel(/Buy it/));
    expect(canRewind(s).ok).toBe(true);
    s.finishMission('incomplete');
    // results screen open, then closed: either way the finished task can't be rewound
    expect(canRewind(s).ok).toBe(false);
    s.openModal(null);
    const after = canRewind(s);
    expect(after.ok).toBe(false);
    expect(rewindNow(s).ok).toBe(false);
  });

  it('rewinding while a challenge is open closes it and shows it again', () => {
    const s = newStore();
    startTask(s);
    const bal = s.state.wallet.balance;
    s.presentChallenge(SPLURGE);
    expect(choices(s)).toHaveLength(2);
    expect(rewindNow(s).ok).toBe(true);
    expect(choices(s)).toEqual(['Buy it', 'Walk away']);
    expect(s.state.wallet.balance).toBe(bal);
    expect(s.state.run!.decisions.some((d) => /before choosing/.test(d.consequence))).toBe(true);
  });

  it('a task-start rewind restores the world before the task and reopens the briefing', () => {
    const s = newStore();
    const bal = s.state.wallet.balance;
    startTask(s);
    expect(s.state.run).not.toBeNull();
    expect(s.state.wallet.balance).toBeGreaterThan(bal); // got the shopping cash
    s.spendTime(20);
    expect(rewindNow(s).ok).toBe(true);
    expect(s.state.run).toBeNull();
    expect(s.state.wallet.balance).toBe(bal);
    expect(s.ui.modal).toMatchObject({ type: 'briefing', missionId: 'grocery-run' });
    // accepting again logs that time was rewound
    s.acceptMission('grocery-run', idOf(s, 'mother'));
    expect(s.state.run!.decisions.some((d) => /rewound time/i.test(d.consequence))).toBe(true);
  });

  it('the animated rewind blocks the clock, restores mid-effect and re-presents afterwards', () => {
    const s = newStore();
    startTask(s);
    s.presentChallenge(SPLURGE);
    settle(s, byLabel(/Buy it/));
    const spentBal = s.state.wallet.balance;
    expect(startRewind(s).ok).toBe(true);
    expect(rewinding()).toBe(true);
    expect(s.blocking).toBe(true);
    expect(startRewind(s).ok).toBe(false); // no double rewind
    vi.advanceTimersByTime(REWIND_MS - 100);
    expect(s.state.wallet.balance).toBe(spentBal + 10); // already restored under the static
    vi.advanceTimersByTime(800);
    expect(rewinding()).toBe(false);
    expect(choices(s)).toEqual(['Buy it', 'Walk away']);
  });

  it('a new game forgets old checkpoints', () => {
    const s = newStore();
    startTask(s);
    s.presentChallenge(SPLURGE);
    expect(checkpoints(s).length).toBeGreaterThan(0);
    s.newGame(s.state.profile);
    expect(checkpoints(s)).toHaveLength(0);
  });
});
