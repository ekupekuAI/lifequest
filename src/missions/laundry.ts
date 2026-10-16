// Do the Laundry — collect, sort (the hidden red sock!), measure detergent, run a 30-minute
// cycle and use the waiting time well, then hang everything to dry.
import type { MissionDef } from './types';
import type { GameStore } from '../core/store';
import { words } from '../domain/region';
import { HOME_CHALLENGES } from './homeChallenges';
import { clamp, timeScore } from './validation';

export const WASH_CYCLE = 30;
const WASHED_ITEMS = ['white-shirt', 'pink-shirt', 'clothes-pile'];

export const washerState = (s: { state: { world: Record<string, unknown> } }) => String(s.state.world['washer.state'] ?? 'idle');
const pileState = (s: GameStore, pile: 'whites' | 'colors') => String(s.state.world[`laundry.${pile}`] ?? 'basket');
const atHome = (s: GameStore) => s.state.location === 'home';
const minsLeft = (s: GameStore) => Math.max(0, Number(s.state.world['washer.endAt'] ?? 0) - s.state.clock.minutes);

function takePile(s: GameStore, pile: 'whites' | 'colors') {
  if (pileState(s, pile) !== 'basket') return;
  if (!s.hold(pile === 'whites' ? 'white-shirt' : 'clothes-pile')) return;
  s.world(`laundry.${pile}`, 'held');
  s.spendTime(0.5);
  if (pileState(s, 'whites') === 'held' && pileState(s, 'colors') === 'held') {
    s.objective('collect');
    s.toast('Both piles collected. Take them to the washing machine in the bathroom.', 'good');
  }
}

function startMachine(s: GameStore) {
  s.world('washer.state', 'running');
  s.world('washer.endAt', s.state.clock.minutes + WASH_CYCLE);
  s.flag('washStartedAt', s.state.clock.minutes);
  s.spendTime(0.5);
  s.objective('start');
  s.bus.emit('fx', { kind: 'bubble', target: 'washer' });
  s.toast(`The cycle takes ${WASH_CYCLE} minutes. Don't just wait — help someone, check the notice board, or tidy up meanwhile!`, 'info');
}

function startPrompt(s: GameStore) {
  s.say([
    {
      speaker: 'Washing machine',
      text: `Clothes in, detergent in. Start the ${WASH_CYCLE}-minute cycle?`,
      choices: [
        { label: '▶ Start the machine', tone: 'good', run: () => startMachine(s) },
        { label: 'Not yet', run: () => {} },
      ],
    },
  ]);
}

function unload(s: GameStore) {
  const mixed = s.getFlag('sortChoice', '') === 'mixed';
  const need = mixed ? 2 : 1;
  if (2 - s.state.hands.length < need) return s.toast(`Free ${need === 2 ? 'both hands' : 'a hand'} to take the wet clothes out.`, 'bad');
  const pink = s.state.world['laundry.result'] === 'pink';
  s.world('washer.state', 'empty');
  s.hold(pink ? 'pink-shirt' : 'white-shirt');
  if (mixed) s.hold('clothes-pile');
  if (s.getFlag('detergent', '') === 'too-much') {
    s.spendTime(8, 'Wiped up the overflowing foam');
    s.toast('Too much detergent — foam everywhere! Measure next time.', 'bad');
  }
  s.objective('unload');
  if (pink) s.presentChallenge(HOME_CHALLENGES['laundry-pink']);
  else s.toast('Fresh, clean clothes! Hang them on the drying rack in the living room.', 'good');
}

function washerInteract(s: GameStore) {
  const ws = washerState(s);
  if (ws === 'running') {
    const left = Math.max(1, Math.ceil(minsLeft(s)));
    s.say([
      {
        speaker: 'Washing machine',
        text: `Whirr… ${left} minute${left > 1 ? 's' : ''} left on the cycle.`,
        choices: [
          { label: 'Go and do something useful meanwhile', tone: 'good', run: () => {} },
          {
            label: 'Sit and watch it until it finishes',
            hint: 'Waiting is fine — but could you use the time?',
            run: () => {
              if (!s.isDone('wait-well')) s.flag('idleWait', true);
              s.spendTime(left, 'Watched the washing machine');
            },
          },
        ],
      },
    ]);
    return;
  }
  if (ws === 'done') return unload(s);
  if (ws === 'empty') return s.toast('The drum is empty. Hang the clothes on the drying rack.', 'neutral');
  // idle: sort → detergent → start
  if (!s.isDone('sort')) {
    const held = (['whites', 'colors'] as const).filter((p) => pileState(s, p) === 'held').length;
    if (held < 2) {
      s.toast(`Bring both piles from the bedroom laundry basket first (${held}/2).`, 'neutral');
      return;
    }
    s.presentChallenge(HOME_CHALLENGES['laundry-sort'], () => {
      s.objective('sort');
      s.presentChallenge(HOME_CHALLENGES['laundry-detergent'], () => {
        s.objective('detergent');
        startPrompt(s);
      });
    });
    return;
  }
  if (!s.isDone('detergent')) {
    s.presentChallenge(HOME_CHALLENGES['laundry-detergent'], () => {
      s.objective('detergent');
      startPrompt(s);
    });
    return;
  }
  startPrompt(s);
}

function hang(s: GameStore) {
  const items = s.state.hands.filter((h) => WASHED_ITEMS.includes(h));
  if (!items.length || !s.isDone('unload')) {
    s.say([{ speaker: '', text: s.isDone('hang') ? 'Clothes are drying nicely.' : 'A drying rack. Wet clothes go here after washing.' }]);
    return;
  }
  for (const it of items) s.release(it);
  s.world('rack.fullDay', s.state.clock.day);
  s.spendTime(4, 'Hung the clothes to dry');
  s.bus.emit('fx', { kind: 'sparkle', target: 'drying-rack' });
  s.objective('hang');
  s.toast(`All hung up! Tell ${s.assigner()?.name ?? 'your parent'}.`, 'good');
}

export const doLaundry: MissionDef = {
  id: 'laundry',
  title: 'Do the Laundry',
  category: 'household',
  difficulty: 2,
  icon: '🧺',
  summary: 'Sort, wash and hang the family laundry — and plan around a 30-minute wash.',
  assignerRoles: ['father', 'mother', 'guardian'],
  location: 'home',
  briefing:
    "{player}, can you do the laundry? The dirty clothes are in the laundry basket in the bedroom — whites and colours. Wash them in the machine in the bathroom and hang them on the rack in the living room. The white school shirts are needed tomorrow, so be careful!",
  instructions: [
    'Collect the whites pile and the colours pile from the bedroom laundry basket (2 hands).',
    'Sort at the washing machine — coloured things can turn whites pink.',
    'Read the detergent label: measure, do not guess.',
    `The machine takes ${WASH_CYCLE} minutes. Do something useful while you wait.`,
    'Take the clothes out and hang them on the drying rack, then report back.',
  ],
  objectives: [
    { id: 'receive', label: 'Accept the task', type: 'talk', required: true },
    { id: 'collect', label: 'Collect the whites and colours piles', type: 'collect', required: true, where: { location: 'home', target: 'pile-whites' }, hint: 'The two piles are next to the laundry basket in the bedroom (bottom-left of the room). Carry one in each hand.' },
    { id: 'sort', label: 'Sort the clothes at the washing machine', type: 'inspect', required: true, dependsOn: ['collect'], where: { location: 'home', target: 'washer' }, hint: 'The washing machine is in the bathroom. A single red item can dye a whole white load.' },
    { id: 'detergent', label: 'Add the right amount of detergent', type: 'inspect', required: true, dependsOn: ['sort'], where: { location: 'home', target: 'washer' }, hint: 'The label tells you how much. More soap does not mean cleaner.' },
    { id: 'start', label: 'Start the washing machine', type: 'inspect', required: true, dependsOn: ['detergent'], where: { location: 'home', target: 'washer' }, hint: `Press start. The cycle runs ${WASH_CYCLE} minutes by itself.` },
    { id: 'wait-well', label: 'Use the waiting time for something useful (optional)', type: 'inspect', required: false, dependsOn: ['start'], where: { location: 'home', target: 'notice-board' }, hint: 'While the machine runs: help a family member, check the notice board or tidy up.' },
    { id: 'unload', label: 'Take the clothes out when the cycle ends', type: 'collect', required: true, dependsOn: ['start'], where: { location: 'home', target: 'washer' }, hint: 'Listen for the beep. You need free hands.' },
    { id: 'hang', label: 'Hang the clothes on the drying rack', type: 'place', required: true, dependsOn: ['unload'], where: { location: 'home', target: 'drying-rack' }, hint: 'The drying rack stands in the living room by the window.' },
    { id: 'report', label: 'Tell {assigner} the laundry is done', type: 'talk', required: true, dependsOn: ['hang'], where: { location: 'home', target: 'assigner' }, hint: 'Find {assigner} and report.' },
  ],
  deadlineMinutes: 70,
  lateRule: 'partial',
  challenges: [],
  rewards: { xp: 120, badge: 'Laundry Pro' },
  learning: ['Sort laundry by colour and check pockets & piles', 'Measure detergent by reading the label', 'Plan other jobs around a long wait', 'Be honest when something goes wrong'],
  skills: ['household', 'planning', 'time', 'responsibility'],
  available: () => ({ ok: true }),
  onStart(s) {
    s.world('laundry.whites', 'basket');
    s.world('laundry.colors', 'basket');
    s.world('washer.state', 'idle');
    s.world('laundry.result', 'white');
    delete s.state.world['washer.endAt'];
    if (s.state.world['rack.fullDay'] === s.state.clock.day) delete s.state.world['rack.fullDay'];
    s.flag('waitUsed', 0);
  },
  onInteract(s, target) {
    switch (target) {
      case 'pile-whites':
        takePile(s, 'whites');
        return true;
      case 'pile-colors':
        takePile(s, 'colors');
        return true;
      case 'washer':
        washerInteract(s);
        return true;
      case 'drying-rack':
        hang(s);
        return true;
      default:
        return false;
    }
  },
  onEvent(s, ev) {
    const running = washerState(s) === 'running';
    if (ev.type === 'minute' && running) {
      if (minsLeft(s) <= 0) {
        s.world('washer.state', 'done');
        s.toast('🔔 Beep beep! The washing machine has finished.', 'good');
        if (atHome(s)) s.bus.emit('fx', { kind: 'check', target: 'washer' });
      } else if (atHome(s) && Math.floor(minsLeft(s)) % 3 === 0) s.bus.emit('fx', { kind: 'bubble', target: 'washer' });
      return;
    }
    if (!running) return;
    const useful =
      (ev.type === 'interact' && !['washer', 'drying-rack', 'pile-whites', 'pile-colors'].includes(ev.target)) || ev.type === 'talk';
    if (useful) {
      s.bump('waitUsed', 1);
      s.objective('wait-well');
    }
  },
  onTalk(s, member) {
    if (member.id !== s.state.run!.assignerId) return false;
    if (!s.isDone('hang')) {
      const ws = washerState(s);
      const tip =
        ws === 'running'
          ? `The machine still has about ${Math.ceil(minsLeft(s))} minutes. Anything else you could do meanwhile?`
          : ws === 'done'
            ? 'I heard the beep — the clothes are ready to come out.'
            : !s.isDone('collect')
              ? 'Both piles are next to the laundry basket in the bedroom.'
              : s.isDone('unload')
                ? 'Hang them on the rack in the living room so they dry by morning.'
                : 'The machine is in the bathroom.';
      s.say([
        {
          speaker: member.name,
          portrait: member.id,
          text: `How's the laundry going? ${tip}`,
          choices: [
            { label: '"How should I sort it?"', tone: 'good', run: () => { s.bump('comm', 6); s.say([{ speaker: member.name, portrait: member.id, text: 'Whites separate from colours — and always check the whites pile for anything coloured. One capful of detergent is enough.' }]); } },
            { label: "I'll keep going", run: () => {} },
            { label: "I can't finish this", tone: 'bad', run: () => s.finishMission('incomplete') },
          ],
        },
      ]);
      return true;
    }
    s.objective('report');
    const pink = s.state.world['laundry.result'] === 'pink';
    const hid = s.getFlag('hidPink', false);
    const lines = [
      { speaker: member.name, portrait: member.id, text: 'Let me have a look at the rack… 👀' },
      {
        speaker: member.name,
        portrait: member.id,
        text: hid
          ? 'Wait — why is this school shirt PINK, hidden at the back? I need to know about these things so we can fix them in time.'
          : pink
            ? 'The pink shirts we can soak tomorrow. Thank you for being honest about it.'
            : words('{praise} Bright white shirts and everything hung neatly.'),
      },
      ...(s.getFlag('waitUsed', 0) > 0 ? [{ speaker: member.name, portrait: member.id, text: 'And you got other things done while the machine ran. Smart planning!' }] : []),
    ];
    s.say(lines, () => {
      s.trust(member.id, hid ? -5 : 6);
      s.finishMission();
    });
    return true;
  },
  progress(state, id) {
    if (id === 'collect') {
      const n = (['whites', 'colors'] as const).filter((p) => state.world[`laundry.${p}`] && state.world[`laundry.${p}`] !== 'basket').length;
      return `${n}/2 piles`;
    }
    if (id === 'unload' && state.world['washer.state'] === 'running') {
      const left = Math.max(0, Math.ceil(Number(state.world['washer.endAt'] ?? 0) - state.clock.minutes));
      return `washing · ${left} min left`;
    }
    if (id === 'unload' && state.world['washer.state'] === 'done') return 'cycle finished!';
    return null;
  },
  evaluate(s, forced) {
    const run = s.state.run!;
    const f = run.flags;
    const missing = doLaundry.objectives.filter((o) => o.required && o.id !== 'report' && !run.objectives[o.id]?.done).length;
    const hung = !!run.objectives['hang']?.done;
    const now = s.state.clock.minutes;
    const late = run.deadlineAt !== null && now > run.deadlineAt;
    const sort = String(f['sortChoice'] ?? '');
    const det = String(f['detergent'] ?? '');
    const pinkChoice = String(f['pinkChoice'] ?? '');
    const pinkStays = s.state.world['laundry.result'] === 'pink' && !!pinkChoice;
    const used = Number(f['waitUsed'] ?? 0) > 0;
    const scores = {
      accuracy: clamp(100 - missing * 12 - (pinkStays ? 30 : 0) - (pinkChoice === 'rewash' ? 10 : 0) - (det === 'too-much' ? 10 : det === 'none' ? 20 : 0)),
      time: timeScore(now, run.deadlineAt, run.startedAt),
      planning: clamp(55 + (sort === 'checked' ? 20 : 0) + (used ? 25 : 0) - (f['idleWait'] ? 10 : 0) - (sort === 'mixed' ? 10 : 0)),
      problem: clamp(65 + (sort === 'checked' ? 10 : 0) + (pinkChoice === 'rewash' ? 20 : pinkChoice === 'told' ? 10 : pinkChoice === 'hid' ? -25 : 0)),
      responsibility: clamp(75 + (pinkChoice === 'told' ? 15 : pinkChoice === 'rewash' ? 10 : 0) - (f['hidPink'] ? 35 : 0) + (det === 'right' ? 5 : 0)),
      communication: clamp(65 + Number(f['comm'] ?? 0) - (f['hidPink'] ? 20 : 0)),
    };
    const outcome = forced ?? (!hung ? 'incomplete' : late ? 'completed-late' : 'completed');
    const fb: string[] = [];
    if (hung) fb.push(pinkStays ? 'The laundry is drying — but some white shirts are pink.' : 'Clean laundry is hanging up to dry.');
    else fb.push(`The laundry was not finished — ${missing} step${missing === 1 ? '' : 's'} left.`);
    if (sort === 'checked') fb.push('Checking the whites pile found the hidden red sock. Always check before you wash!');
    if (sort === 'whites-unchecked') fb.push('Separating colours was right, but a red sock was hiding in the whites. Check the pile first.');
    if (sort === 'mixed') fb.push('Washing everything together saved a load, but the red sock dyed the whites pink.');
    if (det === 'too-much') fb.push('Too much detergent made foam overflow. Measure with the cap.');
    if (det === 'none') fb.push('No detergent means clothes are not really clean.');
    if (used) fb.push(`You used the ${WASH_CYCLE}-minute wash to get other things done — great planning around waiting.`);
    else if (run.objectives['start']?.done) fb.push(`Tip: the ${WASH_CYCLE}-minute wash is a perfect time to do another job.`);
    if (pinkChoice === 'rewash') fb.push('Re-washing with whitener fixed the shirts, at the cost of 30 minutes.');
    if (pinkChoice === 'told') fb.push('Telling the truth about the pink shirts built trust.');
    if (f['hidPink']) fb.push('Hiding the pink shirt backfired. Mistakes are easier to fix when people know early.');
    if (late) fb.push('The laundry ran late. Start long jobs (like a wash) first, then do short ones while you wait.');
    return { outcome, scores, feedback: fb };
  },
};
