// Plot-twist overlays: the "WHAAAT?!" title card, power-cut darkness with a flashlight cone,
// the viral-reel views rocket + notification spam, mean comments, and the newspaper headline reveal.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { store } from '../core/store';
import { compact } from '../core/reels';
import { twistUi, viralRisen, viralViewsAt, VIRAL_PEAK } from '../core/twists';
import { prefersReducedMotion, useSnap } from './hooks';
import './twists.css';

const useTwistUi = () => useSyncExternalStore(twistUi.subscribe, twistUi.get);

export default function TwistOverlay() {
  const { state } = useSnap();
  const t = useTwistUi();
  const a = state.twists?.active;
  const dark = a?.id === 'powercut' && state.location === 'home';
  const torch = dark && !!a?.data.torch;
  return (
    <>
      {dark && <div className={`twist-dark ${torch ? 'torch' : ''}`} aria-hidden />}
      {dark && (
        <div className="twist-dark-note" role="status">
          {torch ? '🔦 Torch on' : '📱 Phone light only — find the torch!'}
        </div>
      )}
      {a?.id === 'viral' && a.step === 'rising' && t.viralStart !== null && <ViralRocket start={t.viralStart} />}
      {a?.id === 'viral' && a.step === 'mean' && t.comments.length > 0 && <Comments />}
      {state.twists?.fame?.day === state.clock.day && (state.location === 'town' || state.location === 'city') && (
        <div className="twist-fame" aria-label="You're famous today">
          {state.twists.fame.kind === 'viral' ? '⭐ 1.2M views · people recognise you' : '📰 Town hero · in today’s paper'}
        </div>
      )}
      {t.card && <Card key={t.card.id} emoji={t.card.emoji} title={t.card.title} sub={t.card.sub} tone={t.card.tone} />}
      {t.headline && <Headline key={t.headline.id} {...t.headline} />}
    </>
  );
}

function Card({ emoji, title, sub, tone }: { emoji: string; title: string; sub?: string; tone: string }) {
  return (
    <div className={`twist-card tone-${tone}`} role="status" aria-live="assertive">
      <span className="twist-card-emoji" aria-hidden>
        {emoji}
      </span>
      <b className="twist-card-title">{title}</b>
      {sub && <span className="twist-card-sub">{sub}</span>}
      <span className="twist-card-tag">PLOT TWIST</span>
    </div>
  );
}

function Headline({ paper, title, sub }: { paper: string; title: string; sub: string }) {
  const close = () => twistUi.set({ headline: null });
  useEffect(() => {
    const id = window.setTimeout(close, 7000);
    return () => window.clearTimeout(id);
  }, []);
  const day = store.state.clock.day;
  return (
    <div className="twist-paper-backdrop" onClick={close} role="dialog" aria-label={`Newspaper: ${title}`}>
      <div className="twist-paper">
        <div className="tp-mast">
          <span>Day {day}</span>
          <b>{paper}</b>
          <span>Free</span>
        </div>
        <h2 className="tp-title">{title}</h2>
        <div className="tp-body">
          <div className="tp-photo" aria-hidden>
            <span>👛</span>
            <span>🙂</span>
          </div>
          <p>{sub}</p>
        </div>
        <p className="tp-cols" aria-hidden>
          Neighbours say the young hero “didn’t even think twice”. The grateful owner called it “the best thing that happened all year”. Local shopkeeper adds: “I always knew that kid was special.”
        </p>
        <button className="btn btn-good" onClick={close} data-autofocus>
          Aww! 💛
        </button>
      </div>
    </div>
  );
}

const PINGS = ['❤️ 2.3K liked your reel', '💬 “LMAOOO 😂”', '🔁 shared 900×', '➕ 4,201 new followers', '❤️ 18K liked your reel', '💬 “the sibling though 💀”', '🔥 You’re trending #3', '💬 “REPLAY x100”', '➕ 52K new followers', '📈 For You page!'];

function ViralRocket({ start }: { start: number }) {
  const [now, setNow] = useState(() => performance.now());
  const done = useRef(false);
  const reduced = prefersReducedMotion();
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = performance.now();
      setNow(t);
      if (t - start >= 6500 || reduced) {
        if (!done.current) {
          done.current = true;
          window.setTimeout(() => viralRisen(store), reduced ? 1200 : 300);
        }
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [start, reduced]);
  const ms = reduced ? 6000 : now - start;
  const views = viralViewsAt(ms);
  const shown = Math.min(PINGS.length, Math.floor(ms / 550));
  return (
    <div className="twist-viral" role="status" aria-live="polite" aria-label={`Your reel: ${compact(views)} views`}>
      <div className="tv-phone">
        <span className="tv-label">YOUR REEL</span>
        <b className={`tv-views ${views >= VIRAL_PEAK ? 'peak' : ''}`}>{compact(views)}</b>
        <span className="tv-sub">views</span>
        <div className="tv-bar">
          <span style={{ width: `${Math.min(100, (Math.log10(views) / Math.log10(VIRAL_PEAK)) * 100)}%` }} />
        </div>
      </div>
      <div className="tv-pings" aria-hidden>
        {PINGS.slice(0, shown).map((p, i) => (
          <span key={i} className="tv-ping" style={{ ['--i' as string]: i % 5 }}>
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

function Comments() {
  const t = useTwistUi();
  return (
    <div className="twist-comments" aria-label="Comments on your reel">
      <b className="tc-head">💬 Comments</b>
      {t.comments.map((c, i) => (
        <div key={`${c.user}-${i}`} className={`tc-row ${c.tone}`} style={{ animationDelay: `${i * 120}ms` }}>
          <span className="tc-user">@{c.user}</span>
          <span className="tc-text">{c.text}</span>
        </div>
      ))}
    </div>
  );
}
