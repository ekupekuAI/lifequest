import type { MissionDef } from './types';
import type { GameStore } from '../core/store';
import { NPC_LOOKS } from '../domain/family';
import { completeService, formatClock, playerIndex } from '../core/systems';
import { CHALLENGES } from './challenges';
import { clamp, timeScore } from './validation';

const receptionist = { speaker: NPC_LOOKS.receptionist.name, portrait: 'npc:receptionist' };
const grand = (s: GameStore) => s.memberByRole('grandparent');

function doCheckIn(s: GameStore) {
  const q = s.queue;
  if (q) s.queue = completeService(q);
  s.state.inQueue = false;
  const appt = Math.ceil((s.state.clock.minutes + 45) / 10) * 10;
  s.flag('apptTime', appt);
  s.flag('room', 2);
  s.giveItem('appointment-slip');
  s.spendTime(2);
  s.objective('checkin');
  s.say([
    {
      ...receptionist,
      text: `All done! ${grand(s)?.name ?? 'Your grandparent'} is checked in with Dr. Mehta at ${formatClock(appt)}, Room 2. Here is the appointment slip — please arrive 10 minutes early.`,
    },
  ]);
}

function atCounter(s: GameStore) {
  if (!s.hasItem('health-card') && !s.getFlag('lookedUp', false)) {
    s.presentChallenge(CHALLENGES['missing-document'], () => {
      if (s.getFlag('lookedUp', false)) doCheckIn(s);
      else if (s.getFlag('needCard', false)) {
        s.queueLeave();
        s.toast('Your token keeps your place in line. Go home for the card!', 'info');
      }
    });
    return;
  }
  doCheckIn(s);
}

export const clinicVisit: MissionDef = {
  id: 'clinic-visit',
  title: "Grandparent's Clinic Check-in",
  category: 'public-service',
  difficulty: 2,
  icon: '🏥',
  summary: 'Check your grandparent in for a routine check-up and bring back the appointment details.',
  assignerRoles: ['grandparent'],
  location: 'home',
  destination: 'clinic',
  briefing:
    "Beta, my knees are fine but the doctor wants a routine check-up. Could you go to the clinic and check me in? You'll need my health card — it's in my document folder in the living room cabinet. Come back and tell me the time and the room.",
  instructions: [
    'Health card: document folder in the living room cabinet (left side).',
    'The clinic is on the south side of the road, east of FreshMart.',
    'At the clinic, take a token and wait for your turn. Tokens keep your place if you step out.',
    'Remember the appointment time and room number — or keep the slip safe.',
  ],
  objectives: [
    { id: 'receive', label: 'Listen to the request', type: 'talk', required: true },
    { id: 'card', label: 'Take the health card (important!)', type: 'collect', required: false },
    { id: 'reach', label: 'Go to the clinic', type: 'reach', target: 'clinic', required: true },
    { id: 'checkin', label: 'Check in at reception', type: 'checkout', required: true },
    { id: 'report', label: 'Tell {grandparent} the time and room', type: 'talk', required: true, dependsOn: ['checkin'] },
  ],
  deadlineMinutes: 75,
  lateRule: 'partial',
  challenges: [],
  rewards: { xp: 110, badge: 'Community Helper' },
  learning: ['Prepare documents before a visit', 'Use a token queue', 'Understand and relay appointment details'],
  skills: ['planning', 'patience', 'communication', 'responsibility'],
  available(state) {
    return state.profile.members.some((m) => m.role === 'grandparent')
      ? { ok: true }
      : { ok: false, reason: 'Needs a grandparent in your family setup.' };
  },
  onEvent(s, ev) {
    if (ev.type === 'location' && ev.to === 'clinic') s.objective('reach');
  },
  onInteract(s, target) {
    if (target === 'doc-folder') {
      if (s.hasItem('health-card')) s.toast('You already have the health card.', 'neutral');
      else {
        s.giveItem('health-card');
        s.objective('card');
        s.spendTime(1);
        s.toast('Took the health card from the document folder.', 'good');
      }
      return true;
    }
    if (target !== 'reception') return false;
    if (s.isDone('checkin')) {
      s.say([{ ...receptionist, text: 'Everything is on the slip. See you soon!' }]);
      return true;
    }
    const q = s.queue;
    const idx = q ? playerIndex(q) : -1;
    if (idx < 0) {
      const back = q?.savedPosition !== undefined;
      s.say([
        {
          ...receptionist,
          text: back
            ? 'Welcome back! Your token is still valid — you keep your place in line.'
            : `Good evening! Please take a token and wait for your number. ${q?.customers.length ?? 0} people are ahead.`,
          choices: [
            {
              label: back ? 'Rejoin with my token' : 'Take a token',
              tone: 'good',
              run: () => {
                s.flag('token', (q?.served ?? 0) + (q?.customers.length ?? 0) + 1);
                s.queueJoin();
              },
            },
            { label: 'Not yet', run: () => {} },
          ],
        },
      ]);
      return true;
    }
    if (idx > 0) {
      s.toast(`Token #${s.getFlag('token', 1)} — ${idx} ahead of you. Use "Wait" to pass time.`, 'info');
      return true;
    }
    atCounter(s);
    return true;
  },
  onTalk(s, member) {
    const g = grand(s);
    if (!g || member.id !== g.id || !s.isDone('checkin')) return false;
    const appt = Number(s.getFlag('apptTime', 0));
    const wrongT = appt + 60;
    const opts = [
      { t: appt, r: 2 },
      { t: wrongT, r: 2 },
      { t: appt, r: 3 },
    ].sort((a, b) => (a.t + a.r * 7) % 3 - (b.t + b.r * 7) % 3);
    s.say([
      {
        speaker: g.name,
        portrait: g.id,
        text: 'You checked me in? Shabash! So… what time, and which room?',
        choices: [
          ...opts.map((o) => ({
            label: `${formatClock(o.t)}, Room ${o.r}`,
            run: () => {
              const right = o.t === appt && o.r === 2;
              s.objective('report');
              s.flag('reportedRight', right);
              if (right) {
                s.trust(g.id, 8);
                s.say([{ speaker: g.name, portrait: g.id, text: 'Perfect! You are so dependable. 🙏' }], () => s.finishMission());
              } else {
                s.trust(g.id, 2);
                s.say(
                  [{ speaker: g.name, portrait: g.id, text: `Hmm, let me read the slip… it says ${formatClock(appt)}, Room 2. Good thing you kept it! Small details matter with appointments.` }],
                  () => s.finishMission(),
                );
              }
            },
          })),
          {
            label: 'Show the appointment slip',
            tone: 'good' as const,
            run: () => {
              s.objective('report');
              s.flag('reportedRight', true);
              s.flag('showedSlip', true);
              s.trust(g.id, 6);
              s.say([{ speaker: g.name, portrait: g.id, text: `${formatClock(appt)}, Room 2 — written down, nothing to forget. Smart!` }], () => s.finishMission());
            },
          },
        ],
      },
    ]);
    return true;
  },
  evaluate(s, forced) {
    const run = s.state.run!;
    const f = run.flags;
    const now = s.state.clock.minutes;
    const late = run.deadlineAt !== null && now > run.deadlineAt;
    const checked = s.isDone('checkin');
    const scores = {
      accuracy: clamp((checked ? 70 : 20) + (f['reportedRight'] ? 30 : 0)),
      time: timeScore(now, run.deadlineAt, run.startedAt),
      planning: clamp(50 + (s.isDone('card') ? 40 : 0) + (f['showedSlip'] ? 10 : 0)),
      communication: clamp(65 + Number(f['comm'] ?? 0) + (f['reportedRight'] ? 10 : -10)),
      problem: clamp(f['lookedUp'] ? 90 : f['needCard'] ? 75 : 85),
      responsibility: clamp(75 + (checked ? 15 : 0)),
    };
    const outcome = forced ?? (!checked || !s.isDone('report') ? 'incomplete' : late ? 'completed-late' : 'completed');
    const fb: string[] = [];
    if (checked) fb.push('You handled a real-world service counter: token, waiting, documents, and check-in.');
    if (!s.isDone('card')) fb.push('The health card was forgotten. A quick checklist before leaving home avoids extra trips.');
    if (f['lookedUp']) fb.push('Asking the receptionist for another way to find the record was resourceful.');
    if (f['needCard']) fb.push('Your token kept your place while you fetched the card — that is why token systems exist.');
    if (f['showedSlip']) fb.push('Showing the written slip is the most reliable way to pass on appointment details.');
    else if (f['reportedRight'] === false) fb.push('The time or room was mixed up. Writing details down (or keeping the slip) prevents that.');
    if (late) fb.push('It took longer than planned — clinics often have waits, so leave early.');
    fb.push('Note: LifeQuest simulates admin steps only — it never gives medical advice.');
    return { outcome, scores, feedback: fb };
  },
};
