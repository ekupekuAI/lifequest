// Bus system: timetable phases, ticket machine, boarding, riding and the stop
// interactions. Plain functions over the GameStore (no Phaser) so missions and
// tests can drive them; TownScene/CityScene draw the bus from busPhase().
import type { GameStore } from '../core/store';
import type { LocationId } from '../domain/types';
import { BUS, OPENING_HOURS, hoursLabel } from '../domain/world';
import { money, region, words } from '../domain/region';
import { formatMoney } from '../domain/items';
import { NPC_LOOKS } from '../domain/family';
import { formatClock, rollFor } from '../core/systems';
import { TOWN_CHALLENGES } from '../missions/townChallenges';

export type Stop = 'town' | 'city';
export type Route = 12 | 7;

/** game minutes a bus is visible driving in before it stops / driving away after it leaves */
export const ARRIVE_MIN = 1;
export const LEAVE_MIN = 3;
export const DELAY_MIN = 7;
/** game minutes spent waiting for a lift when calling home from the city */
export const LIFT_MINUTES = 25;

const r2 = (n: number) => Math.round(n * 100) / 100;
const driver = () => ({ speaker: NPC_LOOKS.driver.name, portrait: 'npc:driver' });
const now = (s: GameStore) => s.state.clock.minutes;
const day = (s: GameStore) => s.state.clock.day;
const serviceOpen = (slot: number) => {
  const h = OPENING_HOURS.bus;
  const m = ((slot % 1440) + 1440) % 1440;
  return m >= h.open && m < h.close;
};
const every = (r: Route) => (r === 12 ? BUS.route12Every : BUS.route7Every);
const offset = (r: Route) => (r === 12 ? BUS.route12Offset : BUS.route7Offset);

// ---------- timetable ----------

/** The scheduled Route-12 slot that is delayed today (if any). */
export function delayedSlot(s: GameStore): number | null {
  const v = s.state.world[`busDelay.${day(s)}`];
  return v === undefined ? null : Number(v);
}

/** Actual arrival time of a scheduled slot (shifted if it is the delayed one). */
function actual(s: GameStore, r: Route, slot: number) {
  return r === 12 && delayedSlot(s) === slot ? slot + DELAY_MIN : slot;
}

/** Scheduled slots around minute m (in service hours), with their actual arrival times. */
function slotsNear(s: GameStore, r: Route, m: number) {
  const e = every(r);
  const o = offset(r);
  const base = Math.floor((m - o) / e) * e + o;
  const out: { slot: number; at: number }[] = [];
  for (let k = -1; k <= 2; k++) {
    const slot = base + k * e;
    if (serviceOpen(slot)) out.push({ slot, at: actual(s, r, slot) });
  }
  return out;
}

export interface BusPhase {
  route: Route;
  phase: 'arriving' | 'stopped' | 'leaving';
  /** 0..1 progress through the phase */
  t: number;
  at: number;
}

/** What the bus at a stop is doing right now. Town serves Route 12 and Route 7; the city shelter only Route 12. */
export function busPhase(s: GameStore, stop: Stop, m = now(s)): BusPhase | null {
  const routes: Route[] = stop === 'town' ? [12, 7] : [12];
  let other: BusPhase | null = null;
  for (const r of routes) {
    for (const { at } of slotsNear(s, r, m)) {
      if (m >= at && m < at + BUS.dwell) return { route: r, phase: 'stopped', t: (m - at) / BUS.dwell, at };
      if (!other && m >= at - ARRIVE_MIN && m < at) other = { route: r, phase: 'arriving', t: (m - (at - ARRIVE_MIN)) / ARRIVE_MIN, at };
      if (!other && m >= at + BUS.dwell && m < at + BUS.dwell + LEAVE_MIN) other = { route: r, phase: 'leaving', t: (m - at - BUS.dwell) / LEAVE_MIN, at };
    }
  }
  return other;
}

/** Which bus is standing at the stop with its doors open. */
export function busStopped(s: GameStore, stop: Stop): Route | null {
  const p = busPhase(s, stop);
  return p && p.phase === 'stopped' ? p.route : null;
}

/** Actual arrival time of the next Route 12 bus (the current one if it is standing at the stop), or null if no more buses today. */
export function nextRoute12(s: GameStore, m = now(s)): number | null {
  const e = every(12);
  const o = offset(12);
  let slot = Math.floor((m - o) / e) * e + o - e;
  for (let i = 0; i < 80; i++, slot += e) {
    if (!serviceOpen(slot)) {
      if ((((slot % 1440) + 1440) % 1440) >= OPENING_HOURS.bus.close) return null;
      continue;
    }
    const at = actual(s, 12, slot);
    if (at + BUS.dwell > m) return at;
  }
  return null;
}

function nextRoute7(m: number): number {
  const e = every(7);
  const o = offset(7);
  return Math.ceil((m - o) / e) * e + o;
}

export function timetableText(s: GameStore, stop: Stop): string {
  const m = now(s);
  const n12 = nextRoute12(s);
  const delay = delayedSlot(s);
  const lines = [
    stop === 'town'
      ? 'ROUTE 12 → CITY CENTRE (library, post office) · every 20 min at :00 :20 :40'
      : 'ROUTE 12 → HOME (Sunrise Street) · every 20 min at :00 :20 :40',
  ];
  if (n12 === null) lines.push('No more Route 12 buses today — the service runs 6 AM – 10 PM.');
  else lines.push(`Next Route 12: ${formatClock(n12)} (${n12 <= m ? 'at the stop now!' : `in ${Math.ceil(n12 - m)} min`})${delay !== null && n12 === delay + DELAY_MIN ? ` — DELAYED +${DELAY_MIN} min` : ''}`);
  if (stop === 'town') lines.push(`Route 7 → Stadium at :10 :30 :50 (next ${formatClock(nextRoute7(m))}) — NOT the city bus!`);
  lines.push(`Ride ≈ ${BUS.rideMinutes} min · Ticket machine ${formatMoney(money(BUS.ticketBase))} · Pay the driver ${formatMoney(money(BUS.cashFareBase))}`);
  return lines.join('\n');
}

// ---------- surprises ----------

/** Once per day (chance ~0.4 during a task), Route 12 runs late. Returns true if the challenge was shown. */
export function maybeBusDelay(s: GameStore): boolean {
  if (!s.state.run) return false;
  const key = `busDelay.checked.${day(s)}`;
  if (s.state.world[key]) return false;
  s.state.world[key] = true;
  const chance = Math.min(1, 0.4 * s.diff.challengeMul);
  if (rollFor(s.state.seed + day(s), 'bus-delayed') >= chance) return false;
  const m = now(s);
  const e = every(12);
  const o = offset(12);
  let slot = Math.ceil((m - o) / e) * e + o;
  if (busStopped(s, 'town') === 12) slot += e; // the bus already here is on time
  if (!serviceOpen(slot)) return false;
  s.state.world[`busDelay.${day(s)}`] = slot;
  s.presentChallenge(TOWN_CHALLENGES['bus-delayed']);
  return true;
}

// ---------- tickets ----------

export function buyTickets(s: GameStore, n: number, quiet = false): boolean {
  const price = r2(money(BUS.ticketBase) * n);
  if (!s.pay(price, `Bus ticket${n > 1 ? ` ×${n}` : ''} (Route 12)`)) {
    s.toast(`Not enough money — ${n > 1 ? `${n} tickets cost` : 'a ticket costs'} ${formatMoney(price)}.`, 'bad');
    return false;
  }
  if (!s.giveItem('bus-ticket', n)) {
    s.give(price, 'Refund (ticket machine)');
    return false;
  }
  s.state.receipts.push({
    at: now(s),
    day: day(s),
    store: 'Bus ticket machine',
    lines: [{ id: 'bus-ticket', name: 'Bus ticket (Route 12)', qty: n, price: money(BUS.ticketBase) }],
    total: price,
  });
  s.bump('ticketsBought', n);
  s.spendTime(1);
  if (!quiet) s.toast(`Bought ${n} Route 12 ticket${n > 1 ? 's' : ''} for ${formatMoney(price)}`, 'good');
  s.objective('bus-ticket');
  return true;
}

export function useTicketMachine(s: GameStore) {
  if (!s.isOpen('bus')) {
    return s.say([{ speaker: 'Ticket machine', text: `OUT OF SERVICE. Buses run ${hoursLabel('bus')}.` }]);
  }
  const t = money(BUS.ticketBase);
  if (s.missionHasChallenge('exact-change') && !s.getFlag('exactChecked', false)) {
    s.flag('exactChecked', true);
    const ref = s.mission?.challenges.find((c) => c.id === 'exact-change');
    const chance = Math.min(1, (ref?.chance ?? 1) * s.diff.challengeMul);
    if (rollFor(s.state.seed + (s.state.run?.startedAt ?? 0), 'exact-change') < chance) {
      s.presentChallenge(TOWN_CHALLENGES['exact-change']);
      return;
    }
  }
  const bal = s.state.wallet.balance;
  const have = s.state.inventory.items['bus-ticket'] ?? 0;
  s.say([
    {
      speaker: 'Ticket machine',
      text: `ROUTE 12 · CITY CENTRE ⇄ HOME\nSingle ticket ${formatMoney(t)} (on the bus: ${formatMoney(money(BUS.cashFareBase))}).\nYou have ${formatMoney(bal)}${have ? ` and ${have} ticket${have > 1 ? 's' : ''}` : ''}.`,
      choices: [
        { label: `Buy 2 tickets (there and back) — ${formatMoney(r2(t * 2))}`, tone: 'good', disabled: bal < r2(t * 2), run: () => buyTickets(s, 2) && s.flag('boughtReturn', true) },
        { label: `Buy 1 ticket — ${formatMoney(t)}`, disabled: bal < t, run: () => void buyTickets(s, 1) },
        { label: 'Cancel', run: () => {} },
      ],
    },
  ]);
}

// ---------- boarding & riding ----------

const destOf = (stop: Stop): LocationId => (stop === 'town' ? 'city' : 'town');

export function boardBus(s: GameStore, stop: Stop, intro = '') {
  const r = busStopped(s, stop);
  if (!r) {
    const n = nextRoute12(s);
    return s.say([{ speaker: '', text: n === null ? 'No bus here — and no more buses tonight.' : `No bus at the stop right now. Next Route 12: ${formatClock(n)}.` }]);
  }
  if (r === 7) return wrongBus(s);
  const cash = money(BUS.cashFareBase);
  const hasTicket = s.hasItem('bus-ticket');
  const canPay = s.state.wallet.balance >= cash;
  const where = stop === 'town' ? 'City Centre' : 'Sunrise Street (home)';
  s.say([
    {
      ...driver(),
      text: `${intro}${intro ? '\n' : ''}"Route 12 to ${where}. Ticket, please!"${!hasTicket && !canPay ? `\n(You have no ticket and only ${formatMoney(s.state.wallet.balance)} — the fare on the bus is ${formatMoney(cash)}.)` : ''}`,
      choices: [
        ...(hasTicket
          ? [{ label: 'Show your ticket', tone: 'good' as const, run: () => { s.takeItem('bus-ticket'); s.bump('ticketsUsed', 1); ride(s, stop, 'ticket'); } }]
          : []),
        {
          label: `Pay the driver ${formatMoney(cash)}`,
          hint: hasTicket ? 'You already have a ticket!' : `The machine sells tickets for ${formatMoney(money(BUS.ticketBase))}`,
          disabled: !canPay,
          run: () => {
            if (!s.pay(cash, 'Bus fare (paid to the driver)')) return;
            s.bump('cashFares', 1);
            if (stop === 'town') s.objective('bus-ticket');
            ride(s, stop, 'cash');
          },
        },
        ...(!hasTicket && !canPay && stop === 'city'
          ? [{ label: 'Step off and call home for help', tone: 'good' as const, run: () => liftHome(s) }]
          : []),
        { label: hasTicket || canPay ? 'Not now' : 'Step off — I can’t pay', run: () => {} },
      ],
    },
  ]);
}

function ride(s: GameStore, from: Stop, how: 'ticket' | 'cash') {
  const dest = destOf(from);
  if (from === 'town') s.objective('board-bus');
  s.flag('rodeFrom', from);
  const view =
    from === 'town'
      ? 'You find a window seat. Houses give way to shops, a bridge, then tall buildings… "Next stop: City Centre — library and post office!"'
      : 'The bus rumbles back past the bridge. Street lights flicker on as you near Sunrise Street. "Next stop: Sunrise Street!"';
  s.say(
    [
      { ...driver(), text: how === 'ticket' ? '"Thank you — hold on to the rail, please."' : '"Here is your fare receipt. Next time, the machine at the stop is cheaper!"' },
      { speaker: '', text: view },
    ],
    () => arrive(s, from),
  );
}

function arrive(s: GameStore, from: Stop) {
  const dest = destOf(from);
  s.spendTime(BUS.rideMinutes, 'Bus ride on Route 12');
  s.travel(dest);
  s.bus.emit('scene', { goto: dest, spawn: 'bus' });
  if (dest === 'town') s.objective('bus-home');
}

function wrongBus(s: GameStore) {
  const run = s.state.run;
  const key = `wrongBusSeen.${day(s)}`;
  const fresh = run ? !run.challengesSeen.includes('wrong-bus') : !s.state.world[key];
  if (fresh) {
    if (!run) s.state.world[key] = true;
    return s.presentChallenge(TOWN_CHALLENGES['wrong-bus']);
  }
  s.say([
    {
      ...driver(),
      text: '"This is Route 7 to the Stadium — not the city. Route 12 comes at :00, :20 and :40."',
      choices: [
        { label: 'Thanks! I’ll wait for Route 12', tone: 'good', run: () => {} },
        {
          label: 'Ride to the stadium anyway',
          tone: 'bad',
          run: () => {
            s.spendTime(18, 'Detour to the Stadium and back');
            s.flag('wrongBus', true);
            s.bus.emit('scene', { goto: s.state.location, spawn: 'bus' });
          },
        },
      ],
    },
  ]);
}

/** Wait on the bench until the next Route 12 arrives, then board straight away. */
export function waitForBus(s: GameStore, stop: Stop) {
  const n = nextRoute12(s);
  if (n === null) return noMoreBuses(s, stop);
  const m = now(s);
  const gap = Math.max(0, Math.ceil(n - m));
  let passed = '';
  if (stop === 'town' && gap > 0) {
    const r7 = nextRoute7(m);
    if (r7 > m && r7 < n) passed = 'A Route 7 bus to the Stadium stops and leaves — not yours. ';
  }
  if (gap > 0) s.spendTime(gap, 'Waiting for Bus 12');
  s.flag('waitedAtStop', true);
  boardBus(s, stop, `${passed}Route 12 pulls up with a hiss of brakes.`);
}

function noMoreBuses(s: GameStore, stop: Stop) {
  if (stop === 'town') return s.say([{ speaker: 'Bus timetable', text: 'No more buses tonight — the service runs 6 AM – 10 PM. Time to head home.' }]);
  s.say([
    {
      speaker: 'Bus timetable',
      text: 'No more buses tonight — the service runs 6 AM – 10 PM. You are far from home…',
      choices: [
        { label: 'Call home and ask for a lift', tone: 'good', run: () => liftHome(s) },
        { label: 'Look around a little longer', run: () => {} },
      ],
    },
  ]);
}

/** Safety valve when stuck in the city: a family member drives over. */
export function liftHome(s: GameStore) {
  const who = s.assigner() ?? s.memberByRole('mother', 'father', 'guardian', 'grandparent');
  s.flag('calledHome', true);
  s.flag('liftHome', true);
  s.bump('comm', 5);
  s.say(
    [{ speaker: who?.name ?? 'Home', portrait: who?.id, text: words("You're stuck? Good thing you called, {endearment}. Stay by the bus shelter — I'm coming to pick you up.") }],
    () => {
      s.spendTime(LIFT_MINUTES, 'Waiting for a lift home');
      s.travel('town');
      s.bus.emit('scene', { goto: 'town', spawn: 'home-door' });
    },
  );
}

/** The bus shelter: timetable + "wait for the next bus". */
export function stopInfo(s: GameStore, stop: Stop) {
  const n = nextRoute12(s);
  const m = now(s);
  if (n === null) return noMoreBuses(s, stop);
  const here = busStopped(s, stop);
  s.say([
    {
      speaker: 'Bus timetable',
      text: timetableText(s, stop),
      choices: [
        ...(here === 12 ? [{ label: 'Board the Route 12 bus now', tone: 'good' as const, run: () => boardBus(s, stop) }] : []),
        ...(here !== 12 ? [{ label: `Sit and wait for the next Bus 12 (${Math.max(0, Math.ceil(n - m))} min)`, run: () => waitForBus(s, stop) }] : []),
        { label: 'Done', run: () => {} },
      ],
    },
  ]);
}

// ---------- other town/city interactables (defaults when no mission handles them) ----------

export function townInteract(s: GameStore, target: string): boolean {
  switch (target) {
    case 'bus-stop':
      if (maybeBusDelay(s)) return true;
      stopInfo(s, 'town');
      return true;
    case 'city-stop':
      stopInfo(s, 'city');
      return true;
    case 'ticket-machine':
      if (maybeBusDelay(s)) return true;
      useTicketMachine(s);
      return true;
    case 'bus-door':
      boardBus(s, 'town');
      return true;
    case 'city-bus-door':
      boardBus(s, 'city');
      return true;
    case 'mailbox':
      s.say([
        {
          speaker: 'Post box',
          text: s.isOpen('mailbox')
            ? `LAST COLLECTION: 6:30 PM. Letters posted now go out today.`
            : `LAST COLLECTION: 6:30 PM — today's collection has gone. Letters posted now go out tomorrow.`,
        },
      ]);
      return true;
    case 'drop-box':
      s.say([{ speaker: 'Book return box', text: 'LIBRARY BOOK RETURNS — use when the library is closed. Books are checked in the next morning.' }]);
      return true;
    case 'library-desk':
      s.say([
        {
          speaker: NPC_LOOKS.librarian.name,
          portrait: 'npc:librarian',
          text: `Welcome to the City Library! We're open ${hoursLabel('library')}. Books are lent for 14 days; the late fee is ${formatMoney(money(20))} per day.`,
        },
      ]);
      return true;
    case 'post-counter':
      if (!s.isOpen('post'))
        s.say([{ speaker: 'Post office', text: `CLOSED. Opening hours: ${hoursLabel('post')}. Parcels can be collected from 10 AM.` }]);
      else s.say([{ speaker: NPC_LOOKS.clerk.name, portrait: 'npc:clerk', text: `Good evening! Stamps, letters and parcel pick-up here. We close at 6:30 PM sharp.` }]);
      return true;
    case 'driver':
      s.say([{ ...driver(), text: `"${region().words.greeting} Route 12 — city and back, every 20 minutes."` }]);
      return true;
    default:
      if (target.startsWith('hours-')) {
        const place = target.slice(6);
        const h = OPENING_HOURS[place];
        if (!h) return false;
        const open = s.isOpen(place);
        s.say([{ speaker: 'Opening hours', text: `${h.label[0].toUpperCase()}${h.label.slice(1)}: ${hoursLabel(place)}. Right now it is ${open ? 'OPEN' : 'CLOSED'}${open ? ` — closes at ${formatClock(h.close)}` : ''}.` }]);
        return true;
      }
      return false;
  }
}

/** Route interact events the store doesn't handle to the bus/town logic. Returns an unsubscribe. */
export function installTownHandlers(s: GameStore): () => void {
  return s.bus.on('game', (ev) => {
    if (ev.type !== 'interact' || s.ui.dialogue || s.ui.modal) return;
    townInteract(s, ev.target);
  });
}
