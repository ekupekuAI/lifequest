import type { MissionDef } from './types';
import { groceryRun } from './grocery';
import { cleanRoom } from './cleanRoom';
import { helpSibling } from './helpSibling';
import { clinicVisit } from './clinic';

/** All playable missions. New scenarios plug in here using the shared engine. */
export const MISSIONS: MissionDef[] = [groceryRun, cleanRoom, helpSibling, clinicVisit];

export function getMission(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id);
}

/** Mission templates planned on the same engine but not yet playable (shown as "coming soon"). */
export const UPCOMING = [
  'Prepare a simple meal', 'Complete the laundry', 'Take the bus to the library', 'Buy school supplies',
  'Find the lost house keys', 'Plan three errands before 7 PM', 'Coordinate shared chores', 'Manage a weekly budget',
];
