// Reusable challenge library. Missions attach challenges by id (with optional
// probability); the GameStore evaluates triggers on game events.
import type { ChallengeDef } from './types';
import type { GameStore } from '../core/store';
import { NPC_LOOKS } from '../domain/family';
import { playerIndex } from '../core/systems';

const assignerName = (s: GameStore) => s.assigner()?.name ?? 'home';
const sibling = (s: GameStore) => s.memberByRole('younger-sibling');

export const CHALLENGES: Record<string, ChallengeDef> = {
  'stock-out-milk': {
    id: 'stock-out-milk',
    category: 'availability',
    title: 'Milk is sold out',
    trigger: 'interact',
    when: (s, ev) => ev.type === 'interact' && ev.target === 'shelf-dairy' && s.stockOf('shelf-dairy', 'milk-packet') <= 0,
    prompt: () => ({
      speaker: NPC_LOOKS.stocker.name,
      portrait: 'npc:stocker',
      text: "Sorry! Milk packets are SOLD OUT. Tomorrow's delivery hasn't come yet. What would you like to do?",
    }),
    options: [
      {
        id: 'ask-alt',
        label: 'Ask the helper for a good alternative',
        tone: 'good',
        skills: { communication: 5, problem: 5 },
        apply: (s) => {
          s.flag('askedStore', true);
          s.bump('comm', 10);
          s.bump('problem', 10);
          s.spendTime(1);
          setTimeout(() => s.openModal({ type: 'shelf', shelfId: 'shelf-dairy' }), 30);
          return 'The helper suggests the toned milk tetra pack (₹38). It is plain milk in different packaging — a sensible substitute.';
        },
      },
      {
        id: 'call',
        label: `Call home to check`,
        hint: 'Takes 2 minutes',
        tone: 'good',
        skills: { communication: 8 },
        apply: (s) => {
          s.flag('calledHome', true);
          s.bump('comm', 15);
          s.spendTime(2);
          const a = s.assigner();
          if (a) s.trust(a.id, 3);
          setTimeout(
            () =>
              s.say([
                {
                  speaker: assignerName(s),
                  portrait: a?.id,
                  text: 'Thanks for calling! A tetra pack of plain milk is fine. Or check Sharma uncle\'s store across the road — he usually has packets. No milkshakes, okay?',
                },
              ]),
            30,
          );
          return `Calling ${assignerName(s)} took 2 minutes but removed the guesswork. Clarifying early prevents mistakes later.`;
        },
      },
      {
        id: 'other-shop',
        label: 'Try another shop (Sharma General Store)',
        tone: 'neutral',
        skills: { problem: 5, planning: 3 },
        apply: (s) => {
          s.flag('triedKiosk', true);
          s.bump('problem', 8);
          return 'Good idea — the kiosk across the road may have packets. It costs some walking time, so watch the clock.';
        },
      },
      {
        id: 'skip',
        label: 'Skip the milk',
        tone: 'bad',
        apply: (s) => {
          s.flag('skippedMilk', true);
          s.bump('problem', -20);
          return "Skipping means no milk for tea tonight. When something is unavailable, asking or checking another shop usually solves it.";
        },
      },
    ],
  },

  'queue-cutter': {
    id: 'queue-cutter',
    category: 'queue',
    title: 'Someone cuts the queue',
    trigger: 'queue-served',
    when: (s) => s.state.inQueue && !!s.queue && playerIndex(s.queue) >= 2,
    prompt: () => ({
      speaker: '',
      text: 'A man in a hurry walks past the whole line and puts his things on the counter, right in front of everyone.',
    }),
    options: [
      {
        id: 'polite',
        label: '"Excuse me, there\'s a queue — the line starts back there."',
        tone: 'good',
        skills: { communication: 8, responsibility: 5 },
        apply: (s) => {
          s.bump('comm', 15);
          s.bump('resp', 5);
          return 'He mumbles "sorry" and goes to the back. Calm, clear words solved it without a fight. The others nod at you.';
        },
      },
      {
        id: 'cashier',
        label: 'Ask the cashier to handle it',
        tone: 'good',
        skills: { communication: 4, responsibility: 4 },
        apply: (s) => {
          s.bump('comm', 8);
          s.bump('resp', 5);
          return 'The cashier politely asks him to join the line. Asking someone in charge is a good choice when you feel unsure.';
        },
      },
      {
        id: 'silent',
        label: 'Say nothing and keep waiting',
        tone: 'neutral',
        skills: { patience: 6 },
        apply: (s) => {
          const q = s.queue;
          if (q) {
            const customers = [...q.customers];
            customers.splice(1, 0, { id: 'cutter', name: NPC_LOOKS.cutter.name, serviceMinutes: 3, look: 9 });
            s.queue = { ...q, customers };
          }
          return 'He gets served first, adding about 3 minutes to everyone\'s wait. Staying calm is fine — but a polite word could have helped the whole line.';
        },
      },
    ],
  },

  'elder-ahead': {
    id: 'elder-ahead',
    category: 'communication',
    title: 'An elderly lady with one item',
    trigger: 'queue-joined',
    when: (s) => !!s.queue && playerIndex(s.queue) >= 1,
    prompt: () => ({
      speaker: NPC_LOOKS.elder.name,
      portrait: 'npc:elder',
      text: 'An elderly lady holding just one loaf of bread joins the line behind you. She is leaning on her walking stick and looks tired.',
    }),
    options: [
      {
        id: 'let-ahead',
        label: '"Please, go ahead of me."',
        tone: 'good',
        skills: { empathy: 10, patience: 3 },
        apply: (s) => {
          const q = s.queue;
          if (q) {
            const customers = [...q.customers];
            const i = playerIndex(q);
            customers.splice(i, 0, { id: 'elder', name: NPC_LOOKS.elder.name, serviceMinutes: 1, look: 8 });
            s.queue = { ...q, customers };
          }
          s.bump('resp', 10);
          s.flag('helpedElder', true);
          return '"Bless you, child!" Letting her go first cost you about 1 minute and made her evening much easier.';
        },
      },
      {
        id: 'stay',
        label: 'Keep your place',
        tone: 'neutral',
        apply: () => 'That is fair — queues are first come, first served. Kindness is a choice, not a rule.',
      },
    ],
  },

  'bag-fee': {
    id: 'bag-fee',
    category: 'memory',
    title: 'Forgot the shopping bag',
    trigger: 'manual',
    prompt: () => ({ speaker: NPC_LOOKS.cashier.name, portrait: 'npc:cashier', text: 'Did you bring a bag? Paper bags are ₹5 each.' }),
    options: [
      {
        id: 'buy-bag',
        label: 'Buy a paper bag (₹5)',
        tone: 'neutral',
        skills: { budget: 2 },
        apply: (s) => {
          s.world('bagFee', 5);
          s.flag('boughtBag', true);
          return 'A ₹5 bag is small, but it adds up. Taking a reusable bag from home saves money and waste.';
        },
      },
      {
        id: 'hands',
        label: 'Carry everything in my hands',
        tone: 'neutral',
        skills: { problem: 2 },
        apply: (s) => {
          s.world('carryingByHand', true);
          s.flag('carriedByHand', true);
          return 'You saved ₹5, but carrying loose groceries makes you tire faster. Next time, remember the bag on the hook!';
        },
      },
    ],
  },

  'sudden-rain': {
    id: 'sudden-rain',
    category: 'unexpected',
    title: 'Sudden rain',
    trigger: 'location',
    when: (s, ev) => ev.type === 'location' && ev.to === 'town' && s.isDone('checkout'),
    prompt: () => ({ speaker: '', text: 'Dark clouds roll in… and it starts to POUR! The road gets slippery.' }),
    options: [
      {
        id: 'umbrella',
        label: 'Open the umbrella you brought',
        tone: 'good',
        available: (s) => s.hasItem('umbrella'),
        skills: { planning: 8 },
        apply: (s) => {
          s.world('rainUntil', s.state.clock.minutes + 15);
          s.flag('usedUmbrella', true);
          s.bump('planning', 15);
          return 'Planning ahead paid off — you stay dry and keep going.';
        },
      },
      {
        id: 'wait',
        label: 'Wait under the shop awning until it eases (8 min)',
        tone: 'neutral',
        skills: { patience: 5, decisions: 3 },
        apply: (s) => {
          s.spendTime(8, 'Waited out the rain');
          s.world('rainUntil', s.state.clock.minutes + 4);
          return 'Waiting kept you and the groceries dry, but it cost 8 minutes. Is there enough time before the deadline?';
        },
      },
      {
        id: 'run',
        label: 'Hurry home in the rain',
        tone: 'neutral',
        skills: { decisions: 3 },
        apply: (s) => {
          s.world('rainUntil', s.state.clock.minutes + 15);
          s.state.stats.energy = Math.max(0, s.state.stats.energy - 15);
          s.flag('gotWet', true);
          return 'You get soaked and lose 15 energy, but you save time. A trade-off — an umbrella would have avoided it.';
        },
      },
    ],
  },

  'kiosk-clarify': {
    id: 'kiosk-clarify',
    category: 'communication',
    title: 'The shopkeeper needs details',
    trigger: 'interact',
    when: (s, ev) => ev.type === 'interact' && ev.target === 'kiosk' && !s.hasItem('milk-packet') && !s.hasItem('milk-tetra'),
    prompt: () => ({ speaker: NPC_LOOKS.sharma.name, portrait: 'npc:sharma', text: 'Milk? Full-cream or toned? And how many packets?' }),
    options: [
      {
        id: 'precise',
        label: '"One packet. Toned is fine — it\'s for tea at home."',
        tone: 'good',
        skills: { communication: 5 },
        apply: (s) => {
          s.bump('comm', 10);
          setTimeout(() => s.openModal({ type: 'shelf', shelfId: 'kiosk' }), 30);
          return 'Clear, specific requests get you the right item the first time.';
        },
      },
      {
        id: 'unsure',
        label: '"Umm… I\'m not sure. Whatever."',
        tone: 'neutral',
        apply: (s) => {
          setTimeout(() => s.openModal({ type: 'shelf', shelfId: 'kiosk' }), 30);
          return 'He picks one for you. It worked out, but if you are unsure, a quick call home avoids buying the wrong thing.';
        },
      },
    ],
  },

  'sibling-interrupt': {
    id: 'sibling-interrupt',
    category: 'household',
    title: 'Your sibling needs help now',
    trigger: 'placed',
    when: (s) => Number(s.getFlag('placedCount', 0)) >= 3 && !!sibling(s),
    prompt: (s) => ({
      speaker: sibling(s)!.name,
      portrait: sibling(s)!.id,
      text: `${s.player.name}! I can't reach my water bottle on the top shelf and I need it for my medicine. Can you help? Please?`,
    }),
    options: [
      {
        id: 'help',
        label: 'Help right away (2 min)',
        tone: 'good',
        skills: { empathy: 8, decisions: 4 },
        apply: (s) => {
          s.spendTime(2);
          s.trust(sibling(s)!.id, 8);
          s.bump('resp', 15);
          s.flag('helpedSibling', true);
          return 'Their need was urgent (medicine), so pausing was the right priority. Some tasks can wait, some can\'t.';
        },
      },
      {
        id: 'promise',
        label: '"Give me 2 minutes to finish, then I\'ll help."',
        tone: 'neutral',
        skills: { communication: 4, time: 3 },
        apply: (s) => {
          s.spendTime(2);
          s.trust(sibling(s)!.id, 2);
          s.bump('comm', 5);
          return 'Communicating a short delay is reasonable. For something like medicine, though, helping right away is kinder.';
        },
      },
      {
        id: 'refuse',
        label: '"Not now, I\'m busy!"',
        tone: 'bad',
        apply: (s) => {
          s.trust(sibling(s)!.id, -10);
          s.bump('resp', -15);
          return 'Your sibling had to wait for medicine. Urgent needs of others can be more important than our own tasks.';
        },
      },
    ],
  },

  'unclear-storage': {
    id: 'unclear-storage',
    category: 'household',
    title: 'Where does the mug go?',
    trigger: 'manual',
    prompt: () => ({ speaker: '', text: "You're holding a dirty mug. It doesn't belong anywhere in the bedroom… What will you do?" }),
    options: [
      {
        id: 'think',
        label: 'Think: dishes go to the kitchen sink',
        tone: 'good',
        skills: { problem: 6 },
        apply: (s) => {
          s.bump('problem', 15);
          return 'Good reasoning! Dirty dishes go to the kitchen sink to be washed.';
        },
      },
      {
        id: 'ask',
        label: 'Go ask where it belongs',
        tone: 'good',
        skills: { communication: 5 },
        apply: (s) => {
          s.bump('comm', 10);
          s.spendTime(1);
          return `${assignerName(s)} says: "Kitchen sink, please!" Asking when unsure is always okay.`;
        },
      },
      {
        id: 'hide',
        label: 'Hide it in the wardrobe',
        tone: 'bad',
        apply: (s) => {
          s.world('room.mug', 'hidden');
          s.release('mug');
          s.flag('hidMug', true);
          s.bump('placedCount', 1);
          return 'Out of sight is not the same as clean… it will start to smell.';
        },
      },
    ],
  },

  'crayon-misunderstanding': {
    id: 'crayon-misunderstanding',
    category: 'communication',
    title: 'A misunderstanding',
    trigger: 'picked',
    when: (_s, ev) => ev.type === 'picked' && ev.item === 'crayons',
    prompt: (s) => ({
      speaker: sibling(s)?.name ?? 'Sibling',
      portrait: sibling(s)?.id,
      text: 'HEY! Those are MY crayons! Why are you taking them?! 😠',
    }),
    options: [
      {
        id: 'explain',
        label: '"I\'m packing them in your bag for art class tomorrow."',
        tone: 'good',
        skills: { communication: 8, empathy: 4 },
        apply: (s) => {
          s.trust(sibling(s)!.id, 6);
          s.bump('comm', 15);
          return 'Explaining calmly cleared it up instantly. "Oh! Thank you!" Most fights start with a misunderstanding.';
        },
      },
      {
        id: 'snap',
        label: '"Relax! I\'m helping you, okay?!"',
        tone: 'neutral',
        apply: (s) => {
          s.trust(sibling(s)!.id, -4);
          s.bump('comm', -5);
          return 'It worked, but your sibling feels hurt by the tone. The same message, said calmly, lands better.';
        },
      },
      {
        id: 'give-up',
        label: '"Fine, keep them."',
        tone: 'bad',
        apply: (s) => {
          s.release('crayons');
          s.world('found.crayons', false);
          s.bump('problem', -10);
          return 'You put the crayons back — but now they won\'t be packed for art class. Explaining would have solved this.';
        },
      },
    ],
  },

  'missing-document': {
    id: 'missing-document',
    category: 'public-service',
    title: 'Missing document',
    trigger: 'manual',
    prompt: () => ({
      speaker: NPC_LOOKS.receptionist.name,
      portrait: 'npc:receptionist',
      text: 'To check in, I need the patient\'s health card. Do you have it?',
    }),
    options: [
      {
        id: 'go-home',
        label: 'Go home and bring the card',
        tone: 'neutral',
        skills: { responsibility: 4 },
        apply: (s) => {
          s.flag('needCard', true);
          return 'Going back costs time, but it is the reliable fix. Next time, check the documents list before leaving.';
        },
      },
      {
        id: 'ask-alt',
        label: 'Ask if the record can be found another way',
        tone: 'good',
        skills: { communication: 6, problem: 6 },
        apply: (s) => {
          s.flag('lookedUp', true);
          s.spendTime(5, 'Receptionist searched the records');
          s.bump('comm', 10);
          return 'The receptionist finds the record using the phone number. It took 5 minutes — asking politely opened a new option.';
        },
      },
    ],
  },
};
