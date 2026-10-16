import type { GameStore } from '../core/store';
import { formatMoney } from '../domain/items';
import { words } from '../domain/region';

/** Replace {assigner} {sibling} {player} {budget} tokens in mission text. */
export function fmt(s: GameStore, text: string, opts: { assignerId?: string; budget?: number | null } = {}): string {
  const assigner = s.member(opts.assignerId ?? s.state.run?.assignerId ?? '')?.name ?? 'your parent';
  const sibling = s.memberByRole('younger-sibling')?.name ?? 'your sibling';
  const budget = opts.budget ?? s.state.run?.budget ?? null;
  const grand = s.memberByRole('grandparent')?.name ?? 'Grandma';
  return words(text)
    .replace(/\{assigner\}/g, assigner)
    .replace(/\{sibling\}/g, sibling)
    .replace(/\{player\}/g, s.player?.name ?? 'you')
    .replace(/\{grandparent\}/g, grand)
    .replace(/\{partner\}/g, s.memberByRole('partner')?.name ?? 'your date')
    .replace(/\{budget\}/g, budget != null ? formatMoney(budget) : 'enough money');
}
