import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStore } from '../src/core/store';
import {
  DINNER,
  _resetDinner,
  ateToday,
  dayFacts,
  dinnerBlock,
  dinnerTick,
  finishDinner,
  owesDinnerTalk,
  pickTopics,
  setChoreDutyProbe,
  sitForDinner,
  tableLabel,
  type DayFacts,
} from '../src/core/dinner';
import { OBJ, OBJECTS, OVERRIDES, installHomeObjects, nextUp, objectInteract, overrideActive, plantWatered } from '../src/core/homeObjects';
import { conduct } from '../src/core/conduct';
import { MISSIONS } from '../src/missions/registry';
import { FAMILY_PRESETS } from '../src/domain/family';
import { idOf, newStore, settle } from './helpers';

let s: GameStore;
const at = (h: number, m = 0) => (s.state.clock.minutes = h * 60 + m);
const toasts = () => s.ui.toasts.map((t) => t.text).join(' | ');
const facts = (p: Partial<DayFacts> = {}): DayFacts => ({ done: [], late: 0, incomplete: 0, fights: 0, screen: 0, tvBanned: false, kind: [], careless: [], ...p });

beforeEach(() => {
  vi.useFakeTimers();
  _resetDinner();
  setChoreDutyProbe(null);
  s = newStore({ preset: FAMILY_PRESETS[1] });
  s.state.location = 'home';
  installHomeObjects(s);
});
afterEach(() => {
  setChoreDutyProbe(null);
  vi.useRealTimers();
});

describe('family dinner', () => {
  it('is offered 6:50–8:30 PM only', () => {
    at(18, 30);
    expect(dinnerBlock(s)).toBe('early');
    expect(tableLabel(s)).toMatch(/dinner at 7/);
    at(18, 50);
    expect(dinnerBlock(s)).toBeNull();
    expect(tableLabel(s)).toMatch(/Sit down for dinner/);
    at(20, 29);
    expect(dinnerBlock(s)).toBeNull();
    at(20, 30);
    expect(dinnerBlock(s)).toBe('late');
  });

  it('outside the window the table suggests the fridge', () => {
    at(17, 30);
    s.interact('dining-table');
    expect(s.ui.dialogue?.[0].text).toMatch(/fridge/);
  });

  it('happens once per day and gives energy, trust and a memory', () => {
    at(19, 5);
    s.state.stats.energy = 40;
    const mum = s.member(idOf(s, 'mother'))!;
    const trust0 = mum.trust;
    s.interact('dining-table');
    expect(ateToday(s)).toBe(true);
    settle(s, (labels) => labels.findIndex((l) => /clear the table/.test(l)));
    expect(s.state.stats.energy).toBeGreaterThanOrEqual(40 + DINNER.energy);
    expect(mum.trust).toBeGreaterThan(trust0);
    expect(s.state.memories?.some((m) => m.id.startsWith('dinner@') && m.kind === 'helpful')).toBe(true);
    // second time today: refused
    expect(dinnerBlock(s)).toBe('done');
    expect(sitForDinner(s)).toBe(false);
    s.interact('dining-table');
    expect(s.ui.dialogue).toBeNull();
    expect(toasts()).toMatch(/already ate/);
  });

  it('waits for the family when sitting down a few minutes early', () => {
    at(18, 52);
    sitForDinner(s);
    expect(s.state.clock.minutes % 1440).toBeGreaterThanOrEqual(DINNER.familyFrom + DINNER.minutes);
  });

  it('Mum refuses during chore duty', () => {
    setChoreDutyProbe(() => true);
    at(19, 10);
    expect(dinnerBlock(s)).toBe('chores');
    s.interact('dining-table');
    expect(s.ui.dialogue?.[0].text).toMatch(/Chores first — dinner after/);
    expect(ateToday(s)).toBe(false);
    settle(s);
    setChoreDutyProbe(() => false);
    expect(dinnerBlock(s)).toBeNull();
  });

  it('picks conversation topics from the day', () => {
    expect(pickTopics(facts())).toEqual(['quiet']);
    expect(pickTopics(facts({ done: ['Buy Groceries'] }))).toEqual(['praise']);
    expect(pickTopics(facts({ fights: 2, done: ['Buy Groceries'] }))).toEqual(['makeup', 'praise']);
    expect(pickTopics(facts({ screen: 80 }))).toEqual(['screen']);
    expect(pickTopics(facts({ incomplete: 1 }))).toEqual(['unfinished']);
    expect(pickTopics(facts({ kind: ['helped a neighbour'] }))).toEqual(['kind']);
  });

  it('asks "did you two make up?" after a sibling fight', () => {
    conduct(s).fights = 1;
    expect(dayFacts(s).fights).toBe(1);
    at(19, 0);
    s.interact('dining-table');
    const seen = settle(s);
    expect(seen.join(' ')).toMatch(/make up/);
  });

  it('a skipped dinner is mentioned the next day', () => {
    at(20, 31);
    dinnerTick(s);
    expect(s.state.world['dinner.skipped']).toBe(s.state.clock.day);
    s.nextDay();
    settle(s);
    expect(owesDinnerTalk(s)).toBe(true);
    s.state.location = 'home';
    dinnerTick(s);
    expect(s.ui.dialogue?.[0].text).toMatch(/missed dinner last night/);
    settle(s);
    expect(owesDinnerTalk(s)).toBe(false);
  });

  it('eating then finishing without helping still restores energy', () => {
    at(19, 10);
    s.state.stats.energy = 10;
    finishDinner(s, false);
    expect(s.state.stats.energy).toBe(10 + DINNER.energy);
  });
});

describe('everyday objects', () => {
  it('plants can be watered once a day each', () => {
    s.interact('obj:plant:0');
    expect(plantWatered(s, 0)).toBe(true);
    expect(plantWatered(s, 1)).toBe(false);
    const t0 = s.state.clock.minutes;
    s.interact('obj:plant:0');
    expect(toasts()).toMatch(/Already watered/);
    expect(s.state.clock.minutes).toBe(t0);
    s.state.clock.day += 1;
    expect(plantWatered(s, 0)).toBe(false);
  });

  it('homework costs 30 min + energy and gives planning, once a day', () => {
    at(17, 0);
    const e0 = s.state.stats.energy;
    const p0 = s.state.stats.skills.planning ?? 0;
    // (in-game the object layer hides the desk's flavour text while this module handles it)
    s.interact('desk');
    expect(s.ui.dialogue).toBeNull();
    expect(s.state.clock.minutes).toBeGreaterThanOrEqual(17 * 60 + OBJ.homeworkMin);
    expect(s.state.stats.energy).toBe(e0 + OBJ.homeworkEnergy);
    expect(s.state.stats.skills.planning).toBe(p0 + 1);
    const t1 = s.state.clock.minutes;
    s.interact('desk');
    expect(s.state.clock.minutes).toBe(t1);
  });

  it('leisure is refused during chore duty, useful things are not', () => {
    setChoreDutyProbe(() => true);
    const t0 = s.state.clock.minutes;
    s.interact('bookshelf');
    expect(toasts()).toMatch(/Chores first/);
    expect(s.state.clock.minutes).toBe(t0);
    s.interact('obj:plant:2');
    expect(plantWatered(s, 2)).toBe(true);
  });

  it('reading has a cooldown', () => {
    s.interact('bookshelf');
    const t1 = s.state.clock.minutes;
    s.interact('bookshelf');
    expect(s.state.clock.minutes).toBe(t1);
    s.state.clock.minutes += OBJ.readCooldown;
    s.interact('bookshelf');
    expect(s.state.clock.minutes).toBeGreaterThan(t1 + OBJ.readCooldown);
  });

  it('wall clock says what is next', () => {
    expect(nextUp(18 * 60 + 10).what).toMatch(/dinner/);
    at(18, 10);
    s.interact('obj:clock');
    expect(s.ui.dialogue?.[0].text).toMatch(/dinner/);
  });

  it('fountain wish costs money once a day', () => {
    s.state.location = 'city';
    const bal = s.state.wallet.balance;
    s.interact('fountain');
    settle(s);
    expect(s.state.wallet.balance).toBe(bal - OBJ.wishCost());
    s.interact('fountain');
    expect(s.ui.dialogue).toBeNull();
    expect(s.state.wallet.balance).toBe(bal - OBJ.wishCost());
  });

  it('overrides only apply in their own scene', () => {
    s.state.location = 'town';
    expect(overrideActive(s, 'desk')).toBe(false);
    expect(overrideActive(s, 'bench')).toBe(true);
    s.state.location = 'home';
    expect(overrideActive(s, 'bench')).toBe(false);
  });

  it('never steals ids while a mission is in progress', () => {
    const mum = idOf(s, 'mother');
    s.acceptMission('cook-meal', mum);
    settle(s);
    expect(s.state.run?.status).toBe('in-progress');
    for (const id of Object.keys(OVERRIDES)) expect(overrideActive(s, id)).toBe(false);
    expect(objectInteract(s, 'stove')).toBe(false);
    expect(objectInteract(s, 'dining-table')).toBe(false);
  });

  it('new interactables use obj:* ids that no mission targets', () => {
    const targets = new Set<string>();
    for (const m of Object.values(MISSIONS)) for (const o of m.objectives) if (o.where?.target) targets.add(o.where.target);
    for (const kind of Object.keys(OBJECTS)) expect(targets.has(`obj:${kind}`)).toBe(false);
    for (const t of targets) expect(t.startsWith('obj:')).toBe(false);
  });

  it('knocking twice on the same door is gently discouraged', () => {
    s.state.location = 'town';
    at(18, 0);
    s.interact('obj:house:b');
    expect(s.ui.dialogue?.[0].speaker).toBe('Mr. Fernandes');
    settle(s);
    s.interact('obj:house:b');
    expect(s.ui.dialogue?.[0].text).toMatch(/polite/);
  });
});
