// Pure, dependency-free helpers shared by the browser client (via src/core/ttsShared.ts)
// and the Supabase Edge Function `tts` (Deno). Keep this file free of imports and of any
// Deno / DOM specific APIs except the standard Web Crypto `crypto.subtle`.

/** Emotions the game can ask for. The edge function rejects anything else. */
export const EMOTIONS = [
  'neutral',
  'cheerful',
  'warm',
  'excited',
  'worried',
  'sad',
  'angry',
  'apologetic',
  'surprised',
  'tired',
  'proud',
  'calm',
  'whisper',
] as const;
export type Emotion = (typeof EMOTIONS)[number];

/** Regional accent hints (expressive models only). `none` = let the voice speak as it is. */
export const ACCENTS = ['none', 'indian', 'nigerian', 'japanese', 'brazilian', 'mexican', 'irish'] as const;
export type Accent = (typeof ACCENTS)[number];

export const MAX_TTS_CHARS = 400;
export const VOICE_ID_RE = /^[A-Za-z0-9]{10,40}$/;
export const MIN_SPEED = 0.8;
export const MAX_SPEED = 1.15;

/** Expressive model with inline audio tags (verified in the ElevenLabs docs, Oct 2026). */
export const DEFAULT_MODEL = 'eleven_v3';
/** Stable fallback model (no audio tags; emotion goes through voice_settings). */
export const FALLBACK_MODEL = 'eleven_multilingual_v2';
/** mp3, 44.1 kHz, 64 kbps — small files, good enough for dialogue. */
export const OUTPUT_FORMAT = 'mp3_44100_64';

export interface TtsRequest {
  text: string;
  voiceId: string;
  emotion: Emotion;
  /** 0.8 – 1.15, rounded to 0.05. 1 = normal. */
  speed: number;
  accent: Accent;
  modelHint?: 'expressive' | 'stable';
}

export type ValidationResult = { ok: true; value: TtsRequest } | { ok: false; error: string };

export function isEmotion(v: unknown): v is Emotion {
  return typeof v === 'string' && (EMOTIONS as readonly string[]).includes(v);
}

export function isAccent(v: unknown): v is Accent {
  return typeof v === 'string' && (ACCENTS as readonly string[]).includes(v);
}

/** Round to the nearest 0.05 inside the allowed range (keeps cache keys few and stable). */
export function normalizeSpeed(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  const c = Math.max(MIN_SPEED, Math.min(MAX_SPEED, n));
  return Math.round(c * 20) / 20;
}

/** Collapse whitespace so trivially different strings share one cache entry. */
export function normalizeTtsText(text: string): string {
  return String(text ?? '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Validate an incoming request body. Pure — used by the edge function and the tests. */
export function validateTtsRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Body must be a JSON object' };
  const b = body as Record<string, unknown>;
  if (typeof b.text !== 'string') return { ok: false, error: '`text` must be a string' };
  const text = normalizeTtsText(b.text);
  if (!text) return { ok: false, error: '`text` is empty' };
  if (text.length > MAX_TTS_CHARS) return { ok: false, error: `\`text\` is longer than ${MAX_TTS_CHARS} characters` };
  if (!/[\p{L}\p{N}]/u.test(text)) return { ok: false, error: '`text` has nothing to say' };
  if (typeof b.voiceId !== 'string' || !VOICE_ID_RE.test(b.voiceId)) return { ok: false, error: '`voiceId` is invalid' };
  const emotion = b.emotion === undefined ? 'neutral' : b.emotion;
  if (!isEmotion(emotion)) return { ok: false, error: '`emotion` is not supported' };
  const accent = b.accent === undefined || b.accent === null ? 'none' : b.accent;
  if (!isAccent(accent)) return { ok: false, error: '`accent` is not supported' };
  if (b.speed !== undefined && (typeof b.speed !== 'number' || !Number.isFinite(b.speed))) return { ok: false, error: '`speed` must be a number' };
  let modelHint: TtsRequest['modelHint'];
  if (b.modelHint !== undefined && b.modelHint !== null) {
    if (b.modelHint !== 'expressive' && b.modelHint !== 'stable') return { ok: false, error: '`modelHint` must be "expressive" or "stable"' };
    modelHint = b.modelHint;
  }
  return { ok: true, value: { text, voiceId: b.voiceId, emotion, speed: normalizeSpeed(b.speed), accent, modelHint } };
}

/** True for models that understand inline audio tags such as `[whispers]`. */
export function supportsAudioTags(model: string): boolean {
  return /^eleven_v[34]/.test(model);
}

/** Audio tag per emotion for expressive models (eleven_v3 / eleven_v4). */
export const EMOTION_TAGS: Record<Emotion, string> = {
  neutral: '',
  cheerful: '[cheerfully]',
  warm: '[warmly]',
  excited: '[excited]',
  worried: '[worried]',
  sad: '[sad]',
  angry: '[angry]',
  apologetic: '[apologetic]',
  surprised: '[surprised]',
  tired: '[sighs] [tired]',
  proud: '[proudly]',
  calm: '[calmly]',
  whisper: '[whispers]',
};

const ACCENT_TAGS: Record<Accent, string> = {
  none: '',
  indian: '[Indian English accent]',
  nigerian: '[Nigerian English accent]',
  japanese: '[Japanese accent]',
  brazilian: '[Brazilian accent]',
  mexican: '[Mexican accent]',
  irish: '[Irish accent]',
};

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed?: number;
}

const INTENSE: Emotion[] = ['excited', 'angry', 'surprised'];
const MODERATE: Emotion[] = ['cheerful', 'worried', 'sad', 'proud', 'apologetic', 'warm'];

/** voice_settings for the non-tag model: lower stability + more style for intense emotions. */
export function voiceSettingsFor(emotion: Emotion, speed = 1): VoiceSettings {
  let stability = 0.6;
  let style = 0.05;
  if (INTENSE.includes(emotion)) {
    stability = 0.3;
    style = 0.5;
  } else if (MODERATE.includes(emotion)) {
    stability = 0.42;
    style = 0.28;
  } else if (emotion === 'whisper' || emotion === 'tired') {
    stability = 0.5;
    style = 0.15;
  }
  const s: VoiceSettings = { stability, similarity_boost: 0.75, style, use_speaker_boost: true };
  if (speed !== 1) s.speed = speed;
  return s;
}

/** Build the ElevenLabs request body for a model. Pure. */
export function buildElevenLabsBody(req: TtsRequest, model: string, withSettings = true): Record<string, unknown> {
  if (supportsAudioTags(model)) {
    const tags = [ACCENT_TAGS[req.accent], EMOTION_TAGS[req.emotion]].filter(Boolean).join(' ');
    const body: Record<string, unknown> = { text: tags ? `${tags} ${req.text}` : req.text, model_id: model };
    // v3 is documented with three stability presets; 0.5 ("natural") is the safe middle.
    if (withSettings) {
      const vs: VoiceSettings = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true };
      if (req.speed !== 1) vs.speed = req.speed;
      body.voice_settings = vs;
    }
    return body;
  }
  const body: Record<string, unknown> = { text: req.text, model_id: model };
  if (withSettings) body.voice_settings = voiceSettingsFor(req.emotion, req.speed);
  return body;
}

/** The exact string hashed into the cache key. Exported so the client can use it as an LRU key. */
export function ttsCacheInput(model: string, req: Pick<TtsRequest, 'voiceId' | 'emotion' | 'text'> & Partial<Pick<TtsRequest, 'speed' | 'accent'>>): string {
  const speed = normalizeSpeed(req.speed ?? 1);
  const accent = req.accent ?? 'none';
  return [model, req.voiceId, req.emotion, speed.toFixed(2), accent, normalizeTtsText(req.text)].join('\u001f');
}

/** Lower-case hex SHA-256 using Web Crypto (Deno, browsers, Node 18+). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Storage object name: sha256(model + voiceId + emotion + speed + accent + normalized text). */
export async function ttsCacheKey(model: string, req: Pick<TtsRequest, 'voiceId' | 'emotion' | 'text'> & Partial<Pick<TtsRequest, 'speed' | 'accent'>>): Promise<string> {
  return sha256Hex(ttsCacheInput(model, req));
}
