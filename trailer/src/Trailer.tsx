import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from 'remotion';
import { SCENES, TOTAL_FRAMES } from './timeline';
import { AudioTrack } from './audio';
import S01 from './scenes/S01';
import S02 from './scenes/S02';
import S03 from './scenes/S03';
import S04 from './scenes/S04';
import S05 from './scenes/S05';
import S06 from './scenes/S06';
import S07 from './scenes/S07';
import S08 from './scenes/S08';
import S09 from './scenes/S09';
import S10 from './scenes/S10';

const COMPONENTS: Record<string, React.FC> = { S01, S02, S03, S04, S05, S06, S07, S08, S09, S10 };

/** Cinematic finish over everything: letterbox, vignette, film grain. */
const Finish: React.FC = () => {
  const frame = useCurrentFrame();
  // 2.39:1 bars during the story, opening up for the logo
  const bar = interpolate(frame, [0, 30, 1530, 1590], [140, 138, 138, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const grainShift = (frame * 37) % 100;
  // lift the vignette on full-white impact frames so the flash reads edge to edge
  const flashLift = Math.max(...[1319, 1559].map((f) => 1 - Math.min(1, Math.abs(frame - f) / 4)));
  const vignette = 0.55 * (1 - flashLift);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(5,4,15,${vignette}) 100%)` }} />
      <AbsoluteFill
        style={{
          opacity: 0.07,
          backgroundImage:
            'repeating-radial-gradient(circle at 17% 32%, #fff 0 1px, transparent 1px 3px), repeating-radial-gradient(circle at 71% 64%, #000 0 1px, transparent 1px 4px)',
          backgroundPosition: `${grainShift}px ${grainShift * 1.7}px`,
          mixBlendMode: 'overlay',
        }}
      />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: bar, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bar, background: '#000' }} />
    </AbsoluteFill>
  );
};

export const Trailer: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    {SCENES.map((s) => {
      const C = COMPONENTS[s.id];
      return (
        <Sequence key={s.id} from={s.from} durationInFrames={s.duration} name={`${s.id} · ${s.title}`}>
          <C />
        </Sequence>
      );
    })}
    <Finish />
    <AudioTrack />
  </AbsoluteFill>
);

export { TOTAL_FRAMES };
