import type { FamilyMember, GameState, LocationId, Outcome, Role, ScoreDimension, SkillId } from '../domain/types';
import type { GameStore } from '../core/store';

export type GameEvent =
  | { type: 'interact'; target: string }
  | { type: 'talk'; memberId: string }
  | { type: 'location'; to: LocationId }
  | { type: 'basket'; item: string; qty: number }
  | { type: 'queue-joined' }
  | { type: 'queue-served'; count: number }
  | { type: 'checkout' }
  | { type: 'purchased'; store: string; items: Record<string, number> }
  | { type: 'picked'; item: string }
  | { type: 'placed'; item: string; dest: string }
  | { type: 'minute'; minutes: number }
  | { type: 'objective'; id: string };

export type ObjectiveType = 'talk' | 'collect' | 'checkout' | 'reach' | 'deliver' | 'place' | 'inspect' | 'resolve';

export interface ObjectiveDef {
  id: string;
  label: string;
  type: ObjectiveType;
  target?: string;
  required: boolean;
  /** objectives that must be done before this one can complete */
  dependsOn?: string[];
  /** where to go for this step — drives the on-screen guide arrow. target = an interactable id or npc:<memberId> */
  where?: { location: LocationId; target?: string };
  /** plain-language help shown by the Hint button */
  hint?: string;
}

export interface RequiredItem {
  item: string;
  qty: number;
  /** acceptable substitutes */
  alternatives?: string[];
}

export interface MissionEvaluation {
  outcome: Outcome;
  scores: Partial<Record<ScoreDimension, number>>;
  feedback: string[];
}

export interface MissionDef {
  id: string;
  title: string;
  category: 'household' | 'errand' | 'family' | 'public-service' | 'social';
  difficulty: 1 | 2 | 3;
  icon: string;
  summary: string;
  assignerRoles: Role[];
  location: LocationId;
  destination?: LocationId;
  /** the assigning character's spoken request; {player} {sibling} {budget} tokens */
  briefing: string;
  instructions: string[];
  objectives: ObjectiveDef[];
  requiredItems?: RequiredItem[];
  optionalItems?: string[];
  budget?: number;
  /** exact budget in the current currency (overrides `budget` conversion, e.g. "two bus tickets") */
  budgetFn?(s: GameStore): number;
  deadlineMinutes?: number;
  lateRule: 'partial' | 'none';
  challenges: { id: string; chance?: number }[];
  rewards: { xp: number; badge?: string };
  learning: string[];
  skills: SkillId[];
  /** is this mission playable with the current family / state? */
  available?(state: GameState): { ok: boolean; reason?: string };
  onStart?(s: GameStore): void;
  onInteract?(s: GameStore, target: string): boolean;
  onTalk?(s: GameStore, member: FamilyMember): boolean;
  onEvent?(s: GameStore, ev: GameEvent): void;
  /** the phone button during this mission; return true when handled (default: call home) */
  onPhone?(s: GameStore): boolean;
  /** extra condition for the reward badge on top of "completed with 70+" */
  earnsBadge?(s: GameStore): boolean;
  /** extra progress text for an objective, e.g. "3/9" */
  progress?(state: GameState, objectiveId: string): string | null;
  evaluate(s: GameStore, forced?: Outcome): MissionEvaluation;
}

export type ChallengeCategory =
  | 'queue'
  | 'money'
  | 'availability'
  | 'time'
  | 'communication'
  | 'travel'
  | 'memory'
  | 'household'
  | 'public-service'
  | 'unexpected';

export interface ChallengeOption {
  id: string;
  label: string;
  hint?: string;
  tone: 'good' | 'neutral' | 'bad';
  available?(s: GameStore): boolean;
  /** apply state changes; return the feedback text shown to the player */
  apply(s: GameStore): string;
  /** short, side-effect-free summary of this option's consequence (shown as a "what if" on the results screen) */
  whatIf?: string;
  skills?: Partial<Record<SkillId, number>>;
}

export interface ChallengeDef {
  id: string;
  category: ChallengeCategory;
  title: string;
  trigger: GameEvent['type'] | 'manual';
  when?(s: GameStore, ev: GameEvent): boolean;
  prompt(s: GameStore): { speaker: string; portrait?: string; text: string };
  options: ChallengeOption[];
}
