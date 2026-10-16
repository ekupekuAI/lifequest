import type { MissionDef } from './types';
import type { GameStore } from '../core/store';
import { SCHOOL_REQUIRED, SCHOOL_SPOTS } from '../domain/homeLayout';
import { itemName } from '../domain/items';
import { clamp, timeScore } from './validation';

const sib = (s: GameStore) => s.memberByRole('younger-sibling');
const inBag = (s: GameStore, item: string) => s.state.world[`bag.${item}`] === true;
const packedCount = (s: GameStore) => SCHOOL_REQUIRED.filter((i) => inBag(s, i)).length;

function revealList(s: GameStore, how: string) {
  if (s.getFlag('knowsList', false)) return;
  s.flag('knowsList', true);
  s.flag('learnedBy', how);
  s.objective('find-out');
}

function bagMenu(s: GameStore) {
  const sibling = sib(s);
  const contents = ['notebook', 'pencil box', ...SCHOOL_REQUIRED.filter((i) => inBag(s, i)).map((i) => itemName(i).toLowerCase())];
  if (s.state.world['bag.comic'] !== false) contents.push('comic book');
  const choices = [
    ...s.state.hands
      .filter((h) => ['geometry-box', 'crayons', 'water-bottle', 'sports-shoes', 'empty-bottle'].includes(h))
      .map((h) => ({
        label: `Pack the ${itemName(h).toLowerCase()}`,
        tone: 'good' as const,
        run: () => {
          if (h === 'empty-bottle') {
            s.toast("It's empty! Fill it at the kitchen sink first.", 'bad');
            s.bump('wrongPack', 1);
            return;
          }
          s.release(h);
          s.world(`bag.${h}`, true);
          s.spendTime(0.5);
          s.toast(`Packed: ${itemName(h)} (${packedCount(s)}/${SCHOOL_REQUIRED.length})`, 'good');
          s.bus.emit('fx', { kind: 'sparkle', target: 'school-bag' });
          if (packedCount(s) >= SCHOOL_REQUIRED.length) s.objective('pack');
        },
      })),
    ...(s.state.world['bag.comic'] !== false
      ? [
          {
            label: 'Take out the comic book (not needed for school)',
            run: () => {
              s.world('bag.comic', false);
              s.objective('declutter');
              s.toast('Removed the comic book. Lighter bag!', 'good');
            },
          },
        ]
      : []),
    { label: 'Close the bag', run: () => {} },
  ];
  s.say([{ speaker: `${sibling?.name ?? 'Sibling'}'s school bag`, text: `Inside: ${contents.join(', ')}.`, choices }]);
}

export const helpSibling: MissionDef = {
  id: 'help-sibling',
  title: 'Help Your Younger Sibling',
  category: 'family',
  difficulty: 2,
  icon: '🎒',
  summary: 'Figure out what your sibling needs for school tomorrow and pack the bag.',
  assignerRoles: ['mother', 'father', 'guardian', 'grandparent'],
  location: 'home',
  briefing: "{sibling} has school tomorrow and the bag is a mess. Can you help pack it before bedtime? I don't remember the timetable — ask {sibling}.",
  instructions: [
    'Talk to your sibling to find out what is needed. Their memory is… not great.',
    'The class timetable is pinned on the bedroom wall.',
    'Search the house for missing items. You can carry 2 at a time.',
    'Pack items by using the school bag next to their bed.',
  ],
  objectives: [
    { id: 'receive', label: 'Accept the task', type: 'talk', required: true },
    { id: 'ask', label: 'Ask {sibling} what they need', type: 'talk', required: true, where: { location: 'home', target: 'sibling' } },
    { id: 'find-out', label: 'Find out exactly what is needed', type: 'inspect', required: true, where: { location: 'home', target: 'timetable' }, hint: 'The class timetable is pinned on the bedroom wall.' },
    { id: 'pack', label: 'Pack every needed item', type: 'collect', required: true, where: { location: 'home', target: 'school-bag' }, hint: 'Look under the bed, in the living-room cabinet, on the kitchen counter and at the shoe rack. Fill the bottle at the sink.' },
    { id: 'declutter', label: 'Remove what is not needed (optional)', type: 'inspect', required: false },
    { id: 'done', label: 'Tell {sibling} the bag is ready', type: 'talk', required: true, dependsOn: ['pack'], where: { location: 'home', target: 'sibling' } },
  ],
  deadlineMinutes: 40,
  lateRule: 'partial',
  challenges: [{ id: 'crayon-misunderstanding' }],
  rewards: { xp: 110, badge: 'Big-Hearted Helper' },
  learning: ['Ask questions when instructions are incomplete', 'Use reliable sources (the timetable)', 'Stay calm during a misunderstanding'],
  skills: ['communication', 'empathy', 'planning', 'problem'],
  available(state) {
    return state.profile.members.some((m) => m.role === 'younger-sibling')
      ? { ok: true }
      : { ok: false, reason: 'Needs a younger sibling in your family setup.' };
  },
  onStart(s) {
    for (const item of SCHOOL_REQUIRED) s.world(`bag.${item}`, false);
    s.world('bag.comic', true);
    for (const sp of SCHOOL_SPOTS) s.world(`found.${sp.item}`, false);
  },
  onInteract(s, target) {
    const spot = SCHOOL_SPOTS.find((x) => x.id === target);
    if (spot) {
      if (s.state.world[`found.${spot.item}`]) return true;
      if (s.hold(spot.item)) {
        s.world(`found.${spot.item}`, true);
        s.spendTime(0.5);
        s.toast(`Found: ${itemName(spot.item)}`, 'good');
        if (!s.getFlag('knowsList', false)) s.bump('guessed', 1);
      }
      return true;
    }
    if (target === 'timetable') {
      s.spendTime(1);
      revealList(s, 'timetable');
      s.bump('planning', 15);
      s.say([{ speaker: 'Class 3 timetable — Tomorrow', text: '📐 Maths: geometry box\n🖍 Art: crayons\n👟 P.E.: sports shoes\n💧 Every day: a FILLED water bottle' }]);
      return true;
    }
    if (target === 'school-bag') {
      bagMenu(s);
      return true;
    }
    if (target === 'sink' && s.state.hands.includes('empty-bottle')) {
      s.release('empty-bottle');
      s.hold('water-bottle');
      s.spendTime(1, 'Filled the water bottle');
      return true;
    }
    return false;
  },
  onTalk(s, member) {
    const sibling = sib(s);
    if (!sibling) return false;
    if (member.id === sibling.id) {
      if (!s.isDone('ask')) {
        s.objective('ask');
        s.say([
          {
            speaker: sibling.name,
            portrait: sibling.id,
            text: "Tomorrow I need… umm… the maths thing! And something for art? And… I forgot the rest. 😅",
            choices: [
              {
                label: '"Let\'s check your timetable together."',
                tone: 'good',
                run: () => {
                  s.bump('comm', 10);
                  s.trust(sibling.id, 3);
                  s.say([{ speaker: sibling.name, portrait: sibling.id, text: "Oh yeah! It's on the wall above the desk area. Good idea!" }]);
                },
              },
              {
                label: '"What do you mean, the maths thing?"',
                tone: 'good',
                run: () => {
                  s.bump('comm', 5);
                  s.say([{ speaker: sibling.name, portrait: sibling.id, text: 'The box with the compass and ruler! I think it fell under my bed… And we have P.E. too, I think?' }]);
                },
              },
              {
                label: '"I\'ll just pack whatever I find."',
                tone: 'neutral',
                run: () => s.log('Decided to guess instead of asking', 'Guessing can work, but you may miss or pack wrong things.', 'neutral'),
              },
            ],
          },
        ]);
        return true;
      }
      if (s.isDone('pack')) {
        s.objective('done');
        s.trust(sibling.id, 8);
        s.say(
          [
            { speaker: sibling.name, portrait: sibling.id, text: `Everything's in! ${s.state.world['bag.comic'] === false ? "And the bag's so light now!" : ''} Thank you, ${s.player.name}! You're the best! 🎉` },
          ],
          () => s.finishMission(),
        );
        return true;
      }
      s.say([
        {
          speaker: sibling.name,
          portrait: sibling.id,
          text: `Is my bag ready? (${packedCount(s)}/${SCHOOL_REQUIRED.length} packed)`,
          choices: [
            { label: 'Not yet, still looking', run: () => {} },
            { label: "That's the best I can do", tone: 'bad', run: () => s.finishMission('incomplete') },
          ],
        },
      ]);
      return true;
    }
    if (member.id === s.state.run!.assignerId && !s.getFlag('knowsList', false)) {
      s.say([{ speaker: member.name, portrait: member.id, text: `I'm not sure what ${sibling.name} needs — check the timetable on the bedroom wall.` }]);
      s.bump('comm', 5);
      return true;
    }
    return false;
  },
  progress(state, id) {
    if (id !== 'pack') return null;
    const n = SCHOOL_REQUIRED.filter((i) => state.world[`bag.${i}`] === true).length;
    return `${n}/${SCHOOL_REQUIRED.length} packed`;
  },
  evaluate(s, forced) {
    const run = s.state.run!;
    const f = run.flags;
    const packed = packedCount(s);
    const missing = SCHOOL_REQUIRED.length - packed;
    const now = s.state.clock.minutes;
    const late = run.deadlineAt !== null && now > run.deadlineAt;
    const sibling = sib(s);
    const scores = {
      accuracy: clamp(100 - missing * 22 - Number(f['wrongPack'] ?? 0) * 5 - (s.state.world['bag.comic'] !== false ? 5 : 0)),
      time: timeScore(now, run.deadlineAt, run.startedAt),
      planning: clamp(55 + Number(f['planning'] ?? 0) + (f['knowsList'] ? 15 : 0) - Number(f['guessed'] ?? 0) * 3),
      communication: clamp(60 + Number(f['comm'] ?? 0)),
      problem: clamp(75 + Number(f['problem'] ?? 0)),
      responsibility: clamp(70 + (packed === SCHOOL_REQUIRED.length ? 20 : 0)),
    };
    const outcome = forced ?? (missing > 0 ? 'incomplete' : late ? 'completed-late' : 'completed');
    const fb: string[] = [];
    if (missing === 0) fb.push(`${sibling?.name ?? 'Your sibling'} has everything for tomorrow: geometry box, crayons, sports shoes and a filled water bottle.`);
    else fb.push(`${missing} needed item${missing > 1 ? 's were' : ' was'} not packed.`);
    if (f['learnedBy'] === 'timetable') fb.push('Checking the timetable turned vague instructions into a clear checklist.');
    else fb.push('Tip: when instructions are vague, find a reliable source — like the timetable on the wall.');
    if (s.state.world['bag.comic'] === false) fb.push('Removing the comic kept the bag light — packing only what is needed is a real skill.');
    if (sibling && sibling.trust >= 75) fb.push(`${sibling.name} trusts you more after today.`);
    if (late) fb.push('It got late — bedtime routines go smoother when bags are packed early.');
    return { outcome, scores, feedback: fb };
  },
};
