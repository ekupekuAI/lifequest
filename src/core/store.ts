// GameStore: the single source of truth shared by Phaser (world) and React (UI).
// Systems in ./systems.ts are pure; this class owns the state, applies them,
// routes interactions to missions/challenges, and notifies subscribers.
import type {
  Assignment,
  DecisionLog,
  FamilyMember,
  FlagValue,
  GameState,
  LocationId,
  MissionResult,
  QueueState,
  Outcome,
  Profile,
  Role,
  SkillId,
} from '../domain/types';
import { GUARDIAN_ROLES } from '../domain/types';
import { GROCERY_SHELVES, KIOSK_SHELF, findProduct, formatMoney, itemName } from '../domain/items';
import { NPC_LOOKS } from '../domain/family';
import {
  TIME_CONFIG,
  addItem,
  advanceQueue,
  basketTotal,
  completeService,
  countItem,
  createQueue,
  estimateWait,
  formatClock,
  formatDuration,
  joinQueue,
  leaveQueue,
  playerIndex,
  receive,
  removeItem,
  rollFor,
  spend,
} from './systems';
import type { ChallengeDef, GameEvent, MissionDef } from '../missions/types';
import { MISSIONS, getMission } from '../missions/registry';
import { CHALLENGES } from '../missions/challenges';
import { EventBus } from './events';
import { fmt } from '../missions/format';
import { sfx } from './sfx';
import type { GameRepository } from '../services/repository';
import { createRepository } from '../services/repository';

export type Screen = 'start' | 'setup' | 'game' | 'parent';

export interface DialogueChoice {
  label: string;
  hint?: string;
  tone?: 'good' | 'neutral' | 'bad';
  disabled?: boolean;
  run: () => void;
}

export interface DialogueLine {
  speaker: string;
  /** member id, or `npc:<key>` for townsfolk, or undefined for narration */
  portrait?: string;
  text: string;
  choices?: DialogueChoice[];
}

export type Modal =
  | { type: 'briefing'; missionId: string; assignerId: string; assignmentId?: string; reopen?: boolean }
  | { type: 'journal' }
  | { type: 'shelf'; shelfId: string }
  | { type: 'results'; resultId: string }
  | { type: 'pause' }
  | { type: 'board' }
  | { type: 'parent' }
  | { type: 'help' }
  | { type: 'confirm'; text: string; yes: string; onYes: () => void };

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'neutral' | 'bad' | 'info';
}

export interface SaveStatus {
  kind: 'idle' | 'saving' | 'local' | 'cloud' | 'error';
  message: string;
}

export interface UIState {
  screen: Screen;
  dialogue: DialogueLine[] | null;
  dialogueOpenedAt: number;
  modal: Modal | null;
  toasts: Toast[];
  saveStatus: SaveStatus;
  waiting: boolean;
  prompt: string | null;
  sound: boolean;
  feedback: { text: string; tone: 'good' | 'neutral' | 'bad' } | null;
}

export interface Snapshot {
  rev: number;
  state: GameState;
  ui: UIState;
}

const SAVE_VERSION = 1 as const;

export function freshState(profile: Profile, seed = Date.now() % 100000): GameState {
  return {
    version: SAVE_VERSION,
    seed,
    profile,
    clock: { minutes: TIME_CONFIG.dayStart, day: 1 },
    wallet: { balance: 40, ledger: [{ at: TIME_CONFIG.dayStart, amount: 40, label: 'Pocket money', balanceAfter: 40 }] },
    inventory: { items: {}, capacity: 8 },
    hands: [],
    basket: {},
    location: 'home',
    stats: {
      xp: 0,
      skills: { responsibility: 0, time: 0, budget: 0, decisions: 0, communication: 0, patience: 0, planning: 0, problem: 0, household: 0, empathy: 0 },
      badges: [],
      energy: 100,
    },
    run: null,
    results: [],
    assignments: [],
    world: {},
    queues: {},
    inQueue: false,
    receipts: [],
    tutorialSeen: false,
  };
}

const QUEUE_FOR: Partial<Record<LocationId, string>> = { grocery: 'grocery-checkout', clinic: 'clinic-reception' };
const CLINIC_NAMES = ['Mr. Fernandes', 'A mother with a baby', 'Mrs. Rao', 'A college student', 'Mr. Khan'];
const QUEUE_NAMES = ['Mrs. Kapoor', 'Mr. Das', 'A student', 'Aunty with a full cart', 'Office worker', 'Mr. Iyer', 'A delivery rider', 'Young couple'];

export class GameStore {
  state: GameState;
  ui: UIState;
  rev = 0;
  bus = new EventBus();
  repo: GameRepository;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot;
  private notifyScheduled = false;
  private lastWholeMinute = 0;
  private runSnapshot: string | null = null;
  private toastId = 1;
  private dialogueDone: (() => void) | null = null;
  private pendingAfterChallenge: (() => void) | null = null;

  constructor(repo?: GameRepository) {
    this.repo = repo ?? createRepository();
    this.state = freshState({ playerName: 'Alex', familyName: 'Family', members: [] });
    this.ui = {
      screen: 'start',
      dialogue: null,
      dialogueOpenedAt: 0,
      modal: null,
      toasts: [],
      saveStatus: { kind: 'idle', message: this.repo.kind === 'supabase' ? 'Cloud saves enabled' : 'Local demo mode' },
      waiting: false,
      prompt: null,
      sound: true,
      feedback: null,
    };
    this.snapshot = { rev: 0, state: this.state, ui: this.ui };
    sfx.enabled = () => this.ui.sound;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('lifequest.sound') === 'off') this.ui.sound = false;
    } catch {
      /* storage unavailable */
    }
  }

  // ---------- subscription ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  notify() {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      this.rev++;
      this.snapshot = { rev: this.rev, state: this.state, ui: this.ui };
      this.listeners.forEach((l) => l());
    });
  }

  setUI(patch: Partial<UIState>) {
    if (patch.sound !== undefined && patch.sound !== this.ui.sound) {
      try {
        localStorage.setItem('lifequest.sound', patch.sound ? 'on' : 'off');
      } catch {
        /* storage unavailable */
      }
    }
    this.ui = { ...this.ui, ...patch };
    this.notify();
  }

  get blocking(): boolean {
    if (this.ui.screen !== 'game') return true;
    if (this.ui.dialogue) return true;
    if (this.ui.modal) {
      // reviewing the list while queueing keeps the queue moving
      if (this.ui.modal.type === 'journal' && this.state.inQueue) return false;
      return true;
    }
    return false;
  }

  get mission(): MissionDef | null {
    return this.state.run ? (getMission(this.state.run.missionId) ?? null) : null;
  }

  // ---------- profile & game lifecycle ----------
  newGame(profile: Profile) {
    this.state = freshState(profile);
    this.lastWholeMinute = Math.floor(this.state.clock.minutes);
    this.runSnapshot = null;
    this.ui = { ...this.ui, screen: 'game', dialogue: null, modal: null, toasts: [], waiting: false };
    this.notify();
    this.save();
  }

  async continueGame(): Promise<boolean> {
    const loaded = await this.repo.load();
    if (!loaded) return false;
    this.state = { ...freshState(loaded.profile), ...loaded, inQueue: false };
    this.runSnapshot = loaded.rewind ?? null;
    if (this.state.location === 'grocery' || this.state.location === 'clinic') this.state.location = 'town';
    this.lastWholeMinute = Math.floor(this.state.clock.minutes);
    this.ui = { ...this.ui, screen: 'game', dialogue: null, modal: null, waiting: false };
    this.notify();
    return true;
  }

  async save(label = 'Saved') {
    this.setUI({ saveStatus: { kind: 'saving', message: 'Saving…' } });
    const res = await this.repo.save(this.state);
    if (res.ok) this.setUI({ saveStatus: { kind: res.where, message: res.where === 'cloud' ? 'Cloud saved' : `${label} locally` } });
    else this.setUI({ saveStatus: { kind: 'error', message: `Cloud save failed: ${res.error}. Progress kept locally.` } });
  }

  goToScreen(screen: Screen) {
    this.ui = { ...this.ui, screen, modal: null, dialogue: null, waiting: false, prompt: null };
    this.notify();
  }

  // ---------- members ----------
  member(id: string): FamilyMember | undefined {
    return this.state.profile.members.find((m) => m.id === id);
  }
  memberByRole(...roles: Role[]): FamilyMember | undefined {
    for (const r of roles) {
      const m = this.state.profile.members.find((x) => x.role === r);
      if (m) return m;
    }
    return undefined;
  }
  get player(): FamilyMember {
    return this.memberByRole('player') ?? this.state.profile.members[0];
  }
  assigner(): FamilyMember | undefined {
    return this.state.run ? this.member(this.state.run.assignerId) : undefined;
  }
  trust(memberId: string, delta: number) {
    const m = this.member(memberId);
    if (!m) return;
    m.trust = Math.max(0, Math.min(100, m.trust + delta));
    if (delta !== 0) this.bus.emit('fx', { kind: delta > 0 ? 'heart' : 'cloud', target: `npc:${memberId}` });
    this.notify();
  }

  // ---------- feedback ----------
  toast(text: string, tone: Toast['tone'] = 'info') {
    const t = { id: this.toastId++, text, tone };
    this.setUI({ toasts: [...this.ui.toasts.slice(-3), t] });
    setTimeout(() => this.setUI({ toasts: this.ui.toasts.filter((x) => x.id !== t.id) }), 3600);
  }

  say(lines: DialogueLine[], onDone?: () => void) {
    this.dialogueDone = onDone ?? null;
    this.setUI({ dialogue: lines, dialogueOpenedAt: performance.now(), prompt: null });
    sfx.play('blip');
  }

  advanceDialogue() {
    const d = this.ui.dialogue;
    if (!d) return;
    if (d[0]?.choices?.length) return; // must choose
    const rest = d.slice(1);
    if (rest.length) this.setUI({ dialogue: rest, dialogueOpenedAt: performance.now() });
    else this.closeDialogue();
  }

  closeDialogue() {
    const done = this.dialogueDone;
    this.dialogueDone = null;
    this.setUI({ dialogue: null });
    done?.();
  }

  choose(index: number) {
    const line = this.ui.dialogue?.[0];
    const c = line?.choices?.[index];
    if (!c || c.disabled) return;
    sfx.play('select');
    // close current line first so the choice may open a new dialogue
    const rest = this.ui.dialogue!.slice(1);
    const done = this.dialogueDone;
    this.dialogueDone = null;
    this.ui = { ...this.ui, dialogue: rest.length ? rest : null };
    if (rest.length) this.dialogueDone = done;
    c.run();
    if (!rest.length && !this.ui.dialogue) done?.();
    this.notify();
  }

  openModal(modal: Modal | null) {
    if (modal?.type === 'journal' && this.state.run) this.flag('checkedList', true);
    this.setUI({ modal });
  }

  // ---------- time ----------
  spendTime(minutes: number, reason?: string) {
    this.state.clock = { ...this.state.clock, minutes: this.state.clock.minutes + minutes };
    this.progressQueue(minutes);
    if (reason && minutes >= 1) this.toast(`+${Math.round(minutes)} min · ${reason}`, 'neutral');
    this.onMinuteBoundary();
    this.notify();
  }

  /** Called by Phaser every frame. */
  tick(dtMs: number, moving: boolean) {
    if (this.blocking) return;
    const fast = this.state.inQueue && this.ui.waiting;
    const mins = (dtMs / TIME_CONFIG.realMsPerGameMinute) * (fast ? TIME_CONFIG.waitMultiplier : 1);
    this.state.clock.minutes += mins;
    if (moving) {
      const drain = (this.state.world['carryingByHand'] ? 0.9 : 0.35) * mins;
      this.state.stats.energy = Math.max(0, this.state.stats.energy - drain);
    }
    this.progressQueue(mins);
    const whole = Math.floor(this.state.clock.minutes);
    if (whole !== this.lastWholeMinute) this.onMinuteBoundary();
  }

  private onMinuteBoundary() {
    const whole = Math.floor(this.state.clock.minutes);
    if (whole === this.lastWholeMinute) return;
    this.lastWholeMinute = whole;
    const run = this.state.run;
    if (run && run.deadlineAt !== null && run.status === 'in-progress') {
      const left = run.deadlineAt - this.state.clock.minutes;
      if (left <= 10 && left > 0 && !run.deadlineWarned) {
        run.deadlineWarned = true;
        this.toast(`Only ${Math.ceil(left)} minutes left!`, 'bad');
        sfx.play('warn');
      }
      if (left <= 0 && !run.flags['lateNoticed']) {
        run.flags['lateNoticed'] = true;
        this.toast('The deadline has passed — finish anyway, it still counts.', 'bad');
        this.log('The deadline passed before the task was finished.', 'Late tasks still count, but the family had to wait.', 'bad');
      }
    }
    if (this.state.world['rainUntil'] && this.state.clock.minutes > Number(this.state.world['rainUntil'])) {
      delete this.state.world['rainUntil'];
      this.toast('The rain has stopped.', 'info');
    }
    this.emit({ type: 'minute', minutes: whole });
    this.notify();
  }

  timeLeft(): number | null {
    const r = this.state.run;
    if (!r || r.deadlineAt === null) return null;
    return r.deadlineAt - this.state.clock.minutes;
  }

  // ---------- money ----------
  give(amount: number, label: string) {
    this.state.wallet = receive(this.state.wallet, amount, label, this.state.clock.minutes);
    this.notify();
  }
  pay(amount: number, label: string, countAsSpent = true): boolean {
    const r = spend(this.state.wallet, amount, label, this.state.clock.minutes);
    if (!r.ok) return false;
    this.state.wallet = r.wallet;
    if (this.state.run && countAsSpent) this.state.run.spent += amount;
    sfx.play('cash');
    this.notify();
    return true;
  }

  // ---------- inventory & hands ----------
  hasItem(id: string, qty = 1) {
    return countItem(this.state.inventory, id) >= qty;
  }
  giveItem(id: string, qty = 1): boolean {
    const r = addItem(this.state.inventory, id, qty);
    if (!r.ok) {
      this.toast('Your bag is too heavy to carry more.', 'bad');
      return false;
    }
    this.state.inventory = r.inventory;
    this.notify();
    return true;
  }
  takeItem(id: string, qty = 1): boolean {
    const r = removeItem(this.state.inventory, id, qty);
    if (!r.ok) return false;
    this.state.inventory = r.inventory;
    this.notify();
    return true;
  }
  hold(item: string): boolean {
    if (this.state.hands.length >= 2) {
      this.toast('Your hands are full (2 items). Put something away first.', 'bad');
      sfx.play('error');
      return false;
    }
    this.state.hands = [...this.state.hands, item];
    sfx.play('pickup');
    this.emit({ type: 'picked', item });
    this.notify();
    return true;
  }
  release(item: string): boolean {
    const i = this.state.hands.indexOf(item);
    if (i < 0) return false;
    this.state.hands = this.state.hands.filter((_, j) => j !== i);
    this.notify();
    return true;
  }

  // ---------- flags / logging ----------
  flag(key: string, value: FlagValue) {
    if (!this.state.run) return;
    this.state.run.flags[key] = value;
    this.notify();
  }
  getFlag<T extends FlagValue>(key: string, fallback: T): T {
    return (this.state.run?.flags[key] as T) ?? fallback;
  }
  bump(key: string, delta: number) {
    this.flag(key, this.getFlag(key, 0) + delta);
  }
  world(key: string, value?: FlagValue): FlagValue | undefined {
    if (value !== undefined) {
      this.state.world[key] = value;
      this.notify();
    }
    return this.state.world[key];
  }
  log(text: string, consequence: string, tone: DecisionLog['tone'] = 'neutral') {
    if (!this.state.run) return;
    this.state.run.decisions.push({ at: this.state.clock.minutes, text, consequence, tone });
    this.notify();
  }
  skill(id: SkillId, pts: number) {
    this.state.stats.skills[id] = (this.state.stats.skills[id] ?? 0) + pts;
  }
  showFeedback(text: string, tone: 'good' | 'neutral' | 'bad') {
    this.setUI({ feedback: { text, tone } });
  }

  // ---------- objectives ----------
  objective(id: string) {
    const run = this.state.run;
    const def = this.mission;
    if (!run || !def) return;
    const o = run.objectives[id];
    if (!o || o.done) return;
    const od = def.objectives.find((x) => x.id === id);
    if (od?.dependsOn?.some((d) => !run.objectives[d]?.done)) return;
    o.done = true;
    o.at = this.state.clock.minutes;
    this.toast(`✓ ${fmt(this, od?.label ?? id)}`, 'good');
    sfx.play('objective');
    this.emit({ type: 'objective', id });
    this.notify();
  }
  isDone(id: string) {
    return !!this.state.run?.objectives[id]?.done;
  }

  // ---------- events & challenges ----------
  emit(ev: GameEvent) {
    const def = this.mission;
    const run = this.state.run;
    if (def && run) {
      def.onEvent?.(this, ev);
      if (!this.ui.dialogue) {
        for (const ref of def.challenges) {
          if (run.challengesSeen.includes(ref.id)) continue;
          const ch = CHALLENGES[ref.id];
          if (!ch || ch.trigger !== ev.type) continue;
          if (ch.when && !ch.when(this, ev)) continue;
          const chance = ref.chance ?? 1;
          if (rollFor(this.state.seed + run.startedAt, ref.id) >= chance) {
            run.challengesSeen.push(ref.id); // rolled "no" — don't re-roll every frame
            run.flags[`skipped:${ref.id}`] = true;
            continue;
          }
          this.presentChallenge(ch);
          break;
        }
      }
    }
    this.bus.emit('game', ev);
  }

  missionHasChallenge(id: string) {
    return !!this.mission?.challenges.some((c) => c.id === id) && !this.state.run?.challengesSeen.includes(id);
  }

  presentChallenge(ch: ChallengeDef, after?: () => void) {
    const run = this.state.run;
    if (run && !run.challengesSeen.includes(ch.id)) run.challengesSeen.push(ch.id);
    this.pendingAfterChallenge = after ?? null;
    const p = ch.prompt(this);
    sfx.play('alert');
    this.say([
      {
        speaker: p.speaker,
        portrait: p.portrait,
        text: p.text,
        choices: ch.options
          .filter((o) => !o.available || o.available(this))
          .map((o) => ({
            label: o.label,
            hint: o.hint,
            tone: o.tone,
            run: () => {
              const fb = o.apply(this);
              for (const [k, v] of Object.entries(o.skills ?? {})) this.skill(k as SkillId, v as number);
              this.log(`${ch.title}: ${o.label}`, fb, o.tone);
              this.showFeedback(fb, o.tone);
              const next = this.pendingAfterChallenge;
              this.pendingAfterChallenge = null;
              next?.();
            },
          })),
      },
    ]);
  }

  // ---------- missions ----------
  availableMissions() {
    return MISSIONS.map((m) => ({ def: m, avail: m.available ? m.available(this.state) : { ok: true } }));
  }

  defaultAssigner(def: MissionDef): FamilyMember | undefined {
    return this.memberByRole(...def.assignerRoles) ?? this.memberByRole(...GUARDIAN_ROLES);
  }

  offerMission(missionId: string, assignerId?: string, assignmentId?: string) {
    const def = getMission(missionId);
    if (!def) return;
    if (this.state.run) {
      this.toast('Finish your current task first (or abandon it from the pause menu).', 'bad');
      return;
    }
    const a = assignerId ?? this.defaultAssigner(def)?.id ?? 'player';
    this.openModal({ type: 'briefing', missionId, assignerId: a, assignmentId });
  }

  acceptMission(missionId: string, assignerId: string, assignmentId?: string) {
    const def = getMission(missionId);
    if (!def) return;
    const { rewind: _old, ...rest } = this.state;
    this.runSnapshot = JSON.stringify(rest);
    this.state.rewind = this.runSnapshot;
    const asg = assignmentId ? this.state.assignments.find((x) => x.id === assignmentId) : undefined;
    const budget = asg?.budget ?? def.budget ?? null;
    const deadlineMin = asg?.deadlineMinutes ?? def.deadlineMinutes ?? null;
    const now = this.state.clock.minutes;
    this.state.run = {
      missionId,
      assignmentId,
      assignerId,
      status: 'in-progress',
      startedAt: now,
      deadlineAt: deadlineMin !== null ? now + deadlineMin : null,
      budget,
      cashGiven: 0,
      spent: 0,
      objectives: Object.fromEntries(def.objectives.map((o) => [o.id, { done: false }])),
      flags: {},
      decisions: [],
      challengesSeen: [],
    };
    if (asg) asg.status = 'in-progress';
    this.ui = { ...this.ui, modal: null };
    if (budget) {
      this.state.run.cashGiven = budget;
      this.give(budget, `Cash from ${this.member(assignerId)?.name ?? 'family'} for "${def.title}"`);
      this.toast(`Received ${formatMoney(budget)} for the task`, 'good');
    }
    def.onStart?.(this);
    const first = def.objectives[0];
    if (first?.type === 'talk') this.objective(first.id);
    sfx.play('start');
    this.notify();
    this.save('Mission started — saved');
  }

  restartMission() {
    if (!this.runSnapshot) return;
    const snap = JSON.parse(this.runSnapshot) as GameState;
    const pending = this.state.run ?? null;
    const missionId = pending?.missionId;
    const assignerId = pending?.assignerId;
    const assignmentId = pending?.assignmentId;
    this.state = snap;
    this.ui = { ...this.ui, modal: null, dialogue: null, waiting: false };
    this.bus.emit('scene', { goto: snap.location });
    if (missionId && assignerId) this.acceptMission(missionId, assignerId, assignmentId);
    this.notify();
  }

  retryFromResult(result: MissionResult) {
    if (!this.runSnapshot) return;
    const snap = JSON.parse(this.runSnapshot) as GameState;
    // keep earned progress history but rewind the world
    snap.results = this.state.results;
    snap.stats = this.state.stats;
    this.state = snap;
    this.ui = { ...this.ui, modal: null, dialogue: null, waiting: false };
    this.bus.emit('scene', { goto: snap.location });
    const asg = result.assignmentId;
    this.acceptMission(result.missionId, this.defaultAssigner(getMission(result.missionId)!)?.id ?? 'player', asg);
  }

  finishMission(forced?: Outcome) {
    const run = this.state.run;
    const def = this.mission;
    if (!run || !def) return;
    const ev = def.evaluate(this, forced);
    const dims = Object.values(ev.scores).filter((x): x is number => typeof x === 'number');
    const overall = dims.length ? Math.round(dims.reduce((a, b) => a + b, 0) / dims.length) : 0;
    const mult = ev.outcome === 'completed' ? 1 : ev.outcome === 'completed-late' ? 0.75 : 0.35;
    const xp = Math.round(def.rewards.xp * mult * (0.5 + overall / 200));
    const skillShare = Math.max(1, Math.round(xp / def.skills.length));
    def.skills.forEach((s) => this.skill(s, skillShare));
    this.state.stats.xp += xp;
    let badge: string | undefined;
    if (def.rewards.badge && ev.outcome === 'completed' && overall >= 70 && !this.state.stats.badges.includes(def.rewards.badge)) {
      badge = def.rewards.badge;
      this.state.stats.badges.push(badge);
    }
    const result: MissionResult = {
      id: `r-${Date.now()}-${this.state.results.length}-${Math.floor(Math.random() * 1e6)}`,
      missionId: def.id,
      assignmentId: run.assignmentId,
      title: def.title,
      outcome: ev.outcome,
      scores: ev.scores,
      overall,
      xp,
      skillsPracticed: def.skills,
      objectivesDone: def.objectives.filter((o) => run.objectives[o.id]?.done).map((o) => fmt(this, o.label)),
      objectivesMissed: def.objectives
        .filter((o) => !run.objectives[o.id]?.done)
        .map((o) => fmt(this, o.label) + (o.required || /\(optional\)$/.test(o.label) ? '' : ' (optional)')),
      moneySpent: run.spent,
      budget: run.budget,
      timeUsed: this.state.clock.minutes - run.startedAt,
      challenges: run.challengesSeen.filter((c) => !run.flags[`skipped:${c}`]).map((c) => CHALLENGES[c]?.title ?? c),
      decisions: run.decisions,
      feedback: ev.feedback,
      badge,
      finishedAt: this.state.clock.minutes,
      day: this.state.clock.day,
    };
    if (run.assignmentId) {
      const a = this.state.assignments.find((x) => x.id === run.assignmentId);
      if (a) {
        a.status = ev.outcome === 'incomplete' ? 'incomplete' : 'completed';
        a.resultId = result.id;
      }
    }
    this.state.results = [result, ...this.state.results].slice(0, 30);
    this.state.run = null;
    this.state.hands = [];
    delete this.state.world['carryingByHand'];
    this.ui = { ...this.ui, modal: { type: 'results', resultId: result.id }, dialogue: null, waiting: false };
    sfx.play(ev.outcome === 'incomplete' ? 'fail' : 'win');
    this.notify();
    this.save('Result saved');
  }

  abandonMission() {
    if (!this.state.run) return;
    this.log('You stopped the task before finishing.', 'Stopping is okay — try again with a new plan.', 'neutral');
    this.finishMission('incomplete');
  }

  // ---------- parent assignments ----------
  assign(a: Omit<Assignment, 'id' | 'status' | 'createdAt'>) {
    const asg: Assignment = { ...a, id: `a-${Date.now()}`, status: 'assigned', createdAt: this.state.clock.minutes };
    this.state.assignments = [asg, ...this.state.assignments];
    this.notify();
    this.save('Assignment saved');
    return asg;
  }
  cancelAssignment(id: string) {
    const a = this.state.assignments.find((x) => x.id === id);
    if (a && a.status === 'assigned') a.status = 'cancelled';
    this.notify();
    this.save();
  }
  pendingAssignmentFrom(memberId: string): Assignment | undefined {
    return this.state.assignments.find((a) => a.assignedBy === memberId && a.status === 'assigned' && a.assignedTo === 'player');
  }

  // ---------- world interaction ----------
  travel(to: LocationId) {
    const from = this.state.location;
    if (from === to) return;
    this.state.location = to;
    this.ensureQueue(to);
    const fromQ = QUEUE_FOR[from];
    if (fromQ && this.state.inQueue && this.state.queues[fromQ]) {
      this.state.queues[fromQ] = leaveQueue(this.state.queues[fromQ]);
      this.state.inQueue = false;
    }
    if (from === 'grocery' && Object.keys(this.state.basket).length) {
      // walking out with an unpaid basket: the helper puts items back
      this.state.basket = {};
      this.toast('You left your unpaid basket at the entrance.', 'neutral');
    }
    this.spendTime(1);
    this.emit({ type: 'location', to });
    this.notify();
    this.save('Autosaved');
  }

  interact(target: string, flavor?: string) {
    if (this.blocking) return;
    const def = this.mission;
    if (def?.onInteract?.(this, target)) return;
    this.emit({ type: 'interact', target });
    if (this.ui.dialogue) return; // a challenge took over
    if (target.startsWith('npc:')) return this.talkTo(target.slice(4));
    if (target.startsWith('shelf-')) return this.openModal({ type: 'shelf', shelfId: target });
    switch (target) {
      case 'kiosk':
        return this.say([{ speaker: NPC_LOOKS.sharma.name, portrait: 'npc:sharma', text: 'Namaste! Prices are on the board. What do you need?' }], () =>
          this.openModal({ type: 'shelf', shelfId: 'kiosk' }),
        );
      case 'checkout':
        return this.checkoutInteract();
      case 'fridge':
        return this.snack();
      case 'hook-bag':
        return this.toggleGear('cloth-bag', 'You take the cloth shopping bag.', 'You hang the cloth bag back on the hook.');
      case 'hook-umbrella':
        return this.toggleGear('umbrella', 'You take the umbrella. Just in case.', 'You put the umbrella back.');
      case 'notice-board':
        return this.openModal({ type: 'board' });
      case 'bed':
        return this.bedInteract();
      case 'bus-stop': {
        const now = this.state.clock.minutes;
        const next = Math.ceil(now / 20) * 20;
        return this.say([{ speaker: 'Bus timetable', text: `Route 12 → City Centre. Every 20 minutes. Next bus: ${formatClock(next)} (in ${Math.round(next - now)} min). Planning ahead saves waiting!` }]);
      }
      case 'reception':
        return this.say([{ speaker: NPC_LOOKS.receptionist.name, portrait: 'npc:receptionist', text: 'Good evening! Evening OPD runs 5–8 PM. There is no appointment booked for your family today.' }]);
      case 'stocker':
        return this.say([{ speaker: NPC_LOOKS.stocker.name, portrait: 'npc:stocker', text: 'Need help? Dairy is in the fridge on the left, vegetables in the middle, snacks on the right. Checkout is at the front.' }]);
      default:
        if (flavor) this.say([{ speaker: '', text: flavor }]);
    }
  }

  talkTo(memberId: string) {
    const m = this.member(memberId);
    if (!m) {
      const npc = NPC_LOOKS[memberId];
      if (npc) this.say([{ speaker: npc.name, portrait: `npc:${memberId}`, text: 'Hello there!' }]);
      return;
    }
    this.emit({ type: 'talk', memberId });
    const def = this.mission;
    if (def?.onTalk?.(this, m)) return;
    if (this.state.run) {
      return this.say([{ speaker: m.name, portrait: m.id, text: this.chatLine(m, true) }]);
    }
    const asg = this.pendingAssignmentFrom(m.id);
    if (asg) {
      return this.say(
        [{ speaker: m.name, portrait: m.id, text: asg.note ? `I've set a task for you: "${asg.note}"` : `I've set a task for you: ${getMission(asg.missionId)?.title}.` }],
        () => this.offerMission(asg.missionId, m.id, asg.id),
      );
    }
    const offers = this.availableMissions().filter(
      (x) => x.avail.ok && x.def.assignerRoles.includes(m.role) && !this.doneToday(x.def.id),
    );
    if (!offers.length) return this.say([{ speaker: m.name, portrait: m.id, text: this.chatLine(m, false) }]);
    this.say([
      {
        speaker: m.name,
        portrait: m.id,
        text: `Hi ${this.player.name}! Could you help me with something?`,
        choices: [
          ...offers.slice(0, 3).map((o) => ({ label: `${o.def.icon} ${o.def.title}`, hint: o.def.summary, run: () => this.offerMission(o.def.id, m.id) })),
          { label: 'Not right now', run: () => this.say([{ speaker: m.name, portrait: m.id, text: this.chatLine(m, false) }]) },
        ],
      },
    ]);
  }

  doneToday(missionId: string) {
    return this.state.results.some((r) => r.missionId === missionId && r.day === this.state.clock.day && r.outcome !== 'incomplete');
  }

  chatLine(m: FamilyMember, busy: boolean): string {
    if (busy) {
      const r = this.state.run!;
      if (r.assignerId === m.id) return 'How is it going? Check your journal (J) if you forget anything.';
      return m.role === 'younger-sibling' ? 'Are you on a mission? Cool! Good luck!' : "Looks like you're busy with a task. You've got this!";
    }
    const lines: Record<string, string[]> = {
      mother: ['Dinner is at 7. Thank you for helping out today.', 'Remember: a plan saves time.'],
      father: ['I read that planning your route saves time and energy. Smart people plan!', 'Good job today, champ.'],
      'younger-sibling': ['Can we play later? I have so much homework…', 'Did you know the bus comes every 20 minutes?'],
      'older-sibling': ['Pro tip: always check prices before you put things in the basket.', 'I used to forget the shopping bag all the time.'],
      grandparent: ['When I was young, we walked everywhere. Patience is a skill, beta.', 'Come sit with me when you are free.'],
      guardian: ['Thanks for being responsible today.', 'Let me know if you need anything.'],
    };
    const opts = lines[m.role] ?? ['Hello!'];
    return opts[Math.floor(this.state.clock.minutes / 7) % opts.length];
  }

  /** Phone home: ask the assigning family member for help. Costs 2 game minutes. */
  callHome() {
    if (this.blocking) return;
    const run = this.state.run;
    const def = this.mission;
    const who = run ? this.member(run.assignerId) : this.memberByRole(...GUARDIAN_ROLES);
    if (!who) return this.toast('No one to call.', 'neutral');
    if (this.state.location === 'home') return this.toast(`${who.name} is right here at home — just talk to them!`, 'info');
    this.spendTime(2, `Phone call with ${who.name}`);
    if (!run || !def) return this.say([{ speaker: who.name, portrait: who.id, text: "Hi! Everything okay? Don't stay out too late." }]);
    this.flag('calledHome', true);
    this.bump('comm', 5);
    const left = this.timeLeft();
    const next = def.objectives.find((o) => o.required && !run.objectives[o.id]?.done);
    const hint =
      def.id === 'grocery-run' && this.stockOf('shelf-dairy', 'milk-packet') <= 0 && !this.hasItem('milk-packet') && !this.hasItem('milk-tetra')
        ? "If the milk packets are sold out, a plain milk tetra pack is fine — or try Sharma uncle's kiosk."
        : next
          ? `Next step: ${next.label.replace('{assigner}', who.name)}.`
          : 'Sounds like you are almost done!';
    this.say([
      {
        speaker: who.name,
        portrait: who.id,
        text: `Hello ${this.player.name}! ${hint}${left !== null ? ` You have about ${Math.max(0, Math.round(left))} minutes left.` : ''}`,
      },
    ]);
  }

  private toggleGear(item: string, take: string, put: string) {
    if (this.hasItem(item)) {
      this.takeItem(item);
      this.toast(put, 'neutral');
    } else if (this.giveItem(item)) {
      this.toast(take, 'good');
      sfx.play('pickup');
      if (this.state.run) this.flag(`took:${item}`, true);
    }
  }

  private snack() {
    const last = Number(this.state.world['lastSnack'] ?? -999);
    if (this.state.clock.minutes - last < 30) {
      return this.say([{ speaker: '', text: "You're not hungry yet. Save the snacks for later." }]);
    }
    this.state.world['lastSnack'] = this.state.clock.minutes;
    this.state.stats.energy = Math.min(100, this.state.stats.energy + 30);
    this.spendTime(3, 'Quick snack & water');
    this.toast('Energy restored (+30)', 'good');
  }

  private bedInteract() {
    if (this.state.run) return this.say([{ speaker: '', text: "It's not bedtime yet — you have a task to finish." }]);
    this.say([
      {
        speaker: '',
        text: 'Go to sleep and start a new day? (Energy refills, new tasks become available.)',
        choices: [
          { label: 'Sleep until tomorrow', run: () => this.nextDay() },
          { label: 'Not yet', run: () => {} },
        ],
      },
    ]);
  }

  nextDay() {
    this.state.clock = { minutes: TIME_CONFIG.dayStart, day: this.state.clock.day + 1 };
    this.lastWholeMinute = Math.floor(this.state.clock.minutes);
    this.state.stats.energy = 100;
    this.state.queues = {};
    // a new day: the room gets messy again and the shop restocks
    for (const k of Object.keys(this.state.world)) if (k.startsWith('room.') || k.startsWith('stock.') || k.startsWith('bag.')) delete this.state.world[k];
    this.toast(`Day ${this.state.clock.day} — good morning... er, afternoon!`, 'info');
    this.notify();
    this.save();
  }

  // ---------- shopping ----------
  priceOf(shelfId: string, item: string): number {
    return findProduct(shelfId, item)?.price ?? 0;
  }
  stockOf(shelfId: string, item: string): number {
    const p = findProduct(shelfId, item);
    if (!p?.stockKey) return 99;
    const v = this.state.world[p.stockKey];
    return v === undefined ? 99 : Number(v);
  }
  basketShelf(item: string) {
    return GROCERY_SHELVES.find((s) => s.products.some((p) => p.item === item))?.id ?? '';
  }
  basketTotal() {
    return basketTotal(this.state.basket, (id) => this.priceOf(this.basketShelf(id), id));
  }

  addToBasket(shelfId: string, item: string) {
    if (this.stockOf(shelfId, item) <= (this.state.basket[item] ?? 0)) {
      this.toast(`${itemName(item)} is out of stock.`, 'bad');
      sfx.play('error');
      return;
    }
    this.state.basket = { ...this.state.basket, [item]: (this.state.basket[item] ?? 0) + 1 };
    this.spendTime(0.5);
    sfx.play('pickup');
    this.emit({ type: 'basket', item, qty: 1 });
    this.notify();
  }
  removeFromBasket(item: string) {
    const q = this.state.basket[item] ?? 0;
    if (!q) return;
    const b = { ...this.state.basket };
    if (q === 1) delete b[item];
    else b[item] = q - 1;
    this.state.basket = b;
    this.emit({ type: 'basket', item, qty: -1 });
    this.notify();
  }

  /** Buy directly at the kiosk (no queue). */
  buyAtKiosk(item: string) {
    const p = KIOSK_SHELF.products.find((x) => x.item === item);
    if (!p) return;
    if (this.stockOf('kiosk', item) <= 0) return this.toast('Sold out here too.', 'bad');
    if (!this.pay(p.price, `Sharma Store: ${itemName(item)}`)) {
      sfx.play('error');
      return this.toast(`Not enough money (need ${formatMoney(p.price)}).`, 'bad');
    }
    if (!this.giveItem(item)) {
      this.give(p.price, 'Refund (could not carry)');
      return;
    }
    if (p.stockKey) this.state.world[p.stockKey] = this.stockOf('kiosk', item) - 1;
    this.state.receipts.push({ at: this.state.clock.minutes, store: 'Sharma General Store', lines: [{ id: item, name: itemName(item), qty: 1, price: p.price }], total: p.price });
    this.spendTime(1);
    this.toast(`Bought ${itemName(item)} for ${formatMoney(p.price)}`, 'good');
    this.emit({ type: 'purchased', store: 'kiosk', items: { [item]: 1 } });
  }

  // ---------- queue ----------
  get queue(): QueueState | null {
    const id = QUEUE_FOR[this.state.location];
    return id ? this.state.queues[id] ?? null : null;
  }
  set queue(q: QueueState | null) {
    const id = QUEUE_FOR[this.state.location];
    if (id && q) this.state.queues[id] = q;
  }

  ensureQueue(loc: LocationId) {
    const id = QUEUE_FOR[loc];
    if (!id) return;
    const day = this.state.clock.day;
    if (this.state.queues[id] && this.state.world[`queueDay.${id}`] === day) {
      // evening rush: when you walk in, the line has refilled to a realistic length
      const q = this.state.queues[id];
      const hour = (this.state.clock.minutes % 1440) / 60;
      const minLen = loc === 'grocery' ? (hour >= 17 && hour < 20 ? 5 : 3) : 3;
      const npcs = q.customers.filter((c) => !c.isPlayer).length;
      if (!this.state.inQueue && npcs < minLen) {
        const extra = Array.from({ length: minLen - npcs }, (_, i) => this.makeCustomer(q.served + q.customers.length + i));
        this.state.queues[id] = { ...q, customers: [...q.customers, ...extra.map((c) => ({ ...c, waited: 0 }))] };
      }
      return;
    }
    this.state.world[`queueDay.${id}`] = day;
    const r = (k: string) => rollFor(this.state.seed + day, id + k);
    const clinic = loc === 'clinic';
    const customers = Array.from({ length: clinic ? 4 : 5 }, (_, i) => ({
      id: `${id}-c${i}`,
      name: clinic ? CLINIC_NAMES[i] : QUEUE_NAMES[i],
      serviceMinutes: (clinic ? 3 : 2) + Math.floor(r(`svc${i}`) * 4),
      patience: !clinic && i === 3 ? 7 : undefined,
      look: i,
    }));
    this.state.queues[id] = createQueue(id, customers, { joinEvery: clinic ? 8 : 5, keepPositionOnLeave: clinic });
  }

  private customerSeq = 0;
  private makeCustomer = (n: number) => ({
    id: `c${n}-${Math.floor(this.state.clock.minutes)}-${this.customerSeq}`,
    name: QUEUE_NAMES[this.customerSeq++ % QUEUE_NAMES.length],
    serviceMinutes: 2 + (n % 3),
    look: n,
  });

  private progressQueue(minutes: number) {
    const current = QUEUE_FOR[this.state.location];
    let changed = false;
    for (const [id, q] of Object.entries(this.state.queues)) {
      const t = advanceQueue(q, minutes, this.makeCustomer);
      this.state.queues[id] = t.queue;
      if (t.served.length || t.left.length || t.joined.length) changed = true;
      if (id !== current || !this.state.inQueue) continue;
      if (t.served.length) this.emit({ type: 'queue-served', count: t.queue.served });
      t.left.forEach((c) => this.toast(`${c.name} gave up and left the queue.`, 'neutral'));
      if (t.playerAtFront && this.ui.waiting) {
        this.ui = { ...this.ui, waiting: false };
        this.toast("It's your turn at the counter!", 'good');
        sfx.play('objective');
        setTimeout(() => this.counterTurn(), 50);
      }
    }
    if (changed) this.notify();
  }

  /** The player reached the front of the current queue. */
  counterTurn() {
    if (this.state.location === 'grocery') return this.checkoutInteract();
    this.interact('reception');
  }

  queueInfo() {
    const q = this.queue;
    if (!q) return null;
    const idx = playerIndex(q);
    return { ahead: idx < 0 ? q.customers.length : idx, wait: estimateWait(q), length: q.customers.length, inQueue: idx >= 0 };
  }

  checkoutInteract() {
    if (this.blocking && !this.state.inQueue) return;
    const cashier = { speaker: NPC_LOOKS.cashier.name, portrait: 'npc:cashier' };
    const q = this.queue;
    if (!q) return;
    if (!Object.keys(this.state.basket).length) {
      return this.say([{ ...cashier, text: "Your basket is empty. Pick up what you need from the shelves first, then join the line." }]);
    }
    const idx = playerIndex(q);
    if (idx < 0) {
      const info = this.queueInfo()!;
      return this.say([
        {
          ...cashier,
          text:
            info.ahead === 0
              ? 'No one is waiting — come right up!'
              : `There are ${info.ahead} people in line. Estimated wait: about ${formatDuration(info.wait)}. Each customer takes a few minutes to pay.`,
          choices: [
            { label: info.ahead === 0 ? 'Go to the counter' : 'Join the queue', tone: 'good', run: () => this.queueJoin() },
            { label: 'Review my shopping list first', run: () => this.openModal({ type: 'journal' }) },
            { label: 'Not yet — keep shopping', run: () => {} },
          ],
        },
      ]);
    }
    if (idx > 0) {
      return this.toast(`${idx} ahead of you. Use "Wait" to let time pass.`, 'info');
    }
    this.beginPayment();
  }

  queueJoin() {
    if (!this.queue) return;
    this.queue = joinQueue(this.queue, { id: 'player', name: this.player.name, serviceMinutes: 2 });
    this.state.inQueue = true;
    this.state.world['queueJoinedAt'] = this.state.clock.minutes;
    this.emit({ type: 'queue-joined' });
    if (playerIndex(this.queue!) === 0 && !this.ui.dialogue) setTimeout(() => this.counterTurn(), 50);
    this.notify();
  }

  queueWait(on: boolean) {
    this.setUI({ waiting: on });
  }

  queueLeave() {
    if (!this.queue) return;
    this.queue = leaveQueue(this.queue);
    this.state.inQueue = false;
    this.ui = { ...this.ui, waiting: false };
    this.log('You left the queue.', this.queue!.keepPositionOnLeave ? 'Your place was saved.' : 'You lost your place but kept your basket.', 'neutral');
    this.toast(this.state.location === 'grocery' ? 'You left the queue. Your basket is safe.' : 'You left the queue.', 'neutral');
    this.notify();
  }

  private beginPayment() {
    const cashier = { speaker: NPC_LOOKS.cashier.name, portrait: 'npc:cashier' };
    // bag challenge before payment (memory/planning)
    const bagCh = CHALLENGES['bag-fee'];
    if (!this.hasItem('cloth-bag') && !this.state.world['bagDecided'] && bagCh) {
      this.state.world['bagDecided'] = true;
      return this.presentChallenge(bagCh, () => this.beginPayment());
    }
    const extra = Number(this.state.world['bagFee'] ?? 0);
    const total = this.basketTotal() + extra;
    const run = this.state.run;
    const budgetLeft = run?.budget != null ? run.budget - run.spent : null;
    const lines = Object.entries(this.state.basket)
      .map(([id, q]) => `${q}× ${itemName(id)} — ${formatMoney(this.priceOf(this.basketShelf(id), id) * q)}`)
      .join('\n');
    const overBudget = budgetLeft !== null && total > budgetLeft;
    const cantAfford = total > this.state.wallet.balance;
    const choices: DialogueChoice[] = [];
    if (!cantAfford)
      choices.push({
        label: overBudget ? `Pay ${formatMoney(total)} anyway (uses your own pocket money)` : `Pay ${formatMoney(total)}`,
        tone: overBudget ? 'bad' : 'good',
        run: () => this.completePayment(total, extra, overBudget),
      });
    choices.push({ label: 'Remove some items', tone: overBudget || cantAfford ? 'good' : 'neutral', run: () => this.openModal({ type: 'shelf', shelfId: 'basket' }) });
    choices.push({ label: 'Leave the queue', run: () => this.queueLeave() });
    this.say([
      {
        ...cashier,
        text:
          `Let me scan these…\n${lines}${extra ? `\nBag — ${formatMoney(extra)}` : ''}\nTotal: ${formatMoney(total)}.` +
          (cantAfford
            ? `\n\nYou only have ${formatMoney(this.state.wallet.balance)}.`
            : overBudget
              ? `\n\n⚠ That's ${formatMoney(total - budgetLeft!)} over your ${formatMoney(run!.budget!)} budget.`
              : ''),
        choices,
      },
    ]);
    this.emit({ type: 'checkout' });
  }

  private completePayment(total: number, bagFee: number, overBudget: boolean) {
    if (!this.pay(total, 'FreshMart checkout')) return;
    const items = { ...this.state.basket };
    let dropped = false;
    for (const [id, q] of Object.entries(items)) {
      const r = addItem(this.state.inventory, id, q);
      if (r.ok) this.state.inventory = r.inventory;
      else dropped = true;
    }
    if (dropped) this.toast('Some items were too heavy — you left them with the cashier.', 'bad');
    this.state.receipts.push({
      at: this.state.clock.minutes,
      store: 'FreshMart',
      lines: [
        ...Object.entries(items).map(([id, q]) => ({ id, name: itemName(id), qty: q, price: this.priceOf(this.basketShelf(id), id) })),
        ...(bagFee ? [{ id: 'paper-bag', name: 'Paper bag', qty: 1, price: bagFee }] : []),
      ],
      total,
    });
    if (overBudget) this.log('You paid more than the budget.', 'Your own pocket money covered the difference.', 'bad');
    this.state.basket = {};
    delete this.state.world['bagFee'];
    delete this.state.world['bagDecided'];
    if (this.queue) this.queue = completeService(this.queue);
    this.state.inQueue = false;
    this.spendTime(2);
    this.toast(`Paid ${formatMoney(total)}. Receipt saved in your journal.`, 'good');
    this.emit({ type: 'purchased', store: 'grocery', items });
    this.notify();
  }
}

export const store = new GameStore();
// Handy for debugging and browser automation in dev.
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).__lq = store;
