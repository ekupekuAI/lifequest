import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { store } from '../core/store';
import { touchInput } from '../game/input';
import { useSnap } from './hooks';

const TRAVEL = 40;
const DEADZONE = 0.18;

function resetStick() {
  touchInput.x = 0;
  touchInput.y = 0;
}

export default function TouchControls() {
  const { ui } = useSnap();
  const baseRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [pressed, setPressed] = useState(false);
  const hidden = !!ui.modal || !!ui.dialogue;

  useEffect(() => {
    if (hidden) {
      pointer.current = null;
      resetStick();
      setKnob({ x: 0, y: 0 });
    }
  }, [hidden]);
  useEffect(() => resetStick, []);

  const move = (e: RPointerEvent) => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > TRAVEL) {
      dx = (dx / len) * TRAVEL;
      dy = (dy / len) * TRAVEL;
    }
    setKnob({ x: dx, y: dy });
    const nx = dx / TRAVEL;
    const ny = dy / TRAVEL;
    const mag = Math.hypot(nx, ny);
    if (mag < DEADZONE) return resetStick();
    const scale = (mag - DEADZONE) / (1 - DEADZONE) / mag;
    touchInput.x = Math.max(-1, Math.min(1, nx * scale));
    touchInput.y = Math.max(-1, Math.min(1, ny * scale));
  };

  const end = (e: RPointerEvent) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    resetStick();
  };

  const interact = (e: RPointerEvent) => {
    e.preventDefault();
    setPressed(true);
    if (store.ui.dialogue) {
      if (!store.ui.dialogue[0]?.choices?.length && performance.now() - store.ui.dialogueOpenedAt > 180) store.advanceDialogue();
      return;
    }
    touchInput.interact = true;
  };

  if (hidden) return null;
  return (
    <div className="touch">
      <div
        ref={baseRef}
        className="joy"
        role="application"
        aria-label="Movement joystick"
        onPointerDown={(e) => {
          e.preventDefault();
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => pointer.current === e.pointerId && move(e)}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        <span className="joy-base" />
        <span className="joy-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <div className="touch-mini">
        <button className="icon-btn" onClick={() => store.openModal({ type: 'journal' })} aria-label="Journal">
          📓
        </button>
        <button className="icon-btn" onClick={() => store.callHome()} aria-label="Call home">
          📞
        </button>
        <button className="icon-btn" onClick={() => store.openModal({ type: 'pause' })} aria-label="Pause">
          ❚❚
        </button>
      </div>
      <button
        className={`act ${pressed ? 'down' : ''} ${ui.prompt ? 'ready' : ''}`}
        aria-label={ui.prompt ? `Interact: ${ui.prompt}` : 'Interact'}
        onPointerDown={interact}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        ✋
      </button>
    </div>
  );
}
