// Family dinner: once a day the family eats together at the dining table (6:50–8:30 PM).
//
//  • sitForDinner — validates the window / chore duty / once-per-day, then plays the eating
//    animation (game/objectLayer.ts fills `dinnerFx.play`) and opens the dinner conversation
//  • the conversation is driven by the day: finished tasks → praise, a sibling fight → "did you two
//    make up?", lots of screen time → a gentle comment, kind memories → a proud nod
//  • effects: energy +30, small trust +, a "family dinner" memory; helping clear the table adds trust
//  • never sat down by 8:30 PM → a parent mentions the empty chair the next day
// State lives in `state.world` under `dinner.*` (not wiped by nextDay); headless for tests.
import type { GameStore, DialogueLine } from './store';
import type { FamilyMember, Memory } from '../domain/types';
import { GUARDIAN_ROLES } from '../domain/types';
import { words } from '../domain/region';
import { formatClock } from './systems';
import { conduct } from './conduct';
import * as angry from './angryMum';

export const DINNER = {
  /** "Sit down for dinner" is offered from 6:50 PM… */
  from: 18 * 60 + 50,
  /** …until 8:30 PM; after that, dinner counts as skipped */
  to: 20 * 60 + 30,
  /** the family sits at the table (domain/world.ts scheduleFor) */
  familyFrom: 19 * 60,
  familyTo: 19 * 60 + 40,
  energy: 30,
  /** game minutes the meal takes */
  minutes: 20,
  /** extra minutes clearing the table */
  clearMinutes: 10,
} as const;

// ---------------------------------------------------------------- chore duty probe

type Probe = (s: GameStore) => boolean;
const defaultProbe: Probe = (s) => {
  const fn = (angry as Record<string, unknown>).choreDutyActive;
  return typeof fn === 'function' ? !!(fn as Probe)(s) : false;
};
let probe: Probe = defaultProbe;
/** Is Angry Mum "chore duty" running? (core/angryMum.ts `choreDutyActive`, read defensively.) */
export const choreDuty = (s: GameStore) => {
  try {
    return probe(s);
  } catch {
    return false;
  }
};
/** Tests: replace the chore-duty probe (pass null to restore). */
export function setChoreDutyProbe(fn: Probe | null) {
  probe = fn ?? defaultProbe;
}
/** Angry Mum mode in progress (chase/lecture) — leave the house alone. */
export const angryBusy = (s: GameStore) => {
  const fn = (angry as Record<string, unknown>).angryActive;
  try {
    return typeof fn === 'function' ? !!(fn as Probe)(s) : false;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- helpers

const W = (s: GameStore) => s.state.world;
const day = (s: GameStore) => s.state.clock.day;
export const tod = (s: GameStore) => ((s.state.clock.minutes % 1440) + 1440) % 1440;
export const inDinnerWindow = (minuteOfDay: number) => minuteOfDay >= DINNER.from && minuteOfDay < DINNER.to;
export const familyAtTable = (minuteOfDay: number) => minuteOfDay >= DINNER.familyFrom && minuteOfDay < DINNER.familyTo;
export const ateToday = (s: GameStore) => W(s)['dinner.ate'] === day(s);
const guardian = (s: GameStore): FamilyMember | undefined => s.memberByRole('mother', ...GUARDIAN_ROLES);
const sibling = (s: GameStore): FamilyMember | undefined => s.memberByRole('younger-sibling', 'older-sibling');
const G = (s: GameStore, text: string, mood?: string): DialogueLine => {
  const g = guardian(s);
  return g ? { speaker: g.name, portrait: g.id, text: words(text), mood } : { speaker: '', text: words(text), mood };
};
const N = (text: string): DialogueLine => ({ speaker: '', text: words(text) });
const P = (s: GameStore, text: string, mood?: string): DialogueLine => ({ speaker: s.player.name, portrait: s.player.id, text: words(text), mood });

export function remember(s: GameStore, key: string, kind: Memory['kind'], text: string, who = guardian(s)?.id ?? 'family') {
  if (!s.state.memories) s.state.memories = [];
  const id = `${key}@${day(s)}`;
  if (s.state.memories.some((m) => m.id === id)) return;
  s.state.memories.push({ id, day: day(s), who, kind, text });
  if (s.state.memories.length > 40) s.state.memories.splice(0, s.state.memories.length - 40);
}

// ---------------------------------------------------------------- gate

export type DinnerBlock = 'chores' | 'done' | 'early' | 'late' | 'away' | 'busy' | null;

/** Why the player can't sit down for dinner right now (null = they can). */
export function dinnerBlock(s: GameStore): DinnerBlock {
  if (s.state.location !== 'home') return 'away';
  if (eating || angryBusy(s) || (s.state.run && s.state.run.status === 'in-progress')) return 'busy';
  if (ateToday(s)) return 'done';
  const m = tod(s);
  if (m < DINNER.from) return 'early';
  if (m >= DINNER.to) return 'late';
  if (choreDuty(s)) return 'chores';
  return null;
}

/** Label for the dining table outside missions. */
export function tableLabel(s: GameStore): string {
  if (eating) return 'Skip ahead (E)';
  const b = dinnerBlock(s);
  if (b === null) return '🍽 Sit down for dinner';
  if (b === 'chores') return '🍽 Dinner (chores first!)';
  if (b === 'done') return 'Dining table · dinner done ✓';
  return 'Dining table · dinner at 7 PM';
}

// ---------------------------------------------------------------- day facts → conversation

export interface DayFacts {
  /** titles of tasks finished today (on time or late) */
  done: string[];
  late: number;
  incomplete: number;
  fights: number;
  screen: number;
  tvBanned: boolean;
  kind: string[];
  careless: string[];
}

export function dayFacts(s: GameStore): DayFacts {
  const d = day(s);
  const res = (s.state.results ?? []).filter((r) => r.day === d);
  const c = conduct(s);
  const mem = (s.state.memories ?? []).filter((m) => m.day === d && !m.id.startsWith('dinner'));
  return {
    done: res.filter((r) => r.outcome !== 'incomplete').map((r) => r.title),
    late: res.filter((r) => r.outcome === 'completed-late').length,
    incomplete: res.filter((r) => r.outcome === 'incomplete').length,
    fights: c.fights,
    screen: Math.round(c.screenMinutes),
    tvBanned: !!c.tvBanned,
    kind: mem.filter((m) => ['kind', 'helpful', 'honest', 'responsible', 'brave', 'thrifty'].includes(m.kind)).map((m) => m.text),
    careless: mem.filter((m) => ['careless', 'wasteful', 'forgetful', 'late'].includes(m.kind)).map((m) => m.text),
  };
}

export type Topic = 'praise' | 'unfinished' | 'makeup' | 'screen' | 'kind' | 'quiet';

/** What the family brings up at dinner, most important first (max 2). */
export function pickTopics(f: DayFacts): Topic[] {
  const out: Topic[] = [];
  if (f.fights > 0) out.push('makeup');
  if (f.done.length) out.push('praise');
  else if (f.incomplete) out.push('unfinished');
  if (f.screen >= 45 || f.tvBanned) out.push('screen');
  if (f.kind.length && !out.includes('praise')) out.push('kind');
  if (!out.length) out.push('quiet');
  return out.slice(0, 2);
}

export function topicLine(s: GameStore, t: Topic, f: DayFacts): DialogueLine {
  const sib = sibling(s);
  switch (t) {
    case 'praise':
      return G(s, `I heard you finished "${f.done[0]}" today${f.late ? ' — a bit late, but done' : ''}. {praise} That really helped the whole family.`, 'happy');
    case 'unfinished':
      return G(s, 'One job didn’t get finished today. That’s okay — what would you plan differently tomorrow?', 'calm');
    case 'makeup':
      return G(s, sib ? `So… you and ${sib.name} had a fight today. Did you two make up?` : 'There was a lot of shouting today. Is everything okay now?', 'worried');
    case 'screen':
      return G(s, f.tvBanned ? 'The TV stays off tonight, remember. Maybe a board game after dinner instead?' : `That was a lot of screen time today — about ${f.screen} minutes. Let’s give our eyes a rest this evening, hmm?`, 'calm');
    case 'kind':
      return G(s, `Someone told me you ${f.kind[0]}. I’m proud of you, {endearment}.`, 'happy');
    case 'quiet':
    default:
      return G(s, 'A quiet day? Those are nice too. Tell me one good thing that happened.', 'happy');
  }
}

const NEWS = [
  'Grandma called — she’s coming to visit on Sunday!',
  'The neighbours’ cat had kittens. Five of them!',
  'I got a little thank-you note at work today. Small things matter.',
  'The shop near the bus stop is putting up a mango festival sign.',
  'Guess what — the water bill was lower this month because we fixed the dripping tap!',
  'Your cousin passed her driving test on the third try. Never give up!',
];
export const familyNews = (s: GameStore) => NEWS[(day(s) * 7 + (s.state.seed % 13)) % NEWS.length];

// ---------------------------------------------------------------- effect hooks (filled by objectLayer)

let eating = false;
export const isEating = () => eating;
export const dinnerFx = {
  /** play the eating animation, then call `done`. Default (tests/headless): no animation. */
  play: (done: () => void) => done(),
  /** skip a running animation (E) */
  skip: () => {},
};

// ---------------------------------------------------------------- flow

/** The dining table was used outside a mission. Always takes over (returns true). */
export function tableInteract(s: GameStore): boolean {
  if (eating) {
    dinnerFx.skip();
    return true;
  }
  const b = dinnerBlock(s);
  switch (b) {
    case null:
      sitForDinner(s);
      return true;
    case 'chores': {
      const g = guardian(s);
      s.say([G(s, 'Chores first — dinner after. Your plate will wait for you, {endearment}.', 'annoyed')]);
      if (g) s.bus.emit('fx', { kind: 'exclaim', target: `npc:${g.id}` });
      return true;
    }
    case 'done':
      s.toast('You already ate with the family today. 😋 Full and happy!', 'neutral');
      return true;
    case 'early':
      s.say([N(`Dinner together is at 7:00 PM (it's ${formatClock(s.state.clock.minutes)}). Hungry now? Grab a snack from the fridge — but not too big, or you'll spoil dinner!`)]);
      return true;
    case 'late':
      s.say([N('Dinner was hours ago — the plates are washed and put away. A glass of water and a small snack from the fridge will do now.')]);
      return true;
    default:
      return false;
  }
}

/** Start dinner: animation, then conversation. Returns false when blocked. */
export function sitForDinner(s: GameStore): boolean {
  if (dinnerBlock(s) !== null) return false;
  const m = tod(s);
  // a few minutes early: help lay the table and wait for everyone
  if (m < DINNER.familyFrom) s.spendTime(DINNER.familyFrom - m, 'Waiting for everyone to sit down');
  W(s)['dinner.ate'] = day(s);
  W(s)['dinner.lateEat'] = m >= DINNER.familyTo;
  eating = true;
  s.notify();
  let finished = false;
  dinnerFx.play(() => {
    if (finished) return;
    finished = true;
    eating = false;
    s.spendTime(DINNER.minutes, `Family dinner · ${words('{dinner}')}`);
    dinnerConversation(s);
  });
  return true;
}

/** "How was your day?" — 2–3 choices driven by today's facts. */
export function dinnerConversation(s: GameStore) {
  const f = dayFacts(s);
  const topics = pickTopics(f);
  const late = !!W(s)['dinner.lateEat'];
  const sib = sibling(s);
  const opener = late
    ? G(s, 'Everyone else already ate, but I kept {dinner} warm for you. Sit, sit — I’ll keep you company.', 'calm')
    : G(s, `Tonight it’s {dinner}! ${sib ? `${sib.name}, elbows off the table. ` : ''}So… how was your day, {endearment}?`, 'happy');
  const first = topicLine(s, topics[0], f);
  const tell = (): void => {
    const reply: DialogueLine[] = [];
    if (topics.includes('makeup')) reply.push(P(s, f.fights > 1 ? 'We fought a few times… but I said sorry.' : 'Yeah… I said sorry. We’re okay now.'), G(s, 'Saying sorry first takes courage. Thank you.', 'happy'));
    else if (topics.includes('praise')) reply.push(P(s, `I did "${f.done[0]}" — it was harder than it looks!`, 'happy'), G(s, 'Hard things get easier the second time. That’s how skills grow.', 'happy'));
    else if (topics.includes('unfinished')) reply.push(P(s, 'I ran out of time. Next time I’ll make a plan first.'), G(s, 'A plan saves time. Good thinking.', 'happy'));
    else reply.push(P(s, 'It was nice. Nothing big happened.'), G(s, 'Nothing big is allowed! Rest days recharge us.', 'happy'));
    if (topics.includes('screen')) reply.push(G(s, 'And tonight — screens off half an hour before bed. Deal?', 'calm'));
    s.skill('communication', 1);
    const g = guardian(s);
    if (g) s.trust(g.id, 1);
    s.say(reply, () => clearAsk(s));
  };
  const shrug = (): void => {
    s.say([P(s, '“Fine.”', 'neutral'), G(s, 'Just “fine”? One word for a whole day? Okay… I’m here whenever you want to talk.', 'calm')], () => clearAsk(s));
  };
  const askThem = (): void => {
    s.skill('empathy', 1);
    const g = guardian(s);
    if (g) s.trust(g.id, 1);
    s.say([P(s, 'How was YOUR day?', 'happy'), G(s, `Oh! Nobody asks me that. ${familyNews(s)}`, 'happy')], () => clearAsk(s));
  };
  s.say([
    opener,
    {
      ...first,
      choices: [
        { label: '😊 Tell them about my day', tone: 'good', run: tell },
        { label: '🤷 “Fine.”', tone: 'neutral', run: shrug },
        { label: '❓ “How was YOUR day?”', tone: 'good', run: askThem },
      ],
    },
  ]);
}

function clearAsk(s: GameStore) {
  s.say([
    {
      ...G(s, 'That was lovely. Now… who’s going to help clear the table?', 'happy'),
      choices: [
        { label: '🍽 I’ll clear the table & wash my plate', tone: 'good', run: () => finishDinner(s, true) },
        { label: '😋 “Thanks for dinner!”', tone: 'neutral', run: () => finishDinner(s, false) },
      ],
    },
  ]);
}

export function finishDinner(s: GameStore, helped: boolean) {
  s.state.stats.energy = Math.min(100, s.state.stats.energy + DINNER.energy);
  const g = guardian(s);
  if (g) s.trust(g.id, helped ? 3 : 1);
  if (helped) {
    s.skill('household', 1);
    s.skill('responsibility', 1);
    s.spendTime(DINNER.clearMinutes, 'Cleared the table & washed a plate');
    s.bus.emit('fx', { kind: 'sparkle', target: 'sink' });
    s.toast('🧽 Plates scraped, washed, rinsed, dried. Tip: scrape food into the bin BEFORE washing — less greasy water!', 'good');
  }
  remember(s, 'dinner', helped ? 'helpful' : 'responsible', helped ? 'sat with the family for dinner and helped clear the table' : 'sat with the family for dinner');
  s.toast(`⚡ Energy +${DINNER.energy} · a warm family dinner`, 'good');
  s.notify();
}

// ---------------------------------------------------------------- skipped dinner

/** Per-minute: mark a skipped dinner after 8:30 PM, mention it the next day. */
export function dinnerTick(s: GameStore) {
  const d = day(s);
  const w = W(s);
  if (tod(s) >= DINNER.to && w['dinner.ate'] !== d && w['dinner.skipped'] !== d) {
    w['dinner.skipped'] = d;
    remember(s, 'dinner-missed', 'forgetful', 'skipped family dinner without telling anyone');
  }
  const skipped = Number(w['dinner.skipped'] ?? 0);
  if (skipped && skipped < d && w['dinner.mentioned'] !== skipped && !s.blocking && s.state.location === 'home' && guardian(s) && !angryBusy(s)) {
    w['dinner.mentioned'] = skipped;
    s.say([G(s, 'You missed dinner last night, {endearment}. I kept a plate for you… the table felt empty without you. Tonight at seven, okay? Even just to sit with us.', 'sad')]);
  }
}

/** True when this skipped dinner still has to be mentioned (for tests / UI). */
export const owesDinnerTalk = (s: GameStore) => {
  const skipped = Number(W(s)['dinner.skipped'] ?? 0);
  return !!skipped && skipped < day(s) && W(s)['dinner.mentioned'] !== skipped;
};

/** Tests: reset module state. */
export function _resetDinner() {
  eating = false;
  dinnerFx.play = (done) => done();
  dinnerFx.skip = () => {};
}
