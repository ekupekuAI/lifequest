import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearVoiceCache, getSavedVoice, saveVoice, voiceCacheId, voiceCacheStats, VOICE_CACHE_MAX } from '../src/core/voiceCache';

// Minimal in-memory stand-ins for the browser Cache Storage + localStorage APIs.
function installFakes() {
  const stores = new Map<string, Map<string, Response>>();
  const cacheFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (req: Request) => m.get(req.url)?.clone(),
      put: async (req: Request, res: Response) => void m.set(req.url, res),
      delete: async (req: Request) => m.delete(req.url),
      keys: async () => [...m.keys()].map((u) => new Request(u)),
    };
  };
  (globalThis as any).caches = { open: async (n: string) => cacheFor(n), delete: async (n: string) => stores.delete(n) };
  const ls = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, v),
    removeItem: (k: string) => void ls.delete(k),
  };
  return stores;
}

const mp3 = (n: number) => new Blob([new Uint8Array(n).fill(7)], { type: 'audio/mpeg' });

describe('voiceCache', () => {
  beforeEach(() => installFakes());
  afterEach(() => {
    delete (globalThis as any).caches;
    delete (globalThis as any).localStorage;
  });

  it('hashes the same line to the same id and different lines apart', () => {
    expect(voiceCacheId('eleven_v3|abc|cheerful|Hello')).toBe(voiceCacheId('eleven_v3|abc|cheerful|Hello'));
    expect(voiceCacheId('eleven_v3|abc|cheerful|Hello')).not.toBe(voiceCacheId('eleven_v3|abc|worried|Hello'));
    expect(voiceCacheId('x')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('misses before saving and hits after, returning the same audio', async () => {
    expect(await getSavedVoice('line-1')).toBeNull();
    expect(await saveVoice('line-1', mp3(1234))).toBe(true);
    const hit = await getSavedVoice('line-1');
    expect(hit?.size).toBe(1234);
  });

  it('reports counts and size, and clears everything', async () => {
    await saveVoice('a', mp3(100));
    await saveVoice('b', mp3(250));
    expect(await voiceCacheStats()).toEqual({ count: 2, bytes: 350, supported: true });
    await clearVoiceCache();
    expect(await voiceCacheStats()).toEqual({ count: 0, bytes: 0, supported: true });
    expect(await getSavedVoice('a')).toBeNull();
  });

  it('evicts the least recently used lines beyond the cap', async () => {
    let t = 1_000;
    const realNow = Date.now;
    Date.now = () => ++t;
    try {
      for (let i = 0; i < VOICE_CACHE_MAX; i++) await saveVoice(`line-${i}`, mp3(10));
      await getSavedVoice('line-0'); // touch the oldest so it survives
      await saveVoice('newest', mp3(10));
      const stats = await voiceCacheStats();
      expect(stats.count).toBe(VOICE_CACHE_MAX);
      expect(await getSavedVoice('line-0')).not.toBeNull();
      expect(await getSavedVoice('line-1')).toBeNull(); // least recently used was dropped
      expect(await getSavedVoice('newest')).not.toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it('degrades gracefully when the browser has no Cache Storage', async () => {
    delete (globalThis as any).caches;
    expect(await getSavedVoice('a')).toBeNull();
    expect(await saveVoice('a', mp3(10))).toBe(false);
    expect((await voiceCacheStats()).supported).toBe(false);
    await expect(clearVoiceCache()).resolves.toBeUndefined();
  });
});
