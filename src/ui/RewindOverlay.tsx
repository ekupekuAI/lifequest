// REWIND TIME — the VHS rewind overlay (scanlines, colour bleed, tracking noise, "◀◀ REWIND"
// OSD and a clock spinning backwards) plus the HUD rewind button. The in-world half lives in
// game/rewindFx.ts; the rules live in core/rewind.ts.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { store } from '../core/store';
import { REWINDS_PER_DAY, REWIND_MS, RESTORE_AT_MS, canRewind, rewindPhase, rewindsLeft, startRewind } from '../core/rewind';
import { prefersReducedMotion, useSnap } from './hooks';

const usePhase = () => useSyncExternalStore(rewindPhase.subscribe, rewindPhase.get);

/** Press the rewind button / T key. */
export function rewindPress() {
  return startRewind(store);
}

function clockLabel(m: number) {
  const mm = ((Math.floor(m) % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60);
  const min = mm % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${((h + 11) % 12) + 1}:${String(min).padStart(2, '0')} ${ampm}`;
}

// ------------------------------------------------------------------ tape whirr (WebAudio) ---
let actx: AudioContext | null = null;
function tapeWhirr(ms: number) {
  if (!store.ui.sound || typeof window === 'undefined') return;
  try {
    actx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ac = actx;
    if (ac.state === 'suspended') void ac.resume();
    const t0 = ac.currentTime;
    const dur = ms / 1000;
    const master = ac.createGain();
    master.gain.value = 0.11;
    master.connect(ac.destination);
    // mechanical clunk as the deck switches to rewind
    const clunk = ac.createOscillator();
    const cg = ac.createGain();
    clunk.type = 'square';
    clunk.frequency.setValueAtTime(140, t0);
    clunk.frequency.exponentialRampToValueAtTime(60, t0 + 0.08);
    cg.gain.setValueAtTime(0.9, t0);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    clunk.connect(cg).connect(master);
    clunk.start(t0);
    clunk.stop(t0 + 0.12);
    // motor whine spinning up, wobbling, spinning down
    const motor = ac.createOscillator();
    const mg = ac.createGain();
    const lp = ac.createBiquadFilter();
    motor.type = 'sawtooth';
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    motor.frequency.setValueAtTime(90, t0 + 0.05);
    motor.frequency.exponentialRampToValueAtTime(820, t0 + dur * 0.55);
    motor.frequency.exponentialRampToValueAtTime(260, t0 + dur * 0.95);
    const wob = ac.createOscillator();
    const wg = ac.createGain();
    wob.frequency.value = 9;
    wg.gain.value = 18;
    wob.connect(wg).connect(motor.frequency);
    mg.gain.setValueAtTime(0.0001, t0);
    mg.gain.exponentialRampToValueAtTime(0.45, t0 + 0.2);
    mg.gain.setValueAtTime(0.45, t0 + dur * 0.8);
    mg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    motor.connect(lp).connect(mg).connect(master);
    motor.start(t0);
    wob.start(t0);
    motor.stop(t0 + dur + 0.05);
    wob.stop(t0 + dur + 0.05);
    // tape hiss
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const hiss = ac.createBufferSource();
    hiss.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1200, t0);
    bp.frequency.exponentialRampToValueAtTime(5200, t0 + dur * 0.6);
    bp.Q.value = 0.8;
    const hg = ac.createGain();
    hg.gain.setValueAtTime(0.0001, t0);
    hg.gain.exponentialRampToValueAtTime(0.35, t0 + 0.25);
    hg.gain.setValueAtTime(0.35, t0 + dur * 0.85);
    hg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    hiss.connect(bp).connect(hg).connect(master);
    hiss.start(t0);
    hiss.stop(t0 + dur);
    // the "click" of play at the end
    const click = ac.createOscillator();
    const kg = ac.createGain();
    click.type = 'square';
    click.frequency.value = 1900;
    kg.gain.setValueAtTime(0.0001, t0 + dur - 0.02);
    kg.gain.setValueAtTime(0.5, t0 + dur);
    kg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.05);
    click.connect(kg).connect(master);
    click.start(t0 + dur - 0.03);
    click.stop(t0 + dur + 0.08);
  } catch {
    /* audio unavailable */
  }
}

// ------------------------------------------------------------------ overlay ---
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.4 -0.2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")";

const CSS = `
.vhs { position: fixed; inset: 0; z-index: 9000; pointer-events: auto; overflow: hidden; cursor: progress;
  backdrop-filter: saturate(0.35) contrast(1.25) brightness(1.08); -webkit-backdrop-filter: saturate(0.35) contrast(1.25) brightness(1.08); }
.vhs-tint { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(40,10,80,.28), rgba(0,40,70,.22)); mix-blend-mode: screen; }
.vhs-scan { position: absolute; inset: -4px 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,.38) 0 1px, rgba(0,0,0,0) 1px 3px); }
.vhs-bleed { position: absolute; inset: 0; box-shadow: inset 6px 0 18px rgba(255,0,70,.35), inset -6px 0 18px rgba(0,230,255,.35); }
.vhs-split-r, .vhs-split-c { position: absolute; inset: 0; mix-blend-mode: screen; opacity: .55; }
.vhs-split-r { background: linear-gradient(90deg, rgba(255,0,60,.22), transparent 18%, transparent 82%, rgba(255,0,60,.18)); }
.vhs-split-c { background: linear-gradient(90deg, rgba(0,220,255,.18), transparent 22%, transparent 78%, rgba(0,220,255,.22)); }
.vhs-band { position: absolute; left: -5%; width: 110%; background-image: ${NOISE}; background-size: 160px 160px; mix-blend-mode: screen; opacity: .55;
  backdrop-filter: blur(1.5px) brightness(1.5) hue-rotate(40deg); -webkit-backdrop-filter: blur(1.5px) brightness(1.5) hue-rotate(40deg); }
.vhs-static { position: absolute; inset: 0; background-image: ${NOISE}; background-size: 220px 220px; mix-blend-mode: normal; background-color: #1a1a24; opacity: 0; }
.vhs-osd { position: absolute; font-family: 'VT323', 'Press Start 2P', ui-monospace, monospace; color: #fff; letter-spacing: 2px; text-transform: uppercase;
  text-shadow: 2px 0 0 rgba(255,0,70,.85), -2px 0 0 rgba(0,230,255,.85), 0 0 8px rgba(255,255,255,.35); }
.vhs-rew { top: calc(18px + var(--safe-t, 0px)); left: calc(22px + var(--safe-l, 0px)); font-size: clamp(18px, 3.6vw, 34px); }
.vhs-rew .blink { animation: vhs-blink .5s steps(1) infinite; }
.vhs-sp { top: calc(22px + var(--safe-t, 0px)); right: calc(22px + var(--safe-r, 0px)); font-size: clamp(11px, 1.8vw, 16px); text-align: right; line-height: 1.6; }
.vhs-clock { bottom: calc(24px + var(--safe-b, 0px)); right: calc(22px + var(--safe-r, 0px)); font-size: clamp(16px, 3.2vw, 30px); text-align: right; line-height: 1.25; }
.vhs-clock small { display: block; font-size: .5em; opacity: .85; }
.vhs-to { bottom: calc(26px + var(--safe-b, 0px)); left: calc(22px + var(--safe-l, 0px)); font-size: clamp(10px, 1.6vw, 14px); max-width: 48vw; line-height: 1.6; }
@keyframes vhs-blink { 50% { opacity: 0; } }
.rewind-btn[aria-disabled='true'] { opacity: .45; filter: grayscale(.8); cursor: not-allowed; }
.rewind-btn .rw-count { margin-left: 2px; }
.rewind-btn:not([aria-disabled='true']) { box-shadow: 0 0 0 1px rgba(110,210,255,.55) inset; }
.rewind-touch { position: absolute; left: 12px; top: calc(50% + 52px); z-index: 30; font-family: 'Press Start 2P', monospace; font-size: .6rem; padding: 10px 10px; }
@media (prefers-reduced-motion: reduce) { .vhs-rew .blink { animation: none; } }
`;

function VhsOverlay() {
  const phase = usePhase();
  const root = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const bands = useRef<(HTMLDivElement | null)[]>([]);
  const stat = useRef<HTMLDivElement>(null);
  const scan = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!phase.active) return;
    tapeWhirr(REWIND_MS);
    const reduced = prefersReducedMotion();
    const { startedAt, fromMinutes, toMinutes } = phase;
    let raf = 0;
    const frame = () => {
      const t = performance.now() - startedAt;
      const k = Math.min(1, t / REWIND_MS);
      // ease: spin back fast in the middle, settle at the checkpoint
      const e = k < 0.15 ? 0 : k > 0.85 ? 1 : (1 - Math.cos(((k - 0.15) / 0.7) * Math.PI)) / 2;
      const m = fromMinutes + (toMinutes - fromMinutes) * e;
      if (clock.current) clock.current.textContent = clockLabel(m);
      if (counter.current) {
        // tape counter: 4 digits spinning backwards
        const c = Math.max(0, Math.round(9999 - k * 4321 - Math.sin(t / 40) * 3));
        counter.current.textContent = String(c).padStart(4, '0');
      }
      const el = root.current;
      if (el) el.style.opacity = String(k < 0.08 ? k / 0.08 : k > 0.88 ? Math.max(0, (1 - k) / 0.12) : 1);
      if (stat.current) {
        // a burst of full static hides the moment the world snaps back
        const d = Math.abs(t - RESTORE_AT_MS) / 170;
        stat.current.style.opacity = String(d < 1 ? 0.92 * (1 - d * d) : 0);
        if (!reduced) stat.current.style.backgroundPosition = `${(Math.random() * 200) | 0}px ${(Math.random() * 200) | 0}px`;
      }
      if (!reduced) {
        if (scan.current) scan.current.style.transform = `translateY(${(t / 12) % 3}px)`;
        bands.current.forEach((b, i) => {
          if (!b) return;
          const speed = 0.35 + i * 0.22;
          const y = ((t * speed) / 10 + i * 37) % 120 - 10;
          b.style.top = `${y}%`;
          b.style.height = `${4 + ((i * 7 + Math.floor(t / 90)) % 9)}%`;
          b.style.transform = `translateX(${(Math.random() * 2 - 1) * 14}px)`;
          b.style.backgroundPosition = `${(Math.random() * 160) | 0}px ${(Math.random() * 160) | 0}px`;
        });
      }
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase.active, phase.seq]);

  if (!phase.active) return null;
  return (
    <div className="vhs" ref={root} role="status" aria-live="assertive" aria-label="Rewinding time">
      <div className="vhs-tint" />
      <div className="vhs-split-r" style={{ transform: 'translateX(3px)' }} />
      <div className="vhs-split-c" style={{ transform: 'translateX(-3px)' }} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="vhs-band" ref={(el) => (bands.current[i] = el)} style={{ top: `${20 + i * 30}%`, height: '6%' }} />
      ))}
      <div className="vhs-scan" ref={scan} />
      <div className="vhs-bleed" />
      <div className="vhs-static" ref={stat} />
      <div className="vhs-osd vhs-rew">
        <span className="blink">◀◀</span> REWIND
      </div>
      <div className="vhs-osd vhs-sp">
        SP
        <br />
        <span ref={counter}>9999</span>
      </div>
      <div className="vhs-osd vhs-to">⟲ back to: {phase.label}</div>
      <div className="vhs-osd vhs-clock">
        <span ref={clock}>{clockLabel(phase.fromMinutes)}</span>
        <small>Day {store.state.clock.day}</small>
      </div>
    </div>
  );
}

/** HUD button: "◀◀ ×3". Disabled (with the reason as a tooltip) when there is nothing to rewind. */
export function RewindButton({ touch = false }: { touch?: boolean }) {
  useSnap();
  usePhase();
  const left = rewindsLeft(store);
  const c = canRewind(store);
  const title = c.ok && c.target ? `Rewind time to “${c.target.title}” — ${left} of ${REWINDS_PER_DAY} left today (T)` : `${c.reason ?? 'Rewind unavailable'} (T)`;
  return (
    <button
      className={`btn rewind-btn ${touch ? 'rewind-touch' : ''}`}
      aria-disabled={!c.ok}
      title={title}
      aria-label={`Rewind time, ${left} left today${c.ok ? '' : `. ${c.reason ?? ''}`}`}
      onClick={(e) => {
        e.currentTarget.blur();
        rewindPress();
      }}
    >
      ◀◀<span className="rw-count">×{left}</span>
      {!touch && <span className="lbl">T</span>}
    </button>
  );
}

export default function RewindOverlay() {
  return (
    <>
      <style>{CSS}</style>
      <VhsOverlay />
    </>
  );
}
