// Social challenges for the optional teen "Date on a Budget" storyline.
// Presented manually by src/missions/dateNight.ts via s.presentChallenge(SOCIAL_CHALLENGES[id], after).
// Tone rules: wholesome and age-appropriate; the cringe is always at the PLAYER's expense,
// never the partner's. Every option teaches something (budget, listening, honesty, boundaries…).
import type { ChallengeDef } from './types';
import type { GameStore } from '../core/store';
import type { FamilyMember } from '../domain/types';
import { words } from '../domain/region';
import { formatClock } from '../core/systems';

// ---------------------------------------------------------------- shared helpers

export const partnerOf = (s: GameStore): FamilyMember | undefined => s.memberByRole('partner');
export const pName = (s: GameStore) => partnerOf(s)?.name ?? 'your date';
/** A line shown as a phone chat bubble from the partner. */
export const textFrom = (s: GameStore, text: string) => ({ speaker: `📱 ${pName(s)}`, portrait: partnerOf(s)?.id, text });
/** A line the partner says face to face. */
export const sayFrom = (s: GameStore, text: string) => ({ speaker: pName(s), portrait: partnerOf(s)?.id, text });

/** The family member who asks for the favour before the date (picked when the mission starts). */
export function favourMember(s: GameStore): FamilyMember | undefined {
  const id = s.getFlag('favourBy', '');
  return id ? s.member(String(id)) : undefined;
}
/** The favour asker speaks in person at home, otherwise by text. */
export function favourSpeaker(s: GameStore) {
  const m = favourMember(s);
  if (!m) return { speaker: 'Family', portrait: undefined as string | undefined };
  const inPerson = s.state.location === 'home' && !!s.getFlag('favourAtHome', false);
  return { speaker: inPerson ? m.name : `📱 ${m.name}`, portrait: m.id };
}

/** Remember what the other person says back; dateNight shows it right after the choice. */
const react = (s: GameStore, text: string) => s.flag('react', text);

// ---------------------------------------------------------------- challenges

export const SOCIAL_CHALLENGES: Record<string, ChallengeDef> = {
  'date-favour': {
    id: 'date-favour',
    category: 'household',
    title: 'A quick favour first',
    trigger: 'manual',
    prompt: (s) => {
      const who = favourSpeaker(s);
      const inPerson = !who.speaker.startsWith('📱');
      return {
        ...who,
        text: words(
          inPerson
            ? 'Off somewhere, {endearment}? You look… suspiciously tidy. 🤨 Before you go, could you take the rubbish out and fold the towels? Three minutes, tops.'
            : 'Before you head out anywhere, {endearment} — can you take the rubbish out and fold the towels? Three minutes, tops 🙏',
        ),
      };
    },
    options: [
      {
        id: 'do-it',
        label: '"Sure! Doing it now — then I\'m meeting a friend at the park till 7."',
        tone: 'good',
        whatIf: 'Chores done in 3 minutes, family knows where you are, still on time',
        skills: { responsibility: 6, household: 3, communication: 3 },
        apply: (s) => {
          const m = favourMember(s);
          s.spendTime(3, 'Rubbish out & towels folded');
          if (m) s.trust(m.id, 3);
          s.flag('favour', 'done');
          s.bump('resp', 20);
          react(s, 'Thank you! Have fun — and be back for dinner 😊');
          return 'Three minutes of helping, zero minutes of guilt. Saying where you are going earns trust, too.';
        },
      },
      {
        id: 'argue',
        label: '"Ugh, why NOW? I\'m literally about to leave!"',
        tone: 'neutral',
        whatIf: 'Arguing takes about as long as the chore and costs trust',
        apply: (s) => {
          const m = favourMember(s);
          s.spendTime(3, 'Arguing about the chores');
          if (m) s.trust(m.id, -3);
          s.flag('favour', 'argued');
          s.bump('resp', -10);
          react(s, '…Fine. Go. But we are talking about this later.');
          return 'The argument took as long as the chore would have — and cost some trust.';
        },
      },
      {
        id: 'sneak',
        label: 'Pretend you didn\'t hear and slip out the door 🥷',
        tone: 'bad',
        whatIf: 'Saves 3 minutes, but your family has no idea where you are — big trust hit',
        apply: (s) => {
          const m = favourMember(s);
          if (m) s.trust(m.id, -6);
          s.flag('favour', 'sneaked');
          s.bump('resp', -25);
          react(s, '(from inside the house) …Hello? Where did they go?!');
          return 'Sneaking out costs far more trust than three minutes of chores. Telling your family where you are going is also about staying safe.';
        },
      },
    ],
  },

  'date-outfit': {
    id: 'date-outfit',
    category: 'unexpected',
    title: 'Mirror check',
    trigger: 'manual',
    prompt: () => ({ speaker: '🪞 Mirror', text: 'Mirror check! The plan is a park bench by a duck pond. What are you wearing?' }),
    options: [
      {
        id: 'fancy',
        label: 'Full suit / ballgown. Go big or go home. 🤵👗',
        tone: 'neutral',
        whatIf: 'Takes 12 minutes and gets an "are you going to a wedding?" 😂',
        apply: (s) => {
          s.spendTime(12, 'Getting VERY fancy');
          s.flag('outfit', 'fancy');
          s.bump('plan', -5);
          return 'Overdressed for a duck pond 😂 — but you did make an effort. Dress for where you are going.';
        },
      },
      {
        id: 'casual',
        label: 'Clean jeans & a nice top, hair sorted, deodorant ✔️',
        tone: 'good',
        whatIf: 'Five minutes, right for the park, and you smell nice',
        skills: { planning: 4 },
        apply: (s) => {
          s.spendTime(5, 'Getting ready');
          s.flag('outfit', 'casual');
          s.bump('plan', 20);
          return 'Clean, comfy and right for the park. Deodorant: the real MVP.';
        },
      },
      {
        id: 'pyjamas',
        label: 'Pyjamas. It\'s called comfort. 😴',
        tone: 'bad',
        whatIf: 'Zero effort — and it shows',
        apply: (s) => {
          s.flag('outfit', 'pyjamas');
          s.bump('plan', -15);
          return 'Comfy… but turning up in pyjamas says "I didn\'t really think about this".';
        },
      },
    ],
  },

  'date-opener': {
    id: 'date-opener',
    category: 'communication',
    title: 'Breaking the ice',
    trigger: 'manual',
    prompt: (s) => sayFrom(s, 'So… 😊  (an awkward silence. Somewhere, a duck quacks.)'),
    options: [
      {
        id: 'pickup',
        label: '"Are you a bus timetable? Because I\'ve been waiting for you…" 😏',
        tone: 'neutral',
        whatIf: 'Pure cringe. They laugh — but mostly AT the line',
        apply: (s) => {
          s.flag('pickup', true);
          s.bump('comm', -10);
          react(s, "*stares* … *a duck also stares* … *snort-laughs* That was SO bad 😂 …I'm keeping it forever.");
          return 'Pickup lines are a gamble — this one survived on pure cringe. A real question works better.';
        },
      },
      {
        id: 'ask-day',
        label: '"How did your science test go? You said you were nervous."',
        tone: 'good',
        whatIf: 'You remembered a detail from their text — they light up',
        skills: { communication: 6, empathy: 4 },
        apply: (s) => {
          s.flag('askedDay', true);
          s.bump('comm', 20);
          const p = partnerOf(s);
          if (p) s.trust(p.id, 3);
          react(s, 'You remembered?! 🥺 It went okay I think — I only blanked on ONE question.');
          return 'Remembering something from their text shows you actually listen. That beats any pickup line.';
        },
      },
      {
        id: 'monologue',
        label: '"So anyway, I hit level 40 in my game and—" (talk for 10 minutes)',
        tone: 'neutral',
        whatIf: 'Ten minutes about you; they nod politely',
        apply: (s) => {
          s.spendTime(10, 'Explaining your game. In detail.');
          s.flag('monologue', true);
          s.bump('comm', -5);
          react(s, `"…Cool! 😅"  (${pName(s)} has been nodding for ten minutes straight.)`);
          return 'Talking only about yourself turns a chat into a podcast. Ask questions back!';
        },
      },
    ],
  },

  'date-honesty': {
    id: 'date-honesty',
    category: 'communication',
    title: 'Do you like it too?',
    trigger: 'manual',
    prompt: (s) => sayFrom(s, 'Okay, important question. Have you watched "Star Bakers"? I\'m OBSESSED. 🍰 Do you like it?'),
    options: [
      {
        id: 'pretend',
        label: '"OMG yes, I LOVE it, it\'s my favourite!" (you have never seen it)',
        tone: 'bad',
        whatIf: 'They ask who your favourite baker is. You panic.',
        apply: (s) => {
          s.flag('pretended', true);
          s.bump('comm', -15);
          react(s, '"No way! Who\'s your favourite baker?" — "The… one with the… cake?" 😬 — "They ALL have cake." 😂');
          return 'Pretending to like something gets found out fast. Honest + curious beats fake every time.';
        },
      },
      {
        id: 'honest',
        label: '"I haven\'t seen it yet — what do you like about it?"',
        tone: 'good',
        whatIf: 'They happily explain everything; you actually want to watch it now',
        skills: { communication: 5, decisions: 2 },
        apply: (s) => {
          s.flag('honest', true);
          s.bump('comm', 20);
          react(s, `"Okay so there's this episode where the cake COLLAPSES—"  (${pName(s)} lights up and explains everything. You kind of want to watch it now.)`);
          return 'Being honest AND curious works. People love talking about what they love.';
        },
      },
      {
        id: 'dismiss',
        label: '"Baking shows? Kinda cringe tbh."',
        tone: 'bad',
        whatIf: 'Awkward silence. Even the ducks look away.',
        apply: (s) => {
          s.flag('dismissed', true);
          s.bump('comm', -20);
          const p = partnerOf(s);
          if (p) s.trust(p.id, -3);
          react(s, '"Oh. Okay." 😶  (Awkward silence. Even the ducks look away.)');
          return 'You can not like something without putting down the person who does. "Not my thing, but tell me about it" works.';
        },
      },
    ],
  },

  'date-curfew': {
    id: 'date-curfew',
    category: 'time',
    title: 'Home by 7:15',
    trigger: 'manual',
    prompt: (s) => sayFrom(s, `Oh no, it's already ${formatClock(s.state.clock.minutes)}! I have to be home by 7:15 — my mum's really strict about it. 😬`),
    options: [
      {
        id: 'walk',
        label: '"No problem! I\'ll walk you to the bus stop."',
        tone: 'good',
        whatIf: 'They get home on time and you get a wave from the bus window',
        skills: { responsibility: 5, empathy: 5 },
        apply: (s) => {
          s.spendTime(6, 'Walking to the bus stop');
          s.flag('curfew', 'walked');
          s.bump('resp', 20);
          const p = partnerOf(s);
          if (p) s.trust(p.id, 4);
          react(s, `"Thanks for walking me 😊 Text you later!"  (${pName(s)} waves from the bus. You wave back for slightly too long.)`);
          return 'Respecting their curfew and making sure they get to the bus safely — exactly right.';
        },
      },
      {
        id: 'plead',
        label: '"Stay 10 more minutes, pleeease? 🥺"',
        tone: 'bad',
        whatIf: 'They still have to go — and now it feels awkward',
        apply: (s) => {
          s.flag('curfew', 'pleaded');
          s.bump('resp', -25);
          const p = partnerOf(s);
          if (p) s.trust(p.id, -4);
          react(s, '"I really can\'t. When I say I have to go, I have to go 🙂 See you at school!"  (They leave anyway.)');
          return 'When someone says they need to leave, the answer is "okay!" — even for ten minutes. Respecting boundaries is always the right call.';
        },
      },
      {
        id: 'shrug',
        label: '"Okay. Bye I guess." 🤷',
        tone: 'neutral',
        whatIf: 'Curfew respected, but the goodbye is a bit cold',
        apply: (s) => {
          s.flag('curfew', 'shrugged');
          s.bump('resp', 5);
          react(s, `"…Bye? 😅"  (${pName(s)} walks to the bus alone.)`);
          return 'You respected the curfew — good! A warmer goodbye (or walking them to the bus) ends a date nicely.';
        },
      },
    ],
  },
};
