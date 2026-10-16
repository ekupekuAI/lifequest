// Kinetic typography helpers (React overlays on top of PixelCanvas).
import { loadFont as loadPixel } from '@remotion/google-fonts/PressStart2P';
import { loadFont as loadBody } from '@remotion/google-fonts/Outfit';
import { useCurrentFrame, interpolate, Easing } from 'remotion';

export const { fontFamily: PIXEL } = loadPixel();
export const { fontFamily: BODY } = loadBody('normal', { weights: ['400', '700', '900'] });

export const COLORS = {
  night: '#0e0c1d',
  navy: '#1b1f3b',
  sunset: '#f2a541',
  coral: '#e4572e',
  mint: '#3bb273',
  sky: '#2e86ab',
  cream: '#fff3dc',
  white: '#ffffff',
};

/** Big punchy title that slams in letter by letter. */
export const SlamText: React.FC<{ text: string; start: number; size?: number; color?: string; y?: string; stagger?: number; shadow?: string; font?: string }> = ({
  text,
  start,
  size = 96,
  color = COLORS.cream,
  y = '50%',
  stagger = 2,
  shadow = COLORS.coral,
  font = PIXEL,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: y, transform: 'translateY(-50%)', textAlign: 'center', fontFamily: font, fontSize: size, color, letterSpacing: size * 0.04, whiteSpace: 'pre' }}>
      {[...text].map((ch, i) => {
        const f = frame - start - i * stagger;
        const p = interpolate(f, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(2.2)) });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: f < 0 ? 0 : 1,
              transform: `translateY(${(1 - p) * -60}px) scale(${0.4 + p * 0.6})`,
              textShadow: `${size * 0.06}px ${size * 0.06}px 0 ${shadow}`,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/** Small caption that fades/slides in and out. */
export const Caption: React.FC<{ text: string; start: number; end: number; size?: number; y?: string; color?: string; font?: string }> = ({ text, start, end, size = 40, y = '82%', color = COLORS.cream, font = BODY }) => {
  const frame = useCurrentFrame();
  const a = interpolate(frame, [start, start + 8, end - 8, end], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dy = interpolate(frame, [start, start + 10], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontFamily: font, fontWeight: 700, fontSize: size, color, opacity: a, transform: `translateY(${dy}px)`, textShadow: '0 4px 24px rgba(0,0,0,.6)' }}>
      {text}
    </div>
  );
};
