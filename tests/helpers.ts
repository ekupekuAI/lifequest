// Shared helpers for store-level tests (not a test file itself).
import { vi } from 'vitest';
import { GameStore } from '../src/core/store';
import type { GameRepository } from '../src/services/repository';
import { DEFAULT_PLAYER_LOOK, FAMILY_PRESETS, buildProfile, type FamilyPreset } from '../src/domain/family';

export const fakeRepo = (): GameRepository => ({
  kind: 'local',
  hasSave: () => false,
  load: async () => null,
  save: async () => ({ ok: true, where: 'local' }),
  clear() {},
});

/** New game with a fixed seed so challenge rolls and queue lengths are deterministic. */
export function newStore(opts: { preset?: FamilyPreset; seed?: number } = {}): GameStore {
  const s = new GameStore(fakeRepo());
  s.newGame(buildProfile('Test', DEFAULT_PLAYER_LOOK, opts.preset ?? FAMILY_PRESETS[0]));
  s.state.seed = opts.seed ?? 4242;
  return s;
}

export const idOf = (s: GameStore, role: Parameters<GameStore['memberByRole']>[0]) => {
  const m = s.memberByRole(role);
  if (!m) throw new Error(`no member with role ${role}`);
  return m.id;
};

export type Picker = (labels: string[]) => number;

/**
 * Resolve any open dialogue/modal: flush pending timers, pick a choice (via `pick`, falling back
 * to the first enabled one) or advance lines, and close non-results modals. Records every
 * dialogue line it saw so tests can assert on what was shown.
 */
export function settle(s: GameStore, pick?: Picker, seen: string[] = []): string[] {
  for (let guard = 0; guard < 200; guard++) {
    vi.runOnlyPendingTimers();
    const d = s.ui.dialogue;
    if (d && d.length) {
      const line = d[0];
      seen.push(line.text);
      const choices = line.choices ?? [];
      if (choices.length) {
        const labels = choices.map((c) => c.label);
        let i = pick ? pick(labels) : -1;
        if (i < 0 || choices[i]?.disabled) i = choices.findIndex((c) => !c.disabled);
        if (i < 0) throw new Error(`all choices disabled: ${labels.join(' | ')}`);
        s.choose(i);
      } else s.advanceDialogue();
      continue;
    }
    if (s.ui.modal && s.ui.modal.type !== 'results') {
      s.openModal(null);
      continue;
    }
    return seen;
  }
  throw new Error('settle(): dialogue loop guard tripped');
}

/** Pick the first choice whose label matches the regex. */
export const byLabel =
  (re: RegExp): Picker =>
  (labels) =>
    labels.findIndex((l) => re.test(l));

/** Last element of an array (Array.prototype.at is not in the project's TS lib). */
export const last = <T>(xs: readonly T[]): T | undefined => xs[xs.length - 1];
