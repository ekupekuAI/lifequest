// Realistic character voices via the Supabase Edge Function `tts` (ElevenLabs).
// The browser only ever talks to Supabase with the public anon key / an anonymous
// session token; the ElevenLabs key stays on the server.
//
// Everything here is best effort: no function throws, and speakNeural() resolves to
// false whenever the caller should fall back to browser speech or babble.
import { getSupabase } from '../services/supabaseClient';
import { store } from './store';
import { DEFAULT_VOICES, NPC_LOOKS } from '../domain/family';
import { region } from '../domain/region';
import type { RegionId, VoiceProfile } from '../domain/types';
import { DEFAULT_MODEL, MAX_TTS_CHARS, ttsCacheInput, type Accent, type Emotion } from './ttsShared';
import { accentFor, buildCast, castVoice, speedFor, type CastSpeaker } from './voiceCast';
import { getSavedVoice, saveVoice, saveVoiceFromUrl } from './voiceCache';

export interface NeuralLine {
  text: string;
  voiceId: string;
  emotion: Emotion;
  speed?: number;
  accent?: Accent;
}

export interface NeuralOptions {
  /** force a voice instead of the cast (settings preview) */
  voiceId?: string;
  /** 0 – 1, defaults to the voice volume setting */
  volume?: number;
  /** playback actually started (audio is audible) */
  onStart?: () => void;
  /** called once after onStart: `completed` is false when stopped or interrupted */
  onEnd?: (completed: boolean) => void;
}

export type NeuralState = 'unconfigured' | 'ready' | 'ok' | 'error';

// ---------------------------------------------------------------------------
// state & subscription

const LRU_MAX = 150;
const REQUEST_TIMEOUT_MS = 20_000;
/** longest wait for the first audio of a line before falling back to built-in voices */
const START_TIMEOUT_MS = 9_000;
const MAX_SOFT_FAILURES = 3;
const HARD_CODES = new Set(['not_configured', 'bad_key', 'daily_cap', 'quota']);

let hardFail: string | null = null;
let lastError: string | null = null;
let lastOk = false;
let softFailures = 0;
let loadingKey: string | null = null;
let version = 0;
const listeners = new Set<() => void>();
const badVoices = new Set<string>();

function emit() {
  version++;
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeNeural(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export const getNeuralVersion = () => version;

/** Speaker key whose line is currently being fetched (for a "loading voice…" hint). */
export function neuralLoadingKey(): string | null {
  return loadingKey;
}
function setLoading(key: string | null) {
  if (loadingKey === key) return;
  loadingKey = key;
  emit();
}

function env(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  try {
    const value: unknown = import.meta.env?.[name];
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

/** True when Supabase is configured for this build (the function may still be missing). */
export function neuralConfigured(): boolean {
  try {
    return !!getSupabase() && !!env('VITE_SUPABASE_URL');
  } catch {
    return false;
  }
}

/** True when realistic voices can be tried: Supabase configured and no hard failure this session. */
export function neuralAvailable(): boolean {
  return !hardFail && neuralConfigured();
}

export function neuralStatus(): { state: NeuralState; message: string } {
  if (!neuralConfigured()) return { state: 'unconfigured', message: 'Not configured — this build has no Supabase project, so built-in voices are used.' };
  if (hardFail) return { state: 'error', message: hardFail };
  if (lastOk) return { state: 'ok', message: lastError ? `Working (last issue: ${lastError})` : 'Working.' };
  return { state: 'ready', message: lastError ?? 'Available — the first line may take a moment.' };
}

/** Clear a session failure (Settings → "Retry"). */
export function resetNeuralErrors() {
  hardFail = null;
  lastError = null;
  softFailures = 0;
  badVoices.clear();
  emit();
}

function hardFailWith(msg: string) {
  hardFail = msg;
  lastError = msg;
  emit();
}

function softFail(msg: string) {
  lastError = msg;
  // while the device is offline, saved lines still play — don't switch off realistic voices
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emit();
    return;
  }
  softFailures++;
  if (softFailures >= MAX_SOFT_FAILURES) hardFailWith(`${msg} (gave up after ${MAX_SOFT_FAILURES} tries; using built-in voices this session)`);
  else emit();
}

// ---------------------------------------------------------------------------
// casting (store-aware wrapper around voiceCast)

let castMemo: { sig: string; cast: Record<string, string> } | null = null;

function settingsVoice() {
  return store.state?.settings?.voice;
}

function knownSpeakers(): CastSpeaker[] {
  const members = store.state?.profile?.members ?? [];
  const out: CastSpeaker[] = members.map((m) => ({ key: m.id, role: m.role, kind: (m.voice ?? DEFAULT_VOICES[m.role])?.kind }));
  for (const [k, npc] of Object.entries(NPC_LOOKS)) out.push({ key: `npc:${k}`, kind: npc.voice.kind });
  out.push({ key: 'narrator' });
  return out;
}

/** Member shown as an in-world NPC (`npc:mother-0`) shares the member's voice. */
function canonicalKey(key: string): string {
  if (key.startsWith('npc:')) {
    const id = key.slice(4);
    if (!NPC_LOOKS[id] && store.member?.(id)) return id;
  }
  return key;
}

/** The full cast for the current family/region (memoised). */
export function currentCast(): Record<string, string> {
  const regionId: RegionId = region().id;
  const speakers = knownSpeakers();
  const overrides = settingsVoice()?.cast ?? {};
  const sig = `${regionId}|${speakers.map((s) => `${s.key}:${s.role ?? ''}:${s.kind ?? ''}`).join(',')}|${JSON.stringify(overrides)}`;
  if (castMemo?.sig !== sig) castMemo = { sig, cast: buildCast(speakers, regionId, overrides) };
  return castMemo.cast;
}

export interface CastRow {
  key: string;
  label: string;
  role?: string;
  profile: VoiceProfile;
  /** voice the game would pick without an override */
  defaultId: string;
  /** player's override, if any */
  overrideId?: string;
}

/** Everyone who can speak, with their default and overridden voices (Settings → Advanced). */
export function castTable(): CastRow[] {
  const regionId: RegionId = region().id;
  const speakers = knownSpeakers();
  const defaults = buildCast(speakers, regionId, {});
  const overrides = settingsVoice()?.cast ?? {};
  const rows: CastRow[] = [];
  for (const m of store.state?.profile?.members ?? []) {
    if (m.role === 'player') continue;
    rows.push({ key: m.id, label: m.name, role: m.role, profile: m.voice ?? DEFAULT_VOICES[m.role], defaultId: defaults[m.id], overrideId: overrides[m.id] });
  }
  for (const [k, npc] of Object.entries(NPC_LOOKS)) {
    const key = `npc:${k}`;
    rows.push({ key, label: npc.name, role: 'npc', profile: npc.voice, defaultId: defaults[key], overrideId: overrides[key] });
  }
  rows.push({ key: 'narrator', label: 'Narrator', role: 'narrator', profile: { pitch: 1, rate: 0.95, kind: 'neutral' }, defaultId: defaults.narrator, overrideId: overrides.narrator });
  return rows;
}

/** ElevenLabs voice id for a speaker. */
export function voiceIdFor(speakerKey: string, profile?: VoiceProfile | null): string {
  const key = canonicalKey(speakerKey);
  const cast = currentCast();
  if (cast[key]) return cast[key];
  return castVoice({ key, kind: profile?.kind }, region().id, settingsVoice()?.cast, cast);
}

function accentNow(): Accent {
  return settingsVoice()?.accentHints === false ? 'none' : accentFor(region().id);
}

/** Build the request for one speaker line (exported for prefetching from voice.ts). */
export function neuralLine(text: string, profile: VoiceProfile | null | undefined, emotion: Emotion, speakerKey: string, voiceId?: string): NeuralLine {
  return { text, voiceId: voiceId ?? voiceIdFor(speakerKey, profile), emotion, speed: speedFor(profile), accent: accentNow() };
}

/** Split long text into ≤ MAX_TTS_CHARS pieces at sentence (then word) boundaries. */
export function splitForTts(text: string, max = MAX_TTS_CHARS - 20): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  if (t.length <= max) return [t];
  const out: string[] = [];
  let cur = '';
  for (const s of t.split(/(?<=[.!?…])\s+/)) {
    if ((cur ? cur.length + 1 : 0) + s.length <= max) {
      cur = cur ? `${cur} ${s}` : s;
      continue;
    }
    if (cur) out.push(cur);
    cur = '';
    let rest = s;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(' ', max);
      if (cut < max * 0.5) cut = max;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    cur = rest;
  }
  if (cur) out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------
// network + LRU cache of resolved audio URLs

const lru = new Map<string, Promise<string | null>>();

function lruKey(line: NeuralLine): string {
  return ttsCacheInput(DEFAULT_MODEL, line);
}

function lruTouch(key: string, p: Promise<string | null>) {
  lru.delete(key);
  lru.set(key, p);
  while (lru.size > LRU_MAX) {
    const oldest = lru.keys().next().value as string;
    const old = lru.get(oldest);
    lru.delete(oldest);
    void old?.then((u) => {
      if (u?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          /* ignore */
        }
      }
    });
  }
}

const isJwt = (k: string) => k.split('.').length === 3;
let triedAnonSignIn = false;

async function authToken(): Promise<string> {
  const anon = env('VITE_SUPABASE_ANON_KEY');
  const sb = getSupabase();
  if (!sb) return anon;
  try {
    const { data } = await sb.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
  } catch {
    /* fall through */
  }
  if (isJwt(anon)) return anon;
  // publishable keys (sb_publishable_…) are not JWTs; the function's verify_jwt needs a session
  if (!triedAnonSignIn) {
    triedAnonSignIn = true;
    try {
      const { data } = await sb.auth.signInAnonymously();
      if (data.session?.access_token) return data.session.access_token;
    } catch {
      /* ignore */
    }
  }
  return anon;
}

function functionUrl(): string {
  return `${env('VITE_SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/tts`;
}

async function fetchJson(r: Response): Promise<{ url?: unknown; error?: unknown; code?: unknown }> {
  try {
    return (await r.json()) as { url?: unknown; error?: unknown; code?: unknown };
  } catch {
    return {};
  }
}

async function fetchAudio(line: NeuralLine): Promise<string | null> {
  if (!neuralAvailable()) return null;
  if (badVoices.has(line.voiceId)) return null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS) : 0;
  try {
    const token = await authToken();
    const r = await fetch(functionUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: env('VITE_SUPABASE_ANON_KEY') },
      body: JSON.stringify({ text: line.text, voiceId: line.voiceId, emotion: line.emotion, speed: line.speed ?? 1, accent: line.accent ?? 'none' }),
      signal: ctrl?.signal,
    });
    const ctype = r.headers.get('content-type') ?? '';
    if (r.ok && ctype.includes('audio')) {
      const blob = await r.blob();
      if (!blob.size) throw new Error('empty audio');
      softFailures = 0;
      lastOk = true;
      return URL.createObjectURL(blob);
    }
    const body = await fetchJson(r);
    if (r.ok && typeof body.url === 'string' && /^https?:\/\//.test(body.url)) {
      softFailures = 0;
      if (!lastOk) {
        lastOk = true;
        emit();
      }
      return body.url;
    }
    const code = typeof body.code === 'string' ? body.code : '';
    const msg = typeof body.error === 'string' ? body.error : typeof (body as any).message === 'string' ? (body as any).message : `HTTP ${r.status}`;
    if (HARD_CODES.has(code)) hardFailWith(msg);
    else if (r.status === 404 && !code) hardFailWith('The "tts" Edge Function is not deployed on this Supabase project.');
    else if ((r.status === 401 || r.status === 403) && !code) hardFailWith('The voice service rejected the app key (check VITE_SUPABASE_ANON_KEY / anonymous sign-ins).');
    else if (code === 'voice_unavailable') {
      badVoices.add(line.voiceId);
      lastError = `${msg} — set a custom voice ID in Settings → Advanced.`;
      emit();
    } else if (code === 'bad_request') {
      lastError = msg;
      emit();
    } else softFail(msg);
    return null;
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    softFail(aborted ? 'The voice service took too long to answer' : 'Could not reach the voice service');
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Resolve (and cache) the audio URL for a line. Never rejects. */
function resolveUrl(line: NeuralLine): Promise<string | null> {
  const key = lruKey(line);
  const hit = lru.get(key);
  if (hit) {
    lruTouch(key, hit);
    return hit;
  }
  const p = (async () => {
    const saved = await getSavedVoice(key);
    if (saved) return URL.createObjectURL(saved);
    const url = await fetchAudio(line);
    if (url) {
      if (url.startsWith('blob:')) {
        try {
          const blob = await (await fetch(url)).blob();
          void saveVoice(key, blob);
        } catch {
          /* ignore */
        }
      } else void saveVoiceFromUrl(key, url);
    }
    return url;
  })().catch(() => null);
  lruTouch(key, p);
  void p.then((u) => {
    if (!u && lru.get(key) === p) lru.delete(key); // don't cache failures
  });
  return p;
}

/** True when this exact line is already resolved/being fetched (replay is instant). */
export function isCached(line: NeuralLine): boolean {
  return lru.has(lruKey(line));
}

/** Warm the cache for upcoming lines (e.g. the next line of a dialogue). */
export function prefetch(lines: NeuralLine[]): void {
  if (!neuralAvailable()) return;
  for (const l of lines.slice(0, 3)) {
    for (const text of splitForTts(l.text).slice(0, 2)) void resolveUrl({ ...l, text });
  }
}

// ---------------------------------------------------------------------------
// playback (one shared <audio> element)

let el: HTMLAudioElement | null = null;
let playToken = 0;
let finishCurrent: ((completed: boolean) => void) | null = null;
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function audioEl(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!el) {
    try {
      el = new Audio();
      el.preload = 'auto';
    } catch {
      el = null;
    }
  }
  return el;
}

// Autoplay: browsers only allow audio after a user gesture. Prime the shared element on the
// first pointer/key press so later dialogue lines (started from timers/fetches) can play.
if (typeof window !== 'undefined') {
  const unlock = () => {
    const a = audioEl();
    if (!a) return;
    if (!a.paused) return done();
    try {
      a.src = SILENT_WAV;
      const p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          if (a.src === SILENT_WAV) a.pause();
          done();
        }).catch(() => {
          /* try again on the next gesture */
        });
      } else done();
    } catch {
      /* ignore */
    }
  };
  const done = () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    window.removeEventListener('touchend', unlock, true);
  };
  try {
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('touchend', unlock, true);
  } catch {
    /* ignore */
  }
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.9);

/** Play one URL to the end. Resolves true when it played through. */
function playUrl(url: string, token: number, volume: number, onPlaying: () => void): Promise<boolean> {
  const a = audioEl();
  if (!a) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      a.onended = null;
      a.onerror = null;
      a.onplaying = null;
      if (finishCurrent === finish) finishCurrent = null;
      resolve(ok);
    };
    finishCurrent = finish;
    try {
      a.pause();
      a.onended = () => finish(true);
      a.onerror = () => finish(false);
      a.onplaying = () => token === playToken && onPlaying();
      a.volume = clamp01(volume);
      a.src = url;
      const p = a.play();
      if (p && typeof p.catch === 'function') {
        p.catch((e: unknown) => {
          if (e instanceof Error && e.name === 'NotAllowedError') lastError = 'Click or press a key once to allow sound.';
          finish(false);
        });
      }
    } catch {
      finish(false);
    }
  });
}

/** Change the volume of the line that is playing now. */
export function setNeuralVolume(v: number) {
  if (el) el.volume = clamp01(v);
}

/** Stop any realistic-voice playback and pending fetch-then-play. */
export function stop() {
  playToken++;
  try {
    el?.pause();
  } catch {
    /* ignore */
  }
  const f = finishCurrent;
  finishCurrent = null;
  f?.(false);
  setLoading(null);
}

/**
 * Speak `text` (already normalised for speech) as `speakerKey` with an emotion.
 * Resolves true once audio starts playing, false if the caller should fall back.
 */
export function speakNeural(text: string, profile: VoiceProfile | null | undefined, emotion: Emotion, speakerKey: string, opts: NeuralOptions = {}): Promise<boolean> {
  stop();
  const token = playToken;
  if (!neuralAvailable()) return Promise.resolve(false);
  let lines: NeuralLine[];
  try {
    const base = neuralLine('', profile, emotion, speakerKey, opts.voiceId);
    lines = splitForTts(text).map((t) => ({ ...base, text: t }));
  } catch {
    return Promise.resolve(false);
  }
  if (!lines.length) return Promise.resolve(false);
  const volume = opts.volume ?? settingsVoice()?.volume ?? 0.9;

  return new Promise<boolean>((resolveStart) => {
    let started = false;
    const run = async () => {
      setLoading(speakerKey);
      let completed = true;
      for (let i = 0; i < lines.length; i++) {
        if (i + 1 < lines.length) void resolveUrl(lines[i + 1]);
        // don't keep the player waiting on a slow first line: fall back, let the fetch finish
        // in the background so the cache is warm for a replay
        const url =
          i === 0 && !started
            ? await Promise.race([resolveUrl(lines[i]), new Promise<null>((r) => setTimeout(() => r(null), START_TIMEOUT_MS))])
            : await resolveUrl(lines[i]);
        if (token !== playToken || !url) {
          completed = false;
          break;
        }
        const ok = await playUrl(url, token, volume, () => {
          if (started) return;
          started = true;
          if (loadingKey === speakerKey) setLoading(null);
          try {
            opts.onStart?.();
          } catch {
            /* ignore */
          }
          resolveStart(true);
        });
        if (!ok || token !== playToken) {
          completed = false;
          break;
        }
      }
      if (token === playToken) setLoading(null);
      if (!started) resolveStart(false);
      else {
        try {
          opts.onEnd?.(completed);
        } catch {
          /* ignore */
        }
      }
    };
    run().catch(() => {
      if (token === playToken) setLoading(null);
      if (!started) resolveStart(false);
      else opts.onEnd?.(false);
    });
  });
}

/** Ask the function whether it is deployed and configured (Settings status). Never throws. */
export async function checkNeuralHealth(): Promise<{ ok: boolean; message: string }> {
  if (!neuralConfigured()) return { ok: false, message: neuralStatus().message };
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 10_000) : 0;
  try {
    const token = await authToken();
    const r = await fetch(`${functionUrl()}?health=1`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env('VITE_SUPABASE_ANON_KEY') },
      signal: ctrl?.signal,
    });
    if (r.status === 404) {
      hardFailWith('The "tts" Edge Function is not deployed on this Supabase project.');
      return { ok: false, message: hardFail! };
    }
    const body = (await fetchJson(r)) as { configured?: unknown; model?: unknown; error?: unknown; message?: unknown };
    if (!r.ok) {
      const msg = typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : `HTTP ${r.status}`;
      return { ok: false, message: `Voice service: ${msg}` };
    }
    if (body.configured === false) {
      hardFailWith('The tts function is deployed but the ELEVENLABS_API_KEY secret is missing.');
      return { ok: false, message: hardFail! };
    }
    return { ok: true, message: `Voice service ready (${typeof body.model === 'string' ? body.model : 'ElevenLabs'}).` };
  } catch {
    return { ok: false, message: 'Could not reach the voice service.' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
