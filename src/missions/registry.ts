import type { MissionDef } from './types';
import { groceryRun } from './grocery';
import { cleanRoom } from './cleanRoom';
import { helpSibling } from './helpSibling';
import { clinicVisit } from './clinic';
import { cookMeal } from './cook';
import { doLaundry } from './laundry';
import { busTrip } from './busTrip';
import { eveningErrands } from './errands';
import { dateNight } from './dateNight';
import { marketDay } from './marketDay';

/** All playable missions. New scenarios plug in here using the shared engine. */
export const MISSIONS: MissionDef[] = [groceryRun, cleanRoom, helpSibling, clinicVisit, cookMeal, doLaundry, busTrip, eveningErrands, dateNight, marketDay];

export function getMission(id: string): MissionDef | undefined {
  if (isCustomMissionId(id)) {
    customSync?.();
    return CUSTOM.get(id);
  }
  return MISSIONS.find((m) => m.id === id);
}

// ---------- parent-made custom missions (see ./custom.ts) ----------
// Kept out of MISSIONS so they never show up as reusable templates. custom.ts registers one per
// assignment that carries a `custom` spec; the sync hook lets lookups see assignments that arrived
// moments ago (before the store's next notify) without the registry importing the store.
const CUSTOM = new Map<string, MissionDef>();
let customSync: (() => void) | null = null;

export const isCustomMissionId = (id: string) => id.startsWith('custom:');

export function registerCustomMission(def: MissionDef) {
  if (!isCustomMissionId(def.id)) throw new Error(`custom mission ids must start with "custom:" (got ${def.id})`);
  CUSTOM.set(def.id, def);
}

export function unregisterCustomMission(id: string) {
  CUSTOM.delete(id);
}

/** Every registered custom mission (active or finished). */
export function customMissions(): MissionDef[] {
  customSync?.();
  return [...CUSTOM.values()];
}

/** Installed by custom.ts: called before custom lookups to register freshly-arrived assignments. */
export function setCustomMissionSync(fn: (() => void) | null) {
  customSync = fn;
}

/** Mission templates planned on the same engine but not yet playable (shown as "coming soon"). */
export const UPCOMING = [
  'Buy school supplies', 'Coordinate shared chores', 'Plan a family picnic budget', 'Fix a flat bicycle tyre',
];
