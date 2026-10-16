import { describe, expect, it } from 'vitest';
import { inferEmotion, moodToEmotion } from '../src/core/emotion';
import {
  ELEVEN_VOICES,
  accentFor,
  buildCast,
  castVoice,
  categoryFor,
  poolFor,
  speedFor,
  type CastSpeaker,
} from '../src/core/voiceCast';
import {
  EMOTIONS,
  FALLBACK_MODEL,
  MAX_TTS_CHARS,
  buildElevenLabsBody,
  normalizeSpeed,
  sha256Hex,
  supportsAudioTags,
  ttsCacheInput,
  ttsCacheKey,
  validateTtsRequest,
  voiceSettingsFor,
} from '../src/core/ttsShared';

const VOICE = ELEVEN_VOICES.Matilda.id;

describe('inferEmotion', () => {
  it.each([
    ['Hurry, the bus leaves in five minutes!', 'mother-0', 'worried'],
    ["Oh no, my wallet is missing!", 'father-1', 'worried'],
    ['Sorry! I bumped into you.', 'npc:cashier', 'apologetic'],
    ['Oops, wrong aisle 😅', 'older-sibling-2', 'apologetic'],
    ['Thank you, dear. Bless you.', 'npc:elder', 'warm'],
    ['Well done! You stayed under budget.', 'mother-0', 'proud'],
    ['We did it 🎉', 'younger-sibling-3', 'excited'],
    ['I got ALL the items!!', 'younger-sibling-3', 'excited'],
    ['Hey, no cutting in line 😠', 'npc:elder', 'angry'],
    ['How dare you push in front of everyone.', 'npc:cashier', 'angry'],
    ['Psst... the cookies are on the top shelf.', 'older-sibling-2', 'whisper'],
    ['Wow, the library is huge.', 'player', 'surprised'],
    ["I'm so tired after that long day.", 'father-1', 'tired'],
    ['Good morning! Ready for school?', 'mother-0', 'cheerful'],
    ['Which aisle has the rice?', 'npc:stocker', 'neutral'],
  ])('%s → %s', (text, key, expected) => {
    expect(inferEmotion(text, key)).toBe(expected);
  });

  it('treats narration as calm', () => {
    expect(inferEmotion('The shop is busy this morning!', 'narrator')).toBe('calm');
    expect(inferEmotion('You walk to the counter.', 'mother-0', { narration: true })).toBe('calm');
  });

  it('lets an explicit mood win, including synonyms', () => {
    expect(inferEmotion('Hurry up!', 'mother-0', { mood: 'proud' })).toBe('proud');
    expect(inferEmotion('Fine.', 'mother-0', { mood: 'Annoyed' })).toBe('angry');
    expect(moodToEmotion('nope')).toBeUndefined();
  });

  it('falls back to a speaker default when the line gives no clue', () => {
    expect(inferEmotion('Here are your groceries.', 'grandparent-4')).toBe('warm');
    expect(inferEmotion('Here are your groceries.', 'npc:clerk')).toBe('neutral');
  });

  it('always returns a supported emotion', () => {
    for (const t of ['', '!!!', '???', '🙂', 'ok', 'A'.repeat(500)]) expect(EMOTIONS).toContain(inferEmotion(t, 'npc:x'));
  });
});

const FAMILY: CastSpeaker[] = [
  { key: 'player', role: 'player', kind: 'neutral' },
  { key: 'mother-0', role: 'mother', kind: 'female' },
  { key: 'father-1', role: 'father', kind: 'male' },
  { key: 'older-sibling-2', role: 'older-sibling', kind: 'male' },
  { key: 'younger-sibling-3', role: 'younger-sibling', kind: 'child' },
  { key: 'grandparent-4', role: 'grandparent', kind: 'elder-female' },
  { key: 'npc:cashier', kind: 'female' },
  { key: 'npc:stocker', kind: 'male' },
  { key: 'npc:sharma', kind: 'elder-male' },
  { key: 'npc:cutter', kind: 'male' },
  { key: 'npc:elder', kind: 'elder-female' },
  { key: 'npc:receptionist', kind: 'female' },
  { key: 'npc:driver', kind: 'male' },
  { key: 'npc:librarian', kind: 'elder-female' },
  { key: 'npc:clerk', kind: 'male' },
  { key: 'narrator' },
];
const ALL_IDS = new Set(Object.values(ELEVEN_VOICES).map((v) => v.id));

describe('voiceCast', () => {
  it('is stable and independent of input order', () => {
    const a = buildCast(FAMILY, 'in');
    const b = buildCast([...FAMILY].reverse(), 'in');
    expect(a).toEqual(b);
    expect(buildCast(FAMILY, 'in')).toEqual(a);
    for (const id of Object.values(a)) expect(ALL_IDS.has(id)).toBe(true);
  });

  it('gives family members distinct voices, and two people of the same kind differ', () => {
    const cast = buildCast(FAMILY, 'us');
    const fam = FAMILY.filter((s) => !s.key.startsWith('npc:')).map((s) => cast[s.key]);
    expect(new Set(fam).size).toBe(fam.length);
    const two = buildCast(
      [
        { key: 'mother-0', role: 'mother', kind: 'female' },
        { key: 'guardian-1', role: 'guardian', kind: 'female' },
      ],
      'us',
    );
    expect(two['mother-0']).not.toBe(two['guardian-1']);
  });

  it('casts by age and gender', () => {
    const cast = buildCast(FAMILY, 'us');
    const byId = Object.fromEntries(Object.values(ELEVEN_VOICES).map((v) => [v.id, v]));
    expect(byId[cast['father-1']].gender).toBe('male');
    expect(byId[cast['mother-0']].gender).toBe('female');
    expect(byId[cast['younger-sibling-3']].age).toBe('young');
    expect(categoryFor({ key: 'grandparent-4', role: 'grandparent', kind: 'elder-male' })).toBe('elder-male');
    expect(categoryFor({ key: 'younger-sibling-3', role: 'younger-sibling', kind: 'male' })).toBe('child-boy');
  });

  it('prefers British voices for the UK and American ones for the US', () => {
    expect(poolFor('adult-female', 'uk')[0].accent).toBe('british');
    expect(poolFor('adult-female', 'us')[0].accent).toBe('american');
    const uk = buildCast(FAMILY, 'uk');
    expect(ELEVEN_VOICES.Alice.id === uk['mother-0'] || ELEVEN_VOICES.Lily.id === uk['mother-0']).toBe(true);
  });

  it('honours valid overrides and ignores invalid ones', () => {
    const custom = 'AbCdEfGhIj1234567890';
    const cast = buildCast(FAMILY, 'in', { 'mother-0': custom, 'father-1': 'bad id!' });
    expect(cast['mother-0']).toBe(custom);
    expect(ALL_IDS.has(cast['father-1'])).toBe(true);
    expect(castVoice({ key: 'mother-0', kind: 'female' }, 'in', { 'mother-0': custom })).toBe(custom);
  });

  it('casts an ad-hoc speaker without changing anyone else', () => {
    const cast = buildCast(FAMILY, 'us');
    const before = { ...cast };
    const id = castVoice({ key: 'name:Mrs Patel', kind: 'female' }, 'us', undefined, cast);
    expect(ALL_IDS.has(id)).toBe(true);
    expect(cast).toEqual(before);
    expect(castVoice({ key: 'name:Mrs Patel', kind: 'female' }, 'us', undefined, cast)).toBe(id);
  });

  it('maps regions to accent hints and rates to speeds', () => {
    expect(accentFor('in')).toBe('indian');
    expect(accentFor('ng')).toBe('nigerian');
    expect(accentFor('uk')).toBe('none');
    expect(speedFor({ rate: 1 })).toBe(1);
    expect(speedFor({ rate: 0.8 })).toBe(0.9);
    expect(speedFor({ rate: 2 })).toBe(1.15);
    expect(speedFor(null)).toBe(1);
  });
});

describe('tts cache key', () => {
  it('is a deterministic sha256 hex of model + voice + emotion + text', async () => {
    const req = { voiceId: VOICE, emotion: 'cheerful' as const, text: 'Hello there!' };
    const a = await ttsCacheKey('eleven_v3', req);
    const b = await ttsCacheKey('eleven_v3', { ...req, text: '  Hello   there! ' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a); // whitespace-normalised
    expect(await ttsCacheKey('eleven_v3', { ...req, emotion: 'worried' })).not.toBe(a);
    expect(await ttsCacheKey(FALLBACK_MODEL, req)).not.toBe(a);
    expect(await ttsCacheKey('eleven_v3', { ...req, voiceId: ELEVEN_VOICES.George.id })).not.toBe(a);
    expect(await ttsCacheKey('eleven_v3', { ...req, speed: 1 })).toBe(a);
    expect(await ttsCacheKey('eleven_v3', { ...req, accent: 'indian' })).not.toBe(a);
    expect(ttsCacheInput('eleven_v3', req)).toContain('Hello there!');
  });

  it('matches a known SHA-256 vector', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('validateTtsRequest', () => {
  const ok = { text: 'Hi!', voiceId: VOICE, emotion: 'warm' };

  it('accepts a good request and normalises it', () => {
    const r = validateTtsRequest({ ...ok, text: '  Hi!  ', speed: 1.33 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.text).toBe('Hi!');
      expect(r.value.speed).toBe(1.15);
      expect(r.value.accent).toBe('none');
      expect(r.value.emotion).toBe('warm');
    }
    const d = validateTtsRequest({ text: 'Hi', voiceId: VOICE });
    expect(d.ok && d.value.emotion).toBe('neutral');
  });

  it.each([
    [null, 'object'],
    [[], 'object'],
    [{ ...ok, text: 5 }, 'text'],
    [{ ...ok, text: '   ' }, 'empty'],
    [{ ...ok, text: 'a'.repeat(MAX_TTS_CHARS + 1) }, 'longer'],
    [{ ...ok, text: '!!! ...' }, 'nothing'],
    [{ ...ok, voiceId: 'short' }, 'voiceId'],
    [{ ...ok, voiceId: '../../etc/passwd00' }, 'voiceId'],
    [{ ...ok, emotion: 'furious' }, 'emotion'],
    [{ ...ok, accent: 'martian' }, 'accent'],
    [{ ...ok, speed: 'fast' }, 'speed'],
    [{ ...ok, modelHint: 'turbo' }, 'modelHint'],
  ])('rejects %j', (body, fragment) => {
    const r = validateTtsRequest(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(fragment);
  });

  it('accepts exactly the maximum length', () => {
    expect(validateTtsRequest({ ...ok, text: 'a'.repeat(MAX_TTS_CHARS) }).ok).toBe(true);
  });
});

describe('ElevenLabs request body', () => {
  const req = { text: 'We are late!', voiceId: VOICE, emotion: 'worried' as const, speed: 1, accent: 'indian' as const };

  it('prepends audio tags for the expressive model', () => {
    expect(supportsAudioTags('eleven_v3')).toBe(true);
    expect(supportsAudioTags('eleven_multilingual_v2')).toBe(false);
    const body = buildElevenLabsBody(req, 'eleven_v3');
    expect(body.model_id).toBe('eleven_v3');
    expect(body.text).toBe('[Indian English accent] [worried] We are late!');
    expect(buildElevenLabsBody({ ...req, emotion: 'neutral', accent: 'none' }, 'eleven_v3').text).toBe('We are late!');
    expect(buildElevenLabsBody(req, 'eleven_v3', false).voice_settings).toBeUndefined();
  });

  it('maps emotion to voice_settings for multilingual_v2 (no tags)', () => {
    const body = buildElevenLabsBody(req, FALLBACK_MODEL);
    expect(body.text).toBe('We are late!');
    const calm = voiceSettingsFor('calm');
    const angry = voiceSettingsFor('angry');
    expect(angry.stability).toBeLessThan(calm.stability);
    expect(angry.style).toBeGreaterThan(calm.style);
    expect(voiceSettingsFor('calm', 0.9).speed).toBe(0.9);
    expect(normalizeSpeed(0.5)).toBe(0.8);
  });
});
