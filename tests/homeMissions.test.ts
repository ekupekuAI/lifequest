import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStore } from '../src/core/store';
import { getMission } from '../src/missions/registry';
import { SOUP_BURNT } from '../src/missions/cook';
import { WASH_CYCLE } from '../src/missions/laundry';
import { byLabel, idOf, newStore, settle } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const lastResult = (s: GameStore) => s.state.results[0];

/** fridge → sink → board → stove */
function prepSoup(s: GameStore) {
  s.interact('fridge');
  expect(s.state.hands).toEqual(['carrot', 'onion']);
  expect(s.isDone('get-veg')).toBe(true);
  s.interact('sink');
  expect(s.isDone('wash')).toBe(true);
  s.interact('chopping-board');
  settle(s);
  expect(s.state.hands).toEqual(['chopped-veg']);
  expect(s.isDone('chop')).toBe(true);
  s.interact('stove');
  expect(s.isDone('cook')).toBe(true);
  expect(s.state.world['stove.state']).toBe('cooking');
}

function setTable(s: GameStore) {
  s.interact('plates');
  expect(s.state.hands).toContain('plates');
  s.interact('dining-table');
  expect(s.isDone('table')).toBe(true);
}

function serveAndReport(s: GameStore, assigner: string, pick?: (l: string[]) => number) {
  s.interact('stove'); // take the pot off
  settle(s, pick);
  expect(s.state.hands).toContain('cooking-pot');
  s.interact('dining-table');
  expect(s.isDone('serve')).toBe(true);
  s.talkTo(assigner);
  return settle(s, pick);
}

describe('cook-meal (Help Make Dinner)', () => {
  it('is available and has a guide target + hint on every objective after the first', () => {
    const def = getMission('cook-meal')!;
    expect(def.available!(newStore().state).ok).toBe(true);
    for (const o of def.objectives.slice(1)) {
      expect(o.where?.target, o.id).toBeTruthy();
      expect(o.hint, o.id).toBeTruthy();
    }
  });

  it('happy path: wash → chop → cook, set the table while it simmers, serve on time', () => {
    const s = newStore();
    const mother = idOf(s, 'mother');
    s.acceptMission('cook-meal', mother);
    prepSoup(s);
    setTable(s); // while the soup cooks → multitasking
    expect(s.getFlag('multitask', false)).toBe(true);
    s.spendTime(8);
    expect(s.state.world['stove.state']).toBe('ready');
    serveAndReport(s, mother);
    const r = lastResult(s);
    expect(r.missionId).toBe('cook-meal');
    expect(r.outcome).toBe('completed');
    expect(r.scores.planning).toBeGreaterThanOrEqual(90);
    expect(r.scores.responsibility).toBeGreaterThanOrEqual(90);
    expect(r.feedback.join(' ')).toMatch(/multitasking/);
    expect(s.state.run).toBeNull();
  });

  it('leaving the house with the stove on burns the soup and teaches the safety rule', () => {
    const s = newStore();
    const mother = idOf(s, 'mother');
    s.acceptMission('cook-meal', mother);
    prepSoup(s);
    s.travel('town');
    const seen = settle(s, byLabel(/honestly/));
    expect(seen.join(' ')).toMatch(/NEVER leave cooking unattended/);
    expect(s.state.world['stove.state']).toBe('off-ready');
    expect(s.getFlag('burnChoice', '')).toBe('told');
    s.travel('home');
    settle(s);
    setTable(s);
    serveAndReport(s, mother);
    const r = lastResult(s);
    expect(r.outcome).toBe('completed');
    expect(r.scores.responsibility).toBeLessThan(60);
    expect(r.feedback.join(' ')).toMatch(/Never leave cooking unattended/);
    expect(r.decisions.some((d) => /burning/i.test(d.text))).toBe(true);
  });

  it('chopping unwashed veg prompts a gentle correction; soup burns if forgotten', () => {
    const s = newStore();
    const mother = idOf(s, 'mother');
    s.acceptMission('cook-meal', mother);
    s.interact('fridge');
    s.interact('chopping-board'); // skipped the sink
    settle(s, byLabel(/wash them first/));
    expect(s.getFlag('orderSlip', false)).toBe(true);
    expect(s.state.hands).toEqual(['chopped-veg']);
    s.interact('stove');
    s.spendTime(SOUP_BURNT);
    expect(s.state.world['stove.state']).toBe('burnt');
    settle(s, byLabel(/add water/));
    expect(s.state.world['stove.state']).toBe('off-ready');
    setTable(s);
    serveAndReport(s, mother);
    const r = lastResult(s);
    expect(r.scores.accuracy).toBeLessThan(90);
    expect(r.feedback.join(' ')).toMatch(/burned/);
  });
});

describe('laundry (Do the Laundry)', () => {
  const assignerOf = (s: GameStore) => s.defaultAssigner(getMission('laundry')!)!.id;

  it('happy path: check the whites, measure detergent, use the wait, hang and report', () => {
    const s = newStore();
    const who = assignerOf(s);
    s.acceptMission('laundry', who);
    s.interact('pile-whites');
    s.interact('pile-colors');
    expect(s.isDone('collect')).toBe(true);
    s.interact('washer');
    const seen = settle(s, byLabel(/Check the whites|one capful|Start the machine/));
    expect(s.isDone('sort') && s.isDone('detergent') && s.isDone('start')).toBe(true);
    expect(s.state.world['washer.state']).toBe('running');
    expect(seen.length).toBeGreaterThanOrEqual(3);
    // do something useful while it washes
    s.interact('notice-board');
    settle(s);
    expect(s.isDone('wait-well')).toBe(true);
    s.spendTime(WASH_CYCLE);
    expect(s.state.world['washer.state']).toBe('done');
    s.interact('washer');
    settle(s);
    expect(s.state.hands).toEqual(['white-shirt']);
    s.interact('drying-rack');
    expect(s.isDone('hang')).toBe(true);
    expect(s.state.world['rack.fullDay']).toBe(s.state.clock.day);
    s.talkTo(who);
    settle(s);
    const r = lastResult(s);
    expect(r.outcome).toBe('completed');
    expect(r.scores.planning).toBeGreaterThanOrEqual(90);
    expect(r.feedback.join(' ')).toMatch(/red sock/);
  });

  it('washing everything together turns the whites pink; honesty recovers trust', () => {
    const s = newStore();
    const who = assignerOf(s);
    const trustBefore = s.member(who)!.trust;
    s.acceptMission('laundry', who);
    s.interact('pile-whites');
    s.interact('pile-colors');
    s.interact('washer');
    settle(s, byLabel(/everything together|Pour in lots|Start the machine/));
    s.interact('washer'); // running → sit and wait
    settle(s, byLabel(/Sit and watch/));
    expect(s.state.world['washer.state']).toBe('done');
    s.interact('washer');
    settle(s, byLabel(/honestly/));
    expect(s.state.hands.sort()).toEqual(['clothes-pile', 'pink-shirt']);
    expect(s.getFlag('pinkChoice', '')).toBe('told');
    s.interact('drying-rack');
    s.talkTo(who);
    settle(s);
    const r = lastResult(s);
    expect(r.outcome).not.toBe('incomplete');
    expect(r.scores.accuracy).toBeLessThan(70);
    expect(r.feedback.join(' ')).toMatch(/pink/);
    expect(r.feedback.join(' ')).toMatch(/foam/);
    expect(s.member(who)!.trust).toBeGreaterThan(trustBefore);
  });
});
