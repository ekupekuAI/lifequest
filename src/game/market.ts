// Market cart: the vendor, the goods and the bargaining dialogue. Plain functions over the
// GameStore (no Phaser) so missions and tests can drive them; TownScene draws the cart & vendor.
//
// Flow: interact 'market-cart' → pick goods → pick weight → bargain (src/core/bargain.ts) with
// store.say choices → deal / walk away / refusal → pay, bag the goods, report to whoever gave the
// task (bus 'report'), record what happened in run flags for the mission & family memory.
import type { GameStore, DialogueChoice } from '../core/store';
import {
  bargainMove,
  goodsLabel,
  moodEmoji,
  offerOptions,
  otherShopPrices,
  qtyLabel,
  roundMoney,
  startBargain,
  summarizeBargain,
  vendorPersonalityFor,
  PERSONALITIES,
  type BargainHistoryEntry,
  type BargainMove,
  type BargainResult,
  type BargainState,
  type VendorPersonality,
} from '../core/bargain';
import { rollFor } from '../core/systems';
import { MARKET_GOODS, formatMoney, itemName, marketGood, type MarketGood } from '../domain/items';
import { money, region } from '../domain/region';
import { hoursLabel } from '../domain/world';
import { MARKET_CHALLENGES } from '../missions/marketChallenges';

export const MARKET_TARGET = 'market-cart';
/** challenges the market flow presents during the Market Day mission */
const MARKET_MISSION = 'market-day';

// ---------------------------------------------------------------- vendor of the day

export interface VendorInfo {
  key: 'vendor' | 'vendor-elder';
  name: string;
  address: string;
  personality: VendorPersonality;
}

export function todaysPersonality(s: GameStore): VendorPersonality {
  return vendorPersonalityFor(s.state.seed, s.state.clock.day);
}

/** Who is minding the cart today (the elderly vendor on 'kind-elder' days). */
export function todaysVendor(s: GameStore): VendorInfo {
  const personality = todaysPersonality(s);
  const m = region().market;
  const v: VendorInfo =
    personality === 'kind-elder'
      ? { key: 'vendor-elder', name: m.elder, address: m.elderAddress, personality }
      : { key: 'vendor', name: m.vendor, address: m.address, personality };
  lastAddress = v.address;
  return v;
}

let lastAddress: string | null = null;
/** How the player addresses the vendor they are talking to (Bhaiya / Amma / Mama / Excuse me…). */
export function vendorAddress(): string {
  return lastAddress ?? region().market.address;
}

const speaker = (s: GameStore, mood: number) => {
  const v = todaysVendor(s);
  return { speaker: `${v.name} (${moodEmoji(mood)})`, portrait: `npc:${v.key}` };
};
const pieces = (g: MarketGood | undefined, kg: number) => Math.max(1, Math.round((g?.perKg ?? 1) * kg));
const refusedKey = (s: GameStore) => `market.refused.${s.state.clock.day}`;
const inMission = (s: GameStore) => s.state.run?.missionId === MARKET_MISSION && s.state.run.status === 'in-progress';

// ---------------------------------------------------------------- entry points

/** Handle a town interaction with the cart. Returns true when handled. */
export function marketInteract(s: GameStore, target: string): boolean {
  if (target !== MARKET_TARGET) return false;
  const v = todaysVendor(s);
  if (!s.isOpen('market')) {
    s.say([{ speaker: region().market.cart, text: `The cart is covered with a tarp for the night. ${v.name} sells fresh vegetables and fruit here ${hoursLabel('market')}.` }]);
    return true;
  }
  if (s.state.world[refusedKey(s)]) return refusedAgain(s);
  const run = s.state.run;
  if (inMission(s) && run && !run.challengesSeen.includes('other-customer') && rollFor(s.state.seed + run.startedAt, 'other-customer') < 0.6 * challengeMul(s)) {
    s.presentChallenge(MARKET_CHALLENGES['other-customer'], () => pickGoods(s));
    return true;
  }
  pickGoods(s);
  return true;
}

/** Route town 'interact' events for the cart to the market flow. Returns an unsubscribe. */
export function installMarketHandlers(s: GameStore): () => void {
  return s.bus.on('game', (ev) => {
    if (ev.type !== 'interact' || s.ui.dialogue || s.ui.modal) return;
    marketInteract(s, ev.target);
  });
}

function challengeMul(s: GameStore) {
  return s.diff.challengeMul;
}

/** The goods board + "what would you like?" */
export function pickGoods(s: GameStore, kind: 'veg' | 'fruit' = 'veg') {
  const v = todaysVendor(s);
  const goods = MARKET_GOODS.filter((g) => g.kind === kind);
  const board = goods.map((g) => `${g.label} ${formatMoney(roundMoney(perKg(g)))}/kg`).join(' · ');
  const fixed = region().bargainCulture === 'fixed';
  const greet =
    v.personality === 'kind-elder'
      ? `Come, come. Everything is fresh today.`
      : v.personality === 'grumpy'
        ? `Yes? Prices are on the board.`
        : v.personality === 'hard-bargainer'
          ? `Best quality in town — and the price is the price… mostly.`
          : `${region().words.greeting} Fresh from the farm today!`;
  s.say([
    {
      ...speaker(s, startMood(s)),
      text: `${greet}\n${board}${fixed ? '\n(Prices per kg — marked on the board.)' : ''}`,
      choices: [
        ...goods.map((g) => ({ label: `${g.label}`, hint: `${formatMoney(roundMoney(perKg(g)))} per kg`, run: () => pickQty(s, g) })),
        kind === 'veg' ? { label: 'Fruit…', hint: 'Bananas, mangoes, apples', run: () => pickGoods(s, 'fruit') } : { label: 'Vegetables…', run: () => pickGoods(s, 'veg') },
        { label: 'Just looking, thanks', run: () => {} },
      ],
    },
  ]);
}

const perKg = (g: MarketGood) => money(g.basePerKg);
const startMood = (s: GameStore) => PERSONALITIES[todaysPersonality(s)].mood;

function pickQty(s: GameStore, g: MarketGood) {
  const opts = (g.minQty < 1 ? [0.5, 1] : [1, 2]).map((kg) => ({
    label: `${qtyLabel(kg)} ${g.label.toLowerCase()}`,
    hint: g.perKg > 1 ? `about ${pieces(g, kg)} ${pieces(g, kg) > 1 ? g.label.toLowerCase() : itemName(g.item).toLowerCase()}` : undefined,
    run: () => beginBargain(s, g.item, kg),
  }));
  s.say([{ ...speaker(s, startMood(s)), text: `${g.label}? How much?`, choices: [...opts, { label: 'Back', run: () => pickGoods(s, g.kind) }] }]);
}

/** Start a bargain for `kg` of `item` (also used by tests). */
export function beginBargain(s: GameStore, item: string, kg: number): BargainState {
  let st = startBargain({ item, qty: kg, seed: s.state.seed, day: s.state.clock.day, minutes: s.state.clock.minutes % 1440 });
  if (s.getFlag('mk.calmCustomer', false)) st.vendorMood += 5;
  if (s.getFlag('mk.joinedMob', false)) st.vendorMood -= 20;
  if (s.state.world[`market.apologised.${s.state.clock.day}`]) st = { ...st, vendorMood: Math.min(st.vendorMood, 45), flags: { ...st.flags, apologised: true } };
  if (inMission(s)) s.objective('reach-cart');
  const g = marketGood(item);
  const open = region().bargainCulture === 'fixed' ? `${g?.label ?? itemName(item)}: ${formatMoney(st.askPrice)} for ${qtyLabel(kg)}. Prices are as marked.` : `${qtyLabel(kg)} ${g?.label.toLowerCase() ?? itemName(item)}? ${formatMoney(st.askPrice)}.`;
  showBargain(s, st, open);
  return st;
}

// ---------------------------------------------------------------- the bargaining screen

/** Which extra goods a bundle would add: the other thing on the Market Day list, else one more of the same. */
function bundleAdd(s: GameStore, st: BargainState): { item: string; qty: number } {
  if (inMission(s)) {
    const want = st.item === 'tomato' ? 'onion' : st.item === 'onion' ? 'tomato' : null;
    if (want && !st.lines.some((l) => l.item === want) && !s.hasItem(want, 6)) return { item: want, qty: 1 };
  }
  return { item: st.item, qty: st.qty };
}

export function showBargain(s: GameStore, st: BargainState, line: string) {
  const v = todaysVendor(s);
  const o = offerOptions(st);
  const fm = formatMoney;
  const move = (m: BargainMove) => () => applyMove(s, st, m);
  const head = `${line}\n\nAsking: ${fm(st.askPrice)} for ${goodsLabel(st.lines)}.  You have ${fm(s.state.wallet.balance)}.`;
  let choices: DialogueChoice[];
  if (st.status === 'refused') {
    choices = [
      { label: `"I'm sorry, ${v.address} — that was rude of me."`, hint: 'apologise', run: move({ kind: 'apologise' }) },
      { label: 'Leave and buy somewhere else', run: () => finish(s, st, { state: st, vendorLine: '', outcome: 'refused' }, true) },
    ];
  } else if (st.flags.finalOffer) {
    choices = [
      { label: `"Okay, ${fm(st.askPrice)}. Deal."`, hint: 'accept', run: move({ kind: 'accept' }) },
      { label: `"${v.address}, ${fm(o.fair)}? Please?"`, hint: 'one more try', run: move({ kind: 'offer', amount: o.fair, tone: 'polite' }) },
      ...(st.vendorMood < 35 && !st.flags.apologised ? [{ label: `"Sorry — I didn't mean to be rude."`, hint: 'apologise', run: move({ kind: 'apologise' }) }] : []),
      { label: '"No thanks." (walk away)', run: move({ kind: 'walkAway' }) },
    ];
  } else {
    choices = [
      { label: `"${v.address}, could you do ${fm(o.fair)}?"`, hint: 'polite · about 10% less', run: move({ kind: 'offer', amount: o.fair, tone: 'polite' }) },
      { label: `"How about ${fm(o.cheeky)}?"`, hint: 'cheeky · about 25% less', run: move({ kind: 'offer', amount: o.cheeky, tone: 'neutral' }) },
      { label: `"${fm(o.lowball)}! ${fm(st.askPrice)} is a rip-off!"`, hint: 'rude lowball · half price', run: move({ kind: 'offer', amount: o.lowball, tone: 'rude' }) },
      { label: `"Okay, ${fm(st.askPrice)} is fine."`, hint: 'accept the price', run: move({ kind: 'accept' }) },
      ...(!st.flags.inspected ? [{ label: 'Check the quality first', hint: 'look for soft or bruised ones', run: move({ kind: 'inspect' }) }] : []),
      { label: 'More…', hint: 'bundle · small talk · compare prices · walk away', run: () => moreMenu(s, st) },
    ];
  }
  s.say([{ ...speaker(s, st.vendorMood), text: head, choices }]);
}

function moreMenu(s: GameStore, st: BargainState) {
  const v = todaysVendor(s);
  const fm = formatMoney;
  const move = (m: BargainMove) => () => applyMove(s, st, m);
  const add = bundleAdd(s, st);
  const g = marketGood(add.item);
  const fresh = otherShopPrices(st.lines).find((x) => x.shop === 'grocery');
  const choices: DialogueChoice[] = [];
  if (!st.flags.bundled)
    choices.push({
      label: add.item === st.item ? `"If I take ${qtyLabel(st.qty + add.qty)}, will you give a better price?"` : `"If I also take ${qtyLabel(add.qty)} ${g?.label.toLowerCase()}, a better price for both?"`,
      hint: 'bundle',
      run: move({ kind: 'bundle', add }),
    });
  choices.push({ label: `"Busy evening? These look really fresh!"`, hint: 'small talk', run: move({ kind: 'compliment' }) });
  if (fresh) {
    choices.push({ label: `"FreshMart charges ${fm(fresh.price)} for this."`, hint: 'compare prices (true)', run: move({ kind: 'cite', shop: 'grocery', claimed: fresh.price }) });
    const fib = roundMoney(Math.min(st.askPrice, fresh.price) * 0.6);
    choices.push({ label: `"FreshMart sells it for just ${fm(fib)}."`, hint: 'claim a lower price (not true)', run: move({ kind: 'cite', shop: 'grocery', claimed: fib }) });
  }
  if (st.vendorMood < 35 && !st.flags.apologised) choices.push({ label: `"Sorry, ${v.address} — I didn't mean to be rude."`, hint: 'apologise', run: move({ kind: 'apologise' }) });
  choices.push({ label: '"Hmm, I\'ll think about it." (walk away)', hint: 'they might call you back… or not', run: move({ kind: 'walkAway' }) });
  choices.push({ label: 'Back', run: () => showBargain(s, st, 'Hmm?') });
  s.say([{ ...speaker(s, st.vendorMood), text: `Asking: ${fm(st.askPrice)} for ${goodsLabel(st.lines)}. What do you say?`, choices }]);
}

/** Apply a move and show the result (or finish the bargain). */
export function applyMove(s: GameStore, st: BargainState, m: BargainMove): BargainResult {
  const r = bargainMove(st, m);
  s.spendTime(0.5);
  if (r.outcome) finish(s, r.state, r);
  else showBargain(s, r.state, r.vendorLine);
  return r;
}

// ---------------------------------------------------------------- finishing a bargain

/** What was already recorded for a bargain (keyed by its first history entry, which survives move clones). */
const recorded = new WeakMap<BargainHistoryEntry, { polite: number; rude: number }>();

/** Record the bargain in run flags (for the mission & memory). Safe to call again for the same bargain. */
function record(s: GameStore, st: BargainState, summary: ReturnType<typeof summarizeBargain>) {
  if (!s.state.run) return;
  const f = st.flags;
  const b = (k: string, v: boolean) => v && s.flag(k, true);
  const key = st.history[0];
  const before = (key && recorded.get(key)) ?? { polite: 0, rude: 0 };
  if (key) recorded.set(key, { polite: f.polite, rude: f.rude });
  if (st.status === 'deal' && st.finalPrice !== null) {
    s.bump('mk.deals', 1);
    s.flag('mk.paid', Math.round((s.getFlag('mk.paid', 0) + st.finalPrice) * 100) / 100);
    s.flag('mk.list', Math.round((s.getFlag('mk.list', 0) + st.listPrice) * 100) / 100);
  }
  s.bump('mk.polite', f.polite - before.polite);
  s.bump('mk.rude', f.rude - before.rude);
  b('mk.inspected', f.inspected);
  b('mk.foundBruised', f.foundBruised);
  b('mk.bundled', f.bundled);
  b('mk.citedTrue', f.citedTrue);
  b('mk.citedFalse', f.citedFalse);
  b('mk.calledBack', f.calledBack);
  b('mk.apologised', f.apologised);
  b('mk.quickAccept', f.quickAccept && st.culture === 'haggle');
  b('mk.squeezed', f.squeezedElder);
  b('mk.fauxPas', f.fauxPas);
  b('mk.raised', f.raised);
  b('mk.endOfDay', f.endOfDay || f.uglyDeal);
  if (st.status === 'refused') s.flag('mk.refused', true);
  if (st.status === 'walked') s.flag('mk.walked', true);
  s.flag('mk.culture', st.culture);
  s.flag('mk.vendor', todaysVendor(s).name);
  s.flag('mk.lastReport', summary.text);
  const prev = JSON.parse(String(s.getFlag('mk.notes', '[]'))) as string[];
  s.flag('mk.notes', JSON.stringify([...prev, ...summary.notes.filter((n) => !prev.includes(n))].slice(-8)));
}

function finish(s: GameStore, st: BargainState, r: BargainResult, leaving = false) {
  const v = todaysVendor(s);
  const summary = summarizeBargain(st, v.name);
  const sp = speaker(s, st.vendorMood);

  if (r.outcome === 'deal' && st.finalPrice !== null) {
    const price = st.finalPrice;
    const label = `${region().market.cart}: ${goodsLabel(st.lines)}`;
    if (s.state.wallet.balance < price) {
      s.say([{ ...sp, text: `${r.vendorLine}\n\n…You only have ${formatMoney(s.state.wallet.balance)}. "No problem — come back when you have ${formatMoney(price)}."` }]);
      return;
    }
    const items: Record<string, number> = {};
    for (const l of st.lines) items[l.item] = (items[l.item] ?? 0) + pieces(marketGood(l.item), l.qty);
    const given: [string, number][] = [];
    for (const [id, n] of Object.entries(items)) {
      if (!s.giveItem(id, n)) {
        for (const [gid, gn] of given) s.takeItem(gid, gn);
        s.say([{ ...sp, text: `Your bag is too full to carry ${goodsLabel(st.lines)}. Make some space first!` }]);
        return;
      }
      given.push([id, n]);
    }
    s.pay(price, label);
    const totalPieces = Object.values(items).reduce((a, b) => a + b, 0);
    s.state.receipts.push({
      at: s.state.clock.minutes,
      day: s.state.clock.day,
      store: region().market.cart,
      lines: Object.entries(items).map(([id, n]) => ({ id, name: itemName(id), qty: n, price: Math.round((price * (n / totalPieces) * 100) / n) / 100 })),
      total: price,
    });
    s.spendTime(2);
    record(s, st, summary);
    s.log(`Market: ${summary.text}`, summary.notes[0] ?? 'Bought at the market cart.', summary.tone, [
      { label: 'Ask politely for ~10% less', outcome: 'Usually a fair deal and a happy vendor', tone: 'good' },
      { label: 'Call the price a rip-off', outcome: 'The vendor raises the price or refuses to sell', tone: 'bad' },
    ]);
    if (st.flags.polite && !st.flags.rude) s.skill('communication', 2);
    if (summary.saved > 0) s.skill('budget', 2);
    s.bus.emit('report', { text: summary.text, tone: summary.tone });
    s.toast(`Paid ${formatMoney(price)} · ${goodsLabel(st.lines)} in your bag`, summary.tone === 'bad' ? 'bad' : 'good');
    const before = s.ui.dialogue;
    s.emit({ type: 'purchased', store: 'market', items });
    if (s.ui.dialogue && s.ui.dialogue !== before) return; // a challenge took over
    const got = Object.entries(items).map(([id, n]) => `${n}× ${itemName(id)}`).join(', ');
    s.say([{ ...speaker(s, st.vendorMood), text: `${r.vendorLine}\n\n(You pay ${formatMoney(price)} and get ${got}.)` }], () => afterDeal(s, st));
    return;
  }

  // refused / walked away
  if (r.outcome === 'refused') s.state.world[refusedKey(s)] = true;
  record(s, st, summary);
  s.log(`Market: ${summary.text}`, summary.notes[0] ?? (r.outcome === 'walked' ? 'You left without buying.' : 'The vendor would not sell.'), summary.tone);
  s.bus.emit('report', { text: summary.text, tone: summary.tone });
  if (leaving) {
    s.toast(r.outcome === 'refused' ? 'Try FreshMart or the corner shop instead — or come back and apologise.' : 'You left the cart.', 'neutral');
    return;
  }
  s.say([
    {
      ...sp,
      text: r.vendorLine,
      ...(r.outcome === 'refused'
        ? {
            choices: [
              { label: `"I'm sorry, ${v.address} — that was rude of me."`, hint: 'apologise', run: () => applyMove(s, st, { kind: 'apologise' }) },
              { label: 'Leave and buy somewhere else', run: () => s.toast('FreshMart and the corner shop sell vegetables too — at their prices.', 'neutral') },
            ],
          }
        : {}),
    },
  ]);
}

/** After a Market Day deal: the little things that happen at a real cart. */
function afterDeal(s: GameStore, st: BargainState) {
  const run = s.state.run;
  if (!inMission(s) || !run) return;
  const seen = (id: string) => run.challengesSeen.includes(id);
  const roll = (id: string) => rollFor(s.state.seed + run.startedAt, id);
  const queue: string[] = [];
  const hasTomato = st.lines.some((l) => l.item === 'tomato');
  if (hasTomato && !st.flags.inspected && !seen('bruised-tomatoes') && roll('bruised-tomatoes') < 0.7 * challengeMul(s)) queue.push('bruised-tomatoes');
  else if (hasTomato && !seen('wrong-weight') && roll('wrong-weight') < 0.5 * challengeMul(s)) queue.push('wrong-weight');
  if (st.flags.polite && !st.flags.rude && st.vendorMood >= 70 && !seen('free-chilli')) queue.push('free-chilli');
  const next = () => {
    const id = queue.shift();
    if (id) s.presentChallenge(MARKET_CHALLENGES[id], next);
  };
  next();
}

/** Coming back after being refused earlier today. */
function refusedAgain(s: GameStore): boolean {
  const v = todaysVendor(s);
  s.say([
    {
      ...speaker(s, 15),
      text: `You again? After what you said earlier?`,
      choices: [
        {
          label: `"I'm sorry about earlier, ${v.address}. I was rude."`,
          hint: 'apologise',
          run: () => {
            delete s.state.world[refusedKey(s)];
            s.state.world[`market.apologised.${s.state.clock.day}`] = true;
            s.flag('mk.apologised', true);
            s.bump('comm', 5);
            s.say([{ ...speaker(s, 45), text: `(sighs) Okay. Everyone has a bad day. What do you need?` }], () => pickGoods(s));
          },
        },
        { label: 'Leave', run: () => {} },
      ],
    },
  ]);
  return true;
}
