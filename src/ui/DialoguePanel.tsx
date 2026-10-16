import { useEffect, useRef, useState } from 'react';
import { store } from '../core/store';
import { isTypingTarget, prefersReducedMotion, useSnap } from './hooks';
import { Portrait } from './art';
import { speakerKey, voice } from '../core/voice';
import { toggleVoiceMute, useDisplaySettings, useVoiceState } from './SettingsModal';
import './voice.css';

const CHAR_MS = 12;
const GUARD_MS = 180;

export default function DialoguePanel() {
  const { ui, state } = useSnap();
  useDisplaySettings();
  useVoiceState();
  const line = ui.dialogue?.[0] ?? null;
  const text = line?.text ?? '';
  const voiceMode = state.settings?.voice?.mode ?? 'off';
  const spokenRef = useRef<{ line: unknown; at: number } | null>(null);
  const [shown, setShown] = useState(0);
  const complete = shown >= text.length;
  const shownAt = useRef(0);
  const ref = useRef({ complete, hasChoices: false, openedAt: 0 });
  if (complete && !ref.current.complete) shownAt.current = performance.now();
  ref.current = { complete, hasChoices: !!line?.choices?.length, openedAt: ui.dialogueOpenedAt };
  // ignore picks that land right as the choices appear (e.g. a skip-click)
  const pick = (i: number) => {
    if (performance.now() - shownAt.current < 250) return;
    store.choose(i);
  };

  // typewriter, restarted for every new line
  useEffect(() => {
    if (!line) return;
    if (prefersReducedMotion()) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const start = performance.now();
    let raf = 0;
    const step = () => {
      const n = Math.min(text.length, Math.floor((performance.now() - start) / CHAR_MS) + 1);
      setShown(n);
      if (n < text.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [line, text, ui.dialogueOpenedAt]);

  // speak each new line once; a new line, closing, or unmounting cancels the previous one
  useEffect(() => {
    if (!line) {
      spokenRef.current = null;
      voice.stop();
      return;
    }
    const prev = spokenRef.current;
    if (prev && prev.line === line && prev.at === ui.dialogueOpenedAt) return;
    spokenRef.current = { line, at: ui.dialogueOpenedAt };
    voice.speak(line.text, line.portrait, { speaker: line.speaker || undefined, mood: line.mood });
    // warm the realistic-voice cache for the line after this one
    voice.prefetchLine(ui.dialogue?.[1]);
  }, [line, ui.dialogueOpenedAt]);
  useEffect(() => () => voice.stop(), []);

  const advance = () => {
    if (!ref.current.complete) return setShown(Number.MAX_SAFE_INTEGER);
    if (!ref.current.hasChoices) store.advanceDialogue();
  };

  useEffect(() => {
    if (!line) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const k = e.key;
      const isAdvance = k === ' ' || k === 'Enter' || k === 'e' || k === 'E';
      const num = /^[1-9]$/.test(k) ? Number(k) - 1 : -1;
      if (!isAdvance && num < 0) return;
      if (e.repeat || performance.now() - ref.current.openedAt < GUARD_MS) {
        if (isAdvance) e.preventDefault();
        return;
      }
      const t = e.target as HTMLElement | null;
      // let a focused choice button handle Enter/Space natively
      if (isAdvance && k !== 'e' && k !== 'E' && t?.closest?.('.choice, .dlg-tool')) return;
      e.preventDefault();
      if (num >= 0) {
        if (ref.current.hasChoices && ref.current.complete) pick(num);
        return;
      }
      advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [line]);

  if (!line) return null;
  const narration = !line.speaker;
  const choices = line.choices ?? [];
  const lineKey = speakerKey(line.portrait, line.speaker || undefined);
  const talking = voice.speaking && voice.speakingKey === lineKey;
  const loadingVoice = !talking && voice.loadingKey === lineKey;
  const muted = voiceMode === 'off';
  const tools = (
    <div className="dlg-tools" onClick={(e) => e.stopPropagation()}>
      {loadingVoice && (
        <span className="vs-loading" role="status">
          <span className="vs-loading-dot" aria-hidden />
          loading voice…
        </span>
      )}
      {!muted && (
        <button
          type="button"
          className="dlg-tool"
          aria-label="Replay this line"
          title="Replay line"
          onClick={() => voice.speak(line.text, line.portrait, { force: true, speaker: line.speaker || undefined, mood: line.mood })}
        >
          🔊
        </button>
      )}
      <button
        type="button"
        className="dlg-tool"
        aria-pressed={muted}
        aria-label={muted ? 'Turn voices on' : 'Mute voices'}
        title={muted ? 'Voices off — click to turn on' : 'Mute voices'}
        onClick={toggleVoiceMute}
      >
        {muted ? '🔇' : '🔈'}
      </button>
    </div>
  );
  return (
    <section
      className={`panel dlg ${narration ? 'narration' : ''}`}
      role="dialog"
      aria-live="polite"
      aria-label={narration ? 'Narration' : `${line.speaker} says`}
      onClick={advance}
    >
      {line.portrait && (
        <div className={`dlg-portrait ${talking ? 'speaking' : ''}`}>
          <Portrait id={line.portrait} size={72} alt={line.speaker} />
          {talking && (
            <span className="vs-wave" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
      )}
      <div className="dlg-main">
        <div className="dlg-head">
          {!narration ? (
            <div className="dlg-name">
              {line.speaker}
              {talking && !line.portrait && <span className="vs-dot" aria-hidden />}
            </div>
          ) : (
            <span className="dlg-name" aria-hidden>
              {talking && <span className="vs-dot" />}
            </span>
          )}
          {tools}
        </div>
        <div className="dlg-text scroll">
          <span>{text.slice(0, shown)}</span>
          <span aria-hidden style={{ visibility: 'hidden' }}>
            {text.slice(shown)}
          </span>
        </div>
        {complete && choices.length > 0 && (
          <div className="choices" role="group" aria-label="Choices">
            {choices.map((c, i) => (
              <button
                key={i}
                className={`choice ${c.tone ?? ''}`}
                disabled={c.disabled}
                style={{ animationDelay: `${i * 40}ms` }}
                onClick={(e) => {
                  e.stopPropagation();
                  pick(i);
                }}
              >
                <span className="num">{i + 1}</span>
                <span>
                  {c.label}
                  {c.hint && <span className="hint">{c.hint}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
        {complete && !choices.length && (
          <span className="dlg-more" aria-hidden>
            ▼ <span className="tiny muted">{ui.dialogue && ui.dialogue.length > 1 ? 'next' : 'close'}</span>
          </span>
        )}
      </div>
    </section>
  );
}
