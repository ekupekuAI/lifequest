// Reusable challenge library. Missions attach challenges by id (with optional
// probability); the GameStore evaluates triggers on game events.
import type { ChallengeDef } from './types';
import type { GameStore } from '../core/store';
import { NPC_LOOKS } from '../domain/family';
import { playerIndex } from '../core/systems';
import { formatMoney } from '../domain/items';
import { money, words } from '../domain/region';

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
        whatIf: 'Get a sensible substitute quickly; +Communication',
        label: 'Ask the helper for a good alternative',
        tone: 'good',
        skills: { communication: 5, problem: 5 },
        apply: (s) => {
          s.flag('askedStore', true);
          s.bump('comm', 10);
          s.bump('problem', 10);
          s.spendTime(1);
          setTimeout(() => s.openModal({ type: 'shelf', shelfId: 'shelf-dairy' }), 30);
          return `The helper suggests the toned milk tetra pack (${formatMoney(money(38))}). It is plain milk in different packaging — a sensible substitute.`;
        },
      },
      {
        id: 'call',
        whatIf: '2 min slower, but no guesswork; +Communication, +trust',
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
                  text: words("Thanks for calling! A tetra pack of plain milk is fine. Or check {shopkeeper}'s shop across the road — they usually have packets. No milkshakes, okay?"),
                },
              ]),
            30,
          );
          return `Calling ${assignerName(s)} took 2 minutes but removed the guesswork. Clarifying early prevents mistakes later.`;
        },
      },
      {
        id: 'other-shop',
        whatIf: 'Extra walking time, but you might find packets',
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
        whatIf: 'No milk for the family; lower Problem-solving',
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
        whatIf: 'Cutter goes to the back; +Communication',
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
        whatIf: 'Staff handle it; +Responsibility',
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
        whatIf: 'About 3 extra minutes of waiting; +Patience',
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
        whatIf: 'About 1 min slower; +Empathy',
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
        whatIf: 'No delay; fair, but a kindness missed',
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
    prompt: () => ({ speaker: NPC_LOOKS.cashier.name, portrait: 'npc:cashier', text: `Did you bring a bag? Paper bags are ${formatMoney(money(5))} each.` }),
    options: [
      {
        id: 'buy-bag',
        whatIf: 'Small fee added to your bill',
        get label() {
          return `Buy a paper bag (${formatMoney(money(5))})`;
        },
        tone: 'neutral',
        skills: { budget: 2 },
        apply: (s) => {
          s.world('bagFee', money(5));
          s.flag('boughtBag', true);
          return `A ${formatMoney(money(5))} bag is small, but it adds up. Taking a reusable bag from home saves money and waste.`;
        },
      },
      {
        id: 'hands',
        whatIf: 'Save the fee, but you tire faster',
        label: 'Carry everything in my hands',
        tone: 'neutral',
        skills: { problem: 2 },
        apply: (s) => {
          s.world('carryingByHand', true);
          s.flag('carriedByHand', true);
          return `You saved ${formatMoney(money(5))}, but carrying loose groceries makes you tire faster. Next time, remember the bag on the hook!`;
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
        whatIf: 'Stay dry, no delay; +Planning',
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
        whatIf: '8 minutes lost, groceries stay dry',
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
        whatIf: 'Save time, lose 15 energy',
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
        whatIf: 'Right item first time; +Communication',
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
        whatIf: 'Shopkeeper guesses for you',
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
        whatIf: '2 min, sibling trusts you more; +Empathy',
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
        whatIf: 'Short delay explained; small trust gain',
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
        whatIf: 'Sibling waits for medicine; trust drops',
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
        whatIf: 'Solved it yourself; +Problem-solving',
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
        whatIf: '1 min, certain answer; +Communication',
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
        whatIf: 'Looks tidy, but the mug is found later',
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
        whatIf: 'Misunderstanding cleared; +trust',
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
        whatIf: 'Works, but feelings are hurt',
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
        whatIf: 'Crayons stay unpacked; task harder',
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
        whatIf: 'Reliable but costs a trip; token keeps your place',
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
        whatIf: '5 min lookup, no trip home; +Communication',
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

  'wrong-change': {
    id: 'wrong-change',
    category: 'money',
    title: 'Short change',
    trigger: 'purchased',
    when: (_s, ev) => ev.type === 'purchased' && ev.store === 'kiosk',
    prompt: () => ({
      speaker: NPC_LOOKS.sharma.name,
      portrait: 'npc:sharma',
      text: 'Here is your change! (A few coins drop into your hand. It feels a little light…)',
    }),
    options: [
      {
        id: 'count',
        whatIf: 'You get the right change; +Budgeting',
        label: 'Count the change and politely point out the mistake',
        tone: 'good',
        skills: { budget: 6, communication: 3 },
        apply: (s) => {
          s.bump('comm', 5);
          return `You were short by ${formatMoney(money(10))}. "Oh! So sorry!" Counting change is a quick habit that protects your money.`;
        },
      },
      {
        id: 'ignore',
        whatIf: 'You lose a little money without noticing',
        label: 'Pocket it without counting',
        tone: 'bad',
        apply: (s) => {
          s.pay(money(10), 'Short change (not counted)');
          return `You walked away ${formatMoney(money(10))} short. Mistakes happen — counting your change catches them.`;
        },
      },
      {
        id: 'accuse',
        whatIf: 'You get the money, but the shopkeeper is upset',
        label: '"You are trying to cheat me!"',
        tone: 'neutral',
        apply: (s) => {
          s.bump('comm', -10);
          return 'You got your money back, but it was an honest mistake. Calmly pointing it out works just as well and keeps good relations.';
        },
      },
    ],
  },

  'locked-out': {
    id: 'locked-out',
    category: 'memory',
    title: 'Locked out',
    trigger: 'manual',
    prompt: () => ({ speaker: '', text: "You try the front door… it's locked! Your house keys are still hanging on the hook inside." }),
    options: [
      {
        id: 'bell',
        whatIf: 'Someone lets you in; small trust dip',
        label: 'Ring the doorbell',
        tone: 'neutral',
        apply: (s) => {
          s.world(`unlocked.${s.state.clock.day}`, true);
          s.spendTime(1);
          const who = s.memberByRole('grandparent', 'mother', 'father', 'guardian', 'older-sibling');
          if (who) s.trust(who.id, -1);
          setTimeout(() => s.bus.emit('scene', { goto: 'home', spawn: 'door' }), 40);
          return words(`${who?.name ?? 'Someone'} opens the door: "Forgot your keys again, {endearment}?" Keep keys in the same place and check before leaving.`);
        },
      },
      {
        id: 'phone',
        whatIf: '2 minutes on the phone, then you are let in',
        label: 'Call home so someone opens up',
        tone: 'neutral',
        apply: (s) => {
          s.world(`unlocked.${s.state.clock.day}`, true);
          s.spendTime(2);
          setTimeout(() => s.bus.emit('scene', { goto: 'home', spawn: 'door' }), 40);
          return 'A quick call and the door opens. A checklist by the door (keys, bag, money) prevents this.';
        },
      },
    ],
  },
};
