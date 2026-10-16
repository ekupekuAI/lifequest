// Trailer sound: original score (scripts/compose.mjs), synthesized SFX (scripts/sfx.mjs)
// and ElevenLabs voice-over (scripts/vo.mjs). Every placement is an absolute frame.
import { Audio, Sequence, interpolate, staticFile } from 'remotion';
import { CUES, SCENES, TOTAL_FRAMES } from './timeline';

export interface VoLine {
  file: string;
  from: number;
  seconds: number;
  frames: number;
  voice: string;
  /** music gain under this line (default DUCK) */
  duck?: number;
}

/** Voice-over lines: start frame, measured duration (ffprobe) and frames (ceil @30fps). */
export const VO = {
  mom: { file: 'vo/mom.mp3', from: CUES.momLine, seconds: 4.0, frames: 120, voice: 'Matilda (warm, Indian English hint)' },
  helper: { file: 'vo/helper.mp3', from: CUES.helperLine, seconds: 2.0, frames: 60, voice: 'Sarah (apologetic)' },
  sibling: { file: 'vo/sibling.mp3', from: CUES.siblingLine, seconds: 2.88, frames: 87, voice: 'Jessica (angry)', duck: 0.35 },
  narrator1: { file: 'vo/narrator1.mp3', from: 1128 /* ends on the 1200 slam */, seconds: 2.4, frames: 72, voice: 'Brian (calm)' },
  grandma: { file: 'vo/grandma.mp3', from: CUES.grandmaLine, seconds: 2.16, frames: 65, voice: 'Lily (proud)', duck: 0.35 },
  narrator2: { file: 'vo/narrator2.mp3', from: CUES.narratorLine2, seconds: 3.12, frames: 94, voice: 'Brian (proud)', duck: 0.3 },
} satisfies Record<string, VoLine>;

const VO_LEVEL = 0.85;
const MUSIC_LEVEL = 0.8;
const DUCK = 0.4; // ≈ -8 dB under dialogue
const DUCK_IN = 5; // frames before the line starts
const DUCK_OUT = 8; // frames to recover after it ends

const HIT_DIP = 0.55; // ≈ -5 dB for a few frames
const HITS = [CUES.soldOutStamp, ...CUES.montageCuts, CUES.choiceSlam, CUES.drop, CUES.logoHit];

const duckOf = (line: VoLine) => line.duck ?? DUCK;

/** Music gain at an absolute frame: ducked under every VO line with short ramps. */
export function musicVolume(frame: number): number {
  let g = 1;
  for (const line of Object.values(VO)) {
    const a = line.from - DUCK_IN;
    const b = line.from + line.frames;
    const d = interpolate(frame, [a, line.from, b, b + DUCK_OUT], [1, duckOf(line), duckOf(line), 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    g = Math.min(g, d);
  }
  // make room for the big SFX hits (they stack on the score's own hits)
  for (const h of HITS) {
    const d = interpolate(frame, [h - 3, h, h + 14], [1, HIT_DIP, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    g = Math.min(g, d);
  }
  return MUSIC_LEVEL * g;
}

interface Cue {
  at: number; // absolute frame the sound starts
  file: string; // under public/
  volume: number;
  note: string;
}

/** Whoosh samples peak ~37% into the file: start them early so the peak lands on the cut. */
const W = {
  w1: { file: 'sfx/whoosh_1.wav', lead: 6 },
  w2: { file: 'sfx/whoosh_2.wav', lead: 5 },
  w3: { file: 'sfx/whoosh_3.wav', lead: 9 },
  ws: { file: 'sfx/whoosh_short.wav', lead: 3 },
};
const whoosh = (cut: number, w: keyof typeof W, volume: number, note: string): Cue => ({ at: cut - W[w].lead, file: W[w].file, volume, note });

const cut = (id: string) => SCENES.find((s) => s.id === id)!.from;

const [M1, M2, M3] = CUES.montageCuts;
const series = (from: number, count: number, step: number, file: string, volume: number, note: string): Cue[] =>
  Array.from({ length: count }, (_, k) => ({ at: Math.round(from + k * step), file, volume, note: `${note} ${k + 1}` }));

/** Every SFX placement (absolute frames), synced to the finished scenes' visual beats. */
export const SFX: Cue[] = [
  // scene-cut whooshes (peak lands on the cut)
  whoosh(cut('S02'), 'w1', 0.35, 'cut S01→S02'),
  whoosh(cut('S03'), 'w2', 0.35, 'cut S02→S03'),
  whoosh(cut('S04'), 'w1', 0.35, 'cut S03→S04'),
  whoosh(cut('S05'), 'w2', 0.35, 'cut S04→S05'),
  whoosh(cut('S06'), 'w3', 0.3, 'cut S05→S06 (under thunder)'),
  whoosh(cut('S07'), 'ws', 0.3, 'cut S06→S07'),
  whoosh(1138, 'w3', 0.4, 'S07 zoom-out 1136 into cut S08'),
  whoosh(cut('S09'), 'w3', 0.45, 'into the drop'),
  whoosh(1557, 'w1', 0.35, 'S09 whoosh into white 1555–1559'),

  // S02–S03 (S03/S04 visuals were placeholders when this was placed)
  { at: CUES.coinDrop, file: 'sfx/coins.wav', volume: 0.55, note: 'coins handed over' },
  { at: CUES.doorOpen, file: 'sfx/door.wav', volume: 0.7, note: 'door creak + light swell' },
  { at: 300, file: 'sfx/footsteps.wav', volume: 0.35, note: 'soft steps out of the door' },
  { at: 330, file: 'sfx/car_pass.wav', volume: 0.4, note: 'car passes, brakes ~375' },
  // S04 store
  { at: 450, file: 'sfx/click.wav', volume: 0.35, note: 'store quick cut / price tag' },
  { at: 465, file: 'sfx/pop.wav', volume: 0.3, note: 'item into basket' },
  { at: CUES.soldOutStamp, file: 'sfx/stamp.wav', volume: 0.45, note: 'SOLD OUT stamp' },
  { at: CUES.soldOutStamp, file: 'sfx/impact.wav', volume: 0.25, note: 'SOLD OUT impact' },

  // S05 queue
  { at: CUES.queueFastForward, file: 'sfx/ff_whirr.wav', volume: 0.5, note: 'fast-forward / clock whirr' },
  ...series(CUES.queueFastForward + 3, 3, 7, 'sfx/click.wav', 0.22, 'serve beep'),
  whoosh(690, 'w2', 0.35, 'line-cutter dash 684→695'),
  { at: 695, file: 'sfx/thud.wav', volume: 0.4, note: 'cutter slots in' },
  ...series(700, 3, 5, 'sfx/pop.wav', 0.22, 'angry grumble pop'),
  { at: CUES.heartPop, file: 'sfx/heart_chime.wav', volume: 0.6, note: 'kindness heart' },
  { at: 750, file: 'sfx/register.wav', volume: 0.55, note: 'drawer clack 750, ka-ching ~754' },
  ...series(760, 5, 2, 'sfx/tick.wav', 0.18, 'receipt print'),

  // S06 weather & bus
  { at: CUES.thunder, file: 'sfx/thunder.wav', volume: 0.95, note: 'lightning crack + rumble' },
  { at: 792, file: 'sfx/thunder.wav', volume: 0.25, note: 'second flicker crack' },
  { at: 799, file: 'sfx/pop.wav', volume: 0.35, note: 'umbrella pops' },
  { at: 862, file: 'sfx/bus_brake.wav', volume: 0.55, note: 'bus air brakes (squeal 865–871)' },
  { at: 876, file: 'sfx/pop.wav', volume: 0.3, note: '"?" pop' },
  whoosh(885, 'ws', 0.18, 'head turn 1'),
  whoosh(892, 'ws', 0.18, 'head turn 2'),
  whoosh(900, 'ws', 0.18, 'head turn 3'),
  whoosh(904, 'ws', 0.18, 'head turn 4'),
  { at: 900, file: 'sfx/ding.wav', volume: 0.4, note: 'correct bus ding' },
  { at: 918, file: 'sfx/bus_brake.wav', volume: 0.3, note: 'bus door hiss' },
  whoosh(922, 'w2', 0.25, 'board + bus pulls away'),

  // S07 chaos montage: a punch on every cut (the score has a stab + crash there too)
  ...CUES.montageCuts.map((at, k): Cue => ({ at, file: 'sfx/thud.wav', volume: 0.22, note: `montage punch ${k + 1}` })),
  { at: M1, file: 'sfx/sizzle.wav', volume: 0.45, note: 'pot sizzle/smoke 930–975' },
  { at: M2, file: 'sfx/washer.wav', volume: 0.35, note: 'washer thumps 975–987' },
  { at: 987, file: 'sfx/pop.wav', volume: 0.35, note: 'washer door pop' },
  { at: 1003, file: 'sfx/record_scratch.wav', volume: 0.45, note: 'record scratch into the freeze (score silent 1005–1011)' },
  { at: M3, file: 'sfx/thud.wav', volume: 0.22, note: 'sister stomp 1' },
  { at: 1027, file: 'sfx/thud.wav', volume: 0.2, note: 'sister stomp 2' },
  { at: 1050, file: 'sfx/heart_chime.wav', volume: 0.35, note: 'montage heart' },
  { at: 1068, file: 'sfx/door_rattle.wav', volume: 0.5, note: 'door rattle 1068–1075' },
  { at: 1073, file: 'sfx/thud.wav', volume: 0.35, note: 'padlock clunk' },
  { at: 1095, file: 'sfx/shimmer.wav', volume: 0.25, note: 'key glint' },
  ...[1112, 1117, 1122].map((at, k): Cue => ({ at, file: 'sfx/coin.wav', volume: 0.4, note: `coin ${k + 1}` })),
  { at: 1123, file: 'sfx/pop.wav', volume: 0.22, note: 'squint "?"' },
  { at: 1131, file: 'sfx/ding.wav', volume: 0.35, note: 'check ding' },

  // S08
  { at: CUES.choiceSlam, file: 'sfx/impact.wav', volume: 0.7, note: 'choice slam + white flash' },
  ...series(1262, 8, 4, 'sfx/coin.wav', 0.18, 'S08 tile coin pop (4-frame stagger assumed)'),
  // S09 payoff
  { at: CUES.drop, file: 'sfx/impact.wav', volume: 0.35, note: 'drop impact' },
  { at: 1322, file: 'sfx/stamp.wav', volume: 0.3, note: 'results panel slam' },
  ...series(1325, 16, 2, 'sfx/tick.wav', 0.15, 'score count-up tick'),
  { at: 1366, file: 'sfx/shimmer.wav', volume: 0.35, note: 'badge sparkle' },
  whoosh(1395, 'ws', 0.25, 'beat cut to dinner'),
  ...series(1485, 8, 7.5, 'sfx/pop.wav', 0.16, 'mission tile lands (half-beats)'),
  // S10 logo
  { at: CUES.logoHit - 90, file: 'sfx/riser.wav', volume: 0.3, note: 'riser into the logo (ends on 1590)' },
  { at: 1560, file: 'sfx/shimmer.wav', volume: 0.2, note: 'particle swirl' },
  { at: CUES.logoHit, file: 'sfx/boom.wav', volume: 0.45, note: 'logo boom' },
  { at: CUES.logoHit, file: 'sfx/shimmer.wav', volume: 0.5, note: 'logo shimmer' },
  { at: 1680, file: 'sfx/pop.wav', volume: 0.3, note: 'button pop' },
  ...series(1684, 10, 3, 'sfx/tick.wav', 0.13, 'URL typing tick'),
  ...series(1716, 3, 7, 'sfx/pop.wav', 0.15, 'region tag pop (frames assumed)'),
  { at: CUES.finalSting, file: 'sfx/shimmer.wav', volume: 0.45, note: 'final sting sparkle' },
  { at: CUES.finalSting, file: 'sfx/ding.wav', volume: 0.25, note: 'final sting ding' },
];

const RAIN_FROM = CUES.thunder;
const RAIN_TO = cut('S07');

export const AudioTrack: React.FC = () => (
  <>
    <Sequence from={0} durationInFrames={TOTAL_FRAMES} name="Music" layout="none">
      <Audio src={staticFile('audio/music.wav')} volume={(f) => musicVolume(f)} />
    </Sequence>

    <Sequence from={RAIN_FROM} durationInFrames={RAIN_TO - RAIN_FROM} name="SFX rain loop" layout="none">
      <Audio
        src={staticFile('sfx/rain_loop.wav')}
        loop
        volume={(f) =>
          0.45 *
          interpolate(f, [0, 12, RAIN_TO - RAIN_FROM - 30, RAIN_TO - RAIN_FROM], [0, 1, 1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />
    </Sequence>

    {SFX.map((c, i) => (
      <Sequence key={`sfx-${i}`} from={c.at} name={`SFX ${c.note}`} layout="none">
        <Audio src={staticFile(c.file)} volume={c.volume} />
      </Sequence>
    ))}

    {Object.entries(VO).map(([name, line]) => (
      <Sequence key={name} from={line.from} durationInFrames={line.frames + 6} name={`VO ${name}`} layout="none">
        <Audio src={staticFile(line.file)} volume={VO_LEVEL} />
      </Sequence>
    ))}
  </>
);
