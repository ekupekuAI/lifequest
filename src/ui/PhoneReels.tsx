import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { store } from '../core/store';
import { SCREEN_LIMITS, addScreenTime } from '../core/conduct';
import { formatClock, formatDuration } from '../core/systems';
import { GUARDIAN_ROLES } from '../domain/types';
import { formatMoney } from '../domain/items';
import {
  PHONE_RATE,
  accrue,
  batteryFor,
  compact,
  crossed,
  makeReel,
  phoneLock,
  screenTier,
  tickedCount,
  todayConduct,
  type PhoneApp,
  type Reel,
} from '../core/reels';
import { REEL_H, REEL_W, drawReel } from './reelArt';
import { prefersReducedMotion, useSnap } from './hooks';
import './conduct.css';
import { CLIPS, postReel, reelClipReady } from '../core/twists';

/** Open the phone (HUD button / R key). A confiscated phone still opens — to its lock screen. */
export function openPhone() {
  if (store.ui.dialogue) return;
  const m = store.ui.modal;
  if (m && m.type !== 'reels') return;
  store.openModal(m?.type === 'reels' ? null : { type: 'reels' });
}

let opens = 0;

const TIER_CLASS = { none: '', ok: '', nudge: 'warn', scold: 'bad', confiscate: 'bad' } as const;

export default function PhoneReels() {
  const { state, ui } = useSnap();
  const lock = phoneLock(state);
  const [app, setApp] = useState<PhoneApp>(() => (lock.locked ? 'locked' : 'home'));
  const [nudge, setNudge] = useState(false);
  const [coming, setComing] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const seed = useMemo(() => (state.seed * 31 + state.clock.day * 977 + ++opens * 131) >>> 0, []); // eslint-disable-line react-hooks/exhaustive-deps
  const frameRef = useRef<HTMLDivElement>(null);
  const close = () => {
    if (store.ui.modal?.type === 'reels') store.openModal(null);
  };

  // ---- the clock keeps running while you're on the phone (a modal pauses the normal tick) ----
  useEffect(() => {
    if (app === 'locked' || nudge || coming) return;
    let carry = 0;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1000, now - last);
      last = now;
      if (document.hidden || store.ui.modal?.type !== 'reels' || store.ui.dialogue) return;
      const r = accrue(carry, dt, PHONE_RATE[app]);
      carry = r.carry;
      if (r.minutes <= 0) return;
      const before = todayConduct(store.state).screenMinutes;
      store.spendTime(r.minutes);
      const after = addScreenTime(store, r.minutes, 'phone');
      if (crossed(before, after, SCREEN_LIMITS.nudge)) setNudge(true);
    }, 250);
    return () => window.clearInterval(id);
  }, [app, nudge, coming]);

  // ---- a parent is coming over: show who, then put the phone away so the scene can play ----
  useEffect(
    () =>
      store.bus.on('conduct', (ev) => {
        if (ev.reason !== 'screen') return;
        setNudge(false);
        setComing(store.member(ev.memberId)?.name ?? 'Someone');
      }),
    [],
  );
  useEffect(() => {
    if (!coming) return;
    const id = window.setTimeout(close, 1700);
    return () => window.clearTimeout(id);
  }, [coming]);
  // any dialogue (intervention, surprise event, phone call) takes the phone out of your hands
  useEffect(() => {
    if (ui.dialogue) close();
  }, [ui.dialogue]);
  // confiscated while scrolling (and nobody walked over): put it away
  useEffect(() => {
    if (lock.locked && app !== 'locked' && !coming) close();
  }, [lock.locked]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    frameRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 1800);
    return () => window.clearTimeout(id);
  }, [note]);

  const c = todayConduct(state);
  const tier = screenTier(c.screenMinutes);
  const battery = batteryFor(c.screenMinutes);

  return (
    <div className="modal-backdrop phone-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="phone-wrap">
        <div ref={frameRef} className="phone" role="dialog" aria-modal="true" aria-label="Phone" tabIndex={-1}>
          <span className="phone-notch" aria-hidden />
          <div className="phone-screen">
            <div className="phone-status" aria-label="Status bar">
              <span className="ps-time" role="timer" aria-label={`Time ${formatClock(state.clock.minutes)}`}>
                {formatClock(state.clock.minutes)}
              </span>
              <span className="ps-right" aria-hidden>
                <span className="ps-signal">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span className={`ps-battery ${battery <= 20 ? 'low' : ''}`}>
                  <span style={{ width: `${battery}%` }} />
                </span>
                <span className="ps-pct">{battery}%</span>
              </span>
            </div>
            {app !== 'locked' && (
              <div className={`phone-screentime ${TIER_CLASS[tier]}`} aria-live="polite">
                ⏳ screen time today: <b>{formatDuration(c.screenMinutes)}</b>
              </div>
            )}
            <div className="phone-app">
              {app === 'home' && <HomeScreen onOpen={setApp} />}
              {app === 'reels' && <ReelsApp seed={seed} paused={nudge || !!coming} />}
              {app === 'messages' && <MessagesApp onNote={setNote} />}
              {app === 'calc' && <CalcApp />}
              {app === 'camera' && <CameraApp onDone={close} />}
              {app === 'locked' && <LockedScreen until={lock.until} onOk={close} />}
            </div>
            {note && (
              <div className="phone-note" role="status">
                {note}
              </div>
            )}
            {nudge && !coming && (
              <div className="phone-overlay" role="alertdialog" aria-label="You've been scrolling a while">
                <span className="big" aria-hidden>
                  ⏳
                </span>
                <b>You've been scrolling a while</b>
                <span>
                  {formatDuration(c.screenMinutes)} of screen time today — it's {formatClock(state.clock.minutes)} already. Your tasks (and your family) are still there.
                </span>
                <button className="btn btn-good btn-block" onClick={close} data-autofocus>
                  Put phone down
                </button>
                <button className="btn btn-ghost btn-block" onClick={() => setNudge(false)}>
                  Keep scrolling
                </button>
              </div>
            )}
            {coming && (
              <div className="phone-overlay coming" role="status">
                <span className="big" aria-hidden>
                  👀
                </span>
                <b>{coming} is coming over…</b>
                <span>Uh-oh. Better put that phone down.</span>
              </div>
            )}
            {app !== 'locked' && (
              <button className="phone-homebar" onClick={() => setApp('home')} aria-label="Home screen" title="Home screen">
                <span />
              </button>
            )}
          </div>
        </div>
        <button className="btn btn-good phone-down" onClick={close} title="Put phone down (Esc / R)">
          📵 Put phone down
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function HomeScreen({ onOpen }: { onOpen: (a: PhoneApp) => void }) {
  const { state } = useSnap();
  const msgs = familyMessages().length;
  const apps: { id: PhoneApp; icon: string; label: string; tone: string; badge?: string }[] = [
    { id: 'reels', icon: '▶', label: 'Reels', tone: 'reels', badge: '99+' },
    { id: 'messages', icon: '💬', label: 'Messages', tone: 'msgs', badge: msgs ? String(msgs) : undefined },
    { id: 'calc', icon: '🧮', label: 'Calc', tone: 'calc' },
    { id: 'camera', icon: '📷', label: 'Camera', tone: 'cam' },
  ];
  return (
    <div className="phone-home">
      <div className="ph-widget">
        <span className="ph-clock">{formatClock(state.clock.minutes)}</span>
        <span className="ph-date">Day {state.clock.day}</span>
      </div>
      <div className="ph-grid">
        {apps.map((a) => (
          <button
            key={a.id}
            className="ph-app"
            onClick={() => onOpen(a.id)}
            data-autofocus={a.id === 'reels' ? true : undefined}
          >
            <span className={`ph-icon ${a.tone}`} aria-hidden>
              {a.icon}
              {a.badge && <span className="ph-badge">{a.badge}</span>}
            </span>
            <span className="ph-label">{a.label}</span>
          </button>
        ))}
      </div>
      <p className="ph-tip">Tip: every minute here is a minute of your day.</p>
    </div>
  );
}

function familyMessages(): { from: string; text: string }[] {
  const members = store.state.profile.members;
  const g = members.find((m) => GUARDIAN_ROLES.includes(m.role));
  const sib = members.find((m) => m.role.includes('sibling'));
  const out: { from: string; text: string }[] = [];
  const run = store.state.run;
  const def = store.mission;
  if (run && def) {
    const who = store.member(run.assignerId);
    out.push({ from: who?.name ?? 'Home', text: `How's "${def.title}" going? 🙂` });
  }
  if (g) out.push({ from: g.name, text: store.state.clock.minutes > 18 * 60 ? 'Dinner soon. Phone away at the table please!' : 'Have you done your tasks today?' });
  if (sib) out.push({ from: sib.name, text: 'can i borrow ur charger 🔌' });
  return out;
}

function MessagesApp({ onNote }: { onNote: (t: string) => void }) {
  const list = familyMessages();
  return (
    <div className="phone-list">
      <h3>Messages</h3>
      {list.length ? (
        list.map((m, i) => (
          <button key={i} className="pl-row" onClick={() => onNote('Maybe later 👍 — or just go talk to them!')}>
            <span className="pl-avatar" aria-hidden>
              {m.from.slice(0, 1)}
            </span>
            <span className="grow">
              <b>{m.from}</b>
              <span className="pl-text">{m.text}</span>
            </span>
          </button>
        ))
      ) : (
        <p className="muted small">No new messages.</p>
      )}
    </div>
  );
}

function CalcApp() {
  const [disp, setDisp] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  const apply = (a: number, b: number, o: string) => (o === '+' ? a + b : o === '−' ? a - b : o === '×' ? a * b : b === 0 ? NaN : a / b);
  const show = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : 'Err');
  const press = (k: string) => {
    if (/^[0-9]$/.test(k)) {
      setDisp((d) => (fresh || d === '0' ? k : (d + k).slice(0, 10)));
      setFresh(false);
    } else if (k === '.') {
      setDisp((d) => (fresh ? '0.' : d.includes('.') ? d : d + '.'));
      setFresh(false);
    } else if (k === 'C') {
      setDisp('0');
      setAcc(null);
      setOp(null);
      setFresh(true);
    } else if (k === '=') {
      if (op && acc !== null) setDisp(show(apply(acc, Number(disp), op)));
      setAcc(null);
      setOp(null);
      setFresh(true);
    } else {
      const v = Number(disp);
      const next = op && acc !== null && !fresh ? apply(acc, v, op) : v;
      setAcc(next);
      setDisp(show(next));
      setOp(k);
      setFresh(true);
    }
  };
  const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', 'C', '0', '.', '+'];
  return (
    <div className="phone-calc">
      <span className="pc-hint">Wallet: {formatMoney(store.state.wallet.balance)}</span>
      <output className="pc-disp" aria-live="polite">
        {disp}
      </output>
      <div className="pc-keys">
        {keys.map((k) => (
          <button key={k} className={`pc-key ${/[÷×−+]/.test(k) ? 'op' : ''}`} onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button className="pc-key eq" onClick={() => press('=')}>
          =
        </button>
      </div>
    </div>
  );
}

function LockedScreen({ until, onOk }: { until: number | null; onOk: () => void }) {
  return (
    <div className="phone-later locked">
      <span className="big" aria-hidden>
        📵
      </span>
      <b>Your phone was taken away{until !== null ? ` until ${formatClock(until)}` : ''}</b>
      <span>Too much scrolling today. Use the time for your tasks — you'll get it back later.</span>
      <button className="btn btn-primary btn-block" onClick={onOk} data-autofocus>
        OK
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reels: an endless, snap-scrolling vertical feed.

function ReelsApp({ seed, paused }: { seed: number; paused: boolean }) {
  const [count, setCount] = useState(6);
  const [active, setActive] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; top: number; id: number } | null>(null);
  const reels = useMemo(() => Array.from({ length: count }, (_, i) => makeReel(seed, i)), [seed, count]);

  const goTo = (i: number) => {
    const el = feedRef.current;
    if (!el) return;
    const idx = Math.max(0, i);
    const top = idx * el.clientHeight;
    // don't wait for scroll events (they're frame-driven) to know where we're heading
    setActive(idx);
    if (idx >= count - 3) setCount((n) => n + 6);
    el.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    // smooth scrolling can stall (background tab, snap quirks): make sure we land
    window.setTimeout(() => {
      if (Math.abs(el.scrollTop - top) > 2 && !drag.current) el.scrollTop = top;
    }, 450);
  };

  const onScroll = () => {
    const el = feedRef.current;
    if (!el || !el.clientHeight) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    if (idx !== active) setActive(idx);
    // always keep a few more queued up — the feed never ends
    if (idx >= count - 3) setCount((n) => n + 6);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || store.ui.modal?.type !== 'reels' || store.ui.dialogue) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        goTo(active + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        goTo(active - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // mouse drag-to-scroll (touch scrolls natively)
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const el = feedRef.current!;
    drag.current = { y: e.clientY, top: el.scrollTop, id: e.pointerId };
    el.classList.add('dragging');
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const el = feedRef.current!;
    if (Math.abs(e.clientY - d.y) > 4 && !el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
    el.scrollTop = d.top - (e.clientY - d.y);
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const el = feedRef.current!;
    el.classList.remove('dragging');
    const dy = e.clientY - d.y;
    const base = Math.round(d.top / el.clientHeight);
    // a short flick is enough to move on — just like the real thing
    goTo(Math.abs(dy) > 40 ? base + (dy < 0 ? 1 : -1) : base);
  };

  return (
    <div className="reels">
      <div className="reels-top" aria-hidden>
        <span>Following</span>
        <b>For You</b>
      </div>
      <div
        ref={feedRef}
        className="reels-feed"
        onScroll={onScroll}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Reels feed. Scroll, swipe or use arrow keys."
        role="feed"
      >
        {reels.map((r) => (
          <ReelCard key={r.id} reel={r} active={r.index === active && !paused} near={Math.abs(r.index - active) <= 2} />
        ))}
      </div>
      {active === 0 && (
        <span className="reels-hint" aria-hidden>
          ▲ swipe
        </span>
      )}
    </div>
  );
}

function ReelCard({ reel, active, near }: { reel: Reel; active: boolean; near: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [liked, setLiked] = useState(false);
  const [burst, setBurst] = useState(0);
  const [watched, setWatched] = useState(0);

  // draw: animate only the reel on screen; neighbours get a still frame
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || !near) return;
    drawReel(ctx, reel, 0.4);
    if (!active) return;
    const reduced = prefersReducedMotion();
    let raf = 0;
    let lastDraw = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      // ~12 fps keeps the chunky pixel feel; reduced motion gets a slow slideshow
      if (now - lastDraw > (reduced ? 900 : 83)) {
        lastDraw = now;
        drawReel(ctx, reel, (now - t0) / 1000);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, near, reel]);

  // counters tick up while you watch — numbers go up, dopamine goes up
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setWatched((w) => w + 0.5), 500);
    return () => window.clearInterval(id);
  }, [active]);

  const like = () => {
    setLiked(true);
    setBurst((b) => b + 1);
  };
  const likes = tickedCount(reel.likes, watched, 3 + (reel.likes % 7)) + (liked ? 1 : 0);
  const comments = tickedCount(reel.comments, watched, 0.4 + (reel.comments % 3) * 0.3);

  return (
    <article className="reel" style={{ background: reel.bg }} aria-label={`${reel.handle}: ${reel.caption}`} onDoubleClick={like}>
      {near ? <canvas ref={canvasRef} width={REEL_W} height={REEL_H} className="reel-canvas px" aria-hidden /> : <span className="reel-canvas" />}
      {reel.kind === 'quote' && <p className="reel-quote">{reel.caption}</p>}
      {active && <span className="reel-progress" style={{ animationDuration: `${(4 / reel.speed).toFixed(2)}s` }} aria-hidden />}
      {burst > 0 && (
        <span key={burst} className="reel-burst" aria-hidden>
          ♥
        </span>
      )}
      <div className="reel-side">
        <button className={`rs-btn ${liked ? 'on' : ''}`} onClick={() => (liked ? setLiked(false) : like())} aria-pressed={liked} aria-label={`Like, ${compact(likes)} likes`}>
          <span aria-hidden>♥</span>
          <small>{compact(likes)}</small>
        </button>
        <button className="rs-btn" aria-label={`${compact(comments)} comments`} tabIndex={-1}>
          <span aria-hidden>💬</span>
          <small>{compact(comments)}</small>
        </button>
        <button className="rs-btn" aria-label={`${compact(reel.shares)} shares`} tabIndex={-1}>
          <span aria-hidden>↗</span>
          <small>{compact(reel.shares)}</small>
        </button>
      </div>
      <div className="reel-meta">
        <b>{reel.handle}</b>
        {reel.kind !== 'quote' && <span className="reel-cap">{reel.caption}</span>}
        <span className="reel-music">♫ original sound · {reel.handle.slice(1)}</span>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Camera: post a reel of something funny you filmed today (the viral-reel plot twist).

function CameraApp({ onDone }: { onDone: () => void }) {
  const { state } = useSnap();
  const v = state.twists?.viral;
  const clip = reelClipReady(store);
  const postedToday = !!v && v.day === state.clock.day;
  if (postedToday) {
    return (
      <div className="phone-later">
        <span className="big" aria-hidden>
          {v.phase === 'posted' ? '📤' : '📈'}
        </span>
        <b>{v.phase === 'posted' ? 'Your reel is up!' : `${compact(v.views)} views`}</b>
        <span>{v.phase === 'posted' ? 'Put the phone down and see what happens…' : 'One reel a day is plenty.'}</span>
      </div>
    );
  }
  return (
    <div className="phone-later">
      <span className="big" aria-hidden>
        🎬
      </span>
      <b>{clip ? 'You filmed the pillow fight!' : 'Nothing funny filmed yet'}</b>
      <span>{clip ? 'Feathers everywhere. It is honestly hilarious.' : 'Tip: a pillow fight with your sibling makes a great clip. Or post a goofy kitchen dance.'}</span>
      <button
        className="btn btn-good btn-block"
        data-autofocus
        onClick={() => {
          postReel(store, clip ? 'pillow-fight' : 'dance');
          onDone();
        }}
      >
        📤 Post the {CLIPS[clip ? 'pillow-fight' : 'dance']} reel
      </button>
      <span className="ph-tip">Never show your address, school or uniform in a reel.</span>
    </div>
  );
}
