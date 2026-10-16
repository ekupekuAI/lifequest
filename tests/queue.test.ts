import { describe, expect, it } from 'vitest';
import {
  advanceQueue,
  completeService,
  createQueue,
  estimateWait,
  joinQueue,
  leaveQueue,
  playerIndex,
} from '../src/core/systems';
import type { QueueCustomer } from '../src/domain/types';

const npc = (id: string, serviceMinutes: number, extra: Partial<QueueCustomer> = {}): QueueCustomer => ({
  id,
  name: id.toUpperCase(),
  serviceMinutes,
  ...extra,
});
const player: QueueCustomer = { id: 'player', name: 'Alex', serviceMinutes: 2 };

describe('queue progression', () => {
  it('serves the front customer after exactly serviceMinutes', () => {
    const q = createQueue('q', [npc('a', 3), npc('b', 2)]);
    const t1 = advanceQueue(q, 2.75);
    expect(t1.served).toHaveLength(0);
    expect(t1.queue.progress).toBeCloseTo(2.75);

    const t2 = advanceQueue(t1.queue, 0.25);
    expect(t2.served.map((c) => c.id)).toEqual(['a']);
    expect(t2.queue.customers.map((c) => c.id)).toEqual(['b']);
    expect(t2.queue.served).toBe(1);
    expect(t2.queue.progress).toBe(0);
  });

  it('carries progress over between ticks and into the next customer', () => {
    const q = createQueue('q', [npc('a', 2), npc('b', 3), npc('c', 4)]);
    // 1 + 1 => a served; then 1.5 into b
    let t = advanceQueue(q, 1);
    t = advanceQueue(t.queue, 1);
    expect(t.served.map((c) => c.id)).toEqual(['a']);
    t = advanceQueue(t.queue, 1.5);
    expect(t.queue.customers[0].id).toBe('b');
    expect(t.queue.progress).toBeCloseTo(1.5);
    // a single large tick serves several customers
    const big = advanceQueue(q, 5);
    expect(big.served.map((c) => c.id)).toEqual(['a', 'b']);
    expect(big.queue.customers.map((c) => c.id)).toEqual(['c']);
    expect(big.queue.progress).toBe(0);
  });

  it('does not mutate the input queue customers or counters', () => {
    const q = createQueue('q', [npc('a', 2), npc('b', 3, { patience: 1 })]);
    const before = JSON.stringify({ ...q, log: [] });
    advanceQueue(q, 10);
    expect(JSON.stringify({ ...q, log: [] })).toBe(before);
  });

  // BUG (systems.ts advanceQueue, line ~174): the working copy is
  // `{ ...q, customers: q.customers.map(...) }`, so `queue.log` is the SAME array as
  // `q.log` and `queue.log.push(...)` mutates the caller's (supposedly immutable)
  // previous state. Suggested fix: `{ ...q, customers: ..., log: [...q.log] }`.
  it('does not mutate the input queue log', () => {
    const q = createQueue('q', [npc('a', 2), npc('b', 3)]);
    advanceQueue(q, 10);
    expect(q.log).toEqual([]);
  });

  it('stops progressing when the player reaches the front', () => {
    let q = createQueue('q', [npc('a', 2)]);
    q = joinQueue(q, player);
    const t = advanceQueue(q, 30);
    expect(t.served.map((c) => c.id)).toEqual(['a']);
    expect(t.playerAtFront).toBe(true);
    expect(t.queue.progress).toBe(0);
    // further time does nothing while the player is at the counter
    const t2 = advanceQueue(t.queue, 30);
    expect(t2.served).toHaveLength(0);
    expect(t2.queue.customers.map((c) => c.id)).toEqual(['player']);
    expect(t2.queue.served).toBe(1);
  });

  it('completeService removes the player from the front', () => {
    let q = joinQueue(createQueue('q', []), player);
    expect(playerIndex(q)).toBe(0);
    q = completeService(q);
    expect(q.customers).toHaveLength(0);
    expect(q.served).toBe(1);
    expect(q.progress).toBe(0);
  });

  it('completeService is a no-op when the player is not at the front', () => {
    const q = joinQueue(createQueue('q', [npc('a', 2)]), player);
    expect(completeService(q)).toBe(q);
  });
});

describe('estimateWait', () => {
  it('sums service time of customers ahead minus progress on the front', () => {
    let q = createQueue('q', [npc('a', 3), npc('b', 4), npc('c', 5)]);
    // not in queue: everyone counts
    expect(estimateWait(q)).toBe(12);
    q = joinQueue(q, player);
    expect(estimateWait(q)).toBe(12);
    const t = advanceQueue(q, 1);
    expect(estimateWait(t.queue)).toBeCloseTo(11);
    const t2 = advanceQueue(t.queue, 3); // a done, 1 into b
    expect(estimateWait(t2.queue)).toBeCloseTo(8);
  });

  it('is 0 when the player is at the front or the queue is empty', () => {
    expect(estimateWait(createQueue('q', []))).toBe(0);
    const q = joinQueue(createQueue('q', []), player);
    expect(estimateWait(q)).toBe(0);
  });

  it('matches the actual time until the player is served', () => {
    const q = joinQueue(createQueue('q', [npc('a', 2), npc('b', 3.5)]), player);
    const est = estimateWait(q);
    expect(advanceQueue(q, est - 0.25).playerAtFront).toBe(false);
    expect(advanceQueue(q, est).playerAtFront).toBe(true);
  });
});

describe('joining and leaving', () => {
  it('joinQueue appends the player at the back and is idempotent', () => {
    const q = createQueue('q', [npc('a', 2), npc('b', 2)]);
    const j = joinQueue(q, player);
    expect(j.customers.map((c) => c.id)).toEqual(['a', 'b', 'player']);
    expect(j.customers[2].isPlayer).toBe(true);
    expect(joinQueue(j, player)).toBe(j);
  });

  it('leaveQueue loses the place when keepPositionOnLeave is false', () => {
    let q = createQueue('q', [npc('a', 2), npc('b', 2), npc('c', 2)]);
    q = { ...q, customers: [q.customers[0], { ...player, isPlayer: true }, ...q.customers.slice(1)] };
    expect(playerIndex(q)).toBe(1);
    const left = leaveQueue(q);
    expect(playerIndex(left)).toBe(-1);
    expect(left.savedPosition).toBeUndefined();
    const back = joinQueue(left, player);
    expect(playerIndex(back)).toBe(3); // back of the line
  });

  it('keepPositionOnLeave restores the saved position', () => {
    let q = createQueue('q', [npc('a', 2), npc('b', 2), npc('c', 2)], { keepPositionOnLeave: true });
    q = { ...q, customers: [q.customers[0], { ...player, isPlayer: true }, ...q.customers.slice(1)] };
    const left = leaveQueue(q);
    expect(left.savedPosition).toBe(1);
    const back = joinQueue(left, player);
    expect(playerIndex(back)).toBe(1);
    expect(back.savedPosition).toBeUndefined();
  });

  it('saved position is clamped to the current queue length', () => {
    let q = createQueue('q', [npc('a', 2), npc('b', 2)], { keepPositionOnLeave: true });
    q = joinQueue(q, player); // index 2
    let left = leaveQueue(q);
    left = advanceQueue(left, 10).queue; // everyone served
    expect(left.customers).toHaveLength(0);
    expect(playerIndex(joinQueue(left, player))).toBe(0);
  });

  it('leaving from the front resets service progress for the next person', () => {
    const q = joinQueue(createQueue('q', []), player);
    const left = leaveQueue({ ...q, progress: 1 });
    expect(left.progress).toBe(0);
  });

  it('leaveQueue is a no-op when the player is not queued', () => {
    const q = createQueue('q', [npc('a', 2)]);
    expect(leaveQueue(q)).toBe(q);
  });
});

describe('patience and arrivals', () => {
  it('impatient NPCs behind the front leave once waited >= patience', () => {
    const q = createQueue('q', [npc('a', 10), npc('b', 2, { patience: 3 }), npc('c', 2)]);
    const t1 = advanceQueue(q, 2.75);
    expect(t1.left).toHaveLength(0);
    const t2 = advanceQueue(t1.queue, 0.25);
    expect(t2.left.map((c) => c.id)).toEqual(['b']);
    expect(t2.queue.customers.map((c) => c.id)).toEqual(['a', 'c']);
    expect(t2.queue.log.some((l) => l.includes('got tired'))).toBe(true);
  });

  it('the customer being served never leaves, regardless of patience', () => {
    const q = createQueue('q', [npc('a', 10, { patience: 1 })]);
    const t = advanceQueue(q, 5);
    expect(t.left).toHaveLength(0);
    expect(t.queue.customers[0].id).toBe('a');
  });

  it('the player never runs out of patience', () => {
    const q = joinQueue(createQueue('q', [npc('a', 100)]), { ...player, patience: 1 });
    const t = advanceQueue(q, 20);
    expect(t.left).toHaveLength(0);
    expect(playerIndex(t.queue)).toBe(1);
  });

  it('adds a new customer every joinEvery minutes using makeCustomer', () => {
    const made: number[] = [];
    const mk = (n: number): QueueCustomer => {
      made.push(n);
      return npc(`new${n}`, 100);
    };
    const q = createQueue('q', [npc('a', 100)], { joinEvery: 5 });
    expect(q.nextJoinIn).toBe(5);
    const t = advanceQueue(q, 12, mk);
    expect(t.joined).toHaveLength(2); // at minute 5 and 10
    expect(t.queue.customers).toHaveLength(3);
    expect(t.queue.nextJoinIn).toBeCloseTo(3);
    expect(t.queue.customers.slice(1).every((c) => c.waited !== undefined)).toBe(true);
  });

  it('arrivals are deterministic for the same inputs', () => {
    const mk = (n: number): QueueCustomer => npc(`n${n}`, 2 + (n % 3));
    const q = createQueue('q', [npc('a', 2), npc('b', 3, { patience: 4 })], { joinEvery: 3 });
    const a = advanceQueue(q, 17, mk);
    const b = advanceQueue(q, 17, mk);
    expect(a.queue).toEqual(b.queue);
    expect(a.joined.map((c) => c.id)).toEqual(b.joined.map((c) => c.id));
  });

  it('no arrivals without makeCustomer or when joinEvery is 0', () => {
    const q1 = createQueue('q', [npc('a', 100)], { joinEvery: 2 });
    expect(advanceQueue(q1, 10).joined).toHaveLength(0);
    const q2 = createQueue('q', [npc('a', 100)]);
    expect(advanceQueue(q2, 10, () => npc('x', 1)).joined).toHaveLength(0);
  });

  it('no arrivals while the player is at the counter', () => {
    const q = joinQueue(createQueue('q', [], { joinEvery: 1 }), player);
    expect(advanceQueue(q, 10, () => npc('x', 1)).joined).toHaveLength(0);
  });
});
