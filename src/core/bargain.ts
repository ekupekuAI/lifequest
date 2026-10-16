// Market bargaining engine — pure and deterministic (no Phaser, no store).
//
// A bargain is a short negotiation with a market vendor over one or more goods sold by weight:
//   startBargain(opts)          → the opening state (ask, hidden floor, vendor mood & patience)
//   bargainMove(state, move)    → { state, vendorLine, outcome? }   ('deal' | 'walked' | 'refused')
//
// Realistic rules it models:
//  • respectful bargaining usually earns a fair 5–20% off; the price never drops below the hidden floor
//  • rudeness and insulting lowballs sour the vendor's mood → they hold or raise the price, or refuse
//  • agreeing to the first price is fine but teachable; checking quality, bundling and honest price
//    comparisons are smart; fibbing about other shops' prices backfires
//  • squeezing an elderly vendor for a couple of rupees works — and earns a gentle empathy note
//  • where market prices are fixed (US/UK/EU/Japan) the vendor politely declines to haggle but offers
//    real deals (end-of-day, bundles, "wonky" produce); hard haggling there is a social faux pas
// All amounts in the state are in the current region's currency (converted with money()).
import { rollFor } from './systems';
import { formatMoneyIn, money, region } from '../domain/region';
import { marketGood, shopUnitPrice } from '../domain/items';

export type VendorPersonality = 'friendly' | 'grumpy' | 'hard-bargainer' | 'kind-elder';
export type BargainCulture = 'haggle' | 'fixed';
export type BargainTone = 'polite' | 'neutral' | 'rude';
export type BargainOutcome = 'deal' | 'walked' | 'refused';

export interface PersonalityParams {
  label: string;
  mood: number;
  patience: number;
  /** hidden floor as a share of the opening ask */
  floor: number;
  /** share of the gap the vendor concedes per counter-offer */
  give: number;
  /** bundle discount */
  bundle: number;
  /** chance to call you back when you walk away (if the mood is OK) */
  callback: number;
  /** chance a careful look finds soft/bruised produce */
  bruised: number;
}

export const PERSONALITIES: Record<VendorPersonality, PersonalityParams> = {
  friendly: { label: 'friendly', mood: 70, patience: 6, floor: 0.8, give: 0.5, bundle: 0.12, callback: 0.85, bruised: 0.45 },
  grumpy: { label: 'grumpy', mood: 45, patience: 4, floor: 0.82, give: 0.35, bundle: 0.08, callback: 0.35, bruised: 0.5 },
  'hard-bargainer': { label: 'a hard bargainer', mood: 55, patience: 5, floor: 0.88, give: 0.25, bundle: 0.1, callback: 0.6, bruised: 0.6 },
  'kind-elder': { label: 'kind and elderly', mood: 75, patience: 6, floor: 0.85, give: 0.5, bundle: 0.1, callback: 0.75, bruised: 0.4 },
};

export interface BargainLine {
  item: string;
  /** kilograms */
  qty: number;
  basePerKg: number;
}

export type BargainMove =
  | { kind: 'offer'; amount: number; tone?: BargainTone }
  | { kind: 'accept' }
  | { kind: 'bundle'; add?: { item: string; qty: number } }
  | { kind: 'inspect' }
  | { kind: 'walkAway' }
  | { kind: 'compliment' }
  | { kind: 'cite'; shop: 'grocery' | 'kiosk'; claimed: number }
  | { kind: 'apologise' };

export interface BargainFlags {
  offers: number;
  polite: number;
  rude: number;
  compliments: number;
  inspected: boolean;
  foundBruised: boolean;
  bundled: boolean;
  citedTrue: boolean;
  citedFalse: boolean;
  calledBack: boolean;
  apologised: boolean;
  quickAccept: boolean;
  squeezedElder: boolean;
  fauxPas: boolean;
  endOfDay: boolean;
  uglyDeal: boolean;
  finalOffer: boolean;
  raised: boolean;
}

export interface BargainHistoryEntry {
  round: number;
  move: BargainMove['kind'];
  amount?: number;
  tone?: BargainTone;
  ask: number;
  mood: number;
  line: string;
}

export interface BargainState {
  /** main good & its kilos (mirrors lines[0]) */
  item: string;
  qty: number;
  lines: BargainLine[];
  personality: VendorPersonality;
  culture: BargainCulture;
  seed: number;
  /** clock minutes when the bargain started (end-of-day deals) */
  minutes: number;
  /** opening ask for everything in the deal */
  listPrice: number;
  /** current ask */
  askPrice: number;
  /** hidden: the vendor never sells below this */
  floorPrice: number;
  /** what a respectful buyer typically pays (≈10% off) */
  fairPrice: number;
  vendorMood: number;
  patience: number;
  round: number;
  status: 'open' | BargainOutcome;
  finalPrice: number | null;
  history: BargainHistoryEntry[];
  flags: BargainFlags;
}

export interface BargainResult {
  state: BargainState;
  vendorLine: string;
  outcome?: BargainOutcome;
}

export interface StartOpts {
  item: string;
  /** kilograms */
  qty: number;
  /** game seed — combined with `day` for the vendor's deterministic behaviour */
  seed: number;
  day: number;
  minutes?: number;
  personality?: VendorPersonality;
  culture?: BargainCulture;
  /** override the opening price per kg (base currency) */
  basePerKg?: number;
}

// ---------------------------------------------------------------- money helpers

const step = () => region().currency.step;
const fix = (n: number) => Math.round(n * 100) / 100;
/** Round to the currency step (nearest). */
export function roundMoney(n: number): number {
  const s = step();
  return fix(Math.max(s, Math.round(n / s) * s));
}
/** Round up to the currency step (vendors round in their own favour). */
function ceilMoney(n: number): number {
  const s = step();
  return fix(Math.max(s, Math.ceil(n / s - 1e-9) * s));
}
const fm = (n: number) => formatMoneyIn(n);
const clampMood = (m: number) => Math.max(0, Math.min(100, Math.round(m)));

export function moodEmoji(mood: number): string {
  return mood >= 75 ? '😄' : mood >= 55 ? '🙂' : mood >= 35 ? '😐' : mood >= 20 ? '😠' : '😡';
}

export function qtyLabel(kg: number): string {
  if (kg === 0.5) return '½ kg';
  if (kg % 1 === 0.5) return `${Math.floor(kg)}½ kg`;
  return `${kg} kg`;
}

export function goodsLabel(lines: BargainLine[]): string {
  return lines.map((l) => `${qtyLabel(l.qty)} ${(marketGood(l.item)?.label ?? l.item).toLowerCase()}`).join(' + ');
}

/** Deterministic vendor personality for a given game seed & day. */
export function vendorPersonalityFor(seed: number, day: number): VendorPersonality {
  const r = rollFor(seed + day, 'vendor-personality');
  return r < 0.4 ? 'friendly' : r < 0.6 ? 'grumpy' : r < 0.8 ? 'hard-bargainer' : 'kind-elder';
}

const lineList = (l: BargainLine) => l.basePerKg * l.qty;
const listOf = (lines: BargainLine[]) => money(lines.reduce((n, l) => n + lineList(l), 0));

/** What the same goods cost at FreshMart / the corner shop (current currency), when they sell them. */
export function otherShopPrices(lines: BargainLine[]): { shop: 'grocery' | 'kiosk'; label: string; price: number }[] {
  const out: { shop: 'grocery' | 'kiosk'; label: string; price: number }[] = [];
  for (const shop of ['grocery', 'kiosk'] as const) {
    let base = 0;
    let ok = true;
    for (const l of lines) {
      const unit = shopUnitPrice(shop, l.item);
      const g = marketGood(l.item);
      if (unit === undefined || !g) {
        ok = false;
        break;
      }
      base += unit * g.perKg * l.qty;
    }
    if (ok) out.push({ shop, label: shop === 'grocery' ? 'FreshMart' : region().words.kioskName, price: money(base) });
  }
  return out;
}

// ---------------------------------------------------------------- start

export function startBargain(opts: StartOpts): BargainState {
  const g = marketGood(opts.item);
  const basePerKg = opts.basePerKg ?? g?.basePerKg ?? 40;
  const seed = (opts.seed + opts.day) >>> 0;
  const personality = opts.personality ?? vendorPersonalityFor(opts.seed, opts.day);
  const culture = opts.culture ?? region().bargainCulture;
  const P = PERSONALITIES[personality];
  const lines = [{ item: opts.item, qty: opts.qty, basePerKg }];
  const list = listOf(lines);
  return {
    item: opts.item,
    qty: opts.qty,
    lines,
    personality,
    culture,
    seed,
    minutes: opts.minutes ?? 17 * 60,
    listPrice: list,
    askPrice: list,
    floorPrice: culture === 'fixed' ? list : Math.min(list, ceilMoney(list * P.floor)),
    fairPrice: Math.min(list, ceilMoney(list * 0.9)),
    vendorMood: P.mood,
    patience: P.patience,
    round: 0,
    status: 'open',
    finalPrice: null,
    history: [],
    flags: {
      offers: 0,
      polite: 0,
      rude: 0,
      compliments: 0,
      inspected: false,
      foundBruised: false,
      bundled: false,
      citedTrue: false,
      citedFalse: false,
      calledBack: false,
      apologised: false,
      quickAccept: false,
      squeezedElder: false,
      fauxPas: false,
      endOfDay: false,
      uglyDeal: false,
      finalOffer: false,
      raised: false,
    },
  };
}

/** Offer amounts the UI suggests, from the current ask. */
export function offerOptions(st: BargainState): { fair: number; cheeky: number; lowball: number; accept: number } {
  const a = st.askPrice;
  const below = (r: number) => Math.min(roundMoney(a * r), Math.max(step(), fix(a - step())));
  return { fair: below(0.9), cheeky: below(0.75), lowball: below(0.5), accept: a };
}

// ---------------------------------------------------------------- moves

const clone = (s: BargainState): BargainState => ({ ...s, lines: s.lines.map((l) => ({ ...l })), history: [...s.history], flags: { ...s.flags } });

const isElder = (st: BargainState) => st.personality === 'kind-elder';
const you = (st: BargainState) => (isElder(st) ? region().market.elderAddress : region().market.address);

function deal(st: BargainState, price: number, line: string): BargainResult {
  st.status = 'deal';
  st.finalPrice = Math.max(st.floorPrice, Math.min(price, st.askPrice));
  st.askPrice = st.finalPrice;
  return { state: st, vendorLine: line, outcome: 'deal' };
}

function refuse(st: BargainState, line: string): BargainResult {
  st.status = 'refused';
  return { state: st, vendorLine: line, outcome: 'refused' };
}

function applyTone(st: BargainState, tone: BargainTone) {
  if (tone === 'polite') {
    st.flags.polite++;
    if (st.flags.polite <= 2) st.vendorMood += 4;
  } else if (tone === 'rude') {
    st.flags.rude++;
    st.vendorMood -= 25;
  }
}

function tirePatience(st: BargainState): string {
  st.patience--;
  if (st.patience <= 0 && !st.flags.finalOffer) {
    st.flags.finalOffer = true;
    return ` Last price: ${fm(st.askPrice)}. Take it or leave it.`;
  }
  return '';
}

/** Apply one move. Never mutates the input state. */
export function bargainMove(input: BargainState, move: BargainMove): BargainResult {
  const st = clone(input);
  if (st.status !== 'open' && !(st.status === 'refused' && move.kind === 'apologise')) {
    return { state: st, vendorLine: st.status === 'deal' ? 'We already have a deal!' : 'The deal is over.' };
  }
  const isFirst = st.history.length === 0;
  st.round++;
  const r = st.culture === 'fixed' ? fixedMove(st, move, isFirst) : haggleMove(st, move, isFirst);
  r.state.vendorMood = clampMood(r.state.vendorMood);
  r.state.history.push({
    round: r.state.round,
    move: move.kind,
    amount: move.kind === 'offer' ? move.amount : move.kind === 'cite' ? move.claimed : undefined,
    tone: move.kind === 'offer' ? move.tone ?? 'neutral' : undefined,
    ask: r.state.askPrice,
    mood: r.state.vendorMood,
    line: r.vendorLine,
  });
  return r;
}

// ---------------------------------------------------------------- open-air haggling (IN, NG, MX, BR)

function haggleMove(st: BargainState, move: BargainMove, isFirst: boolean): BargainResult {
  const P = PERSONALITIES[st.personality];
  const ex = region().market.exclaim;
  const s = step();
  switch (move.kind) {
    case 'accept':
      if (isFirst) st.flags.quickAccept = true;
      return deal(st, st.askPrice, isElder(st) ? `Bless you. ${fm(st.askPrice)} — here, I picked nice ones for you.` : `Done! ${fm(st.askPrice)}. Pleasure doing business!`);

    case 'offer': {
      const tone = move.tone ?? 'neutral';
      const amount = fix(move.amount);
      st.flags.offers++;
      applyTone(st, tone);
      if (amount >= st.askPrice) return deal(st, st.askPrice, `Done, ${fm(st.askPrice)}!`);
      if (st.vendorMood < 20) return refuse(st, `${ex}! With that attitude? Then buy somewhere else!`);
      // insulting lowball: below 80% of the floor
      if (amount < st.floorPrice * 0.8) {
        st.vendorMood -= 15;
        if (st.vendorMood < 20) return refuse(st, `${ex}, ${fm(amount)}?! That doesn't even cover what I paid at the wholesale market. Then buy somewhere else!`);
        let line = `${fm(amount)}? ${ex}, that's not even my cost price!`;
        if ((tone === 'rude' || st.vendorMood < 35) && (st.personality === 'grumpy' || st.personality === 'hard-bargainer')) {
          st.askPrice = Math.min(ceilMoney(st.listPrice * 1.15), Math.max(st.askPrice, ceilMoney(st.askPrice * 1.1)));
          st.flags.raised = true;
          line += ` For you, the price just went UP: ${fm(st.askPrice)}.`;
        } else line += ` It's still ${fm(st.askPrice)}.`;
        return { state: st, vendorLine: line + tirePatience(st) };
      }
      if (st.flags.finalOffer) {
        st.vendorMood -= 8;
        if (st.vendorMood < 20) return refuse(st, `I told you my last price. Enough — buy somewhere else!`);
        return { state: st, vendorLine: `I already said: last price ${fm(st.askPrice)}.` };
      }
      // pushing a kind elderly vendor for a couple of coins: she gives in… with a sigh
      const tiny = st.askPrice - amount <= Math.max(s, money(5));
      if (isElder(st) && st.askPrice <= st.fairPrice && tiny) {
        st.flags.squeezedElder = true;
        const p = Math.max(amount, st.floorPrice);
        return deal(st, p, `(sighs) Okay, okay… ${fm(p)}. Every coin counts for me too, but take it.`);
      }
      // how much of the remaining gap the vendor still insists on: less when happy, less as the haggle goes on
      const k0 = st.vendorMood >= 75 ? 0.15 : st.vendorMood >= 60 ? 0.35 : st.vendorMood >= 40 ? 0.6 : 0.85;
      const k = k0 * Math.pow(0.85, Math.max(0, st.flags.offers - 1));
      const acceptAt = st.floorPrice + (st.askPrice - st.floorPrice) * k;
      if (amount + s / 2 >= acceptAt && amount >= st.floorPrice) {
        const warm = tone === 'polite' ? ' You asked so nicely.' : '';
        return deal(st, amount, `Okay, ${fm(amount)} — done!${warm}`);
      }
      // counter-offer
      const target = Math.max(amount, st.floorPrice);
      let counter = ceilMoney(st.askPrice - (st.askPrice - target) * (tone === 'rude' ? 0 : P.give));
      if (counter >= st.askPrice && st.askPrice > st.floorPrice && tone !== 'rude') counter = fix(st.askPrice - s);
      counter = Math.max(st.floorPrice, Math.min(st.askPrice, counter));
      const moved = counter < st.askPrice;
      st.askPrice = counter;
      const line =
        tone === 'rude'
          ? `Rip-off? I wake up at 4 AM to bring these here. Price is ${fm(st.askPrice)}.`
          : moved
            ? `${fm(amount)}? No, no… for you, ${fm(st.askPrice)}.`
            : `I can't go lower than ${fm(st.askPrice)}, really.`;
      return { state: st, vendorLine: line + tirePatience(st) };
    }

    case 'inspect': {
      if (st.flags.inspected) return { state: st, vendorLine: 'You already checked — they are good!' };
      st.flags.inspected = true;
      if (rollFor(st.seed, `inspect:${st.item}`) < P.bruised) {
        st.flags.foundBruised = true;
        st.vendorMood += 3;
        const off = Math.max(s, ceilMoney(st.askPrice * 0.05));
        st.askPrice = Math.max(st.floorPrice, fix(st.askPrice - off));
        return { state: st, vendorLine: `Oh — a couple of soft ones slipped in. Sharp eyes! I'll pick fresh ones for you… and ${fm(st.askPrice)} for the trouble.` };
      }
      st.vendorMood += st.personality === 'grumpy' ? -2 : 2;
      return { state: st, vendorLine: st.personality === 'grumpy' ? `Don't squeeze them! All fresh — came this morning.` : `See? Fresh from the farm this morning!` };
    }

    case 'bundle': {
      if (st.flags.bundled) return { state: st, vendorLine: `I already gave you the bundle price: ${fm(st.askPrice)}.` };
      const add = move.add ?? { item: st.item, qty: st.qty };
      const g = marketGood(add.item);
      const existing = st.lines.find((l) => l.item === add.item);
      if (existing) existing.qty += add.qty;
      else st.lines.push({ item: add.item, qty: add.qty, basePerKg: g?.basePerKg ?? st.lines[0].basePerKg });
      st.item = st.lines[0].item;
      st.qty = st.lines[0].qty;
      const ratio = st.askPrice / st.listPrice;
      st.listPrice = listOf(st.lines);
      st.floorPrice = Math.min(st.listPrice, ceilMoney(st.listPrice * P.floor));
      st.fairPrice = Math.min(st.listPrice, ceilMoney(st.listPrice * 0.9));
      st.askPrice = Math.max(st.floorPrice, ceilMoney(st.listPrice * ratio * (1 - P.bundle)));
      st.flags.bundled = true;
      st.vendorMood += 5;
      return { state: st, vendorLine: `${goodsLabel(st.lines)}? Good customer! Everything together for ${fm(st.askPrice)}.` };
    }

    case 'compliment': {
      const n = ++st.flags.compliments;
      const scale = st.personality === 'hard-bargainer' ? 0.5 : 1;
      if (n === 1) {
        st.vendorMood += 8 * scale;
        return { state: st, vendorLine: isElder(st) ? `(smiles) My late husband planted this patch. Thank you, dear.` : `(grins) Best ${goodsLabel([st.lines[0]]).split(' ').slice(-1)[0]} in the whole area, I tell you!` };
      }
      if (n === 2) {
        st.vendorMood += 3 * scale;
        return { state: st, vendorLine: `Haha, yes, yes. So?` + tirePatience(st) };
      }
      st.vendorMood -= 6;
      return { state: st, vendorLine: `Okay, okay — enough butter! Buy something or let others come.` + tirePatience(st) };
    }

    case 'cite': {
      const real = otherShopPrices(st.lines).find((x) => x.shop === move.shop);
      const shopName = move.shop === 'grocery' ? 'FreshMart' : region().words.kioskName;
      if (!real) return { state: st, vendorLine: `${shopName} doesn't even sell these!` };
      const honest = Math.abs(move.claimed - real.price) <= Math.max(s, real.price * 0.05);
      if (!honest && move.claimed < real.price) {
        st.flags.citedFalse = true;
        st.vendorMood -= 15;
        if (st.vendorMood < 20) return refuse(st, `${ex}! Now you're lying to me? ${shopName} charges ${fm(real.price)}. Go buy there then!`);
        return { state: st, vendorLine: `${ex}, I was at ${shopName} this morning — it's ${fm(real.price)} there. Don't fib to me!` + tirePatience(st) };
      }
      if (real.price < st.askPrice) {
        st.flags.citedTrue = true;
        st.askPrice = Math.max(st.floorPrice, ceilMoney(real.price - s));
        return { state: st, vendorLine: `Hmm… fair enough. I'll beat ${shopName}: ${fm(st.askPrice)}.` };
      }
      st.vendorMood -= 2;
      return { state: st, vendorLine: `${fm(real.price)} there? Then my ${fm(st.askPrice)} is already cheaper! And fresher.` + tirePatience(st) };
    }

    case 'walkAway': {
      const canCall = st.askPrice > st.floorPrice && st.vendorMood >= 40 && !st.flags.calledBack;
      if (canCall && rollFor(st.seed, `walk:${st.round}:${st.item}`) < P.callback) {
        st.flags.calledBack = true;
        st.askPrice = Math.max(st.floorPrice, ceilMoney(st.askPrice - (st.askPrice - st.floorPrice) * 0.6));
        st.flags.finalOffer = true;
        return { state: st, vendorLine: `Arre— wait, wait! Come back. ${fm(st.askPrice)}, final. Only for you.`.replace('Arre', ex) };
      }
      st.status = 'walked';
      return { state: st, vendorLine: st.vendorMood >= 40 ? `Okay, see you tomorrow then.` : `Go, go. Others will buy.`, outcome: 'walked' };
    }

    case 'apologise': {
      st.vendorMood += st.flags.apologised ? 5 : 30;
      st.flags.apologised = true;
      if (st.status === 'refused') {
        st.status = 'open';
        st.askPrice = Math.max(st.askPrice, st.listPrice);
        st.flags.finalOffer = true;
        return { state: st, vendorLine: `(softens) Okay… it happens. I'll sell — but at the normal price, ${fm(st.askPrice)}.` };
      }
      return { state: st, vendorLine: `It's okay, it's okay. So — ${fm(st.askPrice)}?` };
    }
  }
}

// ---------------------------------------------------------------- fixed-price markets (US, UK, EU, JP)

function fixedDealHint(st: BargainState): string {
  if (st.minutes >= 19 * 60 && !st.flags.endOfDay) {
    st.flags.endOfDay = true;
    st.askPrice = st.floorPrice = ceilMoney(st.listPrice * 0.8);
    return `it's nearly closing time — I'll do ${fm(st.askPrice)} so nothing goes to waste.`;
  }
  return `if you take a second kilo I'll knock 10% off, and the "wonky" ones are cheaper too.`;
}

function fixedMove(st: BargainState, move: BargainMove, isFirst: boolean): BargainResult {
  const s = step();
  switch (move.kind) {
    case 'accept':
      if (isFirst) st.flags.quickAccept = true;
      return deal(st, st.askPrice, `Lovely, ${fm(st.askPrice)} please. Enjoy them!`);

    case 'offer': {
      const tone = move.tone ?? 'neutral';
      const amount = fix(move.amount);
      st.flags.offers++;
      if (amount >= st.askPrice) {
        applyTone(st, tone);
        return deal(st, st.askPrice, `${fm(st.askPrice)}, thanks!`);
      }
      if (tone === 'rude' || amount < st.askPrice * 0.6) {
        st.flags.fauxPas = true;
        if (tone === 'rude') st.flags.rude++;
        st.vendorMood -= tone === 'rude' ? 35 : 12;
        if (st.vendorMood < 20) return refuse(st, `I'm sorry, we don't haggle here. I think you'd better shop somewhere else.`);
        return { state: st, vendorLine: `(awkward pause) Um… we don't really haggle here. The prices are on the board.` };
      }
      applyTone(st, tone);
      if (tone !== 'polite') st.vendorMood -= 4;
      const hint = fixedDealHint(st);
      st.patience--;
      return { state: st, vendorLine: `Sorry, prices are fixed at the market — but ${hint}` };
    }

    case 'inspect': {
      if (st.flags.inspected) return { state: st, vendorLine: 'Take your time!' };
      st.flags.inspected = true;
      if (rollFor(st.seed, `inspect:${st.item}`) < PERSONALITIES[st.personality].bruised) {
        st.flags.foundBruised = true;
        st.flags.uglyDeal = true;
        st.askPrice = st.floorPrice = Math.min(st.askPrice, ceilMoney(st.listPrice * 0.7));
        return { state: st, vendorLine: `Good eye — those knobbly ones go in our "wonky veg" box: 30% off, same taste. ${fm(st.askPrice)} for the lot.` };
      }
      st.vendorMood += 2;
      return { state: st, vendorLine: `All picked this morning — have a good look!` };
    }

    case 'bundle': {
      if (st.flags.bundled) return { state: st, vendorLine: `That's already the bundle price: ${fm(st.askPrice)}.` };
      const add = move.add ?? { item: st.item, qty: st.qty };
      const existing = st.lines.find((l) => l.item === add.item);
      if (existing) existing.qty += add.qty;
      else st.lines.push({ item: add.item, qty: add.qty, basePerKg: marketGood(add.item)?.basePerKg ?? st.lines[0].basePerKg });
      st.item = st.lines[0].item;
      st.qty = st.lines[0].qty;
      const ratio = st.askPrice / st.listPrice;
      st.listPrice = listOf(st.lines);
      st.askPrice = st.floorPrice = ceilMoney(st.listPrice * ratio * 0.9);
      st.fairPrice = st.askPrice;
      st.flags.bundled = true;
      st.vendorMood += 4;
      return { state: st, vendorLine: `Sure — that's our multi-buy deal: ${goodsLabel(st.lines)} for ${fm(st.askPrice)}.` };
    }

    case 'compliment': {
      const n = ++st.flags.compliments;
      st.vendorMood += n === 1 ? 6 : n === 2 ? 2 : -5;
      return { state: st, vendorLine: n === 1 ? `Thank you! Grew them ourselves.` : n === 2 ? `Ha, thanks!` : `(polite smile) …Will that be all?` };
    }

    case 'cite': {
      const real = otherShopPrices(st.lines).find((x) => x.shop === move.shop);
      const honest = !!real && Math.abs(move.claimed - real.price) <= Math.max(s, real.price * 0.05);
      if (!honest) {
        st.flags.citedFalse = true;
        st.flags.fauxPas = true;
        st.vendorMood -= 10;
        return { state: st, vendorLine: `Hmm, I don't think that's right. Our prices are what they are, I'm afraid.` };
      }
      return { state: st, vendorLine: `The supermarket's fine too! Ours are local and picked this morning — and the price is fixed.` };
    }

    case 'walkAway': {
      if (st.minutes >= 19 * 60 && !st.flags.endOfDay && !st.flags.calledBack) {
        st.flags.calledBack = true;
        fixedDealHint(st);
        st.flags.finalOffer = true;
        return { state: st, vendorLine: `Oh — before you go! It's nearly closing time: ${fm(st.askPrice)} so nothing goes to waste.` };
      }
      st.status = 'walked';
      return { state: st, vendorLine: `No worries — have a nice evening!`, outcome: 'walked' };
    }

    case 'apologise': {
      st.vendorMood += st.flags.apologised ? 5 : 30;
      st.flags.apologised = true;
      if (st.status === 'refused') {
        st.status = 'open';
        return { state: st, vendorLine: `That's alright. It's ${fm(st.askPrice)} if you'd like them.` };
      }
      return { state: st, vendorLine: `No harm done!` };
    }
  }
}

// ---------------------------------------------------------------- summary & feedback

export interface BargainSummary {
  text: string;
  tone: 'good' | 'neutral' | 'bad';
  /** list − paid (0 when no deal) */
  saved: number;
  /** what you said & did, as feedback sentences */
  notes: string[];
}

/** One-line report for whoever gave the task, plus specific feedback lines. */
export function summarizeBargain(st: BargainState, vendorName = region().market.vendor): BargainSummary {
  const goods = goodsLabel(st.lines);
  const f = st.flags;
  const fixed = st.culture === 'fixed';
  const notes: string[] = [];
  const saved = st.status === 'deal' && st.finalPrice !== null ? fix(st.listPrice - st.finalPrice) : 0;
  const how: string[] = [];
  if (f.polite && !f.rude) how.push('polite');
  if (f.inspected) how.push('checked quality');
  if (f.bundled) how.push('bundled');
  if (f.citedTrue) how.push('compared prices');
  if (f.calledBack) how.push('walked away & got called back');
  if (f.endOfDay) how.push('end-of-day deal');
  if (f.uglyDeal) how.push('"wonky" produce deal');

  if (st.status === 'deal' && st.finalPrice !== null) {
    if (saved > 0) {
      const ways = [f.polite && !f.rude ? 'asking politely' : null, f.bundled ? 'buying in a bundle' : null, f.foundBruised ? 'checking the quality' : null, f.citedTrue ? 'mentioning the real price elsewhere' : null, f.calledBack ? 'walking away politely' : null, f.endOfDay ? 'asking near closing time' : null]
        .filter(Boolean)
        .join(' and ');
      notes.push(`You got ${goods} for ${fm(st.finalPrice)} instead of ${fm(st.listPrice)}${ways ? ` by ${ways}` : ''}${f.rude ? '.' : ' — smart.'}`);
    } else if (f.quickAccept)
      notes.push(
        fixed
          ? `You paid the marked price (${fm(st.finalPrice)}) — exactly right at a ${region().market.term}'s stall, where prices are fixed.`
          : `You agreed to the first price (${fm(st.finalPrice)}). That's fine — but at an open market, a polite "could you do a little less?" usually saves 5–20%.`,
      );
    else notes.push(`You paid ${fm(st.finalPrice)} for ${goods}.`);
  }
  if (f.rude) notes.push(st.status === 'refused' ? `Calling the price a rip-off made ${vendorName} refuse to sell.` : `Being rude to ${vendorName} cost goodwill — firm but friendly gets better prices.`);
  if (f.raised) notes.push('The insulting lowball made the vendor raise the price instead of lowering it.');
  if (f.citedFalse) notes.push('Claiming another shop was cheaper wasn’t true — vendors know the prices around them, and the fib cost you goodwill.');
  if (f.fauxPas && fixed) notes.push(`At a ${region().label} farmers' market prices are fixed — hard haggling comes across as rude. Asking about deals (end-of-day, bundles, wonky veg) is the polite way.`);
  if (f.squeezedElder) notes.push(`${vendorName} gave in for just a couple of coins — but she sells vegetables to make a living. A fair price is a kind price.`);
  if (f.apologised) notes.push('Apologising after being rude was the right move — it reopened the conversation.');
  if (f.compliments >= 3) notes.push('A little small talk helps; too much flattery gets cringe.');

  let text: string;
  let tone: BargainSummary['tone'];
  if (st.status === 'deal' && st.finalPrice !== null) {
    const bad = f.rude > 0 || f.citedFalse || f.squeezedElder || (f.fauxPas && fixed);
    tone = bad ? 'neutral' : saved > 0 || (fixed && !f.fauxPas) ? 'good' : 'neutral';
    const tags = [...how, ...(f.rude ? ['was rude'] : []), ...(f.citedFalse ? ['fibbed about prices'] : []), ...(f.squeezedElder ? ['squeezed an elderly vendor'] : [])];
    text = `Bargained for ${goods}: paid ${fm(st.finalPrice)} (asked ${fm(st.listPrice)})${tags.length ? `, ${tags.join(' & ')}` : ''} ${tone === 'good' ? '✅' : '⚠️'}`;
  } else if (st.status === 'refused') {
    tone = 'bad';
    text = f.rude ? `Was rude to the vendor and got refused ❌` : f.citedFalse ? `Fibbed about prices and the vendor refused to sell ❌` : `The vendor refused to sell ${goods} ❌`;
  } else {
    tone = 'neutral';
    text = `Walked away from the ${region().market.term} without buying ${goods}`;
  }
  return { text, tone, saved, notes };
}
