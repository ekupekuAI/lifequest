// Persistent on-device cache of generated voice lines (browser Cache Storage).
// Once a line has been heard on this device it replays from here — no request to
// Supabase or ElevenLabs, and it works offline. Best effort: every function
// resolves (never rejects) and the game behaves normally when storage is blocked.

const CACHE_NAME = 'lifequest-voices-v1';
const INDEX_KEY = 'lifequest.voiceCache.index.v1';
/** ~25–40 KB per line → roughly 10–16 MB at the cap */
export const VOICE_CACHE_MAX = 400;
const ORIGIN = 'https://voice-cache.lifequest.invalid/';

type Index = Record<string, number>; // hashed key → last used (ms)

function storageOk(): boolean {
  try {
    return typeof caches !== 'undefined' && typeof caches.open === 'function';
  } catch {
    return false;
  }
}

/** Stable 64-bit FNV-1a hash (two 32-bit lanes) of the line's cache input → hex. */
export function voiceCacheId(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

const requestFor = (id: string) => new Request(`${ORIGIN}${id}.mp3`);

function readIndex(): Index {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const v = raw ? (JSON.parse(raw) as Index) : {};
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeIndex(idx: Index) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {
    /* storage full or blocked — the cache still works, just without LRU order */
  }
}

/** Returns the saved audio for this line, or null. */
export async function getSavedVoice(input: string): Promise<Blob | null> {
  if (!storageOk()) return null;
  const id = voiceCacheId(input);
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(requestFor(id));
    if (!hit) return null;
    const blob = await hit.blob();
    if (!blob.size) return null;
    const idx = readIndex();
    idx[id] = Date.now();
    writeIndex(idx);
    return blob;
  } catch {
    return null;
  }
}

/** Save a line's audio on this device (evicting the least recently used beyond the cap). */
export async function saveVoice(input: string, blob: Blob): Promise<boolean> {
  if (!storageOk() || !blob.size) return false;
  const id = voiceCacheId(input);
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(requestFor(id), new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg', 'Content-Length': String(blob.size) } }));
    const idx = readIndex();
    idx[id] = Date.now();
    const ids = Object.keys(idx);
    if (ids.length > VOICE_CACHE_MAX) {
      const oldest = ids.sort((a, b) => idx[a] - idx[b]).slice(0, ids.length - VOICE_CACHE_MAX);
      for (const old of oldest) {
        delete idx[old];
        await cache.delete(requestFor(old));
      }
    }
    writeIndex(idx);
    return true;
  } catch {
    return false; // quota exceeded / private mode — playback is unaffected
  }
}

/** Fetch a resolved audio URL (public Storage URL or blob:) and save it. */
export async function saveVoiceFromUrl(input: string, url: string): Promise<void> {
  try {
    const r = await fetch(url);
    if (!r.ok) return;
    await saveVoice(input, await r.blob());
  } catch {
    /* offline or CORS — skip */
  }
}

/** Number of saved lines and their total size in bytes. */
export async function voiceCacheStats(): Promise<{ count: number; bytes: number; supported: boolean }> {
  if (!storageOk()) return { count: 0, bytes: 0, supported: false };
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    let bytes = 0;
    for (const k of keys) {
      const r = await cache.match(k);
      const len = Number(r?.headers.get('Content-Length') ?? 0);
      bytes += Number.isFinite(len) && len > 0 ? len : (await r?.clone().blob())?.size ?? 0;
    }
    return { count: keys.length, bytes, supported: true };
  } catch {
    return { count: 0, bytes: 0, supported: false };
  }
}

/** Delete every saved line from this device. */
export async function clearVoiceCache(): Promise<void> {
  try {
    if (storageOk()) await caches.delete(CACHE_NAME);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(INDEX_KEY);
  } catch {
    /* ignore */
  }
}
