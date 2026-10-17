// Plot twists: surprising, funny or dramatic everyday events — at most one per in-game day.
//
//  • planDay / checkTwists — deterministic scheduler (seed + day), ~65% of days get a twist, which fires
//    once its place/time conditions hold and nothing critical is going on (dialogue, queue, a deadline…)
//  • each twist is a short mini-story (1–4 min) with choices, consequences, family memory and a reveal
//  • visuals live in game/twistLayer.ts (Phaser objects) and ui/TwistOverlay.tsx (DOM overlays); this
//    module only owns state + story so it runs headless in tests. Phaser effects go through `twistFx`.
//  • dev: forceTwist(id) / window.__twist('wallet')
import { demoHooksEnabled } from './demo';
import type { GameStore, DialogueChoice, DialogueLine } from './store';
import type { FamilyMember, LocationId, Memory, PuppyState, TwistActive, TwistId, TwistsState, ViralState } from '../domain/types';
import { GUARDIAN_ROLES } from '../domain/types';
import { money, words } from '../domain/region';
import { formatMoney } from '../domain/items';
import { TIME_CONFIG, rollFor } from './systems';
import { recordConduct } from './conduct';

// ---------------------------------------------------------------- tuning

/** Share of days that get a twist. */
export const TWIST_CHANCE = 0.65;
/** Power cut only after 7:30 PM. */
export const POWERCUT_FROM = 19 * 60 + 30;
/** Minutes until the power comes back. */
export const POWERCUT_MINUTES = 20;
/** Minutes the guests give you to tidy before they walk in. */
export const TIDY_MINUTES = 6;
export const WALLET_CASH = () => money(5000);
export const WALLET_SKIM = () => money(500);
export const VIRAL_PEAK = 1_200_000;
export const MESS_COUNT = 5;
export const TORCH_SPOTS = 3;

export const TWIST_IDS: TwistId[] = ['relatives', 'powercut', 'puppy', 'wallet', 'viral', 'kite'];

// ---------------------------------------------------------------- effect hooks (filled by twistLayer)

export type FxKind = 'shock' | 'danger' | 'win' | 'fail' | 'reveal' | 'comedy';
export const twistFx = {
  dramatic: (_k: FxKind) => {},
  letterbox: (_on: boolean) => {},
  sting: (_k: FxKind) => {},
  flash: (_color?: number) => {},
  shake: () => {},
};

// ---------------------------------------------------------------- overlay UI state (read by TwistOverlay)

export interface TwistCard {
  id: number;
  emoji: string;
  title: string;
  sub?: string;
  tone: 'shock' | 'fun' | 'warm';
}
export interface TwistHeadline {
  id: number;
  paper: string;
  title: string;
  sub: string;
}
export interface TwistUi {
  card: TwistCard | null;
  headline: TwistHeadline | null;
  /** real-time ms the viral counter started (overlay animates views) */
  viralStart: number | null;
  /** mean / creepy comments under the reel */
  comments: { user: string; text: string; tone: 'mean' | 'nice' | 'creepy' }[];
}
let ui: TwistUi = { card: null, headline: null, viralStart: null, comments: [] };
let uiSeq = 1;
const uiListeners = new Set<() => void>();
export const twistUi = {
  get: () => ui,
  subscribe: (fn: () => void) => {
    uiListeners.add(fn);
    return () => void uiListeners.delete(fn);
  },
  set(patch: Partial<TwistUi>) {
    ui = { ...ui, ...patch };
    uiListeners.forEach((f) => f());
  },
};
function showCard(c: Omit<TwistCard, 'id'>) {
  const id = uiSeq++;
  twistUi.set({ card: { ...c, id } });
  if (typeof window !== 'undefined')
    window.setTimeout(() => {
      if (ui.card?.id === id) twistUi.set({ card: null });
    }, 2600);
}
function showHeadline(h: Omit<TwistHeadline, 'id'>) {
  twistUi.set({ headline: { ...h, id: uiSeq++ } });
}

// ---------------------------------------------------------------- state helpers

export function twists(s: GameStore): TwistsState {
  if (!s.state.twists) s.state.twists = { day: 0, planned: null, plannedAt: 0, fired: 0, active: null, history: [] };
  return s.state.twists;
}
export const activeTwist = (s: GameStore): TwistActive | null => twists(s).active;
export const isActive = (s: GameStore, id: TwistId, step?: string) => {
  const a = twists(s).active;
  return !!a && a.id === id && (step === undefined || a.step === step);
};
const day = (s: GameStore) => s.state.clock.day;
const mins = (s: GameStore) => s.state.clock.minutes;
const tod = (s: GameStore) => s.state.clock.minutes % 1440;
const guardian = (s: GameStore): FamilyMember | undefined => s.memberByRole(...GUARDIAN_ROLES);
const sibling = (s: GameStore): FamilyMember | undefined => s.memberByRole('younger-sibling', 'older-sibling');
const at = (s: GameStore, ...locs: LocationId[]) => locs.includes(s.state.location);
const missionLive = (s: GameStore) => !!s.state.run && s.state.run.status === 'in-progress';
const say = (s: GameStore, lines: DialogueLine[], done?: () => void) => s.say(lines, done);
const G = (s: GameStore, text: string, mood?: string): DialogueLine => {
  const g = guardian(s);
  return g ? { speaker: g.name, portrait: g.id, text: words(text), mood } : { speaker: '', text: words(text), mood };
};
const N = (text: string, mood?: string): DialogueLine => ({ speaker: '', text: words(text), mood });
const P = (s: GameStore, text: string, mood?: string): DialogueLine => ({ speaker: s.player.name, portrait: s.player.id, text: words(text), mood });

export function remember(s: GameStore, key: string, kind: Memory['kind'], text: string, who = guardian(s)?.id ?? 'family') {
  if (!s.state.memories) s.state.memories = [];
  const id = `twist-${key}@${day(s)}`;
  if (s.state.memories.some((m) => m.id === id)) return;
  s.state.memories.push({ id, day: day(s), who, kind, text });
  if (s.state.memories.length > 40) s.state.memories.splice(0, s.state.memories.length - 40);
}

function begin(s: GameStore, id: TwistId, step: string, data: TwistActive['data'] = {}) {
  const t = twists(s);
  t.active = { id, day: day(s), at: mins(s), step, data };
  t.fired = day(s);
  s.notify();
}
export function setStep(s: GameStore, step: string) {
  const a = twists(s).active;
  if (a) a.step = step;
  s.notify();
}
export function endTwist(s: GameStore, outcome: string) {
  const t = twists(s);
  const a = t.active;
  if (!a) return;
  t.history = [...t.history, { id: a.id, day: a.day, outcome }].slice(-30);
  t.active = null;
  twistFx.letterbox(false);
  s.notify();
}
const lastOutcome = (s: GameStore, id: TwistId) => [...twists(s).history].reverse().find((h) => h.id === id);

// ---------------------------------------------------------------- critical moments

/** Other systems can add "not now" checks (e.g. Angry Mum Mode, rewind). */
export const twistBlockers: ((s: GameStore) => boolean)[] = [];

/** True while starting a twist would trample something important. */
export function isCritical(s: GameStore): boolean {
  if (s.ui.screen !== 'game' || s.ui.dialogue || s.ui.modal || s.state.inQueue) return true;
  const run = s.state.run;
  if (run && run.status === 'in-progress') {
    const left = s.timeLeft();
    if (left !== null && left <= 20) return true;
    if (run.flags['critical']) return true;
    if (s.state.hands.length) return true; // carrying stuff mid-chore
  }
  return twistBlockers.some((f) => {
    try {
      return f(s);
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------- twist definitions

interface TwistDef {
  id: TwistId;
  weight: number;
  /** day-level eligibility (can it happen today at all?) */
  eligible(s: GameStore): boolean;
  /** moment-level: right place, right time */
  ready(s: GameStore): boolean;
  /** missions in progress block this twist (home chaos twists) */
  calm?: boolean;
  start(s: GameStore): void;
  /** where forceTwist should take the player */
  place: LocationId;
}

const recent = (s: GameStore, id: TwistId, days: number) => twists(s).history.some((h) => h.id === id && day(s) - h.day < days);

export const TWISTS: Record<TwistId, TwistDef> = {
  relatives: {
    id: 'relatives',
    weight: 3,
    place: 'home',
    calm: true,
    eligible: (s) => !!guardian(s) && !recent(s, 'relatives', 3),
    ready: (s) => at(s, 'home'),
    start: startRelatives,
  },
  powercut: {
    id: 'powercut',
    weight: 3,
    place: 'home',
    calm: true,
    eligible: (s) => !recent(s, 'powercut', 3),
    ready: (s) => at(s, 'home') && tod(s) >= POWERCUT_FROM,
    start: startPowercut,
  },
  puppy: {
    id: 'puppy',
    weight: 3,
    place: 'town',
    eligible: (s) => (!twists(s).puppy || ['reunited', 'shooed', 'shelter'].includes(twists(s).puppy!.status)) && !recent(s, 'puppy', 4),
    ready: (s) => at(s, 'town', 'city'),
    start: startPuppy,
  },
  wallet: {
    id: 'wallet',
    weight: 3,
    place: 'town',
    eligible: (s) => !recent(s, 'wallet', 4) && !twists(s).secret,
    ready: (s) => at(s, 'town'),
    start: startWallet,
  },
  viral: {
    id: 'viral',
    weight: 6,
    place: 'home',
    eligible: (s) => twists(s).viral?.phase === 'posted',
    ready: () => true,
    start: startViral,
  },
  kite: {
    id: 'kite',
    weight: 2,
    place: 'town',
    eligible: (s) => !recent(s, 'kite', 3),
    ready: (s) => at(s, 'town') && tod(s) < 19 * 60 + 15,
    start: startKite,
  },
};

// ---------------------------------------------------------------- scheduler

/** Today's twist (deterministic for seed + day) — null on a quiet day. */
export function planDay(s: GameStore, d = day(s)): { id: TwistId | null; at: number } {
  const seed = s.state.seed + d * 7919;
  const startAt = TIME_CONFIG.dayStart + 12 + Math.floor(rollFor(seed, 'twist-at') * 100);
  // a posted reel always blows up (that's the twist!)
  if (TWISTS.viral.eligible(s)) return { id: 'viral', at: Math.min(startAt, mins(s) + 3) };
  if (rollFor(seed, 'twist-day') >= TWIST_CHANCE) return { id: null, at: startAt };
  const yesterday = twists(s).history.find((h) => h.day === d - 1)?.id;
  const pool = TWIST_IDS.filter((id) => id !== 'viral' && id !== yesterday && TWISTS[id].eligible(s));
  if (!pool.length) return { id: null, at: startAt };
  const total = pool.reduce((a, id) => a + TWISTS[id].weight, 0);
  let r = rollFor(seed, 'twist-pick') * total;
  for (const id of pool) {
    r -= TWISTS[id].weight;
    if (r < 0) return { id, at: id === 'powercut' ? Math.max(startAt, POWERCUT_FROM) : startAt };
  }
  return { id: pool[pool.length - 1], at: startAt };
}

/** Roll a new day: plan, and let multi-day stories move on (fame fades, puppy needs care…). */
function rollover(s: GameStore) {
  const t = twists(s);
  const d = day(s);
  if (t.day === d) return;
  const first = t.day === 0;
  t.day = d;
  if (!first) newDay(s);
  const p = planDay(s, d);
  t.planned = p.id;
  t.plannedAt = p.at;
}

/** Called on every in-game minute (and safe to call any time). */
export function checkTwists(s: GameStore): void {
  rollover(s);
  const t = twists(s);
  if (t.active) return tickActive(s);
  if (!t.planned || t.fired === day(s) || mins(s) < t.plannedAt) return;
  const def = TWISTS[t.planned];
  if (isCritical(s) || (def.calm && missionLive(s)) || !def.ready(s)) return;
  startTwist(s, t.planned);
}

export function startTwist(s: GameStore, id: TwistId) {
  const t = twists(s);
  if (t.active) endTwist(s, 'interrupted');
  t.planned = id;
  TWISTS[id].start(s);
}

/** Dev / test helper: fire any twist right now (moves you to the right place / time first). */
export function forceTwist(id: TwistId, s?: GameStore, opts: { travel?: boolean } = {}): string {
  const st = s ?? devStore;
  if (!st) return 'no store';
  if (!TWISTS[id]) return `unknown twist "${id}" — try ${TWIST_IDS.join(', ')}`;
  rollover(st);
  const t = twists(st);
  if (t.active) endTwist(st, 'forced-off');
  if (st.ui.dialogue) st.closeDialogue();
  if (st.ui.modal) st.openModal(null);
  if (id === 'powercut' && tod(st) < POWERCUT_FROM) st.state.clock.minutes += POWERCUT_FROM - tod(st) + 5;
  if (id === 'kite' && tod(st) >= 19 * 60 + 15) st.state.clock.minutes -= tod(st) - 18 * 60;
  if (id === 'viral' && t.viral?.phase !== 'posted') postReel(st, 'pillow-fight', true);
  const def = TWISTS[id];
  const go = () => {
    t.fired = 0;
    startTwist(st, id);
  };
  if (!def.ready(st) && opts.travel !== false && typeof window !== 'undefined') {
    st.bus.emit('scene', { goto: def.place });
    window.setTimeout(go, 700);
    return `travelling to ${def.place}, then starting ${id}`;
  }
  go();
  return `started ${id}`;
}

let devStore: GameStore | null = null;
const installed = new WeakSet<GameStore>();
/** Hook the scheduler + interaction routing into a store (idempotent). */
export function installTwists(s: GameStore) {
  if (installed.has(s)) return;
  installed.add(s);
  devStore = s;
  s.bus.on('game', (ev) => {
    if (ev.type === 'minute') checkTwists(s);
    else if (ev.type === 'interact') twistInteract(s, ev.target);
    else if (ev.type === 'location') onLocation(s);
  });
  // a pillow fight is the funniest clip of the day
  s.bus.on('fx', (fx) => {
    if (fx.kind === 'home:fight' && fx.x === 0) s.state.world['twist.clip'] = day(s);
  });
  if (demoHooksEnabled()) (window as any).__twist = (id: TwistId) => forceTwist(id, s);
}

// ---------------------------------------------------------------- per-minute beats

function tickActive(s: GameStore) {
  const a = twists(s).active!;
  if (a.day !== day(s)) return expire(s);
  const since = mins(s) - a.at;
  const free = !s.ui.dialogue && !s.ui.modal;
  switch (a.id) {
    case 'relatives':
      if (a.step === 'tidy' && free && since >= TIDY_MINUTES) guestsArrive(s);
      break;
    case 'powercut':
      if (since >= POWERCUT_MINUTES && free) powerBack(s);
      break;
    case 'wallet':
      if (a.step === 'guilt' && free) {
        const n = Math.floor(since / 7);
        if (n > Number(a.data.nudges ?? 0) && n <= 3) {
          a.data.nudges = n;
          s.toast(['The wallet money feels heavy in your pocket…', 'Somewhere, someone is searching for their rent money.', 'You keep thinking about that ID card photo.'][n - 1], 'neutral');
        }
        if (at(s, 'home') && since >= 12) familyFindsOut(s);
      }
      break;
    case 'viral':
      if (a.step === 'rising' && since >= 4 && free) viralRisen(s);
      if (a.step === 'famous' && since >= 14 && free) meanComments(s);
      break;
  }
}

/** The day ended mid-story: wrap it up gently. */
function expire(s: GameStore) {
  const a = twists(s).active!;
  if (a.id === 'puppy' && a.step === 'following') {
    const p = twists(s).puppy;
    if (p) p.status = 'shelter';
    endTwist(s, 'shelter');
    s.toast('The puppy was picked up by the friendly animal shelter overnight. It will find a loving home. 🐾', 'neutral');
    return;
  }
  if (a.id === 'wallet' && a.step === 'guilt') {
    twists(s).secret = { day: a.day, amount: Number(a.data.taken ?? 0) };
    endTwist(s, 'secret');
    return;
  }
  if (a.id === 'viral') {
    endTwist(s, 'faded');
    return;
  }
  endTwist(s, 'expired');
}

function newDay(s: GameStore) {
  const t = twists(s);
  if (t.active && t.active.day !== day(s)) expire(s);
  if (t.fame && t.fame.day < day(s)) t.fame = undefined;
  const v = t.viral;
  if (v && v.phase !== 'posted' && v.phase !== 'faded' && v.day < day(s)) {
    v.phase = 'faded';
    s.toast('Yesterday’s reel is old news — the internet moved on to a cat playing the piano. 🐱🎹', 'info');
  }
  puppyNewDay(s);
}

function onLocation(s: GameStore) {
  const t = twists(s);
  if (t.fame?.day === day(s) && at(s, 'town', 'city')) s.toast('👀 People are pointing at you and whispering…', 'info');
  const p = t.puppy;
  if (p?.status === 'adopted' && at(s, 'town', 'city') && p.walkedDay !== day(s)) {
    p.walkedDay = day(s);
    s.toast(`🐕 ${p.name} trots happily beside you — walk done!`, 'good');
  }
}

// ---------------------------------------------------------------- interaction routing

/** Handles `twist:*` interactables and twist-specific NPC chats. Returns true when it took over. */
export function twistInteract(s: GameStore, target: string): boolean {
  if (s.ui.dialogue) return false;
  const t = twists(s);
  const a = t.active;
  const g = guardian(s);
  // guardian chats that belong to a twist
  if (g && target === `npc:${g.id}`) {
    if (a?.id === 'puppy' && a.step === 'following' && at(s, 'home')) return askToAdopt(s), true;
    if (a?.id === 'powercut' && a.step === 'found') return torchToParent(s), true;
    if (a?.id === 'wallet' && a.step === 'guilt') return familyFindsOut(s), true;
  }
  if (t.fame?.day === day(s) && /^npc:folk\d$/.test(target) && !t.fame.greeted.includes(target)) {
    t.fame.greeted.push(target);
    const clip = CLIPS[t.viral?.clip ?? ''] ?? 'reel';
    const line =
      t.fame.kind === 'viral'
        ? pick(s, target, [`Hey! You’re the ${clip} kid! 😂 My whole office watched it!`, 'OMG, it’s YOU! From the reel! Can I get a selfie? …Kidding. Mostly.', 'My kids have watched your video forty times. FORTY.'])
        : pick(s, target, ['You’re the one who returned that wallet! The whole street is talking about it. Respect! 👏', 'Saw you in the paper! Honest kids like you make this town better.', 'Wallet hero! My grandmother cut out your photo for her fridge.']);
    say(s, [{ speaker: 'Neighbour', text: line, mood: 'excited' }]);
    return true;
  }
  if (!target.startsWith('twist:')) return false;
  const [, kind, arg] = target.split(':');
  switch (kind) {
    case 'mess':
      return tidyOne(s, Number(arg)), true;
    case 'tray':
      return takeTray(s), true;
    case 'aunt':
      return talkToAunt(s), true;
    case 'torch':
      return searchTorch(s, Number(arg)), true;
    case 'dog':
      return dogInteract(s), true;
    case 'wallet':
      return walletChoice(s), true;
    case 'owner':
      return ownerSearching(s), true;
    case 'kite':
      return kiteChoice(s), true;
  }
  return false;
}

const pick = <T,>(s: GameStore, key: string, arr: T[]) => arr[Math.floor(rollFor(s.state.seed + day(s), key) * arr.length)];

// =================================================================== 1. SURPRISE RELATIVES

export const GUESTS = { aunt: 'Aunty Pinky', uncle: 'Uncle Bunty', cousin: 'Little cousin Rohan' };

function startRelatives(s: GameStore) {
  begin(s, 'relatives', 'doorbell', { tidied: 0, score: 0, q: 0, mess: (1 << MESS_COUNT) - 1 });
  twistFx.letterbox(true);
  twistFx.dramatic('shock');
  showCard({ emoji: '🔔', title: 'DING-DONG!', sub: 'Surprise relatives — unannounced!', tone: 'shock' });
  say(s, [
    N('DING-DONG! DING-DONG! DING-DONG!', 'surprised'),
    G(s, `WHAT?! ${GUESTS.aunt}, ${GUESTS.uncle} AND ${GUESTS.cousin} are at the gate! Unannounced!`, 'surprised'),
    {
      ...G(s, 'The living room is a DISASTER! Quick — tidy up the shoes and cushions while I stall them at the door!', 'worried'),
      choices: [
        { label: '🧹 On it! Operation Tidy-Up!', tone: 'good', run: () => tidyGo(s) },
        { label: 'Not now… (hide in my room)', tone: 'neutral', run: () => hideFromGuests(s) },
      ],
    },
  ]);
}

function tidyGo(s: GameStore) {
  setStep(s, 'tidy');
  twistFx.letterbox(false);
  s.toast(`⏱ Tidy the living room! ${MESS_COUNT} things to put away before the guests walk in.`, 'info');
}

function hideFromGuests(s: GameStore) {
  const g = guardian(s);
  if (g) s.trust(g.id, -2);
  twistFx.letterbox(false);
  say(s, [G(s, 'Hide?! Fine… but you’re coming out to say hello in five minutes, {endearment}.', 'annoyed')], () => {
    s.spendTime(5, 'Hiding from the relatives');
    guestsArrive(s);
  });
}

export const messLeft = (s: GameStore) => {
  const a = activeTwist(s);
  return a?.id === 'relatives' ? countBits(Number(a.data.mess ?? 0)) : 0;
};
const countBits = (n: number) => n.toString(2).replace(/0/g, '').length;
export const messThere = (s: GameStore, i: number) => {
  const a = activeTwist(s);
  return !!a && a.id === 'relatives' && a.step === 'tidy' && (Number(a.data.mess) & (1 << i)) !== 0;
};

export function tidyOne(s: GameStore, i: number) {
  const a = activeTwist(s);
  if (!a || a.id !== 'relatives' || !messThere(s, i)) return;
  a.data.mess = Number(a.data.mess) & ~(1 << i);
  a.data.tidied = Number(a.data.tidied) + 1;
  s.spendTime(0.5);
  s.bus.emit('fx', { kind: 'sparkle' });
  const left = messLeft(s);
  if (left > 0) s.toast(`✨ Put away! ${left} left…`, 'good');
  else {
    s.toast('✨ Spotless! Just in time!', 'good');
    guestsArrive(s);
  }
  s.notify();
}

function guestsArrive(s: GameStore) {
  const a = activeTwist(s);
  if (!a || a.id !== 'relatives' || a.step === 'guests' || a.step === 'snacks' || a.step === 'questions') return;
  const tidied = Number(a.data.tidied);
  setStep(s, 'guests');
  twistFx.letterbox(true);
  twistFx.sting('comedy');
  const clean = tidied >= MESS_COUNT;
  say(s, [
    { speaker: GUESTS.aunt, text: clean ? 'Hellooo! Oh my, what a neat house! Who did all this?' : 'Hellooo! Oh… is that a sock on the sofa? Hahaha, never mind!', mood: clean ? 'excited' : 'surprised' },
    { speaker: GUESTS.uncle, text: 'We were just passing by! Thought we’d drop in for two minutes. Or two hours. Hahaha!', mood: 'cheerful' },
    {
      ...G(s, 'Welcome, welcome! Sit, sit! {endearment}, can you bring {tea} and snacks from the kitchen?', 'cheerful'),
      choices: [
        { label: `🍪 Bring ${words('{tea}')} & snacks`, tone: 'good', run: () => snackGo(s) },
        { label: 'Just sit and chat', run: () => startQuestions(s) },
      ],
    },
  ]);
  if (clean) a.data.score = Number(a.data.score) + 1;
}

function snackGo(s: GameStore) {
  setStep(s, 'snacks');
  twistFx.letterbox(false);
  s.toast('🍪 Grab the snack tray from the kitchen counter.', 'info');
}

function takeTray(s: GameStore) {
  const a = activeTwist(s);
  if (!a || a.id !== 'relatives' || a.step !== 'snacks') return;
  a.data.tray = true;
  setStep(s, 'serve');
  s.toast(`🫖 Got the tray! Serve it to ${GUESTS.aunt}.`, 'good');
}

function talkToAunt(s: GameStore) {
  const a = activeTwist(s);
  if (!a || a.id !== 'relatives') return;
  if (a.step === 'serve') {
    a.data.score = Number(a.data.score) + 1;
    s.bus.emit('fx', { kind: 'heart' });
    return say(s, [{ speaker: GUESTS.aunt, text: `Ooh, ${words('{tea}')} AND biscuits! Such good manners! Now come, sit next to me…`, mood: 'warm' }], () => startQuestions(s));
  }
  if (a.step === 'guests' || a.step === 'snacks') return startQuestions(s);
}

interface AwkQ {
  ask: string;
  polite: string;
  sarcastic: string;
  honest: string;
  reactP: string;
  reactS: string;
  reactH: string;
}
export const AWKWARD: AwkQ[] = [
  {
    ask: 'So! What are your MARKS these days? Rohan got 98 in maths, you know.',
    polite: 'I’m doing okay, Aunty. Working on it!',
    sarcastic: 'Oh, 1000 out of 100. They had to invent new numbers.',
    honest: 'Maths is tricky for me, but I’ve improved a lot this term. I’m proud of that.',
    reactP: 'Okay, okay. Keep working hard!',
    reactS: 'Hmph! Very funny. Too much phone, I think.',
    reactH: 'Arre, improving is the best thing! Good attitude.',
  },
  {
    ask: 'When I was your age, I cooked for ten people AND walked five kilometres to school! Uphill! Both ways!',
    polite: 'Wow, that sounds really hard, Aunty.',
    sarcastic: 'Both ways uphill? Was the school on a mountain shaped like a pretzel?',
    honest: 'That sounds tough! I help at home too — I can cook a simple meal now.',
    reactP: 'It was! Children today have it easy.',
    reactS: 'Pretzel?! … Okay, that was a little bit funny.',
    reactH: 'Really? You must make it for me next time!',
  },
  {
    ask: 'And why are you not more like Rohan? So obedient, so perfect, plays violin, never on the phone…',
    polite: 'Rohan is great. I’m just a different kind of great.',
    sarcastic: 'Because one perfect child is enough for the family.',
    honest: 'I think everyone is good at different things. I’m good at helping, and I’m learning a lot.',
    reactP: 'Hmm, that’s true actually.',
    reactS: 'What cheek! (Uncle is laughing into his tea.)',
    reactH: 'You know… that’s very wise. I shouldn’t compare.',
  },
];

function startQuestions(s: GameStore) {
  const a = activeTwist(s);
  if (!a || a.id !== 'relatives') return;
  setStep(s, 'questions');
  twistFx.letterbox(true);
  askQuestion(s, 0);
}

export const AWK_POINTS = { polite: 1, sarcastic: -2, honest: 2 } as const;

function askQuestion(s: GameStore, i: number) {
  const a = activeTwist(s)!;
  const q = AWKWARD[i];
  if (!q) return cousinShowOff(s);
  const answer = (kind: keyof typeof AWK_POINTS, mine: string, react: string, mood: string) => () => {
    a.data.score = Number(a.data.score) + AWK_POINTS[kind];
    if (kind === 'sarcastic') a.data.cheeky = Number(a.data.cheeky ?? 0) + 1;
    if (kind === 'honest') s.skill('communication', 1);
    say(s, [P(s, mine, kind === 'sarcastic' ? 'cheerful' : 'calm'), { speaker: GUESTS.aunt, text: react, mood }], () => askQuestion(s, i + 1));
  };
  say(s, [
    {
      speaker: GUESTS.aunt,
      text: q.ask,
      mood: 'excited',
      choices: [
        { label: `🙂 ${q.polite}`, hint: 'polite', tone: 'neutral', run: answer('polite', q.polite, q.reactP, 'cheerful') },
        { label: `😏 ${q.sarcastic}`, hint: 'sarcastic', tone: 'bad', run: answer('sarcastic', q.sarcastic, q.reactS, 'annoyed') },
        { label: `💛 ${q.honest}`, hint: 'honest & kind', tone: 'good', run: answer('honest', q.honest, q.reactH, 'warm') },
      ],
    },
  ]);
}

function cousinShowOff(s: GameStore) {
  const a = activeTwist(s)!;
  say(s, [
    { speaker: GUESTS.cousin, text: 'I got 100 out of 100. AND I play violin. AND I won a chess trophy. AND I can burp the alphabet.', mood: 'proud' },
    {
      speaker: GUESTS.cousin,
      text: 'What can YOU do?',
      mood: 'cheerful',
      choices: [
        { label: '😄 That’s so cool! Teach me the burp alphabet?', tone: 'good', run: () => ((a.data.score = Number(a.data.score) + 2), say(s, [{ speaker: GUESTS.cousin, text: 'YES! A… B… C… *BUUURP*. You’re my favourite cousin!', mood: 'excited' }], () => relativesFinale(s))) },
        { label: '🍽️ I once ate 14 samosas in one sitting.', run: () => say(s, [{ speaker: GUESTS.cousin, text: 'FOURTEEN?! …Okay, you win.', mood: 'surprised' }], () => relativesFinale(s)) },
        { label: '🙄 *eye-roll*', tone: 'bad', run: () => ((a.data.score = Number(a.data.score) - 1), say(s, [{ speaker: GUESTS.cousin, text: 'MUM! They rolled their eyes at me!', mood: 'sad' }], () => relativesFinale(s))) },
      ],
    },
  ]);
}

/** Outcome for a relatives score (tidy + snacks + answers + cousin). */
export function relativesOutcome(score: number): 'star' | 'okay' | 'cheeky' {
  return score >= 5 ? 'star' : score >= 1 ? 'okay' : 'cheeky';
}

function relativesFinale(s: GameStore) {
  const a = activeTwist(s)!;
  const score = Number(a.data.score);
  const out = relativesOutcome(score);
  const g = guardian(s);
  const gift = money(100);
  s.spendTime(20, 'Visit from the relatives');
  if (out === 'star') {
    twistFx.dramatic('win');
    s.give(gift, `Gift from ${GUESTS.aunt}`);
    if (g) s.trust(g.id, 5);
    s.skill('communication', 2);
    remember(s, 'relatives-star', 'kind', `you handled ${GUESTS.aunt}’s surprise visit like a superstar`);
  } else if (out === 'okay') {
    twistFx.sting('comedy');
    if (g) s.trust(g.id, 2);
    remember(s, 'relatives-okay', 'helpful', `you helped when the relatives turned up out of nowhere`);
  } else {
    twistFx.sting('fail');
    if (g) s.trust(g.id, -3);
    remember(s, 'relatives-cheeky', 'careless', `you were a bit cheeky with ${GUESTS.aunt}`);
  }
  say(
    s,
    [
      { speaker: GUESTS.uncle, text: 'Right! We should go. Lovely to see you all! Next time we’ll call first. Probably. Hahaha!', mood: 'cheerful' },
      out === 'star'
        ? { speaker: GUESTS.aunt, text: `Such a lovely child! Here — ${formatMoney(gift)}, buy yourself something nice. Don’t tell Rohan!`, mood: 'warm' }
        : out === 'okay'
          ? { speaker: GUESTS.aunt, text: 'Bye-bye! Study hard!', mood: 'cheerful' }
          : { speaker: GUESTS.aunt, text: 'Hmph. Bye.', mood: 'annoyed' },
      G(
        s,
        out === 'star'
          ? '*collapses on the sofa* You were AMAZING. Calm, kind and honest — even with Aunty’s questions. {praise}'
          : out === 'okay'
            ? 'Phew! We survived. Thanks for helping, {endearment}. Aunty means well, even when it’s awkward.'
            : 'We need to talk about the cheeky answers. Being honest is good — being rude isn’t. You can be honest AND kind.',
        out === 'cheeky' ? 'disappointed' : 'warm',
      ),
    ],
    () => endTwist(s, out),
  );
}

// =================================================================== 2. POWER CUT

/** Where the torch is hidden tonight (0..TORCH_SPOTS-1). */
export const torchSpot = (s: GameStore) => Math.floor(rollFor(s.state.seed + day(s), 'torch') * TORCH_SPOTS);
export const TORCH_SPOT_LABELS = ['Feel around the study desk drawer', 'Search the document cabinet', 'Check the kitchen drawer'];

function startPowercut(s: GameStore) {
  begin(s, 'powercut', 'dark', { torch: false, comforted: false, searched: 0 });
  twistFx.flash(0x000000);
  twistFx.shake();
  twistFx.sting('shock');
  showCard({ emoji: '🔌', title: '*THUNK*', sub: 'Power cut!', tone: 'shock' });
  const sib = sibling(s);
  const lines: DialogueLine[] = [N('*THUNK.* Everything goes black. The fridge stops humming. The fan slowly spins to a stop…', 'whisper')];
  const after = () => findTorchIntro(s);
  if (sib) {
    lines.push({
      speaker: sib.name,
      portrait: sib.id,
      text: 'AAAAH! I can’t see ANYTHING! Is it a ghost?! I don’t like the dark!',
      mood: 'scared',
      choices: [
        { label: '🤗 Hey, it’s okay — I’m right here. It’s just a power cut.', tone: 'good', run: () => comfortSibling(s, sib, true, after) },
        { label: '👻 “BOOOO!”', tone: 'bad', run: () => comfortSibling(s, sib, false, after) },
      ],
    });
    say(s, lines);
  } else say(s, lines, after);
}

function comfortSibling(s: GameStore, sib: FamilyMember, kind: boolean, then: () => void) {
  const a = activeTwist(s)!;
  if (kind) {
    a.data.comforted = true;
    s.trust(sib.id, 4);
    s.skill('empathy', 2);
    say(s, [{ speaker: sib.name, portrait: sib.id, text: '…Okay. Can I hold your hand? Just for a bit.', mood: 'warm' }, P(s, 'Of course. Let’s find a torch together.', 'warm')], then);
  } else {
    s.trust(sib.id, -3);
    recordConduct(s, { kind: 'respect', severity: 1, text: 'Scared the little one during the power cut', by: sib.id, lesson: 'When someone is scared, a calm voice helps more than a prank.' });
    say(s, [{ speaker: sib.name, portrait: sib.id, text: 'WAAAAH! *sniff* That’s NOT funny!', mood: 'sad' }, P(s, 'Sorry, sorry! Too soon. It’s just a power cut, I promise. Come on.', 'apologetic')], then);
  }
}

function findTorchIntro(s: GameStore) {
  setStep(s, 'find');
  say(s, [G(s, 'Everyone stay calm and stay where you are. There’s a torch somewhere — a drawer, I think. Can you find it? Use your phone light, slowly.', 'calm')]);
  s.toast('🔦 Find the torch: check drawers and cabinets around the house.', 'info');
}

export function searchTorch(s: GameStore, i: number) {
  const a = activeTwist(s);
  if (!a || a.id !== 'powercut' || a.step !== 'find') return;
  a.data.searched = Number(a.data.searched) + 1;
  s.spendTime(1);
  if (i === torchSpot(s)) {
    a.data.torch = true;
    setStep(s, 'found');
    twistFx.sting('reveal');
    s.bus.emit('fx', { kind: 'sparkle' });
    const g = guardian(s);
    say(s, [N('Your fingers close around something cold and round… THE TORCH! *click* A bright beam cuts through the dark.', 'excited')]);
    s.toast(g ? `🔦 Found it! Bring the torch to ${g.name}.` : '🔦 Found it!', 'good');
    if (!g) torchToParent(s);
  } else say(s, [N(pick(s, `torch-miss-${i}-${a.data.searched}`, ['Just pens, a stapler and one very old sweet. No torch.', 'Papers… a rubber band ball… no torch here.', 'Spoons. Lots of spoons. No torch.']))]);
}

function torchToParent(s: GameStore) {
  const a = activeTwist(s);
  if (!a || a.id !== 'powercut') return;
  setStep(s, 'wait');
  const g = guardian(s);
  if (g) s.trust(g.id, 3);
  s.skill('problem', 2);
  say(s, [
    {
      ...G(s, 'You found it! Brilliant, {endearment}. Let’s light the candles. Now… what do we do while we wait?', 'warm'),
      choices: [
        { label: '🦊 Shadow puppets on the wall!', tone: 'good', run: () => waitTogether(s, 'Shadow puppets — the sibling laughs so hard they snort.') },
        { label: '📖 Tell a spooky-but-silly story', run: () => waitTogether(s, 'A story about a ghost who is scared of the dark. Everyone giggles.') },
        { label: '🪟 Check if the neighbours have power', run: () => waitTogether(s, 'The whole street is dark — the moon looks extra bright tonight.') },
      ],
    },
  ]);
}

function waitTogether(s: GameStore, text: string) {
  say(s, [N(text, 'cheerful')], () => {
    const a = activeTwist(s);
    if (!a) return;
    const left = POWERCUT_MINUTES - (mins(s) - a.at);
    if (left > 0) s.spendTime(left, 'Waiting for the power by candlelight');
    powerBack(s);
  });
}

export function powerBack(s: GameStore) {
  const a = activeTwist(s);
  if (!a || a.id !== 'powercut') return;
  const helped = !!a.data.torch;
  const comforted = !!a.data.comforted;
  twistFx.flash(0xffffff);
  twistFx.dramatic('win');
  showCard({ emoji: '💡', title: 'POWER’S BACK!', sub: helped ? 'Calm + helpful = hero' : 'Phew!', tone: 'warm' });
  const sib = sibling(s);
  if (helped || comforted) remember(s, 'powercut-calm', 'brave', 'you stayed calm and helped everyone when the power went out');
  const g = guardian(s);
  if (g && helped && comforted) s.trust(g.id, 2);
  say(s, [N('*Bzzzt* — the lights flicker back on! The fridge hums again!', 'excited'), ...(sib ? [{ speaker: sib.name, portrait: sib.id, text: 'WOOHOOO! LIGHTS! I wasn’t scared. Okay, a little.', mood: 'excited' }] : []), G(s, helped ? 'Calm, helpful, and you looked after everyone. That’s exactly what we do in a power cut. Proud of you!' : 'Power cuts happen. Next time: stay calm, stay put, and know where the torch lives.', helped ? 'proud' : 'calm')], () =>
    endTwist(s, helped ? 'hero' : 'waited'),
  );
}

// =================================================================== 3. LOST PUPPY

export const PUPPY_NAMES = ['Biscuit', 'Momo', 'Pepper'];
export const puppyHasCollar = (s: GameStore) => rollFor(s.state.seed + day(s), 'collar') < 0.5;

function startPuppy(s: GameStore) {
  begin(s, 'puppy', 'meet', {});
  twists(s).puppy = { status: 'following', name: 'Puppy', since: day(s), fedDay: 0, walkedDay: 0, missed: 0 };
  twistFx.dramatic('reveal');
  showCard({ emoji: '🐶', title: 'Wait… WHO is THIS?!', sub: 'A puppy is following you!', tone: 'warm' });
  say(s, [N('Something small and fluffy bumps into your leg… A PUPPY! Its tail is going a hundred miles an hour.', 'surprised'), { ...N('*Wag wag wag.* It looks up at you like you are its whole world. It won’t stop following you!', 'warm'), choices: puppyChoices(s) }]);
}

function puppyChoices(s: GameStore): DialogueChoice[] {
  return [
    { label: '🔎 Check its collar', tone: 'good', run: () => checkCollar(s) },
    { label: '🗣️ Ask people around', run: () => askAround(s) },
    { label: 'Not now — shoo it gently home', run: () => shooPuppy(s) },
  ];
}

function checkCollar(s: GameStore) {
  if (puppyHasCollar(s)) {
    twistFx.sting('reveal');
    say(s, [
      {
        ...N('A little blue collar with a tag: “Hi, I’m BISCUIT! If I’m lost, please call my human: 98-PUPPY-01”.', 'excited'),
        choices: [
          { label: '📞 Call the number', tone: 'good', run: () => callOwner(s) },
          { label: 'Not now', run: () => shooPuppy(s) },
        ],
      },
    ]);
  } else {
    say(s, [
      {
        ...N('No collar. No tag. Just a very hopeful face. 🥺', 'sad'),
        choices: [
          { label: '🏠 Take it home and ASK my parents', tone: 'good', run: () => puppyFollowHome(s) },
          { label: '🏥 Take it to the animal shelter', run: () => puppyShelter(s, 'You walk it to the animal shelter by the clinic. The staff promise to find it a loving home.') },
          { label: '🗣️ Ask people around first', run: () => askAround(s) },
        ],
      },
    ]);
  }
}

function askAround(s: GameStore) {
  s.spendTime(3, 'Asking around about the puppy');
  say(s, [{ speaker: 'Neighbour', text: 'Not mine, sorry! Did you check for a collar? Lost dogs often have a phone number on the tag.', mood: 'cheerful', choices: [{ label: '🔎 Check its collar', tone: 'good', run: () => checkCollar(s) }, { label: 'Not now — shoo it gently home', run: () => shooPuppy(s) }] }]);
}

function shooPuppy(s: GameStore) {
  const p = twists(s).puppy!;
  p.status = 'shooed';
  say(s, [N('You point down the road. The puppy tilts its head… then trots off, tail still wagging. Hopefully it knows the way home.', 'calm')], () => endTwist(s, 'shooed'));
}

function callOwner(s: GameStore) {
  setStep(s, 'owner');
  s.spendTime(2);
  say(s, [{ speaker: '📞 Biscuit’s owner', text: 'Hello? … BISCUIT?! You found Biscuit?! Oh thank goodness, I’ve been looking everywhere! Stay right there, I’m coming!', mood: 'excited' }], () => {
    s.spendTime(4, 'Waiting with Biscuit');
    reunite(s);
  });
}

function reunite(s: GameStore) {
  const p = twists(s).puppy!;
  const reward = money(100);
  twistFx.dramatic('win');
  showCard({ emoji: '💛', title: 'Reunited!', sub: 'Biscuit is home', tone: 'warm' });
  say(s, [
    { speaker: 'Biscuit’s owner', text: 'BISCUIT! *Biscuit leaps into their arms, licking their whole face.* Thank you, thank you! Please — take this as a thank-you.', mood: 'warm' },
    {
      ...N(`They hold out ${formatMoney(reward)}.`),
      choices: [
        { label: `Accept the ${formatMoney(reward)} reward`, run: () => (s.give(reward, 'Reward for finding Biscuit'), puppyDone(s, p)) },
        { label: '💛 No thanks — happy to help!', tone: 'good', run: () => (s.skill('empathy', 2), puppyDone(s, p, true)) },
      ],
    },
  ]);
}

function puppyDone(s: GameStore, p: PuppyState, declined = false) {
  p.status = 'reunited';
  remember(s, 'puppy-reunited', 'helpful', declined ? 'you returned a lost puppy and didn’t even take the reward' : 'you called the number on a lost puppy’s collar and got it home');
  say(s, [N(declined ? 'The owner insists on a hug at least. Biscuit insists on licking your shoes.' : 'Biscuit gives you one last happy “WOOF!” as they walk home.', 'warm')], () => endTwist(s, 'reunited'));
}

function puppyFollowHome(s: GameStore) {
  setStep(s, 'following');
  s.toast('🐶 The puppy follows you. Go home and ASK your parents before deciding anything!', 'info');
}

function puppyShelter(s: GameStore, text: string) {
  const p = twists(s).puppy!;
  p.status = 'shelter';
  remember(s, 'puppy-shelter', 'responsible', 'you made sure a lost puppy got to the animal shelter safely');
  say(s, [N(text, 'warm')], () => endTwist(s, 'shelter'));
}

function askToAdopt(s: GameStore) {
  const g = guardian(s);
  twistFx.letterbox(true);
  say(s, [
    P(s, 'Um… so… I found a puppy. It has no collar. Can we… keep it? Please? PLEASE?', 'excited'),
    G(s, 'A PUPPY?! In the HOUSE?! …Oh my, look at that face.', 'surprised'),
    {
      ...G(s, 'A dog is a big responsibility, {endearment}. Food every day. A walk every day. Even when it rains. Even when you’re tired. Will YOU do that?', 'calm'),
      choices: [
        { label: '🤞 I promise — I’ll feed and walk it every day', tone: 'good', run: () => namePuppy(s) },
        { label: 'Maybe the shelter is better for it', run: () => (twistFx.letterbox(false), puppyShelter(s, `${g?.name ?? 'Your family'} takes you both to the animal shelter. You get to visit — and it finds a family with a big garden.`)) },
      ],
    },
  ]);
}

function namePuppy(s: GameStore) {
  say(s, [
    {
      ...G(s, 'Okay. Then it’s settled — but it’s YOUR job. What shall we call it?', 'warm'),
      choices: PUPPY_NAMES.map((n) => ({ label: `🐕 ${n}`, tone: 'good' as const, run: () => adopt(s, n) })),
    },
  ]);
}

export function adopt(s: GameStore, name: string) {
  const t = twists(s);
  t.puppy = { status: 'adopted', name, since: day(s), fedDay: day(s), walkedDay: day(s), missed: 0 };
  const g = guardian(s);
  if (g) s.trust(g.id, 2);
  twistFx.dramatic('win');
  showCard({ emoji: '🐕', title: `Welcome home, ${name}!`, sub: 'Feed & walk every day', tone: 'warm' });
  remember(s, 'puppy-adopted', 'responsible', `you asked first and promised to look after ${name} every day`);
  s.toast(`🐾 ${name} is part of the family! Feed and walk ${name} every day (talk to ${name} at home).`, 'good');
  endTwist(s, 'adopted');
}

/** Pet / feed / walk menu for the family dog. */
export function dogInteract(s: GameStore) {
  const p = twists(s).puppy;
  if (!p || p.status !== 'adopted') return;
  const d = day(s);
  say(s, [
    {
      speaker: p.name,
      text: p.fedDay === d && p.walkedDay === d ? '*Happy tail thumps.* Fed, walked, loved. Best day ever. WOOF!' : p.fedDay !== d ? '*Stares at the food bowl. Stares at you. Stares at the bowl.* Woof?' : '*Brings you the lead and spins in circles.* WOOF WOOF!',
      mood: 'excited',
      choices: [
        { label: '🥣 Feed', disabled: p.fedDay === d, hint: p.fedDay === d ? 'already fed today' : undefined, tone: 'good', run: () => feedDog(s) },
        { label: '🦮 Walk (15 min)', disabled: p.walkedDay === d, hint: p.walkedDay === d ? 'already walked today' : undefined, tone: 'good', run: () => walkDog(s) },
        { label: '🤗 Pet', run: () => (s.bus.emit('fx', { kind: 'heart' }), s.toast(`${p.name} melts into a happy puddle.`, 'good')) },
      ],
    },
  ]);
}
export function feedDog(s: GameStore) {
  const p = twists(s).puppy;
  if (!p || p.status !== 'adopted' || p.fedDay === day(s)) return;
  p.fedDay = day(s);
  p.missed = 0;
  s.skill('responsibility', 1);
  s.spendTime(2, `Fed ${p.name}`);
}
export function walkDog(s: GameStore) {
  const p = twists(s).puppy;
  if (!p || p.status !== 'adopted' || p.walkedDay === day(s)) return;
  p.walkedDay = day(s);
  s.skill('responsibility', 1);
  s.spendTime(15, `Walked ${p.name}`);
}

/** Yesterday's care check for the family dog. */
function puppyNewDay(s: GameStore) {
  const p = twists(s).puppy;
  if (!p || p.status !== 'adopted') return;
  const y = day(s) - 1;
  if (y < p.since) return;
  const cared = p.fedDay >= y && p.walkedDay >= y;
  if (cared) {
    p.missed = 0;
    return;
  }
  p.missed += 1;
  const g = guardian(s);
  if (p.missed >= 2) {
    recordConduct(s, { kind: 'respect', severity: 2, text: `${p.name} wasn’t fed or walked for two days`, by: g?.id, lesson: 'A pet depends on you every single day.' }, `🐕 ${p.name} has missed care two days running — time for a talk about responsibility.`);
    if (g) s.trust(g.id, -3);
    remember(s, 'puppy-neglect', 'careless', `${p.name} was left without a walk or dinner`);
  } else s.toast(`🐕 ${p.name} looked a bit sad yesterday — remember: feed AND walk every day!`, 'bad');
}

// =================================================================== 4. FOUND WALLET

export const WALLET_OWNER = 'Mr. Desai';

function startWallet(s: GameStore) {
  begin(s, 'wallet', 'spotted', {});
  twistFx.dramatic('reveal');
  showCard({ emoji: '👛', title: 'Is that… a WALLET?!', sub: 'Lying right there on the pavement', tone: 'shock' });
  s.toast('👛 Something is lying on the pavement nearby…', 'info');
  setStep(s, 'spotted');
}

/** Open the wallet (interact with it on the pavement, or straight away in tests/headless). */
export function walletChoice(s: GameStore) {
  const a = activeTwist(s);
  if (!a || a.id !== 'wallet' || a.step !== 'spotted') return;
  setStep(s, 'open');
  const cash = WALLET_CASH();
  twistFx.letterbox(true);
  twistFx.sting('shock');
  say(s, [
    N(`You open it. Inside: ${formatMoney(cash)} in cash. That’s… a LOT. And an ID card: “${WALLET_OWNER}”, with a phone number.`, 'surprised'),
    {
      ...N('Nobody is looking. What do you do?', 'whisper'),
      choices: [
        { label: `🏪 Hand it to ${words('{shopkeeper}')} at the store`, tone: 'good', run: () => walletHonest(s, 'shop') },
        { label: '📞 Call the number on the ID', tone: 'good', run: () => walletHonest(s, 'call') },
        { label: `Take just a little (${formatMoney(WALLET_SKIM())})`, tone: 'bad', run: () => walletDishonest(s, WALLET_SKIM()) },
        { label: '😈 Keep the cash', tone: 'bad', run: () => walletDishonest(s, cash) },
      ],
    },
  ]);
}

function walletHonest(s: GameStore, how: 'shop' | 'call') {
  const reward = money(200);
  s.spendTime(how === 'shop' ? 4 : 6, 'Returning the wallet');
  const lines: DialogueLine[] =
    how === 'shop'
      ? [{ speaker: words('{shopkeeper}'), portrait: 'npc:sharma', text: `A wallet? With all this cash? Good child! I know ${WALLET_OWNER} — I’ll call him right now.`, mood: 'proud' }]
      : [{ speaker: `📞 ${WALLET_OWNER}`, text: 'Hello? You FOUND it?! I’ve been searching for an hour — that’s my whole month’s rent! I’m coming!', mood: 'surprised' }];
  setStep(s, 'owner');
  say(s, [...lines, { speaker: WALLET_OWNER, text: 'It’s all here. Every single note. I… I don’t know what to say. Thank you. Please, take this — I insist.', mood: 'warm' }, N(`${WALLET_OWNER} presses ${formatMoney(reward)} into your hand.`, 'warm')], () => {
    s.give(reward, `Thank-you from ${WALLET_OWNER}`);
    walletHero(s);
  });
}

function walletHero(s: GameStore) {
  const t = twists(s);
  const g = guardian(s);
  t.fame = { day: day(s), kind: 'wallet', greeted: [] };
  if (g) s.trust(g.id, 5);
  s.skill('decisions', 2);
  remember(s, 'wallet-honest', 'honest', `you returned a wallet with ${formatMoney(WALLET_CASH())} inside — every note`);
  recordConduct(s, { kind: 'respect', severity: 1, text: `Returned a lost wallet with ${formatMoney(WALLET_CASH())} inside`, lesson: 'Honesty when nobody is watching is the real thing.' }, `🌟 ${s.player.name} found a wallet with ${formatMoney(WALLET_CASH())} and returned it to the owner.`);
  twistFx.dramatic('win');
  showHeadline({ paper: 'THE TOWN TIMES', title: 'LOCAL KID RETURNS WALLET!', sub: `${s.player.name} hands back ${formatMoney(WALLET_CASH())} — “It wasn’t mine to keep.”` });
  endTwist(s, 'returned');
}

function walletDishonest(s: GameStore, amount: number) {
  const full = amount >= WALLET_CASH();
  s.give(amount, full ? 'Cash from a found wallet' : 'A few notes from a found wallet');
  setStep(s, 'guilt');
  const a = activeTwist(s)!;
  a.data.taken = amount;
  a.data.nudges = 0;
  a.data.at = mins(s);
  twistFx.letterbox(false);
  twistFx.sting('danger');
  say(s, [N(full ? 'You stuff the cash into your pocket and drop the empty wallet. Your heart is pounding.' : `You slip ${formatMoney(amount)} out and leave the wallet with ${words('{shopkeeper}')}. Nobody will notice… right?`, 'whisper')]);
}

/** The owner is out searching — interact to make it right. */
export function ownerSearching(s: GameStore) {
  const a = activeTwist(s);
  if (!a || a.id !== 'wallet' || a.step !== 'guilt') return;
  const taken = Number(a.data.taken);
  say(s, [
    { speaker: WALLET_OWNER, text: taken >= WALLET_CASH() ? 'Excuse me — have you seen a brown wallet? It had my rent money in it… I don’t know what I’ll do. 😟' : `They found my wallet, but ${formatMoney(taken)} is missing… my daughter’s school fees. 😟`, mood: 'worried' },
    {
      ...N('Your stomach twists.', 'whisper'),
      choices: [
        { label: '🙏 Give it back and say sorry', tone: 'good', run: () => makeItRight(s, 'owner') },
        { label: 'Say nothing', tone: 'bad', run: () => s.toast('You walk away. The guilty feeling walks with you.', 'bad') },
      ],
    },
  ]);
}

function makeItRight(s: GameStore, how: 'owner' | 'family') {
  const a = activeTwist(s);
  const taken = a ? Number(a.data.taken ?? 0) : (twists(s).secret?.amount ?? 0);
  s.pay(Math.min(taken, s.state.wallet.balance), `Returned to ${WALLET_OWNER}`, false);
  const g = guardian(s);
  if (g) s.trust(g.id, how === 'owner' ? 2 : 1);
  remember(s, 'wallet-made-right', 'honest', 'you owned up and gave back the wallet money');
  twists(s).secret = undefined;
  twistFx.sting('reveal');
  say(
    s,
    [P(s, `I’m really sorry. I took ${formatMoney(taken)} from your wallet. Here — all of it.`, 'apologetic'), { speaker: WALLET_OWNER, text: '…Thank you for coming back. That took courage. Everyone makes mistakes — what matters is fixing them.', mood: 'warm' }],
    () => endTwist(s, 'made-right'),
  );
}

/** At home the family notices the extra cash — a serious (but kind) talk, with a way to make it right. */
export function familyFindsOut(s: GameStore) {
  const a = activeTwist(s);
  const secret = twists(s).secret;
  const taken = a?.id === 'wallet' ? Number(a.data.taken ?? 0) : (secret?.amount ?? 0);
  if (!taken) return;
  if (a?.id === 'wallet') a.step = 'talk';
  const g = guardian(s);
  if (g) s.trust(g.id, -6);
  recordConduct(s, { kind: 'respect', severity: 2, text: `Kept ${formatMoney(taken)} from a found wallet`, by: g?.id, lesson: 'Found money belongs to someone. Return it, even when nobody is watching.' }, `⚠ ${s.player.name} kept ${formatMoney(taken)} from a wallet found in town. A talk about honesty happened.`);
  remember(s, 'wallet-kept', 'careless', 'the money from the found wallet was kept at first');
  twistFx.letterbox(true);
  twistFx.dramatic('danger');
  say(s, [
    G(s, `Where did all this money come from? ${formatMoney(taken)}? That’s not pocket money.`, 'worried'),
    P(s, '…I found a wallet in town.', 'apologetic'),
    {
      ...G(s, `That money is someone’s rent, someone’s groceries. ${WALLET_OWNER} is probably worried sick. I’m not angry — I’m disappointed. What are we going to do?`, 'disappointed'),
      choices: [{ label: '🙏 Give it all back and apologise', tone: 'good', run: () => makeItRight(s, 'family') }],
    },
  ]);
}

// =================================================================== 5. VIRAL REEL

export const CLIPS: Record<string, string> = {
  'pillow-fight': 'pillow fight',
  dance: 'kitchen dance',
  cat: 'neighbour’s cat',
};
export const reelClipReady = (s: GameStore) => Number(s.state.world['twist.clip'] ?? 0) === day(s);

/** Post a reel from the phone (Camera app). The twist: it blows up. */
export function postReel(s: GameStore, clip = reelClipReady(s) ? 'pillow-fight' : 'dance', forced = false): ViralState {
  const t = twists(s);
  t.viral = { phase: 'posted', day: day(s), views: 100, clip };
  rollover(s);
  // fires a few minutes later (the scheduler picks it as today's twist unless one already happened)
  if (t.fired !== day(s) || forced) {
    t.planned = 'viral';
    t.plannedAt = mins(s) + 3;
    if (forced) t.fired = 0;
  }
  s.toast('📤 Posted! Now… back to real life.', 'info');
  s.notify();
  return t.viral;
}

export const viralViewsAt = (ms: number) => {
  // 100 → 1.2M over ~6 s, slow then explosive
  const k = Math.max(0, Math.min(1, ms / 6000));
  return Math.round(100 * Math.pow(VIRAL_PEAK / 100, k * k));
};

function startViral(s: GameStore) {
  const t = twists(s);
  if (!t.viral) t.viral = { phase: 'posted', day: day(s), views: 100, clip: 'dance' };
  begin(s, 'viral', 'rising', {});
  t.viral.phase = 'rising';
  t.viral.day = day(s);
  twistFx.dramatic('shock');
  twistUi.set({ viralStart: typeof performance !== 'undefined' ? performance.now() : 0, comments: [] });
  showCard({ emoji: '📈', title: 'YOUR REEL IS BLOWING UP!', sub: `The ${CLIPS[t.viral.clip] ?? 'reel'} clip`, tone: 'fun' });
}

/** The counter peaked (overlay finished, or a few minutes passed): you're famous now. */
export function viralRisen(s: GameStore) {
  const t = twists(s);
  const a = t.active;
  if (!a || a.id !== 'viral' || a.step !== 'rising' || !t.viral) return;
  t.viral.views = VIRAL_PEAK;
  t.viral.phase = 'famous';
  t.fame = { day: day(s), kind: 'viral', greeted: [] };
  setStep(s, 'famous');
  a.at = mins(s);
  twistUi.set({ viralStart: null });
  const sib = sibling(s);
  say(s, [
    N(`*BZZT BZZT BZZT* Your phone won’t stop buzzing. 1.2 MILLION views?! On the ${CLIPS[t.viral.clip] ?? 'reel'} clip?!`, 'excited'),
    ...(sib ? [{ speaker: sib.name, portrait: sib.id, text: 'WE’RE FAMOUS!!! Wait — am I famous too? I want my own fan club!', mood: 'excited' }] : []),
  ]);
}

export const MEAN_COMMENTS = [
  { user: 'xX_h8r_Xx', text: 'lol this is so cringe 🙄', tone: 'mean' as const },
  { user: 'pillowqueen', text: 'THIS IS THE BEST THING ON THE INTERNET 😂😂', tone: 'nice' as const },
  { user: 'nobody_123', text: 'ur face looks weird. delete this', tone: 'mean' as const },
  { user: 'frnd_4ever_99', text: 'so cute! what school do u go to? where do u live?? 🏫', tone: 'creepy' as const },
];

export function meanComments(s: GameStore) {
  const t = twists(s);
  const a = t.active;
  if (!a || a.id !== 'viral' || a.step !== 'famous' || !t.viral) return;
  setStep(s, 'mean');
  t.viral.phase = 'mean';
  twistUi.set({ comments: MEAN_COMMENTS });
  twistFx.sting('danger');
  say(s, [
    N('Then the comments start rolling in… and not all of them are nice.', 'worried'),
    {
      ...N('“ur face looks weird. delete this” — someone you’ve never met. Your cheeks burn.', 'sad'),
      choices: [
        { label: '😡 Reply angrily', tone: 'bad', run: () => viralReply(s, 'angry') },
        { label: '🚫 Ignore, block & report', tone: 'good', run: () => viralReply(s, 'report') },
        { label: '🗣️ Talk to a parent', tone: 'good', run: () => viralReply(s, 'parent') },
      ],
    },
  ]);
}

export function viralReply(s: GameStore, reply: NonNullable<ViralState['reply']>) {
  const t = twists(s);
  if (!t.viral) return;
  t.viral.reply = reply;
  const g = guardian(s);
  const next = () => privacyBeat(s);
  if (reply === 'angry') {
    s.skill('communication', -1);
    twistUi.set({ comments: [...MEAN_COMMENTS, { user: 'xX_h8r_Xx', text: 'LOL they got mad 🤣🤣 more pls', tone: 'mean' }, { user: 'randomguy', text: 'drama!! 🍿', tone: 'mean' }] });
    say(s, [N('You type an angry reply… and the trolls LOVE it. Twenty more mean comments pop up in seconds. Feeding trolls only makes them hungrier.', 'sad')], next);
  } else if (reply === 'report') {
    s.skill('decisions', 2);
    twistUi.set({ comments: MEAN_COMMENTS.filter((c) => c.tone === 'nice') });
    say(s, [N('Block. Report. Gone. The nice comments are still there — and there are way more of those. 💛', 'calm')], next);
  } else {
    s.skill('communication', 2);
    if (g) s.trust(g.id, 3);
    twistUi.set({ comments: MEAN_COMMENTS.filter((c) => c.tone === 'nice') });
    say(s, [G(s, 'Thank you for telling me. Those comments say more about them than about you. Let’s block and report them together — and maybe make your account private?', 'warm')], next);
  }
}

function privacyBeat(s: GameStore) {
  say(s, [
    {
      ...N('One more: “so cute! what school do u go to? where do u live??” from frnd_4ever_99 — an account with no photo and 3 followers.', 'worried'),
      choices: [
        { label: '🔒 Never share that. Block.', tone: 'good', run: () => viralWrap(s, false) },
        { label: 'Reply with my school name', tone: 'bad', run: () => viralWrap(s, true) },
      ],
    },
  ]);
}

function viralWrap(s: GameStore, overshared: boolean) {
  const t = twists(s);
  const v = t.viral!;
  v.overshared = overshared;
  v.phase = 'resolved';
  twistUi.set({ comments: [] });
  const g = guardian(s);
  if (overshared) {
    recordConduct(s, { kind: 'safety', severity: 2, text: 'Shared their school name with a stranger online', by: g?.id, lesson: 'Never share your address, school or location online — not even with “friendly” strangers.' }, `⚠ ${s.player.name} shared their school name with a stranger in reel comments. Worth a chat about online privacy.`);
    remember(s, 'viral-overshared', 'careless', 'you told a stranger online which school you go to');
  } else {
    remember(s, 'viral-kind', v.reply === 'angry' ? 'brave' : 'responsible', v.reply === 'angry' ? 'your reel went viral and you learned not to feed the trolls' : 'your reel went viral and you handled the mean comments like a pro');
    if (v.reply !== 'angry') recordConduct(s, { kind: 'screen', severity: 1, text: 'Went viral and handled mean comments calmly (blocked & reported)', lesson: 'Don’t feed trolls. Block, report, talk to someone.' });
  }
  twistFx.sting(overshared ? 'fail' : 'win');
  say(s, [G(s, overshared ? 'Oh no — please delete that and block them right now. A stranger asking where you live or study is a big red flag. We’ll set your account to private together.' : 'Fame is fun, {endearment}. But kindness and privacy matter more than views. Proud of how you handled it.', overshared ? 'worried' : 'proud')], () =>
    endTwist(s, overshared ? 'overshared' : (v.reply ?? 'resolved')),
  );
}

// =================================================================== 6. KITE IN A TREE (good luck)

function startKite(s: GameStore) {
  begin(s, 'kite', 'stuck', {});
  twistFx.dramatic('comedy');
  showCard({ emoji: '🪁', title: 'NOOO! My KITE!', sub: 'Stuck in a tree by the street', tone: 'fun' });
  say(s, [{ speaker: 'Little neighbour Mia', text: 'NOOOO! My kite is stuck in the tree! It was a birthday present! 😭 Can you help me get it down?', mood: 'sad' }]);
  s.toast('🪁 A kite is stuck in a tree by the street.', 'info');
}

export function kiteChoice(s: GameStore) {
  const a = activeTwist(s);
  if (!a || a.id !== 'kite' || a.step !== 'stuck') return;
  say(s, [
    {
      ...N('The kite is tangled on a high branch. The branch looks thin.', 'calm'),
      choices: [
        { label: '🧗 Climb the tree', tone: 'bad', run: () => say(s, [N('You grab the first branch — *CRACK* — it bends alarmingly. Nope. Not worth a broken arm. Let’s find a safer way.', 'worried')], () => kiteChoice(s)) },
        { label: `🧹 Borrow a long broom from ${words('{shopkeeper}')}`, tone: 'good', run: () => kiteSaved(s, 'broom') },
        { label: '🙋 Ask a tall grown-up to help', tone: 'good', run: () => kiteSaved(s, 'adult') },
        { label: 'Not now', run: () => (setStep(s, 'stuck'), endTwist(s, 'skipped')) },
      ],
    },
  ]);
}

function kiteSaved(s: GameStore, how: 'broom' | 'adult') {
  s.spendTime(5, 'Rescuing the kite');
  s.skill('problem', 2);
  s.skill('empathy', 1);
  remember(s, 'kite-rescue', 'kind', 'you rescued a little neighbour’s kite from a tree — safely');
  twistFx.dramatic('win');
  say(s, [N(how === 'broom' ? 'A careful poke… a wiggle… the kite floats down like a leaf!' : 'A tall jogger reaches up on tiptoes and plucks it free. Teamwork!', 'excited'), { speaker: 'Little neighbour Mia', text: 'YAAAY! Thank you thank you! You’re the BEST! Want to fly it with me?', mood: 'excited' }], () => endTwist(s, how));
}
