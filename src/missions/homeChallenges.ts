// Challenges for the home missions (cook-meal, laundry). All use trigger 'manual':
// the mission code presents them with s.presentChallenge(HOME_CHALLENGES[id], after?).
import type { ChallengeDef } from './types';
import type { GameStore } from '../core/store';
import { words } from '../domain/region';

const assignerName = (s: GameStore) => s.assigner()?.name ?? 'your parent';
const assignerId = (s: GameStore) => s.assigner()?.id;

/** Free both hands of anything except the listed items. */
function freeHands(s: GameStore, keep: string[] = []) {
  for (const h of [...s.state.hands]) if (!keep.includes(h)) s.release(h);
}

export const HOME_CHALLENGES: Record<string, ChallengeDef> = {
  // ---------------- cooking ----------------
  'unwashed-veg': {
    id: 'unwashed-veg',
    category: 'household',
    title: 'Unwashed vegetables',
    trigger: 'manual',
    prompt: () => ({
      speaker: 'Chopping board',
      text: 'Wait a second… there is still soil on the carrots and the onion skin is dusty. Vegetables should be washed before chopping. What do you do?',
    }),
    options: [
      {
        id: 'wash-first',
        label: 'Take them to the sink and wash them first',
        tone: 'good',
        whatIf: 'Clean, safe vegetables; costs about 2 minutes',
        skills: { household: 4, responsibility: 3 },
        apply: (s) => {
          s.world('veg.state', 'washed');
          s.flag('orderSlip', true);
          s.spendTime(2, 'Walked back and washed the vegetables');
          return 'Good call. Washing first removes soil and germs. Next time: fridge → sink → chopping board.';
        },
      },
      {
        id: 'rinse-chopped',
        label: 'Chop now and rinse the pieces afterwards',
        tone: 'neutral',
        whatIf: 'Works, but slower and soggier (+4 min)',
        skills: { problem: 2 },
        apply: (s) => {
          s.world('veg.state', 'washed');
          s.flag('orderSlip', true);
          s.flag('rinsedChopped', true);
          s.spendTime(4, 'Rinsed the chopped pieces');
          return 'Rinsing small pieces takes longer and washes away some flavour. Washing whole vegetables first is quicker.';
        },
      },
      {
        id: 'chop-anyway',
        label: "Chop them as they are — it'll boil anyway",
        tone: 'bad',
        whatIf: 'Gritty soup and a hygiene slip',
        apply: (s) => {
          s.flag('unwashed', true);
          s.world('veg.state', 'washed');
          return 'Boiling does not remove grit and soil. Always wash vegetables before you cut them.';
        },
      },
    ],
  },

  'pot-burning': {
    id: 'pot-burning',
    category: 'household',
    title: 'The soup is burning',
    trigger: 'manual',
    prompt: (s) =>
      s.getFlag('leftStove', false)
        ? { speaker: assignerName(s), portrait: assignerId(s), text: 'The pot burned while nobody was watching it. The bottom is black and the kitchen smells smoky. How do you want to fix dinner?' }
        : { speaker: 'Kitchen', text: '💨 Smoke is curling up from the pot! The soup has been on the stove too long and is sticking to the bottom. Quick — what do you do?' },
    options: [
      {
        id: 'add-water',
        label: 'Turn off the heat, add water and save what you can',
        tone: 'good',
        whatIf: 'Saves most of the soup; a little smoky (+6 min)',
        skills: { problem: 5, household: 3 },
        apply: (s) => {
          s.world('stove.state', 'off-ready');
          s.flag('burnChoice', 'water');
          s.spendTime(6, 'Rescued the soup');
          return 'You poured the good soup into a clean pot and left the burnt layer behind. Turning the heat off first was the right move.';
        },
      },
      {
        id: 'restart',
        label: 'Start over with the spare vegetables',
        tone: 'neutral',
        whatIf: 'Tastes great, but costs about 12 minutes',
        skills: { problem: 3, patience: 4 },
        apply: (s) => {
          s.world('stove.state', 'empty');
          s.world('veg.state', 'chopped');
          freeHands(s);
          s.hold('chopped-veg');
          s.flag('burnChoice', 'restart');
          s.spendTime(12, 'Washed and chopped spare vegetables');
          return 'You scrubbed the pot and prepared a fresh batch. Put the chopped vegetables in the pot again — and keep an eye on it this time.';
        },
      },
      {
        id: 'tell',
        label: 'Turn off the stove and tell your parent honestly',
        tone: 'good',
        whatIf: 'Honesty builds trust; dinner gets saved together',
        skills: { communication: 6, responsibility: 4 },
        apply: (s) => {
          s.world('stove.state', 'off-ready');
          s.flag('burnChoice', 'told');
          s.bump('comm', 15);
          s.spendTime(4, 'Fixed it together');
          const a = s.assigner();
          if (a) s.trust(a.id, 5);
          return words(`${assignerName(s)}: "Thank you for telling me straight away, {endearment}. Mistakes happen — let's save the top part together."`);
        },
      },
      {
        id: 'hide',
        label: 'Scrape off the burnt bits and say nothing',
        tone: 'bad',
        whatIf: 'Everyone tastes the smoke and trust drops',
        apply: (s) => {
          s.world('stove.state', 'off-ready');
          s.flag('burnChoice', 'hid');
          s.flag('hidBurnt', true);
          s.spendTime(2);
          return 'Burnt flavour spreads through the whole pot. It is very hard to hide — honesty usually works out better.';
        },
      },
    ],
  },

  // ---------------- laundry ----------------
  'laundry-sort': {
    id: 'laundry-sort',
    category: 'household',
    title: 'Sorting the laundry',
    trigger: 'manual',
    prompt: () => ({
      speaker: 'Washing machine',
      text: 'You have the whites pile (school shirts) and the colours pile. Coloured clothes can leak dye in warm water. How do you load the machine?',
    }),
    options: [
      {
        id: 'check',
        label: 'Check the whites pile first',
        tone: 'good',
        whatIf: 'Finds the red sock; whites stay white (+2 min)',
        skills: { planning: 5, household: 4 },
        apply: (s) => {
          s.flag('sortChoice', 'checked');
          s.world('laundry.result', 'white');
          s.world('laundry.colors', 'next-load');
          s.world('laundry.whites', 'loaded');
          freeHands(s);
          s.spendTime(2, 'Checked every shirt');
          return 'A RED SOCK was hiding between the white shirts! You moved it to the colours pile for the next load. Whites go in on their own.';
        },
      },
      {
        id: 'whites-only',
        label: 'Wash the whites as they are',
        tone: 'neutral',
        whatIf: 'Looks sorted — but anything hidden in the pile goes in too',
        apply: (s) => {
          s.flag('sortChoice', 'whites-unchecked');
          s.world('laundry.result', 'pink');
          s.world('laundry.colors', 'next-load');
          s.world('laundry.whites', 'loaded');
          freeHands(s);
          s.spendTime(0.5);
          return 'You load the whites without looking through them. Colours wait for the next load.';
        },
      },
      {
        id: 'mixed',
        label: 'Wash everything together (faster)',
        tone: 'bad',
        whatIf: 'One load instead of two — but dye can run onto whites',
        apply: (s) => {
          s.flag('sortChoice', 'mixed');
          s.world('laundry.result', 'pink');
          s.world('laundry.colors', 'loaded');
          s.world('laundry.whites', 'loaded');
          freeHands(s);
          return 'Everything goes in together. One load is faster… we will see how it comes out.';
        },
      },
    ],
  },

  'laundry-detergent': {
    id: 'laundry-detergent',
    category: 'household',
    title: 'How much detergent?',
    trigger: 'manual',
    prompt: () => ({
      speaker: 'Detergent bottle',
      text: 'Label: "Normal load — 1 capful. Do not overfill." How much do you pour in?',
    }),
    options: [
      {
        id: 'right',
        label: 'Measure one capful, as the label says',
        tone: 'good',
        whatIf: 'Clean clothes, no mess',
        skills: { household: 4 },
        apply: (s) => {
          s.flag('detergent', 'right');
          s.spendTime(1);
          return 'Reading the label and measuring is exactly right. More soap does not mean cleaner clothes.';
        },
      },
      {
        id: 'lots',
        label: 'Pour in lots — extra clean!',
        tone: 'bad',
        whatIf: 'Foam overflows and must be wiped up (+8 min)',
        apply: (s) => {
          s.flag('detergent', 'too-much');
          s.spendTime(0.5);
          return 'Glug, glug, glug… that is a lot of soap.';
        },
      },
      {
        id: 'none',
        label: 'Skip it — water is enough',
        tone: 'bad',
        whatIf: 'Clothes come out still smelly',
        apply: (s) => {
          s.flag('detergent', 'none');
          return 'Water alone does not lift sweat and dirt out of fabric.';
        },
      },
    ],
  },

  'laundry-pink': {
    id: 'laundry-pink',
    category: 'household',
    title: 'The whites turned pink',
    trigger: 'manual',
    prompt: () => ({
      speaker: 'Washing machine',
      text: 'Oh no! The white school shirts came out PINK. A red sock was in the load and its dye ran. What now?',
    }),
    options: [
      {
        id: 'rewash',
        label: 'Re-wash the whites with a whitener (+30 min)',
        tone: 'good',
        whatIf: 'Shirts are saved, but it costs 30 minutes',
        skills: { problem: 6, patience: 5 },
        apply: (s) => {
          s.flag('pinkChoice', 'rewash');
          s.world('laundry.result', 'white');
          freeHands(s);
          s.hold('white-shirt');
          if (s.getFlag('sortChoice', '') === 'mixed') s.hold('clothes-pile');
          s.spendTime(30, 'Re-washed the whites with whitener');
          return 'You took out the red sock and ran the whites again with a whitener. They are white again! Fixing a mistake properly takes time — checking first is faster.';
        },
      },
      {
        id: 'tell',
        label: 'Tell your parent honestly',
        tone: 'good',
        whatIf: 'Shirts stay pink for now, but trust grows',
        skills: { communication: 6, responsibility: 5 },
        apply: (s) => {
          s.flag('pinkChoice', 'told');
          s.flag('toldPink', true);
          s.bump('comm', 15);
          const a = s.assigner();
          if (a) s.trust(a.id, 4);
          return words(`${assignerName(s)}: "Ah, the classic red sock! Thanks for telling me, {endearment}. Hang them up — we'll soak them in whitener tomorrow. Next time, check the pile first."`);
        },
      },
      {
        id: 'hide',
        label: 'Hang the pink shirt at the back and say nothing',
        tone: 'bad',
        whatIf: 'Someone will find it — and trust drops',
        apply: (s) => {
          s.flag('pinkChoice', 'hid');
          s.flag('hidPink', true);
          return 'Hiding a mistake does not make it go away. Someone will need that school shirt tomorrow…';
        },
      },
    ],
  },
};
