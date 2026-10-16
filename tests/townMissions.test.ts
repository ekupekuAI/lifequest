import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStore } from '../src/core/store';
import { rollFor } from '../src/core/systems';
import { BUS, busAtStop, nextBus } from '../src/domain/world';
import { busPhase, busStopped, installTownHandlers, maybeBusDelay, nextRoute12, DELAY_MIN } from '../src/game/bus';
import { WRONG_BUS_MINUTES } from '../src/missions/townChallenges';
import { getMission } from '../src/missions/registry';
import { byLabel, idOf, newStore, settle } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const flush = () => Promise.resolve();

/** New store with the bus handlers installed (what Town/City/Library scenes do) and no random bus delay. */
function setup(seed?: number) {
  const s = newStore({ seed });
  installTownHandlers(s);
  s.state.world[`busDelay.checked.${s.state.clock.day}`] = true;
  return s;
}

const PICK = byLabel(/two tickets|Buy 2 tickets|Sit and wait|Show your ticket|Return the book|Letter → Parcel → Bread|House No\. 12/);

function result(s: GameStore) {
  expect(s.ui.modal?.type).toBe('results');
  return s.state.results[0];
}

describe('bus timetable', () => {
  it('busPhase agrees with busAtStop when nothing is delayed', () => {
    const s = setup();
    for (let m = 17 * 60; m < 19 * 60; m += 0.5) {
      s.state.clock.minutes = m;
      expect(busStopped(s, 'town')).toBe(busAtStop(m));
    }
    s.state.clock.minutes = 17 * 60 + 10;
    expect(busStopped(s, 'city')).toBeNull(); // Route 7 never serves the city shelter
    s.state.clock.minutes = 17 * 60 + 19.5;
    expect(busPhase(s, 'town')?.phase).toBe('arriving');
    s.state.clock.minutes = 17 * 60 + 23;
    expect(busPhase(s, 'town')?.phase).toBe('leaving');
  });

  it('no buses after 10 PM', () => {
    const s = setup();
    s.state.clock.minutes = 21 * 60 + 50;
    expect(nextRoute12(s)).toBeNull();
    s.state.clock.minutes = 22 * 60;
    expect(busPhase(s, 'town')).toBeNull();
  });

  it('a delay shifts one Route 12 bus by a few minutes', () => {
    let seed = 1;
    while (rollFor(seed + 1, 'bus-delayed') >= 0.4) seed++;
    const s = newStore({ seed });
    installTownHandlers(s);
    s.acceptMission('bus-trip', idOf(s, 'mother'));
    s.state.clock.minutes = 17 * 60 + 5;
    expect(maybeBusDelay(s)).toBe(true);
    expect(s.ui.dialogue?.[0].text).toMatch(/RUNNING 7 MINUTES LATE/);
    settle(s, byLabel(/Call home/));
    expect(s.state.run!.flags['calledAboutDelay']).toBe(true);
    expect(nextRoute12(s)).toBe(17 * 60 + 20 + DELAY_MIN);
    s.state.clock.minutes = 17 * 60 + 20;
    expect(busStopped(s, 'town')).toBeNull();
    s.state.clock.minutes = 17 * 60 + 20 + DELAY_MIN;
    expect(busStopped(s, 'town')).toBe(12);
    expect(maybeBusDelay(s)).toBe(false); // once per day
  });
});

describe('Return the Library Book (bus-trip)', () => {
  it('happy path: return ticket, Bus 12 both ways, book at the desk, report home', async () => {
    const s = setup();
    const mother = idOf(s, 'mother');
    const start = s.state.wallet.balance;
    s.acceptMission('bus-trip', mother);
    expect(s.hasItem('library-book')).toBe(true);
    expect(s.state.wallet.balance).toBe(start + 2 * BUS.ticketBase);

    s.interact('key-hook');
    await flush();
    settle(s);
    expect(s.isDone('keys')).toBe(true);
    s.travel('town');
    settle(s);
    expect(s.currentTarget()?.target).toBe('ticket-machine');

    s.interact('ticket-machine');
    settle(s, PICK);
    expect(s.state.inventory.items['bus-ticket']).toBe(2);
    expect(s.isDone('bus-ticket')).toBe(true);

    s.interact('bus-stop');
    settle(s, PICK);
    expect(s.isDone('board-bus')).toBe(true);
    expect(s.state.location).toBe('city');
    expect(s.isDone('reach-city')).toBe(true);
    expect(s.state.inventory.items['bus-ticket']).toBe(1);

    s.travel('library');
    s.interact('library-desk');
    settle(s, PICK);
    expect(s.isDone('return-book')).toBe(true);
    expect(s.hasItem('library-book')).toBe(false);

    s.travel('city');
    s.interact('city-stop');
    settle(s, PICK);
    expect(s.state.location).toBe('town');
    expect(s.isDone('bus-home')).toBe(true);

    s.travel('home');
    settle(s);
    s.talkTo(mother);
    settle(s);
    const r = result(s);
    expect(r.outcome).toBe('completed');
    expect(r.scores.accuracy).toBe(100);
    expect(r.moneySpent).toBe(2 * BUS.ticketBase);
    expect(r.feedback.join(' ')).toMatch(/Buying tickets in advance saved/);
  });

  it('wrong bus: just getting on costs time but you come back to the stop', () => {
    const s = setup();
    s.acceptMission('bus-trip', idOf(s, 'mother'));
    s.travel('town');
    settle(s);
    s.state.clock.minutes = nextBus(s.state.clock.minutes, 7);
    expect(busStopped(s, 'town')).toBe(7);
    const t0 = s.state.clock.minutes;
    s.interact('bus-door');
    expect(s.ui.dialogue?.[0].choices?.map((c) => c.label).join('|')).toMatch(/Just get on/);
    settle(s, byLabel(/Just get on/));
    expect(s.state.clock.minutes - t0).toBeGreaterThanOrEqual(WRONG_BUS_MINUTES);
    expect(s.state.location).toBe('town');
    expect(s.state.run!.flags['wrongBus']).toBe(true);
  });

  it('asking the driver avoids Route 7; paying cash on Route 12 still works but costs more', () => {
    const s = setup();
    s.acceptMission('bus-trip', idOf(s, 'mother'));
    s.travel('town');
    settle(s);
    s.state.clock.minutes = nextBus(s.state.clock.minutes, 7);
    s.interact('bus-door');
    settle(s, byLabel(/does this bus go/));
    expect(s.state.location).toBe('town');
    s.state.clock.minutes = nextBus(s.state.clock.minutes, 12);
    s.interact('bus-door');
    settle(s, byLabel(/Pay the driver/));
    expect(s.state.location).toBe('city');
    expect(s.isDone('bus-ticket')).toBe(true);
    expect(s.state.run!.spent).toBe(BUS.cashFareBase);
  });

  it('after 7 PM the library is closed: the drop box accepts the book', () => {
    const s = setup();
    const mother = idOf(s, 'mother');
    s.acceptMission('bus-trip', mother);
    s.travel('town');
    s.travel('city');
    settle(s);
    s.objective('bus-ticket'); // (skipped the bus steps for this test)
    s.objective('board-bus');
    s.state.clock.minutes = 19 * 60 + 5;
    s.spendTime(1);
    expect(s.canEnter('library').ok).toBe(false);
    expect(s.currentTarget()?.target).toBe('drop-box');
    s.interact('drop-box');
    settle(s, byLabel(/Drop the book/));
    expect(s.isDone('return-book')).toBe(true);
    s.travel('town');
    s.travel('home');
    settle(s);
    s.talkTo(mother);
    settle(s);
    const r = result(s);
    expect(r.scores.accuracy).toBe(75);
    expect(r.feedback.join(' ')).toMatch(/return box/);
  });

  it('stuck in the city at night: calling home gets you a lift', () => {
    const s = setup();
    s.acceptMission('bus-trip', idOf(s, 'mother'));
    s.travel('town');
    s.travel('city');
    s.state.clock.minutes = 22 * 60 + 5;
    s.interact('city-stop');
    settle(s, byLabel(/lift/));
    expect(s.state.location).toBe('town');
    expect(s.state.run!.flags['liftHome']).toBe(true);
  });
});

describe('Evening Errands', () => {
  it('plans earliest-closing first and completes all three errands', () => {
    const s = setup();
    const mother = idOf(s, 'mother');
    s.acceptMission('errands', mother);
    expect(s.ui.dialogue?.[0].text).toMatch(/Which order/);
    settle(s, PICK);
    expect(s.isDone('plan')).toBe(true);
    const def = getMission('errands')!;
    expect(def.objectives.slice(2, 5).map((o) => o.id)).toEqual(['post-letter', 'get-parcel', 'buy-bread']);
    expect(s.hasItem('letter')).toBe(true);

    s.travel('town');
    settle(s);
    expect(s.currentTarget()?.target).toBe('mailbox');
    s.interact('mailbox');
    settle(s);
    expect(s.isDone('post-letter')).toBe(true);

    s.interact('ticket-machine');
    settle(s, PICK);
    s.interact('bus-stop');
    settle(s, PICK);
    expect(s.state.location).toBe('city');
    expect(s.currentTarget()?.target).toBe('post-counter');
    s.interact('post-counter');
    settle(s, PICK);
    expect(s.isDone('get-parcel')).toBe(true);
    expect(s.hasItem('parcel')).toBe(true);

    s.interact('city-stop');
    settle(s, PICK);
    expect(s.state.location).toBe('town');
    s.buyAtKiosk('bread');
    settle(s);
    expect(s.isDone('buy-bread')).toBe(true);

    s.travel('home');
    settle(s);
    s.talkTo(mother);
    settle(s);
    const r = result(s);
    expect(r.outcome).toBe('completed');
    expect(r.scores.planning).toBeGreaterThanOrEqual(95);
  });

  it('missing the post office closing time fails that errand with feedback; bread recovers at FreshMart', () => {
    const s = setup();
    const mother = idOf(s, 'mother');
    s.acceptMission('errands', mother);
    settle(s, byLabel(/^Bread → Parcel → Letter/));
    expect(getMission('errands')!.objectives[2].id).toBe('buy-bread');
    s.travel('town');
    settle(s);
    s.interact('mailbox');
    settle(s);
    s.state.clock.minutes = 19 * 60 + 35; // post office (6:30) and corner shop (7:30) both closed
    s.spendTime(1);
    settle(s);
    expect(s.state.run!.flags['missed:get-parcel']).toBe(true);
    expect(s.currentTarget()?.location).toBe('grocery'); // bread → FreshMart
    s.interact('kiosk');
    expect(s.ui.dialogue?.[0].text).toMatch(/FreshMart/);
    settle(s);
    s.travel('grocery');
    s.emit({ type: 'purchased', store: 'grocery', items: { bread: 1 } });
    expect(s.isDone('buy-bread')).toBe(true);
    s.travel('town');
    s.travel('home');
    settle(s);
    s.talkTo(mother);
    settle(s);
    const r = result(s);
    expect(r.outcome).toBe('incomplete');
    expect(r.feedback.join(' ')).toMatch(/post office closed/);
    expect(r.feedback.join(' ')).toMatch(/FreshMart/);
  });
});
