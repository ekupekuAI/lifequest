import { useEffect, useMemo, useState } from 'react';
import { store } from '../core/store';
import type { Appearance, HairStyle, Profile, Role, Settings, VoiceProfile } from '../domain/types';
import {
  DEFAULT_PLAYER_LOOK,
  DEFAULT_VOICES,
  FAMILY_PRESETS,
  HAIR_COLORS,
  PANTS_COLORS,
  ROLE_LABELS,
  SHIRT_COLORS,
  SKIN_TONES,
  buildProfile,
  defaultMember,
  partnerMember,
  type PartnerChoice,
} from '../domain/family';
import { region, setRegion, type RegionId } from '../domain/region';
import { sampleLine, voice } from '../core/voice';
import { CharacterPreview, Portrait, kindOf } from './art';
import { isTypingTarget, useSnap } from './hooks';
import { DifficultyPicker, RegionPicker, restorePrefs, updateSettings, useDisplaySettings, useVoiceState } from './SettingsModal';
import './voice.css';

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

function VoiceControls({
  role,
  name,
  speakKey,
  profile,
  onChange,
  defaults,
}: {
  defaults?: VoiceProfile;
  role: Role;
  name: string;
  speakKey: string;
  profile: VoiceProfile;
  onChange: (v: VoiceProfile) => void;
}) {
  const v = useVoiceState();
  const prefix = region().lang.split('-')[0].toLowerCase();
  const systemVoices = v.isSupported()
    ? v.listVoices().filter((x) => {
        const l = (x.lang || '').toLowerCase().split(/[-_]/)[0];
        return l === prefix || l === 'en';
      })
    : [];
  const set = (patch: Partial<VoiceProfile>) => onChange({ ...profile, ...patch });
  const talking = v.speaking && v.speakingKey === speakKey;
  return (
    <div className="vs-voice" role="group" aria-label={`${name}'s voice`}>
      <label className="vs-range">
        <span className="label" style={{ minWidth: 44 }}>
          Pitch
        </span>
        <input type="range" min={0.6} max={1.8} step={0.05} value={profile.pitch} onChange={(e) => set({ pitch: Number(e.target.value) })} aria-label={`${name}: voice pitch`} />
        <output>{profile.pitch.toFixed(2)}</output>
      </label>
      <label className="vs-range">
        <span className="label" style={{ minWidth: 44 }}>
          Speed
        </span>
        <input type="range" min={0.7} max={1.3} step={0.05} value={profile.rate} onChange={(e) => set({ rate: Number(e.target.value) })} aria-label={`${name}: voice speed`} />
        <output>{profile.rate.toFixed(2)}×</output>
      </label>
      {systemVoices.length > 0 && (
        <label className="field vs-wide">
          <span className="label">System voice</span>
          <select value={profile.voiceURI ?? ''} onChange={(e) => set({ voiceURI: e.target.value || undefined })} aria-label={`${name}: system voice`}>
            <option value="">Automatic (best match)</option>
            {systemVoices.map((x) => (
              <option key={x.voiceURI} value={x.voiceURI}>
                {x.name} ({x.lang})
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="vs-voice-actions vs-wide">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => (talking ? v.stop() : v.preview(profile, sampleLine(role, name), speakKey))}
          aria-label={talking ? `Stop ${name}'s voice test` : `Test ${name}'s voice`}
        >
          {talking ? '■ Stop' : '▶ Test'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange({ ...(defaults ?? DEFAULT_VOICES[role]) })}>
          Reset
        </button>
        {!v.isSupported() && <span className="vs-note">Speech isn't available in this browser, so you'll hear babble.</span>}
      </div>
    </div>
  );
}

/**
 * `onCreate` switches the screen into "online family" mode: instead of starting a local game,
 * the finished profile is handed back (FamilyGate then creates the online family).
 */
export default function FamilySetup({ onCreate, onBack }: { onCreate?: (profile: Profile, settings: Settings) => void; onBack?: () => void } = {}) {
  const [name, setName] = useState('');
  const [look, setLook] = useState<Appearance>({ ...DEFAULT_PLAYER_LOOK });
  const [presetId, setPresetId] = useState(FAMILY_PRESETS[0].id);
  const [names, setNames] = useState<Partial<Record<string, string>>>({});
  const [voices, setVoices] = useState<Partial<Record<Role, VoiceProfile>>>({});
  const [openVoice, setOpenVoice] = useState<Role | null>(null);
  const [partner, setPartner] = useState<PartnerChoice>(null);
  const [partnerNameInput, setPartnerNameInput] = useState('');
  const { state } = useSnap();
  useDisplaySettings();
  const settings = state.settings;
  const regionId = settings.region;
  const preset = FAMILY_PRESETS.find((p) => p.id === presetId) ?? FAMILY_PRESETS[0];
  const playerKind = kindOf('player');
  const set = (patch: Partial<Appearance>) => setLook((l) => ({ ...l, ...patch }));
  const back = () => (onBack ? onBack() : store.goToScreen('start'));
  const vp = (r: Role): VoiceProfile =>
    voices[r] ?? (r === 'partner' && partner ? { ...partnerMember(partner).voice! } : { ...DEFAULT_VOICES[r] });
  const setVp = (r: Role, v: VoiceProfile) => setVoices((m) => ({ ...m, [r]: v }));

  useEffect(() => {
    restorePrefs();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !isTypingTarget(e.target) && back();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      voice.stop();
    };
  }, []);

  // default names follow the region; names the player typed are kept as they are
  const defaults = useMemo(() => {
    setRegion(regionId);
    const out: Partial<Record<Role, ReturnType<typeof defaultMember>>> = {};
    for (const p of FAMILY_PRESETS) for (const r of p.roles) out[r] ??= defaultMember(r);
    return out;
  }, [regionId]);
  const partnerDefaults = useMemo(() => {
    setRegion(regionId);
    return { girlfriend: partnerMember('girlfriend'), boyfriend: partnerMember('boyfriend') };
  }, [regionId]);
  const pickPartner = (p: PartnerChoice) => {
    setPartner(p);
    // the voice follows the pick unless the player tuned it
    setVoices((v) => {
      const { partner: _old, ...rest } = v;
      return rest;
    });
  };

  const pickRegion = (id: RegionId) => {
    setRegion(id);
    updateSettings({ region: id });
  };

  function start() {
    voice.stop();
    const overrides: Record<string, string> = {};
    for (const r of preset.roles) {
      const v = names[r]?.trim();
      if (v) overrides[r] = v;
    }
    setRegion(regionId);
    if (partner && partnerNameInput.trim()) overrides.partner = partnerNameInput.trim();
    const profile = buildProfile(name.trim(), look, preset, overrides, partner);
    for (const m of profile.members) m.voice = { ...vp(m.role) };
    if (onCreate) return onCreate(profile, { ...settings, region: regionId });
    store.newGame(profile, { region: regionId, difficulty: settings.difficulty });
  }

  const displayName = name.trim() || 'Alex';

  return (
    <div className="screen setup screen-scroll">
      <div className="setup-inner">
        <header className="setup-head">
          <button className="icon-btn" onClick={back} aria-label={onBack ? 'Back' : 'Back to title'} title="Back (Esc)">
            ←
          </button>
          <h1>{onCreate ? 'Set up your family' : 'Create your life'}</h1>
        </header>

        <section className="panel setup-card" aria-labelledby="where-h">
          <h2 id="where-h" className="eyebrow">1 · Where you live</h2>
          <RegionPicker value={regionId} onChange={pickRegion} />
          <p className="tiny muted">Sets the money, prices, names and everyday words. The life lessons are the same everywhere.</p>
        </section>

        <div className="setup-grid">
          <section className="panel setup-card" aria-labelledby="you-h">
            <h2 id="you-h" className="eyebrow">2 · You</h2>
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
            <button
              type="button"
              className={`btn btn-sm ${openVoice === 'player' ? 'btn-primary' : ''}`}
              aria-expanded={openVoice === 'player'}
              onClick={() => setOpenVoice((o) => (o === 'player' ? null : 'player'))}
            >
              🔊 Your voice
            </button>
            {openVoice === 'player' && <VoiceControls role="player" name={displayName} speakKey="player" profile={vp('player')} onChange={(v) => setVp('player', v)} />}
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

        <section className="panel setup-card vs-names" aria-labelledby="fam-h">
          <h2 id="fam-h" className="eyebrow">3 · Your family</h2>
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
            {preset.roles.map((r, i) => {
              const m = defaults[r]!;
              const shown = names[r]?.trim() || m.name;
              const open = openVoice === r;
              return (
                <div key={r} className="vs-member">
                  <div className="name-row">
                    <Portrait id={`setup-${r}`} appearance={m.appearance} kind={kindOf(r)} size={36} alt="" />
                    <label className="field grow">
                      <span className="label">{ROLE_LABELS[r]}</span>
                      <input
                        type="text"
                        maxLength={16}
                        value={names[r] ?? ''}
                        placeholder={m.name}
                        onChange={(e) => setNames((n) => ({ ...n, [r]: e.target.value.replace(/[<>]/g, '') }))}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <button
                      type="button"
                      className={`btn btn-sm vs-voice-btn ${open ? 'btn-primary' : ''}`}
                      aria-expanded={open}
                      aria-label={`${shown}'s voice`}
                      onClick={() => setOpenVoice(open ? null : r)}
                    >
                      🔊 Voice
                    </button>
                  </div>
                  {open && <VoiceControls role={r} name={shown} speakKey={`${r}-${i}`} profile={vp(r)} onChange={(v) => setVp(r, v)} />}
                </div>
              );
            })}
          </div>
          <p className="tiny muted">Family members give you tasks. Rename them and tune their voices — blank names use the suggestions shown.</p>

          <div className="field" style={{ marginTop: 12 }}>
            <span className="label" id="partner-l">
              Partner
            </span>
            <div className="chips" role="radiogroup" aria-labelledby="partner-l">
              {([
                ['girlfriend', 'Girlfriend'],
                ['boyfriend', 'Boyfriend'],
                [null, 'None'],
              ] as [PartnerChoice, string][]).map(([id, label]) => (
                <button key={label} type="button" className="chip" role="radio" aria-checked={partner === id} onClick={() => pickPartner(id)}>
                  {id && <Portrait id={`setup-partner-${id}`} appearance={partnerDefaults[id].appearance} kind={kindOf('partner')} size={30} alt="" />}
                  {label}
                </button>
              ))}
            </div>
            <span className="tiny muted">Optional teen storyline: dates on a budget, awkward texts and real-life lessons. You can leave it off.</span>
          </div>
          {partner && (
            <div className="names">
              <div className="vs-member">
                <div className="name-row">
                  <Portrait id={`setup-partner-${partner}`} appearance={partnerDefaults[partner].appearance} kind={kindOf('partner')} size={36} alt="" />
                  <label className="field grow">
                    <span className="label">{partner === 'girlfriend' ? 'Girlfriend' : 'Boyfriend'} (a classmate from across town)</span>
                    <input
                      type="text"
                      maxLength={16}
                      value={partnerNameInput}
                      placeholder={partnerDefaults[partner].name}
                      onChange={(e) => setPartnerNameInput(e.target.value.replace(/[<>]/g, ''))}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <button
                    type="button"
                    className={`btn btn-sm vs-voice-btn ${openVoice === 'partner' ? 'btn-primary' : ''}`}
                    aria-expanded={openVoice === 'partner'}
                    aria-label={`${partnerNameInput.trim() || partnerDefaults[partner].name}'s voice`}
                    onClick={() => setOpenVoice(openVoice === 'partner' ? null : 'partner')}
                  >
                    🔊 Voice
                  </button>
                </div>
                {openVoice === 'partner' && (
                  <VoiceControls
                    role="partner"
                    name={partnerNameInput.trim() || partnerDefaults[partner].name}
                    speakKey="partner-0"
                    profile={vp('partner')}
                    defaults={partnerDefaults[partner].voice}
                    onChange={(v) => setVp('partner', v)}
                  />
                )}
              </div>
            </div>
          )}
        </section>

        <section className="panel setup-card" aria-labelledby="diff-h">
          <h2 id="diff-h" className="eyebrow">4 · How busy is life?</h2>
          <DifficultyPicker value={settings.difficulty} onChange={(d) => updateSettings({ difficulty: d })} note="You can change this later in Settings." />
        </section>

        <div className="setup-cta">
          <button className="btn" onClick={back}>
            Back
          </button>
          <button className="btn btn-primary btn-lg" onClick={start}>
            {onCreate ? 'Next: create online family ▶' : `Start life as ${displayName} ▶`}
          </button>
        </div>
      </div>
    </div>
  );
}
