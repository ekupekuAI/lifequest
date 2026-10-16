import { describe, expect, it } from 'vitest';
import type { GameState, MissionResult, Reward } from '../src/domain/types';
import {
  REWARD_TEMPLATES,
  checkRewards,
  defaultGoal,
  findNewlyReached,
  goalText,
  goalValue,
  longestReflectionStreak,
  mergeRewards,
  rewardProgress,
} from '../src/core/rewards';
import { newStore } from './helpers';

const result = (over: Partial<MissionResult>): MissionResult => ({
  id: `r${Math.random()}`,
  missionId: 'grocery-run',
  title: 'The Grocery Run',
  outcome: 'completed',
  scores: {},
  overall: 80,
  xp: 100,
  skillsPracticed: [],
  objectivesDone: [],
  objectivesMissed: [],
  moneySpent: 0,
  budget: null,
  timeUsed: 30,
  challenges: [],
  decisions: [],
  feedback: [],
  finishedAt: 600,
  day: 1,
  ...over,
});

function state(): GameState {
  const s = newStore();
  return s.state;
}

const reward = (goal: Reward['goal'], over: Partial<Reward> = {}): Reward => ({ id: `rw-${goal.type}`, text: 'Movie night', goal, createdAt: 0, ...over });

describe('goal evaluators', () => {
  it('tasksOnTime counts on-time completions only (optionally since a day)', () => {
    const st = state();
    st.results = [result({ day: 1 }), result({ day: 2, outcome: 'completed-late' }), result({ day: 3, outcome: 'incomplete' }), result({ day: 4 })];
    expect(goalValue(st, { type: 'tasksOnTime', target: 3 })).toBe(2);
    expect(goalValue(st, { type: 'tasksOnTime', target: 3, sinceDay: 2 })).toBe(1);
  });

  it('savingsAtLeast reads the piggy bank', () => {
    const st = state();
    st.savings.balance = 80;
    const r = reward({ type: 'savingsAtLeast', target: 100 });
    expect(rewardProgress(st, r)).toMatchObject({ value: 80, pct: 0.8, done: false, label: '₹80 / ₹100 saved' });
    st.savings.balance = 120;
    expect(rewardProgress(st, r).done).toBe(true);
  });

  it('kindMemories counts memories of a kind', () => {
    const st = state();
    st.memories = [
      { id: '1', day: 1, who: 'x', kind: 'kind', text: '' },
      { id: '2', day: 1, who: 'x', kind: 'careless', text: '' },
      { id: '3', day: 2, who: 'x', kind: 'kind', text: '' },
      { id: '4', day: 2, who: 'x', kind: 'helpful', text: '' },
    ];
    expect(goalValue(st, { type: 'kindMemories', target: 5 })).toBe(2);
    expect(goalValue(st, { type: 'kindMemories', target: 5, kind: 'helpful' })).toBe(1);
  });

  it('skillLevel reads skill points', () => {
    const st = state();
    st.stats.skills.budget = 42;
    expect(goalValue(st, { type: 'skillLevel', target: 100, skill: 'budget' })).toBe(42);
  });

  it('reflectionStreak finds the longest run of consecutive days', () => {
    const refl = (day: number) => ({ day, wentWell: '', improve: '', mood: '' });
    expect(longestReflectionStreak({ reflections: [] })).toBe(0);
    expect(longestReflectionStreak({ reflections: [refl(1), refl(2), refl(4), refl(5), refl(6), refl(6)] })).toBe(3);
    expect(longestReflectionStreak({ reflections: [refl(9), refl(3)] })).toBe(1);
  });

  it('missionCompleted counts non-incomplete results for one mission', () => {
    const st = state();
    st.results = [result({}), result({ outcome: 'completed-late' }), result({ outcome: 'incomplete' }), result({ missionId: 'clean-room' })];
    expect(goalValue(st, { type: 'missionCompleted', target: 1, missionId: 'grocery-run' })).toBe(2);
  });

  it('every template and default goal is evaluable and has text', () => {
    const st = state();
    for (const t of REWARD_TEMPLATES) {
      expect(Number.isFinite(goalValue(st, t.goal()))).toBe(true);
      expect(goalText(t.goal()).length).toBeGreaterThan(5);
    }
    for (const type of ['tasksOnTime', 'savingsAtLeast', 'kindMemories', 'skillLevel', 'reflectionStreak', 'missionCompleted'] as const)
      expect(defaultGoal(type).type).toBe(type);
  });
});

describe('reached-once semantics', () => {
  it('checkRewards marks, reports and celebrates each reward once', () => {
    const s = newStore();
    const reports: string[] = [];
    s.bus.on('report', (r) => reports.push(r.text));
    s.state.rewards = [reward({ type: 'savingsAtLeast', target: 50 }, { text: 'Extra game time' }), reward({ type: 'tasksOnTime', target: 3 })];
    expect(checkRewards(s, 1000)).toEqual([]);
    s.state.savings.balance = 60;
    const first = checkRewards(s, 2000);
    expect(first.map((r) => r.text)).toEqual(['Extra game time']);
    expect(s.state.rewards[0].reachedAt).toBe(2000);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatch(/Extra game time/);
    // spending the savings does not "un-reach" it, and it is never reported twice
    s.state.savings.balance = 0;
    expect(checkRewards(s, 3000)).toEqual([]);
    expect(rewardProgress(s.state, s.state.rewards[0]).done).toBe(true);
    expect(reports).toHaveLength(1);
  });

  it('given rewards are never re-reported', () => {
    const st = state();
    st.savings.balance = 999;
    expect(findNewlyReached(st, [reward({ type: 'savingsAtLeast', target: 1 }, { givenAt: 5 })])).toEqual([]);
  });

  it('is deterministic for the same state', () => {
    const st = state();
    st.results = [result({}), result({ day: 2 })];
    st.savings.balance = 30;
    const rs = REWARD_TEMPLATES.map((t, i) => reward(t.goal(), { id: `t${i}` }));
    const a = rs.map((r) => rewardProgress(st, r));
    const b = rs.map((r) => rewardProgress(JSON.parse(JSON.stringify(st)), r));
    expect(a).toEqual(b);
    expect(findNewlyReached(st, rs)).toEqual(findNewlyReached(st, rs));
  });

  it('mergeRewards keeps local reachedAt unless the goal changed', () => {
    const local = [reward({ type: 'tasksOnTime', target: 3 }, { reachedAt: 7 })];
    expect(mergeRewards(local, [reward({ type: 'tasksOnTime', target: 3 }, { text: 'Renamed' })])[0]).toMatchObject({ text: 'Renamed', reachedAt: 7 });
    expect(mergeRewards(local, [reward({ type: 'tasksOnTime', target: 5 })])[0].reachedAt).toBeUndefined();
    expect(mergeRewards(local, [])).toEqual([]);
  });
});
