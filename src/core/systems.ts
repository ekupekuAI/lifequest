// Pure, testable game systems. They operate on plain state slices and return
// results instead of touching the UI. The GameStore wires them together.
import type { Clock, Inventory, QueueCustomer, QueueState, Wallet } from '../domain/types';
import { ITEMS } from '../domain/items';

// ---------- RNG (deterministic) ----------
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable roll for a named event: same seed + key => same result. */
export function rollFor(seed: number, key: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 2654435761) >>> 0;
  return mulberry32(h)();
}

// ---------- Time ----------
export const TIME_CONFIG = {
  /** real milliseconds per in-game minute while walking around */
  realMsPerGameMinute: 1000,
  /** speed multiplier while waiting in a queue */
  waitMultiplier: 8,
  dayStart: 16 * 60 + 30,
};

export function advanceClock(clock: Clock, minutes: number): Clock {
  return { ...clock, minutes: clock.minutes + Math.max(0, minutes) };
}

export function formatClock(minutes: number): string {
  const m = Math.floor(minutes) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ---------- Economy ----------
export type SpendResult = { ok: true; wallet: Wallet } | { ok: false; reason: 'insufficient'; shortBy: number };

export function spend(wallet: Wallet, rawAmount: number, label: string, at: number): SpendResult {
  if (rawAmount < 0) throw new Error('spend amount must be positive');
  const amount = round2(rawAmount);
  if (amount > wallet.balance + 1e-9) return { ok: false, reason: 'insufficient', shortBy: amount - wallet.balance };
  const balance = round2(wallet.balance - amount);
  return { ok: true, wallet: { balance, ledger: [...wallet.ledger, { at, amount: -amount, label, balanceAfter: balance }] } };
}

export function receive(wallet: Wallet, rawAmount: number, label: string, at: number): Wallet {
  if (rawAmount < 0) throw new Error('receive amount must be positive');
  const amount = round2(rawAmount);
  const balance = round2(wallet.balance + amount);
  return { balance, ledger: [...wallet.ledger, { at, amount, label, balanceAfter: balance }] };
}

/** Ledger must always reproduce the balance — used by tests and a dev assertion. */
export function ledgerConsistent(wallet: Wallet, opening: number): boolean {
  const sum = wallet.ledger.reduce((s, t) => s + t.amount, opening);
  return Math.abs(sum - wallet.balance) < 0.001;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------- Inventory ----------
export function inventoryWeight(inv: Inventory): number {
  return Object.entries(inv.items).reduce((w, [id, q]) => w + (ITEMS[id]?.weight ?? 0) * q, 0);
}

export type InvResult = { ok: true; inventory: Inventory } | { ok: false; reason: 'capacity' | 'missing' };

export function addItem(inv: Inventory, id: string, qty = 1): InvResult {
  const extra = (ITEMS[id]?.weight ?? 0) * qty;
  if (inventoryWeight(inv) + extra > inv.capacity + 1e-9) return { ok: false, reason: 'capacity' };
  return { ok: true, inventory: { ...inv, items: { ...inv.items, [id]: (inv.items[id] ?? 0) + qty } } };
}

export function removeItem(inv: Inventory, id: string, qty = 1): InvResult {
  const have = inv.items[id] ?? 0;
  if (have < qty) return { ok: false, reason: 'missing' };
  const items = { ...inv.items };
  if (have === qty) delete items[id];
  else items[id] = have - qty;
  return { ok: true, inventory: { ...inv, items } };
}

export function countItem(inv: Inventory, id: string): number {
  return inv.items[id] ?? 0;
}

// ---------- Basket ----------
export function basketTotal(basket: Record<string, number>, priceOf: (id: string) => number): number {
  return Object.entries(basket).reduce((s, [id, q]) => s + priceOf(id) * q, 0);
}

// ---------- Queue ----------
export function createQueue(
  id: string,
  customers: QueueCustomer[],
  opts: { joinEvery?: number; keepPositionOnLeave?: boolean } = {},
): QueueState {
  return {
    id,
    customers: customers.map((c) => ({ ...c, waited: 0 })),
    progress: 0,
    served: 0,
    joinEvery: opts.joinEvery ?? 0,
    nextJoinIn: opts.joinEvery ?? 0,
    keepPositionOnLeave: opts.keepPositionOnLeave ?? false,
    log: [],
  };
}

export function playerIndex(q: QueueState): number {
  return q.customers.findIndex((c) => c.isPlayer);
}

/** Minutes until the player reaches the counter (0 when it's their turn). */
export function estimateWait(q: QueueState): number {
  const idx = playerIndex(q);
  const ahead = idx < 0 ? q.customers : q.customers.slice(0, idx);
  const total = ahead.reduce((s, c) => s + c.serviceMinutes, 0);
  return Math.max(0, total - (ahead.length ? q.progress : 0));
}

export function joinQueue(q: QueueState, player: QueueCustomer): QueueState {
  if (playerIndex(q) >= 0) return q;
  const customers = [...q.customers];
  let at = customers.length;
  if (q.keepPositionOnLeave && q.savedPosition !== undefined) at = Math.min(q.savedPosition, customers.length);
  customers.splice(at, 0, { ...player, isPlayer: true, serviceMinutes: player.serviceMinutes });
  return { ...q, customers, savedPosition: undefined, log: [...q.log, 'You joined the queue.'] };
}

export function leaveQueue(q: QueueState): QueueState {
  const idx = playerIndex(q);
  if (idx < 0) return q;
  const customers = q.customers.filter((c) => !c.isPlayer);
  return {
    ...q,
    customers,
    savedPosition: q.keepPositionOnLeave ? idx : undefined,
    // if the player was at the front being served, service restarts for the next person
    progress: idx === 0 ? 0 : q.progress,
    log: [...q.log, q.keepPositionOnLeave ? 'You stepped out. Your token keeps your place.' : 'You left the queue and lost your place.'],
  };
}

export interface QueueTick {
  queue: QueueState;
  served: QueueCustomer[];
  left: QueueCustomer[];
  joined: QueueCustomer[];
  playerAtFront: boolean;
}

/**
 * Advance a queue by game minutes. The customer at the front is served; when the
 * player reaches the front, service stops so the player can interact with the cashier.
 */
export function advanceQueue(q: QueueState, minutes: number, makeCustomer?: (n: number) => QueueCustomer): QueueTick {
  let queue: QueueState = { ...q, customers: q.customers.map((c) => ({ ...c })), log: [...q.log] };
  const served: QueueCustomer[] = [];
  const left: QueueCustomer[] = [];
  const joined: QueueCustomer[] = [];
  let remaining = minutes;
  const STEP = 0.25;
  while (remaining > 1e-9) {
    const dt = Math.min(STEP, remaining);
    remaining -= dt;
    const front = queue.customers[0];
    if (front && front.isPlayer) break; // player's turn
    if (front) {
      queue.progress += dt;
      if (queue.progress >= front.serviceMinutes - 1e-9) {
        served.push(front);
        queue.customers.shift();
        queue.progress = 0;
        queue.served += 1;
        queue.log.push(`${front.name} finished paying.`);
      }
    }
    // waiting & patience (NPCs behind the front only)
    for (let i = queue.customers.length - 1; i >= 1; i--) {
      const c = queue.customers[i];
      if (c.isPlayer) continue;
      c.waited = (c.waited ?? 0) + dt;
      if (c.patience !== undefined && c.waited >= c.patience) {
        left.push(c);
        queue.customers.splice(i, 1);
        queue.log.push(`${c.name} got tired of waiting and left.`);
      }
    }
    // new arrivals
    if (queue.joinEvery > 0 && makeCustomer) {
      queue.nextJoinIn -= dt;
      if (queue.nextJoinIn <= 0) {
        const c = makeCustomer(queue.served + queue.customers.length);
        queue.customers.push({ ...c, waited: 0 });
        joined.push(c);
        queue.nextJoinIn = queue.joinEvery;
        queue.log.push(`${c.name} joined the back of the line.`);
      }
    }
  }
  const pi = playerIndex(queue);
  return { queue, served, left, joined, playerAtFront: pi === 0 };
}

/** The player finished at the counter. */
export function completeService(q: QueueState): QueueState {
  if (q.customers[0]?.isPlayer) {
    return { ...q, customers: q.customers.slice(1), progress: 0, served: q.served + 1, log: [...q.log, 'You finished at the counter.'] };
  }
  return q;
}
