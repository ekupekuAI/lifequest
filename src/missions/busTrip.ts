// "Return the Library Book": a public-transport errand. Buy tickets in advance,
// catch the right bus (Route 12, not Route 7), beat the library's closing time.
import type { MissionDef, ObjectiveDef } from './types';
import type { GameStore } from '../core/store';
import { NPC_LOOKS } from '../domain/family';
import { formatMoney } from '../domain/items';
import { money, words } from '../domain/region';
import { BUS, hoursLabel } from '../domain/world';
import { budgetScore, clamp, timeScore } from './validation';

const librarian = () => ({ speaker: NPC_LOOKS.librarian.name, portrait: 'npc:librarian' });
const LATE_FEE_BASE = 20;

const RETURN_AT_DESK: ObjectiveDef['where'] = { location: 'library', target: 'library-desk' };
const RETURN_AT_BOX: ObjectiveDef['where'] = { location: 'city', target: 'drop-box' };

const objectives: ObjectiveDef[] = [
  { id: 'receive', label: 'Listen to {assigner}', type: 'talk', required: true },
  {
    id: 'keys',
    label: 'Take the house keys (optional)',
    type: 'collect',
    required: false,
    where: { location: 'home', target: 'key-hook' },
    hint: 'The key hook is by the front door. Without keys you may be locked out later.',
  },
  {
    id: 'bus-ticket',
    label: 'Get a Route 12 ticket at the machine',
    type: 'collect',
    required: true,
    where: { location: 'town', target: 'ticket-machine' },
    hint: 'The ticket machine is next to the bus stop at the east end of the street. Buying a return ticket now is cheaper than paying the driver later.',
  },
  {
    id: 'board-bus',
    label: 'Board Bus 12 (not Bus 7!)',
    type: 'reach',
    required: true,
    where: { location: 'town', target: 'bus-stop' },
    hint: 'Route 12 stops at :00, :20 and :40. Route 7 (to the stadium) comes at :10, :30 and :50 — check the number! Sit at the shelter to wait for the next one.',
  },
  {
    id: 'reach-city',
    label: 'Ride to the City Centre',
    type: 'reach',
    target: 'city',
    required: true,
    where: { location: 'city' },
    hint: `The ride takes about ${BUS.rideMinutes} minutes.`,
  },
  {
    id: 'return-book',
    label: 'Return the book at the library desk (closes 7 PM)',
    type: 'deliver',
    required: true,
    where: RETURN_AT_DESK,
    hint: 'The library is on the north side of the plaza. If it has closed, use the book return box outside the door.',
  },
  {
    id: 'bus-home',
    label: 'Take Bus 12 back home',
    type: 'reach',
    required: true,
    dependsOn: ['return-book'],
    where: { location: 'city', target: 'city-stop' },
    hint: 'The bus shelter is on the south side of the plaza. Show a ticket or pay the driver.',
  },
  {
    id: 'report',
    label: 'Tell {assigner} the book is returned',
    type: 'talk',
    required: true,
    dependsOn: ['return-book'],
    where: { location: 'home', target: 'assigner' },
  },
];

function setReturnWhere(open: boolean) {
  const o = objectives.find((x) => x.id === 'return-book')!;
  o.where = open ? RETURN_AT_DESK : RETURN_AT_BOX;
}

function returnBook(s: GameStore, how: 'desk' | 'box') {
  s.takeItem('library-book');
  s.flag('returnedVia', how);
  s.objective('return-book');
  s.spendTime(how === 'desk' ? 2 : 1);
}

function deskDialogue(s: GameStore) {
  if (!s.hasItem('library-book')) {
    s.say([{ ...librarian(), text: s.isDone('return-book') ? 'All checked in — thank you! Have a safe trip home.' : 'Hello! Did you bring a book to return? I don’t see one in your bag.' }]);
    return;
  }
  const fee = formatMoney(money(LATE_FEE_BASE));
  s.say([
    {
      ...librarian(),
      text: 'Good evening! Returning something?',
      choices: [
        {
          label: 'Return the book (it’s due today)',
          tone: 'good',
          run: () => {
            returnBook(s, 'desk');
            s.say([{ ...librarian(), text: `Due today and back today — no fine! Here’s your return slip. ${words('{praise}')}` }]);
          },
        },
        {
          label: '"What happens if a book is late?"',
          run: () => {
            s.flag('askedFees', true);
            s.bump('comm', 5);
            s.say([{ ...librarian(), text: `A late book costs ${fee} per day, and someone else might be waiting for it. Returning on time is the easiest way to save money!` }], () => deskDialogue(s));
          },
        },
      ],
    },
  ]);
}

function dropBox(s: GameStore) {
  if (!s.hasItem('library-book')) return false;
  const open = s.isOpen('library');
  s.say([
    {
      speaker: 'Book return box',
      text: open
        ? 'BOOK RETURNS (after hours). The library is still open — returning at the desk gets you a receipt today.'
        : `BOOK RETURNS (after hours). The library is closed (${hoursLabel('library')}). Books left here are checked in tomorrow morning.`,
      choices: [
        { label: 'Drop the book in the box', tone: open ? 'neutral' : 'good', run: () => { returnBook(s, 'box'); s.toast('The book slides into the return box.', 'good'); } },
        { label: open ? 'Return it at the desk instead' : 'Keep it for now', run: () => {} },
      ],
    },
  ]);
  return true;
}

export const busTrip: MissionDef = {
  id: 'bus-trip',
  title: 'Return the Library Book',
  category: 'errand',
  difficulty: 2,
  icon: '🚌',
  summary: 'Take Bus 12 to the city library and return a book before it closes at 7 PM.',
  assignerRoles: ['mother', 'father', 'guardian', 'grandparent'],
  location: 'home',
  destination: 'library',
  briefing:
    "This library book is due today and the library closes at 7! Take Bus 12 to the city — buy a ticket at the machine by the bus stop, it's cheaper than paying the driver. And don't take Bus 7, it goes to the stadium! Here's {budget} for the tickets.",
  instructions: [
    'The bus stop and ticket machine are at the east end of our street.',
    'Route 12 (city) stops at :00, :20, :40. Route 7 (stadium) at :10, :30, :50 — check the number before you board.',
    `A machine ticket is cheaper than paying the driver. You need one ticket each way.`,
    'The library is on the north side of the city plaza and closes at 7 PM. After hours, use the book return box.',
    'Come home on Bus 12 and tell your family.',
  ],
  objectives,
  budget: 2 * BUS.ticketBase,
  budgetFn: () => 2 * money(BUS.ticketBase),
  deadlineMinutes: 80,
  lateRule: 'partial',
  challenges: [{ id: 'exact-change', chance: 0.5 }, { id: 'wrong-bus' }, { id: 'bus-delayed', chance: 0.4 }],
  rewards: { xp: 130, badge: 'City Explorer' },
  learning: ['Read a bus timetable', 'Buy tickets in advance', 'Check the route before boarding', 'Respect opening hours and due dates'],
  skills: ['planning', 'time', 'budget', 'responsibility', 'problem'],
  available(state) {
    const m = state.clock.minutes % 1440;
    if (m >= 20 * 60) return { ok: false, reason: 'Too late for a bus trip today — buses stop at 10 PM.' };
    return { ok: true };
  },
  onStart(s) {
    setReturnWhere(true);
    s.giveItem('library-book');
    s.toast('You got the library book (due today).', 'info');
  },
  onEvent(s, ev) {
    if (ev.type === 'location') {
      if (s.hasItem('house-keys')) s.objective('keys');
      if (ev.to === 'city' || ev.to === 'library') s.objective('reach-city');
    }
    if (ev.type === 'minute') setReturnWhere(s.isOpen('library'));
  },
  onInteract(s, target) {
    if (target === 'key-hook') queueMicrotask(() => s.hasItem('house-keys') && s.objective('keys'));
    if (target === 'library-desk') {
      deskDialogue(s);
      return true;
    }
    if (target === 'drop-box') return dropBox(s);
    return false;
  },
  onTalk(s, member) {
    const run = s.state.run!;
    if (member.id !== run.assignerId) return false;
    if (!s.isDone('return-book')) {
      s.say([
        {
          speaker: member.name,
          portrait: member.id,
          text: s.isOpen('library')
            ? `The library closes at 7 — Bus 12 leaves at :00, :20 and :40. Got the book?`
            : 'The library is closed now… did you manage to return the book?',
          choices: [
            { label: 'I’m on my way!', tone: 'good', run: () => {} },
            {
              label: 'I couldn’t return it, sorry',
              run: () => {
                s.log('Gave up on returning the book', 'An honest answer — but a late book means a late fee tomorrow.', 'neutral');
                s.say([{ speaker: member.name, portrait: member.id, text: `Thanks for being honest. We'll take it tomorrow and pay the ${formatMoney(money(LATE_FEE_BASE))} fee.` }], () =>
                  s.finishMission('incomplete'),
                );
              },
            },
          ],
        },
      ]);
      return true;
    }
    const box = run.flags['returnedVia'] === 'box';
    s.objective('report');
    s.trust(member.id, box ? 3 : 6);
    s.say(
      [
        {
          speaker: member.name,
          portrait: member.id,
          text: box
            ? 'You used the return box because the library had closed? That was quick thinking — next time leave a bit earlier so you can hand it in at the desk.'
            : words('Returned on time, all by yourself on the bus? {praise} You are getting so independent!'),
        },
      ],
      () => s.finishMission(),
    );
    return true;
  },
  evaluate(s, forced) {
    const run = s.state.run!;
    const f = run.flags;
    const t = money(BUS.ticketBase);
    const c = money(BUS.cashFareBase);
    const n = s.state.clock.minutes;
    const late = run.deadlineAt !== null && n > run.deadlineAt;
    const returned = s.isDone('return-book');
    const desk = f['returnedVia'] === 'desk';
    const cashFares = Number(f['cashFares'] ?? 0);
    const used = Number(f['ticketsUsed'] ?? 0);
    const smart = Number(f['busSmart'] ?? 0);
    const scores = {
      accuracy: clamp(returned ? (desk ? 100 : 75) : 20),
      time: timeScore(n, run.deadlineAt, run.startedAt),
      budget: budgetScore(run.spent, run.budget, cashFares * (c - t)),
      planning: clamp(50 + (s.isDone('keys') ? 10 : 0) + (f['boughtReturn'] ? 25 : used > 0 ? 10 : 0) + (f['waitedAtStop'] ? 5 : 0) + (smart ? 10 : 0) - (f['wrongBus'] ? 20 : 0)),
      communication: clamp(65 + Number(f['comm'] ?? 0) + (s.isDone('report') ? 10 : -10)),
      problem: clamp((f['wrongBus'] ? 55 : smart ? 95 : 80) + (f['liftHome'] ? -10 : 0) + (f['calledAboutDelay'] ? 5 : 0) + (f['returnedVia'] === 'box' ? 5 : 0)),
      responsibility: clamp(60 + (returned ? 25 : 0) + (s.isDone('report') ? 15 : 0)),
    };
    const outcome = forced ?? (!returned || !s.isDone('report') ? 'incomplete' : late ? 'completed-late' : 'completed');
    const fb: string[] = [];
    if (returned && desk) fb.push('The book went back on its due date — no late fee, and the next reader gets it on time.');
    if (returned && !desk) fb.push(`The library had closed, so you used the return box. Smart recovery — but books dropped after hours are checked in tomorrow and may count as a day late (${formatMoney(money(LATE_FEE_BASE))}).`);
    if (!returned) fb.push(`The book was not returned — that means a ${formatMoney(money(LATE_FEE_BASE))} late fee per day. Check opening hours before you set off.`);
    if (used > 0) fb.push(`Buying tickets in advance saved ${formatMoney(Math.round(used * (c - t) * 100) / 100)} compared with paying the driver.`);
    if (cashFares > 0) fb.push(`Paying the driver cost ${formatMoney(Math.round(cashFares * (c - t) * 100) / 100)} extra. The machine at the stop is cheaper — buy a return ticket at the start.`);
    if (f['boughtReturn']) fb.push('You bought your ticket home before leaving — one less thing to worry about in the city.');
    if (f['wrongBus']) fb.push('Getting on Route 7 cost a long detour. The route number is on the front of every bus — check it, or just ask the driver.');
    else if (smart) fb.push('Checking the route before boarding saved you a trip to the stadium.');
    if (f['calledAboutDelay']) fb.push('When the bus was late, you called home. Letting people know you are delayed builds trust.');
    if (f['triedWalking']) fb.push('Walking 5 km to beat a 7-minute delay would never pay off — compare the options before you act.');
    if (f['liftHome']) fb.push('Calling home when stuck was the right move — staying safe matters more than finishing alone.');
    if (late) fb.push('It took longer than planned. Check the timetable before you leave so you don’t just miss a bus.');
    return { outcome, scores, feedback: fb };
  },
};
