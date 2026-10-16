import type { MissionDef } from './types';
import type { GameStore } from '../core/store';
import { DEST_LABELS, ROOM_OBJECTS } from '../domain/homeLayout';
import { itemName } from '../domain/items';
import { CHALLENGES } from './challenges';
import { clamp, timeScore } from './validation';

const DESTS = ['laundry', 'bookshelf', 'bin', 'toybox', 'sink'] as const;

export function roomState(s: { state: { world: Record<string, unknown> } }, id: string): string {
  return String(s.state.world[`room.${id}`] ?? 'floor');
}

function placedCount(s: GameStore) {
  return ROOM_OBJECTS.filter((o) => ['placed', 'hidden'].includes(roomState(s, o.id))).length;
}

function placeAt(s: GameStore, dest: (typeof DESTS)[number]) {
  const held = ROOM_OBJECTS.filter((o) => roomState(s, o.id) === 'held');
  if (!held.length) return false;
  const right = held.filter((o) => o.dest === dest);
  const wrong = held.filter((o) => o.dest !== dest);
  if (wrong.some((o) => o.item === 'mug') && dest !== 'sink' && !s.getFlag('mugAsked', false)) {
    s.flag('mugAsked', true);
    s.presentChallenge(CHALLENGES['unclear-storage']);
    return true;
  }
  for (const o of right) {
    s.world(`room.${o.id}`, 'placed');
    s.release(o.item);
    s.bump('placedCount', 1);
    s.spendTime(0.5);
    s.bus.emit('fx', { kind: 'sparkle', target: dest });
    s.emit({ type: 'placed', item: o.item, dest });
  }
  if (right.length) s.toast(`Put away: ${right.map((o) => itemName(o.item)).join(', ')} (${placedCount(s)}/${ROOM_OBJECTS.length})`, 'good');
  if (wrong.length && !right.length) {
    s.bump('wrongPlacements', 1);
    s.spendTime(0.5);
    s.toast(`${wrong.map((o) => itemName(o.item)).join(' & ')} ${wrong.length > 1 ? "don't" : "doesn't"} go in the ${DEST_LABELS[dest]}.`, 'bad');
  }
  if (placedCount(s) >= ROOM_OBJECTS.length) {
    s.objective('tidy');
    s.toast('The room is spotless! Tell your parent.', 'good');
  }
  return true;
}

export const cleanRoom: MissionDef = {
  id: 'clean-room',
  title: 'Clean Your Room',
  category: 'household',
  difficulty: 1,
  icon: '🧹',
  summary: 'Pick up the mess, sort everything into the right place, and dispose of rubbish.',
  assignerRoles: ['father', 'mother', 'guardian', 'grandparent'],
  location: 'home',
  briefing: "{player}, your room looks like a storm passed through! Please clean it up — clothes in the laundry basket, books on the shelf, rubbish in the bin, toys in the toy box. You have about half an hour.",
  instructions: [
    'Walk up to an item and press E (or tap ✋) to pick it up. You can carry 2 things at once.',
    'Take items to where they belong and press E there to put them away.',
    'Dishes do not belong in the bedroom.',
    'Making the bed is a nice extra.',
  ],
  objectives: [
    { id: 'receive', label: 'Hear what needs to be done', type: 'talk', required: true },
    { id: 'tidy', label: 'Put every item where it belongs', type: 'place', required: true },
    { id: 'bed', label: 'Make the bed (optional)', type: 'inspect', required: false },
    { id: 'report', label: 'Ask {assigner} to inspect the room', type: 'talk', required: true, dependsOn: ['tidy'] },
  ],
  deadlineMinutes: 30,
  lateRule: 'partial',
  challenges: [{ id: 'sibling-interrupt' }],
  rewards: { xp: 90, badge: 'Neat Freak' },
  learning: ['Sort objects into categories', 'Break a big chore into small steps', 'Balance a chore with someone else\'s needs'],
  skills: ['household', 'planning', 'responsibility', 'empathy'],
  onStart(s) {
    for (const o of ROOM_OBJECTS) s.world(`room.${o.id}`, 'floor');
    s.world('room.bed', 'messy');
    s.flag('placedCount', 0);
  },
  onInteract(s, target) {
    if (target.startsWith('room:')) {
      const id = target.slice(5);
      const o = ROOM_OBJECTS.find((x) => x.id === id);
      if (!o || roomState(s, id) !== 'floor') return true;
      if (s.hold(o.item)) {
        s.world(`room.${id}`, 'held');
        s.spendTime(0.5);
      }
      return true;
    }
    if ((DESTS as readonly string[]).includes(target)) return placeAt(s, target as (typeof DESTS)[number]);
    if (target === 'bed') {
      if (s.state.world['room.bed'] === 'made') {
        s.toast('The bed is already made.', 'neutral');
      } else {
        s.world('room.bed', 'made');
        s.spendTime(2, 'Made the bed');
        s.objective('bed');
        s.bus.emit('fx', { kind: 'sparkle', target: 'bed' });
      }
      return true;
    }
    if (target === 'wardrobe' && s.state.hands.includes('mug')) {
      s.presentChallenge(CHALLENGES['unclear-storage']);
      return true;
    }
    return false;
  },
  onTalk(s, member) {
    if (member.id !== s.state.run!.assignerId) return false;
    const left = ROOM_OBJECTS.length - placedCount(s);
    if (left > 0) {
      s.say([
        {
          speaker: member.name,
          portrait: member.id,
          text: `I can still see ${left} thing${left > 1 ? 's' : ''} out of place. Need a hint?`,
          choices: [
            {
              label: '"Where do things go?"',
              tone: 'good',
              run: () => {
                s.flag('askedWhere', true);
                s.bump('comm', 8);
                s.say([{ speaker: member.name, portrait: member.id, text: 'Clothes → laundry basket. Books → bookshelf. Paper & wrappers → dustbin. Toys → toy box. Dirty dishes → kitchen sink.' }]);
              },
            },
            { label: "I'll keep going", run: () => {} },
            { label: "That's all I can do for now", tone: 'bad', run: () => s.finishMission('incomplete') },
          ],
        },
      ]);
      return true;
    }
    s.objective('tidy');
    s.objective('report');
    const hid = s.getFlag('hidMug', false);
    s.say(
      [
        { speaker: member.name, portrait: member.id, text: 'Let me take a look… 👀' },
        { speaker: member.name, portrait: member.id, text: hid ? 'Wait — why is there a dirty mug hiding in the wardrobe?! That goes to the sink.' : 'Wow, the floor is spotless!' },
        ...(s.state.world['room.bed'] === 'made' ? [{ speaker: member.name, portrait: member.id, text: 'And you made the bed without being asked? Impressive!' }] : []),
      ],
      () => {
        s.trust(member.id, hid ? 0 : 6);
        s.finishMission();
      },
    );
    return true;
  },
  progress(state, id) {
    if (id !== 'tidy') return null;
    const done = ROOM_OBJECTS.filter((o) => ['placed', 'hidden'].includes(String(state.world[`room.${o.id}`] ?? 'floor'))).length;
    const held = state.hands.length ? ` · holding ${state.hands.length}/2` : '';
    return `${done}/${ROOM_OBJECTS.length} put away${held}`;
  },
  evaluate(s, forced) {
    const run = s.state.run!;
    const f = run.flags;
    const remaining = ROOM_OBJECTS.filter((o) => ['floor', 'held'].includes(roomState(s, o.id))).length;
    const wrong = Number(f['wrongPlacements'] ?? 0);
    const hid = f['hidMug'] ? 1 : 0;
    const made = s.state.world['room.bed'] === 'made';
    const now = s.state.clock.minutes;
    const late = run.deadlineAt !== null && now > run.deadlineAt;
    const scores = {
      accuracy: clamp(100 - remaining * 10 - wrong * 6 - hid * 25),
      time: timeScore(now, run.deadlineAt, run.startedAt),
      planning: clamp(60 + (f['askedWhere'] ? 10 : 0) + (made ? 25 : 0) - wrong * 3),
      communication: clamp(65 + Number(f['comm'] ?? 0)),
      problem: clamp(70 + Number(f['problem'] ?? 0) - hid * 20),
      responsibility: clamp(70 + Number(f['resp'] ?? 0) + (made ? 10 : 0)),
    };
    const outcome = forced ?? (remaining > 0 ? 'incomplete' : late ? 'completed-late' : 'completed');
    const fb: string[] = [];
    if (remaining === 0) fb.push(`All ${ROOM_OBJECTS.length} items were put away${wrong ? `, after ${wrong} wrong guess${wrong > 1 ? 'es' : ''}` : ' on the first try'}.`);
    else fb.push(`${remaining} item${remaining > 1 ? 's were' : ' was'} still out of place.`);
    if (hid) fb.push('Hiding the mug made the room look clean but not be clean. Dishes go to the sink.');
    if (made) fb.push('Making the bed is a small habit that makes the whole room feel tidy.');
    if (f['helpedSibling']) fb.push('You paused to help your sibling with something urgent — good prioritising.');
    if (late) fb.push('You ran over time. Carrying 2 items per trip and planning a route saves minutes.');
    return { outcome, scores, feedback: fb };
  },
};
