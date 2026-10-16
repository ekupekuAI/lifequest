// "Date on a Budget" — the optional teen storyline (only when the player picked a partner in setup).
//
// The partner is a classmate from across town, never part of the household. Everything stays
// wholesome (hand-holding level at most) and the humour is the player's own cringe. The real point
// is the life lessons: budgeting, punctuality, listening (the peanut allergy), honesty, respecting
// boundaries (the 7:15 curfew), apologising properly and balancing family duties with social life.
//
// Flow: text chat → family favour → mirror check → snacks at the kiosk (pocket money only) →
// park bench by the pond at 6:30 → conversation → curfew → go home → "got home safe?" text.
import type { MissionDef } from './types';
import type { GameStore, DialogueLine } from '../core/store';
import type { FamilyMember, GameState } from '../domain/types';
import { GUARDIAN_ROLES } from '../domain/types';
import { formatMoney, itemName } from '../domain/items';
import { region, words } from '../domain/region';
import { scheduleFor } from '../domain/world';
import { formatClock } from '../core/systems';
import { clamp } from './validation';
import { SOCIAL_CHALLENGES, favourMember, favourSpeaker, pName, partnerOf, sayFrom, textFrom } from './socialChallenges';

export const DATE_MISSION_ID = 'date-night';
/** The plan: park bench by the pond at 6:30 PM. */
export const DATE_AT = 18 * 60 + 30;
/** The partner gives up waiting this many minutes after the agreed time. */
export const WAIT_LIMIT = 40;
/** Snacks that count for the date (kiosk + FreshMart). */
export const SNACKS = ['popcorn', 'juice-box', 'chips', 'chocolate', 'peanut-choc', 'cold-drink'];
const PEANUT = 'peanut-choc';

type Tone = 'good' | 'neutral' | 'bad';
interface Opt {
  label: string;
  tone: Tone;
  /** what this choice leads to (decision log + "what if" on the results screen) */
  outcome: string;
  run: () => void;
}

// ---------------------------------------------------------------- small helpers

const minuteOfDay = (s: { state: GameState }) => s.state.clock.minutes % 1440;
const deadline = (s: GameStore) => s.state.run?.deadlineAt ?? DATE_AT;

/** A choice line whose pick is written to the decision log with the alternatives. */
function ask(s: GameStore, line: Omit<DialogueLine, 'choices'>, title: string, opts: Opt[]) {
  s.say([
    {
      ...line,
      choices: opts.map((o) => ({
        label: o.label,
        tone: o.tone,
        run: () => {
          s.log(`${title}: ${o.label}`, o.outcome, o.tone, opts.filter((x) => x !== o).map((x) => ({ label: x.label, outcome: x.outcome, tone: x.tone })));
          o.run();
        },
      })),
    },
  ]);
}

/** Show the other person's reaction to the last challenge choice, then continue. */
function showReact(s: GameStore, who: { speaker: string; portrait?: string }, next: () => void) {
  const text = String(s.getFlag('react', ''));
  s.flag('react', '');
  if (text) s.say([{ ...who, text }], next);
  else next();
}

/** Snacks bought during this date (from receipts), by item id. */
export function snacksBought(s: GameStore): Record<string, number> {
  const start = s.state.run?.startedAt ?? 0;
  const out: Record<string, number> = {};
  for (const rc of s.state.receipts) {
    if (rc.at < start || (rc.day !== undefined && rc.day !== s.state.clock.day)) continue;
    for (const l of rc.lines) if (SNACKS.includes(l.id)) out[l.id] = (out[l.id] ?? 0) + Math.max(0, l.qty - (l.returned ?? 0));
  }
  return out;
}

/** Is the date mission playable right now (partner exists, early enough in the evening)? */
function availability(state: GameState): { ok: boolean; reason?: string } {
  if (!state.profile.members.some((m) => m.role === 'partner'))
    return { ok: false, reason: 'Optional teen storyline: pick a girlfriend or boyfriend in family setup to unlock it.' };
  if (state.clock.minutes % 1440 >= DATE_AT - 15) return { ok: false, reason: 'Too late for a date tonight — try tomorrow before 6:15 PM.' };
  return { ok: true };
}

/** Where the partner is in town: waiting at the bench for the date, strolling in the park, or not around. */
export function partnerMode(s: GameStore): 'date' | 'stroll' | 'hidden' {
  const run = s.state.run;
  const m = minuteOfDay(s);
  if (run?.missionId === DATE_MISSION_ID) {
    if (run.flags['partnerLeft'] || run.flags['stoodUp']) return 'hidden';
    return run.objectives['meet']?.done || m >= (run.deadlineAt ?? DATE_AT) - 15 ? 'date' : 'hidden';
  }
  if (s.state.clock.day % 2 === 0 && m >= 16.5 * 60 && m < 18 * 60) return 'stroll';
  return 'hidden';
}

/** A date invite is waiting on the phone. */
export function dateTextWaiting(s: GameStore): boolean {
  return !s.state.run && !!partnerOf(s) && availability(s.state).ok && !s.doneToday(DATE_MISSION_ID);
}

/** Phone button with no task running: the partner's invite shows up as a new message. */
export function partnerPhone(s: GameStore): boolean {
  const p = partnerOf(s);
  if (!p || !dateTextWaiting(s)) return false;
  s.say([
    {
      speaker: '📱 Phone',
      text: `1 new message from ${p.name}: "hey!! are you free later? 👀"`,
      choices: [
        { label: 'Open the chat', tone: 'good', run: () => s.offerMission(DATE_MISSION_ID, p.id) },
        { label: 'Leave it for now', run: () => {} },
      ],
    },
  ]);
  return true;
}

const HELLO = [
  'Oh hey! …I mean, hi. 😅',
  "I was NOT practising what to say to you. Definitely not. 🙃",
  'Did you see the duck with the tiny hat? No? Me neither. I made it up so I could talk to you 😳',
  'My mum says I talk about you too much. I said "who?" and then went bright red. 🙈',
];

/** Talking to the partner when no date is running (they sometimes stroll through the park). */
export function partnerHello(s: GameStore, m: FamilyMember) {
  const line = HELLO[Math.floor(s.state.clock.minutes / 7) % HELLO.length];
  if (s.state.run) return s.say([{ speaker: m.name, portrait: m.id, text: `${line} You look busy — good luck with your task! 🙂` }]);
  if (dateTextWaiting(s)) {
    return s.say([
      {
        speaker: m.name,
        portrait: m.id,
        text: `${line} So, um… are you free later? Park bench by the pond, 6:30? 🦆`,
        choices: [
          { label: 'Yes! 🙌', tone: 'good', run: () => s.offerMission(DATE_MISSION_ID, m.id) },
          { label: 'Can\'t today, sorry!', run: () => s.say([{ speaker: m.name, portrait: m.id, text: 'No worries! Another day 🙂' }]) },
        ],
      },
    ]);
  }
  s.say([{ speaker: m.name, portrait: m.id, text: line }]);
}

// ---------------------------------------------------------------- the story

function textChat(s: GameStore) {
  const promise = (tone: Tone) => (tone === 'good' ? 10 : tone === 'bad' ? -5 : 0);
  const after = (reply: string, tone: Tone, react: string) => {
    s.flag('reply', reply);
    s.bump('comm', promise(tone));
    s.say(
      [
        textFrom(s, react),
        textFrom(s, "ps. I'm allergic to peanuts so no peanut stuff pls 🥜🚫"),
        textFrom(s, 'see you at 6:30!! don\'t be late 👀'),
      ],
      () => {
        s.objective('text-back');
        getReady(s);
      },
    );
  };
  s.say([
    textFrom(s, 'hey!! 👋'),
    textFrom(s, 'survived my science test 😭 (I think??)'),
    {
      ...textFrom(s, 'sooo… are you free later? park bench by the pond, 6:30? 🦆'),
      choices: [
        {
          label: '"hey 👋 … hi … I mean hello 😅"',
          tone: 'neutral',
          run: () => {
            s.log('Texting back: "hey… hi… I mean hello"', 'Three greetings in one text. Cringe, but harmless — they found it cute.', 'neutral', [
              { label: '"u up?"', outcome: 'At 5 PM?? It reads like you just woke up.', tone: 'bad' },
              { label: '"Sure! Park at 6:30? I\'ll bring snacks 🍿"', outcome: 'Clear, friendly and makes a plan.', tone: 'good' },
            ]);
            after('cringe', 'neutral', "lol hi 😂 hi hello. I'm taking that as a yes");
          },
        },
        {
          label: '"u up?"',
          tone: 'bad',
          run: () => {
            s.log('Texting back: "u up?"', 'It is the afternoon. Of course they are up. 😂', 'bad', [
              { label: '"hey 👋 … hi … I mean hello 😅"', outcome: 'Cringe, but cute.', tone: 'neutral' },
              { label: '"Sure! Park at 6:30? I\'ll bring snacks 🍿"', outcome: 'Clear, friendly and makes a plan.', tone: 'good' },
            ]);
            after('uup', 'bad', `…it's ${formatClock(s.state.clock.minutes)} 😂 yes I'm up. it's literally daytime. anyway, is that a yes?`);
          },
        },
        {
          label: '"Sure! Park at 6:30? I\'ll bring snacks 🍿"',
          tone: 'good',
          run: () => {
            s.flag('promisedSnacks', true);
            s.log('Texting back: "Sure! Park at 6:30? I\'ll bring snacks"', 'A clear yes with a plan — great texting.', 'good', [
              { label: '"hey 👋 … hi … I mean hello 😅"', outcome: 'Cringe, but cute.', tone: 'neutral' },
              { label: '"u up?"', outcome: 'At 5 PM?? It reads like you just woke up.', tone: 'bad' },
            ]);
            after('good', 'good', 'yay!! 🙌 snacks = best idea');
          },
        },
      ],
    },
  ]);
}

function getReady(s: GameStore) {
  const fav = favourMember(s);
  const outfit = () =>
    s.presentChallenge(SOCIAL_CHALLENGES['date-outfit'], () => {
      s.objective('get-ready');
      s.say([
        {
          speaker: '',
          text: words(
            `Snacks next: {kiosk} sells some — with YOUR pocket money (wallet: ${formatMoney(s.state.wallet.balance)}). Then the park bench by the pond by ${formatClock(deadline(s))}. Use the zebra crossing!`,
          ),
        },
      ]);
    });
  if (!fav) return outfit();
  s.presentChallenge(SOCIAL_CHALLENGES['date-favour'], () => showReact(s, favourSpeaker(s), outfit));
}

function tryMeet(s: GameStore) {
  const now = minuteOfDay(s);
  const dl = deadline(s);
  if (now < dl - 15) {
    s.say([
      {
        speaker: '',
        text: `You're early! ${pName(s)} isn't here yet — you agreed on ${formatClock(dl)}. The ducks seem pleased to see you though. 🦆`,
        choices: [
          {
            label: `Sit on the bench and wait (until ${formatClock(dl - 5)})`,
            tone: 'good',
            run: () => {
              s.flag('waitedEarly', true);
              s.spendTime(Math.max(0, dl - 5 - now), 'Waiting on the bench (and rehearsing "hi" 40 times)');
              meet(s);
            },
          },
          { label: 'Do something else first', run: () => {} },
        ],
      },
    ]);
    return;
  }
  meet(s);
}

function meet(s: GameStore) {
  const run = s.state.run!;
  const now = s.state.clock.minutes;
  const dl = deadline(s);
  s.flag('arrivedAt', now);
  // the "deadline" was the meeting time — no more countdown toasts during the date
  run.deadlineWarned = true;
  run.flags['lateNoticed'] = true;
  s.objective('meet');
  const lateBy = Math.round(now - dl);
  if (lateBy > 2) {
    s.flag('lateBy', lateBy);
    ask(s, sayFrom(s, 'There you are! I was starting to think the ducks were my date. 🦆'), `Late by ${lateBy} minutes`, [
      {
        label: '"I\'m really sorry I\'m late — I should have left earlier. Thanks for waiting."',
        tone: 'good',
        outcome: 'A proper apology: says sorry, owns it, no excuses.',
        run: () => {
          s.flag('apology', 'proper');
          s.bump('comm', 10);
          s.say([sayFrom(s, 'Okay, apology accepted 😊 You\'re here now!')], () => outfitReaction(s));
        },
      },
      {
        label: '"Not my fault — my shoes were hiding and EVERY traffic light was red 🙄"',
        tone: 'bad',
        outcome: 'Excuses make it sound like you don\'t think being late matters.',
        run: () => {
          s.flag('apology', 'excuse');
          s.bump('comm', -10);
          const p = partnerOf(s);
          if (p) s.trust(p.id, -2);
          s.say([sayFrom(s, '…Every single traffic light. Wow. 😐')], () => outfitReaction(s));
        },
      },
      {
        label: '"Eh, it\'s only a few minutes."',
        tone: 'neutral',
        outcome: 'Brushing it off makes their waiting seem unimportant.',
        run: () => {
          s.flag('apology', 'shrug');
          s.bump('comm', -5);
          s.say([sayFrom(s, `It was ${lateBy} minutes, actually. I counted. 🙃`)], () => outfitReaction(s));
        },
      },
    ]);
    return;
  }
  s.say([sayFrom(s, s.getFlag('waitedEarly', false) ? 'Oh! You\'re already here?! 😳 …Hi. Hello. Hi.' : 'Hiii! You\'re right on time 😊')], () => outfitReaction(s));
}

function outfitReaction(s: GameStore) {
  const o = String(s.getFlag('outfit', 'casual'));
  const lines: DialogueLine[] =
    o === 'fancy'
      ? [sayFrom(s, '…Are you going to a wedding after this? 😂 You look very… shiny.'), { speaker: '', text: 'A duck walks past in its normal duck outfit. You feel overdressed for the first time in your life.' }]
      : o === 'pyjamas'
        ? [sayFrom(s, 'Are those… pyjamas? With little dinosaurs? 😂 Bold. Very bold.')]
        : [sayFrom(s, 'You look nice!'), { speaker: '', text: 'You say "Thanks, you too!" — and for once, that is actually the right reply. Character growth. 📈' }];
  s.say(lines, () => snackMoment(s));
}

function snackMoment(s: GameStore) {
  const bought = snacksBought(s);
  const ids = Object.keys(bought);
  const peanut = (bought[PEANUT] ?? 0) > 0;
  const safe = ids.filter((id) => id !== PEANUT);
  const count = ids.reduce((n, id) => n + bought[id], 0);
  const start = Number(s.getFlag('walletStart', 0));
  const spent = s.state.run?.spent ?? 0;
  const overspent = count >= 3 || (start > 0 && spent / start > 0.75);
  s.flag('snacks', !ids.length ? 'none' : peanut ? 'peanut' : 'safe');
  const thenBudget = () => (overspent ? budgetMoment(s) : conversation(s));
  if (!ids.length) {
    s.say(
      [sayFrom(s, s.getFlag('promisedSnacks', false) ? 'No snacks? I thought you were bringing some! 😅 That\'s okay — the ducks are judging you a little, though. 🦆' : 'No snacks? That\'s fine. The ducks are judging you a little though 🦆')],
      thenBudget,
    );
    return;
  }
  if (peanut) {
    const backup = safe.length ? ` …but the ${itemName(safe[0]).toLowerCase()} is for you!` : '';
    ask(s, sayFrom(s, 'Aww, you brought snacks! Oh… wait. Peanuts. 😅 I can\'t eat that — but that\'s really sweet.'), 'The peanut chocolate', [
      {
        label: `"Oh no — you told me! I'm sorry, I'll remember next time.${backup}"`,
        tone: 'good',
        outcome: 'Owning the mistake quickly keeps it a small, awkward-but-fine moment.',
        run: () => {
          s.flag('peanutRecovery', 'apologised');
          s.bump('problem', 15);
          s.bump('comm', 5);
          s.say([sayFrom(s, safe.length ? 'Haha, it\'s fine! And yes, I will happily take those 😋' : 'It\'s fine, honestly! I had a big lunch. 😊')], thenBudget);
        },
      },
      {
        label: '"Can\'t you just pick the peanuts out?"',
        tone: 'bad',
        outcome: 'Allergies are serious — you can\'t "pick them out".',
        run: () => {
          s.flag('peanutRecovery', 'pick');
          s.bump('comm', -10);
          const p = partnerOf(s);
          if (p) s.trust(p.id, -3);
          s.say([sayFrom(s, 'That\'s… not how allergies work 😬 It\'s okay. I\'ll just have water.')], thenBudget);
        },
      },
    ]);
    return;
  }
  s.say([sayFrom(s, 'Snacks! And no peanuts — you remembered!! 🥺')], thenBudget);
}

function budgetMoment(s: GameStore) {
  ask(s, sayFrom(s, 'Wait, did you buy the whole shop? 😳 That\'s so much!'), 'Spending to impress', [
    {
      label: '"Haha, I panicked 😅 Next time let\'s split it — or bring one thing each?"',
      tone: 'good',
      outcome: 'Splitting is totally normal — and it keeps dates affordable.',
      run: () => {
        s.flag('split', true);
        s.bump('comm', 5);
        s.say([sayFrom(s, 'Deal! 🤝 I\'ll bring the juice next time.')], () => conversation(s));
      },
    },
    {
      label: '"Only the best for you 😎"',
      tone: 'neutral',
      outcome: 'Sweet, but you don\'t need to empty your wallet to impress anyone.',
      run: () => {
        s.flag('showoff', true);
        s.say([sayFrom(s, 'Lol okay, Moneybags 😂 You really didn\'t have to though!')], () => conversation(s));
      },
    },
  ]);
}

function conversation(s: GameStore) {
  s.presentChallenge(SOCIAL_CHALLENGES['date-opener'], () =>
    showReact(s, sayFrom(s, ''), () => {
      s.spendTime(5, 'Chatting by the pond');
      s.presentChallenge(SOCIAL_CHALLENGES['date-honesty'], () =>
        showReact(s, sayFrom(s, ''), () => {
          s.spendTime(5, 'Chatting by the pond');
          voiceCrack(s);
        }),
      );
    }),
  );
}

function voiceCrack(s: GameStore) {
  ask(s, { speaker: '', text: 'You go to say "this is really nice". Halfway through, your voice cracks like a squeaky door. 🐣' }, 'Voice crack', [
    {
      label: 'Laugh it off: "Wow. My voice just left the chat 😂"',
      tone: 'good',
      outcome: 'Laughing at yourself turns embarrassment into a shared joke.',
      run: () => {
        s.flag('crack', 'laughed');
        s.bump('problem', 20);
        s.say([sayFrom(s, 'HAHA. Mine does that too, don\'t worry 😂')], curfew);
      },
    },
    {
      label: 'Pretend it didn\'t happen and stare very hard at a duck',
      tone: 'neutral',
      outcome: 'The silence gets LOUD. Embarrassment shrinks when you laugh about it.',
      run: () => {
        s.flag('crack', 'ignored');
        s.say([{ speaker: '', text: '(The duck stares back. The silence is deafening.)' }], curfew);
      },
    },
    {
      label: 'Blame the duck: "Did that duck just say something?"',
      tone: 'neutral',
      outcome: 'A joke — but owning it would have been even smoother.',
      run: () => {
        s.flag('crack', 'duck');
        s.bump('problem', 10);
        s.say([sayFrom(s, '…Yes. The duck. Definitely the duck. 😂')], curfew);
      },
    },
  ]);
  function curfew() {
    s.spendTime(5, 'Chatting by the pond');
    s.presentChallenge(SOCIAL_CHALLENGES['date-curfew'], () =>
      showReact(s, sayFrom(s, ''), () => {
        s.flag('partnerLeft', true);
        s.objective('see-off');
        s.say([{ speaker: '', text: `${pName(s)} heads home. 🚌 You head home too — and maybe check they got back safe.` }]);
      }),
    );
  }
}

function homeText(s: GameStore) {
  s.objective('go-home');
  const pleaded = s.getFlag('curfew', '') === 'pleaded';
  const reply = pleaded ? 'home 🙂 a bit rushed, but it was fun. see you at school!' : 'yep! home at 7:14 😎 thanks for today, it was really fun!';
  const done = () => s.finishMission();
  ask(s, { speaker: '📱 Phone', text: `You're home. Send ${pName(s)} a message?` }, 'After the date', [
    {
      label: 'Send: "got home safe? 🙂"',
      tone: 'good',
      outcome: 'A small check-in that shows you care.',
      run: () => {
        s.flag('textedSafe', true);
        s.bump('comm', 10);
        s.objective('text-safe');
        s.say([textFrom(s, reply)], done);
      },
    },
    {
      label: 'Play it cool and don\'t text 😎',
      tone: 'neutral',
      outcome: 'Playing it cool mostly looks like not caring.',
      run: () => done(),
    },
    {
      label: 'Send 14 messages in a row',
      tone: 'neutral',
      outcome: 'They were on a bus 😂 One message is plenty.',
      run: () => {
        s.flag('spam', true);
        s.bump('comm', -5);
        s.objective('text-safe');
        s.say([textFrom(s, "lol I was on the BUS 😂 yes I'm home. 14 messages tho?? 😂 thanks for today!")], done);
      },
    },
  ]);
}

function stoodUp(s: GameStore) {
  s.flag('stoodUp', true);
  ask(s, textFrom(s, 'hey… I waited at the bench but I have to go home now 😕 maybe another day?'), 'Missed the date', [
    {
      label: 'Send: "I\'m so sorry — I lost track of time. That wasn\'t fair to you."',
      tone: 'good',
      outcome: 'A real apology, even late, keeps the friendship okay.',
      run: () => {
        s.flag('apology', 'proper');
        s.bump('comm', 10);
        s.say([textFrom(s, 'it\'s ok. thanks for saying sorry 🙂 next time text me if you\'re running late?')], () => s.finishMission('incomplete'));
      },
    },
    {
      label: 'Send: "oh lol I forgot"',
      tone: 'bad',
      outcome: 'Being forgotten feels rubbish. "lol" makes it worse.',
      run: () => {
        s.flag('apology', 'none');
        const p = partnerOf(s);
        if (p) s.trust(p.id, -5);
        s.say([textFrom(s, 'oh. ok. 😶')], () => s.finishMission('incomplete'));
      },
    },
  ]);
}

/** Pick who asks for the favour: a parent/guardian who is home now, else one who can text. */
function pickFavour(s: GameStore): { member?: FamilyMember; home: boolean } {
  const guardians = s.state.profile.members.filter((m) => GUARDIAN_ROLES.includes(m.role));
  const home = guardians.find((m) => scheduleFor(m.role, s.state.clock.minutes).spot !== 'away');
  if (home) return { member: home, home: true };
  return { member: guardians[0], home: false };
}

// ---------------------------------------------------------------- mission

export const dateNight: MissionDef = {
  id: DATE_MISSION_ID,
  title: 'Date on a Budget',
  category: 'social',
  difficulty: 2,
  icon: '💌',
  summary: 'Meet your date at the park bench at 6:30 — on time, on a pocket-money budget, and without making it (too) cringe.',
  assignerRoles: ['partner'],
  location: 'town',
  briefing: '📱 "hey!! are you free later? park bench by the pond at 6:30? 🦆"',
  instructions: [
    'Read the texts properly — people tell you important things (like what they can\'t eat).',
    'This is YOUR pocket money, not family money. You don\'t need to buy everything to impress anyone.',
    'Your family might need you first. Help, and tell them where you\'re going.',
    'Be on time. If you\'re late, a real apology beats excuses.',
    'When they say they need to go home, the answer is always "okay!".',
  ],
  objectives: [
    { id: 'text-back', label: 'Text {assigner} back', type: 'resolve', required: true, hint: 'Pick a reply in the chat.' },
    { id: 'get-ready', label: 'Sort out the family favour & get ready', type: 'resolve', required: true, where: { location: 'home', target: 'flag:favourBy' }, hint: 'Family first, then the mirror.' },
    {
      id: 'buy-snacks',
      label: 'Buy snacks with your pocket money',
      type: 'checkout',
      required: true,
      where: { location: 'town', target: 'kiosk' },
      hint: 'The corner shop next to FreshMart sells snacks. Scroll back through the texts — {assigner} can\'t have peanuts!',
    },
    { id: 'meet', label: 'Meet {assigner} at the park bench by the pond (6:30 PM)', type: 'reach', required: true, where: { location: 'town', target: 'bench' }, hint: 'The bench is in the park south of the road, next to the pond. Cross at the zebra crossing.' },
    { id: 'see-off', label: 'Say goodbye before {assigner}\'s 7:15 curfew', type: 'resolve', required: true, dependsOn: ['meet'], where: { location: 'town', target: 'bench' } },
    { id: 'go-home', label: 'Head home', type: 'reach', target: 'home', required: true, dependsOn: ['see-off'], where: { location: 'home' } },
    { id: 'text-safe', label: 'Check they got home safe (optional)', type: 'resolve', required: false },
  ],
  optionalItems: ['popcorn', 'juice-box', 'chips', 'chocolate'],
  lateRule: 'partial',
  challenges: [],
  rewards: { xp: 140, badge: 'Smooth Operator' },
  learning: [
    'Budget your own pocket money — offering to split is normal',
    'Be on time; apologise properly when you are not',
    'Listen and remember details (like allergies)',
    'Be honest instead of pretending',
    'Respect boundaries — "I need to go home" means okay',
    'Balance family responsibilities with time with friends',
  ],
  skills: ['communication', 'budget', 'time', 'empathy', 'responsibility'],
  available: availability,
  earnsBadge(s) {
    const f = s.state.run?.flags ?? {};
    return f['curfew'] !== 'pleaded' && f['favour'] !== 'sneaked' && f['peanutRecovery'] !== 'pick' && !f['dismissed'];
  },
  onStart(s) {
    const run = s.state.run!;
    const now = minuteOfDay(s);
    run.deadlineAt = now < DATE_AT - 30 ? s.state.clock.minutes - now + DATE_AT : s.state.clock.minutes + 30;
    s.flag('walletStart', s.state.wallet.balance);
    const fav = pickFavour(s);
    if (fav.member) {
      s.flag('favourBy', fav.member.id);
      s.flag('favourAtHome', fav.home);
    }
    textChat(s);
  },
  onPhone(s) {
    const lines = s.isDone('meet')
      ? [textFrom(s, s.getFlag('partnerLeft', false) ? 'on the bus! 🚌 today was fun 🙂' : 'um… I\'m right here? 😂')]
      : [
          { speaker: '📱 Chat', text: `(You scroll back through the chat with ${pName(s)}…)` },
          textFrom(s, `park bench by the pond, ${formatClock(deadline(s))}? 🦆`),
          textFrom(s, "ps. I'm allergic to peanuts so no peanut stuff pls 🥜🚫"),
        ];
    s.flag('readTexts', true);
    s.say(lines);
    return true;
  },
  onInteract(s, target) {
    const p = partnerOf(s);
    if (!p || s.getFlag('partnerLeft', false) || s.getFlag('stoodUp', false)) return false;
    if (s.isDone('meet')) return false;
    if (target === 'bench' || target === `npc:${p.id}`) {
      tryMeet(s);
      return true;
    }
    return false;
  },
  onTalk(s, member) {
    if (member.role !== 'partner') return false;
    if (!s.isDone('meet') && !s.getFlag('partnerLeft', false)) {
      tryMeet(s);
      return true;
    }
    return false;
  },
  onEvent(s, ev) {
    if (ev.type === 'purchased') {
      const got = Object.keys(ev.items).filter((id) => SNACKS.includes(id));
      if (got.length) {
        s.objective('buy-snacks');
        if (!s.getFlag('youToo', false)) {
          s.flag('youToo', true);
          s.toast(words('{shopkeeper}: "Enjoy the snacks!" — You: "You too!" …He runs a shop. He is not eating snacks. 🫠'), 'neutral');
        }
        if (got.includes(PEANUT)) s.flag('boughtPeanut', true);
      }
    }
    if (ev.type === 'location' && ev.to === 'home' && s.getFlag('partnerLeft', false) && !s.isDone('go-home')) {
      if (!s.ui.dialogue) homeText(s);
    }
    if (ev.type === 'minute') {
      const run = s.state.run!;
      if (!run.objectives['meet']?.done && !run.flags['stoodUp'] && !s.ui.dialogue && minuteOfDay(s) > deadline(s) + WAIT_LIMIT) stoodUp(s);
    }
  },
  progress(state, id) {
    if (id !== 'meet') return null;
    const dl = state.run?.deadlineAt ?? DATE_AT;
    const left = Math.round(dl - (state.clock.minutes % 1440));
    return left >= 0 ? `${left} min to go` : `${-left} min late`;
  },
  evaluate(s, forced) {
    const run = s.state.run!;
    const f = run.flags;
    const met = s.isDone('meet');
    const dl = run.deadlineAt ?? DATE_AT;
    const arrivedAt = Number(f['arrivedAt'] ?? s.state.clock.minutes);
    const lateBy = met ? Math.max(0, Math.round(arrivedAt - dl)) : 0;
    const late = met && lateBy > 2;
    const outcome = forced ?? (!met ? 'incomplete' : late ? 'completed-late' : 'completed');
    const p = pName(s);

    const required = dateNight.objectives.filter((o) => o.required);
    const doneReq = required.filter((o) => run.objectives[o.id]?.done).length;
    const start = Number(f['walletStart'] ?? 0);
    const spent = run.spent;
    const ratio = start > 0 ? spent / start : spent > 0 ? 1 : 0;
    const bought = snacksBought(s);
    const count = Object.values(bought).reduce((n, q) => n + q, 0);
    const overspent = count >= 3 || ratio > 0.75;
    const snacks = String(f['snacks'] ?? (bought[PEANUT] ? 'peanut' : count ? 'safe' : 'none'));

    const budget = clamp((spent <= 0 ? 75 : ratio <= 0.5 ? 100 : ratio <= 0.75 ? 85 : 55) + (f['split'] ? 15 : 0) - (bought[PEANUT] ? 10 : 0));
    const time = met ? (late ? clamp(85 - lateBy * 2, 20, 70) : 100) : 15;
    const outfit = String(f['outfit'] ?? '');
    const planning = clamp(50 + Number(f['plan'] ?? 0) + (snacks === 'safe' ? 20 : snacks === 'peanut' ? -15 : -5) + (met && !late ? 10 : 0));
    const scores = {
      accuracy: clamp((doneReq / Math.max(1, required.length)) * 100),
      budget,
      time,
      planning,
      communication: clamp(60 + Number(f['comm'] ?? 0)),
      problem: clamp(65 + Number(f['problem'] ?? 0)),
      responsibility: clamp(60 + Number(f['resp'] ?? 0) + (f['textedSafe'] ? 5 : 0)),
    };

    const fb: string[] = [];
    if (!met) fb.push(`The date didn't happen this time. If plans change or you're running late, text early — waiting alone on a bench feels rubbish.`);
    else if (late)
      fb.push(
        `You were ${lateBy} minutes late. ` +
          (f['apology'] === 'proper'
            ? 'Your proper apology helped a lot — "sorry, I should have left earlier" beats excuses every time.'
            : 'Next time, leave ten minutes early — and if you are late, a real "sorry, that\'s on me" beats excuses.'),
      );
    else fb.push(`You made it to the bench on time. Punctual AND nervous — a classic combo.`);

    const favour = String(f['favour'] ?? '');
    if (favour === 'done') fb.push('Doing the chores first took three minutes and kept everyone happy at home — balancing family and friends is a real skill.');
    else if (favour === 'argued') fb.push('Arguing about the chores cost time and trust. "Sure! And I\'m meeting a friend at the park till 7" works better.');
    else if (favour === 'sneaked') fb.push('Sneaking out is a big trust-breaker. Tell your family where you\'re going — it\'s about safety, not just rules.');

    if (outfit === 'fancy') fb.push('The full suit/ballgown was… a lot for a duck pond 😂 Dress for the place you\'re going.');
    else if (outfit === 'pyjamas') fb.push('Pyjamas to a date: bold, but it says "I didn\'t plan this".');
    else if (outfit === 'casual') fb.push('Clean and casual was perfect for the park.');

    if (snacks === 'peanut') {
      fb.push(`${p} told you they're allergic to peanuts — and the peanut chocolate came anyway. Listening to details like allergies is how people feel cared for.`);
      if (f['peanutRecovery'] === 'pick') fb.push('Allergies are not something you can "pick out" — they can be really serious.');
      else if (f['peanutRecovery'] === 'apologised') fb.push('At least you owned the mistake straight away — that kept it a small, awkward-but-fine moment.');
    } else if (snacks === 'safe') fb.push('You remembered the peanut allergy. That\'s real listening. 🥺');
    else if (met) fb.push(f['promisedSnacks'] ? 'You promised snacks and forgot them — small promises count too.' : 'No snacks — fine! Dates don\'t need to cost anything.');

    if (overspent) fb.push(`You spent ${formatMoney(spent)} of your ${formatMoney(start)} pocket money. You don't need to spend big to impress — ${f['split'] ? 'offering to split next time was a great call.' : 'offering to split, or bringing one thing each, is totally normal.'}`);
    else if (spent > 0 && snacks !== 'peanut') fb.push(`You spent ${formatMoney(spent)} — sensible. Good dates don't have to cost much.`);

    if (f['pickup']) fb.push(`Your pickup line was… a choice. 😂 ${f['askedDay'] ? '' : 'Asking about their day works much better.'}`.trim());
    if (f['askedDay']) fb.push('Asking about their science test — a detail from their text — was the best move of the night.');
    if (f['monologue']) fb.push('Ten minutes about your game is a monologue, not a conversation. Ask questions back!');
    if (f['pretended']) fb.push('Pretending to love their favourite show backfired fast. Honest + curious is always better.');
    else if (f['honest']) fb.push('Being honest that you hadn\'t seen the show — and asking about it — was perfect.');
    else if (f['dismissed']) fb.push('Calling their favourite thing cringe stung. You don\'t have to like it — just be kind about it.');
    if (f['crack'] === 'laughed') fb.push('Laughing off the voice crack was elite. Everyone\'s voice does that.');

    const curfew = String(f['curfew'] ?? '');
    if (curfew === 'walked') fb.push('Walking them to the bus and respecting their curfew — exactly right.');
    else if (curfew === 'pleaded') fb.push('Asking them to stay after they said they had to go wasn\'t okay. When someone sets a boundary, "okay!" is always the right answer.');
    else if (curfew === 'shrugged') fb.push('You respected the curfew 👍 — walking them to the bus would have been even kinder.');

    if (f['textedSafe'] && !f['spam']) fb.push('The "got home safe?" text was a lovely touch.');
    if (f['spam']) fb.push('Fourteen texts in a row… they were on a bus 😂 One is plenty.');
    return { outcome, scores, feedback: fb };
  },
};
