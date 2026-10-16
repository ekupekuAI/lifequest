import { useEffect, useMemo, useState } from 'react';
import { store } from '../core/store';
import type { Appearance, HairStyle, Role } from '../domain/types';
import {
  DEFAULT_PLAYER_LOOK,
  FAMILY_PRESETS,
  HAIR_COLORS,
  PANTS_COLORS,
  ROLE_LABELS,
  SHIRT_COLORS,
  SKIN_TONES,
  buildProfile,
  defaultMember,
} from '../domain/family';
import { CharacterPreview, Portrait, kindOf } from './art';
import { isTypingTarget } from './hooks';

const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'long', label: 'Long' },
  { id: 'bun', label: 'Bun' },
  { id: 'spiky', label: 'Spiky' },
  { id: 'bald', label: 'Shaved' },
];

function SwatchRow({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {colors.map((c, i) => (
          <button
            key={c}
            type="button"
            className="swatch"
            role="radio"
            aria-checked={value === c}
            aria-label={`${label} ${i + 1}`}
            style={{ background: c }}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
    </div>
  );
}

export default function FamilySetup() {
  const [name, setName] = useState('');
  const [look, setLook] = useState<Appearance>({ ...DEFAULT_PLAYER_LOOK });
  const [presetId, setPresetId] = useState(FAMILY_PRESETS[0].id);
  const [names, setNames] = useState<Partial<Record<string, string>>>({});
  const preset = FAMILY_PRESETS.find((p) => p.id === presetId) ?? FAMILY_PRESETS[0];
  const playerKind = kindOf('player');
  const set = (patch: Partial<Appearance>) => setLook((l) => ({ ...l, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !isTypingTarget(e.target) && store.goToScreen('start');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const defaults = useMemo(() => {
    const out: Partial<Record<Role, ReturnType<typeof defaultMember>>> = {};
    for (const p of FAMILY_PRESETS) for (const r of p.roles) out[r] ??= defaultMember(r);
    return out;
  }, []);

  function start() {
    const overrides: Record<string, string> = {};
    for (const r of preset.roles) {
      const v = names[r]?.trim();
      if (v) overrides[r] = v;
    }
    store.newGame(buildProfile(name.trim(), look, preset, overrides));
  }

  const displayName = name.trim() || 'Alex';

  return (
    <div className="screen setup screen-scroll">
      <div className="setup-inner">
        <header className="setup-head">
          <button className="icon-btn" onClick={() => store.goToScreen('start')} aria-label="Back to title" title="Back (Esc)">
            ←
          </button>
          <h1>Create your life</h1>
        </header>

        <div className="setup-grid">
          <section className="panel setup-card" aria-labelledby="you-h">
            <h2 id="you-h" className="eyebrow">1 · You</h2>
            <div className="stage">
              <CharacterPreview appearance={look} kind={playerKind} height={128} />
            </div>
            <label className="field">
              <span className="label">Your name</span>
              <input
                type="text"
                value={name}
                maxLength={16}
                placeholder="Alex"
                onChange={(e) => setName(e.target.value.replace(/[<>]/g, ''))}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="name-hint"
                autoFocus
              />
              <span id="name-hint" className="tiny muted">
                Use a made-up name — no real names needed.
              </span>
            </label>
          </section>

          <section className="panel setup-card" aria-label="Appearance">
            <h2 className="eyebrow">Look</h2>
            <SwatchRow label="Skin" colors={SKIN_TONES} value={look.skin} onPick={(c) => set({ skin: c })} />
            <SwatchRow label="Hair colour" colors={HAIR_COLORS} value={look.hair} onPick={(c) => set({ hair: c })} />
            <div className="field">
              <span className="label">Hair style</span>
              <div className="chips" role="radiogroup" aria-label="Hair style">
                {HAIR_STYLES.map((h) => (
                  <button key={h.id} type="button" className="chip" role="radio" aria-checked={look.hairStyle === h.id} onClick={() => set({ hairStyle: h.id })}>
                    <Portrait id={`style-${h.id}`} appearance={{ ...look, hairStyle: h.id }} kind={playerKind} size={30} alt="" />
                    {h.label}
                  </button>
                ))}
              </div>
            </div>
            <SwatchRow label="Shirt" colors={SHIRT_COLORS} value={look.shirt} onPick={(c) => set({ shirt: c })} />
            <SwatchRow label="Pants" colors={PANTS_COLORS} value={look.pants} onPick={(c) => set({ pants: c })} />
          </section>
        </div>

        <section className="panel setup-card" aria-labelledby="fam-h">
          <h2 id="fam-h" className="eyebrow">2 · Your family</h2>
          <div className="presets" role="radiogroup" aria-label="Family">
            {FAMILY_PRESETS.map((p) => (
              <button key={p.id} type="button" className="preset" role="radio" aria-checked={p.id === presetId} onClick={() => setPresetId(p.id)}>
                <span className="preset-faces">
                  <Portrait id="setup-player" appearance={look} kind={playerKind} size={36} alt={displayName} />
                  {p.roles.map((r) => {
                    const m = defaults[r]!;
                    return <Portrait key={r} id={`setup-${r}`} appearance={m.appearance} kind={kindOf(r)} size={36} alt={ROLE_LABELS[r]} />;
                  })}
                </span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
          <div className="names">
            {preset.roles.map((r) => {
              const m = defaults[r]!;
              return (
                <label key={r} className="name-row">
                  <Portrait id={`setup-${r}`} appearance={m.appearance} kind={kindOf(r)} size={36} alt="" />
                  <span className="field grow">
                    <span className="label">{ROLE_LABELS[r]}</span>
                    <input type="text" maxLength={16} value={names[r] ?? ''} placeholder={m.name} onChange={(e) => setNames((n) => ({ ...n, [r]: e.target.value.replace(/[<>]/g, '') }))} autoComplete="off" spellCheck={false} />
                  </span>
                </label>
              );
            })}
          </div>
          <p className="tiny muted">Family members give you tasks. You can rename them — placeholders are used if left blank.</p>
        </section>

        <div className="setup-cta">
          <button className="btn" onClick={() => store.goToScreen('start')}>
            Back
          </button>
          <button className="btn btn-primary btn-lg" onClick={start}>
            Start life as {displayName} ▶
          </button>
        </div>
      </div>
    </div>
  );
}
