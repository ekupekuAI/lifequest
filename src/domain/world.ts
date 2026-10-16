// World rules that make the neighbourhood behave like a real place:
// difficulty presets, opening hours and family routines.
import type { Difficulty, LocationId, Role } from './types';

export interface DifficultyParams {
  label: string;
  blurb: string;
  budgetMul: number;
  deadlineMul: number;
  /** minimum people in the evening checkout line */
  queueMin: number;
  /** multiplier on optional challenge probabilities (capped at 1) */
  challengeMul: number;
  /** real ms per game minute while walking */
  msPerMinute: number;
  /** locked-door / wrong-change style surprises enabled */
  surprises: boolean;
}

export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  easy: { label: 'Relaxed', blurb: 'More time and money, shorter queues, fewer surprises. Great for younger players.', budgetMul: 1.25, deadlineMul: 1.5, queueMin: 3, challengeMul: 0.5, msPerMinute: 1400, surprises: false },
  normal: { label: 'Real life', blurb: 'Balanced time, money and everyday surprises.', budgetMul: 1, deadlineMul: 1, queueMin: 5, challengeMul: 1, msPerMinute: 1000, surprises: true },
  hard: { label: 'Busy day', blurb: 'Tight budget, faster clock, long queues and more surprises.', budgetMul: 0.85, deadlineMul: 0.75, queueMin: 7, challengeMul: 1.4, msPerMinute: 800, surprises: true },
};

/** Opening hours in minutes since midnight. Places not listed are always open. */
export const OPENING_HOURS: Record<string, { open: number; close: number; label: string }> = {
  grocery: { open: 8 * 60, close: 21 * 60, label: 'FreshMart' },
  kiosk: { open: 7 * 60, close: 19 * 60 + 30, label: 'the corner shop' },
  clinic: { open: 17 * 60, close: 20 * 60, label: 'the clinic' },
  library: { open: 10 * 60, close: 19 * 60, label: 'the library' },
  post: { open: 10 * 60, close: 18 * 60 + 30, label: 'the post office' },
  mailbox: { open: 0, close: 18 * 60 + 30, label: 'the last mail collection' },
  bus: { open: 6 * 60, close: 22 * 60, label: 'the bus service' },
};

export function isOpenAt(place: string, minutes: number): boolean {
  const h = OPENING_HOURS[place];
  if (!h) return true;
  const m = minutes % 1440;
  return m >= h.open && m < h.close;
}

export function hoursLabel(place: string): string {
  const h = OPENING_HOURS[place];
  if (!h) return 'Always open';
  const f = (m: number) => {
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    const h12 = ((hh + 11) % 12) + 1;
    return `${h12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${hh < 12 ? 'AM' : 'PM'}`;
  };
  return `${f(h.open)} – ${f(h.close)}`;
}

/** Bus timetable: Route 12 (home ↔ city) at :00 :20 :40; Route 7 (to the stadium — the wrong bus) at :10 :30 :50. */
export const BUS = {
  route12Every: 20,
  route12Offset: 0,
  route7Every: 20,
  route7Offset: 10,
  /** minutes a bus waits at the stop */
  dwell: 2,
  rideMinutes: 12,
  ticketBase: 10, // bought at the machine (base currency)
  cashFareBase: 15, // paid to the driver
};

export function nextBus(minutes: number, route: 12 | 7): number {
  const every = route === 12 ? BUS.route12Every : BUS.route7Every;
  const off = route === 12 ? BUS.route12Offset : BUS.route7Offset;
  return Math.ceil((minutes - off) / every) * every + off;
}

/** Which bus (if any) is standing at the stop right now. */
export function busAtStop(minutes: number): 12 | 7 | null {
  for (const r of [12, 7] as const) {
    const every = r === 12 ? BUS.route12Every : BUS.route7Every;
    const off = r === 12 ? BUS.route12Offset : BUS.route7Offset;
    const since = (((minutes - off) % every) + every) % every;
    if (since < BUS.dwell) return r;
  }
  return null;
}

export type HomeSpot = 'kitchen' | 'living' | 'bedroom' | 'dining' | 'away' | 'sofa' | 'desk';

/** Simple family routines: where each role is at a given time of day. */
export function scheduleFor(role: Role, minutes: number): { spot: HomeSpot; activity: string } {
  const m = minutes % 1440;
  // the partner lives across town — never inside the player's home
  if (role === 'partner') return { spot: 'away', activity: 'at their own home across town' };
  if (m >= 19 * 60 && m < 19 * 60 + 40) return { spot: 'dining', activity: 'having dinner' };
  switch (role) {
    case 'mother':
      return m >= 17 * 60 + 30 ? { spot: 'kitchen', activity: 'cooking dinner' } : { spot: 'kitchen', activity: 'making tea' };
    case 'father':
      return m < 17 * 60 + 30 ? { spot: 'away', activity: 'at work (home by 5:30 PM)' } : { spot: 'living', activity: 'relaxing after work' };
    case 'younger-sibling':
      return m < 18 * 60 + 30 ? { spot: 'bedroom', activity: 'doing homework' } : { spot: 'living', activity: 'playing' };
    case 'older-sibling':
      return m < 18 * 60 ? { spot: 'away', activity: 'at football practice (home by 6 PM)' } : { spot: 'living', activity: 'on the phone' };
    case 'grandparent':
      return { spot: 'sofa', activity: 'resting' };
    case 'guardian':
      return { spot: 'kitchen', activity: 'cooking' };
    default:
      return { spot: 'living', activity: '' };
  }
}

export const ALLOWANCE_BASE = 20; // daily pocket money (base currency)
export const SAVINGS_GOAL = { goal: 'a new bicycle', targetBase: 600 };

/** Rough route graph for the guide arrow: which neighbouring location leads toward a target. */
export const ROUTE_NEXT: Partial<Record<LocationId, Partial<Record<LocationId, LocationId>>>> = {
  home: { town: 'town', grocery: 'town', clinic: 'town', city: 'town', library: 'town' },
  town: { home: 'home', grocery: 'grocery', clinic: 'clinic', city: 'city', library: 'city' },
  grocery: { home: 'town', town: 'town', clinic: 'town', city: 'town', library: 'town' },
  clinic: { home: 'town', town: 'town', grocery: 'town', city: 'town', library: 'town' },
  city: { home: 'town', town: 'town', grocery: 'town', clinic: 'town', library: 'library' },
  library: { home: 'city', town: 'city', grocery: 'city', clinic: 'city', city: 'city' },
};
