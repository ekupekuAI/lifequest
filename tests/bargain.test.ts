import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStore } from '../src/core/store';
import {
  PERSONALITIES,
  bargainMove,
  offerOptions,
  otherShopPrices,
  startBargain,
  summarizeBargain,
  vendorPersonalityFor,
  type BargainMove,
  type BargainState,
  type VendorPersonality,
} from '../src/core/bargain';
import { mulberry32 } from '../src/core/systems';
import { money, region, setRegion } from '../src/domain/region';
import { checkRequired } from '../src/missions/validation';
import { getMission } from '../src/missions/registry';
import { MARKET_CHALLENGES } from '../src/missions/marketChallenges';
import { applyMove, beginBargain, installMarketHandlers, todaysVendor } from '../src/game/market';
import { byLabel, idOf, newStore, settle, type Picker } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
  setRegion('in');
});
afterEach(() => {
  vi.useRealTimers();
  setRegion('in');
});

const start = (personality: VendorPersonality, extra: Partial<Parameters<typeof startBargain>[0]> = {}) =>
  startBargain({ item: 'tomato', qty: 1, seed: 4242, day: 1, personality, ...extra });

/** Run moves in order, stopping at the first outcome. */
function play(st: BargainState, moves: ((s: BargainState) => BargainMove)[]) {
  let cur = st;
  let outcome: string | undefined;
  const lines: string[] = [];
  for (const m of moves) {
    const r = bargainMove(cur, m(cur));
    cur = r.state;
    lines.push(r.vendorLine);
    if (r.outcome) {
      outcome = r.outcome;
      break;
    }
  }
  return { state: cur, outcome, lines };
}

const fair = (tone: 'polite' | 'neutral' | 'rude' = 'polite') => (s: BargainState): BargainMove => ({ kind: 'offer', amount: offerOptions(s).fair, tone });
const cheeky = (s: BargainState): BargainMove => ({ kind: 'offer', amount: offerOptions(s).cheeky, tone: 'neutral' });
const rudeLowball = (s: BargainState): BargainMove => ({ kind: 'offer', amount: offerOptions(s).lowball, tone: 'rude' });

describe('bargain engine', () => {
  it('is deterministic for the same seed, day and moves', () => {
    expect(vendorPersonalityFor(77, 3)).toBe(vendorPersonalityFor(77, 3));
    const seq = [cheeky, (_: BargainState) => ({ kind: 'inspect' }) as BargainMove, fair(), { kind: 'walkAway' } as never];
    const moves = seq.map((m) => (typeof m === 'function' ? m : () => m));
    const a = play(startBargain({ item: 'onion', qty: 1, seed: 77, day: 3 }), moves);
    const b = play(startBargain({ item: 'onion', qty: 1, seed: 77, day: 3 }), moves);
    expect(a.state).toEqual(b.state);
    expect(a.lines).toEqual(b.lines);
    // the input state is never mutated
    const st = start('friendly');
    const copy = JSON.parse(JSON.stringify(st));
    bargainMove(st, { kind: 'offer', amount: 10, tone: 'rude' });
    expect(st).toEqual(copy);
  });

  it('never sells below the hidden floor, whatever the player does', () => {
    const kinds: VendorPersonality[] = ['friendly', 'grumpy', 'hard-bargainer', 'kind-elder'];
    for (const regionId of ['in', 'ng', 'mx', 'uk'] as const) {
      setRegion(regionId);
      for (let seed = 1; seed <= 60; seed++) {
        const rnd = mulberry32(seed);
        const personality = kinds[seed % 4];
        let st = startBargain({ item: seed % 2 ? 'tomato' : 'mango', qty: seed % 3 ? 1 : 0.5, seed, day: 1, personality, minutes: 17 * 60 + (seed % 5) * 40 });
        const initialFloor = st.floorPrice;
        for (let i = 0; i < 14 && st.status !== 'deal'; i++) {
          const o = offerOptions(st);
          const pick = Math.floor(rnd() * 9);
          const tone = (['polite', 'neutral', 'rude'] as const)[Math.floor(rnd() * 3)];
          const m: BargainMove =
            pick === 0 ? { kind: 'offer', amount: o.fair, tone } :
            pick === 1 ? { kind: 'offer', amount: o.cheeky, tone } :
            pick === 2 ? { kind: 'offer', amount: o.lowball, tone } :
            pick === 3 ? { kind: 'inspect' } :
            pick === 4 ? { kind: 'bundle' } :
            pick === 5 ? { kind: 'compliment' } :
            pick === 6 ? { kind: 'cite', shop: 'grocery', claimed: Math.round(rnd() * 80) } :
            pick === 7 ? { kind: 'walkAway' } : { kind: 'apologise' };
          st = bargainMove(st, m).state;
          if (st.status === 'walked') break;
          expect(st.askPrice).toBeGreaterThanOrEqual(st.floorPrice);
        }
        if (st.status === 'deal') {
          expect(st.finalPrice!).toBeGreaterThanOrEqual(st.floorPrice);
          if (st.culture === 'haggle' && !st.flags.bundled) expect(st.finalPrice!).toBeGreaterThanOrEqual(initialFloor);
        }
      }
    }
  });

  it('a polite fair offer gets a 5–20% discount from a friendly vendor', () => {
    const r = play(start('friendly'), [fair('polite')]);
    expect(r.outcome).toBe('deal');
    const off = 1 - r.state.finalPrice! / r.state.listPrice;
    expect(off).toBeGreaterThanOrEqual(0.05);
    expect(off).toBeLessThanOrEqual(0.2);
    expect(r.state.vendorMood).toBeGreaterThan(PERSONALITIES.friendly.mood);
    const sum = summarizeBargain(r.state, 'Ramesh');
    expect(sum.tone).toBe('good');
    expect(sum.text).toMatch(/paid ₹\d+ \(asked ₹45\), polite ✅/);
    expect(sum.notes[0]).toMatch(/instead of ₹45 by asking politely — smart/);
  });

  it('respectful haggling with a grumpy vendor converges to a fair price', () => {
    const r = play(start('grumpy'), Array.from({ length: 8 }, () => fair('polite')).concat([() => ({ kind: 'accept' })]));
    expect(r.outcome).toBe('deal');
    expect(r.state.finalPrice!).toBeLessThan(r.state.listPrice);
    expect(r.state.finalPrice!).toBeGreaterThanOrEqual(r.state.floorPrice);
  });

  it('rude lowballing sours the mood: grumpy vendors refuse, friendly ones hold firm', () => {
    const g = play(start('grumpy'), [rudeLowball]);
    expect(g.outcome).toBe('refused');
    expect(g.lines[0]).toMatch(/buy somewhere else/);
    const sum = summarizeBargain(g.state, 'Ramesh');
    expect(sum.tone).toBe('bad');
    expect(sum.text).toMatch(/rude to the vendor and got refused ❌/);
    expect(sum.notes.join(' ')).toMatch(/rip-off made Ramesh refuse/);

    const f = play(start('friendly'), [rudeLowball]);
    expect(f.outcome).toBeUndefined();
    expect(f.state.vendorMood).toBeLessThan(PERSONALITIES.friendly.mood - 30);
    expect(f.state.askPrice).toBe(f.state.listPrice);
    // a second insult ends it
    expect(play(f.state, [rudeLowball]).outcome).toBe('refused');
  });

  it('a hard bargainer raises the price after an insulting lowball', () => {
    const r = play(start('hard-bargainer'), [(s) => ({ kind: 'offer', amount: offerOptions(s).lowball, tone: 'neutral' }), rudeLowball]);
    const raised = r.state.history.some((h) => h.ask > r.state.listPrice);
    expect(raised || r.outcome === 'refused').toBe(true);
  });

  it('apologising after a refusal reopens the deal at the normal price', () => {
    const refused = play(start('grumpy'), [rudeLowball]);
    expect(refused.outcome).toBe('refused');
    const g = { state: bargainMove(refused.state, { kind: 'apologise' }).state };
    expect(g.state.status).toBe('open');
    expect(g.state.flags.apologised).toBe(true);
    expect(g.state.askPrice).toBe(g.state.listPrice);
    expect(play(g.state, [() => ({ kind: 'accept' })]).outcome).toBe('deal');
  });

  it('walking away: a friendly vendor may call you back with a better price — or not', () => {
    let calledBack: BargainState | null = null;
    let walked: BargainState | null = null;
    for (let seed = 1; seed < 200 && (!calledBack || !walked); seed++) {
      const r = bargainMove(startBargain({ item: 'tomato', qty: 1, seed, day: 1, personality: 'hard-bargainer' }), { kind: 'walkAway' });
      if (r.state.flags.calledBack) calledBack ??= r.state;
      else if (r.outcome === 'walked') walked ??= r.state;
    }
    expect(calledBack).not.toBeNull();
    expect(calledBack!.status).toBe('open');
    expect(calledBack!.askPrice).toBeLessThan(calledBack!.listPrice);
    expect(calledBack!.askPrice).toBeGreaterThanOrEqual(calledBack!.floorPrice);
    expect(walked).not.toBeNull();
    // an angry vendor never calls you back
    const angry = play(start('friendly'), [rudeLowball, () => ({ kind: 'walkAway' })]);
    expect(angry.outcome).toBe('walked');
    expect(angry.state.flags.calledBack).toBe(false);
  });

  it('accepting the first price is fine but flagged as a quick accept', () => {
    const r = play(start('friendly'), [() => ({ kind: 'accept' })]);
    expect(r.state.finalPrice).toBe(r.state.listPrice);
    expect(r.state.flags.quickAccept).toBe(true);
    expect(summarizeBargain(r.state).notes[0]).toMatch(/first price/);
  });

  it('citing another shop only works when it is true', () => {
    const st = start('friendly', { basePerKg: 90 }); // pricier than FreshMart today
    const fresh = otherShopPrices(st.lines).find((x) => x.shop === 'grocery')!;
    expect(fresh.price).toBe(money(12 * 6));
    const honest = bargainMove(st, { kind: 'cite', shop: 'grocery', claimed: fresh.price });
    expect(honest.state.flags.citedTrue).toBe(true);
    expect(honest.state.askPrice).toBeLessThanOrEqual(fresh.price);
    expect(honest.state.askPrice).toBeLessThan(st.listPrice);
    const fib = bargainMove(start('friendly'), { kind: 'cite', shop: 'grocery', claimed: 20 });
    expect(fib.state.flags.citedFalse).toBe(true);
    expect(fib.vendorLine).toMatch(/Don't fib/);
    // cart is already cheaper than FreshMart: the vendor says so
    const cheaper = bargainMove(start('friendly'), { kind: 'cite', shop: 'grocery', claimed: fresh.price });
    expect(cheaper.state.askPrice).toBe(cheaper.state.listPrice);
  });

  it('bundling lowers the price for more goods; inspecting can find soft ones', () => {
    const b = bargainMove(start('friendly'), { kind: 'bundle', add: { item: 'onion', qty: 1 } });
    expect(b.state.lines.map((l) => l.item)).toEqual(['tomato', 'onion']);
    expect(b.state.listPrice).toBe(money(85));
    expect(b.state.askPrice).toBeLessThan(b.state.listPrice);
    let found = false;
    for (let seed = 1; seed < 50 && !found; seed++) {
      const r = bargainMove(startBargain({ item: 'tomato', qty: 1, seed, day: 1, personality: 'friendly' }), { kind: 'inspect' });
      if (r.state.flags.foundBruised) {
        found = true;
        expect(r.state.askPrice).toBeLessThan(r.state.listPrice);
      }
    }
    expect(found).toBe(true);
  });

  it('over-squeezing a kind elderly vendor works — with an empathy note', () => {
    // a cheeky opener, then she comes down to a fair price… and you keep pushing for a few coins more
    let st = bargainMove(start('kind-elder'), cheeky(start('kind-elder'))).state;
    for (let i = 0; i < 6 && st.status === 'open'; i++) st = bargainMove(st, fair('neutral')(st)).state;
    expect(st.status).toBe('deal');
    expect(st.flags.squeezedElder).toBe(true);
    expect(st.finalPrice!).toBeGreaterThanOrEqual(st.floorPrice);
    expect(summarizeBargain(st, 'Kamla Amma').notes.join(' ')).toMatch(/fair price is a kind price/);
  });

  it("fixed-price markets: polite asks are declined kindly, hard haggling is a faux pas, deals exist", () => {
    setRegion('uk');
    expect(region().bargainCulture).toBe('fixed');
    const st = startBargain({ item: 'tomato', qty: 1, seed: 5, day: 1, personality: 'friendly', minutes: 17 * 60 });
    expect(st.floorPrice).toBe(st.listPrice);
    const polite = bargainMove(st, fair('polite')(st));
    expect(polite.outcome).toBeUndefined();
    expect(polite.vendorLine).toMatch(/prices are fixed/);
    expect(polite.state.askPrice).toBe(st.listPrice);
    expect(polite.state.flags.fauxPas).toBe(false);
    const rude = bargainMove(st, rudeLowball(st));
    expect(rude.state.flags.fauxPas).toBe(true);
    expect(summarizeBargain(rude.state).notes.join(' ')).toMatch(/prices are fixed — hard haggling comes across as rude/);
    const paid = bargainMove(st, { kind: 'accept' });
    expect(paid.state.finalPrice).toBe(st.listPrice);
    expect(summarizeBargain(paid.state).tone).toBe('good');
    // near closing time there's an end-of-day deal
    const late = startBargain({ item: 'tomato', qty: 1, seed: 5, day: 1, personality: 'friendly', minutes: 19 * 60 + 30 });
    const eod = bargainMove(late, fair('polite')(late));
    expect(eod.state.flags.endOfDay).toBe(true);
    expect(eod.state.askPrice).toBeLessThan(late.listPrice);
  });

  it('works in every currency via money(), offering step-rounded amounts', () => {
    setRegion('us');
    const us = startBargain({ item: 'tomato', qty: 1, seed: 1, day: 1, personality: 'friendly' });
    expect(us.listPrice).toBe(money(45));
    expect(us.listPrice).toBeCloseTo(1.8);
    setRegion('ng');
    const ng = startBargain({ item: 'tomato', qty: 1, seed: 1, day: 1, personality: 'friendly' });
    expect(ng.culture).toBe('haggle');
    expect(ng.listPrice).toBe(money(45));
    const o = offerOptions(ng);
    for (const v of [o.fair, o.cheeky, o.lowball, ng.floorPrice]) expect(v % 50).toBe(0);
    const r = play(ng, [fair('polite')]);
    expect(r.outcome).toBe('deal');
    expect(r.state.finalPrice! % 50).toBe(0);
    expect(summarizeBargain(r.state).text).toMatch(/₦/);
  });

  it('every market challenge option has a what-if', () => {
    for (const ch of Object.values(MARKET_CHALLENGES)) for (const opt of ch.options) expect(opt.whatIf, `${ch.id}/${opt.id}`).toBeTruthy();
  });
});

// ---------------------------------------------------------------- the mission & the cart in the world

function seedFor(p: VendorPersonality) {
  for (let seed = 1; seed < 5000; seed++) if (vendorPersonalityFor(seed, 1) === p) return seed;
  throw new Error('no seed');
}

/** Picker that tries regexes in priority order. */
const prefer =
  (...res: RegExp[]): Picker =>
  (labels) => {
    for (const re of res) {
      const i = labels.findIndex((l) => re.test(l));
      if (i >= 0) return i;
    }
    return -1;
  };

function setup(p: VendorPersonality) {
  const s = newStore({ seed: seedFor(p) });
  installMarketHandlers(s);
  const reports: { text: string; tone: string }[] = [];
  s.bus.on('report', (r) => reports.push(r));
  return { s, reports };
}

async function deliverHome(s: GameStore) {
  s.travel('home');
  settle(s);
  s.talkTo(idOf(s, 'mother'));
  settle(s);
  await Promise.resolve();
  expect(s.ui.modal?.type).toBe('results');
  return s.state.results[0];
}

describe('Market Day mission', () => {
  it('is registered with a vendor, opening hours and challenges', () => {
    const def = getMission('market-day')!;
    expect(def.icon).toBe('🧺');
    expect(def.category).toBe('errand');
    for (const c of def.challenges) expect(MARKET_CHALLENGES[c.id]).toBeTruthy();
  });

  it('happy path: polite fair offers + checking quality → completed, good budget, good reports', async () => {
    const { s, reports } = setup('friendly');
    expect(todaysVendor(s).name).toBe('Ramesh');
    s.acceptMission('market-day', idOf(s, 'mother'));
    s.travel('town');
    settle(s);
    s.interact('market-cart');
    const seen = settle(s, prefer(/just ask politely/, /^Tomatoes$/, /^1 kg tomatoes/, /^Check the quality/, /could you do/, /could you swap/, /check the weight/, /Thank you so much/));
    expect(seen.some((t) => /Asking: ₹45 for 1 kg tomatoes/.test(t))).toBe(true);
    expect(s.isDone('reach-cart')).toBe(true);
    expect(s.isDone('buy-tomatoes')).toBe(true);
    s.interact('market-cart');
    settle(s, prefer(/^Onions$/, /^1 kg onions/, /^Check the quality/, /could you do/, /Thank you so much/));
    expect(s.isDone('buy-onions')).toBe(true);

    const deals = reports.filter((r) => /^Bargained for/.test(r.text));
    expect(deals).toHaveLength(2);
    expect(deals.every((r) => r.tone === 'good')).toBe(true);
    expect(deals[0].text).toMatch(/polite/);

    const res = await deliverHome(s);
    expect(res.outcome).toBe('completed');
    expect(res.scores.budget!).toBeGreaterThanOrEqual(90);
    expect(res.scores.communication!).toBeGreaterThanOrEqual(75);
    expect(res.scores.problem!).toBeGreaterThanOrEqual(70);
    expect(res.feedback.join(' ')).toMatch(/instead of ₹45 by asking politely/);
    expect(reports.some((r) => /^Delivered the vegetables/.test(r.text) && r.tone === 'good')).toBe(true);
    expect((s.state.memories ?? []).some((m) => m.id.startsWith('market-polite@'))).toBe(true);
  });

  it('negative path: rude lowball → refused → bought at FreshMart → lower scores & a bad report', async () => {
    const { s, reports } = setup('grumpy');
    s.acceptMission('market-day', idOf(s, 'mother'));
    s.travel('town');
    settle(s);
    s.interact('market-cart');
    settle(s, prefer(/Back me up|Yeah! Rip-off/, /^Tomatoes$/, /^1 kg tomatoes/, /is a rip-off!/, /^Leave and buy somewhere else/));
    expect(s.state.world['market.refused.1']).toBe(true);
    expect(reports.some((r) => r.tone === 'bad' && /rude to the vendor and got refused ❌/.test(r.text))).toBe(true);
    expect(s.isDone('buy-tomatoes')).toBe(false);

    // coming back without apologising: the vendor remembers
    s.interact('market-cart');
    const again = settle(s, byLabel(/^Leave$/));
    expect(again[0]).toMatch(/You again\?/);

    // plan B: FreshMart, at FreshMart prices
    s.travel('grocery');
    settle(s);
    for (let i = 0; i < 6; i++) s.addToBasket('shelf-veg', 'tomato');
    for (let i = 0; i < 6; i++) s.addToBasket('shelf-veg', 'onion');
    s.checkoutInteract();
    settle(s, byLabel(/Join the queue|Go to the counter/));
    for (let guard = 0; s.queueInfo()!.ahead > 0; guard++) {
      if (guard > 200) throw new Error('queue never moved');
      s.spendTime(1);
      settle(s);
    }
    s.checkoutInteract();
    settle(s, byLabel(/^Pay /));
    expect(s.isDone('buy-tomatoes') && s.isDone('buy-onions')).toBe(true);
    expect(reports.some((r) => /bought at FreshMart instead/.test(r.text) && r.tone === 'bad')).toBe(true);

    s.travel('town');
    settle(s);
    const res = await deliverHome(s);
    expect(res.scores.budget!).toBeLessThanOrEqual(60);
    expect(res.scores.communication!).toBeLessThanOrEqual(40);
    expect(res.scores.responsibility!).toBeLessThan(65);
    expect(res.feedback.join(' ')).toMatch(/rip-off made .* refuse/);
    expect(res.feedback.join(' ')).toMatch(/meant buying elsewhere/);
    expect((s.state.memories ?? []).some((m) => m.id.startsWith('market-rude@'))).toBe(true);
  });

  it('the cart is closed outside 4–8 PM', () => {
    const { s } = setup('friendly');
    s.travel('town');
    s.state.clock.minutes = 20 * 60 + 5;
    s.interact('market-cart');
    expect(settle(s)[0]).toMatch(/covered with a tarp/);
  });

  it('Grocery Run accepts tomatoes and potatoes bought at the cart (same item ids)', () => {
    const { s } = setup('friendly');
    s.acceptMission('grocery-run', idOf(s, 'mother'));
    s.travel('town');
    settle(s);
    const st = beginBargain(s, 'tomato', 0.5);
    applyMove(s, st, { kind: 'accept' });
    settle(s);
    const p = beginBargain(s, 'potatoes', 1);
    applyMove(s, p, { kind: 'accept' });
    settle(s);
    expect(s.state.inventory.items['tomato']).toBe(3);
    expect(s.state.inventory.items['potatoes']).toBe(1);
    expect(s.isDone('checkout')).toBe(true);
    const req = getMission('grocery-run')!.requiredItems!;
    const check = checkRequired(req, s.state.inventory);
    expect(check.missing.map((m) => m.item)).toEqual(['milk-packet']);
  });
});
