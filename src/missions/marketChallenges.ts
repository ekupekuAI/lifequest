// Market-cart challenges. Presented manually by the bargaining flow in src/game/market.ts
// (s.presentChallenge(MARKET_CHALLENGES[id], after)) — merged into the store's CHALLENGES map for titles.
import type { ChallengeDef } from './types';
import type { GameStore } from '../core/store';
import { region } from '../domain/region';
import { todaysVendor, vendorAddress } from '../game/market';

const vendor = (s: GameStore) => {
  const v = todaysVendor(s);
  return { speaker: v.name, portrait: `npc:${v.key}` };
};

export const MARKET_CHALLENGES: Record<string, ChallengeDef> = {
  'other-customer': {
    id: 'other-customer',
    category: 'communication',
    title: 'A loud customer at the cart',
    trigger: 'manual',
    prompt: (s) => ({
      speaker: 'A customer',
      text: `A man next to you jabs a finger at the price board: "Daylight robbery! Half price or I'm going!" ${todaysVendor(s).name} looks tired. The man turns to you: "Back me up, kid — tell him it's a rip-off!"`,
    }),
    options: [
      {
        id: 'respectful',
        label: '"I think I\'ll just ask politely, thanks." (wait your turn)',
        tone: 'good',
        whatIf: 'You stay respectful — the vendor notices and starts your bargain in a better mood; +Empathy',
        skills: { empathy: 4, communication: 3 },
        apply: (s) => {
          s.flag('mk.calmCustomer', true);
          s.bump('resp', 5);
          return 'You stayed out of it and waited your turn. The vendor gives you a grateful nod.';
        },
      },
      {
        id: 'join',
        label: '"Yeah! Rip-off! Half price!"',
        tone: 'bad',
        whatIf: 'Ganging up on a vendor sours the mood — your own bargain starts badly; −Communication',
        apply: (s) => {
          s.flag('mk.joinedMob', true);
          s.bump('comm', -10);
          s.bump('resp', -10);
          return 'Joining in made the vendor bristle. Ganging up on someone earning a living is never a good look.';
        },
      },
      {
        id: 'leave',
        label: 'Roll your eyes and step back',
        tone: 'neutral',
        whatIf: 'No harm done, but a kind word for the vendor would have helped',
        apply: () => 'You stepped back until the man stomped off. Fine — though a friendly word to the vendor costs nothing.',
      },
    ],
  },
  'bruised-tomatoes': {
    id: 'bruised-tomatoes',
    category: 'money',
    title: 'Soft tomatoes in the bag',
    trigger: 'manual',
    prompt: (s) => ({
      ...vendor(s),
      text: `As the tomatoes go into your bag, you spot two squashed, soft ones slipping in with the good ones…`,
    }),
    options: [
      {
        id: 'swap',
        // addresses the vendor the local way (Bhaiya / Mama / Don Chuy / Excuse me…)
        get label() {
          return `"${vendorAddress()}, could you swap these two soft ones, please?"`;
        },
        tone: 'good',
        whatIf: 'A polite swap gets you fresh tomatoes without any drama; +Problem-solving',
        skills: { problem: 4, communication: 3 },
        apply: (s) => {
          s.flag('mk.swappedBruised', true);
          s.bump('problem', 10);
          return `"Oh — sorry, sorry!" ${todaysVendor(s).name} swaps them for two firm ones. Checking before you leave beats complaining later.`;
        },
      },
      {
        id: 'ignore',
        label: "Say nothing — it's only two",
        tone: 'neutral',
        whatIf: 'Two tomatoes go to waste at home; checking would have caught it',
        apply: (s) => {
          s.flag('mk.bruisedHome', true);
          return 'You let it go. At home, two tomatoes will be too squashed to cook with.';
        },
      },
      {
        id: 'accuse',
        label: '"You\'re trying to cheat me with rotten ones!"',
        tone: 'bad',
        whatIf: 'Accusing someone of cheating over an honest slip hurts — a calm request works better; −Communication',
        apply: (s) => {
          s.flag('mk.accused', true);
          s.bump('comm', -12);
          return `${todaysVendor(s).name} swaps them, stung: "I'm not a cheat." It was probably an honest slip — a calm request would have done it.`;
        },
      },
    ],
  },
  'wrong-weight': {
    id: 'wrong-weight',
    category: 'money',
    title: 'The scale looks off',
    trigger: 'manual',
    prompt: (s) => ({
      ...vendor(s),
      text: `The needle on the old hanging scale wobbles and settles at about 900 g — not quite a kilo. ${todaysVendor(s).name} is already reaching for a bag.`,
    }),
    options: [
      {
        id: 'reweigh',
        label: '"Could you check the weight once more, please?"',
        tone: 'good',
        whatIf: 'Politely asking for a re-weigh gets you the full kilo; +Problem-solving',
        skills: { problem: 4, budget: 2 },
        apply: (s) => {
          s.flag('mk.reweighed', true);
          s.bump('problem', 10);
          s.giveItem('tomato', 1);
          return `"Oh! You're right." One more tomato goes in — the full kilo. Polite checks keep everyone honest.`;
        },
      },
      {
        id: 'accuse',
        label: '"Your scale is rigged! Cheater!"',
        tone: 'bad',
        whatIf: 'The vendor fixes it but feels insulted — and other customers stare; −Communication',
        apply: (s) => {
          s.flag('mk.accused', true);
          s.bump('comm', -12);
          s.giveItem('tomato', 1);
          return 'The vendor adds one more, offended. Old scales drift — assuming the worst made it awkward for everyone.';
        },
      },
      {
        id: 'ignore',
        label: 'Let it go',
        tone: 'neutral',
        whatIf: 'You pay for a kilo and get 900 g — a quiet "could you check?" would have fixed it',
        apply: () => 'You let it go — you paid for a kilo but took home about 900 g.',
      },
    ],
  },
  'free-chilli': {
    id: 'free-chilli',
    category: 'communication',
    title: 'A little extra for a nice customer',
    trigger: 'manual',
    prompt: (s) => ({
      ...vendor(s),
      text: `${todaysVendor(s).name} tucks a handful of green chillies and fresh ${region().id === 'in' ? 'dhaniya (coriander)' : 'coriander'} into your bag. "For being so nice — free! Say hello at home."`,
    }),
    options: [
      {
        id: 'thank',
        label: '"Thank you so much! That\'s really kind."',
        tone: 'good',
        whatIf: 'A warm thank-you builds a relationship — next time you are a regular; +Empathy',
        skills: { empathy: 3, communication: 3 },
        apply: (s) => {
          s.flag('mk.thankedGift', true);
          s.bump('comm', 5);
          return 'The vendor beams. Being a friendly regular is worth more than any discount.';
        },
      },
      {
        id: 'silent',
        label: 'Take it without a word',
        tone: 'neutral',
        whatIf: 'Nothing lost, but a thank-you costs nothing',
        apply: () => 'You take the bag. A quick "thank you" would have made their evening.',
      },
      {
        id: 'greedy',
        label: '"Only chillies? Throw in some lemons too!"',
        tone: 'bad',
        whatIf: 'Asking for more after a gift comes across as greedy; −Communication',
        apply: (s) => {
          s.flag('mk.greedy', true);
          s.bump('comm', -8);
          return 'The vendor\'s smile fades. A gift is a kindness, not an opening bid.';
        },
      },
    ],
  },
};
