// Bus & town challenges. These are presented manually (s.presentChallenge(TOWN_CHALLENGES[id]))
// by the bus system in src/game/bus.ts — they are not part of the event-triggered CHALLENGES table.
import type { ChallengeDef } from './types';
import type { GameStore } from '../core/store';
import { NPC_LOOKS } from '../domain/family';
import { formatMoney } from '../domain/items';
import { money, words } from '../domain/region';
import { BUS } from '../domain/world';
import { formatClock } from '../core/systems';
import { buyTickets, delayedSlot, DELAY_MIN } from '../game/bus';

const driver = () => ({ speaker: NPC_LOOKS.driver.name, portrait: 'npc:driver' });
const assignerName = (s: GameStore) => s.assigner()?.name ?? 'home';
const ticket = () => money(BUS.ticketBase);
const cash = () => money(BUS.cashFareBase);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Minutes lost riding Route 7 to the stadium and back. */
export const WRONG_BUS_MINUTES = 18;

export const TOWN_CHALLENGES: Record<string, ChallengeDef> = {
  'wrong-bus': {
    id: 'wrong-bus',
    category: 'travel',
    title: 'Is this the right bus?',
    trigger: 'manual',
    prompt: () => ({
      ...driver(),
      text: 'A bus pulls up and the doors hiss open. The driver looks at you: "Getting on?" You are going to the city centre…',
    }),
    options: [
      {
        id: 'ask',
        label: '"Excuse me, does this bus go to the city centre?"',
        tone: 'good',
        whatIf: 'Ten seconds of asking avoids a long detour; +Communication',
        skills: { communication: 6, problem: 3 },
        apply: (s) => {
          s.flag('askedDriver', true);
          s.bump('comm', 10);
          s.bump('busSmart', 1);
          return `"No — this is Route 7 to the Stadium. You want Route 12, it comes at :00, :20 and :40." Asking took ten seconds and saved you a long detour.`;
        },
      },
      {
        id: 'sign',
        label: 'Step back and read the sign on the front of the bus',
        tone: 'good',
        whatIf: 'The route number is always on the front; +Planning',
        skills: { planning: 5, problem: 3 },
        apply: (s) => {
          s.flag('checkedSign', true);
          s.bump('busSmart', 1);
          return 'The sign says "7 · STADIUM". Not your bus! Route 12 shows "12 · CITY CENTRE". Checking the route number is a habit worth keeping.';
        },
      },
      {
        id: 'board',
        label: 'Just get on — a bus is a bus',
        tone: 'bad',
        whatIf: `You end up at the stadium and lose about ${WRONG_BUS_MINUTES} minutes (and maybe a ticket)`,
        skills: { problem: 2 },
        apply: (s) => {
          const lostTicket = s.takeItem('bus-ticket');
          s.flag('wrongBus', true);
          s.spendTime(WRONG_BUS_MINUTES, 'Detour to the Stadium and back');
          s.bus.emit('scene', { goto: s.state.location, spawn: 'bus' });
          return `Oops — the bus went to the Stadium terminus! The driver kindly let you ride straight back, but you lost ${WRONG_BUS_MINUTES} minutes${lostTicket ? ' and a ticket' : ''}. Always check the route number (or ask) before boarding.`;
        },
      },
    ],
  },

  'bus-delayed': {
    id: 'bus-delayed',
    category: 'unexpected',
    title: 'The bus is running late',
    trigger: 'manual',
    prompt: (s) => {
      const slot = delayedSlot(s);
      const when = slot !== null ? `The ${formatClock(slot)} bus is now expected at ${formatClock(slot + DELAY_MIN)}.` : '';
      return { speaker: 'Bus stop display', text: `⚠ ROUTE 12 IS RUNNING ${DELAY_MIN} MINUTES LATE (traffic in the city). ${when}\nWhat do you do?` };
    },
    options: [
      {
        id: 'call',
        label: `Call home to say you'll be a bit late`,
        hint: 'Takes 2 minutes',
        tone: 'good',
        whatIf: 'Family knows what is happening and gives you extra time; +Communication, +trust',
        skills: { communication: 8 },
        apply: (s) => {
          s.spendTime(2, 'Phone call home');
          s.flag('calledHome', true);
          s.flag('calledAboutDelay', true);
          s.bump('comm', 15);
          const a = s.assigner();
          if (a) s.trust(a.id, 3);
          const run = s.state.run;
          if (run && run.deadlineAt !== null) run.deadlineAt += 10;
          return `${assignerName(s)}: "Thanks for telling me! Delays happen — take your time and stay safe." Letting people know early is what grown-ups do. (Deadline +10 min)`;
        },
      },
      {
        id: 'wait',
        label: 'Wait patiently at the stop',
        tone: 'neutral',
        whatIf: 'Fine — but nobody at home knows why you are late',
        skills: { patience: 5 },
        apply: (s) => {
          s.flag('waitedDelay', true);
          return 'You wait. Delays happen to everyone — leaving a little buffer in your plan helps. Telling family you are running late is a kind extra step.';
        },
      },
      {
        id: 'walk',
        label: 'Walk to the city instead',
        tone: 'bad',
        whatIf: 'The city is about 5 km away — you would lose far more time than the delay',
        skills: { decisions: 2 },
        apply: (s) => {
          s.flag('triedWalking', true);
          s.spendTime(4, 'Started walking, came back');
          return 'After a few minutes you check the map: the city centre is about 5 km — over an hour on foot. You head back to the stop. A 7-minute delay is still much faster than walking.';
        },
      },
    ],
  },

  'exact-change': {
    id: 'exact-change',
    category: 'money',
    title: 'The machine gives no change',
    trigger: 'manual',
    prompt: () => ({
      speaker: 'Ticket machine',
      text: words(`ROUTE 12 · SINGLE ${formatMoney(ticket())}\n⚠ EXACT MONEY ONLY — NO CHANGE GIVEN.\nYour money is in one note worth two tickets. Paying the driver costs ${formatMoney(cash())}.`),
    }),
    options: [
      {
        id: 'two',
        label: 'Buy two tickets — one for the way back',
        tone: 'good',
        whatIf: `The return trip is paid at the cheaper price (saves ${formatMoney(r2(cash() - ticket()))})`,
        skills: { budget: 6, planning: 5 },
        available: (s) => s.state.wallet.balance >= r2(ticket() * 2),
        apply: (s) => {
          buyTickets(s, 2, true);
          s.flag('boughtReturn', true);
          return `Smart! The note covers exactly two tickets, so your trip home is already paid — ${formatMoney(r2(cash() - ticket()))} cheaper than paying the driver later.`;
        },
      },
      {
        id: 'change',
        label: words('Get change at {kiosk} first'),
        hint: 'Takes about 4 minutes',
        tone: 'neutral',
        whatIf: 'Works, but costs a walk and 4 minutes',
        skills: { problem: 4 },
        available: (s) => s.state.wallet.balance >= ticket(),
        apply: (s) => {
          s.spendTime(4, 'Getting change');
          s.flag('gotChange', true);
          buyTickets(s, 1, true);
          return 'You got change and bought one ticket. It worked, but buying the return ticket right away would have saved the extra trip.';
        },
      },
      {
        id: 'driver',
        label: 'Skip the machine — pay the driver',
        tone: 'bad',
        whatIf: `Every ride costs ${formatMoney(cash())} instead of ${formatMoney(ticket())}`,
        skills: { decisions: 2 },
        apply: (s) => {
          s.flag('skippedMachine', true);
          return `Paying the driver costs ${formatMoney(cash())} instead of ${formatMoney(ticket())}. Buying tickets in advance is cheaper — that is why machines exist.`;
        },
      },
    ],
  },
};
