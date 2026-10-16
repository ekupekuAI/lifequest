// Family rewards board: parents promise real-life rewards ("you choose Friday's movie 🎬") for
// in-game progress. Progress is computed from game data only — no leaderboards, no comparisons.
// Everything except checkRewards() is pure and deterministic (unit tested).
import type { GameState, Memory, Reward, RewardGoal, SkillId } from '../domain/types';
import { SKILL_LABELS } from '../domain/types';
import { formatMoney } from '../domain/items';
import { money } from '../domain/region';
import type { GameStore } from './store';

export type RewardGoalType = RewardGoal['type'];

export interface RewardProgress {
  value: number;
  target: number;
  /** 0..1 */
  pct: number;
  done: boolean;
  /** e.g. "2 / 3 tasks on time" */
  label: string;
}

type Evaluator<G extends RewardGoal> = (state: GameState, goal: G) => number;

/** Results finished on time (not late, not incomplete), optionally from game day `sinceDay` on. */
export const tasksOnTime: Evaluator<Extract<RewardGoal, { type: 'tasksOnTime' }>> = (state, goal) =>
  state.results.filter((r) => r.outcome === 'completed' && r.day >= (goal.sinceDay ?? 0)).length;

export const savingsAtLeast: Evaluator<Extract<RewardGoal, { type: 'savingsAtLeast' }>> = (state) => Math.max(0, state.savings?.balance ?? 0);

export const kindMemories: Evaluator<Extract<RewardGoal, { type: 'kindMemories' }>> = (state, goal) =>
  (state.memories ?? []).filter((m: Memory) => m.kind === (goal.kind ?? 'kind')).length;

export const skillLevel: Evaluator<Extract<RewardGoal, { type: 'skillLevel' }>> = (state, goal) => state.stats?.skills?.[goal.skill] ?? 0;

/** Longest run of consecutive game days that each have an end-of-day reflection. */
export function longestReflectionStreak(state: Pick<GameState, 'reflections'>): number {
  const days = [...new Set((state.reflections ?? []).map((r) => r.day))].sort((a, b) => a - b);
  let best = 0;
  let cur = 0;
  for (let i = 0; i < days.length; i++) {
    cur = i > 0 && days[i] === days[i - 1] + 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
  }
  return best;
}
export const reflectionStreak: Evaluator<Extract<RewardGoal, { type: 'reflectionStreak' }>> = (state) => longestReflectionStreak(state);

export const missionCompleted: Evaluator<Extract<RewardGoal, { type: 'missionCompleted' }>> = (state, goal) =>
  state.results.filter((r) => r.missionId === goal.missionId && r.outcome !== 'incomplete').length;

/** Current raw value for any goal. */
export function goalValue(state: GameState, goal: RewardGoal): number {
  switch (goal.type) {
    case 'tasksOnTime':
      return tasksOnTime(state, goal);
    case 'savingsAtLeast':
      return savingsAtLeast(state, goal);
    case 'kindMemories':
      return kindMemories(state, goal);
    case 'skillLevel':
      return skillLevel(state, goal);
    case 'reflectionStreak':
      return reflectionStreak(state, goal);
    case 'missionCompleted':
      return missionCompleted(state, goal);
    default:
      return 0;
  }
}

/** Plain-language goal, e.g. "Finish 3 tasks on time". */
export function goalText(goal: RewardGoal, missionTitle?: (id: string) => string | undefined): string {
  const n = goal.target;
  switch (goal.type) {
    case 'tasksOnTime':
      return `Finish ${n} task${n === 1 ? '' : 's'} on time`;
    case 'savingsAtLeast':
      return `Save ${formatMoney(n)} in the piggy bank`;
    case 'kindMemories':
      return `Earn ${n} "${goal.kind ?? 'kind'}" famil${n === 1 ? 'y memory' : 'y memories'}`;
    case 'skillLevel':
      return `Reach ${n} ${SKILL_LABELS[goal.skill] ?? goal.skill} points`;
    case 'reflectionStreak':
      return `Write a reflection ${n} days in a row`;
    case 'missionCompleted': {
      const t = missionTitle?.(goal.missionId) ?? goal.missionId;
      return n > 1 ? `Complete "${t}" ${n} times` : `Complete "${t}"`;
    }
    default:
      return 'Goal';
  }
}

function unitLabel(goal: RewardGoal, value: number): string {
  const v = Math.min(value, goal.target);
  switch (goal.type) {
    case 'savingsAtLeast':
      return `${formatMoney(v)} / ${formatMoney(goal.target)} saved`;
    case 'tasksOnTime':
      return `${v} / ${goal.target} on time`;
    case 'kindMemories':
      return `${v} / ${goal.target} memories`;
    case 'skillLevel':
      return `${Math.round(v)} / ${goal.target} pts`;
    case 'reflectionStreak':
      return `${v} / ${goal.target} days`;
    case 'missionCompleted':
      return `${v} / ${goal.target} done`;
    default:
      return String(v);
  }
}

/** Progress toward one reward. Once reachedAt is set it stays done (reached-once semantics). */
export function rewardProgress(state: GameState, reward: Reward): RewardProgress {
  const target = Math.max(1e-9, reward.goal.target);
  const value = goalValue(state, reward.goal);
  const done = reward.reachedAt !== undefined || value >= reward.goal.target;
  const shown = done ? Math.max(value, reward.goal.target) : value;
  return { value, target: reward.goal.target, pct: done ? 1 : Math.max(0, Math.min(1, value / target)), done, label: unitLabel(reward.goal, shown) };
}

/** Rewards that are reached now but were not marked yet (pure; does not mutate). */
export function findNewlyReached(state: GameState, rewards: readonly Reward[] = state.rewards ?? []): Reward[] {
  return rewards.filter((r) => r.reachedAt === undefined && r.givenAt === undefined && goalValue(state, r.goal) >= r.goal.target);
}

/**
 * Mark newly reached rewards on the store (reachedAt), tell the parent (bus 'report'), and return
 * them so the UI can celebrate. Each reward is reported once.
 */
export function checkRewards(store: GameStore, now = Date.now()): Reward[] {
  const list = store.state.rewards;
  if (!list?.length) return [];
  const fresh = findNewlyReached(store.state, list);
  if (!fresh.length) return [];
  const who = store.state.profile.members.find((m) => m.role === 'player')?.name ?? store.state.profile.playerName ?? 'Your child';
  for (const r of fresh) {
    r.reachedAt = now;
    store.bus.emit('report', { text: `🎉 ${who} reached a family reward: "${r.text}" (${goalText(r.goal)}). Remember to give it!`, tone: 'good', toMemberId: r.createdBy });
  }
  store.state.rewards = [...list];
  store.notify();
  void store.save('Reward reached');
  return fresh;
}

/** Merge a fresh board from the parent with this device's copy, keeping local reachedAt. */
export function mergeRewards(local: readonly Reward[] = [], incoming: readonly Reward[]): Reward[] {
  const byId = new Map(local.map((r) => [r.id, r]));
  return incoming.map((r) => {
    const mine = byId.get(r.id);
    const reachedAt = r.reachedAt ?? mine?.reachedAt;
    const merged: Reward = { ...r };
    if (reachedAt !== undefined) merged.reachedAt = reachedAt;
    // a changed goal resets the "reached" mark
    if (mine && JSON.stringify(mine.goal) !== JSON.stringify(r.goal) && r.reachedAt === undefined) delete merged.reachedAt;
    return merged;
  });
}

// ---------------------------------------------------------------------------
// Templates for the parent editor
// ---------------------------------------------------------------------------
export interface RewardTemplate {
  text: string;
  emoji: string;
  goal: () => RewardGoal;
}

export const REWARD_TEMPLATES: RewardTemplate[] = [
  { text: "You choose Friday's movie", emoji: '🎬', goal: () => ({ type: 'tasksOnTime', target: 3 }) },
  { text: 'Extra 30 minutes of game time', emoji: '🎮', goal: () => ({ type: 'savingsAtLeast', target: money(100) }) },
  { text: 'Family ice-cream trip', emoji: '🍦', goal: () => ({ type: 'kindMemories', target: 5 }) },
  { text: 'Pick the dinner menu one night', emoji: '🍕', goal: () => ({ type: 'skillLevel', target: 100, skill: 'budget' as SkillId }) },
  { text: 'A trip to the park together', emoji: '🌳', goal: () => ({ type: 'reflectionStreak', target: 3 }) },
  { text: 'Help plan the real weekly shop', emoji: '🛒', goal: () => ({ type: 'missionCompleted', target: 1, missionId: 'grocery-run' }) },
];

export const GOAL_TYPES: { type: RewardGoalType; label: string }[] = [
  { type: 'tasksOnTime', label: 'Tasks finished on time' },
  { type: 'savingsAtLeast', label: 'Piggy-bank savings' },
  { type: 'kindMemories', label: '"Kind" family memories' },
  { type: 'skillLevel', label: 'Life-skill points' },
  { type: 'reflectionStreak', label: 'Reflection streak (days)' },
  { type: 'missionCompleted', label: 'Complete a specific task' },
];

/** A sensible default goal for a type (used when the parent switches the goal type). */
export function defaultGoal(type: RewardGoalType): RewardGoal {
  switch (type) {
    case 'tasksOnTime':
      return { type, target: 3 };
    case 'savingsAtLeast':
      return { type, target: money(100) };
    case 'kindMemories':
      return { type, target: 5, kind: 'kind' };
    case 'skillLevel':
      return { type, target: 100, skill: 'responsibility' };
    case 'reflectionStreak':
      return { type, target: 3 };
    case 'missionCompleted':
      return { type, target: 1, missionId: 'grocery-run' };
  }
}

export function newRewardId(): string {
  return `rw-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
