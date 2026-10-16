// Pure helpers for the in-game phone ("Reels"): procedural reel generation,
// screen-time accrual math, battery, lock/nudge states and read-only views of
// today's conduct counters. No store mutation here — the UI calls
// addScreenTime / spendTime with the numbers these functions produce.
import type { ConductKind, ConductState, GameState } from '../domain/types';
import { SCREEN_LIMITS } from './conduct';

// ---------- reel generation ----------

export type ReelKind = 'cat' | 'dance' | 'cook' | 'clickbait' | 'pet' | 'prank' | 'hack' | 'quote' | 'skate' | 'slime';

export const REEL_KINDS: ReelKind[] = ['cat', 'dance', 'cook', 'clickbait', 'pet', 'prank', 'hack', 'quote', 'skate', 'slime'];

const CAPTIONS: Record<ReelKind, string[]> = {
  cat: ['He looked me in the eyes and did it anyway 😐☕', 'Gravity check, day 47 🐈', 'Nobody: … My cat at 3 AM:', 'Rate the push 1–10 🐾'],
  dance: ['Learn this in 10 sec (you won\'t) 💃', 'POV: the song drops in the kitchen', 'Grandma tried the trend 🔥', 'Tag someone who can\'t dance 🕺'],
  cook: ['1-minute egg hack chefs HATE 🍳', 'Pancake flip: attempt 1 vs attempt 37', 'Cheap dinner under ₹50?? 👀', 'Why didn\'t anyone tell me this sooner'],
  clickbait: ['You WON\'T believe what happens next 😱', 'Wait for it… WAIT FOR IT…', '99% of people fail this test ❗', 'Doctors don\'t want you to know this'],
  pet: ['Tail goes brrrr 🐶', 'He heard the treat bag from 3 rooms away', 'Rating good boys: 14/10', 'This is your sign to hug your pet'],
  prank: ['Scaring my brother part 12 🎉', 'He didn\'t see it coming 💀', 'Prank went TOO far??', 'Wait till he turns around…'],
  hack: ['Fold a T-shirt in 2 seconds 👕', 'Life hack: you\'ve been doing it wrong', 'Save this for later 📌', 'Genius trick nobody uses'],
  quote: ['"Small steps every day." 🌅', '"Discipline is choosing what you want most."', '"Your future self is watching."', '"Done is better than perfect."'],
  skate: ['First kickflip after 200 tries 🛹', 'Send it or skip it?', 'Bro really cleared the cone 😳', 'Watch the landing'],
  slime: ['Most satisfying slice ever ✨', 'Kinetic sand ASMR (sound on) 🔊', 'Can\'t stop watching this', 'Oddly satisfying #49'],
};

const HANDLES: Record<ReelKind, string[]> = {
  cat: ['@catchaos_99', '@whiskers.daily', '@meowmeme'],
  dance: ['@moves.by.maya', '@dancegrandma', '@trendking'],
  cook: ['@5minchef', '@hostelkitchen', '@egg.hacks'],
  clickbait: ['@shock.vids', '@unbelievable.tv', '@viralzone'],
  pet: ['@goodboy.club', '@doggo.diaries', '@paws.up'],
  prank: ['@prank.bros', '@lol.house', '@gotcha.tv'],
  hack: ['@lifehacks.in', '@smartmoves', '@savethis'],
  quote: ['@daily.calm', '@mindset.minute', '@sunrise.words'],
  skate: ['@kickflip.kid', '@park.sessions', '@sk8.or.die'],
  slime: ['@satisfying.af', '@sandcutter', '@asmr.slices'],
};

const PALETTES: [string, string][] = [
  ['#2b1e4a', '#f2a541'],
  ['#14324a', '#3bb273'],
  ['#3a1730', '#ffd166'],
  ['#102a2c', '#e4572e'],
  ['#2a2550', '#7fd1ff'],
  ['#3b2416', '#f7a1c4'],
];

export interface Reel {
  id: string;
  index: number;
  kind: ReelKind;
  caption: string;
  handle: string;
  likes: number;
  comments: number;
  shares: number;
  bg: string;
  accent: string;
  /** animation speed multiplier so similar reels don't feel identical */
  speed: number;
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, list: T[]): T => list[Math.floor(r() * list.length) % list.length];

/**
 * The reel at `index` in a feed seeded by `seed`. Same inputs → same reel.
 * Consecutive reels never share a kind, so the feed always feels "fresh".
 */
export function makeReel(seed: number, index: number): Reel {
  const r = rng((seed * 2654435761 + index * 40503 + 17) >>> 0);
  const kind = kindAt(seed, index);
  const [bg, accent] = pick(r, PALETTES);
  // clickbait and pets "go viral" more often — that's the hook
  const viral = kind === 'clickbait' || kind === 'pet' || kind === 'cat' ? 4 : 1;
  const likes = Math.floor((800 + r() * 90000) * (r() < 0.25 ? viral * 6 : 1));
  return {
    id: `r${seed}-${index}`,
    index,
    kind,
    caption: pick(r, CAPTIONS[kind]),
    handle: pick(r, HANDLES[kind]),
    likes,
    comments: Math.floor(likes * (0.01 + r() * 0.05)),
    shares: Math.floor(likes * (0.005 + r() * 0.03)),
    bg,
    accent,
    speed: 0.8 + r() * 0.5,
  };
}

/** Shuffled "deck" of every kind for block `b` (Fisher–Yates with a seeded rng). */
function rawDeck(seed: number, b: number): ReelKind[] {
  const r = rng((seed * 7919 + b * 104729 + 3) >>> 0);
  const d = [...REEL_KINDS];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Kinds are dealt from shuffled decks, so every kind shows up once per 10 reels and never twice in a row. */
export function kindAt(seed: number, index: number): ReelKind {
  const n = REEL_KINDS.length;
  const b = Math.floor(index / n);
  const d = rawDeck(seed, b);
  // the last card of the previous deck is never moved, so this check is non-recursive
  if (b > 0 && d[0] === rawDeck(seed, b - 1)[n - 1]) [d[0], d[1]] = [d[1], d[0]];
  return d[index % n];
}

/** A page of the feed. */
export function makeFeed(seed: number, from: number, count: number): Reel[] {
  return Array.from({ length: count }, (_, i) => makeReel(seed, from + i));
}

/** Like/comment counters "ticking up" while a reel plays (deterministic per second watched). */
export function tickedCount(base: number, secondsWatched: number, perSecond: number): number {
  return base + Math.floor(Math.max(0, secondsWatched) * perSecond);
}

/** 12400 → "12.4K", 1250000 → "1.3M". */
export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.floor(n));
}

// ---------- time accrual ----------

export type PhoneApp = 'home' | 'reels' | 'messages' | 'calc' | 'camera' | 'locked';

/** Game minutes that pass per real second on each phone screen. Scrolling is the time sink. */
export const PHONE_RATE: Record<PhoneApp, number> = {
  reels: 2,
  home: 1,
  messages: 1,
  calc: 0.5,
  camera: 1,
  locked: 0,
};

/**
 * Accumulate real time into whole game minutes. Returns the whole minutes to apply now
 * and the fractional remainder to carry into the next call.
 */
export function accrue(carry: number, dtMs: number, perSecond: number): { minutes: number; carry: number } {
  const total = carry + (Math.max(0, dtMs) / 1000) * Math.max(0, perSecond);
  const minutes = Math.floor(total + 1e-9);
  return { minutes, carry: total - minutes };
}

// ---------- screen time states ----------

export type ScreenTier = 'none' | 'ok' | 'nudge' | 'scold' | 'confiscate';

export function screenTier(minutes: number): ScreenTier {
  if (minutes <= 0) return 'none';
  if (minutes >= SCREEN_LIMITS.confiscate) return 'confiscate';
  if (minutes >= SCREEN_LIMITS.scold) return 'scold';
  if (minutes >= SCREEN_LIMITS.nudge) return 'nudge';
  return 'ok';
}

/** Did adding screen time just cross `limit`? */
export function crossed(before: number, after: number, limit: number): boolean {
  return before < limit && after >= limit;
}

/** Phone battery from today's screen time — drains as you scroll, never quite hits 0. */
export function batteryFor(screenMinutes: number): number {
  return Math.max(4, Math.round(100 - screenMinutes * 0.8));
}

const EMPTY: Omit<ConductState, 'day'> = { screenMinutes: 0, fights: 0, tension: 0, roadWarnings: 0, napMinutes: 0, log: [], alerts: [] };

/** Today's conduct counters without mutating state (zeros when nothing happened yet today). */
export function todayConduct(state: Pick<GameState, 'clock' | 'conduct'>): ConductState {
  const c = state.conduct;
  if (!c) return { day: state.clock.day, ...EMPTY };
  if (c.day !== state.clock.day) return { ...EMPTY, day: state.clock.day, log: c.log, alerts: c.alerts };
  return c;
}

/** Is the phone confiscated right now, and until when? (read-only twin of phoneAllowed) */
export function phoneLock(state: Pick<GameState, 'clock' | 'conduct'>): { locked: boolean; until: number | null } {
  const c = todayConduct(state);
  const until = c.phoneTakenUntil ?? null;
  return until !== null && state.clock.minutes < until ? { locked: true, until } : { locked: false, until: null };
}

export function unreadAlerts(state: Pick<GameState, 'conduct'>): number {
  return state.conduct?.alerts.filter((a) => !a.read).length ?? 0;
}

// ---------- presentation helpers ----------

export const CONDUCT_ICON: Record<ConductKind, string> = {
  screen: '📱',
  fight: '🥊',
  road: '🚸',
  sleep: '😴',
  respect: '🙏',
  safety: '⚠️',
};

export const CONDUCT_LABEL: Record<ConductKind, string> = {
  screen: 'Screen time',
  fight: 'Sibling fight',
  road: 'Road safety',
  sleep: 'Sleep',
  respect: 'Respect',
  safety: 'Safety',
};

export const SEVERITY_TONE = { 1: 'warn', 2: 'bad', 3: 'bad' } as const;
export const SEVERITY_LABEL = { 1: 'Reminder', 2: 'Scolding', 3: 'Consequence' } as const;

/** Reflection chips that fit what happened today. */
export function conductReflections(c: Pick<ConductState, 'screenMinutes' | 'fights' | 'roadWarnings' | 'napMinutes'>): string[] {
  const out: string[] = [];
  if (c.screenMinutes >= SCREEN_LIMITS.nudge) out.push("I'll put my phone down earlier");
  if (c.fights > 0) out.push("I'll use words, not hands");
  if (c.roadWarnings > 0) out.push("I'll cross at the zebra");
  if (c.napMinutes >= 60) out.push("I'll keep naps short");
  return out;
}

/** Was today a calm, responsible day? (for a friendly "nice!" message) */
export function cleanDay(c: Pick<ConductState, 'screenMinutes' | 'fights' | 'roadWarnings'>): boolean {
  return c.screenMinutes < SCREEN_LIMITS.nudge && c.fights === 0 && c.roadWarnings === 0;
}
