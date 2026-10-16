// "Evening Errands": a planning mission built on opening hours. Three errands close
// at different times — post a letter (mailbox, 6:30 PM), collect a parcel (city
// post office, 6:30 PM, needs Bus 12) and buy bread (corner shop, 7:30 PM).
import type { MissionDef, ObjectiveDef } from './types';
import type { GameStore } from '../core/store';
import { NPC_LOOKS } from '../domain/family';
import { formatMoney } from '../domain/items';
import { money, words } from '../domain/region';
import { BUS, OPENING_HOURS } from '../domain/world';
import { formatClock } from '../core/systems';
import { budgetScore, clamp, timeScore } from './validation';

export type ErrandId = 'post-letter' | 'get-parcel' | 'buy-bread';
export const ERRANDS: ErrandId[] = ['post-letter', 'get-parcel', 'buy-bread'];

const clerk = () => ({ speaker: NPC_LOOKS.clerk.name, portrait: 'npc:clerk' });
const NAMES: Record<ErrandId, string> = { 'post-letter': 'Letter', 'get-parcel': 'Parcel', 'buy-bread': 'Bread' };

/** Plans offered at the start, with their planning score. */
export const PLANS: { order: ErrandId[] | null; score: number; reply: string }[] = [
  { order: ['post-letter', 'get-parcel', 'buy-bread'], score: 95, reply: 'Perfect plan! The letter is on the way to the bus stop, the post office closes early, and the shop is open latest — so the bread comes last and stays fresh.' },
  { order: ['get-parcel', 'post-letter', 'buy-bread'], score: 85, reply: 'Good thinking — the post office and the mailbox both close at 6:30. Just make sure you are back before the last collection!' },
  { order: ['buy-bread', 'post-letter', 'get-parcel'], score: 55, reply: 'Hmm, the shop is open until 7:30… the post office closes an hour earlier. Keep an eye on the clock!' },
  { order: ['buy-bread', 'get-parcel', 'post-letter'], score: 45, reply: "Bread first, letter last? The mailbox's last collection is 6:30 — that's cutting it close." },
  { order: null, score: 40, reply: "No plan? Okay… but remember, things close at different times. Don't get caught out!" },
];

const W_BREAD_KIOSK: ObjectiveDef['where'] = { location: 'town', target: 'kiosk' };
const W_BREAD_MART: ObjectiveDef['where'] = { location: 'grocery', target: 'shelf-bakery' };

const BASE: Record<ErrandId, ObjectiveDef> = {
  'post-letter': {
    id: 'post-letter',
    label: 'Post the letter in the mailbox (last collection 6:30 PM)',
    type: 'deliver',
    required: true,
    where: { location: 'town', target: 'mailbox' },
    hint: 'The red post box is on the south sidewalk, near the signpost. After 6:30 PM the letter only goes out tomorrow.',
  },
  'get-parcel': {
    id: 'get-parcel',
    label: 'Collect the parcel at the city post office (closes 6:30 PM)',
    type: 'collect',
    required: true,
    where: { location: 'city', target: 'post-counter' },
    hint: `The post office is in the city — take Bus 12 (about ${BUS.rideMinutes} min, every 20 min). The service window is on the front of the building.`,
  },
  'buy-bread': {
    id: 'buy-bread',
    label: 'Buy bread at {kiosk} (closes 7:30 PM)',
    type: 'checkout',
    required: true,
    where: W_BREAD_KIOSK,
    hint: 'The corner shop is on the north side of our street. If it has closed, FreshMart sells bread until 9 PM.',
  },
};

const objectives: ObjectiveDef[] = [
  { id: 'receive', label: 'Listen to {assigner}', type: 'talk', required: true },
  { id: 'plan', label: 'Plan the order of your errands', type: 'resolve', required: true },
  BASE['post-letter'],
  BASE['get-parcel'],
  BASE['buy-bread'],
  {
    id: 'home',
    label: 'Bring everything home to {assigner}',
    type: 'talk',
    required: true,
    where: { location: 'home', target: 'assigner' },
    hint: 'Tell your family how the errands went — even if something was closed.',
  },
];

/** Objective order follows the player's plan; missed errands become optional so the guide moves on. */
function applyPlan(order: ErrandId[]) {
  const list = order.map((id) => BASE[id]);
  objectives.splice(2, 3, ...list);
}
function resetObjectives() {
  applyPlan(ERRANDS);
  for (const id of ERRANDS) BASE[id].required = true;
  BASE['buy-bread'].where = W_BREAD_KIOSK;
}

const missed = (s: GameStore, id: ErrandId) => !!s.getFlag(`missed:${id}`, false);
const resolved = (s: GameStore, id: ErrandId) => s.isDone(id) || missed(s, id);

function miss(s: GameStore, id: ErrandId, why: string) {
  if (missed(s, id) || s.isDone(id)) return;
  s.flag(`missed:${id}`, true);
  BASE[id].required = false;
  s.toast(why, 'bad');
  s.log(why, 'Missed closing times can mean an extra trip tomorrow — plan the earliest-closing errand first.', 'bad');
}

function choosePlan(s: GameStore) {
  const a = s.assigner();
  const t = (place: string) => formatClock(OPENING_HOURS[place].close);
  s.say([
    {
      speaker: a?.name ?? 'Family',
      portrait: a?.id,
      text: words(
        `Three errands before things close (it's ${formatClock(s.state.clock.minutes)} now):\n` +
          `• Letter — post box on our street · last collection ${t('mailbox')} · 2 min walk\n` +
          `• Parcel — post office in the city · closes ${t('post')} · Bus 12 (~${BUS.rideMinutes} min ride + wait, every 20 min)\n` +
          `• Bread — {kiosk} · closes ${t('kiosk')} · across the street\n` +
          `Which order will you do them in?`,
      ),
      choices: PLANS.map((p, i) => ({
        label: p.order ? p.order.map((id) => NAMES[id]).join(' → ') : "No plan — I'll just go",
        run: () => {
          s.flag('plan', i);
          if (p.order) applyPlan(p.order);
          s.objective('plan');
          s.log(`Plan: ${p.order ? p.order.map((id) => NAMES[id]).join(' → ') : 'no plan'}`, p.reply, p.score >= 80 ? 'good' : p.score >= 50 ? 'neutral' : 'bad');
          s.say([{ speaker: a?.name ?? 'Family', portrait: a?.id, text: p.reply }]);
        },
      })),
    },
  ]);
}

function postLetter(s: GameStore) {
  if (!s.hasItem('letter')) return false;
  if (s.isOpen('mailbox')) {
    s.takeItem('letter');
    s.objective('post-letter');
    s.toast('Letter posted — it goes out with the 6:30 PM collection.', 'good');
    return true;
  }
  s.say([
    {
      speaker: 'Post box',
      text: "LAST COLLECTION 6:30 PM — today's collection has already gone.",
      choices: [
        {
          label: 'Post it anyway — it will go out tomorrow',
          run: () => {
            s.takeItem('letter');
            s.flag('letterLate', true);
            s.objective('post-letter');
            s.log('Posted the letter after the last collection', 'It will only leave tomorrow morning — a day later than planned.', 'neutral');
          },
        },
        { label: 'Keep it and tell the family', run: () => miss(s, 'post-letter', 'Missed the last mail collection (6:30 PM).') },
      ],
    },
  ]);
  return true;
}

function postCounter(s: GameStore) {
  if (s.isDone('get-parcel') || missed(s, 'get-parcel')) return false;
  if (!s.isOpen('post')) {
    s.say([
      {
        speaker: 'Post office',
        text: `CLOSED — open ${s.hoursLabel('post')}. A note on the window: "Uncollected parcels can be picked up tomorrow from 10 AM."`,
        choices: [
          {
            label: 'Knock and ask politely',
            run: () => {
              s.bump('comm', 5);
              s.say([{ ...clerk(), text: '(through the glass) "Sorry, we\'re closed — the parcel room is locked. Come back tomorrow from 10, it will be safe here!"' }], () =>
                miss(s, 'get-parcel', 'The post office closed before you collected the parcel.'),
              );
            },
          },
          { label: 'Plan to come back tomorrow', run: () => miss(s, 'get-parcel', 'The post office closed before you collected the parcel.') },
        ],
      },
    ]);
    return true;
  }
  const fam = s.state.profile.familyName || 'family';
  s.say([
    {
      ...clerk(),
      text: `Good evening! Parcel pick-up? Which address is it for?`,
      choices: [
        {
          label: `House No. 12, Sunrise Street (the ${fam} family)`,
          tone: 'good',
          run: () => {
            s.giveItem('parcel');
            s.spendTime(3);
            s.objective('get-parcel');
            s.say([{ ...clerk(), text: 'Here you go — sign here… perfect. It’s a bit heavy, hold it with both hands!' }]);
          },
        },
        {
          label: 'Umm… I don’t know the house number',
          run: () => {
            s.flag('forgotAddress', true);
            s.spendTime(4);
            s.giveItem('parcel');
            s.objective('get-parcel');
            s.say([{ ...clerk(), text: 'No problem, I found it under your family name. Tip: always know your home address — it helps in lots of situations!' }]);
          },
        },
      ],
    },
  ]);
  return true;
}

export const eveningErrands: MissionDef = {
  id: 'errands',
  title: 'Evening Errands',
  category: 'errand',
  difficulty: 3,
  icon: '📮',
  summary: 'Post a letter, collect a parcel in the city and buy bread — before each place closes.',
  assignerRoles: ['mother', 'father', 'grandparent', 'guardian'],
  location: 'home',
  destination: 'city',
  briefing:
    "Could you run three errands for me? Post this letter, collect our parcel from the city post office, and buy a loaf of bread. Careful — they all close at different times! Here's {budget} for the bread and bus tickets.",
  instructions: [
    'Post box: on our street — last collection 6:30 PM.',
    'Post office: in the city (Bus 12) — closes 6:30 PM.',
    'Corner shop: across our street — closes 7:30 PM (FreshMart sells bread until 9 PM).',
    'Do the errand that closes first, first. Leave room for a late bus!',
  ],
  objectives,
  budget: 60,
  deadlineMinutes: 140,
  lateRule: 'partial',
  challenges: [{ id: 'wrong-bus' }, { id: 'bus-delayed', chance: 0.4 }],
  rewards: { xp: 150, badge: 'Master Planner' },
  learning: ['Plan around opening hours', 'Do the earliest-closing task first', 'Recover when a place is closed', 'Know your home address'],
  skills: ['planning', 'time', 'responsibility', 'problem', 'communication'],
  available(state) {
    const m = state.clock.minutes % 1440;
    if (m >= 18 * 60) return { ok: false, reason: 'Too late today — the post office closes at 6:30 PM.' };
    return { ok: true };
  },
  onStart(s) {
    resetObjectives();
    s.giveItem('letter');
    choosePlan(s);
  },
  onEvent(s, ev) {
    if (ev.type === 'purchased' && (ev.items['bread'] ?? 0) > 0) {
      s.objective('buy-bread');
      if (ev.store !== 'kiosk') s.flag('breadElsewhere', true);
    }
    if (ev.type === 'minute') {
      if (!s.isOpen('post') && !s.isDone('get-parcel') && s.state.clock.minutes >= OPENING_HOURS.post.close)
        miss(s, 'get-parcel', 'The post office has closed (6:30 PM) — the parcel will have to wait until tomorrow.');
      if (!s.isOpen('kiosk') && !s.isDone('buy-bread') && BASE['buy-bread'].where !== W_BREAD_MART) {
        BASE['buy-bread'].where = W_BREAD_MART;
        s.toast(words('{kiosk} has closed — FreshMart sells bread until 9 PM.'), 'info');
      }
    }
  },
  onInteract(s, target) {
    if (target === 'mailbox') return postLetter(s);
    if (target === 'post-counter') return postCounter(s);
    if (target === 'kiosk' && !s.isOpen('kiosk') && !s.isDone('buy-bread')) {
      s.say([{ speaker: '', text: words(`The shutters are down — {kiosk} closed at 7:30 PM. FreshMart, a few steps west, is open until 9 PM and sells bread too.`) }]);
      return true;
    }
    return false;
  },
  onTalk(s, member) {
    const run = s.state.run!;
    if (member.id !== run.assignerId) return false;
    const open = ERRANDS.filter((id) => !resolved(s, id));
    if (open.length) {
      s.say([
        {
          speaker: member.name,
          portrait: member.id,
          text: `Still to do: ${open.map((id) => NAMES[id].toLowerCase()).join(', ')}. ${open.includes('get-parcel') ? 'The post office closes at 6:30!' : ''}`,
          choices: [
            { label: "I'm on it!", tone: 'good', run: () => {} },
            {
              label: "I can't finish them all today",
              run: () => {
                for (const id of open) miss(s, id, `Gave up on the ${NAMES[id].toLowerCase()} errand.`);
                s.objective('home');
                s.say([{ speaker: member.name, portrait: member.id, text: 'Thanks for telling me honestly. We can finish the rest tomorrow.' }], () => s.finishMission());
              },
            },
          ],
        },
      ]);
      return true;
    }
    const all = ERRANDS.every((id) => s.isDone(id)) && !s.getFlag('letterLate', false);
    s.objective('home');
    s.trust(member.id, all ? 7 : 3);
    s.say(
      [
        {
          speaker: member.name,
          portrait: member.id,
          text: all
            ? words('Letter posted, parcel collected and fresh bread? All before closing time! {praise}')
            : 'Thank you for trying. Some places close early — tomorrow we will plan around the closing times together.',
        },
      ],
      () => s.finishMission(),
    );
    return true;
  },
  progress(state, id) {
    if (id !== 'home') return null;
    const done = ERRANDS.filter((e) => state.run?.objectives[e]?.done).length;
    return `${done}/3 errands`;
  },
  evaluate(s, forced) {
    const run = s.state.run!;
    const f = run.flags;
    const n = s.state.clock.minutes;
    const late = run.deadlineAt !== null && n > run.deadlineAt;
    const done = ERRANDS.filter((id) => s.isDone(id));
    const missedList = ERRANDS.filter((id) => missed(s, id));
    const plan = PLANS[Number(f['plan'] ?? 4)] ?? PLANS[4];
    const actual = [...done].sort((a, b) => (run.objectives[a].at ?? 0) - (run.objectives[b].at ?? 0));
    const followed = !!plan.order && done.length === 3 && actual.every((id, i) => plan.order![i] === id);
    const scores = {
      accuracy: clamp((done.length / 3) * 100 - (f['letterLate'] ? 15 : 0)),
      time: timeScore(n, run.deadlineAt, run.startedAt),
      budget: budgetScore(run.spent, run.budget, Number(f['cashFares'] ?? 0) * (money(BUS.cashFareBase) - money(BUS.ticketBase))),
      planning: clamp(plan.score + (followed ? 5 : 0) - missedList.length * 15 - (f['wrongBus'] ? 10 : 0)),
      communication: clamp(65 + Number(f['comm'] ?? 0) + (s.isDone('home') ? 10 : -10) - (f['forgotAddress'] ? 10 : 0)),
      problem: clamp(75 + (f['breadElsewhere'] ? 15 : 0) + (f['busSmart'] ? 10 : 0) - (f['wrongBus'] ? 20 : 0)),
      responsibility: clamp(60 + done.length * 10 + (s.isDone('home') ? 10 : 0)),
    };
    const outcome = forced ?? (missedList.length || !s.isDone('home') ? 'incomplete' : late ? 'completed-late' : 'completed');
    const fb: string[] = [];
    if (plan.score >= 85) fb.push('Great planning: you did the errands that close earliest first, leaving the latest-closing shop for last.');
    else if (plan.order) fb.push('Tip: sort errands by closing time. The post box and post office close at 6:30 PM, the corner shop at 7:30 PM — so bread goes last.');
    else fb.push('You went without a plan. A 10-second plan (what closes first?) prevents missed errands.');
    if (followed) fb.push('You stuck to your plan from start to finish.');
    if (missed(s, 'get-parcel')) fb.push('The post office closed before you got there. With a 20-minute bus interval, the city errand needs the most time — start it early.');
    if (missed(s, 'post-letter')) fb.push('The letter missed the last collection. Posting it on the way to the bus stop would have taken 2 minutes.');
    if (f['letterLate']) fb.push('The letter was posted after the last collection, so it only leaves tomorrow.');
    if (f['breadElsewhere']) fb.push(words('{kiosk} had closed, so you bought bread at FreshMart instead — when one shop is closed, another may be open.'));
    if (f['forgotAddress']) fb.push('Knowing your home address makes things like parcel pick-ups quick and safe.');
    if (Number(f['cashFares'] ?? 0) > 0) {
      const extra = Math.round(Number(f['cashFares']) * (money(BUS.cashFareBase) - money(BUS.ticketBase)) * 100) / 100;
      fb.push(`Paying on the bus cost ${formatMoney(extra)} more than machine tickets. Buy a return ticket at the start.`);
    }
    if (f['wrongBus']) fb.push('Route 7 goes to the stadium — always check the number on the front of the bus.');
    if (f['calledAboutDelay']) fb.push('Calling home about the late bus was considerate and kept everyone informed.');
    if (late) fb.push('You were later than expected — buses and queues take time, so build in a buffer.');
    return { outcome, scores, feedback: fb };
  },
};
