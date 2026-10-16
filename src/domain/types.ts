// Shared domain model for LifeQuest. Everything here is plain data so it can be
// saved, tested, and sent to Supabase without touching Phaser or React.

export type LocationId = 'home' | 'town' | 'grocery' | 'clinic';

export type Role =
  | 'mother'
  | 'father'
  | 'player'
  | 'older-sibling'
  | 'younger-sibling'
  | 'grandparent'
  | 'guardian';

export const GUARDIAN_ROLES: Role[] = ['mother', 'father', 'grandparent', 'guardian'];

export type SkillId =
  | 'responsibility'
  | 'time'
  | 'budget'
  | 'decisions'
  | 'communication'
  | 'patience'
  | 'planning'
  | 'problem'
  | 'household'
  | 'empathy';

export const SKILL_LABELS: Record<SkillId, string> = {
  responsibility: 'Responsibility',
  time: 'Time management',
  budget: 'Budgeting',
  decisions: 'Decision-making',
  communication: 'Communication',
  patience: 'Patience',
  planning: 'Planning',
  problem: 'Problem-solving',
  household: 'Household',
  empathy: 'Empathy',
};

export type HairStyle = 'short' | 'long' | 'bun' | 'spiky' | 'bald';

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  pants: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  role: Role;
  appearance: Appearance;
  /** 0..100 relationship / trust with the player */
  trust: number;
}

export interface Profile {
  playerName: string;
  familyName: string;
  members: FamilyMember[];
}

export interface ItemDef {
  id: string;
  name: string;
  /** carried weight units; inventory has a weight capacity */
  weight: number;
  category: 'grocery' | 'household' | 'school' | 'chore' | 'gear';
}

export interface Txn {
  at: number;
  amount: number; // negative = spent
  label: string;
  balanceAfter: number;
}

export interface Wallet {
  balance: number;
  ledger: Txn[];
}

export interface Inventory {
  items: Record<string, number>;
  capacity: number;
}

export interface Clock {
  /** minutes since midnight of the current day (float) */
  minutes: number;
  day: number;
}

export type MissionStatus =
  | 'available'
  | 'assigned'
  | 'in-progress'
  | 'blocked'
  | 'completed'
  | 'incomplete'
  | 'cancelled';

export interface DecisionLog {
  at: number;
  text: string;
  consequence: string;
  tone: 'good' | 'neutral' | 'bad';
}

export type FlagValue = number | boolean | string;

export interface MissionRun {
  missionId: string;
  assignmentId?: string;
  assignerId: string;
  status: MissionStatus;
  startedAt: number;
  deadlineAt: number | null;
  budget: number | null;
  /** money the mission handed over (e.g. grocery cash) */
  cashGiven: number;
  spent: number;
  objectives: Record<string, { done: boolean; at?: number }>;
  flags: Record<string, FlagValue>;
  decisions: DecisionLog[];
  challengesSeen: string[];
  deadlineWarned?: boolean;
}

export type ScoreDimension =
  | 'accuracy'
  | 'budget'
  | 'time'
  | 'planning'
  | 'communication'
  | 'problem'
  | 'responsibility';

export const DIMENSION_LABELS: Record<ScoreDimension, string> = {
  accuracy: 'Task accuracy',
  budget: 'Budget',
  time: 'Time',
  planning: 'Planning',
  communication: 'Communication',
  problem: 'Problem-solving',
  responsibility: 'Responsibility',
};

export type Outcome = 'completed' | 'completed-late' | 'incomplete';

export interface MissionResult {
  id: string;
  missionId: string;
  assignmentId?: string;
  title: string;
  outcome: Outcome;
  scores: Partial<Record<ScoreDimension, number>>;
  overall: number;
  xp: number;
  skillsPracticed: SkillId[];
  objectivesDone: string[];
  objectivesMissed: string[];
  moneySpent: number;
  budget: number | null;
  timeUsed: number;
  challenges: string[];
  decisions: DecisionLog[];
  feedback: string[];
  badge?: string;
  finishedAt: number;
  day: number;
}

export interface Assignment {
  id: string;
  missionId: string;
  assignedTo: string; // member id
  assignedBy: string; // member id
  budget: number | null;
  deadlineMinutes: number | null;
  note?: string;
  status: MissionStatus;
  createdAt: number;
  resultId?: string;
}

export interface QueueCustomer {
  id: string;
  name: string;
  serviceMinutes: number;
  isPlayer?: boolean;
  /** minutes this customer is willing to wait before leaving (NPCs only) */
  patience?: number;
  waited?: number;
  look?: number;
}

export interface QueueState {
  id: string;
  customers: QueueCustomer[];
  /** minutes already spent serving the customer at the front */
  progress: number;
  served: number;
  /** minutes until the next NPC joins the back of the line */
  nextJoinIn: number;
  joinEvery: number;
  keepPositionOnLeave: boolean;
  /** remembered index when the player leaves and the queue allows returning */
  savedPosition?: number;
  log: string[];
}

export interface PlayerStats {
  xp: number;
  skills: Record<SkillId, number>;
  badges: string[];
  energy: number;
}

export interface GameState {
  version: 1;
  seed: number;
  profile: Profile;
  clock: Clock;
  wallet: Wallet;
  inventory: Inventory;
  /** items currently held in hands for chores (max 2) */
  hands: string[];
  basket: Record<string, number>;
  location: LocationId;
  stats: PlayerStats;
  run: MissionRun | null;
  results: MissionResult[];
  assignments: Assignment[];
  /** persistent world state (room objects, shop stock, weather...) */
  world: Record<string, FlagValue>;
  /** service queues by id (grocery checkout, clinic reception); they keep moving with game time */
  queues: Record<string, QueueState>;
  /** true while the player stands in the queue at the current location */
  inQueue: boolean;
  receipts: { at: number; lines: { id: string; name: string; qty: number; price: number }[]; total: number; store: string }[];
  tutorialSeen: boolean;
  /** JSON snapshot taken when the current mission started (Restart / Retry) */
  rewind?: string;
}
