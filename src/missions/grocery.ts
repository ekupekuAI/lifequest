import type { MissionDef } from './types';
import type { GameStore } from '../core/store';
import { formatMoney, itemName } from '../domain/items';
import { region, words } from '../domain/region';
import { budgetScore, checkRequired, clamp, timeScore } from './validation';

const REQUIRED = [
  { item: 'milk-packet', qty: 1, alternatives: ['milk-tetra', 'milk-tetra-old'] },
  { item: 'tomato', qty: 2 },
  { item: 'potatoes', qty: 1, alternatives: ['baby-potatoes'] },
];
const NOT_ACCEPTED: Record<string, string> = {
  'milk-flavoured': 'a chocolate milkshake is not milk for tea',
  'cherry-tomato': 'cherry tomatoes are too small and pricey for curry',
};

function missionReceipts(s: GameStore) {
  const start = s.state.run?.startedAt ?? 0;
  return s.state.receipts.filter((r) => r.at >= start);
}

function wastedSpend(s: GameStore) {
  const listIds = new Set(REQUIRED.flatMap((r) => [r.item, ...(r.alternatives ?? [])]));
  let wasted = 0;
  const extras: string[] = [];
  for (const rc of missionReceipts(s))
    for (const l of rc.lines) {
      if (!listIds.has(l.id)) {
        wasted += l.price * l.qty;
        extras.push(l.name);
      }
    }
  return { wasted, extras };
}

function deliver(s: GameStore) {
  const run = s.state.run!;
  const a = s.assigner()!;
  const check = checkRequired(REQUIRED, s.state.inventory);
  const listLine = (miss: { item: string; qty: number }[]) => miss.map((m) => `${m.qty}× ${itemName(m.item)}`).join(', ');
  if (!check.satisfied) {
    const stockOut = check.missing.some((m) => m.item === 'milk-packet') && s.getFlag('skippedMilk', false);
    s.say([
      {
        speaker: a.name,
        portrait: a.id,
        text: `Thank you… but we're still missing: ${listLine(check.missing)}.`,
        choices: [
          ...(s.timeLeft() === null || s.timeLeft()! > 0
            ? [{ label: "I'll go back and get it now", tone: 'good' as const, run: () => s.log('Went back for missing items', 'Fixing a mistake is better than leaving it.', 'good') }]
            : []),
          ...(stockOut
            ? [{
                label: "Sorry — the milk was sold out and I wasn't sure what to buy",
                run: () => {
                  s.trust(a.id, 1);
                  s.log('Explained honestly why milk was missing', 'Honesty keeps trust, but calling home could have solved it.', 'neutral');
                  finishDelivery(s, check.use, true, check.missing);
                },
              }]
            : []),
          {
            label: "Here's what I got. Sorry, I couldn't get everything.",
            tone: 'bad' as const,
            run: () => finishDelivery(s, check.use, true, check.missing),
          },
        ],
      },
    ]);
    return;
  }
  finishDelivery(s, check.use, false);
  void run;
}

function finishDelivery(s: GameStore, use: Record<string, number>, incomplete: boolean, missing: { qty: number }[] = []) {
  const run = s.state.run!;
  const a = s.assigner()!;
  run.flags['missingAtDelivery'] = missing.reduce((n, m) => n + m.qty, 0);
  for (const [id, q] of Object.entries(use)) s.takeItem(id, q);
  run.flags['deliveredAt'] = s.state.clock.minutes;
  const lines: string[] = [];
  const subs = Object.keys(use).filter((id) => id === 'milk-tetra' || id === 'milk-tetra-old' || id === 'baby-potatoes');
  if (subs.includes('milk-tetra')) lines.push('Tetra pack milk — good thinking when the packets ran out.');
  if (subs.includes('milk-tetra-old')) lines.push(words("Short-dated milk — fine for tonight's {tea}, but it won't last until breakfast. Good saving though!"));
  if (subs.includes('baby-potatoes')) lines.push('Premium baby potatoes? They work, but they cost almost double.');
  for (const [id, why] of Object.entries(NOT_ACCEPTED)) if (s.hasItem(id)) lines.push(`Hmm, ${why}.`);
  const { extras } = wastedSpend(s);
  const snackExtras = extras.filter((e) => e !== 'Paper bag');
  if (snackExtras.length) lines.push(`And ${snackExtras.join(', ')}? That wasn't on the list…`);
  const change = Math.max(0, run.cashGiven - run.spent);
  if (change > 0) {
    s.pay(change, `Returned change to ${a.name}`, false);
    run.flags['returnedChange'] = change;
    lines.push(`Here's your change: ${formatMoney(change)}. Thank you for bringing it back!`);
  } else if (run.spent > run.cashGiven) {
    lines.push(`You spent ${formatMoney(run.spent - run.cashGiven)} more than I gave you — that came from your pocket money. Comparing prices helps next time.`);
  }
  s.objective('deliver');
  s.trust(a.id, incomplete ? -2 : 5);
  s.say(
    [
      { speaker: a.name, portrait: a.id, text: incomplete ? "Okay. Let's see what we can make with this." : 'You got everything on the list! 🙌' },
      ...lines.map((t) => ({ speaker: a.name, portrait: a.id, text: t })),
    ],
    () => s.finishMission(incomplete ? 'incomplete' : undefined),
  );
}

export const groceryRun: MissionDef = {
  id: 'grocery-run',
  title: 'The Grocery Run',
  category: 'errand',
  difficulty: 1,
  icon: '🛒',
  summary: 'Buy milk, two tomatoes and potatoes within budget, before dinner.',
  assignerRoles: ['mother', 'father', 'guardian', 'grandparent'],
  location: 'home',
  destination: 'grocery',
  briefing: 'Please buy one packet of milk, two tomatoes, and one bag of potatoes. You have {budget}. Please return before dinner.',
  instructions: [
    'FreshMart is across the road — use the zebra crossing. The corner shop kiosk is right next to it.',
    'Take the cloth bag from the hook by the kitchen door — paper bags cost extra.',
    'The sky looks cloudy. An umbrella hangs by the kitchen door too.',
    'If something is unavailable, ask or call home before buying a substitute.',
    'Bring back the change and the receipt.',
  ],
  objectives: [
    { id: 'receive-list', label: 'Get the shopping list', type: 'talk', required: true },
    { id: 'take-bag', label: 'Take the cloth bag from the hook (optional)', type: 'collect', required: false, where: { location: 'home', target: 'hook-bag' } },
    { id: 'reach-store', label: 'Walk to FreshMart', type: 'reach', target: 'grocery', required: true, where: { location: 'grocery' }, hint: 'Leave by the front door, follow the garden path to the road and cross at the zebra crossing.' },
    { id: 'checkout', label: 'Pay for your shopping', type: 'checkout', required: true, where: { location: 'grocery', target: 'checkout' }, hint: 'Pick items from the shelves (E), then join the checkout queue.' },
    { id: 'buy-items', label: 'Have every item on the list', type: 'collect', required: true, where: { location: 'grocery', target: 'shelf-veg' }, hint: 'Open your journal (J) to see what is still missing.' },
    { id: 'return-home', label: 'Return home', type: 'reach', target: 'home', required: true, dependsOn: ['checkout'], where: { location: 'home' } },
    { id: 'deliver', label: 'Give the groceries to {assigner}', type: 'deliver', required: true, where: { location: 'home', target: 'assigner' }, hint: 'Talk to them (E) to hand over the shopping and the change.' },
  ],
  requiredItems: REQUIRED,
  optionalItems: ['cloth-bag', 'umbrella'],
  budget: 150,
  deadlineMinutes: 100,
  lateRule: 'partial',
  challenges: [
    { id: 'stock-out-milk' },
    { id: 'kiosk-clarify' },
    { id: 'elder-ahead' },
    { id: 'queue-cutter' },
    { id: 'sudden-rain', chance: 0.75 },
  ],
  rewards: { xp: 120, badge: 'Smart Shopper' },
  learning: ['Read and follow a shopping list', 'Stay within a budget', 'Wait patiently in a queue', 'Adapt when an item is unavailable'],
  skills: ['budget', 'planning', 'patience', 'problem', 'responsibility'],
  onStart(s) {
    // Deterministic, configurable world conditions for this scenario.
    s.world('stock.grocery.milk-packet', 0);
    s.world('stock.kiosk.milk-packet', 3);
    if (s.hasItem('cloth-bag')) s.objective('take-bag');
  },
  onEvent(s, ev) {
    if (ev.type === 'location') {
      if (ev.to === 'grocery') s.objective('reach-store');
      if (ev.to === 'home' && s.isDone('checkout')) s.objective('return-home');
    }
    if (ev.type === 'interact' && ev.target === 'hook-bag') queueMicrotask(() => s.hasItem('cloth-bag') && s.objective('take-bag'));
    if (ev.type === 'purchased') {
      s.objective('checkout');
      if (checkRequired(REQUIRED, s.state.inventory).satisfied) s.objective('buy-items');
      if (s.state.location === 'home') s.objective('return-home');
    }
  },
  onTalk(s, member) {
    const run = s.state.run!;
    if (member.id !== run.assignerId) return false;
    if (!s.isDone('checkout')) {
      s.say([
        {
          speaker: member.name,
          portrait: member.id,
          text: 'Back already? The list is in your journal (press J). Anything you want to ask?',
          choices: [
            {
              label: '"If something is sold out, what should I buy instead?"',
              tone: 'good',
              run: () => {
                s.flag('clarifiedEarly', true);
                s.bump('comm', 10);
                s.say([{ speaker: member.name, portrait: member.id, text: 'Good question! Any plain milk is fine. Normal tomatoes and potatoes — nothing fancy. And no snacks unless you have money left over, okay?' }]);
              },
            },
            { label: 'No, I\'m on it!', run: () => {} },
          ],
        },
      ]);
      return true;
    }
    deliver(s);
    return true;
  },
  progress(state, id) {
    if (id !== 'buy-items') return null;
    const inv = state.inventory.items;
    const b = state.basket;
    return REQUIRED.map((r) => {
      const have = [r.item, ...(r.alternatives ?? [])].reduce((n, x) => n + (inv[x] ?? 0) + (b[x] ?? 0), 0);
      return `${itemName(r.item).split(' (')[0]} ${Math.min(have, r.qty)}/${r.qty}`;
    }).join(' · ');
  },
  evaluate(s, forced) {
    const run = s.state.run!;
    const f = run.flags;
    const finishedAt = Number(f['deliveredAt'] ?? s.state.clock.minutes);
    // everything delivered was removed from inventory; reconstruct accuracy from flags & objectives
    const delivered = s.isDone('deliver');
    const notAccepted = Object.keys(NOT_ACCEPTED).filter((id) => s.hasItem(id));
    const remaining = checkRequired(REQUIRED, s.state.inventory); // only meaningful if not delivered
    const missingCount = delivered ? Number(f['missingAtDelivery'] ?? 0) : remaining.missing.reduce((n, m) => n + m.qty, 0);
    const late = run.deadlineAt !== null && finishedAt > run.deadlineAt;
    const { wasted, extras } = wastedSpend(s);
    const scores = {
      accuracy: clamp(100 - missingCount * 30 - notAccepted.length * 12 - (forced === 'incomplete' && !delivered ? 40 : 0)),
      budget: budgetScore(run.spent, run.budget, wasted),
      time: timeScore(finishedAt, run.deadlineAt, run.startedAt),
      planning: clamp(45 + (f['took:cloth-bag'] || s.isDone('take-bag') ? 20 : 0) + (f['checkedList'] ? 15 : 0) + (f['clarifiedEarly'] ? 10 : 0) + Number(f['planning'] ?? 0) + (f['took:umbrella'] ? 5 : 0)),
      communication: clamp(60 + Number(f['comm'] ?? 0)),
      problem: clamp(run.challengesSeen.includes('stock-out-milk') ? 70 + Number(f['problem'] ?? 0) + (f['skippedMilk'] ? -20 : 15) : 80 + Number(f['problem'] ?? 0)),
      responsibility: clamp(65 + Number(f['resp'] ?? 0) + (f['returnedChange'] ? 15 : 0) + (extras.length ? -10 : 5)),
    };
    const outcome = forced ?? (missingCount > 0 ? 'incomplete' : late ? 'completed-late' : 'completed');
    const fb: string[] = [];
    if (outcome !== 'incomplete') fb.push('You bought everything on the list' + (run.spent <= (run.budget ?? Infinity) ? ` and stayed within budget (${formatMoney(run.spent)} of ${formatMoney(run.budget ?? 0)}).` : '.'));
    else fb.push('The shopping was not completed. Check the list in your journal and use the challenges as clues for next time.');
    if (run.budget !== null && run.spent > run.budget) fb.push(`You exceeded the budget by ${formatMoney(run.spent - run.budget)}. Next time, compare prices or ask about acceptable alternatives.`);
    if (wasted > 0) fb.push(`${formatMoney(wasted)} went on things not on the list (${extras.join(', ')}). Small extras add up quickly.`);
    if (run.challengesSeen.includes('stock-out-milk')) {
      if (f['calledHome'] || f['askedStore']) fb.push('When milk was sold out, you asked before choosing a substitute — that is exactly how adults handle it.');
      else if (f['triedKiosk']) fb.push('Checking another shop when milk was sold out showed good problem-solving.');
    }
    if (late) fb.push(`You were ${Math.round(finishedAt - run.deadlineAt!)} minutes late for dinner. Long queues and detours add up — plan a buffer.`);
    else if (run.deadlineAt !== null) fb.push(`You made it back with ${Math.round(run.deadlineAt - finishedAt)} minutes to spare.`);
    if (!s.isDone('take-bag')) fb.push('Tip: the cloth bag on the kitchen hook avoids the bag fee and makes carrying easier.');
    if (f['helpedElder']) fb.push('Letting the elderly lady go first was a kind choice.');
    return { outcome, scores, feedback: fb };
  },
};
