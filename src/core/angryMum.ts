// ANGRY MUM MODE: the rare, over-the-top, comedic "you are in SO much trouble" moment.
// Works for whichever guardian is home (mother / father / guardian / grandparent).
//
// Everything here is NON-PHYSICAL by design: a transformation (red face, steam, aura),
// the full-name yell, the legendary "1… 2…" countdown, a comedy chase / hide-and-seek,
// an escort to the sofa (walking side by side), THE LECTURE, fair consequences
// (phone, TV, chores, early night), a cool-down and a making-up moment.
//
// Pure rules (gate, triggers, choices, consequences, detection meter) are exported for
// tests. The flow talks to the store and to an `AngryStage` that HomeScene registers
// (setAngryStage) to play the visuals. With no stage (tests, away from home) the show
// does not start and callers fall back to their usual scolding.
import type { ConductKind, FamilyMember, Memory, Role } from '../domain/types';
import { region, words } from '../domain/region';
import { scheduleFor } from '../domain/world';
import { availableGuardian, conduct, recordConduct } from './conduct';
import type { DialogueChoice, DialogueLine, GameStore } from './store';
import { twistBlockers } from './twists';

// ---------------------------------------------------------------- tuning

export const ANGRY = {
  /** at most this many Angry Mum moments per game day */
  maxPerDay: 2,
  /** game minutes between two of them */
  cooldownMin: 180,
  /** real ms to answer a parent's call */
  callWindowMs: 20000,
  /** real ms for the second (louder) call */
  call2WindowMs: 12000,
  /** px: close enough to count as "came when called" */
  callNearPx: 34,
  /** px: walking this much further away during a call escalates */
  walkAwayPx: 96,
  /** a parent calls at most this many times per day, this many game minutes apart */
  callsPerDay: 3,
  callGapMin: 75,
  /** real ms of the chase before she runs out of breath */
  chaseMaxMs: 25000,
  /** real ms she searches for a hidden player before giving up */
  searchGiveUpMs: 12000,
  /** game minutes until she comes back after you escaped */
  comeBackMin: 25,
  /** game minutes until she offers to make up */
  makeUpMin: 20,
  /** chase speed relative to the player's walking speed */
  speedMul: 1.12,
  /** real ms between countdown numbers */
  countMs: 2600,
  /** game minutes the lecture "lasts" (time-lapse) */
  lectureMin: 40,
} as const;

export type AngryTrigger = 'fights' | 'tension' | 'ignored-call' | 'snooze' | 'phone' | 'tv' | 'lie' | 'mess' | 'demo';
export type AngryChoice = 'apologise' | 'explain' | 'talkback' | 'run';
export type AngryPath = 'apology' | 'explained' | 'lecture' | 'talkback' | 'caught' | 'came-back';
export type Phase = 'idle' | 'transform' | 'countdown' | 'chase' | 'hiding-wait' | 'lecture' | 'cool';

export interface TriggerInfo {
  kind: ConductKind;
  /** why she is angry — always said out loud ({p} = player, {sib} = sibling) */
  why: string;
  /** dashboard alert text */
  alert: string;
  /** was the player (normally) at fault? "Explain calmly" only works when not */
  atFault: boolean;
}

export const TRIGGERS: Record<AngryTrigger, TriggerInfo> = {
  fights: { kind: 'fight', why: 'THREE fights with {sib} in ONE day?!', alert: 'a third sibling fight today', atFault: true },
  tension: { kind: 'fight', why: 'I can hear you two screaming from the other end of the house!', alert: 'non-stop shouting with their sibling', atFault: true },
  'ignored-call': { kind: 'respect', why: 'I called you TWICE and you ignored me!', alert: 'ignoring a parent calling them', atFault: true },
  snooze: { kind: 'sleep', why: 'THREE snoozes! The bus will not wait for you!', alert: 'snoozing the alarm three times', atFault: true },
  phone: { kind: 'screen', why: 'That phone is CONFISCATED — and you are using it anyway?!', alert: 'using the phone while it was confiscated', atFault: true },
  tv: { kind: 'screen', why: 'I said NO TV today. And what do I see? The TV!', alert: 'switching the TV on during a TV ban', atFault: true },
  lie: { kind: 'respect', why: 'You told a fib — and you thought I would not find out?', alert: 'not telling the truth', atFault: true },
  mess: { kind: 'safety', why: 'Running inside! Look at this MESS!', alert: 'running around inside and making a mess', atFault: true },
  demo: { kind: 'respect', why: 'Do you know what time it is?! Do you know what you DID?!', alert: 'a (demo) Angry Mum moment', atFault: true },
};

// ---------------------------------------------------------------- pure rules

export interface AngryGate {
  day: number;
  count: number;
  lastAt: number | null;
}

/** Rare enough to stay special: max per day + cooldown. */
export function canGetAngry(g: AngryGate | undefined, day: number, nowMin: number): boolean {
  if (!g || g.day !== day) return true;
  if (g.count >= ANGRY.maxPerDay) return false;
  return g.lastAt === null || nowMin - g.lastAt >= ANGRY.cooldownMin;
}

export function bumpGate(g: AngryGate | undefined, day: number, nowMin: number): AngryGate {
  const base = g && g.day === day ? g : { day, count: 0, lastAt: null };
  return { day, count: base.count + 1, lastAt: nowMin };
}

export interface TriggerFacts {
  fightsToday: number;
  tension: number;
  snoozes: number;
  ignoredCalls: number;
  phoneAttempts: number;
  tvAttempts: number;
  liesToday: number;
  messes: number;
}

/** Which trigger (if any) the facts add up to. First attempts only get a warning. */
export function triggerFrom(f: Partial<TriggerFacts>): AngryTrigger | null {
  if ((f.fightsToday ?? 0) >= 3) return 'fights';
  if ((f.tension ?? 0) >= 100) return 'tension';
  if ((f.snoozes ?? 0) >= 3) return 'snooze';
  if ((f.ignoredCalls ?? 0) >= 1) return 'ignored-call';
  if ((f.phoneAttempts ?? 0) >= 2) return 'phone';
  if ((f.tvAttempts ?? 0) >= 2) return 'tv';
  if ((f.liesToday ?? 0) >= 1) return 'lie';
  if ((f.messes ?? 0) >= 3) return 'mess';
  return null;
}

export interface ChoiceResult {
  /** what happens next */
  next: 'deflate' | 'calm' | 'lecture' | 'escalate' | 'chase';
  /** anger level afterwards (0 calm … 3 volcanic) */
  anger: number;
  /** the path used to pick consequences when the scene resolves right away */
  path?: AngryPath;
}

/** The four countdown choices. A sincere apology is always the best move. */
export function choiceOutcome(choice: AngryChoice, atFault: boolean, anger: number): ChoiceResult {
  switch (choice) {
    case 'apologise':
      return { next: 'deflate', anger: 0, path: 'apology' };
    case 'explain':
      return atFault ? { next: 'lecture', anger: Math.max(1, anger), path: 'lecture' } : { next: 'calm', anger: 0, path: 'explained' };
    case 'talkback':
      return anger >= 2 ? { next: 'lecture', anger: 3, path: 'talkback' } : { next: 'escalate', anger: anger + 1 };
    case 'run':
      return { next: 'chase', anger: Math.min(3, anger + 1) };
  }
}

export type ConsequenceKind = 'phone' | 'tv' | 'chore' | 'early-bed' | 'none';
export interface AngryConsequence {
  kind: ConsequenceKind;
  label: string;
  minutes?: number;
  chore?: 'dishes' | 'clean-room' | 'fold-laundry';
}
/** Every consequence Angry Mum may hand out. Nothing physical — ever. */
export const ALLOWED_CONSEQUENCES: readonly ConsequenceKind[] = ['phone', 'tv', 'chore', 'early-bed', 'none'];
const PHYSICAL = /\b(hit|slap|spank|beat|smack|pinch|ear|slipper|belt|chappal|cane|whack|punch|kick)\b/i;
/** Guard used by tests and the flow: a consequence is non-physical and from the allowed list. */
export const isNonPhysical = (c: AngryConsequence) => ALLOWED_CONSEQUENCES.includes(c.kind) && !PHYSICAL.test(c.label);

const CHORES: { chore: NonNullable<AngryConsequence['chore']>; label: string }[] = [
  { chore: 'dishes', label: 'washing ALL the dishes tonight' },
  { chore: 'clean-room', label: 'cleaning your room until it sparkles' },
  { chore: 'fold-laundry', label: 'folding the whole laundry basket' },
];

function relevant(trigger: AngryTrigger, seed: number): AngryConsequence {
  switch (trigger) {
    case 'phone':
    case 'lie':
      return { kind: 'phone', label: 'phone confiscated', minutes: 120 };
    case 'tv':
      return { kind: 'tv', label: 'no TV for the rest of the day' };
    case 'snooze':
      return { kind: 'early-bed', label: 'lights out early tonight' };
    case 'mess':
      return { kind: 'chore', chore: 'clean-room', label: CHORES[1].label };
    default: {
      const c = CHORES[((seed % CHORES.length) + CHORES.length) % CHORES.length];
      return { kind: 'chore', chore: c.chore, label: c.label };
    }
  }
}

export interface ConsequencePlan {
  list: AngryConsequence[];
  /** trust change with the guardian */
  trust: number;
  severity: 1 | 2 | 3;
}

/** Fair and proportional: owning up keeps most trust; running makes it worse. */
export function pickConsequences(path: AngryPath, trigger: AngryTrigger, seed = 0): ConsequencePlan {
  const rel = relevant(trigger, seed);
  const chore = (): AngryConsequence => {
    const c = CHORES[((seed + 1) % CHORES.length + CHORES.length) % CHORES.length];
    return { kind: 'chore', chore: c.chore, label: c.label };
  };
  const uniq = (xs: AngryConsequence[]) => xs.filter((c, i) => xs.findIndex((d) => d.kind === c.kind) === i);
  switch (path) {
    case 'explained':
      return { list: [], trust: 1, severity: 1 };
    case 'apology':
      return { list: [rel.kind === 'phone' ? { ...rel, minutes: 60, label: 'phone confiscated for an hour' } : rel], trust: -1, severity: 2 };
    case 'lecture':
      return { list: [rel], trust: -3, severity: 2 };
    case 'talkback':
      return { list: uniq([rel, chore()]), trust: -5, severity: 3 };
    case 'came-back':
    case 'caught':
      return { list: uniq([rel, { kind: 'phone', label: 'phone confiscated', minutes: 120 }, { kind: 'tv', label: 'no TV for the rest of the day' }, chore()]), trust: -6, severity: 3 };
  }
}

export interface DetectInput {
  /** is the hidden player moving (pressing keys)? */
  moving: boolean;
  /** px between the searcher and the hiding spot */
  dist: number;
  /** is she searching the room the player hides in? */
  sameRoom: boolean;
  dtMs: number;
}
export const DETECT = { found: 100, stillDecay: 9, awayDecay: 14, moveGain: 55, nearGain: 7, nearPx: 26 } as const;

/** Stealth meter (0..100). Holding still lowers it; wriggling while she's close fills it fast. */
export function detectionStep(meter: number, i: DetectInput): number {
  const s = Math.max(0, i.dtMs) / 1000;
  let m = meter;
  if (!i.sameRoom) m -= DETECT.awayDecay * s;
  else if (i.moving) m += DETECT.moveGain * s * (1 + Math.max(0, 80 - i.dist) / 80);
  else if (i.dist < DETECT.nearPx) m += DETECT.nearGain * s;
  else m -= DETECT.stillDecay * s;
  return Math.max(0, Math.min(DETECT.found, m));
}
export const isFound = (meter: number) => meter >= DETECT.found;
export const searchOver = (elapsedMs: number) => elapsedMs >= ANGRY.searchGiveUpMs;
export const chaseSpeed = (playerSpeed: number) => playerSpeed * ANGRY.speedMul;

/** "{FIRST} {FAMILY}!!!" — or the name thrice with an echo when there's no family name. */
export function fullNameYell(name: string, familyName?: string): { text: string; echo: boolean } {
  const n = (name || 'Alex').trim().toUpperCase();
  const f = (familyName ?? '').trim();
  if (f && !/^(the\s+)?family$/i.test(f) && !n.includes(f.toUpperCase())) return { text: `${n} ${f.toUpperCase()}!!!`, echo: true };
  return { text: `${n}… ${n}… ${n}!!!`, echo: true };
}

export function guardianTitle(role: Role): string {
  switch (role) {
    case 'mother':
      return region().id === 'us' ? 'MOM' : 'MUM';
    case 'father':
      return 'DAD';
    case 'grandparent':
      return words('{grandTitle}').toUpperCase();
    default:
      return 'GUARDIAN';
  }
}
export const modeTitle = (role: Role) => `ANGRY ${guardianTitle(role)} MODE`;

// ---------------------------------------------------------------- scripts

const pick = <T>(xs: readonly T[], n: number): T => xs[((Math.floor(n) % xs.length) + xs.length) % xs.length];

export const LECTURES: readonly string[][] = [
  ['Sit. Down.', 'Do you know how many times I have told you…', '…and when I was your age, I walked to school. Uphill. BOTH ways…', '…and do you think money grows on trees? Does it? DOES IT?…', '…and your cousin never does this. NEVER…', '…are you even listening to me?…', '…I am not angry, I am DISAPPOINTED. Okay, I am also angry…'],
  ['Look at me when I am talking to you.', 'This house is not a hotel!', '…and the dishes do not wash themselves, by the way…', '…when I was your age we had ONE TV and it was black and white…', '…I carried you for nine months and THIS is the thanks?…', '…and don\'t roll your eyes at me, I can SEE you rolling them…', '…where was I? Oh yes. RESPONSIBILITY…'],
  ['We need to have a little talk. A long little talk.', '…you think I was born yesterday?…', '…the neighbours must think we are a circus…', '…and if your friends jumped off a bridge, would you jump too?…', '…when I was your age I was already cooking {dinner} for the whole family…', '…I am saying this because I love you, okay? BECAUSE. I. LOVE. YOU…', '…and stop looking at the clock!…'],
];
export const CHASE_LINES = ["Don't you DARE run from me!", 'Come back here THIS INSTANT!', 'I am faster than I look!', "Walking away? WALKING AWAY?!", 'I carried you for NINE MONTHS!', 'You cannot outrun a {mum}!', 'Every step you take is another dish to wash!'];
export const SEARCH_LINES = ["I know you're in here…", 'Come out, come out, wherever you are…', 'I can hear you breathing…', 'Is that a sock I see?', 'I have ALL day, {p}.', 'Hmm… under the bed? Too easy…'];
export const NEAR_LINES = ['Was that a giggle?', 'Hmmmm… *sniff sniff*', 'I can FEEL you hiding.'];
export const GIVE_UP_LINES = ['Fine. You can hide, but {dinner} is at seven.', 'Okay. Hide. I will be waiting. I have ALL the time in the world.', 'You have to come out eventually. The Wi-Fi password changes in ten minutes.'];
export const CAUGHT_LINES = ['GOTCHA. Sofa. Now. Walk with me.', 'Nice try, Olympic champion. Come. Sit.', 'Out of breath? Good. Now we TALK. Walk with me.'];
export const FOUND_LINES = ['FOUND YOU. Under there? Really?', 'Aha! Did you think I would not check the wardrobe?', 'Peekaboo. Out. NOW.'];
export const COME_BACK_LINES = ['Oh, there you are. Did you think I forgot? I never forget. Sofa.', 'Hello again. Dinner is ready — and so is your lecture. Walk with me.'];
export const MAKE_UP_LINES = [
  'Hey… I brought you a snack. I was really angry earlier. But I love you. Always. Even when I am a volcano.',
  'Come here. I got loud before, and I am sorry about the shouting. I love you, {endearment} — that never changes.',
  'Peace offering? (a plate of your favourite biscuits) I was angry, but I love you. Let\'s start fresh.',
];
export const LESSONS = [
  'Running away makes it worse — owning up makes it better.',
  'Saying "I\'m sorry, you\'re right" takes courage — and it cools everyone down.',
  'Everyone gets angry. What matters is how you repair it afterwards.',
];

function fill(s: GameStore, text: string, g?: FamilyMember): string {
  const sib = s.memberByRole('younger-sibling', 'older-sibling');
  return words(text)
    .replace(/\{p\}/g, s.player.name)
    .replace(/\{sib\}/g, sib?.name ?? 'your sibling')
    .replace(/\{mum\}/g, g ? guardianTitle(g.role).charAt(0) + guardianTitle(g.role).slice(1).toLowerCase() : 'parent');
}

// ---------------------------------------------------------------- stage (visuals) interface

export interface ChaseHooks {
  /** a line for her shout bubble */
  shout(kind: 'chase' | 'search' | 'near' | 'lost'): string;
  caught(): void;
  /** she gave up (hid well / ran out of breath) */
  escaped(): void;
}

export interface AngryStage {
  /** can the scene play the show with this member right now? */
  ready(memberId: string): boolean;
  transform(memberId: string, title: string, done: () => void): void;
  yell(text: string, echo: boolean): void;
  count(label: string): void;
  deflate(memberId: string): void;
  angrier(memberId: string): void;
  chase(memberId: string, hooks: ChaseHooks): void;
  escort(memberId: string, done: () => void): void;
  lecture(memberId: string, on: boolean): void;
  calm(memberId: string): void;
  /** walk over to the player (come back / snack) */
  approach(memberId: string, done: () => void): void;
  /** call bubble above her; null clears */
  bubble(memberId: string, text: string | null, loud?: boolean): void;
  /** distance from the player to her (null when not in this scene) */
  distanceTo(memberId: string): number | null;
}

let stage: AngryStage | null = null;
export function setAngryStage(st: AngryStage | null) {
  stage = st;
}

// ---------------------------------------------------------------- runtime

interface CallState {
  memberId: string;
  level: 1 | 2;
  ms: number;
  startDist: number | null;
}
interface Runtime {
  phase: Phase;
  memberId: string | null;
  trigger: AngryTrigger;
  atFault: boolean;
  why: string;
  anger: number;
  seed: number;
  countTimer: ReturnType<typeof setInterval> | null;
  comeBackAt: number | null;
  makeUpAt: number | null;
  after?: () => void;
  call: CallState | null;
  callCheckMs: number;
}
const RT = new WeakMap<GameStore, Runtime>();
function rt(s: GameStore): Runtime {
  let r = RT.get(s);
  if (!r) RT.set(s, (r = { phase: 'idle', memberId: null, trigger: 'demo', atFault: true, why: '', anger: 1, seed: 0, countTimer: null, comeBackAt: null, makeUpAt: null, call: null, callCheckMs: 0 }));
  return r;
}
export const angryPhase = (s: GameStore): Phase => rt(s).phase;
/** The show is on (transformation → lecture). Home actions should wait. */
export const angryActive = (s: GameStore) => !['idle', 'cool'].includes(rt(s).phase);
/** From the trigger until the cool-down (making up) ends — used to block plot twists. */
export const angryMumActive = (s: GameStore) => rt(s).phase !== 'idle';
twistBlockers.push((s) => angryMumActive(s));
export const angryMember = (s: GameStore) => (rt(s).memberId ? s.member(rt(s).memberId!) : undefined);
export function callInfo(s: GameStore): { memberId: string; level: 1 | 2; leftMs: number; windowMs: number } | null {
  const c = rt(s).call;
  if (!c) return null;
  const windowMs = c.level === 1 ? ANGRY.callWindowMs : ANGRY.call2WindowMs;
  return { memberId: c.memberId, level: c.level, leftMs: Math.max(0, windowMs - c.ms), windowMs };
}

const W = (s: GameStore) => s.state.world;
const now = (s: GameStore) => s.state.clock.minutes;
const today = (s: GameStore) => s.state.clock.day;
const isHome = (m: FamilyMember | undefined, s: GameStore) => !!m && scheduleFor(m.role, now(s)).spot !== 'away';
const line = (g: FamilyMember, text: string, mood?: string, choices?: DialogueChoice[]): DialogueLine => ({ speaker: g.name, portrait: g.id, text, mood, choices });

function gateOf(s: GameStore): AngryGate | undefined {
  const w = W(s);
  if (w['angry.day'] === undefined) return undefined;
  return { day: Number(w['angry.day']), count: Number(w['angry.count'] ?? 0), lastAt: w['angry.lastAt'] === undefined ? null : Number(w['angry.lastAt']) };
}
function saveGate(s: GameStore, g: AngryGate) {
  W(s)['angry.day'] = g.day;
  W(s)['angry.count'] = g.count;
  if (g.lastAt === null) delete W(s)['angry.lastAt'];
  else W(s)['angry.lastAt'] = g.lastAt;
}

/** Bump a per-day counter in world state; returns the new value. */
export function bumpCounter(s: GameStore, key: string): number {
  const k = `angry.${key}.${today(s)}`;
  const v = Number(W(s)[k] ?? 0) + 1;
  W(s)[k] = v;
  return v;
}
export const counter = (s: GameStore, key: string) => Number(W(s)[`angry.${key}.${today(s)}`] ?? 0);

function guardianAtHome(s: GameStore): FamilyMember | undefined {
  const g = availableGuardian(s);
  return isHome(g, s) ? g : undefined;
}

export interface TriggerOpts {
  atFault?: boolean;
  /** skip the daily limit / cooldown (dev demo) */
  force?: boolean;
  /** run when everything (incl. consequences) is over */
  after?: () => void;
}

/**
 * Try to start Angry Mum Mode. Returns false (and does nothing) when it can't happen
 * right now: no stage, nobody home, already happened too often today, or already on.
 */
export function triggerAngry(s: GameStore, trigger: AngryTrigger, opts: TriggerOpts = {}): boolean {
  const r = rt(s);
  if (r.phase !== 'idle' && r.phase !== 'cool') return false;
  if (!opts.force && !canGetAngry(gateOf(s), today(s), now(s))) return false;
  const g = guardianAtHome(s);
  if (!g || !stage || !stage.ready(g.id)) return false;
  saveGate(s, bumpGate(gateOf(s), today(s), now(s)));
  clearCall(s);
  const info = TRIGGERS[trigger];
  Object.assign(r, {
    phase: 'transform' as Phase,
    memberId: g.id,
    trigger,
    atFault: opts.atFault ?? info.atFault,
    why: fill(s, info.why, g),
    anger: 1,
    seed: today(s) * 7 + Math.floor(now(s)),
    comeBackAt: null,
    makeUpAt: null,
    after: opts.after,
  });
  if (s.ui.dialogue) s.closeDialogue();
  s.toast(`🌋 ${modeTitle(g.role)}!`, 'bad');
  stage.transform(g.id, modeTitle(g.role), () => yellPhase(s));
  return true;
}

/** Dev/demo: force the show right now (window.__lq is the store). */
export function demoAngry(s: GameStore, trigger: AngryTrigger = 'demo'): boolean {
  return triggerAngry(s, trigger, { force: true });
}

function yellPhase(s: GameStore) {
  const r = rt(s);
  const g = angryMember(s);
  if (!g || !stage) return abort(s);
  const fam = s.state.profile.familyName;
  const y = fullNameYell(s.player.name, fam);
  stage.yell(y.text, y.echo);
  s.say([line(g, `${y.text} ${r.why}`, 'angry')], () => countdown(s, false));
}

function stopCount(r: Runtime) {
  if (r.countTimer) clearInterval(r.countTimer);
  r.countTimer = null;
}

const COUNT_AFTER_ONE = ['2…', '2 AND A HALF…', '2 AND THREE QUARTERS…', '2 AND A TINY BIT…', '2.99…'];

function countdown(s: GameStore, second: boolean) {
  const r = rt(s);
  const g = angryMember(s);
  if (!g || !stage) return abort(s);
  r.phase = 'countdown';
  stopCount(r);
  stage.count(second ? '2 AND A HALF…' : '1…');
  let i = second ? 2 : 0;
  r.countTimer = setInterval(() => {
    if (r.phase !== 'countdown') return stopCount(r);
    stage?.count(COUNT_AFTER_ONE[Math.min(i++, COUNT_AFTER_ONE.length - 1)]);
  }, ANGRY.countMs);
  const choices: DialogueChoice[] = [
    { label: '🙏 "I\'m sorry, you\'re right."', tone: 'good', hint: 'Owning up is the bravest (and best) move', run: () => onChoice(s, 'apologise') },
  ];
  if (!second) choices.push({ label: '🗣️ Explain calmly what happened', tone: 'neutral', hint: r.atFault ? undefined : 'It really was not your fault', run: () => onChoice(s, 'explain') });
  choices.push({ label: second ? '😤 Talk back AGAIN' : '😤 Talk back', tone: 'bad', run: () => onChoice(s, 'talkback') });
  choices.push({ label: '🏃 RUN!', tone: 'bad', hint: 'She is faster than she looks…', run: () => onChoice(s, 'run') });
  s.say([line(g, second ? 'Two and a HALF… I am NOT going to say three…' : 'One… (Do NOT make me get to three.)', 'angry', choices)]);
}

function onChoice(s: GameStore, choice: AngryChoice) {
  const r = rt(s);
  const g = angryMember(s);
  stopCount(r);
  if (!g || !stage) return abort(s);
  stage.count('');
  const out = choiceOutcome(choice, r.atFault, r.anger);
  r.anger = out.anger;
  switch (out.next) {
    case 'deflate':
      stage.deflate(g.id);
      s.skill('communication', 2);
      s.skill('empathy', 1);
      return s.say(
        [
          line(g, '…' + pick(['Hssssss… (the steam stops) …Okay.', 'Phew… (the red drains from her face) …Thank you.', '(a long sigh, like a balloon letting go)'], r.seed), 'calm'),
          line(g, 'Thank you for owning up. That takes guts — and it makes this SO much easier.', 'warm'),
          line(g, fill(s, pick(['Next time just come and talk to me first, okay?', "We all mess up. What matters is what we do next.", 'You are a good kid. Let\'s fix this together.'], r.seed + 1), g), 'warm'),
        ],
        () => finish(s, 'apology'),
      );
    case 'calm':
      stage.deflate(g.id);
      s.skill('communication', 3);
      return s.say(
        [
          line(s.player, r.trigger === 'fights' || r.trigger === 'tension' ? `${fill(s, '{sib}')} started it, and I tried to walk away. I should have come to get you instead of shouting back.` : 'Can I explain? It is not what it looks like — here is what really happened…'),
          line(g, 'Oh… (the steam sputters out) …I did not know that. Thank you for telling me calmly instead of yelling.', 'calm'),
          line(g, 'Staying calm and explaining — that is exactly how grown-ups sort things out.', 'proud'),
        ],
        () => finish(s, 'explained'),
      );
    case 'escalate':
      stage.angrier(g.id);
      return s.say([line(g, pick(['EXCUSE ME?! Did you just talk back to ME?!', 'Oh, we are doing ATTITUDE now? WE ARE DOING ATTITUDE?!', 'Say that again. I DARE you.'], r.seed), 'angry')], () => countdown(s, true));
    case 'lecture':
      if (choice === 'talkback') stage.angrier(g.id);
      else stage.deflate(g.id);
      return s.say(
        [line(g, choice === 'talkback' ? 'That. Is. IT. Sofa. NOW.' : 'Explaining is good. But this one WAS you, and you know it. Sofa. Let\'s talk.', choice === 'talkback' ? 'angry' : 'calm')],
        () => escortThen(g, () => lecture(s, out.path ?? 'lecture')),
      );
    case 'chase':
      return startChase(s);
  }
}

const escortThen = (g: FamilyMember, fn: () => void) => (stage ? stage.escort(g.id, fn) : fn());

function startChase(s: GameStore) {
  const r = rt(s);
  const g = angryMember(s);
  if (!g || !stage) return abort(s);
  r.phase = 'chase';
  recordConduct(s, { kind: 'respect', severity: 2, by: g.id, text: `Ran away from ${g.name} instead of talking`, lesson: LESSONS[0] });
  let n = r.seed;
  stage.chase(g.id, {
    shout: (kind) => {
      n++;
      const list = kind === 'chase' ? CHASE_LINES : kind === 'search' ? SEARCH_LINES : kind === 'near' ? NEAR_LINES : FOUND_LINES;
      return fill(s, pick(list, n), g);
    },
    caught: () => {
      r.phase = 'lecture';
      s.say([line(g, fill(s, pick(CAUGHT_LINES, n), g), 'angry')], () => escortThen(g, () => lecture(s, 'caught')));
    },
    escaped: () => {
      r.phase = 'hiding-wait';
      r.comeBackAt = now(s) + ANGRY.comeBackMin;
      stage?.calm(g.id);
      s.say([line(g, fill(s, pick(GIVE_UP_LINES, n), g), 'angry'), { speaker: '', text: `${g.name} stomps off… for now. (She always wins in the end.)` }]);
    },
  });
}

/** The epic lecture: fast-scrolling time-lapse, then the consequences. */
function lecture(s: GameStore, path: AngryPath) {
  const r = rt(s);
  const g = angryMember(s);
  if (!g) return abort(s);
  r.phase = 'lecture';
  stage?.lecture(g.id, true);
  const script = pick(LECTURES, r.seed).map((t) => line(g, fill(s, t, g), 'angry'));
  const steps = script.length;
  let spent = 0;
  s.say(script, () => {
    stage?.lecture(g.id, false);
    if (spent < ANGRY.lectureMin) s.spendTime(ANGRY.lectureMin - spent); // the lecture lasted… a while
    spent = ANGRY.lectureMin;
    finish(s, path);
  });
  // fast-scroll: the clock spins and the lines fly by
  let i = 0;
  const first = new Set(script);
  const tick = () => {
    const d = s.ui.dialogue;
    if (!d || !first.has(d[0])) return;
    s.spendTime(ANGRY.lectureMin / steps);
    spent += ANGRY.lectureMin / steps;
    if (++i < steps) {
      s.advanceDialogue();
      setTimeout(tick, 1150);
    }
  };
  setTimeout(tick, 1400);
}

function applyConsequences(s: GameStore, plan: ConsequencePlan, g: FamilyMember) {
  const c = conduct(s);
  for (const k of plan.list) {
    if (!isNonPhysical(k)) continue; // never — belt and braces
    if (k.kind === 'phone') c.phoneTakenUntil = Math.max(c.phoneTakenUntil ?? 0, now(s) + (k.minutes ?? 120));
    if (k.kind === 'tv') c.tvBanned = true;
    if (k.kind === 'early-bed') W(s)['angry.earlyBed'] = today(s);
    if (k.kind === 'chore') {
      s.state.stats.energy = Math.max(0, s.state.stats.energy - 8);
      s.spendTime(15, k.chore === 'dishes' ? 'Washing the dishes (consequence)' : k.chore === 'clean-room' ? 'Cleaning your room (consequence)' : 'Folding laundry (consequence)');
    }
  }
  if (plan.trust) s.trust(g.id, plan.trust);
}

export function consequenceLines(plan: ConsequencePlan): string {
  if (!plan.list.length) return 'No consequence this time.';
  const names = plan.list.map((c) => c.label);
  return `So: ${names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0]}.`;
}

function remember(s: GameStore, m: Omit<Memory, 'day'>) {
  if (!s.state.memories) s.state.memories = [];
  if (s.state.memories.some((x) => x.id === m.id)) return;
  s.state.memories.unshift({ ...m, day: today(s) });
  s.state.memories = s.state.memories.slice(0, 40);
}

function finish(s: GameStore, path: AngryPath) {
  const r = rt(s);
  const g = angryMember(s);
  stopCount(r);
  if (!g) return abort(s);
  const info = TRIGGERS[r.trigger];
  const plan = pickConsequences(path, r.trigger, r.seed);
  applyConsequences(s, plan, g);
  const how = { apology: 'apologised sincerely', explained: 'explained calmly (it was not their fault)', lecture: 'got a lecture', talkback: 'talked back and got a lecture', caught: 'ran away, got caught and got a lecture', 'came-back': 'hid, but got the lecture later anyway' }[path];
  recordConduct(
    s,
    { kind: info.kind, severity: plan.severity, by: g.id, text: `${modeTitle(g.role).toLowerCase()}: ${info.alert} — ${how}`, lesson: path === 'apology' || path === 'explained' ? LESSONS[1] : LESSONS[0] },
    `${s.player.name} triggered ${modeTitle(g.role)} (${info.alert}). They ${how}. ${consequenceLines(plan)}`,
  );
  remember(s, {
    id: `angry@${today(s)}`,
    who: g.id,
    kind: path === 'apology' || path === 'explained' ? 'honest' : 'careless',
    text: path === 'apology' ? 'You owned up straight away when I was furious. That was brave.' : 'Yesterday was… loud. I hope we both learned something.',
    effect: {
      type: 'trust',
      delta: path === 'apology' || path === 'explained' ? 2 : 1,
      say: path === 'apology' || path === 'explained' ? 'About yesterday — I was a volcano, and you stayed calm and owned it. I was proud of you.' : 'About yesterday… I got very loud. You know I love you, right? New day, fresh start.',
    },
  });
  const lesson = path === 'apology' || path === 'explained' ? LESSONS[1] : path === 'caught' || path === 'came-back' ? LESSONS[0] : LESSONS[2];
  stage?.calm(g.id);
  r.phase = 'cool';
  r.makeUpAt = path === 'explained' ? null : now(s) + ANGRY.makeUpMin;
  const lines: DialogueLine[] = [];
  if (plan.list.length) lines.push(line(g, consequenceLines(plan), 'calm'));
  if (plan.list.some((c) => c.kind === 'early-bed')) lines.push(line(g, 'And tonight it is lights out at nine. An early night fixes the snoozing.', 'calm'));
  lines.push({ speaker: '', text: `Lesson: ${lesson}` });
  s.showFeedback(lesson, path === 'apology' || path === 'explained' ? 'good' : 'bad');
  s.say(lines, () => {
    const after = r.after;
    r.after = undefined;
    if (path === 'explained') r.phase = 'idle';
    after?.();
  });
}

function abort(s: GameStore) {
  const r = rt(s);
  stopCount(r);
  const g = angryMember(s);
  if (g) stage?.calm(g.id);
  r.phase = 'idle';
  const after = r.after;
  r.after = undefined;
  after?.();
}

/** Making up after the storm: she brings a snack and a hug. */
function makeUp(s: GameStore, g: FamilyMember) {
  const r = rt(s);
  r.makeUpAt = null;
  r.phase = 'idle';
  s.say([
    line(g, fill(s, pick(MAKE_UP_LINES, r.seed), g), 'warm', [
      {
        label: '🤗 "I love you too. And I\'m sorry."',
        tone: 'good',
        run: () => {
          s.trust(g.id, 3);
          s.skill('empathy', 2);
          s.bus.emit('fx', { kind: 'heart', target: `npc:${g.id}` });
          s.say([line(g, 'Come here, you. (big hug) Family fights, family makes up.', 'warm')]);
        },
      },
      {
        label: '🍪 "…Does the snack come with the hug?"',
        run: () => {
          s.trust(g.id, 2);
          s.state.stats.energy = Math.min(100, s.state.stats.energy + 10);
          s.say([line(g, 'Ha! Yes. Both. (hug + biscuits, +10 energy)', 'cheerful')]);
        },
      },
    ]),
  ]);
}

// ---------------------------------------------------------------- "Come here!" calls

function clearCall(s: GameStore) {
  const r = rt(s);
  if (r.call) stage?.bubble(r.call.memberId, null);
  r.call = null;
}

/** Mum calls you over: you have 20 real seconds to come. Returns true if a call started. */
export function startCall(s: GameStore, force = false): boolean {
  const r = rt(s);
  if (r.call || r.phase !== 'idle' || s.blocking) return false;
  const g = guardianAtHome(s);
  if (!g || !stage || !stage.ready(g.id)) return false;
  const calls = counter(s, 'calls');
  const lastAt = Number(W(s)['angry.callAt'] ?? -9999);
  if (!force && (calls >= ANGRY.callsPerDay || now(s) - lastAt < ANGRY.callGapMin)) return false;
  bumpCounter(s, 'calls');
  W(s)['angry.callAt'] = now(s);
  r.call = { memberId: g.id, level: 1, ms: 0, startDist: stage.distanceTo(g.id) };
  const text = `${s.player.name.toUpperCase()}! Come here!`;
  stage.bubble(g.id, text, false);
  s.toast(`📣 ${g.name}: "${s.player.name}! Come here!" (go to them — 20 s)`, 'neutral');
  return true;
}

const CALL_REASONS: { text: string; trust: number; minutes?: number }[] = [
  { text: 'Thank you for coming straight away! Can you help me carry these bags in? …There. Teamwork.', trust: 2, minutes: 5 },
  { text: 'Taste this — more salt? …Perfect. You have a chef\'s tongue.', trust: 2 },
  { text: 'Nothing big — I just wanted a hug. (hug) That\'s all. Off you go!', trust: 3 },
  { text: 'Have you seen my glasses? …They were on my HEAD? Don\'t tell anyone.', trust: 2 },
];

/** Per-frame (real ms) while at home: maybe start a call, and run the call window. */
export function angryTick(s: GameStore, dtMs: number) {
  const r = rt(s);
  // the come-back after hiding, and the making-up moment (game-time timers)
  if (!s.blocking && stage) {
    const g = angryMember(s);
    if (r.phase === 'hiding-wait' && r.comeBackAt !== null && now(s) >= r.comeBackAt && g && isHome(g, s) && stage.ready(g.id)) {
      r.comeBackAt = null;
      r.phase = 'lecture';
      stage.approach(g.id, () => s.say([line(g, fill(s, pick(COME_BACK_LINES, r.seed), g), 'angry')], () => escortThen(g, () => lecture(s, 'came-back'))));
      return;
    }
    if (r.phase === 'hiding-wait' && W(s)['angry.day'] !== undefined && Number(W(s)['angry.day']) !== today(s)) r.phase = 'idle';
    if (r.phase === 'cool' && r.makeUpAt !== null && now(s) >= r.makeUpAt && g && isHome(g, s) && stage.ready(g.id)) {
      r.makeUpAt = null;
      stage.approach(g.id, () => makeUp(s, g));
      return;
    }
  }
  // calls
  if (r.call) {
    if (s.blocking) return;
    const c = r.call;
    const g = s.member(c.memberId);
    const dist = stage?.distanceTo(c.memberId) ?? null;
    if (!g || dist === null) return clearCall(s);
    c.ms += dtMs;
    if (c.startDist === null) c.startDist = dist;
    if (dist <= ANGRY.callNearPx) {
      clearCall(s);
      const why = pick(CALL_REASONS, r.seed + counter(s, 'calls'));
      s.trust(g.id, why.trust);
      if (why.minutes) s.spendTime(why.minutes);
      recordConduct(s, { kind: 'respect', severity: 1, by: g.id, text: `Came straight away when ${g.name} called`, lesson: 'Coming when you are called builds trust.' });
      return s.say([line(g, why.text, 'warm')]);
    }
    const walkedAway = dist - c.startDist > ANGRY.walkAwayPx;
    const late = c.ms > (c.level === 1 ? ANGRY.callWindowMs : ANGRY.call2WindowMs);
    if (walkedAway || late) {
      if (c.level === 1) {
        c.level = 2;
        c.ms = 0;
        c.startDist = dist;
        const loud = `${s.player.name.toUpperCase()}!!! I SAID COME HERE!`;
        stage?.bubble(g.id, loud, true);
        s.toast(`📣 ${g.name}: "${loud}"${walkedAway ? ' (you walked away!)' : ''}`, 'bad');
        recordConduct(s, { kind: 'respect', severity: 1, by: g.id, text: walkedAway ? `Walked away when ${g.name} called` : `Didn't come when ${g.name} called`, lesson: 'A quick "Coming!" goes a long way.' });
      } else {
        clearCall(s);
        bumpCounter(s, 'ignored');
        if (!triggerAngry(s, 'ignored-call')) {
          s.trust(g.id, -2);
          recordConduct(s, { kind: 'respect', severity: 2, by: g.id, text: `Ignored ${g.name} calling twice`, lesson: 'Ignoring someone who calls you hurts trust.' }, `${s.player.name} ignored ${g.name} calling them twice.`);
          s.say([line(g, 'I called you TWICE. When I call, you come — or at least shout "coming!". Understood?', 'angry')]);
        }
      }
    }
    return;
  }
  // maybe start a call (checked every ~6 s of real time; rare)
  r.callCheckMs += dtMs;
  if (r.callCheckMs < 6000) return;
  r.callCheckMs = 0;
  if (r.phase !== 'idle' || s.blocking || s.state.inQueue) return;
  if (Math.random() < (s.state.run ? 0.02 : 0.05)) startCall(s);
}

// ---------------------------------------------------------------- trigger hooks (called by homeLife / HomeScene)

/** Tried to use something banned (phone confiscated / TV ban). 1st time: a warning; 2nd: ANGRY. */
export function bannedAttempt(s: GameStore, what: 'phone' | 'tv'): 'warned' | 'angry' | 'ignored' {
  const n = bumpCounter(s, what);
  const facts: Partial<TriggerFacts> = what === 'phone' ? { phoneAttempts: n } : { tvAttempts: n };
  const t = triggerFrom(facts);
  if (t && triggerAngry(s, t)) return 'angry';
  if (n === 1) {
    const g = guardianAtHome(s);
    if (g) {
      s.toast(`📣 ${g.name}: "I SAW that! ${what === 'phone' ? 'Phone. DOWN.' : 'TV. OFF.'} Don't make me come over there!"`, 'bad');
      s.bus.emit('fx', { kind: 'exclaim', target: `npc:${g.id}` });
    }
    return 'warned';
  }
  return 'ignored';
}

/** Lies logged today (memories about fibbing / a mission flag). */
export function liesToday(s: GameStore): number {
  const d = today(s);
  const fromMem = (s.state.memories ?? []).filter((m) => m.day === d && /honest|fib|lie/i.test(m.id) && m.kind !== 'honest').length;
  const fromRun = s.state.run && (s.state.run.flags['lied'] || s.state.run.flags['lie']) ? 1 : 0;
  return fromMem + fromRun;
}

/** Poll for slow-burn triggers (lies). Called every few seconds by HomeScene. */
export function pollTriggers(s: GameStore) {
  if (rt(s).phase !== 'idle' || s.blocking) return;
  const lies = liesToday(s);
  if (lies > 0 && W(s)['angry.lieDay'] !== today(s) && triggerFrom({ liesToday: lies }) === 'lie') {
    if (triggerAngry(s, 'lie')) W(s)['angry.lieDay'] = today(s);
  }
}

/** Knocked something over running inside (optional mess trigger). */
export function madeMess(s: GameStore): boolean {
  const n = bumpCounter(s, 'mess');
  const t = triggerFrom({ messes: n });
  return !!t && triggerAngry(s, t);
}

/** For tests: reset the runtime. */
export function resetAngry(s: GameStore) {
  const r = rt(s);
  stopCount(r);
  RT.delete(s);
}
