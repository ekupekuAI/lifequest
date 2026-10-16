import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { store } from '../core/store';
import { startChildGame } from '../core/familySync';
import {
  createFamily,
  currentSession,
  joinFamily,
  multiplayerAvailable,
  previewCode,
  type FamilyPreview,
  type FamilySeat,
  type FamilySession,
} from '../services/family';
import { GUARDIAN_ROLES, type Profile, type Role, type Settings } from '../domain/types';
import { DEFAULT_PLAYER_LOOK, ROLE_LABELS, defaultMember } from '../domain/family';
import { setRegion } from '../domain/region';
import FamilySetup from './FamilySetup';
import { Portrait, kindOf } from './art';
import { isTypingTarget } from './hooks';
import './family.css';

// ---------- shared helpers (also used by ParentLive) ----------

/** Uppercase, trim and turn any run of spaces/dashes/underscores/dots into one dash: " sunny 7kd2" → "SUNNY-7KD2". */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

/** What the user sees when a family call fails. Never shows raw server text for unknown errors. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  const m = msg.toLowerCase();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return "You're offline. Check the internet connection and try again.";
  if (m.includes('not implemented')) return "Family play isn't switched on for this site yet. Ask the grown-up who set it up, or play offline for now.";
  if (m.includes('too many') || m.includes('rate') || m.includes('429')) return 'Too many tries. Wait a minute, then try again.';
  if (m.includes('taken') || m.includes('claimed') || m.includes('already')) return 'Someone is already playing as that person. Pick another one.';
  if (m.includes('not found') || m.includes('invalid code') || m.includes('no such') || m.includes('expired')) return "That code didn't work. Check the letters and try again.";
  if (m.includes('fetch') || m.includes('network') || m.includes('timeout') || m.includes('offline')) return "Couldn't reach the family server. Check the internet connection and try again.";
  return 'Something went wrong. Please try again.';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the old way */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function siteUrl(): string {
  return `${location.origin}${import.meta.env.BASE_URL ?? '/'}`;
}

export function shareText(code: string, forGrownups = false): string {
  return forGrownups
    ? `Join our LifeQuest family as a grown-up: open ${siteUrl()} → Family → Join → code ${code} (please keep this code private)`
    : `Join our LifeQuest family: open ${siteUrl()} → Family → Join → code ${code}`;
}

/** Best-guess look for a seat when the family profile isn't loaded (preview only has roles). */
export function seatLook(role: Role) {
  if (role === 'player') return { appearance: DEFAULT_PLAYER_LOOK, kind: kindOf('player') };
  const m = defaultMember(role as Exclude<Role, 'player'>);
  return { appearance: m.appearance, kind: kindOf(role) };
}

/** Copy button that briefly says "Copied!". */
export function CopyButton({ text, label, caption = 'Copy', className = 'btn btn-sm' }: { text: string; label: string; caption?: string; className?: string }) {
  const [done, setDone] = useState<null | boolean>(null);
  useEffect(() => {
    if (done === null) return;
    const t = window.setTimeout(() => setDone(null), 1800);
    return () => window.clearTimeout(t);
  }, [done]);
  return (
    <button type="button" className={className} onClick={async () => setDone(await copyText(text))} aria-label={label}>
      {done === true ? '✓ Copied!' : done === false ? 'Select & copy' : `⧉ ${caption}`}
      <span className="sr-only" role="status">
        {done === true ? 'Copied' : ''}
      </span>
    </button>
  );
}

export function Loading({ children }: { children: ReactNode }) {
  return (
    <span className="fam-loading" role="status">
      <span className="fam-spinner" aria-hidden />
      {children}
    </span>
  );
}

// ---------- the gate ----------

type Step =
  | { s: 'choose' }
  | { s: 'source'; hasSave: boolean }
  | { s: 'setup' }
  | { s: 'grownup'; profile: Profile; settings: Settings }
  | { s: 'codes'; session: FamilySession }
  | { s: 'join' }
  | { s: 'seat'; code: string; preview: FamilyPreview };

export default function FamilyGate() {
  const [step, setStep] = useState<Step>({ s: 'choose' });
  const existing = currentSession();
  const back = () => {
    switch (step.s) {
      case 'choose':
        return store.goToScreen('start');
      case 'grownup':
      case 'setup':
      case 'source':
        return setStep({ s: 'choose' });
      case 'seat':
        return setStep({ s: 'join' });
      case 'codes':
        return store.goToScreen('parent-live');
      default:
        return setStep({ s: 'choose' });
    }
  };
  const backRef = useRef(back);
  backRef.current = back;

  useEffect(() => {
    if (step.s === 'setup') return; // FamilySetup handles its own Escape
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !isTypingTarget(e.target) && backRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step.s]);

  if (step.s === 'setup') {
    return <FamilySetup onBack={() => setStep({ s: 'choose' })} onCreate={(profile, settings) => setStep({ s: 'grownup', profile, settings })} />;
  }

  async function startCreate() {
    if (!store.repo.hasSave()) return setStep({ s: 'setup' });
    setStep({ s: 'source', hasSave: true });
  }

  const title =
    step.s === 'codes' ? 'Your family codes' : step.s === 'join' || step.s === 'seat' ? 'Join a family' : step.s === 'choose' ? 'Family play' : 'Create a family';

  return (
    <div className="screen fam screen-scroll">
      <div className="fam-inner">
        <header className="setup-head">
          <button className="icon-btn" onClick={back} aria-label={step.s === 'choose' ? 'Back to title' : 'Back'} title="Back (Esc)">
            ←
          </button>
          <h1>{title}</h1>
        </header>

        {step.s === 'choose' && (
          <>
            {!multiplayerAvailable() && (
              <p className="fam-error" role="alert">
                Family play needs the online service, and it isn't set up on this site. You can still play offline from the title screen.
              </p>
            )}
            {existing && (
              <section className="panel fam-card" aria-label="This device's family">
                <p className="fam-lead">
                  This device already plays as <b>{existing.displayName}</b> in <b>{existing.familyName}</b>.
                </p>
                <ContinueSession session={existing} />
              </section>
            )}
            <div className="fam-choices">
              <button type="button" className="fam-choice" onClick={startCreate}>
                <span className="big" aria-hidden>
                  🏠
                </span>
                <span className="t">Create a family</span>
                <span className="d">For grown-ups. Set up your family, then share a code with your kids.</span>
              </button>
              <button type="button" className="fam-choice" onClick={() => setStep({ s: 'join' })} autoFocus>
                <span className="big" aria-hidden>
                  🔑
                </span>
                <span className="t">Join with a code</span>
                <span className="d">Got a code from your family? Type it in and pick who you are.</span>
              </button>
            </div>
            <PrivacyNote />
          </>
        )}

        {step.s === 'source' && (
          <section className="panel fam-card" aria-labelledby="src-h">
            <h2 id="src-h" className="eyebrow">
              Which family?
            </h2>
            <p className="fam-lead">You already have a family saved on this device. Use it, or set up a new one?</p>
            <UseSavedFamily onLoaded={(profile, settings) => setStep({ s: 'grownup', profile, settings })} onNew={() => setStep({ s: 'setup' })} />
          </section>
        )}

        {step.s === 'grownup' && <GrownupStep profile={step.profile} settings={step.settings} onBack={() => setStep({ s: 'setup' })} onCreated={(session) => setStep({ s: 'codes', session })} />}

        {step.s === 'codes' && <CodesStep session={step.session} />}

        {step.s === 'join' && <JoinStep onPreview={(code, preview) => setStep({ s: 'seat', code, preview })} />}

        {step.s === 'seat' && <SeatStep code={step.code} preview={step.preview} onBack={() => setStep({ s: 'join' })} />}
      </div>
    </div>
  );
}

function PrivacyNote() {
  return (
    <p className="fam-note">
      <span aria-hidden>🔒</span>
      <span>
        <b>No email or password.</b> Use made-up names. Each device just remembers which family member it plays as.
      </span>
    </p>
  );
}

/** Continue as the family member this device already plays. */
export function ContinueSession({ session, className = 'btn btn-primary btn-lg' }: { session: FamilySession; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    if (session.kind === 'parent') return store.goToScreen('parent-live');
    setBusy(true);
    setErr(null);
    try {
      await startChildGame(session);
      if (store.ui.screen !== 'game') store.goToScreen('game');
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className={className} onClick={go} disabled={busy}>
        {busy ? 'Loading…' : `▶ Continue as ${session.displayName} · ${session.familyName}`}
      </button>
      {err && (
        <p className="fam-error" role="alert">
          {err}
        </p>
      )}
    </>
  );
}

function UseSavedFamily({ onLoaded, onNew }: { onLoaded: (p: Profile, s: Settings) => void; onNew: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function useSaved() {
    setBusy(true);
    setErr(null);
    try {
      const loaded = await store.repo.load();
      if (!loaded) throw new Error('no save');
      onLoaded(loaded.profile, { ...store.state.settings, ...(loaded.settings ?? {}) });
    } catch {
      setErr("Couldn't open the saved family. Set up a new one instead.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="fam-cta">
        <button className="btn btn-lg" onClick={onNew} disabled={busy}>
          ✚ Set up a new family
        </button>
        <button className="btn btn-primary btn-lg" onClick={useSaved} disabled={busy} autoFocus>
          {busy ? 'Opening…' : 'Use my saved family ▶'}
        </button>
      </div>
      {err && (
        <p className="fam-error" role="alert">
          {err}
        </p>
      )}
    </>
  );
}

function GrownupStep({ profile, settings, onBack, onCreated }: { profile: Profile; settings: Settings; onBack: () => void; onCreated: (s: FamilySession) => void }) {
  const grownups = profile.members.filter((m) => GUARDIAN_ROLES.includes(m.role));
  const [who, setWho] = useState(grownups[0]?.id ?? '');
  const [familyName, setFamilyName] = useState(profile.familyName || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!who) return;
    setBusy(true);
    setErr(null);
    try {
      const name = familyName.replace(/[<>]/g, '').trim().slice(0, 32) || profile.familyName || 'Our family';
      const session = await createFamily({ familyName: name, profile: { ...profile, familyName: name }, settings, asGameMemberId: who });
      onCreated(session);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel fam-card" aria-labelledby="gu-h">
      <h2 id="gu-h" className="eyebrow">
        Which grown-up are you?
      </h2>
      {grownups.length === 0 ? (
        <>
          <p className="fam-error" role="alert">
            This family has no grown-up yet. Go back and pick a family with a parent, grandparent or guardian.
          </p>
          <div className="fam-cta">
            <button className="btn btn-lg" onClick={onBack}>
              ← Change family
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="fam-seats" role="radiogroup" aria-label="Which grown-up are you?">
            {grownups.map((m) => (
              <button key={m.id} type="button" className="fam-seat" role="radio" aria-checked={who === m.id} aria-pressed={who === m.id} onClick={() => setWho(m.id)}>
                <Portrait id={`gate-${m.id}`} appearance={m.appearance} kind={kindOf(m.role)} size={48} alt="" />
                <span className="who">{m.name}</span>
                <span className="tiny muted">{ROLE_LABELS[m.role]}</span>
              </button>
            ))}
          </div>
          <label className="field">
            <span className="label">Family name</span>
            <input type="text" value={familyName} maxLength={32} placeholder="The Sunny Family" onChange={(e) => setFamilyName(e.target.value)} autoComplete="off" spellCheck={false} />
            <span className="tiny muted">Shown to everyone who joins. A made-up name is fine.</span>
          </label>
          {err && (
            <p className="fam-error" role="alert">
              {err}
            </p>
          )}
          <div className="fam-cta">
            <button className="btn btn-lg" onClick={onBack} disabled={busy}>
              Back
            </button>
            <button className="btn btn-primary btn-lg" onClick={create} disabled={busy || !who}>
              {busy ? 'Creating…' : 'Create our family ▶'}
            </button>
          </div>
          {busy && <Loading>Setting up your family…</Loading>}
          <PrivacyNote />
        </>
      )}
    </section>
  );
}

function CodeBox({ title, hint, code, tone, share }: { title: string; hint: string; code: string; tone: 'kids' | 'grown'; share: string }) {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <div className={`fam-code ${tone}`}>
      <span className="label">{title}</span>
      <span className="fam-code-value" aria-label={`${title}: ${code.split('').join(' ')}`}>
        {code}
      </span>
      <span className="small muted">{hint}</span>
      <div className="row wrap">
        <CopyButton text={code} label={`Copy ${title}`} caption="Copy code" className="btn btn-sm" />
        <CopyButton text={share} label={`Copy invite message for ${title}`} caption="Copy invite" className="btn btn-sm btn-ghost" />
        {canShare && (
          <button type="button" className="btn btn-sm btn-sky" onClick={() => navigator.share({ title: 'LifeQuest family', text: share }).catch(() => {})}>
            ↗ Share
          </button>
        )}
      </div>
    </div>
  );
}

function CodesStep({ session }: { session: FamilySession }) {
  const kidShare = shareText(session.familyCode);
  return (
    <section className="panel fam-card" aria-labelledby="codes-h">
      <h2 id="codes-h" className="eyebrow">
        {session.familyName} is ready!
      </h2>
      <p className="fam-lead">Give these codes to your family. Anyone with a code can join from their own phone or computer.</p>
      <div className="fam-codes">
        <CodeBox title="Family code" hint="For kids. They pick who they are after typing it." code={session.familyCode} tone="kids" share={kidShare} />
        {session.parentCode && (
          <CodeBox
            title="Parent code"
            hint="For other grown-ups only. Keep it private: it lets people assign tasks."
            code={session.parentCode}
            tone="grown"
            share={shareText(session.parentCode, true)}
          />
        )}
      </div>
      <div className="boxed">
        <span className="label">Invite message for kids</span>
        <p className="fam-share">{kidShare}</p>
      </div>
      <p className="tiny muted">You can see these codes again (or make new ones) in the parent dashboard.</p>
      <div className="fam-cta">
        <button className="btn btn-primary btn-lg" onClick={() => store.goToScreen('parent-live')} autoFocus>
          Open parent dashboard ▶
        </button>
      </div>
    </section>
  );
}

function JoinStep({ onPreview }: { onPreview: (code: string, preview: FamilyPreview) => void }) {
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const code = normalizeCode(raw);

  async function lookup(e?: FormEvent) {
    e?.preventDefault();
    if (code.replace(/-/g, '').length < 4) return setErr('Type the whole code, for example SUNNY-7KD2.');
    setBusy(true);
    setErr(null);
    try {
      const preview = await previewCode(code);
      if (!preview) setErr(multiplayerAvailable() ? "We couldn't find that code. Check the letters with whoever gave it to you." : friendlyError(new Error('not implemented')));
      else onPreview(code, preview);
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel fam-card" onSubmit={lookup} aria-labelledby="join-h">
      <h2 id="join-h" className="eyebrow">
        Type your family code
      </h2>
      <label className="field">
        <span className="label">Code</span>
        <input
          type="text"
          className="fam-code-input"
          value={raw}
          maxLength={30}
          placeholder="SUNNY-7KD2"
          onChange={(e) => setRaw(e.target.value.toUpperCase())}
          onBlur={() => raw && setRaw(normalizeCode(raw))}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          aria-describedby="code-hint"
          aria-invalid={!!err}
          autoFocus
        />
        <span id="code-hint" className="tiny muted">
          Capitals, spaces and dashes don't matter.
        </span>
      </label>
      {err && (
        <p className="fam-error" role="alert">
          {err}
        </p>
      )}
      <div className="fam-cta">
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !code}>
          {busy ? 'Checking…' : 'Next ▶'}
        </button>
      </div>
      <PrivacyNote />
    </form>
  );
}

function SeatStep({ code, preview, onBack }: { code: string; preview: FamilyPreview; onBack: () => void }) {
  const isChild = preview.kind === 'child';
  const seats = preview.seats.filter((s) => s.kind === preview.kind);
  const [pick, setPick] = useState<string | 'new' | null>(seats.find((s) => !s.claimed)?.memberId ?? (isChild ? 'new' : null));
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cleanName = newName.replace(/[<>]/g, '').trim().slice(0, 16);

  async function join() {
    if (!pick) return;
    if (pick === 'new' && !cleanName) return setErr('Type a name for yourself first. A made-up one is fine.');
    setBusy(true);
    setErr(null);
    try {
      const session = await joinFamily(code, pick === 'new' ? { newChildName: cleanName } : { memberId: pick });
      if (session.kind === 'parent') {
        store.goToScreen('parent-live');
        return;
      }
      await startChildGame(session);
      if (store.ui.screen !== 'game') store.goToScreen('game');
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }

  const seatCard = (s: FamilySeat) => {
    const look = seatLook(s.role);
    const chosen = pick === s.memberId;
    return (
      <button
        key={s.memberId}
        type="button"
        className="fam-seat"
        role="radio"
        aria-checked={chosen}
        aria-pressed={chosen}
        disabled={s.claimed || busy}
        onClick={() => setPick(s.memberId)}
        aria-label={`${s.name}${s.claimed ? ', already playing' : ''}`}
      >
        <Portrait id={`seat-${s.memberId}`} appearance={look.appearance} kind={look.kind} size={48} alt="" />
        <span className="who">{s.name}</span>
        <span className="tiny muted">{s.claimed ? 'Already playing' : s.role === 'player' ? 'Child' : ROLE_LABELS[s.role] ?? s.role}</span>
      </button>
    );
  };

  return (
    <section className="panel fam-card" aria-labelledby="seat-h">
      <h2 id="seat-h" className="eyebrow">
        {preview.regionFlag ? `${preview.regionFlag} ` : ''}
        {preview.familyName}
      </h2>
      <p className="fam-lead">{isChild ? 'Who are you?' : 'Which grown-up are you?'}</p>
      <div className="fam-seats" role="radiogroup" aria-label={isChild ? 'Who are you?' : 'Which grown-up are you?'}>
        {seats.map(seatCard)}
        {isChild && (
          <button type="button" className="fam-seat" role="radio" aria-checked={pick === 'new'} aria-pressed={pick === 'new'} disabled={busy} onClick={() => setPick('new')}>
            <span className="new" aria-hidden>
              ✚
            </span>
            <span className="who">I'm a new child</span>
            <span className="tiny muted">Add me to the family</span>
          </button>
        )}
      </div>
      {seats.length === 0 && !isChild && <p className="muted">No grown-up places are left in this family. Ask the family's creator.</p>}
      {pick === 'new' && (
        <label className="field">
          <span className="label">Your name</span>
          <input type="text" value={newName} maxLength={16} placeholder="Alex" onChange={(e) => setNewName(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
          <span className="tiny muted">Use a made-up name — no real names needed.</span>
        </label>
      )}
      {err && (
        <p className="fam-error" role="alert">
          {err}
        </p>
      )}
      <div className="fam-cta">
        <button className="btn btn-lg" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button className="btn btn-primary btn-lg" onClick={join} disabled={busy || !pick}>
          {busy ? 'Joining…' : isChild ? 'Start playing ▶' : 'Open parent dashboard ▶'}
        </button>
      </div>
      {busy && <Loading>{isChild ? 'Getting your game ready…' : 'Joining…'}</Loading>}
    </section>
  );
}

// keep the region in step with a loaded profile for money labels
export function applyRegion(settings?: Partial<Settings> | null) {
  if (settings?.region) setRegion(settings.region);
}
