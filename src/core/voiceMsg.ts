// Family voice messages — pure helpers + the incoming-call queue (no React, no network).
// The UI lives in src/ui/VoiceRecorder.tsx (recording / playback) and src/ui/PhoneCall.tsx
// (incoming-call overlay + voice-notes inbox). familySync routes voice messages here.
import type { FamilyMessage } from '../services/family';

export const VOICE_MAX_MS = 30_000;
export const VOICE_MAX_BYTES = 2 * 1024 * 1024;
/** How long the phone rings before the call counts as missed. */
export const RING_MS = 20_000;
/** Signed URLs live 1 h on the server; reuse them for a bit less than that. */
export const URL_TTL_MS = 50 * 60_000;
export const PRIVACY_LINE = 'Voice notes are private to your family and auto-delete after 7 days.';

/** 7300 → "0:07", 65000 → "1:05". Never negative, never NaN. */
export function formatVoiceDuration(ms: number): string {
  const total = Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Recording formats in order of preference: Chrome/Firefox/Edge → Safari → older Firefox. */
export const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'] as const;

/** First supported mime type, or '' to let the browser pick its default. */
export function pickMimeType(isSupported: ((type: string) => boolean) | undefined | null): string {
  if (!isSupported) return '';
  for (const t of MIME_CANDIDATES) {
    try {
      if (isSupported(t)) return t;
    } catch {
      /* some browsers throw for unknown types */
    }
  }
  return '';
}

export function isVoice(m: Pick<FamilyMessage, 'audioPath'> | null | undefined): m is FamilyMessage & { audioPath: string } {
  return !!m && typeof m.audioPath === 'string' && m.audioPath.length > 0;
}

/** Turn a mic / recorder error into one friendly sentence. */
export function micErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (name === 'NotAllowedError' || name === 'SecurityError' || /denied|not allowed|permission/i.test(msg))
    return "Microphone blocked — allow it in the browser's address bar, then try again.";
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || /not found|no device/i.test(msg)) return 'No microphone found on this device.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The microphone is busy (another app may be using it). Close it and try again.';
  if (name === 'unsupported' || /unsupported/i.test(msg)) return "Voice notes aren't supported in this browser. Try the latest Chrome, Safari or Firefox.";
  if (name === 'insecure') return 'Voice notes need a secure (https) page to use the microphone.';
  return "Couldn't start the microphone. Please try again.";
}

/** Can this browser record at all? Returns null if yes, else the reason. */
export function recordingSupport(env: { mediaDevices?: unknown; MediaRecorder?: unknown; isSecureContext?: boolean }): null | 'insecure' | 'unsupported' {
  if (env.isSecureContext === false) return 'insecure';
  const md = env.mediaDevices as { getUserMedia?: unknown } | undefined;
  if (!md || typeof md.getUserMedia !== 'function' || typeof env.MediaRecorder !== 'function') return 'unsupported';
  return null;
}

// ---------------------------------------------------------------------------
// Signed-URL cache (per audioPath, ~50 min)
// ---------------------------------------------------------------------------

export class UrlCache {
  private map = new Map<string, { url: string; at: number }>();
  private pending = new Map<string, Promise<string>>();
  constructor(
    private fetcher: (path: string) => Promise<string>,
    private now: () => number = () => Date.now(),
    private ttl = URL_TTL_MS,
  ) {}
  peek(path: string): string | null {
    const hit = this.map.get(path);
    return hit && this.now() - hit.at < this.ttl ? hit.url : null;
  }
  get(path: string): Promise<string> {
    const hit = this.peek(path);
    if (hit) return Promise.resolve(hit);
    const p = this.pending.get(path);
    if (p) return p;
    const req = this.fetcher(path)
      .then((url) => {
        this.map.set(path, { url, at: this.now() });
        return url;
      })
      .finally(() => this.pending.delete(path));
    this.pending.set(path, req);
    return req;
  }
}

// ---------------------------------------------------------------------------
// Incoming-call queue
// ---------------------------------------------------------------------------

export type CallPhase = 'ringing' | 'active';
export interface Call {
  msg: FamilyMessage & { audioPath: string };
  phase: CallPhase;
  /** when it started ringing */
  since: number;
}
export interface InboxItem {
  msg: FamilyMessage & { audioPath: string };
  missed: boolean;
  heard: boolean;
}
export interface CallSnapshot {
  current: Call | null;
  queued: number;
  inbox: InboxItem[];
  missed: number;
  inboxOpen: boolean;
}

const INBOX_MAX = 30;

/** One call shows at a time; others wait. Declined / unanswered calls become missed calls. */
export class CallQueue {
  private current: Call | null = null;
  private queue: Call[] = [];
  private inbox: InboxItem[] = [];
  private seen = new Set<string>();
  private inboxOpen = false;
  private listeners = new Set<() => void>();
  private snap: CallSnapshot;

  constructor(private now: () => number = () => Date.now()) {
    this.snap = this.build();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snap;

  private emit() {
    this.snap = this.build();
    for (const l of this.listeners) {
      try {
        l();
      } catch {
        /* never let one listener break the others */
      }
    }
  }
  private build(): CallSnapshot {
    return {
      current: this.current,
      queued: this.queue.length,
      inbox: this.inbox,
      missed: this.inbox.filter((i) => i.missed && !i.heard).length,
      inboxOpen: this.inboxOpen,
    };
  }

  /** A new voice message arrived live: ring (or queue). Returns false for duplicates / non-voice. */
  incoming(m: FamilyMessage): boolean {
    if (!isVoice(m) || this.seen.has(m.id)) return false;
    this.seen.add(m.id);
    const call: Call = { msg: m, phase: 'ringing', since: this.now() };
    if (this.current) this.queue.push(call);
    else this.current = call;
    this.emit();
    return true;
  }

  /** Messages that arrived while the game was closed: straight into the inbox (missed if new). */
  backfill(list: FamilyMessage[], isNew: (m: FamilyMessage) => boolean) {
    let changed = false;
    for (const m of list) {
      if (!isVoice(m) || this.seen.has(m.id)) continue;
      this.seen.add(m.id);
      const fresh = isNew(m);
      this.addInbox({ msg: m, missed: fresh, heard: !fresh });
      changed = true;
    }
    if (changed) this.emit();
  }

  private addInbox(item: InboxItem) {
    this.inbox = [item, ...this.inbox.filter((i) => i.msg.id !== item.msg.id)]
      .sort((a, b) => Date.parse(b.msg.createdAt) - Date.parse(a.msg.createdAt))
      .slice(0, INBOX_MAX);
  }

  private next() {
    const n = this.queue.shift() ?? null;
    // a queued call starts ringing when it reaches the front
    this.current = n ? { ...n, since: this.now() } : null;
  }

  answer(): Call | null {
    if (!this.current || this.current.phase !== 'ringing') return this.current;
    this.current = { ...this.current, phase: 'active' };
    this.addInbox({ msg: this.current.msg, missed: false, heard: true });
    this.emit();
    return this.current;
  }

  /** Declined or rang out → missed call; the next queued call rings. */
  miss() {
    if (!this.current) return;
    if (this.current.phase === 'ringing') this.addInbox({ msg: this.current.msg, missed: true, heard: false });
    this.next();
    this.emit();
  }

  hangUp() {
    if (!this.current) return;
    this.next();
    this.emit();
  }

  /** Check the ringing call against the timeout; returns true if it was missed. */
  tick(): boolean {
    const c = this.current;
    if (c && c.phase === 'ringing' && this.now() - c.since >= RING_MS) {
      this.miss();
      return true;
    }
    return false;
  }

  markHeard(id: string) {
    let hit = false;
    this.inbox = this.inbox.map((i) => (i.msg.id === id && !i.heard ? ((hit = true), { ...i, heard: true }) : i));
    if (hit) this.emit();
  }

  setInboxOpen(open: boolean) {
    if (this.inboxOpen === open) return;
    this.inboxOpen = open;
    this.emit();
  }

  reset() {
    this.current = null;
    this.queue = [];
    this.inbox = [];
    this.seen.clear();
    this.inboxOpen = false;
    this.emit();
  }
}

export const calls = new CallQueue();

// "Seen" watermark per family seat: notes newer than this count as missed after a reload.
const seenKey = (memberId: string) => `lifequest.voice.seen.${memberId}`;
export function voiceSeenAt(memberId: string | null | undefined): number {
  if (!memberId) return 0;
  try {
    return Number(localStorage.getItem(seenKey(memberId))) || 0;
  } catch {
    return 0;
  }
}
export function markVoiceSeen(memberId: string | null | undefined, at = Date.now()) {
  if (!memberId) return;
  try {
    if (at > voiceSeenAt(memberId)) localStorage.setItem(seenKey(memberId), String(at));
  } catch {
    /* storage unavailable */
  }
}

/** Tiny silent WAV (data URI) used to unlock an <audio> element inside a tap on iOS. */
export function silentWavDataUri(samples = 64): string {
  const n = Math.max(1, Math.floor(samples));
  const bytes = new Uint8Array(44 + n * 2);
  const dv = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 16000, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n * 2, true);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/** Deterministic pseudo-waveform bar heights (0.2..1) for a message id. */
export function waveBars(id: string, count = 28): number[] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h >>> 0) % 1000) / 1000;
    const env = Math.sin((Math.PI * (i + 0.5)) / count);
    out.push(Math.round((0.2 + 0.8 * r * (0.5 + 0.5 * env)) * 100) / 100);
  }
  return out;
}
