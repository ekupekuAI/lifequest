// Voice casting for the realistic (ElevenLabs) voices: who sounds like whom.
// Pure — no store or network access — so it's easy to test and reason about.
//
// The defaults use ElevenLabs "default" (formerly "premade") voices. ElevenLabs says
// default voices are only available to accounts created before March 2026 and expire on
// 31 Dec 2026, so every voice here can be replaced per character in Settings → Advanced,
// or for everyone at once with the `TTS_VOICE_REMAP` secret on the edge function.
// Region-native voices (Indian, Nigerian, Japanese, Brazilian, Mexican English) can be
// added from the ElevenLabs Voice Library the same way, by pasting their voice IDs.
import type { RegionId, Role, VoiceProfile } from '../domain/types';
import type { Accent } from './ttsShared';
import { VOICE_ID_RE, normalizeSpeed } from './ttsShared';

export interface CastVoice {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  age: 'young' | 'adult' | 'elder';
  accent: 'american' | 'british' | 'australian' | 'transatlantic';
}

const v = (name: string, id: string, gender: CastVoice['gender'], age: CastVoice['age'], accent: CastVoice['accent']): CastVoice => ({ id, name, gender, age, accent });

/** ElevenLabs default voices used for casting (IDs cross-checked against public voice lists, Oct 2026). */
export const ELEVEN_VOICES = {
  Roger: v('Roger', 'CwhRBWXzGAHq8TQ4Fs17', 'male', 'adult', 'american'),
  Sarah: v('Sarah', 'EXAVITQu4vr4xnSDxMaL', 'female', 'young', 'american'),
  Laura: v('Laura', 'FGY2WhTYpPnrIDTdsKH5', 'female', 'young', 'american'),
  Charlie: v('Charlie', 'IKne3meq5aSn9XLyUdCD', 'male', 'young', 'australian'),
  George: v('George', 'JBFqnCBsd6RMkjVDRZzb', 'male', 'adult', 'british'),
  Callum: v('Callum', 'N2lVS1w4EtoT3dr4eOWO', 'male', 'adult', 'transatlantic'),
  River: v('River', 'SAz9YHcvj6GT2YYXdXww', 'neutral', 'adult', 'american'),
  Harry: v('Harry', 'SOYHLrjzK2X1ezoPC6cr', 'male', 'young', 'american'),
  Liam: v('Liam', 'TX3LPaxmHKxFdv7VOQHJ', 'male', 'young', 'american'),
  Alice: v('Alice', 'Xb7hH8MSUJpSbSDYk0k2', 'female', 'adult', 'british'),
  Matilda: v('Matilda', 'XrExE9yKIg1WjnnlVkGX', 'female', 'adult', 'american'),
  Will: v('Will', 'bIHbv24MWmeRgasZH58o', 'male', 'young', 'american'),
  Jessica: v('Jessica', 'cgSgspJ2msm6clMCkdW9', 'female', 'young', 'american'),
  Eric: v('Eric', 'cjVigY5qzO86Huf0OWal', 'male', 'adult', 'american'),
  Chris: v('Chris', 'iP95p4xoKVk53GoZ742B', 'male', 'adult', 'american'),
  Brian: v('Brian', 'nPczCjzI2devNBz1zQrb', 'male', 'adult', 'american'),
  Daniel: v('Daniel', 'onwK4e9ZLuTAKqWW03F9', 'male', 'adult', 'british'),
  Lily: v('Lily', 'pFZP5JQG7iQjIQuC4Bku', 'female', 'adult', 'british'),
  Bill: v('Bill', 'pqHfZKP75CvOlQylNhV4', 'male', 'elder', 'american'),
} as const satisfies Record<string, CastVoice>;

export type VoiceName = keyof typeof ELEVEN_VOICES;
const BY_ID: Record<string, CastVoice> = Object.fromEntries(Object.values(ELEVEN_VOICES).map((x) => [x.id, x]));

/** Display name for a voice id ("Matilda"), or the id itself for custom voices. */
export function voiceLabel(id: string): string {
  return BY_ID[id]?.name ?? id;
}

export type CastCategory =
  | 'child-girl'
  | 'child-boy'
  | 'teen-girl'
  | 'teen-boy'
  | 'adult-female'
  | 'adult-male'
  | 'elder-female'
  | 'elder-male'
  | 'narrator'
  | 'neutral';

/** Preferred voices per category: [region-accent tier, everyone else]. British first for UK/EU. */
const POOLS: Record<CastCategory, { british: VoiceName[]; american: VoiceName[] }> = {
  // the youngest-sounding default voices; no default voice is an actual child
  'child-girl': { british: ['Jessica', 'Laura'], american: ['Jessica', 'Laura'] },
  'child-boy': { british: ['Will', 'Liam'], american: ['Will', 'Liam'] },
  'teen-girl': { british: ['Laura', 'Jessica', 'Sarah'], american: ['Laura', 'Jessica', 'Sarah'] },
  'teen-boy': { british: ['Charlie', 'Liam', 'Will', 'Harry'], american: ['Liam', 'Will', 'Harry', 'Charlie'] },
  'adult-female': { british: ['Alice', 'Lily'], american: ['Matilda', 'Sarah'] },
  'adult-male': { british: ['George', 'Daniel', 'Callum'], american: ['Chris', 'Eric', 'Roger', 'Brian'] },
  'elder-female': { british: ['Lily', 'Alice'], american: ['Matilda', 'Sarah'] },
  'elder-male': { british: ['George', 'Daniel'], american: ['Bill', 'Brian'] },
  narrator: { british: ['Daniel', 'Lily'], american: ['River', 'Matilda'] },
  neutral: { british: ['River', 'Laura', 'Liam'], american: ['River', 'Laura', 'Liam'] },
};

const BRITISH_REGIONS: RegionId[] = ['uk', 'eu'];

/** Voices for a category, best match for the region first. */
export function poolFor(category: CastCategory, regionId: RegionId): CastVoice[] {
  const p = POOLS[category];
  const british = BRITISH_REGIONS.includes(regionId);
  const first = british ? p.british : p.american;
  const rest = (british ? p.american : p.british).filter((n) => !first.includes(n));
  return [...first, ...rest].map((n) => ELEVEN_VOICES[n]);
}

/** Accent hint sent to expressive models so default (US/UK) voices fit the region better. */
export function accentFor(regionId: RegionId): Accent {
  switch (regionId) {
    case 'in':
      return 'indian';
    case 'ng':
      return 'nigerian';
    case 'jp':
      return 'japanese';
    case 'br':
      return 'brazilian';
    case 'mx':
      return 'mexican';
    default:
      return 'none';
  }
}

/** ElevenLabs speed (0.8–1.15) from the browser-speech rate of a profile. */
export function speedFor(profile: Pick<VoiceProfile, 'rate'> | null | undefined): number {
  const rate = profile && Number.isFinite(profile.rate) ? profile.rate : 1;
  return normalizeSpeed(1 + (rate - 1) * 0.5);
}

export interface CastSpeaker {
  /** speaker key: member id (`mother-0`), `npc:<key>`, `name:<Name>` or `narrator` */
  key: string;
  role?: Role;
  kind?: VoiceProfile['kind'];
}

const isMaleKind = (k?: VoiceProfile['kind']) => k === 'male' || k === 'elder-male';
const isFemaleKind = (k?: VoiceProfile['kind']) => k === 'female' || k === 'elder-female';

/** Which kind of voice a speaker needs. */
export function categoryFor(s: CastSpeaker): CastCategory {
  if (s.key === 'narrator') return 'narrator';
  const k = s.kind;
  switch (s.role) {
    case 'mother':
    case 'guardian':
      return isMaleKind(k) ? 'adult-male' : 'adult-female';
    case 'father':
      return isFemaleKind(k) ? 'adult-female' : 'adult-male';
    case 'older-sibling':
      return isFemaleKind(k) ? 'teen-girl' : 'teen-boy';
    case 'younger-sibling':
      return isMaleKind(k) ? 'child-boy' : 'child-girl';
    case 'grandparent':
      return isMaleKind(k) ? 'elder-male' : 'elder-female';
    case 'player':
      return isMaleKind(k) ? 'teen-boy' : isFemaleKind(k) ? 'teen-girl' : 'neutral';
    case 'partner':
      return isMaleKind(k) ? 'teen-boy' : 'teen-girl';
    default:
      break;
  }
  switch (k) {
    case 'female':
      return 'adult-female';
    case 'male':
      return 'adult-male';
    case 'elder-female':
      return 'elder-female';
    case 'elder-male':
      return 'elder-male';
    case 'child':
      return 'child-girl';
    default:
      return 'neutral';
  }
}

/** FNV-1a 32-bit (same as voice.ts) — stable across sessions. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Candidate order for one speaker: rotate inside the region tier by a stable hash, then the rest. */
function candidates(s: CastSpeaker, regionId: RegionId): CastVoice[] {
  const cat = categoryFor(s);
  const pool = poolFor(cat, regionId);
  const british = BRITISH_REGIONS.includes(regionId);
  const tierLen = (british ? POOLS[cat].british : POOLS[cat].american).length;
  const tier = pool.slice(0, tierLen);
  const rest = pool.slice(tierLen);
  const rot = (arr: CastVoice[]) => (arr.length ? arr.map((_, i) => arr[(i + (hash(s.key) % arr.length)) % arr.length]) : arr);
  return [...rot(tier), ...rot(rest)];
}

export type CastOverrides = Record<string, string> | undefined | null;

function validOverride(overrides: CastOverrides, key: string): string | undefined {
  const id = overrides?.[key];
  return typeof id === 'string' && VOICE_ID_RE.test(id.trim()) ? id.trim() : undefined;
}

/** Who picks first: narrator, parents/guardian, grandparent, siblings, player, townsfolk, others. */
function priority(s: CastSpeaker): number {
  if (s.key === 'narrator') return 0;
  if (s.key.startsWith('name:')) return 7;
  if (s.key.startsWith('npc:')) return 6;
  switch (s.role) {
    case 'mother':
    case 'father':
    case 'guardian':
      return 1;
    case 'grandparent':
      return 2;
    case 'older-sibling':
    case 'younger-sibling':
      return 3;
    case 'player':
      return 4;
    default:
      return 5;
  }
}

/**
 * Assign a voice id to every speaker. Deterministic (independent of input order); speakers of the
 * same kind get different voices while the pool lasts. Overrides (speakerKey → voiceId) win.
 */
export function buildCast(speakers: CastSpeaker[], regionId: RegionId, overrides?: CastOverrides): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  const unique = Array.from(new Map(speakers.map((s) => [s.key, s])).values());
  for (const s of unique) {
    const o = validOverride(overrides, s.key);
    if (o) {
      out[s.key] = o;
      used.add(o);
    }
  }
  const order = unique.filter((s) => !out[s.key]).sort((a, b) => priority(a) - priority(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const s of order) {
    const c = candidates(s, regionId);
    const pick = c.find((x) => !used.has(x.id)) ?? c[0];
    out[s.key] = pick.id;
    used.add(pick.id);
  }
  return out;
}

/**
 * Voice for one speaker. With `cast` (the result of buildCast for the known characters) a new
 * speaker avoids voices already taken, without changing anyone else's voice.
 */
export function castVoice(speaker: CastSpeaker, regionId: RegionId, overrides?: CastOverrides, cast?: Record<string, string>): string {
  const o = validOverride(overrides, speaker.key);
  if (o) return o;
  if (cast?.[speaker.key]) return cast[speaker.key];
  const c = candidates(speaker, regionId);
  const taken = new Set(Object.values(cast ?? {}));
  return (c.find((x) => !taken.has(x.id)) ?? c[0]).id;
}
