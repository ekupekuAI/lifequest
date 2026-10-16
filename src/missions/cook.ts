// Help Make Dinner — a simple vegetable soup. Teaches order of steps (wash → chop → cook),
// multitasking while something cooks, and stove safety (never leave cooking unattended).
import type { MissionDef } from './types';
import type { GameStore } from '../core/store';
import { words } from '../domain/region';
import { HOME_CHALLENGES } from './homeChallenges';
import { clamp, timeScore } from './validation';

/** game minutes after the veg goes in */
export const SOUP_READY = 8;
export const SOUP_BURNT = 15;

const VEG = ['carrot', 'onion'];
export const stoveState = (s: { state: { world: Record<string, unknown> } }) => String(s.state.world['stove.state'] ?? 'empty');
const vegState = (s: GameStore) => String(s.state.world['veg.state'] ?? 'fridge');
const onHeat = (s: GameStore) => ['cooking', 'ready'].includes(stoveState(s));
const elapsed = (s: GameStore) => s.state.clock.minutes - Number(s.state.world['stove.startAt'] ?? s.state.clock.minutes);
const tableSet = (s: GameStore) => s.state.world['table.setDay'] === s.state.clock.day;
const atHome = (s: GameStore) => s.state.location === 'home';
const holdsVeg = (s: GameStore) => VEG.every((v) => s.state.hands.includes(v));

function presentBurn(s: GameStore) {
  s.flag('burnPending', false);
  if (s.getFlag('burnResolved', false)) return;
  s.flag('burnResolved', true);
  s.presentChallenge(HOME_CHALLENGES['pot-burning']);
}

function burn(s: GameStore) {
  if (stoveState(s) === 'burnt') return;
  s.world('stove.state', 'burnt');
  s.flag('burnt', true);
  if (atHome(s)) s.bus.emit('fx', { kind: 'smoke', target: 'stove' });
  s.log('The soup was left on the heat too long and burned.', 'Set a timer or stay near the stove while food cooks.', 'bad');
  if (s.ui.dialogue) s.flag('burnPending', true);
  else presentBurn(s);
}

function tickStove(s: GameStore) {
  if (s.getFlag('burnPending', false) && !s.ui.dialogue) return presentBurn(s);
  if (!onHeat(s)) return;
  const el = elapsed(s);
  if (el >= SOUP_BURNT) return burn(s);
  if (stoveState(s) === 'cooking' && el >= SOUP_READY) {
    s.world('stove.state', 'ready');
    s.flag('readyAt', Number(s.state.world['stove.startAt']) + SOUP_READY);
    s.toast('The soup is ready! Take the pot off the stove before it burns.', 'good');
    if (atHome(s)) s.bus.emit('fx', { kind: 'check', target: 'stove' });
  } else if (stoveState(s) === 'ready' && el >= SOUP_BURNT - 3 && !s.getFlag('stickWarned', false)) {
    s.flag('stickWarned', true);
    s.toast('Something smells like it is starting to stick…', 'bad');
  }
  if (atHome(s) && Math.floor(el) % 2 === 0) s.bus.emit('fx', { kind: 'steam', target: 'stove' });
}

function leftStoveOn(s: GameStore) {
  s.flag('leftStove', true);
  s.world('stove.state', 'burnt');
  s.flag('burnt', true);
  s.log('You left the house while the stove was on.', 'Never leave cooking unattended — turn the stove off before you go anywhere.', 'bad');
  const a = s.assigner();
  s.say(
    [
      { speaker: a?.name ?? 'Phone call', portrait: a?.id, text: '📞 Hello? I smelled smoke in the kitchen — the soup was still on the stove and nobody was there! I have turned it off.' },
      {
        speaker: a?.name ?? 'Phone call',
        portrait: a?.id,
        text: words("Everyone is safe, {endearment}, so let's stay calm. But remember the kitchen rule: NEVER leave cooking unattended. If you have to go somewhere, turn the stove off first. A pot left on can start a fire."),
      },
    ],
    () => presentBurn(s),
  );
}

function doChop(s: GameStore) {
  if (!holdsVeg(s)) return;
  for (const v of VEG) s.release(v);
  s.hold('chopped-veg');
  s.world('veg.state', 'chopped');
  s.spendTime(4, 'Chopped carrots and onion');
  s.bus.emit('fx', { kind: 'sparkle', target: 'chopping-board' });
  s.objective('wash');
  s.objective('chop');
}

function stoveInteract(s: GameStore) {
  const st = stoveState(s);
  if (st === 'burnt') {
    if (!s.getFlag('burnResolved', false)) presentBurn(s);
    else s.toast('The burnt pot is soaking.', 'neutral');
    return;
  }
  if (st === 'empty') {
    if (s.state.hands.includes('chopped-veg')) {
      s.release('chopped-veg');
      s.world('veg.state', 'in-pot');
      s.world('stove.state', 'cooking');
      s.world('stove.startAt', s.state.clock.minutes);
      s.flag('cookStartedAt', s.state.clock.minutes);
      s.spendTime(1);
      s.objective('cook');
      s.bus.emit('fx', { kind: 'steam', target: 'stove' });
      s.toast(`The soup is simmering — about ${SOUP_READY} minutes. Set the table meanwhile, but stay home!`, 'info');
      return;
    }
    if (VEG.some((v) => s.state.hands.includes(v))) return s.toast('Wash and chop the vegetables before they go in the pot.', 'neutral');
    return s.say([{ speaker: '', text: 'A pot of water is waiting on the stove. First get carrots and an onion from the fridge, wash them, and chop them.' }]);
  }
  if (st === 'cooking') {
    const left = Math.max(1, Math.ceil(SOUP_READY - elapsed(s)));
    s.say([
      {
        speaker: 'Stove',
        text: `The soup is bubbling gently. It needs about ${left} more minute${left > 1 ? 's' : ''}.`,
        choices: [
          {
            label: tableSet(s) ? 'Wait by the stove until it is ready' : 'Just stand here and wait',
            hint: tableSet(s) ? undefined : 'The table is not set yet…',
            run: () => {
              if (!tableSet(s)) s.flag('idleWait', true);
              s.spendTime(left, 'Waited for the soup');
            },
          },
          { label: 'Stir it and keep doing other jobs', tone: 'good', run: () => s.flag('stirred', true) },
          {
            label: 'Take it off now',
            tone: 'bad',
            hint: 'The carrots are still hard',
            run: () => {
              s.flag('undercooked', true);
              takePotOff(s);
            },
          },
        ],
      },
    ]);
    return;
  }
  if (st === 'ready' || st === 'off-ready') return takePotOff(s);
  if (st === 'off') return s.toast(s.state.hands.includes('cooking-pot') ? 'Carry the pot to the dining table.' : 'The stove is off. 👍', 'neutral');
}

function takePotOff(s: GameStore) {
  if (s.state.hands.length >= 2) return s.toast('Free a hand first — a hot pot needs both hands and a cloth.', 'bad');
  s.world('stove.state', 'off');
  s.hold('cooking-pot');
  s.flag('offAt', s.state.clock.minutes);
  s.objective('off-heat');
  s.toast('Stove off, pot lifted with a cloth. Carry it to the table.', 'good');
}

function tableInteract(s: GameStore) {
  if (s.state.hands.includes('plates')) {
    s.release('plates');
    s.world('table.setDay', s.state.clock.day);
    s.spendTime(2, 'Set the table');
    s.bus.emit('fx', { kind: 'sparkle', target: 'dining-table' });
    if (onHeat(s)) s.flag('multitask', true);
    s.objective('table');
    return;
  }
  if (s.state.hands.includes('cooking-pot')) {
    if (!tableSet(s)) return s.toast('Set the table first — plates & spoons are in the kitchen cupboard.', 'neutral');
    s.release('cooking-pot');
    s.world('soup.servedDay', s.state.clock.day);
    s.spendTime(2, 'Served the soup');
    s.bus.emit('fx', { kind: 'steam', target: 'dining-table' });
    s.objective('serve');
    s.toast('Dinner is served! Tell {assigner}.'.replace('{assigner}', s.assigner()?.name ?? 'your parent'), 'good');
    return;
  }
  s.say([{ speaker: '', text: tableSet(s) ? 'The table is set for dinner.' : 'The dining table. Plates & spoons are in the kitchen cupboard.' }]);
}

export const cookMeal: MissionDef = {
  id: 'cook-meal',
  title: 'Help Make Dinner',
  category: 'household',
  difficulty: 2,
  icon: '🍲',
  summary: 'Make a simple vegetable soup: wash, chop, cook, set the table and serve — safely.',
  assignerRoles: ['mother', 'father', 'guardian', 'grandparent'],
  location: 'home',
  briefing:
    "{player}, will you help me make dinner? Tonight it's a simple vegetable soup. Carrots and an onion are in the fridge. Wash them, chop them, and put them in the pot on the stove. While it cooks, please set the table. And remember — never walk away from a hot stove!",
  instructions: [
    'Take carrots and an onion from the fridge (both hands).',
    'Wash them at the kitchen sink BEFORE chopping.',
    'Chop them on the chopping board, then put them in the pot on the stove.',
    `The soup is ready after about ${SOUP_READY} minutes — it burns if left too long.`,
    'Use the cooking time: plates & spoons are in the kitchen cupboard → dining table.',
    'Never leave the house while the stove is on.',
  ],
  objectives: [
    { id: 'receive', label: 'Hear the recipe', type: 'talk', required: true },
    { id: 'get-veg', label: 'Take carrots & an onion from the fridge', type: 'collect', required: true, where: { location: 'home', target: 'fridge' }, hint: 'The fridge is in the top-left corner of the kitchen. You need both hands free.' },
    { id: 'wash', label: 'Wash the vegetables at the sink', type: 'inspect', required: true, dependsOn: ['get-veg'], where: { location: 'home', target: 'sink' }, hint: 'The kitchen sink is on the counter next to the stove. Always wash before you chop.' },
    { id: 'chop', label: 'Chop them on the chopping board', type: 'inspect', required: true, dependsOn: ['get-veg'], where: { location: 'home', target: 'chopping-board' }, hint: 'The chopping board sits on the counter between the stove and the sink.' },
    { id: 'cook', label: 'Put the vegetables in the pot on the stove', type: 'place', required: true, dependsOn: ['chop'], where: { location: 'home', target: 'stove' }, hint: `Carry the chopped vegetables to the stove. The soup needs about ${SOUP_READY} minutes.` },
    { id: 'table', label: 'Set the table while it cooks', type: 'place', required: true, where: { location: 'home', target: 'plates' }, hint: 'Plates & spoons are in the kitchen cupboard (right end of the counter). Take them to the dining table.' },
    { id: 'off-heat', label: 'Take the pot off the stove when it is ready', type: 'inspect', required: true, dependsOn: ['cook'], where: { location: 'home', target: 'stove' }, hint: `Ready after ${SOUP_READY} minutes, burnt after ${SOUP_BURNT}. You need a free hand.` },
    { id: 'serve', label: 'Serve the soup at the dining table', type: 'deliver', required: true, dependsOn: ['off-heat', 'table'], where: { location: 'home', target: 'dining-table' }, hint: 'Carry the pot to the set table.' },
    { id: 'report', label: 'Tell {assigner} dinner is ready', type: 'talk', required: true, dependsOn: ['serve'], where: { location: 'home', target: 'assigner' }, hint: 'Find {assigner} and let them know.' },
  ],
  deadlineMinutes: 45,
  lateRule: 'partial',
  challenges: [],
  rewards: { xp: 120, badge: 'Junior Chef' },
  learning: ['Follow steps in the right order (wash → chop → cook)', 'Use waiting time to do another job', 'Never leave cooking unattended', 'Own up to kitchen mistakes'],
  skills: ['household', 'planning', 'responsibility', 'time'],
  available: () => ({ ok: true }),
  onStart(s) {
    s.world('stove.state', 'empty');
    s.world('veg.state', 'fridge');
    s.world('plates.taken', false);
    delete s.state.world['stove.startAt'];
    if (s.state.world['table.setDay'] === s.state.clock.day) delete s.state.world['table.setDay'];
    if (s.state.world['soup.servedDay'] === s.state.clock.day) delete s.state.world['soup.servedDay'];
  },
  onInteract(s, target) {
    switch (target) {
      case 'fridge': {
        if (vegState(s) !== 'fridge') return false; // normal snack behaviour
        if (s.state.hands.length > 0) {
          s.toast('You need both hands free for carrots and an onion.', 'bad');
          return true;
        }
        s.hold('carrot');
        s.hold('onion');
        s.world('veg.state', 'held');
        s.spendTime(1);
        s.objective('get-veg');
        s.toast('Got carrots and an onion. Wash them at the sink next.', 'good');
        return true;
      }
      case 'sink': {
        if (!VEG.some((v) => s.state.hands.includes(v))) return false;
        if (vegState(s) === 'washed') {
          s.toast('They are already clean. Chop them on the chopping board.', 'neutral');
          return true;
        }
        s.world('veg.state', 'washed');
        s.flag('washedFirst', true);
        s.spendTime(2, 'Washed the vegetables');
        s.bus.emit('fx', { kind: 'bubble', target: 'sink' });
        s.objective('wash');
        return true;
      }
      case 'chopping-board': {
        if (!holdsVeg(s)) {
          if (s.state.hands.includes('chopped-veg')) s.toast('Already chopped! Put them in the pot on the stove.', 'neutral');
          else s.say([{ speaker: '', text: 'A wooden chopping board and a knife. Bring washed vegetables here.' }]);
          return true;
        }
        if (vegState(s) !== 'washed') {
          s.presentChallenge(HOME_CHALLENGES['unwashed-veg'], () => doChop(s));
          return true;
        }
        doChop(s);
        return true;
      }
      case 'stove':
        stoveInteract(s);
        return true;
      case 'plates': {
        if (s.state.world['plates.taken']) {
          s.toast('You already took the plates & spoons.', 'neutral');
          return true;
        }
        if (s.hold('plates')) {
          s.world('plates.taken', true);
          s.spendTime(0.5);
        }
        return true;
      }
      case 'dining-table':
        tableInteract(s);
        return true;
      default:
        return false;
    }
  },
  onEvent(s, ev) {
    if (ev.type === 'minute') tickStove(s);
    if (ev.type === 'location' && ev.to !== 'home' && onHeat(s)) leftStoveOn(s);
  },
  onTalk(s, member) {
    if (member.id !== s.state.run!.assignerId) return false;
    if (!s.isDone('serve')) {
      const st = stoveState(s);
      const tip = onHeat(s)
        ? st === 'ready'
          ? 'The soup is ready — take it off the stove now!'
          : 'The soup is cooking. Have you set the table yet?'
        : !s.isDone('get-veg')
          ? 'Start with carrots and an onion from the fridge.'
          : !s.isDone('chop')
            ? 'Wash the vegetables, then chop them on the board.'
            : !s.isDone('table')
              ? 'Plates & spoons are in the kitchen cupboard.'
              : 'Bring the pot to the table when it is ready.';
      s.say([
        {
          speaker: member.name,
          portrait: member.id,
          text: `How is dinner coming along? ${tip}`,
          choices: [
            { label: '"What order do I do things in?"', tone: 'good', run: () => { s.bump('comm', 6); s.say([{ speaker: member.name, portrait: member.id, text: 'Fridge → wash at the sink → chop → pot on the stove. While it simmers, set the table. Then pot off the heat and serve!' }]); } },
            { label: "I'll keep going", run: () => {} },
            { label: "I can't finish this", tone: 'bad', run: () => s.finishMission('incomplete') },
          ],
        },
      ]);
      return true;
    }
    s.objective('report');
    const choice = s.getFlag('burnChoice', '');
    const lines = [
      { speaker: member.name, portrait: member.id, text: 'Let me taste… 🥄' },
      {
        speaker: member.name,
        portrait: member.id,
        text: s.getFlag('hidBurnt', false)
          ? 'Hmm, this tastes smoky… did the pot burn? You can always tell me when something goes wrong.'
          : s.getFlag('undercooked', false)
            ? 'The carrots are a bit crunchy — soup needs its full time. Still, thank you!'
            : choice === 'water' || choice === 'told'
              ? 'A tiny bit smoky, but you saved it. Good thinking!'
              : words('{praise} This soup is delicious!'),
      },
      ...(s.getFlag('multitask', false) ? [{ speaker: member.name, portrait: member.id, text: 'And you set the table while it cooked — that is how real cooks work.' }] : []),
    ];
    s.say(lines, () => {
      s.trust(member.id, s.getFlag('hidBurnt', false) ? -4 : s.getFlag('leftStove', false) ? 0 : 6);
      s.finishMission();
    });
    return true;
  },
  progress(state, id) {
    if (id === 'cook' || id === 'off-heat') {
      const st = String(state.world['stove.state'] ?? 'empty');
      if (st === 'cooking' || st === 'ready') {
        const el = state.clock.minutes - Number(state.world['stove.startAt'] ?? state.clock.minutes);
        return st === 'ready' ? `ready! burns in ${Math.max(0, Math.ceil(SOUP_BURNT - el))} min` : `cooking · ${Math.max(0, Math.ceil(SOUP_READY - el))} min left`;
      }
      if (st === 'burnt') return 'burnt!';
    }
    if (id === 'get-veg') return `${VEG.filter((v) => state.hands.includes(v)).length}/2 in hand`;
    return null;
  },
  evaluate(s, forced) {
    const run = s.state.run!;
    const f = run.flags;
    const def = cookMeal;
    const missing = def.objectives.filter((o) => o.required && o.id !== 'report' && !run.objectives[o.id]?.done).length;
    const served = !!run.objectives['serve']?.done;
    const now = s.state.clock.minutes;
    const late = run.deadlineAt !== null && now > run.deadlineAt;
    const burnt = !!f['burnt'];
    const choice = String(f['burnChoice'] ?? '');
    const left = !!f['leftStove'];
    const hid = !!f['hidBurnt'];
    const scores = {
      accuracy: clamp(100 - missing * 12 - (f['orderSlip'] ? 8 : 0) - (f['unwashed'] ? 20 : 0) - (f['undercooked'] ? 20 : 0) - (burnt ? (choice === 'restart' ? 5 : 20) : 0)),
      time: timeScore(now, run.deadlineAt, run.startedAt),
      planning: clamp(60 + (f['multitask'] ? 30 : 0) + (f['washedFirst'] ? 10 : 0) - (f['idleWait'] ? 10 : 0) - (burnt && !left ? 10 : 0)),
      problem: clamp(70 + (choice === 'water' ? 15 : choice === 'told' ? 15 : choice === 'restart' ? 10 : choice === 'hid' ? -25 : 0) + (f['rinsedChopped'] ? 5 : 0)),
      responsibility: clamp(80 + (burnt || left ? 0 : 15) - (left ? 40 : 0) - (hid ? 25 : 0) + (choice === 'told' ? 10 : 0)),
      communication: clamp(65 + Number(f['comm'] ?? 0) + (choice === 'told' ? 10 : 0) - (hid ? 20 : 0)),
    };
    const outcome = forced ?? (!served ? 'incomplete' : late ? 'completed-late' : 'completed');
    const fb: string[] = [];
    if (served) fb.push(burnt ? 'Dinner made it to the table despite the burnt pot.' : f['undercooked'] ? 'Dinner was served, but taken off the heat too early.' : 'A hot, well-cooked soup made it to the table.');
    else fb.push(`Dinner was not served — ${missing} step${missing === 1 ? '' : 's'} still to do.`);
    if (f['washedFirst'] && !f['orderSlip']) fb.push('You washed the vegetables before chopping — the right order.');
    if (f['orderSlip']) fb.push('Wash vegetables before chopping; going back costs time.');
    if (f['unwashed']) fb.push('Unwashed vegetables went into the soup. Boiling does not remove soil.');
    if (f['multitask']) fb.push('Setting the table while the soup simmered was great multitasking.');
    else if (served) fb.push('Tip: set the table while the soup cooks instead of waiting.');
    if (left) fb.push('You left home with the stove on. Never leave cooking unattended — switch it off before going anywhere.');
    if (burnt && !left) fb.push(`The soup burned after ${SOUP_BURNT} minutes on the heat. Stay close and check the pot.`);
    if (choice === 'told') fb.push('Telling the truth about the burnt pot built trust.');
    if (hid) fb.push('Hiding the burnt pot did not work — the smoky taste gave it away.');
    if (late) fb.push('Dinner was late. Planning two jobs at once saves time.');
    return { outcome, scores, feedback: fb };
  },
};
