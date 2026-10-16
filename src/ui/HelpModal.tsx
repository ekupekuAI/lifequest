import { store } from '../core/store';
import { Key, Modal } from './Modal';

export function ControlsList({ touch = false }: { touch?: boolean }) {
  return (
    <dl className="ctrl-list">
      {touch ? (
        <>
          <dt>🕹</dt>
          <dd>Drag the joystick to walk</dd>
          <dt>✋</dt>
          <dd>Talk, pick up, use</dd>
          <dt>📓 📞</dt>
          <dd>Journal · call home</dd>
        </>
      ) : (
        <>
          <dt>
            <Key>W</Key>
            <Key>A</Key>
            <Key>S</Key>
            <Key>D</Key>
          </dt>
          <dd>Walk (or arrow keys)</dd>
          <dt>
            <Key>E</Key>
            <Key>␣</Key>
          </dt>
          <dd>Talk, pick up, use, continue</dd>
          <dt>
            <Key>1</Key>–<Key>4</Key>
          </dt>
          <dd>Pick a dialogue choice</dd>
          <dt>
            <Key>J</Key>
          </dt>
          <dd>Journal: list, bag, money, skills</dd>
          <dt>
            <Key>P</Key>
          </dt>
          <dd>Phone home for help (2 min)</dd>
          <dt>
            <Key>Esc</Key>
          </dt>
          <dd>Close / pause</dd>
        </>
      )}
    </dl>
  );
}

export default function HelpModal() {
  const close = () => store.openModal(null);
  return (
    <Modal title="Controls & tips" icon="?" size="sm" onClose={close} footer={<button className="btn btn-primary" onClick={close} data-autofocus>Got it</button>}>
      <ControlsList touch={typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches} />
      <ul className="bullets">
        <li>Talk to family members to get tasks, or use the notice board.</li>
        <li>Your journal (J) holds the shopping list, receipts and skills.</li>
        <li>Queues keep moving while you check your list — use Wait to pass time.</li>
        <li>Unsure? Call home (P) — asking is a skill, not a weakness.</li>
      </ul>
    </Modal>
  );
}
