// Guess how a dialogue line should *feel* so the realistic voices can act it out.
// Pure heuristics on the raw line (emoji included) — no network, no store access.
import { EMOTIONS, isEmotion, type Emotion } from './ttsShared';

export type { Emotion } from './ttsShared';
export { EMOTIONS } from './ttsShared';

export interface EmotionContext {
  /** explicit mood from the dialogue line (wins when recognised) */
  mood?: string;
  /** true for narration (no speaker) */
  narration?: boolean;
}

const MOOD_SYNONYMS: Record<string, Emotion> = {
  happy: 'cheerful',
  joyful: 'cheerful',
  friendly: 'cheerful',
  kind: 'warm',
  loving: 'warm',
  grateful: 'warm',
  thankful: 'warm',
  gentle: 'warm',
  thrilled: 'excited',
  enthusiastic: 'excited',
  scared: 'worried',
  anxious: 'worried',
  nervous: 'worried',
  afraid: 'worried',
  urgent: 'worried',
  upset: 'sad',
  disappointed: 'sad',
  unhappy: 'sad',
  mad: 'angry',
  annoyed: 'angry',
  frustrated: 'angry',
  cross: 'angry',
  sorry: 'apologetic',
  sheepish: 'apologetic',
  embarrassed: 'apologetic',
  shocked: 'surprised',
  amazed: 'surprised',
  sleepy: 'tired',
  exhausted: 'tired',
  pleased: 'proud',
  impressed: 'proud',
  relaxed: 'calm',
  soothing: 'calm',
  quiet: 'whisper',
  whispering: 'whisper',
  whispers: 'whisper',
};

/** Map a free-form mood word to a supported emotion (undefined when unknown). */
export function moodToEmotion(mood: string | undefined | null): Emotion | undefined {
  if (!mood) return undefined;
  const m = mood.trim().toLowerCase();
  if (isEmotion(m)) return m;
  return MOOD_SYNONYMS[m];
}

const EMOJI: [RegExp, Emotion][] = [
  [/[😠😡🤬💢👿]/u, 'angry'],
  [/[😅🙏😬🙇]/u, 'apologetic'],
  [/[😢😭😞😔💔🥺☹]/u, 'sad'],
  [/[😟😰😨😱😧😥⏰]/u, 'worried'],
  [/[😮😲😯🤯😳]/u, 'surprised'],
  [/[😴🥱💤]/u, 'tired'],
  [/[🤫]/u, 'whisper'],
  [/[🏆🏅👏🌟💯]/u, 'proud'],
  [/[🙌🎉🥳🤩🎊🚀]/u, 'excited'],
  [/[🤗🥰💕💖💗❤]/u, 'warm'],
  [/[😊🙂😄😃😀😁☺👋😉]/u, 'cheerful'],
];

const RX = {
  whisper: /\b(psst+|shh+|whispers?|keep (it|your voice) down)\b/i,
  apologetic: /\b(sorry|oops|whoops|my bad|apologi[sz]e|forgive me|excuse me|my mistake)\b/i,
  angry: /\b(how dare|unacceptable|no cutting|wait your turn|that's not fair|get out|i said no|stop it)\b|\benough!/i,
  shout: /\b(STOP|HEY|NO|OI)\b!/,
  proud: /\b(well done|great job|good job|nice job|nicely done|proud of|excellent|brilliant|you did it|fantastic work|amazing work|top marks|gold star|good work|great work)\b/i,
  worried: /\b(hurry|late|deadline|missing|lost|oh no|worried|careful|emergency|can'?t find|running out|ran out|fever|sick|hurts?|injured|quick(ly)?|before it closes|not enough)\b/i,
  sad: /\b(sad|unfortunately|lonely|crying|miss (you|her|him|them)|heartbroken|that's a shame|what a shame)\b/i,
  tired: /\b(tired|exhausted|long day|sleepy|yawn|worn out)\b/i,
  warm: /\b(thank you|thanks|bless you|dear|sweetheart|love you|take care|welcome back|appreciate|beta|honey|kind of you)\b/i,
  surprised: /\b(wow|whoa|no way|really\?|what\?!|oh my|goodness|you're kidding)\b/i,
  excited: /\b(yay|hooray|woo+|awesome|can'?t wait|let'?s go|amazing)\b/i,
  greeting: /\b(hi|hello|hey|good (morning|afternoon|evening)|welcome|namaste|hiya|howdy)\b/i,
};

/** Default feel per speaker when the line itself gives no clue. */
function speakerDefault(speakerKey: string): Emotion {
  const k = speakerKey.replace(/^npc:/, '');
  if (k === 'narrator') return 'calm';
  if (k.startsWith('grandparent') || k === 'elder' || k === 'sharma' || k === 'librarian') return 'warm';
  if (k.startsWith('younger-sibling')) return 'cheerful';
  if (k === 'cutter') return 'worried';
  return 'neutral';
}

/**
 * Pick an emotion for a line. `text` is the RAW display text (before emoji are stripped).
 * Order: explicit mood → narration → emoji → keywords → punctuation → speaker default.
 */
export function inferEmotion(text: string, speakerKey = 'narrator', context: EmotionContext = {}): Emotion {
  const explicit = moodToEmotion(context.mood);
  if (explicit) return explicit;
  const raw = String(text ?? '');
  if (context.narration || speakerKey === 'narrator') return RX.whisper.test(raw) ? 'whisper' : 'calm';

  for (const [rx, emo] of EMOJI) if (rx.test(raw)) return emo;

  if (RX.whisper.test(raw)) return 'whisper';
  if (RX.apologetic.test(raw)) return 'apologetic';
  if (RX.angry.test(raw) || RX.shout.test(raw)) return 'angry';
  if (RX.proud.test(raw)) return 'proud';
  if (RX.worried.test(raw)) return 'worried';
  if (RX.sad.test(raw)) return 'sad';
  if (RX.tired.test(raw)) return 'tired';
  if (RX.warm.test(raw)) return 'warm';
  if (RX.surprised.test(raw)) return 'surprised';

  const bangs = (raw.match(/!/g) ?? []).length;
  const words = raw.match(/\p{L}+/gu) ?? [];
  const caps = words.filter((w) => w.length >= 3 && w === w.toUpperCase() && w !== w.toLowerCase()).length;
  if (RX.excited.test(raw) || bangs >= 2 || (caps >= 1 && bangs >= 1)) return 'excited';
  if (bangs === 1) return 'cheerful';
  if (RX.greeting.test(raw)) return 'cheerful';
  if (/\?\s*$/.test(raw.trim())) return 'neutral';
  return speakerDefault(speakerKey);
}

/** All supported emotions (for UI pickers / tests). */
export const ALL_EMOTIONS: readonly Emotion[] = EMOTIONS;
