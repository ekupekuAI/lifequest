// Everyday object interactions: the desk, bookshelf, plants, shower, wall clock, lamp, benches,
// fountain, trees, neighbours' doors… Short, useful, life-skill-flavoured moments with a time cost.
//
//  • new interactables use their own `obj:*` ids (positions live in game/objectLayer.ts)
//  • a few existing props only had flavour text (desk, bookshelf, wardrobe, calendar, stove, washer,
//    dining table, park bench, fountain…): outside missions, with empty hands, this module takes them
//    over (`overrideActive`) — during a mission the original id/flavour stays untouched so missions keep
//    full control of their own targets
//  • leisure (books, benches, tea…) is refused while Angry Mum chore duty runs: "Chores first!"
//  • routed through the store's 'game' bus 'interact' events, like core/twists.ts; headless for tests
import type { GameStore } from './store';
import type { FamilyMember, LocationId } from '../domain/types';
import { GUARDIAN_ROLES } from '../domain/types';
import { money, words } from '../domain/region';
import { formatMoney } from '../domain/items';
import { scheduleFor } from '../domain/world';
import { formatClock } from './systems';
import { angryBusy, choreDuty, dinnerTick, isEating, tableInteract, tableLabel } from './dinner';

// ---------------------------------------------------------------- tuning

export const OBJ = {
  homeworkMin: 30,
  homeworkEnergy: -10,
  readMin: 15,
  readCooldown: 60,
  teaMin: 5,
  teaCooldown: 60,
  teaEnergy: 10,
  showerMin: 10,
  showerEnergy: 10,
  benchMin: 10,
  benchEnergy: 8,
  benchCooldown: 20,
  plants: 4,
  wishCost: () => money(1),
} as const;

/** Effects the Phaser layer draws (steam on the stove, splash on a plant…). Default no-op. */
export const objFx = {
  pulse: (_id: string, _kind: 'water' | 'steam' | 'sparkle' | 'music' | 'heart' | 'zzz' | 'coin' | 'bubble') => {},
};

// ---------------------------------------------------------------- helpers

const W = (s: GameStore) => s.state.world;
const day = (s: GameStore) => s.state.clock.day;
const now = (s: GameStore) => s.state.clock.minutes;
const tod = (s: GameStore) => ((s.state.clock.minutes % 1440) + 1440) % 1440;
const guardian = (s: GameStore): FamilyMember | undefined => s.memberByRole('mother', ...GUARDIAN_ROLES);
const missionLive = (s: GameStore) => !!s.state.run && s.state.run.status === 'in-progress';
const energy = (s: GameStore, d: number) => (s.state.stats.energy = Math.max(0, Math.min(100, s.state.stats.energy + d)));
const narr = (s: GameStore, text: string) => s.say([{ speaker: '', text: words(text) }]);
const doneToday = (s: GameStore, key: string) => W(s)[`obj.${key}`] === day(s);
const markToday = (s: GameStore, key: string) => (W(s)[`obj.${key}`] = day(s));
/** minutes since `obj.<key>.at` (Infinity if never) */
const since = (s: GameStore, key: string) => {
  const v = W(s)[`obj.${key}.at`];
  return typeof v === 'number' ? now(s) - v : Infinity;
};
const stamp = (s: GameStore, key: string) => (W(s)[`obj.${key}.at`] = now(s));
const grownUpHome = (s: GameStore) => s.state.profile.members.some((m) => GUARDIAN_ROLES.includes(m.role) && scheduleFor(m.role, now(s)).spot !== 'away');

export const plantWatered = (s: GameStore, i: number) => doneToday(s, `plant.${i}`);
export const lampOn = (s: GameStore) => W(s)['obj.lamp'] === true;

function choresFirst(s: GameStore): boolean {
  if (!choreDuty(s)) return false;
  const g = guardian(s);
  s.toast(`${g ? g.name : 'Mum'}: Chores first! 🧹 Fun stuff after.`, 'bad');
  if (g) s.bus.emit('fx', { kind: 'exclaim', target: `npc:${g.id}` });
  return true;
}

// ---------------------------------------------------------------- definitions

export interface ObjDef {
  /** where it lives (new `obj:*` ids) — existing ids are scoped by the scene that owns them */
  loc: LocationId;
  label: (s: GameStore) => string;
  /** refused during chore duty */
  leisure?: boolean;
  run: (s: GameStore, arg?: string) => void;
}

function homework(s: GameStore) {
  if (doneToday(s, 'homework')) return s.toast('Homework’s done for today ✓ Pack your bag for tomorrow and you’re set.', 'neutral');
  if (s.state.stats.energy < 15) return narr(s, 'You stare at the maths book. The numbers swim. Too tired — have a snack or rest first.');
  markToday(s, 'homework');
  energy(s, OBJ.homeworkEnergy);
  s.skill('planning', 1);
  s.skill('time', 1);
  s.spendTime(OBJ.homeworkMin, 'Homework at the desk');
  objFx.pulse('desk', 'sparkle');
  s.toast('📚 Homework done! Tip: do the hardest subject first, while your brain is fresh.', 'good');
}

const BOOKS = ['a mystery about a missing bicycle', 'a comic about a robot who learns to cook', 'a book of world records', 'an adventure set in the Himalayas', 'a funny diary of a kid who keeps losing his homework'];
function readBook(s: GameStore) {
  if (choresFirst(s)) return;
  if (since(s, 'read') < OBJ.readCooldown) return s.toast('You just read a chapter. Give your eyes a little break. 👀', 'neutral');
  stamp(s, 'read');
  energy(s, 5);
  s.skill('patience', 1);
  s.spendTime(OBJ.readMin, 'Reading a chapter');
  objFx.pulse('bookshelf', 'music');
  s.toast(`📖 You read ${BOOKS[(day(s) + Math.floor(now(s) / 60)) % BOOKS.length]}. Calm +, energy +5. Reading 15 min a day ≈ 1 million words a year!`, 'good');
}

function dress(s: GameStore) {
  const fresh = doneToday(s, 'dressed');
  markToday(s, 'dressed');
  s.spendTime(3, 'Changing clothes');
  objFx.pulse('wardrobe', 'sparkle');
  s.toast(fresh ? 'Outfit change #2. Very stylish. 😎' : '👕 Fresh clothes on! Worn ones go in the laundry basket — not on the floor.', 'good');
}

function calendar(s: GameStore) {
  const ev: string[] = [`Day ${day(s)} · ${formatClock(now(s))}.`, 'Home from work 5:30 PM · Football practice until 6 PM · 🍽 Family dinner 7:00 PM.'];
  if (W(s)['dinner.ate'] === day(s)) ev.push('Dinner: done ✓');
  if (choreDuty(s)) ev.push('🧹 Chore duty — circled in angry red.');
  const asg = s.state.assignments.filter((a) => a.status === 'assigned').length;
  if (asg) ev.push(`${asg} family task${asg === 1 ? '' : 's'} waiting on the notice board.`);
  narr(s, ev.join('\n'));
}

function makeTea(s: GameStore) {
  if (choresFirst(s)) return;
  if (!grownUpHome(s)) return narr(s, 'No grown-up is home. Rule: no stove without an adult around. A glass of water it is! 💧');
  if (since(s, 'tea') < OBJ.teaCooldown) return s.toast('You just had one. Too much caffeine = no sleep tonight!', 'neutral');
  stamp(s, 'tea');
  energy(s, OBJ.teaEnergy);
  s.skill('household', 1);
  s.spendTime(OBJ.teaMin, 'Made a hot drink');
  objFx.pulse('stove', 'steam');
  s.toast(`☕ Warm and cosy (+${OBJ.teaEnergy} energy). Handle towards the wall, never over the edge — and the flame goes OFF after.`, 'good');
}

function washer(s: GameStore) {
  s.toast('🧺 Nothing to wash right now. Tip: whites and colours go in separate loads!', 'neutral');
}

function table(s: GameStore) {
  tableInteract(s);
}

function windowLook(s: GameStore) {
  const m = tod(s);
  const rain = !!W(s)['rainUntil'];
  const sky = rain
    ? 'Rain taps on the glass. 🌧 Take the umbrella from the hook if you go out!'
    : m >= 20 * 60
      ? 'Stars are out. 🌙 The street lamps glow orange. Almost bedtime.'
      : m >= 18 * 60 + 30
        ? 'The sky turns pink and orange — sunset. 🌇 Neighbours are heading home for dinner.'
        : 'Clear evening sky. ☀ Kids are playing cricket in the lane.';
  s.spendTime(1);
  narr(s, sky);
}

const NEXT_UP: [number, string][] = [
  [17 * 60 + 30, 'a grown-up gets home from work'],
  [18 * 60, 'football practice ends'],
  [19 * 60, 'family dinner 🍽'],
  [19 * 60 + 40, 'dinner ends — clear the table'],
  [21 * 60 + 30, 'bedtime 🛏'],
];
export function nextUp(minuteOfDay: number): { at: number; what: string } {
  const n = NEXT_UP.find(([t]) => t > minuteOfDay);
  return n ? { at: n[0], what: n[1] } : { at: 21 * 60 + 30, what: 'bedtime — way past it! 😴' };
}
function clock(s: GameStore) {
  const m = tod(s);
  const n = nextUp(m);
  const left = n.at - m;
  narr(s, `Tick-tock. It’s ${formatClock(now(s))}. Next: ${n.what}${left > 0 ? ` in ${Math.round(left)} min` : ''}.`);
}

function picture(s: GameStore) {
  const mem = (s.state.memories ?? []).filter((x) => ['kind', 'helpful', 'honest', 'responsible', 'brave', 'thrifty'].includes(x.kind)).slice(-1)[0];
  narr(s, mem ? `A family photo. Everyone’s grinning. It reminds you of the day you ${mem.text}. 💛` : 'A family photo from the beach trip. Someone blinked. Someone is eating sand. Perfect. 💛');
  objFx.pulse('obj:picture', 'heart');
}

function lamp(s: GameStore) {
  W(s)['obj.lamp'] = !lampOn(s);
  s.toast(lampOn(s) ? '💡 Click — warm light.' : 'Click — lamp off. Saving electricity! ⚡', 'neutral');
  s.notify();
}

function shower(s: GameStore) {
  if (doneToday(s, 'shower')) return s.toast('Already squeaky clean today! ✨ Save the water.', 'neutral');
  markToday(s, 'shower');
  energy(s, OBJ.showerEnergy);
  s.spendTime(OBJ.showerMin, 'Quick shower');
  objFx.pulse('obj:shower', 'bubble');
  s.toast(`🚿 Fresh! (+${OBJ.showerEnergy} energy) A 5-minute shower saves ~40 litres of water vs. a long one.`, 'good');
}

function toilet(s: GameStore) {
  s.spendTime(2);
  objFx.pulse('obj:toilet', 'sparkle');
  s.toast('🚽 Flush… and WASH YOUR HANDS. 20 seconds — that’s “Happy Birthday” sung twice. 🎂🎂', 'info');
}

function water(s: GameStore, arg?: string) {
  const i = Number(arg ?? 0);
  if (plantWatered(s, i)) return s.toast('Already watered today. Too much water drowns the roots! 🌱', 'neutral');
  const first = !Array.from({ length: OBJ.plants }, (_, k) => k).some((k) => plantWatered(s, k));
  markToday(s, `plant.${i}`);
  if (first) s.skill('responsibility', 1);
  s.spendTime(1);
  objFx.pulse(`obj:plant:${i}`, 'water');
  s.toast('💧 The leaves perk up and look greener. Tip: water the soil, not the leaves.', 'good');
}

function rest(s: GameStore, where: string) {
  if (choresFirst(s)) return;
  if (since(s, `bench.${where}`) < OBJ.benchCooldown) return s.toast('You just rested. Your legs are fine — time to get going!', 'neutral');
  stamp(s, `bench.${where}`);
  energy(s, OBJ.benchEnergy);
  s.spendTime(OBJ.benchMin, 'Rested on the bench');
  objFx.pulse(where, 'zzz');
  s.toast(`🪑 Ahh. (+${OBJ.benchEnergy} energy) Short rests on long walks keep you going.`, 'good');
}

const WISHES = ['🌍 For my family to stay healthy', '📚 To ace the next test', '🐕 A puppy. Please. PLEASE.'];
function wish(s: GameStore) {
  if (choresFirst(s)) return;
  if (doneToday(s, 'wish')) return s.toast('One wish a day — the fountain has rules. ⛲', 'neutral');
  const cost = OBJ.wishCost();
  if (s.state.wallet.balance < cost) return narr(s, `Your pockets are empty — a wish costs ${formatMoney(cost)}. Maybe wish for pocket money? 😄`);
  s.say([
    {
      speaker: '',
      text: words(`You hold a ${formatMoney(cost)} coin over the sparkling water. What do you wish for?`),
      choices: WISHES.map((w) => ({
        label: w,
        tone: 'good' as const,
        run: () => {
          if (!s.pay(cost, 'Fountain wish', false)) return;
          markToday(s, 'wish');
          s.spendTime(1);
          objFx.pulse('fountain', 'coin');
          s.toast('🪙 Plink! Wish made. Fun fact: many city fountains donate the coins to charity.', 'good');
        },
      })),
    },
  ]);
}

const BIRDS = ['A sparrow hops along a branch. Tweet-tweet! 🐦', 'Cool shade. Trees can make a street several degrees cooler in summer. 🌳', 'A squirrel freezes, stares at you, and zooms up the trunk. 🐿', 'A mynah bird mimics a phone ringtone. Clever bird!'];
function tree(s: GameStore, arg?: string) {
  if (choresFirst(s)) return;
  s.spendTime(2);
  objFx.pulse(`obj:tree:${arg ?? 0}`, 'music');
  s.toast(BIRDS[(Number(arg ?? 0) + day(s)) % BIRDS.length], 'info');
}

const NEIGHBOURS: Record<string, { who: string; line: string }> = {
  'house-a': { who: 'Mrs. Gupta', line: 'Oh, hello! The pressure cooker scared you? It’s just dal. Say hi to your family for me!' },
  'obj:house:b': { who: 'Mr. Fernandes', line: 'Hello there! Did you see my glasses? …Oh. On my head. Thank you!' },
  'obj:house:c': { who: 'Aunty Rao', line: 'Ah, it’s you! Tell your mum her recipe worked. Here — wave to the baby! 👶' },
  'obj:house:d': { who: 'Old Mr. Bose', line: 'Who is it? Ah, the young neighbour! I was just feeding the fish. Run along, it’s getting late.' },
};
function knock(s: GameStore, id: string) {
  const n = NEIGHBOURS[id] ?? { who: 'Neighbour', line: 'Hello! Can I help you?' };
  if (tod(s) >= 21 * 60) return narr(s, 'It’s late — knocking now might wake people up. Try tomorrow.');
  if (doneToday(s, `knock.${id}`)) return narr(s, 'Nobody comes to the door again. Knocking twice is enough — it’s polite to move on and not hang around.');
  markToday(s, `knock.${id}`);
  s.spendTime(2);
  s.skill('communication', 1);
  s.say([{ speaker: n.who, text: words(n.line), mood: 'happy' }]);
}

const NOTICES = ['📌 Science fair on Friday — bring a project made from recycled stuff!', '📌 Library books due back Monday. Late fee: one apology letter.', '📌 Sports day practice: 7 AM sharp. Bring water!', '📌 Lost: one blue water bottle with a dinosaur sticker.'];
function schoolNotice(s: GameStore) {
  s.spendTime(1);
  narr(s, `Sunrise Public School — closed for the evening.\n${NOTICES[day(s) % NOTICES.length]}`);
}

/** New `obj:*` interactables. Dynamic ids: `obj:plant:<i>`, `obj:tree:<i>`, `obj:house:<k>`, `obj:bench:<i>`. */
export const OBJECTS: Record<string, ObjDef> = {
  window: { loc: 'home', label: () => 'Look out of the window', run: windowLook },
  picture: { loc: 'home', label: () => 'Family photo', run: picture },
  clock: { loc: 'home', label: () => 'Wall clock · what’s next?', run: clock },
  shower: { loc: 'home', label: (s) => (doneToday(s, 'shower') ? 'Shower (clean ✓)' : 'Take a quick shower (10 min)'), run: shower },
  toilet: { loc: 'home', label: () => 'Toilet', run: toilet },
  plant: { loc: 'home', label: () => 'Water the plant 💧', run: water },
  lamp: { loc: 'home', label: (s) => (lampOn(s) ? 'Switch the lamp off' : 'Switch the lamp on'), run: lamp },
  tree: { loc: 'town', label: () => 'Rest in the shade 🌳', leisure: true, run: tree },
  house: { loc: 'town', label: () => 'Knock on the door', run: (s, arg) => knock(s, `obj:house:${arg}`) },
  bench: { loc: 'city', label: () => 'Sit & rest (10 min)', leisure: true, run: (s, arg) => rest(s, `obj:bench:${arg}`) },
};

/** Existing flavour-only interactables this module upgrades outside missions. */
export const OVERRIDES: Record<string, { loc: LocationId; label: (s: GameStore) => string; run: (s: GameStore) => void; leisure?: boolean }> = {
  desk: { loc: 'home', label: (s) => (doneToday(s, 'homework') ? 'Study desk (homework ✓)' : `Do homework (${OBJ.homeworkMin} min)`), run: homework },
  bookshelf: { loc: 'home', label: () => 'Read a book (15 min)', run: readBook, leisure: true },
  wardrobe: { loc: 'home', label: () => 'Wardrobe · change clothes', run: dress },
  calendar: { loc: 'home', label: () => 'Family calendar · today', run: calendar },
  stove: { loc: 'home', label: () => 'Make a hot drink (5 min)', run: makeTea, leisure: true },
  washer: { loc: 'home', label: () => 'Washing machine', run: washer },
  'dining-table': { loc: 'home', label: (s) => tableLabel(s), run: table },
  bench: { loc: 'town', label: () => 'Park bench · sit & rest', run: (s) => rest(s, 'bench'), leisure: true },
  'house-a': { loc: 'town', label: () => "Knock at the Guptas' door", run: (s) => knock(s, 'house-a') },
  school: { loc: 'town', label: () => 'Read the school notice', run: schoolNotice },
  fountain: { loc: 'city', label: () => `Toss a coin & make a wish (${formatMoney(OBJ.wishCost())})`, run: wish, leisure: true },
  'city-bench': { loc: 'city', label: () => 'Sit & rest (10 min)', run: (s) => rest(s, 'city-bench'), leisure: true },
};

/** Should this module handle the existing id right now? (no mission, empty hands, right place) */
export function overrideActive(s: GameStore, id: string): boolean {
  const o = OVERRIDES[id];
  if (!o || s.state.location !== o.loc) return false;
  if (id === 'dining-table' && isEating()) return true;
  return !missionLive(s) && s.state.hands.length === 0 && !angryBusy(s);
}

export function objLabel(s: GameStore, target: string): string {
  if (OVERRIDES[target]) return OVERRIDES[target].label(s);
  const [, kind] = target.split(':');
  return OBJECTS[kind]?.label(s) ?? '';
}

/** Route an interact target. Returns true when this module took over. */
export function objectInteract(s: GameStore, target: string): boolean {
  if (s.ui.dialogue || s.ui.modal) return false;
  if (target.startsWith('obj:')) {
    const [, kind, arg] = target.split(':');
    const def = OBJECTS[kind];
    if (!def || angryBusy(s)) return false;
    def.run(s, arg);
    return true;
  }
  if (OVERRIDES[target] && overrideActive(s, target)) {
    OVERRIDES[target].run(s);
    return true;
  }
  return false;
}

const installed = new WeakSet<GameStore>();
/** Hook interaction routing + the dinner clock into a store (idempotent). */
export function installHomeObjects(s: GameStore) {
  if (installed.has(s)) return;
  installed.add(s);
  s.bus.on('game', (ev) => {
    if (ev.type === 'interact') objectInteract(s, ev.target);
    else if (ev.type === 'minute') dinnerTick(s);
  });
}

