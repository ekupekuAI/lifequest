// Character voices for dialogue. Four modes:
//  - neural: realistic, emotional ElevenLabs voices through the Supabase `tts` Edge Function
//            (falls back to speech, then babble, whenever a line can't play)
//  - speech: the browser's Web Speech API (system voices), one stable voice per character
//  - babble: Animal-Crossing-style syllable blips synthesised with WebAudio (works everywhere)
//  - off:    silent
// Nothing here is required for play — every call is guarded and fails silently.
import { store } from './store';
import { DEFAULT_VOICES, NPC_LOOKS } from '../domain/family';
import { region } from '../domain/region';
import type { Settings, VoiceProfile } from '../domain/types';
import {
  neuralAvailable,
  neuralLine,
  neuralLoadingKey,
  prefetch as neuralPrefetch,
  speakNeural,
  stop as stopNeural,
  subscribeNeural,
} from './neuralVoice';
import { inferEmotion, moodToEmotion, type Emotion } from './emotion';

export type VoiceMode = Settings['voice']['mode'];

export const NARRATOR_VOICE: VoiceProfile = { pitch: 1, rate: 0.95, kind: 'neutral' };
const FALLBACK_VOICE: VoiceProfile = { pitch: 1, rate: 1, kind: 'neutral' };

// ---------------------------------------------------------------------------
// helpers

/** FNV-1a 32-bit — stable across sessions so a character always sounds the same. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

// ---------------------------------------------------------------------------
// text normalisation

interface CurrencyWords {
  one: string;
  many: string;
  minorOne?: string;
  minorMany?: string;
}

const CURRENCY_WORDS: Record<string, CurrencyWords> = {
  INR: { one: 'rupee', many: 'rupees', minorOne: 'paisa', minorMany: 'paise' },
  USD: { one: 'dollar', many: 'dollars', minorOne: 'cent', minorMany: 'cents' },
  GBP: { one: 'pound', many: 'pounds', minorOne: 'penny', minorMany: 'pence' },
  EUR: { one: 'euro', many: 'euros', minorOne: 'cent', minorMany: 'cents' },
  NGN: { one: 'naira', many: 'naira', minorOne: 'kobo', minorMany: 'kobo' },
  JPY: { one: 'yen', many: 'yen' },
  BRL: { one: 'real', many: 'reais', minorOne: 'centavo', minorMany: 'centavos' },
  MXN: { one: 'peso', many: 'pesos', minorOne: 'centavo', minorMany: 'centavos' },
};

const SYMBOL_CODE: Record<string, string> = { '₹': 'INR', '£': 'GBP', '€': 'EUR', '₦': 'NGN', '¥': 'JPY', R$: 'BRL', Rs: 'INR', 'Rs.': 'INR' };

function currencyFor(symbol: string): CurrencyWords {
  let code = SYMBOL_CODE[symbol];
  if (!code) {
    // "$" is shared: follow the region when it uses a dollar-sign currency
    const rc = region().currency.code;
    code = rc === 'MXN' || rc === 'USD' ? rc : 'USD';
  }
  return CURRENCY_WORDS[code] ?? CURRENCY_WORDS.USD;
}

function sayAmount(symbol: string, intPart: string, frac: string | undefined, neg: boolean): string {
  const w = currencyFor(symbol);
  const major = intPart.replace(/[,\s]/g, '').replace(/^0+(?=\d)/, '');
  let minor = frac ? (frac.length === 1 ? frac + '0' : frac.slice(0, 2)) : '';
  if (/^0+$/.test(minor)) minor = '';
  const minorNum = minor ? String(Number(minor)) : '';
  let out: string;
  if (major === '0' && minorNum && w.minorOne) out = `${minorNum} ${minorNum === '1' ? w.minorOne : w.minorMany}`;
  else out = `${major} ${major === '1' ? w.one : w.many}${minorNum ? ' ' + minorNum : ''}`;
  return (neg ? 'minus ' : '') + out;
}

const SYM = 'R\\$|Rs\\.?|[₹$£€₦¥]';
const PREFIX_MONEY = new RegExp(`(-|−)?(${SYM})\\s?(\\d[\\d,]*)(?:\\.(\\d{1,2}))?(?!\\d)`, 'g');
const SUFFIX_MONEY = new RegExp(`(-|−)?(\\d[\\d,]*)(?:\\.(\\d{1,2}))?\\s?(R\\$|[₹£€₦¥])`, 'g');

/** Turn display text into something pleasant to hear. Exported for tests. */
export function normalizeForSpeech(raw: string): string {
  if (!raw) return '';
  let t = String(raw);
  t = t.replace(/<[^>]*>/g, ' '); // markup
  t = t.replace(/\{[^}]*\}/g, ' '); // unreplaced tokens
  t = t.replace(/[*_`~#|]+/g, ' '); // markdown-ish
  t = t.replace(/[[\]]/g, ' ');
  // money: "₹150" → "150 rupees", "$1.20" → "1 dollar 20", "-₹20" → "minus 20 rupees"
  t = t.replace(PREFIX_MONEY, (_m, neg, sym, int, frac) => sayAmount(sym, int, frac, !!neg));
  t = t.replace(SUFFIX_MONEY, (_m, neg, int, frac, sym) => sayAmount(sym, int, frac, !!neg));
  // arrows become a short pause; bullets/stars/ui glyphs disappear
  t = t.replace(/\s*[\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F\u2B00-\u2B2F\u2794-\u27BF]\s*/g, ', ');
  t = t.replace(/[\u25A0-\u25FF\u2600-\u26FF\u2700-\u2793\u2B50-\u2BFF\u2022\u00B7\u2219\u2300-\u23FF]/g, ' ');
  // emoji, flags, keycaps, variation selectors, joiners
  t = t.replace(/\p{Extended_Pictographic}/gu, ' ');
  t = t.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0E\uFE0F\u200D\u20E3]/gu, '');
  t = t.replace(/\s*&\s*/g, ' and ');
  t = t.replace(/(\d)\s*[x×]\s+(?=\p{L})/gu, '$1 '); // "2x milk" → "2 milk"
  // newlines → pauses
  t = t
    .split(/\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((s, i, all) => (i < all.length - 1 && !/[.!?…:;,]$/.test(s) ? s + '.' : s))
    .join(' ');
  t = t.replace(/\s+([,.!?;:])/g, '$1');
  t = t.replace(/([,;:])(?:\s*[,;:])+/g, '$1');
  t = t.replace(/^[\s,.;:]+/, '').replace(/[\s,;:]+$/, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return /[\p{L}\p{N}]/u.test(t) ? t : '';
}

/** Split into speakable chunks ≤ max chars (works around Chrome stopping long utterances). */
export function chunkText(text: string, max = 200): string[] {
  const sentences = text.split(/(?<=[.!?…]["')\]]*)\s+/).map((s) => s.trim()).filter(Boolean);
  const pieces: string[] = [];
  for (const s of sentences) {
    if (s.length <= max) {
      pieces.push(s);
      continue;
    }
    // long sentence: break at commas, then at spaces
    let rest = s;
    while (rest.length > max) {
      const slice = rest.slice(0, max);
      let cut = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf('; '));
      if (cut < max * 0.4) cut = slice.lastIndexOf(' ');
      if (cut <= 0) cut = max;
      pieces.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) pieces.push(rest);
  }
  // merge tiny neighbours so the voice doesn't stutter between short sentences
  const out: string[] = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && last.length + p.length + 1 <= max && last.length < 60) out[out.length - 1] = `${last} ${p}`;
    else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// system voice selection

type Gender = 'female' | 'male' | 'child' | 'unknown';

const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;
const CHILD_NAMES = /\b(ana|maisie|junior|child|kid|boy|girl)\b/i;
const FEMALE_NAMES =
  /\b(female|woman|zira|samantha|victoria|karen|moira|tessa|fiona|susan|hazel|heera|neerja|aria|jenny|sonia|libby|emma|ava|allison|serena|kate|veena|catherine|linda|eva|hedda|helena|sabina|paulina|monica|m[oó]nica|luciana|joana|francisca|kyoko|haruka|ayumi|sayaka|nanami|natasha|clara|elsa|salli|joanna|kendra|kimberly|ivy|amy|raveena|aditi|ezinne|michelle|elizabeth|ashley|cora|jane|nancy|sara|molly|olivia|isabella|amelie|anna|alice|ellen|laura|leah|lisa|nora|yuna|dalia|camila|vitoria|vit[oó]ria|thalita|google us english|google uk english female|google español de estados unidos)\b/i;
const MALE_NAMES =
  /\b(male|man|david|mark|daniel|alex|fred|george|james|ravi|prabhat|guy|ryan|thomas|oliver|rishi|aaron|arthur|tom|richard|paul|pablo|ra[uú]l|jorge|diego|juan|ichiro|keita|takumi|antonio|brian|joey|justin|matthew|russell|abeo|liam|christopher|eric|roger|steffan|andrew|brandon|davis|tony|jason|william|connor|kenji|naoki|henri|stefan|conrad|killian|lee|gordon|rocco|reed|jacques|luca|felipe|donato|fabio|google uk english male)\b/i;

function genderOf(v: SpeechSynthesisVoice): Gender {
  const n = `${v.name} ${v.voiceURI}`;
  if (CHILD_NAMES.test(v.name)) return 'child';
  // check "female" before "male" (substring)
  if (/female|woman/i.test(n)) return 'female';
  if (/\bmale\b|\bman\b/i.test(n)) return 'male';
  if (FEMALE_NAMES.test(v.name)) return 'female';
  if (MALE_NAMES.test(v.name)) return 'male';
  return 'unknown';
}

const normLang = (l: string) => (l || '').replace(/_/g, '-').toLowerCase();

function wantGender(kind: VoiceProfile['kind']): Gender[] {
  switch (kind) {
    case 'female':
    case 'elder-female':
      return ['female'];
    case 'male':
    case 'elder-male':
      return ['male'];
    case 'child':
      return ['child', 'female'];
    default:
      return ['female', 'male', 'unknown', 'child'];
  }
}

/** Key used for voice hashing & the "speaking" indicator. */
export function speakerKey(portraitKey?: string, speaker?: string): string {
  return portraitKey ?? (speaker ? `name:${speaker}` : 'narrator');
}

/** A named speaker without a portrait (e.g. someone in a queue): guess a voice from the name. */
function guessProfile(name: string): VoiceProfile {
  const n = name.toLowerCase();
  const h = hash(n);
  const wobble = ((h % 9) - 4) / 50;
  if (/\b(baby|child|kid|boy|girl|little)\b/.test(n)) return { pitch: 1.5 + wobble, rate: 1.1, kind: 'child' };
  if (/\b(grandma|granny|nan|elderly lady|old lady|grandmother|dadi|nani|oma|abuela|vov[oó])\b/.test(n)) return { pitch: 1 + wobble, rate: 0.82, kind: 'elder-female' };
  if (/\b(grandpa|grandfather|old man|elderly man|elderly gentleman|dada|opa|abuelo|vov[ôo])\b/.test(n)) return { pitch: 0.8 + wobble, rate: 0.85, kind: 'elder-male' };
  if (/\b(mrs|ms|miss|mother|mom|mum|aunt|aunty|auntie|lady|woman|madam|tia|t[ií]a|do[nñ]a|mama|sra)\b/.test(n)) return { pitch: 1.12 + wobble, rate: 1, kind: 'female' };
  if (/\b(mr|sir|man|father|dad|uncle|seu|don|sr|guy|gentleman)\b/.test(n)) return { pitch: 0.88 + wobble, rate: 1, kind: 'male' };
  return { pitch: 1 + wobble, rate: 1, kind: h % 2 ? 'female' : 'male' };
}

// ---------------------------------------------------------------------------
// the engine

interface SpeakItem {
  text: string;
  profile: VoiceProfile;
  key: string;
  /** explicit mood from the dialogue line */
  mood?: string;
  /** force an emotion (settings "Test emotions") */
  emotion?: Emotion;
  /** force an ElevenLabs voice (settings preview of a custom id) */
  voiceId?: string;
}

/** Minimal shape of a dialogue line for speaking/prefetching. */
export interface VoiceLine {
  text: string;
  portrait?: string;
  speaker?: string;
  mood?: string;
}

/** Emotion for a line: explicit mood wins, otherwise heuristics on the raw text. */
export function emotionFor(text: string, key: string, mood?: string): Emotion {
  return moodToEmotion(mood) ?? inferEmotion(text, key, { narration: key === 'narrator' });
}

type Listener = () => void;

class VoiceEngine {
  private synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  private voices: SpeechSynthesisVoice[] = [];
  private listeners = new Set<Listener>();
  private token = 0;
  private live: SpeechSynthesisUtterance[] = []; // keep references so Chrome doesn't GC them mid-speech
  private timers: number[] = [];
  private ctx: AudioContext | null = null;
  private nodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private master: GainNode | null = null;
  /** true while a line is being spoken/babbled */
  speaking = false;
  /** speaker key of the current line (member id, `npc:x`, `narrator`, or a preview key) */
  speakingKey: string | null = null;
  /** bumps on every state change — handy as a useSyncExternalStore snapshot */
  version = 0;

  constructor() {
    if (!this.synth) return;
    try {
      this.voices = this.synth.getVoices();
      const onChange = () => {
        this.voices = this.synth?.getVoices() ?? [];
        this.emit();
      };
      if (typeof this.synth.addEventListener === 'function') this.synth.addEventListener('voiceschanged', onChange);
      else (this.synth as any).onvoiceschanged = onChange;
    } catch {
      this.synth = null;
    }
  }

  private neuralHooked = false;
  private hookNeural() {
    if (this.neuralHooked) return;
    this.neuralHooked = true;
    try {
      subscribeNeural(() => this.emit());
    } catch {
      /* ignore */
    }
  }

  // ----- subscription (for React) -----
  subscribe = (fn: Listener) => {
    this.hookNeural();
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  }
  private setSpeaking(on: boolean, key: string | null = null) {
    if (this.speaking === on && this.speakingKey === key) return;
    this.speaking = on;
    this.speakingKey = on ? key : null;
    this.emit();
  }

  // ----- capability -----
  /** True when the browser has a speech engine (Web Speech API). Babble always works. */
  isSupported(): boolean {
    return !!this.synth && typeof window !== 'undefined' && 'SpeechSynthesisUtterance' in window;
  }
  /** Effective mode after falling back neural → speech → babble when something isn't available. */
  mode(requested: VoiceMode = this.settings().mode): VoiceMode {
    if (requested === 'neural' && !neuralAvailable()) requested = 'speech';
    if (requested === 'speech' && !this.isSupported()) return 'babble';
    return requested;
  }
  private settings(): Settings['voice'] {
    return store.state?.settings?.voice ?? { mode: defaultVoiceMode(), volume: 0.9, narrator: false };
  }
  /** Speaker key whose realistic-voice line is being fetched right now. */
  get loadingKey(): string | null {
    return neuralLoadingKey();
  }

  /** System voices worth offering (novelty voices removed), sorted by language then name. */
  listVoices(): SpeechSynthesisVoice[] {
    if (!this.synth) return [];
    if (!this.voices.length) {
      try {
        this.voices = this.synth.getVoices();
      } catch {
        /* ignore */
      }
    }
    return this.voices
      .filter((v) => !NOVELTY.test(v.name))
      .slice()
      .sort((a, b) => normLang(a.lang).localeCompare(normLang(b.lang)) || a.name.localeCompare(b.name));
  }

  /** Which system voice a character would use. Exported for the settings picker & tests. */
  pickVoice(profile: VoiceProfile, key: string): SpeechSynthesisVoice | null {
    const all = this.listVoices();
    if (!all.length) return null;
    if (profile.voiceURI) {
      const exact = all.find((v) => v.voiceURI === profile.voiceURI) ?? all.find((v) => v.name === profile.voiceURI);
      if (exact) return exact;
    }
    const lang = normLang(region().lang);
    const prefix = lang.split('-')[0];
    const tiers = [
      all.filter((v) => normLang(v.lang) === lang),
      all.filter((v) => normLang(v.lang).split('-')[0] === prefix),
      all.filter((v) => normLang(v.lang).startsWith('en')),
      all,
    ];
    const wants = wantGender(profile.kind);
    // prefer the best language tier that has a voice of the right type; otherwise best language tier
    let pool: SpeechSynthesisVoice[] = [];
    for (const tier of tiers) {
      const match = tier.filter((v) => wants.includes(genderOf(v)));
      if (match.length) {
        // child: prefer real child voices within the tier
        const kids = profile.kind === 'child' ? match.filter((v) => genderOf(v) === 'child') : [];
        pool = kids.length ? kids : match;
        break;
      }
    }
    if (!pool.length) pool = tiers.find((t) => t.length) ?? all;
    // stable, distinct per character: hash the key into the pool
    return pool[hash(key) % pool.length] ?? null;
  }

  /** Resolve the profile for a dialogue portrait key. Null = stay silent. */
  profileFor(portraitKey?: string, force = false, speaker?: string): VoiceProfile | null {
    if (!portraitKey && speaker) return guessProfile(speaker);
    if (!portraitKey) return this.settings().narrator || force ? NARRATOR_VOICE : null;
    if (portraitKey.startsWith('npc:')) {
      const id = portraitKey.slice(4);
      const npc = NPC_LOOKS[id];
      if (npc) return npc.voice;
      // member shown as an in-world NPC (e.g. `npc:mother-0`)
      const m = store.member(id);
      if (m) return m.voice ?? DEFAULT_VOICES[m.role] ?? FALLBACK_VOICE;
      return FALLBACK_VOICE;
    }
    const m = store.member(portraitKey);
    if (m) return m.voice ?? DEFAULT_VOICES[m.role] ?? FALLBACK_VOICE;
    return FALLBACK_VOICE;
  }

  // ----- public API -----
  /**
   * Speak a dialogue line in the speaker's voice. Cancels anything already playing.
   * `portraitKey`: member id, `npc:<key>`, or undefined for narration.
   * `opts.force` speaks narration even when the narrator setting is off (used by "replay").
   */
  speak(text: string, portraitKey?: string, opts: { force?: boolean; speaker?: string; mood?: string } = {}) {
    this.stop();
    const mode = this.mode();
    if (mode === 'off') return;
    const profile = this.profileFor(portraitKey, opts.force, opts.speaker);
    if (!profile) return;
    this.play([{ text, profile, key: speakerKey(portraitKey, opts.speaker), mood: opts.mood }], mode);
  }

  /** Warm the realistic-voice cache for an upcoming dialogue line (no-op in other modes). */
  prefetchLine(line: VoiceLine | null | undefined) {
    try {
      if (!line || this.mode() !== 'neural') return;
      const profile = this.profileFor(line.portrait, false, line.speaker || undefined);
      if (!profile) return;
      const text = normalizeForSpeech(line.text);
      if (!text) return;
      const key = speakerKey(line.portrait, line.speaker || undefined);
      neuralPrefetch([neuralLine(text, profile, emotionFor(line.text, key, line.mood), key)]);
    } catch {
      /* best effort */
    }
  }

  /** One character says the same line in several emotions (settings "Test emotions"). */
  previewEmotions(profile: VoiceProfile, key: string, text: string, emotions: Emotion[], voiceId?: string) {
    this.previewMany(emotions.map((emotion) => ({ text, profile, key, emotion, voiceId })));
  }

  /** Play a sample in a given voice (setup screens). Audible even when voices are switched off. */
  preview(profile: VoiceProfile, sampleText: string, key = 'preview') {
    this.previewMany([{ text: sampleText, profile, key }]);
  }

  /** Several sample lines back to back (e.g. "Test voices"). */
  previewMany(items: SpeakItem[]) {
    this.stop();
    const m = this.mode();
    this.play(items, m === 'off' ? this.mode('speech') : m);
  }

  /** Stop all speech and babble immediately. */
  stop() {
    this.token++;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.synth) {
      try {
        if (this.synth.speaking || this.synth.pending) this.synth.cancel();
      } catch {
        /* ignore */
      }
    }
    for (const u of this.live) {
      u.onend = null;
      u.onerror = null;
    }
    this.live = [];
    this.stopBabble();
    stopNeural();
    this.setSpeaking(false);
  }

  // ----- internals -----
  private play(items: SpeakItem[], mode: VoiceMode) {
    if (mode === 'off') return;
    if (mode === 'neural') {
      void this.playNeural(items);
      return;
    }
    const clean = items.map((i) => ({ ...i, text: normalizeForSpeech(i.text) })).filter((i) => i.text);
    if (!clean.length) return;
    if (mode === 'speech' && this.isSupported()) this.playSpeech(clean);
    else this.playBabble(clean);
  }

  /** Realistic voices, item by item; whatever can't play falls back to speech, then babble. */
  private async playNeural(items: SpeakItem[]) {
    const token = this.token;
    const fallback: VoiceMode = this.isSupported() ? 'speech' : 'babble';
    if (items.length > 1) {
      // warm the cache for the following samples so they play back to back
      try {
        neuralPrefetch(
          items.slice(1, 4).flatMap((it) => {
            const text = normalizeForSpeech(it.text);
            return text ? [neuralLine(text, it.profile, it.emotion ?? emotionFor(it.text, it.key, it.mood), it.key, it.voiceId)] : [];
          }),
        );
      } catch {
        /* best effort */
      }
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const text = normalizeForSpeech(it.text);
      if (!text) continue;
      const emotion = it.emotion ?? emotionFor(it.text, it.key, it.mood);
      let endResolve: () => void = () => {};
      const ended = new Promise<void>((res) => {
        endResolve = res;
      });
      let ok = false;
      try {
        ok = await speakNeural(text, it.profile, emotion, it.key, {
          voiceId: it.voiceId,
          volume: clamp(this.settings().volume, 0, 1),
          onStart: () => {
            if (token === this.token) this.setSpeaking(true, it.key);
          },
          onEnd: () => endResolve(),
        });
      } catch {
        ok = false;
      }
      if (token !== this.token) return;
      if (!ok) {
        this.play(items.slice(i), fallback);
        return;
      }
      await ended;
      if (token !== this.token) return;
      if (i < items.length - 1) await new Promise((r) => setTimeout(r, 300)); // a breath between samples
      if (token !== this.token) return;
    }
    this.setSpeaking(false);
  }

  private playSpeech(items: SpeakItem[]) {
    const synth = this.synth!;
    const token = this.token;
    const start = () => {
      if (token !== this.token) return;
      const vol = clamp(this.settings().volume, 0, 1);
      const queue: { u: SpeechSynthesisUtterance; key: string }[] = [];
      for (const it of items) {
        const v = this.pickVoice(it.profile, it.key);
        const vg = v ? genderOf(v) : 'unknown';
        // nudge pitch when the system voice's type doesn't match the character
        let pitch = clamp(it.profile.pitch, 0.1, 2);
        const kind = it.profile.kind;
        if ((kind === 'male' || kind === 'elder-male') && vg !== 'male') pitch *= 0.8;
        if ((kind === 'female' || kind === 'elder-female' || kind === 'child') && vg === 'male') pitch *= 1.2;
        // tiny per-character offset so two people sharing a system voice still differ
        pitch = clamp(pitch + (((hash(it.key) % 13) - 6) / 100), 0.1, 2);
        const rate = clamp(it.profile.rate, 0.5, 1.6);
        for (const chunk of chunkText(it.text)) {
          const u = new SpeechSynthesisUtterance(chunk);
          if (v) u.voice = v;
          u.lang = v?.lang || region().lang;
          u.pitch = pitch;
          u.rate = rate;
          u.volume = vol;
          queue.push({ u, key: it.key });
        }
      }
      if (!queue.length) return;
      this.live = queue.map((q) => q.u);
      const last = queue[queue.length - 1].u;
      queue.forEach(({ u, key }) => {
        u.onstart = () => token === this.token && this.setSpeaking(true, key);
        u.onerror = () => {
          if (token === this.token && u === last) this.setSpeaking(false);
        };
      });
      last.onend = () => {
        if (token !== this.token) return;
        this.live = [];
        this.setSpeaking(false);
      };
      this.setSpeaking(true, queue[0].key);
      try {
        if (synth.paused) synth.resume();
        for (const { u } of queue) synth.speak(u);
      } catch {
        this.setSpeaking(false);
        return;
      }
      // safety net: some engines never fire onend
      const est = queue.reduce((ms, q) => ms + (q.u.text.length * 85) / (q.u.rate || 1), 0) + 2500;
      this.timers.push(window.setTimeout(() => token === this.token && !synth.speaking && this.setSpeaking(false), est));
    };
    // voices load asynchronously on first use (Chrome); wait briefly so the right voice is chosen
    const needVoices = !this.voices.length;
    // Chrome can drop an utterance queued in the same tick as cancel()
    const delay = needVoices ? 0 : 40;
    if (needVoices) {
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        this.voices = synth.getVoices();
        start();
      };
      const off = this.subscribe(() => {
        if (this.voices.length) {
          off();
          go();
        }
      });
      this.timers.push(
        window.setTimeout(() => {
          off();
          go();
        }, 450),
      );
    } else {
      this.timers.push(window.setTimeout(start, delay));
    }
  }

  private audio(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      this.ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private stopBabble() {
    const ctx = this.ctx;
    for (const { osc, gain } of this.nodes) {
      try {
        if (ctx) {
          gain.gain.cancelScheduledValues(ctx.currentTime);
          gain.gain.setValueAtTime(0, ctx.currentTime);
        }
        osc.stop();
      } catch {
        /* already stopped */
      }
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.nodes = [];
  }

  private playBabble(items: SpeakItem[]) {
    const ctx = this.audio();
    if (!ctx) return;
    const token = this.token;
    const vol = clamp(this.settings().volume, 0, 1) * 0.16;
    if (vol <= 0) return;
    if (!this.master) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      this.master = ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(lp).connect(ctx.destination);
    }
    let t = ctx.currentTime + 0.03;
    const marks: { at: number; key: string }[] = [];
    for (const it of items) {
      marks.push({ at: t, key: it.key });
      const { kind, pitch, rate } = it.profile;
      const base =
        { child: 520, female: 330, 'elder-female': 285, neutral: 280, male: 165, 'elder-male': 140 }[kind] ?? 260;
      const f0 = base * clamp(pitch, 0.5, 2);
      const wave: OscillatorType = kind === 'child' || kind === 'female' ? 'square' : 'triangle';
      const slow = kind.startsWith('elder') ? 1.2 : 1;
      const step = (0.068 * slow) / clamp(rate, 0.5, 1.6);
      // syllables: one blip per ~2 letters, pauses at spaces & punctuation
      const words = it.text.split(/(\s+|[,.!?;:…]+)/).filter(Boolean);
      const question = /\?\s*$/.test(it.text);
      let total = 0;
      for (const w of words) if (/\p{L}|\p{N}/u.test(w)) total += Math.max(1, Math.ceil(w.replace(/[^\p{L}\p{N}]/gu, '').length / 2));
      // keep long lines from droning on: cap around 5 seconds of babble
      const maxBlips = Math.max(8, Math.floor(5 / step));
      const keepEvery = total > maxBlips ? total / maxBlips : 1;
      let n = 0;
      let kept = 0;
      for (const w of words) {
        if (/^\s+$/.test(w)) {
          t += step * 0.5;
          continue;
        }
        if (/^[,;:]+$/.test(w)) {
          t += step * 2;
          continue;
        }
        if (/^[.!?…]+$/.test(w)) {
          t += step * 3.2;
          continue;
        }
        const letters = w.replace(/[^\p{L}\p{N}]/gu, '');
        const syl = Math.max(1, Math.ceil(letters.length / 2));
        for (let s = 0; s < syl; s++, n++) {
          if (n < kept * keepEvery) continue;
          kept++;
          const ch = letters.charCodeAt(Math.min(letters.length - 1, s * 2)) || 97;
          const h = hash(`${it.key}:${n}:${ch}`);
          const vowel = /[aeiouyáéíóúãõ]/i.test(letters[s * 2] ?? '');
          let semis = ((h % 8) - 3) + (vowel ? 1.5 : 0);
          if (question && n >= total - 3) semis += 4 + (n - (total - 3)) * 2;
          const f = f0 * Math.pow(2, semis / 12);
          const dur = step * 0.82;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = wave;
          osc.frequency.setValueAtTime(f, t);
          osc.frequency.linearRampToValueAtTime(f * (vowel ? 1.06 : 0.94), t + dur);
          const g = wave === 'square' ? vol * 0.55 : vol;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(g, t + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          osc.connect(gain).connect(this.master!);
          osc.start(t);
          osc.stop(t + dur + 0.02);
          this.nodes.push({ osc, gain });
          osc.onended = () => {
            const i = this.nodes.findIndex((x) => x.osc === osc);
            if (i >= 0) this.nodes.splice(i, 1);
            try {
              osc.disconnect();
              gain.disconnect();
            } catch {
              /* ignore */
            }
          };
          t += step;
        }
      }
      t += 0.35; // gap between samples
    }
    const toMs = (at: number) => Math.max(0, (at - ctx.currentTime) * 1000);
    this.setSpeaking(true, items[0].key);
    for (const m of marks.slice(1)) this.timers.push(window.setTimeout(() => token === this.token && this.setSpeaking(true, m.key), toMs(m.at)));
    this.timers.push(window.setTimeout(() => token === this.token && this.setSpeaking(false), toMs(t - 0.3)));
  }
}

/** Mode for a brand-new player: realistic voices when this build can use them. */
export function defaultVoiceMode(): VoiceMode {
  try {
    return neuralAvailable() ? 'neural' : 'speech';
  } catch {
    return 'speech';
  }
}

/** Singleton voice engine. */
export const voice = new VoiceEngine();

/** Short role-appropriate sample line for setup/test buttons. */
export function sampleLine(role: string, name: string): string {
  switch (role) {
    case 'mother':
      return `Hi! I'm ${name}. Could you help me with the shopping today?`;
    case 'father':
      return `Hello, I'm ${name}. Ready for a busy day?`;
    case 'older-sibling':
      return `Hey, I'm ${name}. Race you to the shop!`;
    case 'younger-sibling':
      return `Hi! I'm ${name}! Can we play after homework?`;
    case 'grandparent':
      return `Hello dear, I'm ${name}. Come and sit with me.`;
    case 'guardian':
      return `Hi, I'm ${name}. Let's plan the day together.`;
    case 'partner':
      return `Oh hey! …I mean, hi. I'm ${name}. Park later? 🦆`;
    case 'shopkeeper':
      return `Welcome! That will be ${region().currency.symbol}${region().currency.decimals ? '1.20' : '150'}, please.`;
    default:
      return `Hi! I'm ${name}.`;
  }
}
