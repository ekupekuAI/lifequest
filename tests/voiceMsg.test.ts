import { describe, expect, it } from 'vitest';
import {
  CallQueue,
  MIME_CANDIDATES,
  RING_MS,
  UrlCache,
  URL_TTL_MS,
  formatVoiceDuration,
  isVoice,
  micErrorMessage,
  pickMimeType,
  recordingSupport,
  silentWavDataUri,
  waveBars,
} from '../src/core/voiceMsg';
import type { FamilyMessage } from '../src/services/family';

const msg = (id: string, over: Partial<FamilyMessage> = {}): FamilyMessage => ({
  id,
  fromGameMemberId: 'mother-0',
  fromName: 'Mum',
  toGameMemberId: null,
  text: '🎤 Voice message (3 s)',
  createdAt: new Date(Date.UTC(2026, 9, 17, 10, 0, Number(id.replace(/\D/g, '')) || 0)).toISOString(),
  audioPath: `fam/${id}.webm`,
  durationMs: 3000,
  ...over,
});

describe('formatVoiceDuration', () => {
  it('formats m:ss and rounds to the nearest second', () => {
    expect(formatVoiceDuration(0)).toBe('0:00');
    expect(formatVoiceDuration(7300)).toBe('0:07');
    expect(formatVoiceDuration(29_600)).toBe('0:30');
    expect(formatVoiceDuration(65_000)).toBe('1:05');
  });
  it('never shows negatives or NaN', () => {
    expect(formatVoiceDuration(-500)).toBe('0:00');
    expect(formatVoiceDuration(Number.NaN)).toBe('0:00');
    expect(formatVoiceDuration(Infinity)).toBe('0:00');
  });
});

describe('pickMimeType', () => {
  it('prefers webm/opus (Chrome, Firefox)', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus');
  });
  it('falls back to mp4 on Safari', () => {
    expect(pickMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4');
  });
  it('falls back to ogg, then to the browser default', () => {
    expect(pickMimeType((t) => t.startsWith('audio/ogg'))).toBe('audio/ogg;codecs=opus');
    expect(pickMimeType(() => false)).toBe('');
    expect(pickMimeType(undefined)).toBe('');
  });
  it('survives isTypeSupported throwing', () => {
    expect(
      pickMimeType((t) => {
        if (t.includes('webm')) throw new Error('nope');
        return true;
      }),
    ).toBe('audio/mp4');
    expect(MIME_CANDIDATES[0]).toBe('audio/webm;codecs=opus');
  });
});

describe('mic support + errors', () => {
  it('detects unsupported / insecure browsers', () => {
    expect(recordingSupport({ mediaDevices: { getUserMedia() {} }, MediaRecorder: function () {}, isSecureContext: true })).toBeNull();
    expect(recordingSupport({ mediaDevices: undefined, MediaRecorder: function () {} })).toBe('unsupported');
    expect(recordingSupport({ mediaDevices: { getUserMedia() {} }, MediaRecorder: undefined })).toBe('unsupported');
    expect(recordingSupport({ mediaDevices: { getUserMedia() {} }, MediaRecorder: function () {}, isSecureContext: false })).toBe('insecure');
  });
  it('explains a blocked microphone in plain words', () => {
    expect(micErrorMessage({ name: 'NotAllowedError' })).toMatch(/Microphone blocked — allow it in the browser's address bar/);
    expect(micErrorMessage({ name: 'NotFoundError' })).toMatch(/No microphone/);
    expect(micErrorMessage({ name: 'unsupported' })).toMatch(/aren't supported/);
    expect(micErrorMessage(new Error('weird'))).toMatch(/Couldn't start/);
  });
  it('isVoice only accepts messages with an audio path', () => {
    expect(isVoice(msg('a1'))).toBe(true);
    expect(isVoice(msg('a2', { audioPath: undefined }))).toBe(false);
    expect(isVoice(null)).toBe(false);
  });
});

describe('CallQueue', () => {
  it('rings one call at a time and queues the rest', () => {
    const q = new CallQueue(() => 0);
    expect(q.incoming(msg('m1'))).toBe(true);
    expect(q.incoming(msg('m2'))).toBe(true);
    const s = q.getSnapshot();
    expect(s.current?.msg.id).toBe('m1');
    expect(s.current?.phase).toBe('ringing');
    expect(s.queued).toBe(1);
  });

  it('ignores duplicates and text messages', () => {
    const q = new CallQueue(() => 0);
    q.incoming(msg('m1'));
    expect(q.incoming(msg('m1'))).toBe(false);
    expect(q.incoming(msg('t1', { audioPath: undefined }))).toBe(false);
    expect(q.getSnapshot().queued).toBe(0);
  });

  it('answer → active, hang up → next call rings (with a fresh ring timer)', () => {
    let now = 0;
    const q = new CallQueue(() => now);
    q.incoming(msg('m1'));
    q.incoming(msg('m2'));
    q.answer();
    expect(q.getSnapshot().current?.phase).toBe('active');
    expect(q.getSnapshot().inbox[0]).toMatchObject({ missed: false, heard: true });
    now = 50_000;
    q.hangUp();
    const s = q.getSnapshot();
    expect(s.current?.msg.id).toBe('m2');
    expect(s.current?.phase).toBe('ringing');
    expect(s.current?.since).toBe(50_000);
    expect(q.tick()).toBe(false);
  });

  it('decline or ringing out makes a missed call (badge count)', () => {
    let now = 0;
    const q = new CallQueue(() => now);
    q.incoming(msg('m1'));
    q.incoming(msg('m2'));
    q.miss();
    expect(q.getSnapshot().missed).toBe(1);
    now = RING_MS - 1;
    expect(q.tick()).toBe(false);
    now = RING_MS + 5;
    expect(q.tick()).toBe(true);
    const s = q.getSnapshot();
    expect(s.current).toBeNull();
    expect(s.missed).toBe(2);
    q.markHeard('m1');
    expect(q.getSnapshot().missed).toBe(1);
  });

  it('a call that is already active is not "missed" by tick', () => {
    let now = 0;
    const q = new CallQueue(() => now);
    q.incoming(msg('m1'));
    q.answer();
    now = RING_MS * 3;
    expect(q.tick()).toBe(false);
    expect(q.getSnapshot().current?.phase).toBe('active');
  });

  it('backfills offline notes newest first, only new ones count as missed', () => {
    const q = new CallQueue(() => 0);
    q.backfill([msg('m1'), msg('m2'), msg('t3', { audioPath: undefined }), msg('m4')], (m) => m.id !== 'm1');
    const s = q.getSnapshot();
    expect(s.inbox.map((i) => i.msg.id)).toEqual(['m4', 'm2', 'm1']);
    expect(s.missed).toBe(2);
    // a live duplicate of a backfilled note doesn't ring again
    expect(q.incoming(msg('m2'))).toBe(false);
  });

  it('notifies subscribers with a new snapshot object', () => {
    const q = new CallQueue(() => 0);
    let n = 0;
    const off = q.subscribe(() => n++);
    const before = q.getSnapshot();
    q.incoming(msg('m1'));
    expect(n).toBe(1);
    expect(q.getSnapshot()).not.toBe(before);
    q.setInboxOpen(true);
    expect(q.getSnapshot().inboxOpen).toBe(true);
    off();
    q.miss();
    expect(n).toBe(2);
  });
});

describe('UrlCache', () => {
  it('reuses a signed URL for ~50 min and shares in-flight requests', async () => {
    let now = 0;
    let calls = 0;
    const c = new UrlCache(async (p) => `https://x/${p}?v=${++calls}`, () => now);
    const [a, b] = await Promise.all([c.get('p1'), c.get('p1')]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    now = URL_TTL_MS - 1;
    expect(await c.get('p1')).toBe(a);
    now = URL_TTL_MS + 1;
    expect(c.peek('p1')).toBeNull();
    expect(await c.get('p1')).not.toBe(a);
    expect(calls).toBe(2);
  });
  it('does not cache failures', async () => {
    let fail = true;
    const c = new UrlCache(async () => {
      if (fail) throw new Error('offline');
      return 'ok';
    });
    await expect(c.get('p')).rejects.toThrow('offline');
    fail = false;
    expect(await c.get('p')).toBe('ok');
  });
});

describe('audio helpers', () => {
  it('builds a valid silent WAV data URI', () => {
    const uri = silentWavDataUri(16);
    expect(uri.startsWith('data:audio/wav;base64,')).toBe(true);
    const bin = atob(uri.split(',')[1]);
    expect(bin.slice(0, 4)).toBe('RIFF');
    expect(bin.slice(8, 12)).toBe('WAVE');
    expect(bin.length).toBe(44 + 32);
  });
  it('waveform bars are deterministic and in range', () => {
    const a = waveBars('abc');
    expect(a).toEqual(waveBars('abc'));
    expect(a).toHaveLength(28);
    expect(a.every((h) => h >= 0.2 && h <= 1)).toBe(true);
    expect(waveBars('xyz')).not.toEqual(a);
  });
});
