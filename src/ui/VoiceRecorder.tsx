// Reusable voice-note recorder (tap OR hold to record, 30 s cap, level meter, preview, send/cancel)
// and a small player used by the parent feed, the in-game inbox and the recorder preview.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { voiceUrl } from '../services/family';
import {
  PRIVACY_LINE,
  UrlCache,
  VOICE_MAX_BYTES,
  VOICE_MAX_MS,
  formatVoiceDuration,
  micErrorMessage,
  pickMimeType,
  recordingSupport,
  waveBars,
} from '../core/voiceMsg';
import { friendlyError } from './FamilyGate';
import './voiceMsg.css';

/** Signed URLs for voice clips, cached per audioPath (~50 min). */
export const voiceUrls = new UrlCache((p) => voiceUrl(p));

/** Friendly text for send / play failures (keeps our own clear server messages). */
export function voiceError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (/recording is empty|too large|no longer available|not in this family|write a message/i.test(msg)) return msg.replace(/^[^:]*voice message:\s*/i, '');
  if (/not allowed|notallowed|user didn't interact|gesture/i.test(msg) || (e as { name?: string })?.name === 'NotAllowedError')
    return 'Tap ▶ to play — the browser needs a tap first.';
  if (/not ?supported|decode|format/i.test(msg) || (e as { name?: string })?.name === 'NotSupportedError') return "This clip can't be played in this browser.";
  return friendlyError(e);
}

type Phase = 'idle' | 'requesting' | 'recording' | 'preview' | 'sending' | 'sent' | 'error';
const HOLD_MS = 450;

export interface VoiceRecorderProps {
  /** Upload the clip. Throw to show an error (the take is kept so they can retry). */
  onSend: (blob: Blob, durationMs: number) => Promise<void>;
  onCancel?: () => void;
  /** e.g. "to Asha" — shown on the send button */
  toLabel?: string;
  compact?: boolean;
}

export default function VoiceRecorder({ onSend, onCancel, toLabel, compact = false }: VoiceRecorderProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string; ms: number } | null>(null);
  const meterRef = useRef<HTMLSpanElement | null>(null);
  const rec = useRef<{
    stream: MediaStream | null;
    recorder: MediaRecorder | null;
    ctx: AudioContext | null;
    raf: number;
    timer: number;
    cap: number;
    startedAt: number;
    chunks: Blob[];
    pressAt: number;
    pressStarted: boolean;
    cancelled: boolean;
  }>({ stream: null, recorder: null, ctx: null, raf: 0, timer: 0, cap: 0, startedAt: 0, chunks: [], pressAt: 0, pressStarted: false, cancelled: false });
  const mounted = useRef(true);

  const support = typeof window === 'undefined' ? 'unsupported' : recordingSupport({ mediaDevices: navigator.mediaDevices, MediaRecorder: (window as { MediaRecorder?: unknown }).MediaRecorder, isSecureContext: window.isSecureContext });

  /** Stop the mic, meter and timers (keeps any finished take). */
  const release = useCallback(() => {
    const r = rec.current;
    cancelAnimationFrame(r.raf);
    window.clearInterval(r.timer);
    window.clearTimeout(r.cap);
    r.stream?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* already stopped */
      }
    });
    r.stream = null;
    if (r.ctx) void r.ctx.close().catch(() => {});
    r.ctx = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const r = rec.current;
      r.cancelled = true;
      try {
        if (r.recorder && r.recorder.state !== 'inactive') r.recorder.stop();
      } catch {
        /* ignore */
      }
      release();
    };
  }, [release]);

  useEffect(() => () => {
    if (take) URL.revokeObjectURL(take.url);
  }, [take]);

  const stop = useCallback(() => {
    const r = rec.current;
    try {
      if (r.recorder && r.recorder.state !== 'inactive') r.recorder.stop();
      else release();
    } catch {
      release();
    }
  }, [release]);

  const start = useCallback(async () => {
    if (support) {
      setErr(micErrorMessage({ name: support }));
      setPhase('error');
      return false;
    }
    setErr(null);
    setPhase('requesting');
    const r = rec.current;
    r.cancelled = false;
    r.startedAt = 0;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      if (mounted.current) {
        setErr(micErrorMessage(e));
        setPhase('error');
      }
      return false;
    }
    if (!mounted.current || r.cancelled) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    r.stream = stream;
    const MR = window.MediaRecorder;
    const mimeType = pickMimeType(MR.isTypeSupported?.bind(MR));
    let recorder: MediaRecorder;
    try {
      recorder = new MR(stream, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : { audioBitsPerSecond: 48_000 });
    } catch (e) {
      release();
      setErr(micErrorMessage(e));
      setPhase('error');
      return false;
    }
    r.recorder = recorder;
    r.chunks = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size) r.chunks.push(ev.data);
    };
    recorder.onstop = () => {
      const ms = Math.min(VOICE_MAX_MS, Math.round(performance.now() - r.startedAt));
      release();
      r.recorder = null;
      if (!mounted.current || r.cancelled) return;
      const blob = new Blob(r.chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      r.chunks = [];
      if (ms < 600 || !blob.size) {
        setErr('That was too short — hold the button a little longer, or tap once to start and again to stop.');
        setPhase('idle');
        return;
      }
      if (blob.size > VOICE_MAX_BYTES) {
        setErr('That recording is too large (max 2 MB). Try a shorter note.');
        setPhase('idle');
        return;
      }
      setTake({ blob, url: URL.createObjectURL(blob), ms });
      setElapsed(ms);
      setPhase('preview');
    };
    recorder.onerror = () => {
      release();
      if (mounted.current) {
        setErr("Recording stopped unexpectedly. Please try again.");
        setPhase('error');
      }
    };

    // level meter
    try {
      const AC: typeof AudioContext | undefined = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        r.ctx = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        const buf = new Uint8Array(an.fftSize);
        const loop = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const level = Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
          if (meterRef.current) meterRef.current.style.transform = `scaleX(${level.toFixed(3)})`;
          r.raf = requestAnimationFrame(loop);
        };
        r.raf = requestAnimationFrame(loop);
      }
    } catch {
      /* meter is optional */
    }

    recorder.start(250);
    r.startedAt = performance.now();
    setElapsed(0);
    setPhase('recording');
    r.timer = window.setInterval(() => setElapsed(performance.now() - r.startedAt), 200);
    r.cap = window.setTimeout(() => stop(), VOICE_MAX_MS);
    return true;
  }, [release, stop, support]);

  // one button: tap to start / tap to stop, or press-and-hold and let go to stop
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const r = rec.current;
    r.pressAt = performance.now();
    r.pressStarted = false;
    if (phase === 'idle' || phase === 'error') {
      r.pressStarted = true;
      void start();
    }
  };
  const onPointerUp = () => {
    const r = rec.current;
    if (phase !== 'recording' && phase !== 'requesting') return;
    if (r.pressStarted && r.startedAt && performance.now() - r.pressAt > HOLD_MS && performance.now() - r.startedAt > HOLD_MS) stop();
  };
  const onClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const r = rec.current;
    if (e.detail === 0) {
      // keyboard activation
      if (phase === 'recording') stop();
      else if (phase === 'idle' || phase === 'error') void start();
      return;
    }
    if (phase === 'recording' && !r.pressStarted) stop();
    r.pressStarted = false;
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape' && phase === 'recording') {
      e.stopPropagation();
      cancel();
    }
  };

  function cancel() {
    const r = rec.current;
    r.cancelled = true;
    stop();
    release();
    setTake(null);
    setElapsed(0);
    setErr(null);
    setPhase('idle');
    onCancel?.();
  }

  function retake() {
    setTake(null);
    setElapsed(0);
    setErr(null);
    setPhase('idle');
  }

  async function send() {
    if (!take) return;
    setPhase('sending');
    setErr(null);
    try {
      await onSend(take.blob, take.ms);
      if (!mounted.current) return;
      setTake(null);
      setPhase('sent');
      window.setTimeout(() => mounted.current && setPhase((p) => (p === 'sent' ? 'idle' : p)), 2200);
    } catch (e) {
      if (!mounted.current) return;
      setErr(voiceError(e));
      setPhase('preview');
    }
  }

  const left = Math.max(0, VOICE_MAX_MS - elapsed);
  const recording = phase === 'recording';
  return (
    <div className={`vr ${compact ? 'compact' : ''} ${recording ? 'is-rec' : ''}`} role="group" aria-label="Voice note" onKeyDown={onKeyDown}>
      {phase === 'preview' || phase === 'sending' ? (
        take && (
          <div className="vr-preview">
            <VoicePlayer id={`take-${take.ms}`} src={take.url} durationMs={take.ms} label="Your voice note" />
            <div className="vr-row">
              <button type="button" className="btn btn-ghost vr-btn" onClick={retake} disabled={phase === 'sending'}>
                ↺ Redo
              </button>
              <button type="button" className="btn btn-ghost vr-btn" onClick={cancel} disabled={phase === 'sending'}>
                ✕ Cancel
              </button>
              <button type="button" className="btn btn-good vr-btn vr-send" onClick={send} disabled={phase === 'sending'}>
                {phase === 'sending' ? 'Sending…' : `Send${toLabel ? ` ${toLabel}` : ''} ▶`}
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="vr-rec-row">
          <button
            type="button"
            className={`vr-mic ${recording ? 'on' : ''}`}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={onClick}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={recording}
            aria-label={recording ? 'Stop recording' : 'Record a voice note'}
          >
            <span aria-hidden>{recording ? '■' : '🎙️'}</span>
          </button>
          <div className="vr-status">
            {recording ? (
              <>
                <span className="vr-time" role="timer" aria-live="off">
                  <span className="vr-dot" aria-hidden /> {formatVoiceDuration(elapsed)}
                  <span className={`vr-left ${left <= 5000 ? 'warn' : ''}`}> · {Math.ceil(left / 1000)} s left</span>
                </span>
                <span className="vr-meter" aria-hidden>
                  <span ref={meterRef} />
                </span>
                <span className="tiny muted">Tap ■ (or let go) to stop · Esc cancels</span>
              </>
            ) : phase === 'requesting' ? (
              <span className="small muted">Starting the microphone…</span>
            ) : phase === 'sent' ? (
              <span className="small good" role="status">
                ✓ Voice note sent!
              </span>
            ) : (
              <>
                <span className="small">{support ? micErrorMessage({ name: support }) : 'Tap to record, tap again to stop — or hold and let go.'}</span>
                <span className="tiny muted">Up to {VOICE_MAX_MS / 1000} seconds.</span>
              </>
            )}
          </div>
          {onCancel && !recording && phase !== 'requesting' && (
            <button type="button" className="icon-btn" onClick={cancel} aria-label="Close voice note">
              ✕
            </button>
          )}
        </div>
      )}
      {err && (
        <p className="vr-err" role="alert">
          {err}
        </p>
      )}
      <span className="vr-privacy tiny muted">🔒 {PRIVACY_LINE}</span>
    </div>
  );
}

/** Tap-to-play voice clip with a waveform-style progress bar. `src` may be a URL or a getter (signed URL). */
export function VoicePlayer({
  id,
  src,
  durationMs,
  label,
  onPlayed,
}: {
  id: string;
  src: string | (() => Promise<string>);
  durationMs?: number;
  label?: string;
  onPlayed?: () => void;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const bars = useRef(waveBars(id));

  useEffect(
    () => () => {
      const a = audio.current;
      if (a) {
        a.pause();
        a.removeAttribute('src');
      }
      audio.current = null;
    },
    [],
  );

  async function toggle() {
    const a0 = audio.current;
    if (a0 && state === 'playing') {
      a0.pause();
      setState('idle');
      return;
    }
    setErr(null);
    // create the element inside the tap so iOS allows playback
    const a = a0 ?? new Audio();
    audio.current = a;
    a.preload = 'auto';
    a.ontimeupdate = () => {
      const total = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : (durationMs ?? 0) / 1000;
      setProgress(total ? Math.min(1, a.currentTime / total) : 0);
    };
    a.onended = () => {
      setProgress(1);
      setState('idle');
    };
    a.onerror = () => {
      setState('error');
      setErr("This clip can't be played (it may have expired).");
    };
    try {
      if (!a.src) {
        if (typeof src === 'string') a.src = src;
        else {
          setState('loading');
          a.src = await src();
        }
      }
      if (a.ended || progress >= 1) a.currentTime = 0;
      await a.play();
      setState('playing');
      onPlayed?.();
    } catch (e) {
      setState('error');
      setErr(voiceError(e));
    }
  }

  const n = bars.current.length;
  return (
    <div className="vp" aria-label={label}>
      <button type="button" className={`vp-btn ${state}`} onClick={toggle} aria-label={state === 'playing' ? 'Pause voice note' : 'Play voice note'} disabled={state === 'loading'}>
        <span aria-hidden>{state === 'playing' ? '❚❚' : state === 'loading' ? '…' : '▶'}</span>
      </button>
      <span className="vp-wave" aria-hidden>
        {bars.current.map((h, i) => (
          <span key={i} className={i / n < progress ? 'on' : ''} style={{ height: `${Math.round(h * 100)}%` }} />
        ))}
      </span>
      {durationMs != null && <span className="vp-dur">{formatVoiceDuration(durationMs)}</span>}
      {err && (
        <span className="vp-err tiny" role="alert">
          {err}
        </span>
      )}
    </div>
  );
}
