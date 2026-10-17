// REWIND TIME: before every meaningful decision (a challenge popping up, a task being accepted)
// the store drops a checkpoint here — a deep JSON clone of the game state plus what to show
// again. The player may rewind 3 times per game day: the VHS overlay plays, the state snaps
// back to the checkpoint and the same choice is presented again. The decision log keeps an
// honest note that time was rewound.
//
// Pure module (no Phaser / React): the store calls the capture hooks, the UI calls startRewind(),
// tests call rewindNow() which does the same thing synchronously.
import type { GameState } from '../domain/types';
import type { ChallengeDef } from '../missions/types';
import type { GameStore } from './store';

export const REWINDS_PER_DAY = 3;
export const MAX_CHECKPOINTS = 5;
/** total length of the VHS rewind effect (ms) */
export const REWIND_MS = 2000;
/** when, inside the effect, the world actually snaps back (hidden by the overlay) */
export const RESTORE_AT_MS = 1050;

export type Checkpoint =
  | (CheckpointBase & { kind: 'challenge'; challengeId: string; title: string; ch: ChallengeDef; after?: () => void })
  | (CheckpointBase & { kind: 'mission'; missionId: string; assignerId: string; assignmentId?: string; title: string });

interface CheckpointBase {
  /** JSON of GameState without the (large) mission-start rewind snapshot */
  json: string;
  day: number;
  minutes: number;
  location: GameState['location'];
  /** identity of the run this checkpoint belongs to (null = free time) */
  run: { missionId: string; startedAt: number } | null;
  /** results count at capture: a finished task in between makes the checkpoint stale */
  results: number;
  /** decisions already logged in the run at capture (so we can find what was chosen after) */
  decisions: number;
}

interface Buffer {
  checkpoints: Checkpoint[];
  /** note for the decision log after a "mission start" rewind (the run doesn't exist yet) */
  pendingNote: { missionId: string; text: string } | null;
}

const buffers = new WeakMap<GameStore, Buffer>();
const buf = (s: GameStore): Buffer => {
  let b = buffers.get(s);
  if (!b) buffers.set(s, (b = { checkpoints: [], pendingNote: null }));
  return b;
};

// ---------------------------------------------------------------- phase (for the UI / FX) ---

export interface RewindPhase {
  active: boolean;
  /** performance.now() when the effect started */
  startedAt: number;
  /** clock (game minutes) the effect spins back from → to */
  fromMinutes: number;
  toMinutes: number;
  label: string;
  /** increments on every rewind so listeners can key effects */
  seq: number;
}

let phase: RewindPhase = { active: false, startedAt: 0, fromMinutes: 0, toMinutes: 0, label: '', seq: 0 };
const listeners = new Set<() => void>();
export const rewindPhase = {
  get: () => phase,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
function setPhase(p: Partial<RewindPhase>) {
  phase = { ...phase, ...p };
  listeners.forEach((l) => l());
}
/** true while the VHS effect plays: the store treats the world as blocked (clock paused). */
export const rewinding = () => phase.active;

/** Listeners told whenever a checkpoint is captured (the cinematic director uses it for "challenge!" beats). */
type CaptureListener = (cp: Checkpoint, s: GameStore) => void;
const captureListeners = new Set<CaptureListener>();
export function onCheckpoint(fn: CaptureListener) {
  captureListeners.add(fn);
  return () => {
    captureListeners.delete(fn);
  };
}

// ---------------------------------------------------------------- capture (store hooks) ---

function snapshotJson(state: GameState): string {
  const { rewind: _bigSnapshot, ...rest } = state;
  return JSON.stringify(rest);
}

function base(s: GameStore): CheckpointBase {
  const st = s.state;
  return {
    json: snapshotJson(st),
    day: st.clock.day,
    minutes: st.clock.minutes,
    location: st.location,
    run: st.run ? { missionId: st.run.missionId, startedAt: st.run.startedAt } : null,
    results: st.results.length,
    decisions: st.run?.decisions.length ?? 0,
  };
}

function push(s: GameStore, cp: Checkpoint) {
  const b = buf(s);
  b.checkpoints.push(cp);
  if (b.checkpoints.length > MAX_CHECKPOINTS) b.checkpoints.splice(0, b.checkpoints.length - MAX_CHECKPOINTS);
  captureListeners.forEach((fn) => {
    try {
      fn(cp, s);
    } catch (e) {
      console.warn('rewind listener', e);
    }
  });
}

/** Store hook: called at the very top of presentChallenge(), before anything changes. */
export function captureChallenge(s: GameStore, ch: ChallengeDef, after?: () => void) {
  try {
    push(s, { ...base(s), kind: 'challenge', challengeId: ch.id, title: ch.title, ch, after });
  } catch (e) {
    console.warn('rewind capture', e);
  }
}

/** Store hook: called at the top of acceptMission(), before the run exists. */
export function captureMission(s: GameStore, missionId: string, assignerId: string, assignmentId: string | undefined, title: string) {
  try {
    push(s, { ...base(s), kind: 'mission', missionId, assignerId, assignmentId, title });
  } catch (e) {
    console.warn('rewind capture', e);
  }
}

/** Store hook: called in acceptMission() right after the run is created. */
export function afterAccept(s: GameStore) {
  const b = buf(s);
  const run = s.state.run;
  if (!run) return;
  // the mission checkpoint now belongs to this run
  const top = b.checkpoints[b.checkpoints.length - 1];
  if (top?.kind === 'mission' && top.missionId === run.missionId) top.run = { missionId: run.missionId, startedAt: run.startedAt };
  if (b.pendingNote && b.pendingNote.missionId === run.missionId) {
    run.decisions.push({ at: s.state.clock.minutes, text: '⏪ Rewound time', consequence: b.pendingNote.text, tone: 'neutral' });
    run.flags.rewinds = ((run.flags.rewinds as number) || 0) + 1;
  }
  b.pendingNote = null;
}

/** Store hook: new game / continue / restart — old checkpoints belong to another timeline. */
export function resetRewind(s: GameStore) {
  const b = buf(s);
  b.checkpoints = [];
  b.pendingNote = null;
}

// ---------------------------------------------------------------- queries ---

export function checkpoints(s: GameStore): readonly Checkpoint[] {
  return buf(s).checkpoints;
}

export function rewindsLeft(s: GameStore): number {
  const r = s.state.rewinds;
  const used = r && r.day === s.state.clock.day ? r.used : 0;
  return Math.max(0, REWINDS_PER_DAY - used);
}

function stillValid(s: GameStore, cp: Checkpoint): boolean {
  const st = s.state;
  if (cp.day !== st.clock.day) return false;
  if (st.results.length !== cp.results) return false; // a task finished since: that moment is history
  const run = st.run;
  if (cp.kind === 'mission') {
    // a "task start" checkpoint is only meaningful while that same task is running
    return !!run && run.missionId === cp.missionId && (!cp.run || cp.run.startedAt === run.startedAt);
  }
  if (cp.run) return !!run && run.missionId === cp.run.missionId && run.startedAt === cp.run.startedAt;
  return !run; // a free-time surprise: only before starting a task
}

/** The checkpoint a rewind would go back to (most recent valid one), or null. */
export function target(s: GameStore): Checkpoint | null {
  const cps = buf(s).checkpoints;
  for (let i = cps.length - 1; i >= 0; i--) if (stillValid(s, cps[i])) return cps[i];
  return null;
}

export function canRewind(s: GameStore): { ok: boolean; reason?: string; target?: Checkpoint } {
  if (phase.active) return { ok: false, reason: 'Already rewinding…' };
  if (s.ui.screen !== 'game') return { ok: false, reason: 'Not in the game' };
  if (s.ui.modal && s.ui.modal.type === 'results') return { ok: false, reason: 'The task is over — you can’t rewind a finished task' };
  const t = target(s);
  if (!t) {
    const any = buf(s).checkpoints.length > 0;
    return { ok: false, reason: any ? 'Nothing to rewind: that moment has already passed' : 'Nothing to rewind yet — rewind works on big choices and task starts' };
  }
  if (rewindsLeft(s) <= 0) return { ok: false, reason: 'No rewinds left today (3 per day) — they refill tomorrow' };
  return { ok: true, target: t };
}

// ---------------------------------------------------------------- the rewind itself ---

/** Restore the checkpoint (state, clock, location) and log it. Returns the checkpoint, or null. */
function restore(s: GameStore, cp: Checkpoint): void {
  const cur = s.state;
  const b = buf(s);
  // drop this checkpoint and everything after it (it is re-captured when shown again)
  const idx = b.checkpoints.indexOf(cp);
  if (idx >= 0) b.checkpoints.splice(idx);

  // what had been chosen the first time (for an honest decision log)
  let first: string | null = null;
  if (cp.kind === 'challenge' && cur.run) {
    const prefix = `${cp.title}: `;
    const hit = cur.run.decisions.slice(cp.decisions).find((d) => d.text.startsWith(prefix));
    if (hit) first = hit.text.slice(prefix.length);
  }

  const snap = JSON.parse(cp.json) as GameState;
  const day = cur.clock.day;
  const used = (cur.rewinds && cur.rewinds.day === day ? cur.rewinds.used : 0) + 1;
  const next: GameState = {
    ...snap,
    // things that don't travel back in time
    rewind: cur.rewind,
    settings: cur.settings,
    tutorialSeen: cur.tutorialSeen || snap.tutorialSeen,
    rewinds: { day, used, total: (cur.rewinds?.total ?? 0) + 1 },
  };
  const note =
    cp.kind === 'challenge'
      ? first
        ? `You rewound time and chose differently (first try: “${first}”).`
        : 'You rewound time before choosing.'
      : 'You rewound time to before this task started and took it on again.';
  if (cp.kind === 'challenge' && next.run) {
    next.run.decisions.push({ at: next.clock.minutes, text: `⏪ Rewound time: ${cp.title}`, consequence: note, tone: 'neutral' });
    next.run.flags.rewinds = ((next.run.flags.rewinds as number) || 0) + 1;
  } else if (cp.kind === 'mission') {
    b.pendingNote = { missionId: cp.missionId, text: note };
  }
  s.restoreState(next);
  if (snap.location !== cur.location) s.bus.emit('scene', { goto: snap.location });
}

/** Present the checkpoint's decision again. */
function represent(s: GameStore, cp: Checkpoint) {
  if (cp.kind === 'challenge') s.presentChallenge(cp.ch, cp.after);
  else s.openModal({ type: 'briefing', missionId: cp.missionId, assignerId: cp.assignerId, assignmentId: cp.assignmentId });
}

/** Synchronous rewind (tests, reduced-motion): restore + re-present. */
export function rewindNow(s: GameStore): { ok: boolean; reason?: string } {
  const c = canRewind(s);
  if (!c.ok || !c.target) return { ok: false, reason: c.reason };
  restore(s, c.target);
  represent(s, c.target);
  s.toast('⏪ Time rewound — choose again', 'info');
  void s.save('Rewound');
  return { ok: true };
}

let timers: ReturnType<typeof setTimeout>[] = [];
/**
 * The full VHS rewind: the overlay + in-world FX play for REWIND_MS, the world snaps back at
 * RESTORE_AT_MS (hidden by the static), then the same choice is shown again.
 */
export function startRewind(s: GameStore, opts: { instant?: boolean } = {}): { ok: boolean; reason?: string } {
  const c = canRewind(s);
  if (!c.ok || !c.target) {
    if (c.reason) s.toast(c.reason, 'bad');
    return { ok: false, reason: c.reason };
  }
  if (opts.instant) return rewindNow(s);
  const cp = c.target;
  timers.forEach(clearTimeout);
  timers = [];
  const from = s.state.clock.minutes;
  // close an open dialogue (a challenge being shown): the rewind replaces it
  s.setUI({ dialogue: null, waiting: false, prompt: null, feedback: null, modal: s.ui.modal?.type === 'reels' ? null : s.ui.modal });
  setPhase({ active: true, startedAt: now(), fromMinutes: from, toMinutes: cp.minutes, label: cp.title, seq: phase.seq + 1 });
  s.notify();
  const moved = cp.location !== s.state.location;
  timers.push(
    setTimeout(() => {
      try {
        restore(s, cp);
      } catch (e) {
        console.warn('rewind restore', e);
      }
    }, RESTORE_AT_MS),
  );
  timers.push(
    setTimeout(() => {
      setPhase({ active: false });
      s.notify();
      // a map change fades in first; give it a moment before the choice pops up again
      timers.push(
        setTimeout(() => {
          try {
            represent(s, cp);
            s.toast('⏪ Time rewound — choose again', 'info');
            void s.save('Rewound');
          } catch (e) {
            console.warn('rewind represent', e);
          }
        }, moved ? 450 : 60),
      );
    }, REWIND_MS),
  );
  return { ok: true };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** test helper: forget the in-flight effect */
export function _resetPhaseForTests() {
  timers.forEach(clearTimeout);
  timers = [];
  phase = { active: false, startedAt: 0, fromMinutes: 0, toMinutes: 0, label: '', seq: 0 };
}
