import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStore } from '../src/core/store';
import { ledgerConsistent, rollFor } from '../src/core/systems';
import { FAMILY_PRESETS } from '../src/domain/family';
import { ROOM_OBJECTS, SCHOOL_SPOTS } from '../src/domain/homeLayout';
import { getMission } from '../src/missions/registry';
import { byLabel, idOf, last, newStore, settle } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const flushMicrotasks = () => Promise.resolve();
const LIST_ITEMS = ['milk-packet', 'milk-tetra', 'tomato', 'potatoes', 'baby-potatoes'];

type Buy = [shelf: string, item: string];
const HAPPY_BASKET: Buy[] = [
  ['shelf-veg', 'tomato'],
  ['shelf-veg', 'tomato'],
  ['shelf-veg', 'potatoes'],
  ['shelf-dairy', 'milk-tetra'],
];

/** Start the grocery run, go to FreshMart, fill the basket, queue, and pay. */
async function shop(s: GameStore, basket: Buy[], opts: { takeBag?: boolean } = {}) {
  const mother = idOf(s, 'mother');
  s.acceptMission('grocery-run', mother);
  if (opts.takeBag !== false) {
    s.interact('hook-bag');
    await flushMicrotasks();
    settle(s);
  }
  s.travel('town');
  settle(s);
  s.travel('grocery');
  settle(s);
  expect(s.isDone('reach-store')).toBe(true);

  for (const [shelf, item] of basket) s.addToBasket(shelf, item);

  // join the queue via the cashier
  s.checkoutInteract();
  settle(s, byLabel(/Join the queue|Go to the counter/));
  expect(s.state.inQueue).toBe(true);
  expect(s.queueInfo()!.inQueue).toBe(true);

  for (let guard = 0; s.queueInfo()!.ahead > 0; guard++) {
    if (guard > 200) throw new Error('never reached the front of the queue');
    s.spendTime(1);
    settle(s);
  }
  expect(s.queueInfo()!.wait).toBe(0);

  s.checkoutInteract();
  const seen = settle(s, byLabel(/^Pay /));
  expect(s.isDone('checkout')).toBe(true);
  expect(s.state.inQueue).toBe(false);
  expect(s.state.basket).toEqual({});
  return seen;
}

/** Walk home and talk to the assigner, choosing with `pick` at the delivery dialogue. */
function deliver(s: GameStore, pick?: (labels: string[]) => number) {
  s.travel('town');
  settle(s); // possible sudden-rain challenge
  s.travel('home');
  settle(s);
  s.talkTo(idOf(s, 'mother'));
  return settle(s, pick);
}

describe('grocery run', () => {
  it('happy path: list bought, change returned, completed on time', async () => {
    const s = newStore();
    const mother = idOf(s, 'mother');
    expect(s.state.wallet.balance).toBe(40);

    s.acceptMission('grocery-run', mother);
    expect(s.state.wallet.balance).toBe(190);
    expect(s.state.run?.cashGiven).toBe(150);
    expect(s.state.world['stock.grocery.milk-packet']).toBe(0);
    expect(s.isDone('receive-list')).toBe(true);

    s.interact('hook-bag');
    await flushMicrotasks();
    expect(s.hasItem('cloth-bag')).toBe(true);
    expect(s.isDone('take-bag')).toBe(true);

    s.travel('town');
    settle(s);
    s.travel('grocery');
    settle(s);
    expect(s.isDone('reach-store')).toBe(true);

    // milk packets are sold out: adding one fails, inspecting the fridge raises the challenge
    s.addToBasket('shelf-dairy', 'milk-packet');
    expect(s.state.basket).toEqual({});
    s.interact('shelf-dairy');
    expect(s.ui.dialogue?.[0].text).toMatch(/SOLD OUT/);
    settle(s, byLabel(/alternative/));
    expect(s.state.run!.challengesSeen).toContain('stock-out-milk');
    expect(s.getFlag('askedStore', false)).toBe(true);

    for (const [shelf, item] of HAPPY_BASKET) s.addToBasket(shelf, item);
    expect(s.basketTotal()).toBe(107);

    s.checkoutInteract();
    settle(s, byLabel(/Join the queue/));
    expect(s.state.inQueue).toBe(true);
    for (let guard = 0; s.queueInfo()!.ahead > 0; guard++) {
      if (guard > 200) throw new Error('stuck in queue');
      s.spendTime(1);
      settle(s);
    }
    s.checkoutInteract();
    expect(s.ui.dialogue?.[0].choices?.map((c) => c.label)).toContain('Pay ₹107');
    settle(s, byLabel(/^Pay /));
    expect(s.state.wallet.balance).toBe(190 - 107);
    expect(s.state.run!.spent).toBe(107);
    expect(last(s.state.receipts)!.total).toBe(107);
    expect(s.isDone('buy-items')).toBe(true);

    deliver(s);
    expect(s.state.run).toBeNull();
    const r = s.state.results[0];
    expect(r.missionId).toBe('grocery-run');
    expect(r.outcome).toBe('completed');
    expect(r.moneySpent).toBe(107);
    expect(r.scores.accuracy).toBe(100);
    expect(r.scores.budget).toBe(100);
    expect(r.feedback[0]).toMatch(/stayed within budget/);
    expect(s.ui.modal).toEqual({ type: 'results', resultId: r.id });

    // ₹43 change returned → back to the original pocket money
    expect(s.state.wallet.balance).toBe(40);
    expect(ledgerConsistent(s.state.wallet, 0)).toBe(true);
    // the groceries were handed over
    for (const id of LIST_ITEMS) expect(s.hasItem(id)).toBe(false);
  });

  it('incomplete path: delivering without potatoes', async () => {
    const s = newStore();
    await shop(s, [
      ['shelf-veg', 'tomato'],
      ['shelf-veg', 'tomato'],
      ['shelf-dairy', 'milk-tetra'],
    ]);
    const seen = deliver(s, byLabel(/Here's what I got/));
    expect(seen.some((t) => /still missing: 1× Potatoes/.test(t))).toBe(true);
    const r = s.state.results[0];
    expect(r.outcome).toBe('incomplete');
    expect(r.objectivesMissed).toContain('Have every item on the list');
    // change (150 - 62) is still returned
    expect(s.state.wallet.balance).toBe(40);
    expect(ledgerConsistent(s.state.wallet, 0)).toBe(true);
  });

  it('choosing to go back keeps the mission running', async () => {
    const s = newStore();
    await shop(s, [['shelf-veg', 'tomato']]);
    deliver(s, byLabel(/go back/));
    expect(s.state.run).not.toBeNull();
    expect(s.state.results).toHaveLength(0);
  });

  // BUG (grocery.ts evaluate, ~line 211-212): for a forced/incomplete delivery the
  // missing count is recomputed from the inventory AFTER finishDelivery() has already
  // removed the delivered items, so everything delivered is also counted as missing.
  // Delivering 3 of 4 items (only the potatoes missing) scores accuracy 0 instead of 70.
  // Suggested fix: in finishDelivery() store the count, e.g.
  //   run.flags['missingAtDelivery'] = <sum of check.missing qty>  (pass it in from deliver())
  // and in evaluate() use `delivered ? Number(f['missingAtDelivery'] ?? 0) : remaining...`.
  it('incomplete delivery accuracy only penalises the missing item', async () => {
    const s = newStore();
    await shop(s, [
      ['shelf-veg', 'tomato'],
      ['shelf-veg', 'tomato'],
      ['shelf-dairy', 'milk-tetra'],
    ]);
    deliver(s, byLabel(/Here's what I got/));
    expect(s.state.results[0].scores.accuracy).toBe(70); // 100 - 1 missing × 30
  });

  it('over budget: "Pay … anyway", budget score ≤ 50 and feedback about the budget', async () => {
    const s = newStore();
    const mother = idOf(s, 'mother');
    s.acceptMission('grocery-run', mother);
    s.interact('hook-bag');
    await flushMicrotasks();
    s.travel('town');
    settle(s);
    s.travel('grocery');
    settle(s);
    for (const [shelf, item] of [...HAPPY_BASKET, ['shelf-veg', 'baby-potatoes'] as Buy]) s.addToBasket(shelf, item);
    expect(s.basketTotal()).toBe(187);
    s.checkoutInteract();
    settle(s, byLabel(/Join the queue/));
    for (let g = 0; s.queueInfo()!.ahead > 0 && g < 200; g++) {
      s.spendTime(1);
      settle(s);
    }
    s.checkoutInteract();
    const line = s.ui.dialogue![0];
    expect(line.text).toMatch(/over your ₹150 budget/);
    const labels = line.choices!.map((c) => c.label);
    expect(labels.some((l) => /^Pay ₹187 anyway/.test(l))).toBe(true);
    settle(s, byLabel(/anyway/));
    expect(s.state.wallet.balance).toBe(3);

    deliver(s);
    const r = s.state.results[0];
    expect(r.outcome).toBe('completed');
    expect(r.scores.budget).toBeLessThanOrEqual(50);
    expect(r.scores.budget).toBe(13); // 50 - (187 - 150)
    expect(r.feedback.some((f) => /exceeded the budget by ₹37/.test(f))).toBe(true);
    expect(r.decisions.some((d) => /paid more than the budget/.test(d.text))).toBe(true);
    expect(s.state.wallet.balance).toBe(3); // no change to return
    expect(ledgerConsistent(s.state.wallet, 0)).toBe(true);
    expect(s.hasItem('baby-potatoes')).toBe(true); // the extra wasn't needed for the list
  });

  it('forgetting the cloth bag triggers the bag-fee challenge before paying', async () => {
    const s = newStore();
    const seen = await shop(s, HAPPY_BASKET, { takeBag: false });
    expect(seen.some((t) => /Did you bring a bag/.test(t))).toBe(true);
    // first option buys a ₹5 paper bag
    expect(s.state.run!.spent).toBe(112);
    expect(last(s.state.receipts)!.lines.some((l) => l.id === 'paper-bag')).toBe(true);
  });
});

describe('clean room', () => {
  function tidyAll(s: GameStore, wrongFirst?: { id: string; dest: string }) {
    const seen: string[] = [];
    for (const o of ROOM_OBJECTS) {
      s.interact(`room:${o.id}`);
      settle(s, undefined, seen);
      expect(s.state.world[`room.${o.id}`]).toBe('held');
      if (wrongFirst?.id === o.id) {
        s.interact(wrongFirst.dest);
        settle(s, undefined, seen);
      }
      if (o.item === 'mug') {
        // try a bedroom spot first → "where does the mug go?" challenge
        s.interact('laundry');
        expect(s.ui.dialogue?.[0].text).toMatch(/dirty mug/);
        settle(s, byLabel(/^Think/), seen);
      }
      s.interact(o.dest);
      settle(s, undefined, seen);
      expect(s.state.world[`room.${o.id}`]).toBe('placed');
    }
    return seen;
  }

  it('putting everything away and reporting completes with accuracy 100', () => {
    const s = newStore();
    const father = idOf(s, 'father');
    s.acceptMission('clean-room', father);
    const seen = tidyAll(s);
    expect(seen.some((t) => /water bottle on the top shelf/.test(t))).toBe(true); // sibling interrupt
    expect(s.state.run!.challengesSeen).toEqual(expect.arrayContaining(['sibling-interrupt', 'unclear-storage']));
    expect(s.state.hands).toEqual([]);
    expect(s.isDone('tidy')).toBe(true);

    s.talkTo(father);
    settle(s);
    const r = s.state.results[0];
    expect(r.missionId).toBe('clean-room');
    expect(r.outcome).toBe('completed');
    expect(r.scores.accuracy).toBe(100);
    expect(s.state.run).toBeNull();
  });

  it('a wrong placement is penalised', () => {
    const s = newStore();
    const father = idOf(s, 'father');
    s.acceptMission('clean-room', father);
    tidyAll(s, { id: 'shirt1', dest: 'bookshelf' });
    s.talkTo(father);
    settle(s);
    const r = s.state.results[0];
    expect(r.outcome).toBe('completed');
    expect(r.scores.accuracy).toBe(94);
    expect(r.feedback[0]).toMatch(/after 1 wrong guess/);
  });

  it('reporting early lists what is left; giving up is incomplete', () => {
    const s = newStore();
    const father = idOf(s, 'father');
    s.acceptMission('clean-room', father);
    s.talkTo(father);
    expect(s.ui.dialogue?.[0].text).toMatch(/still see 9 things/);
    settle(s, byLabel(/all I can do/));
    expect(s.state.results[0].outcome).toBe('incomplete');
  });

  // BUG (store.ts finishMission, line ~658): optional objectives whose label already
  // ends in "(optional)" get the suffix appended again → "Make the bed (optional) (optional)".
  // Suggested fix: only append when !/\(optional\)$/.test(o.label).
  it('missed optional objectives are not labelled "(optional)" twice', () => {
    const s = newStore();
    const father = idOf(s, 'father');
    s.acceptMission('clean-room', father);
    s.talkTo(father);
    settle(s, byLabel(/all I can do/));
    expect(s.state.results[0].objectivesMissed.join('|')).not.toMatch(/\(optional\) \(optional\)/);
  });

  it('cannot carry more than 2 items', () => {
    const s = newStore();
    s.acceptMission('clean-room', idOf(s, 'father'));
    for (const o of ROOM_OBJECTS.slice(0, 3)) s.interact(`room:${o.id}`);
    expect(s.state.hands).toHaveLength(2);
    expect(s.state.world[`room.${ROOM_OBJECTS[2].id}`]).toBe('floor');
  });

  // BUG (challenges.ts 'unclear-storage' → 'hide' option / cleanRoom.ts): hiding the mug
  // counts it as put away (placedCount) but never calls s.objective('tidy'), which only
  // placeAt() checks. If the mug is the last item, talking to the parent then fails to
  // mark 'report' too (it dependsOn 'tidy'), so a 'completed' result lists both required
  // objectives as missed. Suggested fix: in cleanRoom.onTalk, when left === 0 call
  // s.objective('tidy') before s.objective('report') (or check completion after 'hide').
  it('hiding the mug as the last item still completes the tidy objective', () => {
    const s = newStore();
    const father = idOf(s, 'father');
    s.acceptMission('clean-room', father);
    for (const o of ROOM_OBJECTS.filter((x) => x.item !== 'mug')) {
      s.interact(`room:${o.id}`);
      s.interact(o.dest);
      settle(s);
    }
    s.interact('room:mug');
    s.interact('laundry');
    settle(s, byLabel(/Hide it/));
    s.talkTo(father);
    settle(s);
    const r = s.state.results[0];
    expect(r.objectivesMissed).not.toContain('Put every item where it belongs');
  });
});

describe('help sibling', () => {
  function pack(s: GameStore, n: number) {
    for (let i = 0; i < n; i++) {
      s.interact('school-bag');
      settle(s, byLabel(/^Pack the/));
    }
  }
  const spot = (item: string) => SCHOOL_SPOTS.find((x) => x.item === item)!.id;

  it('find out the list, gather and pack everything → completed', () => {
    const s = newStore();
    const sibling = idOf(s, 'younger-sibling');
    s.acceptMission('help-sibling', idOf(s, 'mother'));

    s.talkTo(sibling);
    settle(s);
    expect(s.isDone('ask')).toBe(true);
    s.interact('timetable');
    settle(s);
    expect(s.isDone('find-out')).toBe(true);

    s.interact(spot('geometry-box'));
    s.interact(spot('crayons'));
    expect(s.ui.dialogue?.[0].text).toMatch(/MY crayons/);
    settle(s, byLabel(/packing them/));
    expect(s.state.hands).toEqual(['geometry-box', 'crayons']);
    pack(s, 2);
    expect(s.state.hands).toEqual([]);

    s.interact(spot('empty-bottle'));
    s.interact('sink');
    expect(s.state.hands).toEqual(['water-bottle']);
    s.interact(spot('sports-shoes'));
    pack(s, 2);
    expect(s.isDone('pack')).toBe(true);

    s.interact('school-bag');
    settle(s, byLabel(/comic/));
    expect(s.isDone('declutter')).toBe(true);

    s.talkTo(sibling);
    settle(s);
    const r = s.state.results[0];
    expect(r.missionId).toBe('help-sibling');
    expect(r.outcome).toBe('completed');
    expect(r.scores.accuracy).toBe(100);
  });

  it('packing the empty bottle is refused and penalised', () => {
    const s = newStore();
    s.acceptMission('help-sibling', idOf(s, 'mother'));
    s.interact(spot('empty-bottle'));
    s.interact('school-bag');
    settle(s, byLabel(/Pack the water bottle \(empty\)/));
    expect(s.state.world['bag.water-bottle']).toBe(false);
    expect(s.getFlag('wrongPack', 0)).toBe(1);
    expect(s.state.hands).toEqual(['empty-bottle']);
  });

  it('is unavailable for a family without a younger sibling', () => {
    const guardianPreset = FAMILY_PRESETS.find((p) => !p.roles.includes('younger-sibling'))!;
    const s = newStore({ preset: guardianPreset });
    const entry = s.availableMissions().find((m) => m.def.id === 'help-sibling')!;
    expect(entry.avail.ok).toBe(false);
    expect(entry.avail.reason).toMatch(/younger sibling/);

    // the guardian does not offer it
    s.talkTo(s.state.profile.members.find((m) => m.role === 'guardian')!.id);
    const labels = s.ui.dialogue?.[0].choices?.map((c) => c.label) ?? [];
    expect(labels.some((l) => /Help Your Younger Sibling/.test(l))).toBe(false);
    expect(labels.some((l) => /Grocery Run/.test(l))).toBe(true);
  });

  it('is available for the classic family', () => {
    const s = newStore();
    expect(getMission('help-sibling')!.available!(s.state).ok).toBe(true);
  });
});

describe('deadlines', () => {
  it('finishing after the deadline is completed-late', () => {
    const s = newStore();
    const father = idOf(s, 'father');
    s.acceptMission('clean-room', father);
    const run = s.state.run!;
    expect(run.deadlineAt).toBe(run.startedAt + 30);
    for (const o of ROOM_OBJECTS) {
      s.interact(`room:${o.id}`);
      s.interact(o.dest);
      settle(s, byLabel(/^Think/));
      if (s.state.world[`room.${o.id}`] !== 'placed') {
        s.interact(o.dest);
        settle(s);
      }
    }
    s.spendTime(40);
    expect(s.timeLeft()!).toBeLessThan(0);
    expect(run.flags['lateNoticed']).toBe(true);
    s.talkTo(father);
    settle(s);
    const r = s.state.results[0];
    expect(r.outcome).toBe('completed-late');
    expect(r.scores.time).toBeLessThanOrEqual(60);
    expect(r.feedback.some((f) => /ran over time/.test(f))).toBe(true);
  });
});

describe('challenge engine determinism', () => {
  const STARTED_AT = 16 * 60 + 30; // missions accepted right after newGame
  const raining = (seed: number) => rollFor(seed + STARTED_AT, 'sudden-rain') < 0.75;

  function rainOutcome(seed: number) {
    const s = newStore({ seed });
    s.acceptMission('grocery-run', idOf(s, 'mother'));
    expect(s.state.run!.startedAt).toBe(STARTED_AT);
    s.state.run!.objectives['checkout'].done = true; // rain only after shopping
    s.travel('town');
    return {
      dialogue: !!s.ui.dialogue,
      seen: s.state.run!.challengesSeen.includes('sudden-rain'),
      skipped: !!s.state.run!.flags['skipped:sudden-rain'],
    };
  }

  it('rollFor is stable for the same seed and key', () => {
    expect(rollFor(123, 'sudden-rain')).toBe(rollFor(123, 'sudden-rain'));
    expect(rollFor(123, 'sudden-rain')).not.toBe(rollFor(124, 'sudden-rain'));
    const r = rollFor(99, 'x');
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
  });

  it('the same seed gives the same sudden-rain decision, and it matches the roll', () => {
    let hit = -1;
    let miss = -1;
    for (let seed = 1; seed < 500 && (hit < 0 || miss < 0); seed++) {
      if (raining(seed)) hit = hit < 0 ? seed : hit;
      else miss = miss < 0 ? seed : miss;
    }
    expect(hit).toBeGreaterThan(0);
    expect(miss).toBeGreaterThan(0);

    const a = rainOutcome(hit);
    expect(a).toEqual({ dialogue: true, seen: true, skipped: false });
    expect(rainOutcome(hit)).toEqual(a);

    const b = rainOutcome(miss);
    expect(b).toEqual({ dialogue: false, seen: true, skipped: true });
    expect(rainOutcome(miss)).toEqual(b);
  });
});

describe('clinic visit (smoke)', () => {
  it('take the card, queue with a token, check in and report → completed', () => {
    const preset = FAMILY_PRESETS.find((p) => p.roles.includes('grandparent'))!;
    const s = newStore({ preset });
    const grand = idOf(s, 'grandparent');
    expect(getMission('clinic-visit')).toBeDefined();
    s.acceptMission('clinic-visit', grand);

    s.interact('doc-folder');
    expect(s.hasItem('health-card')).toBe(true);
    s.travel('town');
    settle(s);
    s.travel('clinic');
    settle(s);
    expect(s.isDone('reach')).toBe(true);

    s.interact('reception');
    settle(s, byLabel(/Take a token/));
    expect(s.state.inQueue).toBe(true);
    for (let g = 0; s.queueInfo()!.ahead > 0; g++) {
      if (g > 200) throw new Error('stuck in clinic queue');
      s.spendTime(1);
      settle(s);
    }
    s.interact('reception');
    settle(s);
    expect(s.isDone('checkin')).toBe(true);
    expect(s.state.inQueue).toBe(false);

    s.travel('town');
    settle(s);
    s.travel('home');
    settle(s);
    s.talkTo(grand);
    settle(s, byLabel(/Show the appointment slip/));
    const r = s.state.results[0];
    expect(r.missionId).toBe('clinic-visit');
    expect(r.outcome).toBe('completed');
    expect(r.scores.accuracy).toBe(100);
  });

  it('stepping out of the clinic queue keeps the token position', () => {
    const preset = FAMILY_PRESETS.find((p) => p.roles.includes('grandparent'))!;
    const s = newStore({ preset });
    s.acceptMission('clinic-visit', idOf(s, 'grandparent'));
    s.travel('clinic');
    settle(s);
    s.interact('reception');
    settle(s, byLabel(/Take a token/));
    const pos = s.queueInfo()!.ahead;
    s.queueLeave();
    expect(s.queue!.savedPosition).toBe(pos);
    s.interact('reception');
    expect(s.ui.dialogue?.[0].text).toMatch(/Welcome back/);
    settle(s, byLabel(/Rejoin/));
    expect(s.queueInfo()!.ahead).toBe(pos);
  });
});
