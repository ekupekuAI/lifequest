import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { store } from '../core/store';
import { voice, sampleLine, defaultVoiceMode, type VoiceMode } from '../core/voice';
import {
  castTable,
  checkNeuralHealth,
  getNeuralVersion,
  neuralAvailable,
  neuralConfigured,
  neuralStatus,
  resetNeuralErrors,
  setNeuralVolume,
  subscribeNeural,
  type CastRow,
} from '../core/neuralVoice';
import { voiceLabel } from '../core/voiceCast';
import { VOICE_ID_RE, type Emotion } from '../core/ttsShared';
import type { Difficulty, Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { DIFFICULTY } from '../domain/world';
import { REGIONS, region, setRegion, type RegionId } from '../domain/region';
import { DEFAULT_VOICES, NPC_LOOKS, regionName } from '../domain/family';
import { useSnap } from './hooks';
import { audioDirector, musicSettings, moodLabel } from '../core/audioDirector';
import { Modal } from './Modal';
import './voice.css';

// ---------------------------------------------------------------------------
// display settings (text size, colour-safe) — applied to <html>

/** Apply text scale & colour-safe mode to the document. Safe to call any time. */
export function applyDisplaySettings(settings: Pick<Settings, 'textScale' | 'colorSafe'> | undefined | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const scale = settings?.textScale && Number.isFinite(settings.textScale) ? Math.max(0.8, Math.min(1.6, settings.textScale)) : 1;
  root.style.setProperty('--text-scale', String(scale));
  if (Math.abs(scale - 1) > 0.001) root.setAttribute('data-textscale', '');
  else root.removeAttribute('data-textscale');
  if (settings?.colorSafe) root.setAttribute('data-colorsafe', '1');
  else root.removeAttribute('data-colorsafe');
}

/** Keep <html> in sync with the store's display settings. */
export function useDisplaySettings() {
  const { state } = useSnap();
  const s = state.settings;
  useEffect(() => applyDisplaySettings(s), [s?.textScale, s?.colorSafe]);
}

// ---------------------------------------------------------------------------
// persisted preferences (so the title screen remembers choices before any save exists)

const PREFS_KEY = 'lifequest.prefs';

function savePrefs(s: Settings) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** Update settings through the store and remember them on this device. */
export function updateSettings(patch: Partial<Settings>) {
  store.setSettings(patch);
  savePrefs(store.state.settings);
}

let restored = false;
/** Restore remembered preferences once per page load (title/setup screens only). */
export function restorePrefs() {
  if (restored || store.ui.screen === 'game') return;
  restored = true;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      // brand-new player: realistic voices when this build can use them
      store.setSettings({ voice: { ...store.state.settings.voice, mode: defaultVoiceMode(), accentHints: true } });
      return;
    }
    const p = JSON.parse(raw) as Partial<Settings>;
    const patch: Partial<Settings> = {};
    if (p.region && p.region in REGIONS) patch.region = p.region;
    if (p.difficulty && p.difficulty in DIFFICULTY) patch.difficulty = p.difficulty;
    if (p.voice && typeof p.voice === 'object') {
      let mode = (['neural', 'speech', 'babble', 'off'] as const).includes(p.voice.mode as VoiceMode) ? p.voice.mode : defaultVoiceMode();
      // prefs saved before realistic voices existed had 'speech' as the default: upgrade once
      if (p.voice.accentHints === undefined && mode === 'speech') mode = defaultVoiceMode();
      const cast: Record<string, string> = {};
      if (p.voice.cast && typeof p.voice.cast === 'object') {
        for (const [k, id] of Object.entries(p.voice.cast)) if (typeof id === 'string' && VOICE_ID_RE.test(id) && k.length <= 80) cast[k] = id;
      }
      patch.voice = {
        mode,
        volume: typeof p.voice.volume === 'number' ? Math.max(0, Math.min(1, p.voice.volume)) : DEFAULT_SETTINGS.voice.volume,
        narrator: !!p.voice.narrator,
        cast,
        accentHints: p.voice.accentHints !== false,
      };
    }
    if (typeof p.textScale === 'number') patch.textScale = p.textScale;
    if (typeof p.colorSafe === 'boolean') patch.colorSafe = p.colorSafe;
    if (typeof p.hints === 'boolean') patch.hints = p.hints;
    if (p.music && typeof p.music === 'object') patch.music = musicSettings(p);
    store.setSettings(patch);
    if (patch.region) setRegion(patch.region);
  } catch {
    /* ignore bad prefs */
  }
}

// ---------------------------------------------------------------------------
// voice helpers shared with the dialogue panel

/** Re-render when the voice engine changes state (speaking, voices loaded). */
export function useVoiceState() {
  useSyncExternalStore(voice.subscribe, voice.getVersion, voice.getVersion);
  return voice;
}

let lastOnMode: VoiceMode | null = null;
/** Mute / unmute character voices, remembering the previous mode. */
export function toggleVoiceMute() {
  const cur = store.state.settings.voice.mode;
  if (cur === 'off') {
    updateSettings({ voice: { ...store.state.settings.voice, mode: lastOnMode ?? defaultVoiceMode() } });
  } else {
    lastOnMode = cur;
    voice.stop();
    updateSettings({ voice: { ...store.state.settings.voice, mode: 'off' } });
  }
}

/** Mother, younger sibling and the corner-shop owner say a line each. */
export function testVoices() {
  const mom = store.memberByRole('mother', 'guardian', 'father');
  const kid = store.memberByRole('younger-sibling', 'older-sibling');
  const shop = NPC_LOOKS.sharma;
  voice.previewMany([
    {
      key: mom?.id ?? 'mother-0',
      profile: mom?.voice ?? DEFAULT_VOICES[mom?.role ?? 'mother'],
      text: sampleLine(mom?.role ?? 'mother', mom?.name ?? regionName('mother')),
    },
    {
      key: kid?.id ?? 'younger-sibling-1',
      profile: kid?.voice ?? DEFAULT_VOICES[kid?.role ?? 'younger-sibling'],
      text: sampleLine(kid?.role ?? 'younger-sibling', kid?.name ?? regionName('younger-sibling')),
    },
    { key: 'npc:sharma', profile: shop.voice, text: sampleLine('shopkeeper', shop.name) },
  ]);
}

export const EMOTION_TEST: { line: string; emotions: Emotion[] } = {
  line: 'We have to go to the market right now.',
  emotions: ['cheerful', 'worried', 'angry'],
};

/** One family member says the same line cheerfully, worried, then cross (realistic voices). */
export function testEmotions() {
  const who = store.memberByRole('mother', 'guardian', 'father', 'grandparent');
  voice.previewEmotions(who?.voice ?? DEFAULT_VOICES[who?.role ?? 'mother'], who?.id ?? 'mother-0', EMOTION_TEST.line, EMOTION_TEST.emotions);
}

function useNeuralState() {
  useSyncExternalStore(subscribeNeural, getNeuralVersion, getNeuralVersion);
  return neuralStatus();
}

const ROLE_HINT: Record<string, string> = {
  mother: 'Mother',
  father: 'Father',
  'older-sibling': 'Older sibling',
  'younger-sibling': 'Younger sibling',
  grandparent: 'Grandparent',
  guardian: 'Guardian',
  npc: 'Townsfolk',
  narrator: 'Story',
};

function CastEditorRow({ row, canPlay }: { row: CastRow; canPlay: boolean }) {
  const [value, setValue] = useState(row.overrideId ?? '');
  const [err, setErr] = useState('');
  useEffect(() => setValue(row.overrideId ?? ''), [row.overrideId]);
  const id = `cast-${row.key.replace(/[^a-z0-9-]/gi, '_')}`;
  const commit = (raw: string) => {
    const v = raw.trim();
    if (v && !VOICE_ID_RE.test(v)) {
      setErr('Voice IDs are 10–40 letters and numbers.');
      return;
    }
    setErr('');
    const cast = { ...(store.state.settings.voice.cast ?? {}) };
    if (v) cast[row.key] = v;
    else delete cast[row.key];
    if ((cast[row.key] ?? '') === (row.overrideId ?? '')) return;
    updateSettings({ voice: { ...store.state.settings.voice, cast } });
  };
  const sample = row.role === 'narrator' ? 'The sun rose over the busy little town.' : sampleLine(row.role === 'npc' ? 'npc' : row.role ?? '', row.label);
  return (
    <div className="vs-cast-row">
      <label htmlFor={id} className="vs-cast-who">
        <span>{row.label}</span>
        <span className="vs-note">
          {ROLE_HINT[row.role ?? ''] ?? ''} · default {voiceLabel(row.defaultId)}
        </span>
      </label>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={40}
        placeholder={row.defaultId}
        value={value}
        aria-invalid={!!err}
        aria-describedby={err ? `${id}-err` : undefined}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
      />
      <button
        type="button"
        className="btn btn-sm"
        disabled={!canPlay}
        aria-label={`Play a sample of ${row.label}`}
        onClick={() => voice.previewMany([{ key: row.key, profile: row.profile, text: sample, voiceId: VOICE_ID_RE.test(value.trim()) ? value.trim() : undefined }])}
      >
        ▶
      </button>
      {err && (
        <span id={`${id}-err`} className="vs-note vs-err" role="alert">
          {err}
        </span>
      )}
    </div>
  );
}

function NeuralPanel({ mode, accentHints }: { mode: VoiceMode; accentHints: boolean }) {
  const status = useNeuralState();
  const [health, setHealth] = useState<string | null>(null);
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || !neuralConfigured()) return;
    checked.current = true;
    let live = true;
    void checkNeuralHealth().then((h) => live && setHealth(h.message));
    return () => {
      live = false;
    };
  }, []);
  const rows = castTable();
  const usable = mode === 'neural' && neuralAvailable();
  const tone = status.state === 'error' ? 'bad' : status.state === 'unconfigured' ? 'sky' : 'good';
  const label = status.state === 'error' ? 'Error' : status.state === 'unconfigured' ? 'Not configured' : 'Available';
  return (
    <div className="vs-neural">
      <div className="vs-row">
        <span>
          <span>Realistic AI voices (ElevenLabs)</span>
          <span className="vs-note" style={{ display: 'block' }} role="status">
            {status.state === 'error' || status.state === 'unconfigured' ? status.message : health ?? status.message}
          </span>
        </span>
        <span className={`pill ${tone}`}>{label}</span>
      </div>
      {status.state === 'error' && (
        <div className="vs-row">
          <span className="vs-note">Built-in voices are used until you retry.</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              resetNeuralErrors();
              setHealth(null);
              void checkNeuralHealth().then((h) => setHealth(h.message));
            }}
          >
            ↻ Retry
          </button>
        </div>
      )}
      {mode === 'neural' && (
        <div className="vs-row">
          <span className="vs-note">One character says the same line: cheerful, worried, then cross.</span>
          <button type="button" className="btn btn-sm" onClick={testEmotions} disabled={!usable}>
            {voice.speaking ? '■ Playing…' : '▶ Test emotions'}
          </button>
        </div>
      )}
      {neuralConfigured() && (
        <details className="vs-adv">
          <summary>Advanced: custom voice IDs</summary>
          <p className="vs-note">
            Paste any ElevenLabs voice ID (for example a region-native voice from the ElevenLabs Voice Library) to recast a character. Leave empty to use the default.
            ElevenLabs default voices only work on accounts created before March 2026 and expire on 31 Dec 2026.
          </p>
          <div className="vs-row">
            <span>
              <span>Regional accent hints</span>
              <span className="vs-note" style={{ display: 'block' }}>
                Ask the expressive model for a local accent (India, Nigeria, Japan, Brazil, Mexico).
              </span>
            </span>
            <button
              type="button"
              className={`btn btn-sm vs-switch ${accentHints ? 'btn-good' : ''}`}
              role="switch"
              aria-checked={accentHints}
              onClick={() => updateSettings({ voice: { ...store.state.settings.voice, accentHints: !accentHints } })}
            >
              {accentHints ? 'On' : 'Off'}
            </button>
          </div>
          <div className="vs-cast">
            {rows.map((row) => (
              <CastEditorRow key={row.key} row={row} canPlay={usable} />
            ))}
          </div>
          <div className="vs-row">
            <span className="vs-note">Custom voices are saved on this device.</span>
            <button type="button" className="btn btn-sm" onClick={() => updateSettings({ voice: { ...store.state.settings.voice, cast: {} } })}>
              Reset all
            </button>
          </div>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// small controls

/** Music & ambience: on/off, two volume sliders (debounced saves) and a mood preview. */
function MusicSection() {
  const { state } = useSnap();
  const m = musicSettings(state.settings);
  useSyncExternalStore(audioDirector.subscribePreview, () => audioDirector.previewing, () => null);
  const previewing = audioDirector.previewing;
  const [vol, setVol] = useState(Math.round(m.volume * 100));
  const [amb, setAmb] = useState(Math.round(m.ambience * 100));
  const timer = useRef(0);
  useEffect(() => setVol(Math.round(m.volume * 100)), [m.volume]);
  useEffect(() => setAmb(Math.round(m.ambience * 100)), [m.ambience]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      audioDirector.stopPreview();
    },
    [],
  );
  const save = (patch: Partial<typeof m>) => updateSettings({ music: { ...musicSettings(store.state.settings), ...patch } });
  const pending = useRef<Partial<typeof m>>({});
  const later = (patch: Partial<typeof m>) => {
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const p = pending.current;
      pending.current = {};
      save(p);
    }, 250);
  };
  return (
    <section className="vs-section" aria-labelledby="set-music">
      <h3 id="set-music">Music &amp; ambience</h3>
      <Switch
        id="set-music-on"
        label="Background music & sounds"
        hint="Calm tunes that follow the place and time of day, plus birds, traffic, rain and shop sounds."
        on={m.enabled}
        onChange={(v) => {
          audioDirector.unlock();
          save({ enabled: v });
        }}
      />
      <label className="vs-range">
        <span className="label" style={{ minWidth: 64 }}>
          Music
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={vol}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVol(v);
            later({ volume: v / 100 });
          }}
          aria-label="Music volume"
          disabled={!m.enabled}
        />
        <output>{vol}%</output>
      </label>
      <label className="vs-range">
        <span className="label" style={{ minWidth: 64 }}>
          Sounds
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={amb}
          onChange={(e) => {
            const v = Number(e.target.value);
            setAmb(v);
            later({ ambience: v / 100 });
          }}
          aria-label="Ambience volume"
          disabled={!m.enabled}
        />
        <output>{amb}%</output>
      </label>
      <div className="vs-row">
        <span className="vs-note" aria-live="polite">
          {previewing ? `Playing: ${moodLabel(previewing)}` : 'Hear each tune for a few seconds.'}
        </span>
        <button type="button" className="btn btn-sm" onClick={() => (previewing ? audioDirector.stopPreview() : audioDirector.startPreview())}>
          {previewing ? '■ Stop' : '▶ Preview'}
        </button>
      </div>
    </section>
  );
}

function Switch({ label, on, onChange, hint, id }: { label: string; on: boolean; onChange: (v: boolean) => void; hint?: string; id: string }) {
  return (
    <div className="vs-row">
      <span>
        <span id={`${id}-l`}>{label}</span>
        {hint && (
          <span id={`${id}-h`} className="vs-note" style={{ display: 'block' }}>
            {hint}
          </span>
        )}
      </span>
      <button
        type="button"
        className={`btn btn-sm vs-switch ${on ? 'btn-good' : ''}`}
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-l`}
        aria-describedby={hint ? `${id}-h` : undefined}
        onClick={() => onChange(!on)}
      >
        {on ? 'On' : 'Off'}
      </button>
    </div>
  );
}

export function DifficultyPicker({ value, onChange, note }: { value: Difficulty; onChange: (d: Difficulty) => void; note?: string }) {
  return (
    <>
      <div className="vs-diffs" role="radiogroup" aria-label="Difficulty">
        {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
          <button key={d} type="button" className="vs-opt" role="radio" aria-checked={value === d} onClick={() => onChange(d)}>
            <span className="vs-opt-title">{DIFFICULTY[d].label}</span>
            <span className="vs-opt-sub">{DIFFICULTY[d].blurb}</span>
          </button>
        ))}
      </div>
      {note && <p className="vs-note">{note}</p>}
    </>
  );
}

export function RegionPicker({ value, onChange }: { value: RegionId; onChange: (r: RegionId) => void }) {
  return (
    <div className="vs-regions" role="radiogroup" aria-label="Region">
      {(Object.keys(REGIONS) as RegionId[]).map((id) => {
        const r = REGIONS[id];
        return (
          <button key={id} type="button" className="vs-opt" role="radio" aria-checked={value === id} onClick={() => onChange(id)} aria-label={`${r.label}, ${r.currency.code}`}>
            <span className="vs-flag" aria-hidden>
              {r.flag}
            </span>
            <span>
              <span style={{ display: 'block' }}>{r.label}</span>
              <span className="vs-opt-sub">
                {r.currency.symbol} {r.currency.code}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const MODES: { id: VoiceMode; title: string; sub: string }[] = [
  { id: 'neural', title: 'Realistic', sub: 'AI voices' },
  { id: 'speech', title: 'Voices', sub: 'Browser speech' },
  { id: 'babble', title: 'Babble', sub: 'Cute blips' },
  { id: 'off', title: 'Off', sub: 'Silent' },
];

const SCALES = [
  { v: 1, label: '100%' },
  { v: 1.15, label: '115%' },
  { v: 1.3, label: '130%' },
];

// ---------------------------------------------------------------------------

export default function SettingsModal({ onClose, inGame }: { onClose?: () => void; inGame?: boolean }) {
  const { state, ui } = useSnap();
  useVoiceState();
  useDisplaySettings();
  const s = state.settings ?? DEFAULT_SETTINGS;
  const playing = inGame ?? ui.screen === 'game';
  const close = onClose ?? (() => store.openModal(null));
  const speechOk = voice.isSupported();
  useNeuralState();
  const neuralOk = neuralAvailable();
  const cloud = store.repo.kind === 'supabase';
  const r = REGIONS[s.region] ?? region();

  // stop any test speech when the panel closes
  useEffect(() => () => voice.stop(), []);

  const setVoice = (patch: Partial<Settings['voice']>) => updateSettings({ voice: { ...store.state.settings.voice, ...patch } });

  // volume: show changes instantly, commit (and save) once the slider settles
  const [vol, setVol] = useState(Math.round(s.voice.volume * 100));
  const volTimer = useRef(0);
  useEffect(() => setVol(Math.round(s.voice.volume * 100)), [s.voice.volume]);
  useEffect(() => () => clearTimeout(volTimer.current), []);
  const onVolume = (v: number) => {
    setVol(v);
    setNeuralVolume(v / 100);
    clearTimeout(volTimer.current);
    volTimer.current = window.setTimeout(() => setVoice({ volume: v / 100 }), 250);
  };

  return (
    <Modal title="Settings" icon="⚙" size="md" onClose={close} className="vs-modal">
      <section className="vs-section" aria-labelledby="set-voice">
        <h3 id="set-voice">Voices</h3>
        <div className="vs-seg vs-seg-4" role="radiogroup" aria-label="Character voices">
          {MODES.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className="vs-opt"
              role="radio"
              aria-checked={s.voice.mode === m.id}
              onClick={() => {
                voice.stop();
                setVoice({ mode: m.id });
              }}
              data-autofocus={i === 0 ? true : undefined}
            >
              <span className="vs-opt-title">{m.title}</span>
              <span className="vs-opt-sub">
                {m.id === 'speech' && !speechOk ? 'Not available here' : m.id === 'neural' && !neuralOk ? 'Not set up' : m.sub}
              </span>
            </button>
          ))}
        </div>
        {s.voice.mode === 'speech' && !speechOk && <p className="vs-note">This browser has no speech voices, so babble is used instead.</p>}
        {s.voice.mode === 'neural' && !neuralOk && (
          <p className="vs-note">Realistic voices aren't available right now, so {speechOk ? 'browser speech' : 'babble'} is used instead.</p>
        )}
        <NeuralPanel mode={s.voice.mode} accentHints={s.voice.accentHints !== false} />
        <label className="vs-range">
          <span className="label" style={{ minWidth: 64 }}>
            Volume
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={vol}
            onChange={(e) => onVolume(Number(e.target.value))}
            aria-label="Voice volume"
            disabled={s.voice.mode === 'off'}
          />
          <output>{vol}%</output>
        </label>
        <Switch id="set-narr" label="Read narration aloud" hint="Also voice the story text between conversations." on={s.voice.narrator} onChange={(v) => setVoice({ narrator: v })} />
        <div className="vs-row">
          <span className="vs-note">Hear your mother, sibling and the shopkeeper.</span>
          <button type="button" className="btn btn-sm" onClick={testVoices}>
            {voice.speaking ? '■ Playing…' : '▶ Test voices'}
          </button>
        </div>
        <Switch id="set-sfx" label="Sound effects" on={ui.sound} onChange={(v) => store.setUI({ sound: v })} />
      </section>

      <MusicSection />

      <section className="vs-section" aria-labelledby="set-diff">
        <h3 id="set-diff">Difficulty</h3>
        <DifficultyPicker
          value={s.difficulty}
          onChange={(d) => updateSettings({ difficulty: d })}
          note={playing ? 'Changes apply from your next task — the current one keeps its time and budget.' : undefined}
        />
      </section>

      <section className="vs-section" aria-labelledby="set-region">
        <h3 id="set-region">Region</h3>
        {playing ? (
          <>
            <div className="vs-readonly">
              <span className="vs-flag" aria-hidden>
                {r.flag}
              </span>
              <span>
                {r.label} · {r.currency.symbol} {r.currency.code}
              </span>
            </div>
            <p className="vs-note">Region is chosen when starting a new game.</p>
          </>
        ) : (
          <>
            <RegionPicker
              value={s.region}
              onChange={(id) => {
                setRegion(id);
                updateSettings({ region: id });
              }}
            />
            <p className="vs-note">Sets the currency, prices, names and everyday words. The life lessons stay the same.</p>
          </>
        )}
      </section>

      <section className="vs-section" aria-labelledby="set-a11y">
        <h3 id="set-a11y">Accessibility</h3>
        <div className="vs-row">
          <span id="set-scale-l">Text size</span>
          <div className="row" role="radiogroup" aria-labelledby="set-scale-l" style={{ gap: 4 }}>
            {SCALES.map((x) => (
              <button
                key={x.v}
                type="button"
                className={`btn btn-sm ${Math.abs((s.textScale ?? 1) - x.v) < 0.01 ? 'btn-primary' : ''}`}
                role="radio"
                aria-checked={Math.abs((s.textScale ?? 1) - x.v) < 0.01}
                onClick={() => {
                  updateSettings({ textScale: x.v });
                  applyDisplaySettings({ textScale: x.v, colorSafe: s.colorSafe });
                }}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <Switch
          id="set-cs"
          label="Colour-safe mode"
          hint="Uses blue and orange instead of green and red for good and bad."
          on={!!s.colorSafe}
          onChange={(v) => {
            updateSettings({ colorSafe: v });
            applyDisplaySettings({ textScale: s.textScale, colorSafe: v });
          }}
        />
        <Switch id="set-hints" label="Guide arrow & hints" hint="Points the way to your next objective." on={s.hints} onChange={(v) => updateSettings({ hints: v })} />
      </section>

      <section className="vs-section" aria-labelledby="set-save">
        <h3 id="set-save">Saving</h3>
        <div className="vs-row">
          <span>Save mode</span>
          <span className={`pill ${cloud ? 'good' : 'sky'}`}>{cloud ? 'Cloud' : 'This device'}</span>
        </div>
        <p className="vs-note">{cloud ? 'Progress syncs to the cloud and is also kept on this device.' : 'Progress is saved in this browser only. No account needed.'}</p>
      </section>
    </Modal>
  );
}
