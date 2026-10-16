// "Market Day": buy 1 kg tomatoes and 1 kg onions at the market cart — and bargain like a decent person.
// The bargaining itself lives in src/core/bargain.ts (engine) and src/game/market.ts (dialogue flow),
// which record what happened in `mk.*` run flags and report each bargain to whoever gave the task.
import type { MissionDef } from './types';
import type { GameStore } from '../core/store';
import { formatMoney, itemName } from '../domain/items';
import { money, region, words } from '../domain/region';
import { budgetScore, checkRequired, clamp, timeScore } from './validation';

/** 1 kg ≈ 6 pieces at the cart (see MARKET_GOODS). */
const KG = 6;
const REQUIRED = [
  { item: 'tomato', qty: KG },
  { item: 'onion', qty: KG },
];
/** Opening ask and a respectful price for the whole list, in base currency (tomatoes 45/kg + onions 40/kg). */
const LIST_BASE = 85;
const FAIR_BASE = 76;

const f = (s: GameStore) => s.state.run!.flags;
const n = (s: GameStore, k: string) => Number(f(s)[k] ?? 0);
const yes = (s: GameStore, k: string) => !!f(s)[k];
const bought = (s: GameStore, item: string) => s.hasItem(item, KG);
const fixedCulture = () => region().bargainCulture === 'fixed';

function notes(s: GameStore): string[] {
  try {
    return JSON.parse(String(f(s)['mk.notes'] ?? '[]')) as string[];
  } catch {
    return [];
  }
}

/** The task-giver's reaction to how you bargained (single-player delivery). */
function bargainReaction(s: GameStore): { lines: string[]; trust: number } {
  const lines: string[] = [];
  let trust = 0;
  const vendor = String(f(s)['mk.vendor'] ?? region().market.vendor);
  const paid = n(s, 'mk.paid');
  const list = n(s, 'mk.list');
  const rude = n(s, 'mk.rude') > 0;
  if (yes(s, 'mk.refused') && !n(s, 'mk.deals')) {
    lines.push(`So ${vendor} wouldn't sell to you and you paid supermarket prices instead? Being polite would have saved money — and face.`);
    trust -= 1;
  } else if (n(s, 'mk.deals') && !rude && paid < list) {
    lines.push(words(`{praise} ${formatMoney(paid)} instead of ${formatMoney(list)}? You bargained like a pro — and politely too!`));
    trust += 2;
  } else if (yes(s, 'mk.quickAccept')) {
    lines.push(`You paid the first price ${vendor} asked? That's okay — next time try a polite "could you do a little less?".`);
  } else if (fixedCulture() && n(s, 'mk.deals') && !yes(s, 'mk.fauxPas')) {
    lines.push(`Fixed prices at the farmers' market — and you didn't argue. Good manners!`);
    trust += 1;
  }
  if (rude) {
    lines.push(`${vendor} works hard for every sale. Being rude isn't okay, even when you're bargaining.`);
    trust -= 2;
  }
  if (yes(s, 'mk.fauxPas') && fixedCulture()) lines.push(`Haggling hard at a fixed-price stall is a bit embarrassing here. Asking about deals is the polite way.`);
  if (yes(s, 'mk.citedFalse')) lines.push('Fibbing about prices? Honesty matters, even at the market.');
  if (yes(s, 'mk.squeezed')) lines.push(`You pushed ${vendor} for a couple of coins? She works hard all day — a fair price is a kind price.`);
  if (yes(s, 'mk.apologised')) lines.push('But you apologised. That takes guts — I\'m proud of that.');
  if (yes(s, 'mk.swappedBruised') || yes(s, 'mk.foundBruised')) lines.push('And no squashed tomatoes — you checked. Smart.');
  if (yes(s, 'mk.bruisedHome')) lines.push('Hmm, two of these tomatoes are squashed. Always check before you pay.');
  if (yes(s, 'mk.thankedGift')) lines.push(`Free chillies too? ${vendor} must have liked you!`);
  return { lines, trust };
}

function deliver(s: GameStore) {
  const run = s.state.run!;
  const a = s.assigner()!;
  const check = checkRequired(REQUIRED, s.state.inventory);
  if (!check.satisfied) {
    const miss = check.missing.map((m) => `${m.qty}× ${itemName(m.item)}`).join(', ');
    s.say([
      {
        speaker: a.name,
        portrait: a.id,
        text: `Thank you… but we're still missing: ${miss}. That's about 1 kg each of tomatoes and onions.`,
        choices: [
          ...(s.isOpen('market') ? [{ label: "I'll go back and get it now", tone: 'good' as const, run: () => s.log('Went back for the missing vegetables', 'Fixing a mistake is better than leaving it.', 'good') }] : []),
          { label: "Here's what I got. Sorry.", tone: 'bad' as const, run: () => finishDelivery(s, check.use, true, check.missing.reduce((x, m) => x + m.qty, 0)) },
        ],
      },
    ]);
    return;
  }
  finishDelivery(s, check.use, false, 0);
  void run;
}

function finishDelivery(s: GameStore, use: Record<string, number>, incomplete: boolean, missing: number) {
  const run = s.state.run!;
  const a = s.assigner()!;
  run.flags['missingAtDelivery'] = missing;
  for (const [id, q] of Object.entries(use)) s.takeItem(id, q);
  run.flags['deliveredAt'] = s.state.clock.minutes;
  const react = bargainReaction(s);
  const lines = [...react.lines];
  const change = Math.max(0, run.cashGiven - run.spent);
  if (change > 0) {
    s.pay(change, `Returned change to ${a.name}`, false);
    run.flags['returnedChange'] = change;
    lines.push(`Here's your change: ${formatMoney(change)}. Thank you for bringing it back!`);
  } else if (run.spent > run.cashGiven) lines.push(`You spent ${formatMoney(run.spent - run.cashGiven)} more than I gave you — that came from your pocket money.`);
  s.objective('deliver');
  s.trust(a.id, (incomplete ? -2 : 3) + react.trust);
  const how = String(run.flags['mk.lastReport'] ?? '');
  s.bus.emit('report', {
    text: `Delivered the vegetables${change > 0 ? ` and returned ${formatMoney(change)} change` : ''}.${how ? ` (${how})` : ''}`,
    tone: incomplete || n(s, 'mk.rude') ? 'bad' : 'good',
  });
  s.say(
    [
      { speaker: a.name, portrait: a.id, text: incomplete ? "Okay. Let's see what we can make with this." : 'Tomatoes and onions — perfect for tonight! 🍅🧅' },
      ...lines.map((t) => ({ speaker: a.name, portrait: a.id, text: t })),
    ],
    () => s.finishMission(incomplete ? 'incomplete' : undefined),
  );
}

export const marketDay: MissionDef = {
  id: 'market-day',
  title: 'Market Day',
  category: 'errand',
  difficulty: 2,
  icon: '🧺',
  summary: 'Buy 1 kg tomatoes and 1 kg onions at the market cart — bargain nicely and report back.',
  assignerRoles: ['mother', 'father', 'grandparent', 'guardian'],
  location: 'home',
  destination: 'town',
  briefing: "Get 1 kg tomatoes and 1 kg onions from the market cart — it's cheaper than FreshMart if you bargain nicely. Here's {budget}. Don't be rude to the vendor!",
  instructions: [
    'The market cart stands on the south side of the street, by the park pond. It is open 4–8 PM.',
    'Bargaining is a conversation, not a fight: a polite "could you do a little less?" usually gets 5–20% off.',
    'Check the quality before you pay — soft or bruised ones are worth pointing out (politely).',
    'Where market prices are fixed, ask about deals (end-of-day, bundles, "wonky" veg) instead of haggling.',
    'Bring back the vegetables and the change, and tell {assigner} how it went.',
  ],
  objectives: [
    { id: 'receive-list', label: 'Get the shopping list', type: 'talk', required: true },
    { id: 'reach-cart', label: 'Find the market cart by the park', type: 'inspect', required: true, where: { location: 'town', target: 'market-cart' }, hint: 'Out of the front door and along the garden path to the street — the cart with the striped canopy is by the park pond.' },
    { id: 'buy-tomatoes', label: 'Buy 1 kg tomatoes', type: 'collect', required: true, where: { location: 'town', target: 'market-cart' }, hint: 'Talk to the vendor (E). Ask politely for a fair price, check the quality, or bundle both vegetables.' },
    { id: 'buy-onions', label: 'Buy 1 kg onions', type: 'collect', required: true, where: { location: 'town', target: 'market-cart' }, hint: 'Buying both from the same vendor? Ask for a bundle price.' },
    { id: 'return-home', label: 'Return home', type: 'reach', target: 'home', required: true, where: { location: 'home' } },
    { id: 'deliver', label: 'Give the vegetables to {assigner}', type: 'deliver', required: true, where: { location: 'home', target: 'assigner' }, hint: 'Talk to them (E): hand over the vegetables and the change — and tell them how the bargaining went.' },
  ],
  requiredItems: REQUIRED,
  budget: 100,
  deadlineMinutes: 90,
  lateRule: 'partial',
  challenges: [{ id: 'other-customer', chance: 0.6 }, { id: 'bruised-tomatoes', chance: 0.7 }, { id: 'wrong-weight', chance: 0.5 }, { id: 'free-chilli' }],
  rewards: { xp: 140, badge: 'Fair Haggler' },
  learning: ['Bargain politely and respectfully', 'Compare prices between shops', 'Check quality before paying', 'Respect people who earn a living at the market', 'Report back honestly to whoever gave you the task'],
  skills: ['budget', 'communication', 'problem', 'empathy', 'responsibility'],
  available(state) {
    const m = state.clock.minutes % 1440;
    return m < 19 * 60 + 30 ? { ok: true } : { ok: false, reason: 'The market cart closes at 8 PM — try tomorrow evening.' };
  },
  onEvent(s, ev) {
    if (ev.type === 'interact' && ev.target === 'market-cart' && s.isOpen('market')) s.objective('reach-cart');
    if (ev.type === 'purchased') {
      if (bought(s, 'tomato')) s.objective('buy-tomatoes');
      if (bought(s, 'onion')) s.objective('buy-onions');
      if (ev.store !== 'market' && (ev.items['tomato'] || ev.items['onion'])) {
        s.flag('mk.boughtElsewhere', true);
        if ((yes(s, 'mk.refused') || yes(s, 'mk.walked')) && !yes(s, 'mk.reportedElsewhere')) {
          s.flag('mk.reportedElsewhere', true);
          const where = ev.store === 'kiosk' ? region().words.kioskName : 'FreshMart';
          const why = n(s, 'mk.rude') ? 'Was rude to the vendor and got refused ❌' : yes(s, 'mk.refused') ? 'The vendor refused to sell ❌' : 'Walked away from the market cart';
          s.bus.emit('report', { text: `${why} — bought at ${where} instead`, tone: 'bad' });
        }
      }
      if (s.state.location === 'home' && bought(s, 'tomato') && bought(s, 'onion')) s.objective('return-home');
    }
    if (ev.type === 'location' && ev.to === 'home' && bought(s, 'tomato') && bought(s, 'onion')) s.objective('return-home');
  },
  onTalk(s, member) {
    const run = s.state.run!;
    if (member.id !== run.assignerId) return false;
    if (!s.isDone('buy-tomatoes') && !s.isDone('buy-onions')) {
      s.say([
        {
          speaker: member.name,
          portrait: member.id,
          text: 'Off to the market? The list is in your journal (J). Any questions?',
          choices: [
            {
              label: '"How do I know what a fair price is?"',
              tone: 'good',
              run: () => {
                s.bump('comm', 8);
                s.say([
                  {
                    speaker: member.name,
                    portrait: member.id,
                    text: fixedCulture()
                      ? 'At the farmers\' market the prices are fixed — just pay what\'s marked, or ask if there are any deals. FreshMart is dearer, by the way.'
                      : `Tomatoes should be about ${formatMoney(money(40))} a kilo and onions ${formatMoney(money(35))}. Ask nicely — "could you do a little less?" — and never be rude. They work hard.`,
                  },
                ]);
              },
            },
            { label: "No, I'm on it!", run: () => {} },
          ],
        },
      ]);
      return true;
    }
    deliver(s);
    return true;
  },
  progress(state, id) {
    const inv = state.inventory.items;
    if (id === 'buy-tomatoes') return `${Math.min(inv['tomato'] ?? 0, KG)}/${KG} tomatoes (≈1 kg)`;
    if (id === 'buy-onions') return `${Math.min(inv['onion'] ?? 0, KG)}/${KG} onions (≈1 kg)`;
    return null;
  },
  evaluate(s, forced) {
    const run = s.state.run!;
    const finishedAt = Number(f(s)['deliveredAt'] ?? s.state.clock.minutes);
    const delivered = s.isDone('deliver');
    const remaining = checkRequired(REQUIRED, s.state.inventory);
    const missing = delivered ? n(s, 'missingAtDelivery') : remaining.missing.reduce((x, m) => x + m.qty, 0);
    const late = run.deadlineAt !== null && finishedAt > run.deadlineAt;
    const rude = n(s, 'mk.rude');
    const polite = n(s, 'mk.polite');
    const fair = money(FAIR_BASE);
    const list = money(LIST_BASE);
    const spent = run.spent;
    // budget: what you paid compared with a respectful bargain, the opening ask and the money you were given
    let budget: number;
    if (run.budget !== null && spent > run.budget) budget = budgetScore(spent, run.budget, 0);
    else if (spent <= fair) budget = 100;
    else if (spent <= list) budget = clamp(100 - (20 * (spent - fair)) / Math.max(0.01, list - fair));
    else budget = clamp(75 - (20 * (spent - list)) / Math.max(0.01, (run.budget ?? list * 1.2) - list), 55, 75);
    const scores = {
      accuracy: clamp(100 - Math.ceil(missing / 3) * 20 - (yes(s, 'mk.bruisedHome') ? 5 : 0)),
      budget,
      time: timeScore(finishedAt, run.deadlineAt, run.startedAt),
      communication: clamp(60 + Math.min(3, polite) * 8 - rude * 25 + (yes(s, 'mk.apologised') ? 10 : 0) - (yes(s, 'mk.citedFalse') ? 15 : 0) - (yes(s, 'mk.fauxPas') ? 10 : 0) + n(s, 'comm')),
      problem: clamp(
        55 +
          (yes(s, 'mk.inspected') ? 15 : 0) +
          (yes(s, 'mk.bundled') ? 10 : 0) +
          (yes(s, 'mk.citedTrue') ? 10 : 0) +
          (yes(s, 'mk.calledBack') ? 10 : 0) +
          (yes(s, 'mk.endOfDay') ? 10 : 0) +
          (yes(s, 'mk.refused') && yes(s, 'mk.boughtElsewhere') ? 5 : 0) -
          (yes(s, 'mk.citedFalse') ? 10 : 0) +
          n(s, 'problem'),
      ),
      responsibility: clamp(65 + (f(s)['returnedChange'] ? 15 : 0) - rude * 15 - (yes(s, 'mk.squeezed') ? 15 : 0) - (yes(s, 'mk.fauxPas') ? 5 : 0) + n(s, 'resp') + (polite && !rude ? 5 : 0)),
    };
    const outcome = forced ?? (missing > 0 ? 'incomplete' : late ? 'completed-late' : 'completed');
    const fb: string[] = [...notes(s)];
    if (yes(s, 'mk.refused') && yes(s, 'mk.boughtElsewhere'))
      fb.push(`${n(s, 'mk.rude') ? 'Calling the price a rip-off' : 'Losing the vendor\'s goodwill'} meant buying elsewhere — you paid ${formatMoney(spent)} in total instead of about ${formatMoney(fair)} at the cart.`);
    if (yes(s, 'mk.walked') && !n(s, 'mk.deals')) fb.push('Walking away is a fair move — but only if you have a plan B.');
    if (outcome !== 'incomplete') fb.push(`You brought home both vegetables${run.budget !== null && spent <= run.budget ? ` and stayed within the ${formatMoney(run.budget)} budget` : ''}.`);
    else fb.push('The vegetables did not all make it home. Check the list in your journal.');
    if (yes(s, 'mk.swappedBruised')) fb.push('Asking politely to swap the soft tomatoes was exactly right.');
    if (yes(s, 'mk.reweighed')) fb.push('Asking for a re-weigh got you the full kilo — politely checking keeps everyone honest.');
    if (yes(s, 'mk.accused')) fb.push('Accusing the vendor of cheating over an honest slip made things awkward — a calm request works better.');
    if (yes(s, 'mk.thankedGift')) fb.push('Thanking the vendor for the free chillies made you a welcome regular.');
    if (yes(s, 'mk.joinedMob')) fb.push('Joining a stranger in shouting at the vendor wasn\'t kind — you can disagree without ganging up.');
    if (late) fb.push(`You were ${Math.round(finishedAt - run.deadlineAt!)} minutes late.`);
    return { outcome, scores, feedback: fb };
  },
};
