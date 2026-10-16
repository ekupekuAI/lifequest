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

/** All playable missions. New scenarios plug in here using the shared engine. */
export const MISSIONS: MissionDef[] = [groceryRun, cleanRoom, helpSibling, clinicVisit, cookMeal, doLaundry, busTrip, eveningErrands, dateNight];

export function getMission(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id);
}

/** Mission templates planned on the same engine but not yet playable (shown as "coming soon"). */
export const UPCOMING = [
  'Buy school supplies', 'Coordinate shared chores', 'Plan a family picnic budget', 'Fix a flat bicycle tyre',
];
