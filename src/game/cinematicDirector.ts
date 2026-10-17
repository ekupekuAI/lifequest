// Cinematic director: watches the game (bus events, store state, rewind checkpoints) and adds
// tasteful dramatic beats on top — without any system having to know about it. All effects go
// through cinematic.ts, which no-ops between scenes and honours reduced motion.
import Phaser from 'phaser';
import { store } from '../core/store';
import { onCheckpoint, rewindPhase, type Checkpoint } from '../core/rewind';
import type { Memory } from '../domain/types';
import {
  cinematicScene,
  flash,
  freezeFrame,
  letterboxFor,
  punchZoom,
  shake,
  slowMo,
  speedLines,
  sting,
  vignettePulse,
} from './cinematic';

let started = false;
let lastBeat = 0;
let lastRewindEnd = 0;
const now = () => performance.now();

/** Shocking "plot" challenges get the full punch-zoom treatment. */
const PUNCH_CHALLENGES = new Set(['stock-out-milk', 'wrong-bus', 'queue-cutter', 'missing-document', 'locked-out', 'bus-delayed', 'wrong-change']);
const PRAISE: Memory['kind'][] = ['kind', 'responsible', 'honest', 'thrifty', 'helpful', 'brave'];

/** Run `fn` unless another beat fired in the last `gap` ms (avoids effect pile-ups). */
function beat(fn: () => void, gap = 280) {
  const t = now();
  if (t - lastBeat < gap) return;
  lastBeat = t;
  try {
    fn();
  } catch (e) {
    console.warn('cinematic beat', e);
  }
}

function onChallenge(cp: Checkpoint) {
  if (cp.kind !== 'challenge') return;
  if (rewindPhase.get().active) return;
  // the same choice shown again right after a rewind: a "you're back" reveal instead of a shock
  if (now() - lastRewindEnd < 1500) {
    beat(() => {
      vignettePulse(0x6fd3ff, 900, 0.45);
      flash(0xbfe9ff, 160);
    });
    return;
  }
  if (PUNCH_CHALLENGES.has(cp.challengeId)) {
    // presentChallenge already plays the alert blip: visuals only
    beat(() => {
      punchZoom(1.32, 440);
      speedLines(620);
      shake(0.005, 220);
      letterboxFor(1300);
    });
  } else {
    beat(() => {
      letterboxFor(1100, 220);
      punchZoom(1.12, 380);
      vignettePulse(0x000000, 800, 0.4);
    });
  }
}

/** Little burst of sparkles around the player (mission complete). */
function sparkleBurst(count = 14) {
  const s = cinematicScene();
  if (!s || !s.textures.exists('fx:sparkle')) return;
  const p = (s as unknown as { player?: { x: number; y: number } }).player;
  if (!p) return;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 22 + Math.random() * 26;
    const img = s.add.image(p.x, p.y - 14, 'fx:sparkle').setDepth(15500).setScale(0.6 + Math.random() * 0.6);
    const start = now();
    const dur = 700 + Math.random() * 300;
    // real-time animation so the slow-mo around it doesn't stall the sparkles
    const step = () => {
      const k = (now() - start) / dur;
      if (!img.active || k >= 1) {
        s.events.off(Phaser.Scenes.Events.POST_UPDATE, step);
        img.destroy();
        return;
      }
      const e = 1 - Math.pow(1 - k, 3);
      img.setPosition(p.x + Math.cos(a) * dist * e, p.y - 14 + Math.sin(a) * dist * e - 10 * k);
      img.setAlpha(1 - k);
      img.setAngle(k * 180);
    };
    s.events.on(Phaser.Scenes.Events.POST_UPDATE, step);
  }
}

function onResult(resultId: string) {
  const r = store.state.results.find((x) => x.id === resultId);
  if (!r) return;
  lastBeat = 0;
  if (r.outcome === 'incomplete') {
    // finishMission plays the fail jingle; a slow, gentle pull-back
    beat(() => {
      punchZoom(0.9, 1300);
      vignettePulse(0x1a1f3a, 1400, 0.55);
    });
  } else {
    // finishMission plays the win jingle; add slow-mo, a white pop and sparkles
    beat(() => {
      slowMo(0.35, 1100);
      flash(0xfff3c4, 200);
      sparkleBurst(r.outcome === 'completed' ? 16 : 10);
      if (r.outcome === 'completed' && r.overall >= 85) setTimeout(() => sting('reveal'), 650);
    });
  }
}

function onPraise() {
  beat(() => {
    sting('reveal');
    vignettePulse(0xffd36b, 1000, 0.35);
  }, 600);
}

/** Road near miss (called by traffic.ts): time slows, the screen jolts and flashes. */
export function nearMiss() {
  beat(() => {
    slowMo(0.25, 700); // traffic.ts shakes the camera itself
    flash(0xffffff, 140);
    speedLines(420);
  }, 2500);
}

/** "Record scratch — yep, that's me." Available for big comedic beats (twists etc.). */
export function recordScratchMoment(caption?: string) {
  beat(() => freezeFrame(1100, caption), 1500);
}

export function startCinematicDirector() {
  if (started) return;
  started = true;

  onCheckpoint((cp) => onChallenge(cp));

  let wasRewinding = false;
  rewindPhase.subscribe(() => {
    const a = rewindPhase.get().active;
    if (wasRewinding && !a) lastRewindEnd = now();
    wasRewinding = a;
  });

  // a family member walking over to deal with something
  store.bus.on('conduct', () => {
    beat(() => {
      sting('danger');
      letterboxFor(2200, 320);
      vignettePulse(0xff3b30, 1300, 0.45);
    }, 400);
  });

  store.bus.on('game', (ev) => {
    if (ev.type !== 'objective') return;
    const def = store.mission;
    const run = store.state.run;
    if (!def || !run) return;
    // the last required step done: a small celebratory push-in
    const left = def.objectives.filter((o) => o.required && !run.objectives[o.id]?.done).length;
    if (left === 0) beat(() => punchZoom(1.08, 360));
  });

  // state observation: task start, results, family memories
  let runKey: string | null = store.state.run ? `${store.state.run.missionId}@${store.state.run.startedAt}` : null;
  let resultShown: string | null = store.ui.modal?.type === 'results' ? store.ui.modal.resultId : null;
  let memIds = new Set((store.state.memories ?? []).map((x) => x.id));
  let stateRef = store.state;
  store.subscribe(() => {
    const st = store.state;
    const swapped = st !== stateRef; // new game / continue / rewind replaced the whole state
    stateRef = st;
    const key = st.run ? `${st.run.missionId}@${st.run.startedAt}` : null;
    if (key && key !== runKey && !swapped && !rewindPhase.get().active) beat(() => letterboxFor(1000, 260));
    runKey = key;

    const m = store.ui.modal;
    const rid = m?.type === 'results' ? m.resultId : null;
    if (rid && rid !== resultShown) onResult(rid);
    resultShown = rid;

    const mems = st.memories ?? [];
    if (!swapped && mems.some((x) => !memIds.has(x.id))) {
      const praise = mems.some((x) => !memIds.has(x.id) && PRAISE.includes(x.kind));
      // memories are written while the results screen opens: let that beat land first
      if (praise) setTimeout(onPraise, rid ? 1400 : 0);
    }
    memIds = new Set(mems.map((x) => x.id));
  });
}
