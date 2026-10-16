// Home life: the little everyday moments at home that teach through consequences.
//  - sibling conflict (teasing → fights → a parent steps in → making up)
//  - naps & sleep (time-lapse, context-aware wake-ups, the morning alarm & snooze)
//  - TV time (fast-forward while watching, screen-time escalation via conduct.ts)
// Pure decision helpers are exported for tests; the flows talk to the store and
// announce visuals to HomeScene through `fx` bus events whose kind starts with
// "home:" (the generic fx spawner ignores them — no texture has that key).
import type { FamilyMember, Memory, Role } from '../domain/types';
import { scheduleFor } from '../domain/world';
import { SCREEN_LIMITS, TENSION, addScreenTime, availableGuardian, conduct, intervene, recordConduct } from './conduct';
import type { DialogueChoice, DialogueLine, GameStore } from './store';

// ---------------------------------------------------------------- tuning

/** how much each action raises sibling tension (0..100) */
export const TENSION_STEP = { tease: 15, grab: 25, fight: 35, pillow: 8 } as const;
/** tension cools by 1 every this many game minutes */
export const COOL_EVERY = 2;
/** a grab that pushes tension to this level makes the sibling snatch back → fight */
export const GRAB_BACK_AT = 50;
/** real ms the fight scene plays before it resolves */
export const FIGHT_MS = 2600;
/** real ms of a nap time-lapse */
export const NAP_MS = 2000;
/** game minutes that pass per real second of TV */
export const TV_MIN_PER_SEC = 5;
export const TIMEOUT_MIN = 5;
export const GROGGY_MIN = 15;
export const SNOOZE_MS = 1400;

export type Starter = 'player' | 'sibling' | 'both';
export type Consequence = 'warning' | 'timeout' | 'chores' | 'task-now' | 'tv-ban';
export type WakeScenario = 'late-task' | 'task-reminder' | 'dinner' | 'groggy' | 'sibling-jump' | 'refreshed';

export const CONSEQUENCE_TRUST: Record<Consequence, number> = { warning: -2, timeout: -4, chores: -5, 'task-now': -5, 'tv-ban': -8 };

// ---------------------------------------------------------------- transient runtime (not saved)

interface Runtime {
  busyUntil: number;
  watching: boolean;
  napping: boolean;
  tvAcc: number;
  tvChannel: number;
}
const RT = new WeakMap<GameStore, Runtime>();
function rt(s: GameStore): Runtime {
  let r = RT.get(s);
  if (!r) RT.set(s, (r = { busyUntil: 0, watching: false, napping: false, tvAcc: 0, tvChannel: 0 }));
  return r;
}
/** A home scene (fight / nap) is playing — ignore new home actions until it ends. */
export const homeBusy = (s: GameStore) => rt(s).napping || Date.now() < rt(s).busyUntil;
export const isWatchingTv = (s: GameStore) => rt(s).watching;
export const isNapping = (s: GameStore) => rt(s).napping;

// ---------------------------------------------------------------- small helpers

const W = (s: GameStore) => s.state.world;
const now = (s: GameStore) => s.state.clock.minutes;
const minuteOfDay = (s: GameStore) => Math.floor(s.state.clock.minutes) % 1440;
const today = (s: GameStore) => s.state.clock.day;
const fx = (s: GameStore, kind: string, target?: string, x?: number) => s.bus.emit('fx', { kind, target, x });
const SIBLING_ROLES: Role[] = ['younger-sibling', 'older-sibling'];
export const isSibling = (m: FamilyMember) => SIBLING_ROLES.includes(m.role);
export const siblingOf = (s: GameStore) => s.memberByRole('younger-sibling', 'older-sibling');
const isHome = (m: FamilyMember | undefined, s: GameStore) => !!m && scheduleFor(m.role, now(s)).spot !== 'away';
const line = (m: FamilyMember | undefined, text: string): DialogueLine => (m ? { speaker: m.name, portrait: m.id, text } : { speaker: '', text });
const pick = <T>(xs: readonly T[], n: number): T => xs[((n % xs.length) + xs.length) % xs.length];

// ---------------------------------------------------------------- tension

/** Pure: tension after `elapsed` game minutes of cooling down. */
export function cooled(t: number, elapsed: number): number {
  return Math.max(0, t - Math.floor(Math.max(0, elapsed) / COOL_EVERY));
}

/** Current sibling tension (applies the cool-down lazily). */
export function tension(s: GameStore): number {
  const c = conduct(s);
  const at = Number(W(s)['home.tensionAt'] ?? now(s));
  const elapsed = now(s) - at;
  if (c.tension <= 0 || elapsed < 0) {
    W(s)['home.tensionAt'] = now(s);
    return c.tension;
  }
  const steps = Math.floor(elapsed / COOL_EVERY);
  if (steps > 0) {
    c.tension = cooled(c.tension, elapsed);
    W(s)['home.tensionAt'] = at + steps * COOL_EVERY;
  }
  return c.tension;
}

export interface TensionChange {
  before: number;
  after: number;
  /** crossed TENSION.loud (sibling cries / yells) */
  loud: boolean;
  /** crossed TENSION.parent (a parent hears it) */
  parent: boolean;
}

export function addTension(s: GameStore, delta: number): TensionChange {
  const before = tension(s);
  const c = conduct(s);
  c.tension = Math.max(0, Math.min(100, before + delta));
  W(s)['home.tensionAt'] = now(s);
  const after = c.tension;
  s.notify();
  return { before, after, loud: before < TENSION.loud && after >= TENSION.loud, parent: before < TENSION.parent && after >= TENSION.parent };
}

export const isSulky = (s: GameStore) => W(s)['home.sulky'] === today(s);
export const timeoutLeft = (s: GameStore) => Math.max(0, Number(W(s)['home.timeoutUntil'] ?? 0) - now(s)) * (W(s)['home.timeoutDay'] === today(s) ? 1 : 0);
export const isGroggy = (s: GameStore) => W(s)['home.groggyDay'] === today(s) && now(s) < Number(W(s)['home.groggyUntil'] ?? 0);

// ---------------------------------------------------------------- scolding (pure)

export interface FightContext {
  playerName: string;
  siblingName: string;
  siblingRole: Role;
  responderName: string;
  responderRole: Role;
  starter: Starter;
  /** real fights today, including this one */
  fightsToday: number;
  minuteOfDay: number;
  pendingTask: string | null;
  /** the responder isn't home and calls instead */
  byPhone: boolean;
}

export function pickConsequence(ctx: FightContext): Consequence {
  if (ctx.fightsToday >= 3) return 'tv-ban';
  if (ctx.fightsToday === 2) return ctx.pendingTask ? 'task-now' : 'chores';
  return ctx.starter === 'player' ? 'timeout' : 'warning';
}

export const CONSEQUENCE_LINE: Record<Consequence, string> = {
  warning: 'This is your warning. Next time there will be a consequence.',
  timeout: `Five minutes' time-out. You stay in this room and cool down.`,
  chores: 'You clearly have energy to spare — the dishes are waiting. Now, please.',
  'task-now': 'Instead of fighting, go and finish your task. Right now.',
  'tv-ban': 'No TV for the rest of the day. And five minutes of quiet time in this room.',
};

export const LESSONS = [
  "Use words, not hands. If you're angry, walk away and come and find me.",
  'Feeling angry is okay. Hitting is not. Take a breath and count to ten.',
  'Family is a team. Teammates sort things out by talking.',
];

/** Context-aware scolding: who started it, how many fights today, time of day, pending task. */
export function scoldLines(ctx: FightContext): string[] {
  const out: string[] = [];
  const kid = ctx.responderRole === 'older-sibling';
  if (ctx.byPhone) out.push(`(${ctx.responderName} calls) ${ctx.siblingName} just phoned me in tears. What is going on at home?!`);
  else if (kid) out.push(ctx.fightsToday > 1 ? 'Seriously? AGAIN? Break it up, you two!' : 'Whoa, whoa — break it up, you two!');
  else if (ctx.fightsToday >= 3) out.push("That's it. I have had enough of this today.");
  else if (ctx.fightsToday === 2) out.push("Again?! That's the second time today!");
  else out.push('Hey, hey, HEY! What is going on in here?!');

  if (ctx.starter === 'player') {
    out.push(
      ctx.siblingRole === 'younger-sibling'
        ? `${ctx.playerName}, I know you started it. You're the older one — ${ctx.siblingName} copies everything you do.`
        : `${ctx.playerName}, you started it. ${ctx.siblingName} may be bigger, but that doesn't make it okay.`,
    );
  } else if (ctx.starter === 'sibling') {
    out.push(`${ctx.siblingName}, no hitting back. ${ctx.playerName} — next time come and get me instead of fighting.`);
  } else out.push("I don't care who started it. It takes two to fight.");

  const m = ctx.minuteOfDay;
  if (m >= 21 * 60) out.push("It's nearly bedtime — the neighbours can hear you!");
  else if (m >= 18 * 60 + 45 && m < 19 * 60 + 40) out.push('Dinner is on the table and you two are wrestling?');
  if (ctx.pendingTask) out.push(`And "${ctx.pendingTask}" still isn't done.`);

  out.push(pick(LESSONS, ctx.fightsToday - 1));
  out.push(CONSEQUENCE_LINE[pickConsequence(ctx)]);
  return out;
}

// ---------------------------------------------------------------- sibling talk

/** Lines the sibling uses when teased, by how many times today. */
const TEASE_REPLY = ['Stop it!', "Quit it! I'm telling!", 'MUM! {p} is teasing me AGAIN!', "I'm not listening! La la la!"];
const GRAB_REPLY = ['Hey! Give it BACK!', 'THAT IS MINE! Give it!', 'MUUUM! {p} took my stuff!'];
const SULKY = ["Hmph. I'm not talking to you.", '(turns away and crosses their arms)', "Go away. You know what you did."];

function grabThing(s: GameStore, sib: FamilyMember) {
  const act = scheduleFor(sib.role, now(s)).activity;
  if (/homework/.test(act)) return 'pencil case';
  if (/phone/.test(act)) return 'phone';
  if (/playing/.test(act)) return 'remote';
  return 'toy';
}

/** The full sibling chat (outside missions): mission offers + everyday choices. */
export function siblingTalk(s: GameStore, sib: FamilyMember, offers: DialogueChoice[] = []) {
  const t = tension(s);
  const sulky = isSulky(s);
  const act = scheduleFor(sib.role, now(s)).activity;
  const text = sulky
    ? pick(SULKY, Math.floor(now(s) / 3))
    : t >= TENSION.loud
      ? "(still sniffling) What do you want now?"
      : familyRemark(s, sib) ?? s.chatLine(sib, false);
  const playedAt = Number(W(s)['home.playedAt'] ?? -999);
  const playedRecently = W(s)['home.playedDay'] === today(s) && now(s) - playedAt < 45;
  const choices: DialogueChoice[] = [...offers.slice(0, 2)];
  if (t > 0 || sulky) choices.push({ label: '🤝 Say sorry', tone: 'good', run: () => sayingSorry(s, sib) });
  if (!sulky) choices.push({ label: '🎲 Play together', tone: 'good', disabled: playedRecently, hint: playedRecently ? 'You just played' : undefined, run: () => playTogether(s, sib) });
  if (/homework/.test(act) && W(s)['home.homeworkDay'] !== today(s)) choices.push({ label: '📚 Help with homework', tone: 'good', run: () => helpHomework(s, sib) });
  choices.push({ label: '😜 Tease them', tone: 'bad', run: () => tease(s, sib) });
  choices.push({ label: `✋ Grab their ${grabThing(s, sib)}`, tone: 'bad', run: () => grab(s, sib) });
  if (t >= 25) choices.push({ label: '👊 Shove them (start a fight)', tone: 'bad', run: () => provoke(s, sib, 'player') });
  else choices.push({ label: '🛏️ Pillow fight!', tone: 'neutral', run: () => pillowFight(s, sib) });
  choices.push({ label: 'Bye', run: () => {} });
  s.say([{ ...line(sib, text), choices }]);
}

export function tease(s: GameStore, sib: FamilyMember) {
  const n = Number(W(s)['home.teases.' + today(s)] ?? 0);
  W(s)['home.teases.' + today(s)] = n + 1;
  W(s)['home.provoker'] = 'player';
  const ch = addTension(s, TENSION_STEP.tease);
  recordConduct(s, { kind: 'fight', severity: 1, text: `Teased ${sib.name}`, lesson: 'Teasing is only fun if everyone is laughing.' });
  fx(s, 'cloud', `npc:${sib.id}`);
  fx(s, 'home:stomp', sib.id);
  const reply = pick(TEASE_REPLY, n).replace('{p}', s.player.name);
  s.say([line(sib, reply)], () => afterTension(s, sib, ch));
}

export function grab(s: GameStore, sib: FamilyMember) {
  const n = Number(W(s)['home.grabs.' + today(s)] ?? 0);
  W(s)['home.grabs.' + today(s)] = n + 1;
  W(s)['home.provoker'] = 'player';
  const thing = grabThing(s, sib);
  const ch = addTension(s, TENSION_STEP.grab);
  recordConduct(s, { kind: 'fight', severity: 1, text: `Grabbed ${sib.name}'s ${thing}`, lesson: 'Ask, don’t grab.' });
  fx(s, 'cloud', `npc:${sib.id}`);
  fx(s, 'home:stomp', sib.id);
  const reply = pick(GRAB_REPLY, n).replace('{p}', s.player.name);
  if (!ch.parent && ch.after >= GRAB_BACK_AT) {
    // they snatch it back and it turns into a scuffle
    return s.say([line(sib, reply), line(undefined, `${sib.name} lunges to snatch the ${thing} back!`)], () => startFight(s, sib, 'real', 'player'));
  }
  s.say([line(sib, reply)], () => afterTension(s, sib, ch));
}

export function provoke(s: GameStore, sib: FamilyMember, starter: Starter) {
  W(s)['home.provoker'] = starter;
  startFight(s, sib, 'real', starter);
}

export function pillowFight(s: GameStore, sib: FamilyMember) {
  if (tension(s) >= TENSION.loud) {
    // they're already upset: it gets out of hand
    W(s)['home.provoker'] = 'both';
    return s.say([line(undefined, `You throw a pillow… but ${sib.name} is already upset. It gets out of hand fast!`)], () => startFight(s, sib, 'real', 'both'));
  }
  startFight(s, sib, 'pillow', 'both');
}

/** React to a tension change: crying at loud, parent at the parent threshold. */
function afterTension(s: GameStore, sib: FamilyMember, ch: TensionChange) {
  if (ch.loud) {
    s.toast(`${sib.name} is crying!`, 'bad');
    fx(s, 'exclaim', `npc:${sib.id}`);
    fx(s, 'home:cry', sib.id);
  }
  if (ch.parent) parentStepsIn(s, sib);
}

// ---------------------------------------------------------------- fights

/** Plays the in-world fight (HomeScene animates it), then resolves it. */
export function startFight(s: GameStore, sib: FamilyMember, mode: 'real' | 'pillow', starter: Starter) {
  const r = rt(s);
  r.busyUntil = Date.now() + FIGHT_MS;
  fx(s, 'home:fight', sib.id, mode === 'real' ? 1 : 0);
  setTimeout(() => resolveFight(s, sib, mode, starter), FIGHT_MS);
}

export function resolveFight(s: GameStore, sib: FamilyMember, mode: 'real' | 'pillow', starter: Starter) {
  rt(s).busyUntil = 0;
  if (mode === 'pillow') {
    addTension(s, TENSION_STEP.pillow);
    s.spendTime(5);
    s.trust(sib.id, 2);
    fx(s, 'music', `npc:${sib.id}`);
    return s.say([line(sib, pick(['HAHA! I win! Rematch later!', 'Feathers EVERYWHERE! That was awesome!', 'Okay okay, truce! You got me!'], today(s) + Math.floor(now(s))))]);
  }
  const c = conduct(s);
  c.fights += 1;
  W(s)['home.provoker'] = starter;
  W(s)['home.sulky'] = today(s);
  W(s)['home.fightDay'] = today(s);
  const ch = addTension(s, TENSION_STEP.fight);
  const parentComes = ch.after >= TENSION.parent || c.fights >= 2;
  recordConduct(
    s,
    { kind: 'fight', severity: 2, text: `Got into a physical fight with ${sib.name}`, lesson: 'Use words, not hands.' },
    parentComes ? undefined : `${s.player.name} got into a physical fight with ${sib.name} at home.`,
  );
  if (parentComes) {
    s.toast(`${sib.name} is crying!`, 'bad');
    fx(s, 'home:cry', sib.id);
    return parentStepsIn(s, sib);
  }
  if (ch.loud) {
    s.toast(`${sib.name} is crying!`, 'bad');
    fx(s, 'exclaim', `npc:${sib.id}`);
    fx(s, 'home:cry', sib.id);
    return s.say([line(sib, "WAAAH! That HURT! I'm telling!"), line(undefined, 'Somewhere in the house, a door opens… better calm things down. (Say sorry?)')]);
  }
  fx(s, 'cloud', `npc:${sib.id}`);
  s.say([line(sib, "Ow! Fine! I'm not playing with you anymore!")]);
}

/** Who comes to break it up: a guardian at home, else the older sibling, else a guardian by phone. */
export function responder(s: GameStore, sib: FamilyMember): { who: FamilyMember | undefined; byPhone: boolean } {
  const g = availableGuardian(s);
  if (isHome(g, s)) return { who: g, byPhone: false };
  const older = s.memberByRole('older-sibling');
  if (older && older.id !== sib.id && isHome(older, s)) return { who: older, byPhone: false };
  return { who: g, byPhone: !!g };
}

function pendingTaskTitle(s: GameStore): string | null {
  if (s.mission) return s.mission.title;
  const a = s.state.assignments.find((x) => x.status === 'assigned' && x.assignedTo === 'player');
  return a ? (a.note || null) : null;
}

export function fightContext(s: GameStore, sib: FamilyMember, who: FamilyMember, byPhone: boolean): FightContext {
  return {
    playerName: s.player.name,
    siblingName: sib.name,
    siblingRole: sib.role,
    responderName: who.name,
    responderRole: who.role,
    starter: (W(s)['home.provoker'] as Starter) ?? 'both',
    fightsToday: Math.max(1, conduct(s).fights),
    minuteOfDay: minuteOfDay(s),
    pendingTask: pendingTaskTitle(s),
    byPhone,
  };
}

/** A parent (or fallback) comes over, scolds with context, separates and applies a fair consequence. */
export function parentStepsIn(s: GameStore, sib: FamilyMember) {
  const { who, byPhone } = responder(s, sib);
  if (!who) return;
  const ctx = fightContext(s, sib, who, byPhone);
  const cons = pickConsequence(ctx);
  const lines = scoldLines(ctx).filter((l) => !l.startsWith(`(${who.name} calls)`) || byPhone);
  recordConduct(
    s,
    { kind: 'fight', severity: 3, by: who.id, text: `${who.name} broke up a fight with ${sib.name} — ${consequenceName(cons)}`, lesson: 'Use words, not hands.' },
    `${s.player.name} and ${sib.name} had a fight (#${ctx.fightsToday} today). ${who.name} stepped in: ${consequenceName(cons)}.`,
  );
  intervene(s, who, 'fight', lines, () => applyConsequence(s, cons, who, sib));
}

export function consequenceName(c: Consequence): string {
  return { warning: 'a warning', timeout: '5-minute time-out', chores: 'extra chores (dishes)', 'task-now': 'sent to finish their task', 'tv-ban': 'no TV for the day + time-out' }[c];
}

export function applyConsequence(s: GameStore, cons: Consequence, who: FamilyMember, sib: FamilyMember) {
  const c = conduct(s);
  if (who.role !== 'older-sibling') s.trust(who.id, CONSEQUENCE_TRUST[cons]);
  // separated: the sibling goes to the other room and things cool down
  fx(s, 'home:separate', sib.id);
  c.tension = Math.min(c.tension, 20);
  W(s)['home.tensionAt'] = now(s);
  W(s)['home.sulky'] = today(s);
  W(s)['home.fightBy'] = who.id;
  if (cons === 'timeout' || cons === 'tv-ban') {
    W(s)['home.timeoutUntil'] = now(s) + TIMEOUT_MIN;
    W(s)['home.timeoutDay'] = today(s);
    fx(s, 'home:timeout');
  }
  if (cons === 'tv-ban') c.tvBanned = true;
  if (cons === 'chores') {
    s.state.stats.energy = Math.max(0, s.state.stats.energy - 10);
    s.spendTime(15, 'Washing the dishes (consequence)');
  }
  remember(s, { id: `sibling-fight@${today(s)}`, who: who.id, kind: 'careless', text: `You and ${sib.name} had a real fight yesterday. I hope you two have made up.` });
  s.showFeedback('Lesson: use words, not hands.', 'bad');
  s.notify();
}

export function sayingSorry(s: GameStore, sib: FamilyMember) {
  const t = tension(s);
  const wasSulky = isSulky(s);
  addTension(s, -30);
  W(s)['home.sulky'] = false;
  W(s)['home.madeUpDay'] = today(s);
  s.trust(sib.id, wasSulky ? 4 : 2);
  fx(s, 'home:hug', sib.id);
  fx(s, 'heart', `npc:${sib.id}`);
  recordConduct(s, { kind: 'fight', severity: 1, text: `Said sorry to ${sib.name}`, lesson: 'Saying sorry first takes courage — and it works.' });
  s.skill('empathy', 2);
  const fightBy = W(s)['home.fightBy'] && W(s)['home.fightDay'] === today(s) ? s.member(String(W(s)['home.fightBy'])) : undefined;
  if (fightBy && wasSulky && fightBy.role !== 'older-sibling') s.trust(fightBy.id, 2);
  if (wasSulky) remember(s, { id: `made-up@${today(s)}`, who: sib.id, kind: 'kind', text: 'You said sorry after our fight. I wasn’t even mad anymore.' });
  const reply = t >= TENSION.loud || wasSulky ? "…Hmph. Okay. I'm sorry too. Hug?" : "It's okay. I wasn't THAT mad.";
  s.say([line(sib, reply), line(undefined, 'You hug it out. Things feel lighter.')]);
}

export function playTogether(s: GameStore, sib: FamilyMember) {
  W(s)['home.playedAt'] = now(s);
  W(s)['home.playedDay'] = today(s);
  addTension(s, -10);
  s.trust(sib.id, 2);
  s.skill('empathy', 1);
  fx(s, 'music', `npc:${sib.id}`);
  s.spendTime(10, `Playing with ${sib.name}`);
  s.say([line(sib, pick(['Yesss! Best game ever!', 'You are SO bad at this. Again!', 'Can we do this every day?'], Math.floor(now(s))))]);
}

export function helpHomework(s: GameStore, sib: FamilyMember) {
  W(s)['home.homeworkDay'] = today(s);
  addTension(s, -15);
  s.trust(sib.id, 4);
  s.skill('communication', 2);
  s.skill('empathy', 1);
  fx(s, 'sparkle', `npc:${sib.id}`);
  s.spendTime(15, `Homework help for ${sib.name}`);
  s.say([line(sib, 'Ohhh, THAT is how fractions work! Thanks!'), line(undefined, 'Explaining something is the best way to learn it yourself.')]);
}

// ---------------------------------------------------------------- family remarks

/** Natural comments about recent behaviour. null = nothing to say about it. */
export function familyRemark(s: GameStore, m: FamilyMember): string | null {
  const w = W(s);
  const d = today(s);
  const sib = siblingOf(s);
  const isParent = ['mother', 'father', 'guardian'].includes(m.role);
  if (isParent && w['home.napMissed'] === d && w['home.napRemarked'] !== d) {
    w['home.napRemarked'] = d;
    return `You fell asleep with a task still to do. Naps are fine — after the jobs are done. Set an alarm next time.`;
  }
  if (sib && m.id !== sib.id && w['home.fightDay'] === d) {
    if (isSulky(s)) {
      if (isParent) return `Have you said sorry to ${sib.name} yet? Going to bed angry is no fun for anyone.`;
      if (m.role === 'grandparent') return `So much shouting today! When I was young my brother and I fought too — we always made up before dinner.`;
      if (m.role === 'older-sibling') return `Heard you two going at it earlier. Not cool. Just say sorry, it's easier.`;
    } else if (w['home.madeUpDay'] === d && isParent) return `I saw you two made up. That's what family does — I'm proud of you.`;
  }
  if (isParent && conduct(s).screenMinutes >= 45 && !conduct(s).tvBanned) return 'That is a lot of screen time today. How about some fresh air or a book?';
  if (sib && m.id === sib.id && w['home.madeUpDay'] === d) return 'Are we friends again? …Good. Wanna play?';
  return null;
}

// ---------------------------------------------------------------- memories

function remember(s: GameStore, m: Omit<Memory, 'day'>) {
  if (!s.state.memories) s.state.memories = [];
  if (s.state.memories.some((x) => x.id === m.id)) return;
  s.state.memories.unshift({ ...m, day: today(s) });
  s.state.memories = s.state.memories.slice(0, 40);
}

// ---------------------------------------------------------------- bed: naps & sleep

export function bedMenu(s: GameStore) {
  const run = s.state.run;
  const late = minuteOfDay(s) >= 21 * 60;
  s.say([
    {
      speaker: '',
      text: run ? 'Your bed looks SO comfy… but you have a task going.' : late ? "It's getting late. Time for bed?" : 'Your bed. A nap sounds nice… (Energy refills while you sleep.)',
      choices: [
        { label: '😴 Take a nap (30 min)', run: () => startNap(s, 30) },
        { label: '💤 Nap 1 hour', hint: 'Long naps can leave you groggy', run: () => startNap(s, 60) },
        { label: '🌙 Sleep for the night', disabled: !!run, hint: run ? 'Finish your task first' : 'Ends the day', run: () => sleepForNight(s) },
        { label: 'Not now', run: () => {} },
      ],
    },
  ]);
}

/** Energy restored by a nap of `mins` minutes (pure). */
export const napEnergy = (energy: number, mins: number) => Math.min(100, energy + Math.round(mins * 0.8));

export function startNap(s: GameStore, mins: number) {
  const r = rt(s);
  if (r.napping) return;
  r.napping = true;
  fx(s, 'home:nap', undefined, mins);
  const steps = 20;
  let i = 0;
  const step = () => {
    s.spendTime(mins / steps);
    if (++i < steps) setTimeout(step, NAP_MS / steps);
    else finishNap(s, mins);
  };
  setTimeout(step, NAP_MS / steps);
}

export interface WakeContext {
  hasRun: boolean;
  timeLeft: number | null;
  minuteOfDay: number;
  napMins: number;
  siblingHome: boolean;
  siblingUpset: boolean;
  day: number;
}

export function pickWakeScenario(ctx: WakeContext): WakeScenario {
  if (ctx.hasRun && ctx.timeLeft !== null && ctx.timeLeft <= 15) return 'late-task';
  if (ctx.hasRun) return 'task-reminder';
  if (ctx.minuteOfDay >= 18 * 60 + 40 && ctx.minuteOfDay < 19 * 60 + 10) return 'dinner';
  if (ctx.napMins >= 60) return 'groggy';
  if (ctx.siblingHome && !ctx.siblingUpset && (ctx.day + Math.floor(ctx.minuteOfDay / 10)) % 2 === 0) return 'sibling-jump';
  return 'refreshed';
}

const TASK_SHOUT: Record<string, string> = {
  'grocery-run': 'The groceries!',
  'cook-meal': 'The soup!',
  laundry: 'The laundry!',
  'clean-room': 'Your room is still a mess!',
  'help-sibling': 'Your sibling still needs help!',
};

export function finishNap(s: GameStore, mins: number) {
  const r = rt(s);
  r.napping = false;
  const c = conduct(s);
  const before = s.state.stats.energy;
  s.state.stats.energy = napEnergy(before, mins);
  c.napMinutes += mins;
  if (mins >= 60) {
    W(s)['home.groggyUntil'] = now(s) + GROGGY_MIN;
    W(s)['home.groggyDay'] = today(s);
  }
  const sib = siblingOf(s);
  const scenario = pickWakeScenario({
    hasRun: !!s.state.run,
    timeLeft: s.timeLeft(),
    minuteOfDay: minuteOfDay(s),
    napMins: mins,
    siblingHome: isHome(sib, s),
    siblingUpset: isSulky(s) || tension(s) >= TENSION.loud,
    day: today(s),
  });
  fx(s, 'home:wake', scenario);
  const gained = s.state.stats.energy - before;
  const title = s.mission?.title ?? 'your task';
  switch (scenario) {
    case 'late-task': {
      const who = (isHome(s.assigner(), s) ? s.assigner() : undefined) ?? responder(s, sib ?? s.player).who;
      const left = s.timeLeft() ?? 0;
      const shout = TASK_SHOUT[s.state.run!.missionId] ?? `What about "${title}"?`;
      W(s)['home.napMissed'] = today(s);
      recordConduct(
        s,
        { kind: 'sleep', severity: 2, by: who?.id, text: `Fell asleep during a task (${title})`, lesson: 'Rest is good — after the job is done, or with an alarm set.' },
        `${s.player.name} napped for ${mins} min in the middle of a task (${title})${left <= 0 ? ' and missed the deadline' : ' and nearly missed the deadline'}.`,
      );
      return intervene(
        s,
        who,
        'sleep',
        [
          `${s.player.name}! You were SLEEPING?! ${shout}`,
          left <= 0 ? 'It is already late. People were counting on you.' : `You have ${Math.max(1, Math.round(left))} minutes. Go, go, go!`,
          'Naps are fine when your jobs are done. Next time, set an alarm.',
        ],
        () => s.trust(who?.id ?? '', -4),
      );
    }
    case 'task-reminder':
      recordConduct(s, { kind: 'sleep', severity: 1, text: `Napped ${mins} min during a task`, lesson: 'Check the clock before you rest.' });
      return s.say([line(undefined, `You wake up with a start — "${title}" is still waiting!${s.timeLeft() !== null ? ` (${Math.max(0, Math.round(s.timeLeft()!))} min left)` : ''}`)]);
    case 'dinner': {
      const g = availableGuardian(s);
      return s.say([line(g, `${s.player.name}! Dinner's almost ready — wash your hands and come to the table!`)]);
    }
    case 'groggy':
      return s.say([line(undefined, `You wake up all groggy and puffy-eyed… (+${gained} energy, but long naps make you slow for a while.)`)]);
    case 'sibling-jump': {
      fx(s, 'home:jump', sib!.id);
      return s.say([
        {
          ...line(sib, 'WAKE UP WAKE UP WAKE UP! You were asleep FOREVER! Play with me?'),
          choices: [
            { label: 'Okay, let’s play!', tone: 'good', run: () => playTogether(s, sib!) },
            { label: 'Five more minutes…', run: () => s.say([line(sib, 'Boooring. Fine.')]) },
          ],
        },
      ]);
    }
    default:
      s.toast(`Refreshed! +${gained} energy`, 'good');
  }
}

export function sleepForNight(s: GameStore) {
  W(s)['home.bedSleep'] = today(s);
  fx(s, 'home:sleep');
  setTimeout(() => s.openModal({ type: 'day-summary', day: today(s) }), 900);
}

/** Pure: what happens when you get up after `snoozes` snoozes. */
export function snoozeOutcome(snoozes: number): 'prompt' | 'late' | 'parent' {
  return snoozes <= 0 ? 'prompt' : snoozes === 1 ? 'late' : 'parent';
}

const alarmClock = (snoozes: number) => `7:${String(snoozes * 10).padStart(2, '0')} AM`;

/**
 * Called by nextDay(). If the player went to bed in their bed, play the morning alarm
 * scene first, then `then` (the usual new-day chat). Returns false when not applicable.
 */
export function morningAlarm(s: GameStore, then: () => void): boolean {
  const slept = W(s)['home.bedSleep'];
  if (slept === undefined || Number(slept) !== today(s) - 1) return false;
  delete W(s)['home.bedSleep'];
  let snoozes = 0;
  const goToSchool = () => {
    fx(s, 'home:alarm-off');
    s.say([line(undefined, 'You get dressed, grab breakfast and head to school… The school day flies by. Now it is afternoon again.')], then);
  };
  const getUp = () => {
    const o = snoozeOutcome(snoozes);
    const g = availableGuardian(s);
    if (o === 'prompt') {
      if (g) s.trust(g.id, 1);
      recordConduct(s, { kind: 'sleep', severity: 1, text: 'Got up on the first alarm', lesson: 'Getting up on the first alarm makes the whole morning calmer.' });
      s.toast('Up on the first alarm! (+trust)', 'good');
    }
    goToSchool();
  };
  const ring = () => {
    fx(s, 'home:alarm', undefined, snoozes);
    s.say([
      {
        speaker: '⏰ Alarm clock',
        text: `RING RING RING! ${alarmClock(snoozes)} — time to get up for school!`,
        choices: [
          { label: '☀️ Get up', tone: 'good', run: getUp },
          { label: '😴 Snooze 10 min', tone: 'bad', run: snooze },
        ],
      },
    ]);
  };
  const snooze = () => {
    snoozes += 1;
    fx(s, 'home:snooze', undefined, snoozes);
    if (snoozeOutcome(snoozes) === 'parent') {
      const g = availableGuardian(s);
      recordConduct(s, { kind: 'sleep', severity: 2, by: g?.id, text: 'Snoozed the alarm twice — a parent had to come in', lesson: 'An alarm only helps if you listen to the first one.' });
      return intervene(
        s,
        g,
        'sleep',
        [`${s.player.name}! That's the second snooze — you'll be late for school!`, 'The alarm is there to help you. Get up on the first ring and the whole morning is calmer.'],
        () => {
          if (g) s.trust(g.id, -2);
          goToSchool();
        },
      );
    }
    s.toast('Zzz… ten more minutes', 'neutral');
    setTimeout(ring, SNOOZE_MS);
  };
  ring();
  return true;
}

// ---------------------------------------------------------------- TV

export const TV_CHANNELS = ['📺 Cartoon channel', '📺 Cooking show', '📺 Nature documentary', '📺 Game show', '📺 Music videos'];

export function tvInteract(s: GameStore) {
  if (rt(s).watching) return stopTv(s);
  if (homeBusy(s)) return;
  const c = conduct(s);
  if (c.tvBanned) {
    const g = availableGuardian(s);
    return s.say([line(undefined, `The TV stays dark. ${g ? g.name : 'A parent'} switched it off for today — no more TV until tomorrow.`)]);
  }
  const r = rt(s);
  r.watching = true;
  r.tvAcc = 0;
  r.tvChannel = (r.tvChannel + 1) % TV_CHANNELS.length;
  fx(s, 'home:tv-on', undefined, r.tvChannel);
  s.toast(`${TV_CHANNELS[r.tvChannel]} — move or press E to stop`, 'info');
  if (s.state.run) s.toast(`"${s.mission?.title}" is still waiting…`, 'neutral');
}

export function stopTv(s: GameStore) {
  const r = rt(s);
  if (!r.watching) return;
  r.watching = false;
  fx(s, 'home:tv-off');
}

/** Advance TV time by `realMs` of real time (HomeScene calls this every frame while watching). */
export function watchTv(s: GameStore, realMs: number): number {
  const r = rt(s);
  if (!r.watching) return 0;
  r.tvAcc += (realMs / 1000) * TV_MIN_PER_SEC;
  let spent = 0;
  while (r.tvAcc >= 1 && r.watching) {
    r.tvAcc -= 1;
    spent += 1;
    const before = conduct(s).screenMinutes;
    s.spendTime(1);
    const after = addScreenTime(s, 1, 'tv');
    if (Math.floor(after / 20) !== Math.floor(before / 20)) {
      r.tvChannel = (r.tvChannel + 1) % TV_CHANNELS.length;
      fx(s, 'home:tv-channel', undefined, r.tvChannel);
    }
    // a parent came over (scold) or the TV got switched off
    if ((before < SCREEN_LIMITS.scold && after >= SCREEN_LIMITS.scold) || conduct(s).tvBanned) stopTv(s);
  }
  return spent;
}
