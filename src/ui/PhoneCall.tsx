// In-game phone for family voice messages: incoming-call overlay (ring → answer → listen,
// replay, reply, hang up), missed calls, and the "Phone" inbox panel opened from the HUD.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { store, type Modal } from '../core/store';
import { voice } from '../core/voice';
import { GUARDIAN_ROLES } from '../domain/types';
import { currentSession, sendVoiceMessage, type FamilyMessage } from '../services/family';
import { RING_MS, calls, formatVoiceDuration, isVoice, markVoiceSeen, silentWavDataUri, waveBars, type CallSnapshot, type InboxItem } from '../core/voiceMsg';
import { Portrait } from './art';
import VoiceRecorder, { VoicePlayer, voiceError, voiceUrls } from './VoiceRecorder';
import './voiceMsg.css';

// ---------------------------------------------------------------------------
// store glue: a pseudo-modal keeps store.blocking true (game time + movement pause)
// while a call or the phone panel is open. ModalRouter renders nothing for it.
// ---------------------------------------------------------------------------

export const PHONE_MODAL_TYPE = 'phone';
const PHONE_MODAL: Modal = { type: 'phone' };
let prevModal: Modal | null = null;

export function isPhoneModal(m: Modal | null | undefined): boolean {
  return !!m && (m as { type: string }).type === PHONE_MODAL_TYPE;
}
function holdGame() {
  const cur = store.ui.modal;
  if (isPhoneModal(cur)) return;
  prevModal = cur;
  store.setUI({ modal: PHONE_MODAL, feedback: null, prompt: null });
}
function releaseGame() {
  if (calls.getSnapshot().current?.phase === 'active' || calls.getSnapshot().inboxOpen) return;
  if (isPhoneModal(store.ui.modal)) store.setUI({ modal: prevModal });
  prevModal = null;
}

const markSeen = (at = Date.now()) => markVoiceSeen(currentSession()?.memberId, at);

/** Direct URLs are only accepted in dev (for the fake-call hook); real clips use signed URLs. */
function resolveUrl(path: string): Promise<string> {
  if (import.meta.env.DEV && /^(data:|blob:|https?:)/.test(path)) return Promise.resolve(path);
  return voiceUrls.get(path);
}
function peekUrl(path: string): string | null {
  if (import.meta.env.DEV && /^(data:|blob:|https?:)/.test(path)) return path;
  return voiceUrls.peek(path);
}

// ---------------------------------------------------------------------------
// ringtone (own WebAudio, gentle two-tone trill)
// ---------------------------------------------------------------------------

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const ringer = {
  ctx: null as AudioContext | null,
  timer: 0,
  ring() {
    if (!store.ui.sound) return;
    try {
      const AC: typeof AudioContext | undefined = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx ??= new AC();
      const ctx = this.ctx;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const t0 = ctx.currentTime + 0.02;
      for (let burst = 0; burst < 2; burst++) {
        for (let i = 0; i < 8; i++) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = i % 2 ? 988 : 784;
          const t = t0 + burst * 0.75 + i * 0.065;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.05, t + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
          o.connect(g).connect(ctx.destination);
          o.start(t);
          o.stop(t + 0.07);
        }
      }
    } catch {
      /* audio unavailable */
    }
    if (!reducedMotion()) {
      try {
        navigator.vibrate?.([250, 120, 250]);
      } catch {
        /* no vibration */
      }
    }
  },
  start() {
    this.stop();
    this.ring();
    this.timer = window.setInterval(() => this.ring(), 3000);
  },
  stop() {
    window.clearInterval(this.timer);
    this.timer = 0;
  },
};

// ---------------------------------------------------------------------------
// call audio — one shared element, unlocked inside the Answer tap (iOS)
// ---------------------------------------------------------------------------

let callAudio: HTMLAudioElement | null = null;
function audioEl(): HTMLAudioElement {
  callAudio ??= new Audio();
  callAudio.preload = 'auto';
  return callAudio;
}
function stopCallAudio() {
  if (!callAudio) return;
  try {
    callAudio.pause();
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// public actions (HUD, GameScreen, familySync, dev hook)
// ---------------------------------------------------------------------------

export function useCallSnap(): CallSnapshot {
  return useSyncExternalStore(calls.subscribe, calls.getSnapshot, calls.getSnapshot);
}


export function openVoiceInbox() {
  calls.setInboxOpen(true);
  markSeen();
  for (const i of calls.getSnapshot().inbox) if (i.missed && !i.heard) calls.markHeard(i.msg.id);
  holdGame();
}
export function closeVoiceInbox() {
  calls.setInboxOpen(false);
  releaseGame();
}

/** Esc in the game: hang up / close the phone / decline a ringing call. Returns true if handled. */
export function phoneEscape(): boolean {
  const s = calls.getSnapshot();
  if (s.current?.phase === 'active') {
    hangUp();
    return true;
  }
  if (s.inboxOpen) {
    closeVoiceInbox();
    return true;
  }
  if (s.current?.phase === 'ringing') {
    decline();
    return true;
  }
  return false;
}

function hangUp() {
  stopCallAudio();
  calls.hangUp();
  releaseGame();
}
function decline() {
  calls.miss();
  releaseGame();
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Dev hook: window.__lqVoice.ring() shows an incoming call with a generated test tone.
  (window as unknown as { __lqVoice: unknown }).__lqVoice = {
    calls,
    ring(over: Partial<FamilyMessage> = {}) {
      const mother = store.memberByRole(...GUARDIAN_ROLES);
      return calls.incoming({
        id: `dev-${Date.now()}`,
        fromGameMemberId: mother?.id ?? 'mother-0',
        fromName: mother?.name ?? 'Mum',
        toGameMemberId: null,
        text: '🎤 Voice message (3 s)',
        createdAt: new Date().toISOString(),
        audioPath: testToneDataUri(),
        durationMs: 3000,
        ...over,
      });
    },
    inbox: openVoiceInbox,
    /** show the send-a-note recorder in the phone panel without a family session (sending fails safely) */
    demoRecorder: false,
  };
}

/** 3 s gentle sine "voice" stand-in for the dev hook. */
function testToneDataUri(): string {
  const rate = 8000;
  const n = rate * 3;
  const bytes = new Uint8Array(44 + n * 2);
  const dv = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const v = Math.sin(2 * Math.PI * (220 + 40 * Math.sin(t * 3)) * t) * 0.25 * Math.min(1, t * 8, (3 - t) * 8);
    dv.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

// ---------------------------------------------------------------------------
// components
// ---------------------------------------------------------------------------

function callerName(m: FamilyMessage): string {
  return store.member(m.fromGameMemberId)?.name ?? m.fromName ?? 'Family';
}

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export default function PhoneCall() {
  const snap = useCallSnap();
  const cur = snap.current;

  // ring + timeout while a call is ringing
  const ringingId = cur?.phase === 'ringing' ? cur.msg.id : null;
  useEffect(() => {
    if (!ringingId) return;
    // prefetch the signed URL so Answer can start playback inside the tap (iOS)
    if (cur && isVoice(cur.msg)) void resolveUrl(cur.msg.audioPath).catch(() => {});
    ringer.start();
    const t = window.setInterval(() => {
      if (calls.tick()) store.toast(`📞 Missed call — open the phone to listen.`, 'info');
    }, 500);
    return () => {
      ringer.stop();
      window.clearInterval(t);
    };
  }, [ringingId]);

  useEffect(() => () => {
    ringer.stop();
    stopCallAudio();
  }, []);

  return (
    <>
      {cur?.phase === 'ringing' && <Ringing key={cur.msg.id} msg={cur.msg} since={cur.since} queued={snap.queued} />}
      {cur?.phase === 'active' && <ActiveCall key={cur.msg.id} msg={cur.msg} queued={snap.queued} />}
      {snap.inboxOpen && !cur && <Inbox items={snap.inbox} />}
    </>
  );
}

function Ringing({ msg, since, queued }: { msg: FamilyMessage & { audioPath: string }; since: number; queued: number }) {
  const name = callerName(msg);
  const [left, setLeft] = useState(RING_MS);
  useEffect(() => {
    const t = window.setInterval(() => setLeft(Math.max(0, RING_MS - (Date.now() - since))), 1000);
    return () => window.clearInterval(t);
  }, [since]);

  function answer() {
    // everything that starts sound happens synchronously inside this tap (iOS)
    ringer.stop();
    try {
      voice.stop();
    } catch {
      /* voice engine unavailable */
    }
    const a = audioEl();
    const url = peekUrl(msg.audioPath);
    a.currentTime = 0;
    if (url) {
      a.src = url;
      a.dataset.pending = '';
    } else {
      a.src = silentWavDataUri();
      a.dataset.pending = '1';
    }
    a.play().catch(() => {});
    calls.answer();
    markSeen(Date.parse(msg.createdAt) || Date.now());
    holdGame();
  }

  return (
    <section className="pc-ring panel" role="alertdialog" aria-live="assertive" aria-label={`${name} is calling`}>
      <div className="pc-ring-portrait" aria-hidden>
        <Portrait id={msg.fromGameMemberId} size={56} alt={name} />
      </div>
      <div className="pc-ring-text">
        <span className="pc-ring-title">📞 {name} is calling…</span>
        <span className="tiny muted">
          Voice message · {formatVoiceDuration(msg.durationMs ?? 0)}
          {queued > 0 && ` · ${queued} more waiting`} · {Math.ceil(left / 1000)} s
        </span>
      </div>
      <div className="pc-ring-btns">
        <button type="button" className="pc-round decline" onClick={decline} aria-label="Decline call">
          <span aria-hidden>✕</span>
        </button>
        <button type="button" className="pc-round answer" onClick={answer} aria-label={`Answer ${name}`} autoFocus>
          <span aria-hidden>📞</span>
        </button>
      </div>
    </section>
  );
}

function ActiveCall({ msg, queued }: { msg: FamilyMessage & { audioPath: string }; queued: number }) {
  const name = callerName(msg);
  const [state, setState] = useState<'loading' | 'playing' | 'paused' | 'ended' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const bars = useRef(waveBars(msg.id, 36));
  const total = (msg.durationMs ?? 0) / 1000;

  useEffect(() => {
    const a = audioEl();
    let alive = true;
    const onTime = () => {
      if (a.dataset.pending) return;
      const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : total;
      setProgress(d ? Math.min(1, a.currentTime / d) : 0);
    };
    const onPlay = () => !a.dataset.pending && setState('playing');
    const onPause = () => !a.dataset.pending && setState((s) => (s === 'ended' ? s : 'paused'));
    const onEnd = () => {
      if (a.dataset.pending) return;
      setProgress(1);
      setState('ended');
    };
    const onErr = () => {
      if (a.dataset.pending) return;
      setState('error');
      setErr("This voice note can't be played (it may have expired).");
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('playing', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnd);
    a.addEventListener('error', onErr);
    if (a.dataset.pending) {
      // the real clip's URL wasn't ready at the tap — the element is unlocked, now load + play it
      resolveUrl(msg.audioPath)
        .then((url) => {
          if (!alive) return;
          a.dataset.pending = '';
          a.src = url;
          return a.play();
        })
        .catch((e) => {
          if (!alive) return;
          a.dataset.pending = '';
          setState('error');
          setErr(voiceError(e));
        });
    } else if (!a.paused) setState('playing');
    else
      a.play().catch((e) => {
        if (!alive) return;
        setState('paused');
        setErr(voiceError(e));
      });
    return () => {
      alive = false;
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('playing', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('error', onErr);
    };
  }, [msg.audioPath, total]);

  function replay() {
    const a = audioEl();
    setErr(null);
    if (state === 'playing') {
      a.pause();
      return;
    }
    if (state === 'error' || a.dataset.pending) {
      // try again with a fresh URL
      a.dataset.pending = '';
      resolveUrl(msg.audioPath)
        .then((url) => {
          a.src = url;
          return a.play();
        })
        .catch((e) => {
          setState('error');
          setErr(voiceError(e));
        });
      return;
    }
    if (state === 'ended' || progress >= 1) a.currentTime = 0;
    a.play().catch((e) => setErr(voiceError(e)));
  }

  const n = bars.current.length;
  return (
    <div className="pc-backdrop" role="presentation">
      <section className="pc-call panel" role="dialog" aria-modal="true" aria-label={`Call with ${name}`}>
        <div className={`pc-call-portrait ${state === 'playing' ? 'talking' : ''}`}>
          <Portrait id={msg.fromGameMemberId} size={96} alt={name} />
        </div>
        <span className="pc-call-name">{name}</span>
        <span className="tiny muted">
          {state === 'loading' ? 'Connecting…' : state === 'playing' ? 'Speaking…' : state === 'ended' ? 'Message finished' : state === 'error' ? 'Problem playing' : 'Paused'} ·{' '}
          {formatVoiceDuration((msg.durationMs ?? 0) * progress)} / {formatVoiceDuration(msg.durationMs ?? 0)}
        </span>
        <div
          className="pc-wave"
          role="progressbar"
          aria-label="Voice message progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          {bars.current.map((h, i) => (
            <span key={i} className={i / n < progress ? 'on' : ''} style={{ height: `${Math.round(h * 100)}%` }} />
          ))}
        </div>
        {err && (
          <p className="vr-err" role="alert">
            {err}
          </p>
        )}
        {replying ? (
          <VoiceRecorder
            toLabel={`to ${name}`}
            onCancel={() => setReplying(false)}
            onSend={async (blob, ms) => {
              await sendVoiceMessage(msg.fromGameMemberId, blob, ms);
              store.toast(`🎤 Voice reply sent to ${name}`, 'good');
            }}
          />
        ) : (
          <div className="pc-call-btns">
            <button type="button" className="btn pc-big" onClick={replay}>
              {state === 'playing' ? '❚❚ Pause' : state === 'ended' ? '↺ Replay' : '▶ Play'}
            </button>
            {currentSession() && (
              <button
                type="button"
                className="btn btn-sky pc-big"
                onClick={() => {
                  audioEl().pause();
                  setReplying(true);
                }}
              >
                🎙️ Reply
              </button>
            )}
            <button type="button" className="btn btn-danger pc-big" onClick={hangUp} autoFocus>
              📵 Hang up
            </button>
          </div>
        )}
        {queued > 0 && <span className="tiny muted">{queued} more call{queued > 1 ? 's' : ''} waiting</span>}
      </section>
    </div>
  );
}

const devRecorder = () => import.meta.env.DEV && !!(window as unknown as { __lqVoice?: { demoRecorder?: boolean } }).__lqVoice?.demoRecorder;

function Inbox({ items }: { items: InboxItem[] }) {
  const session = currentSession();
  const parents = store.state.profile.members.filter((m) => GUARDIAN_ROLES.includes(m.role));
  const [to, setTo] = useState<string | null>(parents[0]?.id ?? null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const toName = parents.find((p) => p.id === to)?.name ?? 'your family';

  return (
    <div className="pc-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && closeVoiceInbox()}>
      <section className="pc-inbox panel" role="dialog" aria-modal="true" aria-labelledby="pc-inbox-h">
        <header className="pc-inbox-head">
          <h2 id="pc-inbox-h">📱 Phone</h2>
          <button type="button" className="icon-btn" onClick={closeVoiceInbox} aria-label="Close phone">
            ✕
          </button>
        </header>
        <button
          type="button"
          className="btn btn-primary pc-big"
          onClick={() => {
            closeVoiceInbox();
            store.callHome();
          }}
        >
          📞 Call home
        </button>

        <h3 className="label">Voice notes</h3>
        {items.length === 0 ? (
          <p className="small muted">{session ? 'No voice notes yet. When your family sends one, your phone rings.' : 'Voice notes work when this game is connected to your family (Family play on the title screen).'}</p>
        ) : (
          <ul className="pc-list">
            {items.map((i) => {
              const name = callerName(i.msg);
              return (
                <li key={i.msg.id} className={`pc-item ${i.missed ? 'missed' : ''}`}>
                  <div className="pc-item-head">
                    <Portrait id={i.msg.fromGameMemberId} size={32} alt="" />
                    <span className="grow">
                      <b>{name}</b>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {i.missed ? '📵 Missed call · ' : ''}
                        {ago(i.msg.createdAt)}
                      </span>
                    </span>
                    {session && (
                      <button type="button" className="btn btn-sm" aria-expanded={replyTo === i.msg.id} onClick={() => setReplyTo((r) => (r === i.msg.id ? null : i.msg.id))}>
                        🎙️ Reply
                      </button>
                    )}
                  </div>
                  <VoicePlayer id={i.msg.id} src={() => resolveUrl(i.msg.audioPath)} durationMs={i.msg.durationMs} label={`Voice note from ${name}`} onPlayed={() => calls.markHeard(i.msg.id)} />
                  {replyTo === i.msg.id && (
                    <VoiceRecorder
                      compact
                      toLabel={`to ${name}`}
                      onCancel={() => setReplyTo(null)}
                      onSend={async (blob, ms) => {
                        await sendVoiceMessage(i.msg.fromGameMemberId, blob, ms);
                        store.toast(`🎤 Voice reply sent to ${name}`, 'good');
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {(session || devRecorder()) && parents.length > 0 && (
          <>
            <h3 className="label">Send a voice note</h3>
            <div className="pc-to" role="radiogroup" aria-label="Send to">
              {parents.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={to === p.id} className="chip" onClick={() => setTo(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
            {to && (
              <VoiceRecorder
                key={to}
                toLabel={`to ${toName}`}
                onSend={async (blob, ms) => {
                  if (!session) throw new Error('Dev demo: this game is not connected to a family, so nothing was sent.');
                  await sendVoiceMessage(to, blob, ms);
                  store.toast(`🎤 Voice note sent to ${toName}`, 'good');
                }}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

