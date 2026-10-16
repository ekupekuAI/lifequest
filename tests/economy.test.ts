import { describe, expect, it } from 'vitest';
import { ledgerConsistent, receive, spend } from '../src/core/systems';
import type { Wallet } from '../src/domain/types';
import { last } from './helpers';

const empty = (): Wallet => ({ balance: 0, ledger: [] });
const withMoney = (n: number): Wallet => receive(empty(), n, 'Pocket money', 0);

describe('spend', () => {
  it('deducts and records a negative ledger entry', () => {
    const r = spend(withMoney(100), 30, 'Milk', 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wallet.balance).toBe(70);
    expect(last(r.wallet.ledger)).toEqual({ at: 5, amount: -30, label: 'Milk', balanceAfter: 70 });
  });

  it('allows spending the exact balance', () => {
    const r = spend(withMoney(45), 45, 'All of it', 0);
    expect(r.ok && r.wallet.balance).toBe(0);
  });

  it('fails with shortBy when funds are insufficient and leaves the wallet unchanged', () => {
    const w = withMoney(40);
    const r = spend(w, 55, 'Too much', 0);
    expect(r).toEqual({ ok: false, reason: 'insufficient', shortBy: 15 });
    expect(w.balance).toBe(40);
    expect(w.ledger).toHaveLength(1);
  });

  it('rejects negative amounts', () => {
    expect(() => spend(withMoney(10), -5, 'bad', 0)).toThrow();
  });

  it('does not mutate the original wallet', () => {
    const w = withMoney(50);
    spend(w, 10, 'x', 0);
    expect(w.balance).toBe(50);
    expect(w.ledger).toHaveLength(1);
  });
});

describe('receive', () => {
  it('adds money and records a positive ledger entry', () => {
    const w = receive(withMoney(40), 150, 'Grocery cash', 10);
    expect(w.balance).toBe(190);
    expect(last(w.ledger)).toEqual({ at: 10, amount: 150, label: 'Grocery cash', balanceAfter: 190 });
  });

  // BUG: receive() accepts negative amounts, silently acting as an unchecked spend
  // that can drive the balance below zero. spend() throws for negatives; receive()
  // should be symmetric. Suggested fix in systems.ts receive():
  //   if (amount < 0) throw new Error('receive amount must be positive');
  it('rejects negative amounts', () => {
    expect(() => receive(withMoney(10), -50, 'bad', 0)).toThrow();
  });
});

describe('ledger consistency & rounding', () => {
  it('ledger reproduces the balance after many operations', () => {
    let w = withMoney(40);
    let expected = 40;
    for (let i = 0; i < 200; i++) {
      const amt = ((i * 7) % 23) + 0.25 * (i % 4);
      if (i % 3 === 0) {
        w = receive(w, amt, `in ${i}`, i);
        expected += amt;
      } else {
        const r = spend(w, amt, `out ${i}`, i);
        if (r.ok) {
          w = r.wallet;
          expected -= amt;
        }
      }
      expect(ledgerConsistent(w, 0)).toBe(true);
    }
    expect(w.balance).toBeCloseTo(expected, 6);
    expect(last(w.ledger)!.balanceAfter).toBe(w.balance);
  });

  it('detects a tampered balance', () => {
    const w = withMoney(40);
    expect(ledgerConsistent({ ...w, balance: 41 }, 0)).toBe(false);
    expect(ledgerConsistent(w, 10)).toBe(false);
  });

  it('rounds balances to 2 decimals (no float drift)', () => {
    let w = withMoney(0.1);
    w = receive(w, 0.2, 'x', 0);
    expect(w.balance).toBe(0.3);
    const r = spend(w, 0.1, 'y', 0);
    expect(r.ok && r.wallet.balance).toBe(0.2);
  });

  it('can spend a balance that only differs by float error', () => {
    const w = receive(receive(empty(), 0.1, 'a', 0), 0.2, 'b', 0); // 0.3
    const r = spend(w, 0.1 + 0.2, 'all', 0); // 0.30000000000000004
    expect(r.ok).toBe(true);
  });

  // BUG: spend()/receive() round the balance to 2 decimals but record the
  // unrounded amount in the ledger, so amounts with sub-paisa precision break the
  // "ledger always reproduces the balance" invariant (ledgerConsistent → false).
  // In-game prices are whole rupees so this is latent. Suggested fix: round the
  // amount once up front (const a = round2(amount)) and use `a` for both the
  // balance and the ledger entry.
  it('ledger stays consistent for sub-paisa amounts', () => {
    let w = withMoney(40);
    w = receive(w, 0.005, 'interest', 0);
    expect(ledgerConsistent(w, 0)).toBe(true);
  });
});
