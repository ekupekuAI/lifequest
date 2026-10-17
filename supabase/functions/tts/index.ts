// Supabase Edge Function: `tts`
// Turns a line of LifeQuest dialogue into speech with ElevenLabs, caches the mp3 in
// Supabase Storage (bucket `tts-cache`, public read) and returns its public URL.
// The ElevenLabs API key never leaves this function.
//
//   POST /functions/v1/tts      { text, voiceId, emotion, speed?, accent?, modelHint? }
//        → 200 { url, cached, model }   (or raw audio/mpeg bytes if Storage is unavailable)
//   GET  /functions/v1/tts?health=1  → { ok, configured, storage, model, fallbackModel }
//
// Secrets (npx supabase secrets set …):
//   ELEVENLABS_API_KEY   required
//   ELEVENLABS_MODEL     optional, default eleven_v3 (expressive, inline audio tags)
//   TTS_DAILY_CHAR_CAP   optional, default 50000 characters synthesised per day per instance
//   TTS_VOICE_REMAP      optional JSON {"<voiceId the game asks for>": "<voiceId to use>"}
// Built-in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEYS).
//
// Keep the default `verify_jwt = true`: callers must send a valid Supabase JWT
// (the anon key or an anonymous user's session token).

import {
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  OUTPUT_FORMAT,
  VOICE_ID_RE,
  buildElevenLabsBody,
  ttsCacheKey,
  validateTtsRequest,
  type TtsRequest,
} from '../_shared/ttsShared.ts';

// ---------------------------------------------------------------------------
// config

const BUCKET = 'tts-cache';
const ELEVEN_TIMEOUT_MS = 25_000;
const STORAGE_TIMEOUT_MS = 8_000;
const RATE_LIMIT_PER_MIN = 60;
const MAX_BODY_BYTES = 4_096;

const env = (k: string) => (Deno.env.get(k) ?? '').trim();

const ELEVEN_KEY = env('ELEVENLABS_API_KEY');
const PRIMARY_MODEL = /^[a-z0-9_]{3,64}$/.test(env('ELEVENLABS_MODEL')) ? env('ELEVENLABS_MODEL') : DEFAULT_MODEL;
const DAILY_CAP = (() => {
  const n = Number(env('TTS_DAILY_CHAR_CAP'));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50_000;
})();
const SUPABASE_URL = env('SUPABASE_URL').replace(/\/+$/, '');
const SERVICE_KEY = (() => {
  const legacy = env('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  // newer projects: SUPABASE_SECRET_KEYS is a JSON object of named secret keys
  try {
    const parsed = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}') as Record<string, unknown>;
    const v = parsed.default ?? Object.values(parsed)[0];
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
})();
const VOICE_REMAP: Record<string, string> = (() => {
  try {
    const parsed = JSON.parse(env('TTS_VOICE_REMAP') || '{}') as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [from, to] of Object.entries(parsed)) {
      if (VOICE_ID_RE.test(from) && typeof to === 'string' && VOICE_ID_RE.test(to)) out[from] = to;
    }
    return out;
  } catch {
    console.warn('[tts] TTS_VOICE_REMAP is not valid JSON; ignoring it');
    return {};
  }
})();

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Expose-Headers': 'x-tts-model, x-tts-cache',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

const fail = (status: number, error: string, code: string) => json({ error, code }, status);

// ---------------------------------------------------------------------------
// best-effort abuse limits (per function instance, in memory)

const hits = new Map<string, { windowStart: number; n: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.windowStart >= 60_000) {
    hits.set(ip, { windowStart: now, n: 1 });
    if (hits.size > 5_000) {
      for (const [k, v] of hits) if (now - v.windowStart >= 60_000) hits.delete(k);
    }
    return false;
  }
  h.n++;
  return h.n > RATE_LIMIT_PER_MIN;
}

let capDay = '';
let capUsed = 0;
function capRemaining(): number {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== capDay) {
    capDay = today;
    capUsed = 0;
  }
  return DAILY_CAP - capUsed;
}

// when the expressive model is refused (plan / model access), skip it for a while
let primaryDisabledUntil = 0;

// ---------------------------------------------------------------------------
// helpers

async function withTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function serviceHeaders(): Record<string, string> {
  const h: Record<string, string> = { apikey: SERVICE_KEY };
  // legacy keys are JWTs and go in Authorization; new sb_secret_ keys only in `apikey`
  if (SERVICE_KEY.split('.').length === 3) h.Authorization = `Bearer ${SERVICE_KEY}`;
  return h;
}

const publicUrl = (key: string) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}.mp3`;

async function cachedUrl(key: string): Promise<string | null> {
  if (!SUPABASE_URL) return null;
  try {
    const r = await withTimeout(publicUrl(key), { method: 'HEAD' }, STORAGE_TIMEOUT_MS);
    return r.ok ? publicUrl(key) : null;
  } catch {
    return null;
  }
}

async function upload(key: string, audio: Uint8Array): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    const r = await withTimeout(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}.mp3`,
      {
        method: 'POST',
        headers: { ...serviceHeaders(), 'Content-Type': 'audio/mpeg', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
        body: audio,
      },
      STORAGE_TIMEOUT_MS,
    );
    if (!r.ok) {
      console.warn(`[tts] storage upload failed: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
      return null;
    }
    return publicUrl(key);
  } catch (e) {
    console.warn('[tts] storage upload error', e instanceof Error ? e.message : e);
    return null;
  }
}

interface ElevenResult {
  ok: boolean;
  status: number;
  audio?: Uint8Array;
  detail?: string;
  detailCode?: string;
}

async function elevenLabs(req: TtsRequest, model: string, withSettings: boolean): Promise<ElevenResult> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=${OUTPUT_FORMAT}`;
  let r: Response;
  try {
    r = await withTimeout(
      url,
      {
        method: 'POST',
        headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify(buildElevenLabsBody(req, model, withSettings)),
      },
      ELEVEN_TIMEOUT_MS,
    );
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === 'AbortError';
    return { ok: false, status: timeout ? 504 : 502, detail: timeout ? 'ElevenLabs timed out' : 'Could not reach ElevenLabs' };
  }
  if (r.ok) {
    const audio = new Uint8Array(await r.arrayBuffer());
    if (!audio.byteLength) return { ok: false, status: 502, detail: 'ElevenLabs returned no audio' };
    return { ok: true, status: 200, audio };
  }
  // ElevenLabs errors look like { detail: { status, message } } or { detail: [{ msg }] }
  let detail = '';
  let detailCode = '';
  try {
    const body = (await r.json()) as { detail?: unknown };
    const d = body?.detail as any;
    if (typeof d === 'string') detail = d;
    else if (Array.isArray(d)) detail = d.map((x) => x?.msg).filter(Boolean).join('; ');
    else if (d && typeof d === 'object') {
      detail = String(d.message ?? '');
      detailCode = String(d.status ?? d.code ?? '');
    }
  } catch {
    /* not JSON */
  }
  return { ok: false, status: r.status, detail: detail.slice(0, 240), detailCode: detailCode.slice(0, 60) };
}

const isVoiceProblem = (r: ElevenResult) => r.status === 404 || /voice/i.test(r.detailCode ?? '') || /voice[_ ]?(id)? ?(not|was not) found|voice_not_found/i.test(r.detail ?? '');

/** Try the expressive model, retry without voice_settings, then fall back to the stable model. */
async function synthesize(req: TtsRequest, models: string[]): Promise<{ result: ElevenResult; model: string }> {
  let last: { result: ElevenResult; model: string } = { result: { ok: false, status: 500, detail: 'No model tried' }, model: models[0] };
  for (const model of models) {
    let r = await elevenLabs(req, model, true);
    if (!r.ok && (r.status === 400 || r.status === 422) && !isVoiceProblem(r)) r = await elevenLabs(req, model, false);
    last = { result: r, model };
    if (r.ok) return last;
    // problems the next model can't fix
    if (r.status === 401 || r.status === 429 || isVoiceProblem(r) || r.status >= 500) return last;
    if (model === PRIMARY_MODEL && model !== FALLBACK_MODEL) primaryDisabledUntil = Date.now() + 10 * 60_000;
  }
  return last;
}

function mapElevenError(r: ElevenResult): Response {
  const why = r.detail ? `: ${r.detail}` : '';
  if (r.status === 401 && /quota|credit|limit/i.test(`${r.detailCode ?? ''} ${r.detail ?? ''}`)) {
    return fail(402, 'ElevenLabs monthly credits are used up — saved lines still play; new lines need more credits', 'quota');
  }
  if (r.status === 401) return fail(502, 'ElevenLabs rejected the API key (check the ELEVENLABS_API_KEY secret)', 'bad_key');
  if (isVoiceProblem(r)) return fail(422, `This voice is not available on the ElevenLabs account${why}`, 'voice_unavailable');
  if (r.status === 402 || r.status === 403) return fail(402, `ElevenLabs refused the request (plan or quota)${why}`, 'quota');
  if (r.status === 429) return fail(503, 'ElevenLabs is busy or the quota is used up — try again shortly', 'busy');
  if (r.status === 504) return fail(504, 'ElevenLabs timed out', 'timeout');
  return fail(502, `ElevenLabs error (HTTP ${r.status})${why}`, 'upstream');
}

const inflight = new Map<string, Promise<Response>>();

async function handleTts(req: TtsRequest): Promise<Response> {
  const voiceId = VOICE_REMAP[req.voiceId] ?? req.voiceId;
  const r: TtsRequest = { ...req, voiceId };
  const usePrimary = req.modelHint !== 'stable' && Date.now() >= primaryDisabledUntil;
  const models = usePrimary && PRIMARY_MODEL !== FALLBACK_MODEL ? [PRIMARY_MODEL, FALLBACK_MODEL] : [FALLBACK_MODEL];

  const key = await ttsCacheKey(models[0], r);
  const hit = await cachedUrl(key);
  if (hit) return json({ url: hit, cached: true, model: models[0] }, 200, { 'x-tts-cache': 'hit', 'x-tts-model': models[0] });

  if (!ELEVEN_KEY) return fail(503, 'Realistic voices are not configured (ELEVENLABS_API_KEY secret is missing)', 'not_configured');
  if (capRemaining() < r.text.length) return fail(429, 'Daily voice budget used up — using built-in voices until tomorrow', 'daily_cap');

  const existing = inflight.get(key);
  if (existing) return (await existing).clone();

  const work = (async () => {
    capUsed += r.text.length; // count attempts too: failed calls can still cost credits
    const { result, model } = await synthesize(r, models);
    if (!result.ok || !result.audio) return mapElevenError(result);
    const storeKey = model === models[0] ? key : await ttsCacheKey(model, r);
    const url = await upload(storeKey, result.audio);
    if (url) return json({ url, cached: false, model }, 200, { 'x-tts-cache': 'miss', 'x-tts-model': model });
    // Storage unavailable: send the audio itself
    return new Response(result.audio, {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'x-tts-cache': 'none', 'x-tts-model': model },
    });
  })();
  inflight.set(key, work);
  try {
    return (await work).clone();
  } finally {
    inflight.delete(key);
  }
}

// ---------------------------------------------------------------------------

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

    const url = new URL(request.url);
    if (request.method === 'GET') {
      if (url.searchParams.has('health')) {
        return json({
          ok: true,
          configured: !!ELEVEN_KEY,
          storage: !!(SUPABASE_URL && SERVICE_KEY),
          model: PRIMARY_MODEL,
          fallbackModel: FALLBACK_MODEL,
          dailyCharCap: DAILY_CAP,
          dailyCharsLeft: Math.max(0, capRemaining()),
        });
      }
      return fail(405, 'Use POST', 'method');
    }
    if (request.method !== 'POST') return fail(405, 'Use POST', 'method');

    const ip = (request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown').trim();
    if (rateLimited(ip)) return fail(429, 'Too many voice requests — slow down a little', 'rate_limited');

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail(413, 'Request too large', 'too_large');
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(400, 'Body must be JSON', 'bad_json');
    }
    const v = validateTtsRequest(body);
    if (!v.ok) return fail(400, v.error, 'bad_request');
    return await handleTts(v.value);
  } catch (e) {
    console.error('[tts] unexpected error', e instanceof Error ? e.message : e);
    return fail(500, 'Voice service error', 'internal');
  }
});
