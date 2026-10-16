// Conduct: how the world reacts to the player's everyday behaviour.
// Tracks screen time, sibling fights, road safety and napping per day, logs what
// happened, alerts the parent dashboard, and — when it goes too far — sends a
// family member over to deal with it. If a real parent is connected they get the
// alert; the in-game parent always reacts too, so the lesson never depends on
// someone being online.
import type { ConductEvent, ConductKind, ConductState, FamilyMember, Role } from '../domain/types';
import { GUARDIAN_ROLES } from '../domain/types';
import { scheduleFor } from '../domain/world';
import type { DialogueLine, GameStore } from './store';

const LOG_MAX = 60;
const ALERT_MAX = 40;

export const SCREEN_LIMITS = {
  /** gentle reminder after this many game minutes of phone/TV in a day */
  nudge: 30,
  /** a parent comes over and scolds */
  scold: 60,
  /** phone confiscated / TV banned for the rest of the day */
  confiscate: 90,
};

export const TENSION = {
  /** sibling complains loudly / cries */
  loud: 40,
  /** a parent hears and comes to stop it */
  parent: 70,
};

function fresh(day: number): ConductState {
  return { day, screenMinutes: 0, fights: 0, tension: 0, roadWarnings: 0, napMinutes: 0, log: [], alerts: [] };
}

/** The conduct slice for today (creates it / rolls counters over on a new day). */
export function conduct(s: GameStore): ConductState {
  const day = s.state.clock.day;
  let c = s.state.conduct;
  if (!c) {
    c = s.state.conduct = fresh(day);
  } else if (c.day !== day) {
    c.day = day;
    c.screenMinutes = 0;
    c.fights = 0;
    c.tension = 0;
    c.roadWarnings = 0;
    c.napMinutes = 0;
    c.phoneTakenUntil = undefined;
    c.tvBanned = false;
  }
  return c;
}

/** Log a behaviour event; optionally raise a parent-dashboard alert. */
export function recordConduct(s: GameStore, ev: Omit<ConductEvent, 'at' | 'day'>, alert?: string): ConductEvent {
  const c = conduct(s);
  const full: ConductEvent = { ...ev, at: s.state.clock.minutes, day: s.state.clock.day };
  c.log = [full, ...c.log].slice(0, LOG_MAX);
  if (alert) {
    c.alerts = [{ id: `al-${Date.now()}-${c.alerts.length}`, at: full.at, day: full.day, kind: ev.kind, text: alert }, ...c.alerts].slice(0, ALERT_MAX);
  }
  // a mission in progress also remembers it (results screen "decisions & consequences")
  if (s.state.run) s.log(ev.text, ev.lesson ?? '', ev.severity >= 2 ? 'bad' : 'neutral');
  s.notify();
  return full;
}

export function markAlertsRead(s: GameStore) {
  const c = conduct(s);
  c.alerts.forEach((a) => (a.read = true));
  s.notify();
}

export function phoneAllowed(s: GameStore): boolean {
  const c = conduct(s);
  return !(c.phoneTakenUntil && s.state.clock.minutes < c.phoneTakenUntil);
}

/** Who is home and able to come over right now (guardians first, by role order). */
export function availableGuardian(s: GameStore, prefer: Role[] = ['mother', 'father', 'guardian', 'grandparent']): FamilyMember | undefined {
  const order = [...prefer, ...GUARDIAN_ROLES.filter((r) => !prefer.includes(r))];
  for (const r of order) {
    const m = s.memberByRole(r);
    if (m && scheduleFor(m.role, s.state.clock.minutes).spot !== 'away') return m;
  }
  return s.memberByRole(...order);
}

/**
 * Send a family member over to deal with something. The scene walks them to the
 * player; when they arrive the lines play, then `then` runs (apply consequences).
 * Falls back to an immediate phone-style scolding when no scene handles it.
 */
export function intervene(s: GameStore, member: FamilyMember | undefined, reason: ConductKind, lines: string[], then?: () => void) {
  if (!member) {
    then?.();
    return;
  }
  let arrived = false;
  const arrive = () => {
    if (arrived) return;
    arrived = true;
    const dl: DialogueLine[] = lines.map((text) => ({ speaker: member.name, portrait: member.id, text }));
    s.say(dl, () => then?.());
  };
  const ev = { type: 'intervene' as const, memberId: member.id, reason, handled: false, arrive };
  s.bus.emit('conduct', ev);
  if (!ev.handled) {
    // nobody to walk over (player is out, or the member isn't in this scene): call / shout from afar
    const atHome = s.state.location === 'home';
    if (!atHome && lines.length) lines = [`(${member.name} calls you on the phone)`, ...lines];
    arrive();
  } else {
    // safety net: if the walk never finishes, still deliver the message
    setTimeout(arrive, 6000);
  }
}

/** Add phone/TV screen time and escalate: nudge → scolding → consequence. Returns the new total. */
export function addScreenTime(s: GameStore, minutes: number, source: 'phone' | 'tv'): number {
  const c = conduct(s);
  const before = c.screenMinutes;
  c.screenMinutes += minutes;
  const after = c.screenMinutes;
  const crossed = (limit: number) => before < limit && after >= limit;
  const g = () => availableGuardian(s);
  if (crossed(SCREEN_LIMITS.nudge)) {
    recordConduct(s, { kind: 'screen', severity: 1, text: `${Math.round(after)} minutes of ${source === 'tv' ? 'TV' : 'scrolling'} today`, lesson: 'Screens are fine in small doses — check the clock.' });
    s.toast(`⏳ ${Math.round(after)} min of screen time today`, 'neutral');
  }
  if (crossed(SCREEN_LIMITS.scold)) {
    const who = g();
    recordConduct(s, { kind: 'screen', severity: 2, by: who?.id, text: `A parent stopped ${source === 'tv' ? 'TV time' : 'phone scrolling'} after an hour`, lesson: 'Long scrolling steals time from tasks, sleep and people.' }, `${s.player.name} has spent over an hour on ${source === 'tv' ? 'TV' : 'their phone'} today.`);
    intervene(s, who, 'screen', [
      source === 'tv' ? 'Still in front of the TV? It has been an hour!' : "An hour on that phone already? Put it down for a while, please.",
      'Go do something useful — your tasks, or help someone at home.',
    ], () => s.trust(who?.id ?? '', -3));
  }
  if (crossed(SCREEN_LIMITS.confiscate)) {
    const who = g();
    if (source === 'phone') c.phoneTakenUntil = s.state.clock.minutes + 120;
    else c.tvBanned = true;
    recordConduct(s, { kind: 'screen', severity: 3, by: who?.id, text: source === 'phone' ? 'Phone taken away for 2 hours' : 'No more TV today', lesson: 'Rules have consequences — and they reset tomorrow.' }, `${source === 'phone' ? 'Phone confiscated' : 'TV switched off'} after ${Math.round(after)} minutes of screen time.`);
    intervene(s, who, 'screen', [
      "That's enough. I warned you already.",
      source === 'phone' ? "I'm keeping your phone for two hours." : 'The TV stays off for the rest of the day.',
    ], () => s.trust(who?.id ?? '', -5));
  }
  s.notify();
  return after;
}
