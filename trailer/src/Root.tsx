import { Composition, Still } from 'remotion';
import { Trailer } from './Trailer';
import { FPS, TOTAL_FRAMES } from './timeline';

export const Root: React.FC = () => (
  <>
    <Composition id="Trailer" component={Trailer} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Still id="Poster" component={Trailer} width={1920} height={1080} />
  </>
);
