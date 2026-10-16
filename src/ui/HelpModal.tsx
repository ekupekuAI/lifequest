import { store } from '../core/store';
import { formatMoney } from '../domain/items';
import { money } from '../domain/region';
import { ALLOWANCE_BASE } from '../domain/world';
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
            <Key>H</Key>
          </dt>
          <dd>Hint: what to do next</dd>
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
        <li>Your journal (J) holds the shopping list, receipts, savings and a town guide.</li>
        <li>Queues keep moving while you check your list — use Wait to pass time.</li>
        <li>Unsure? Press 💡 Hint (H) or call home (P) — asking is a skill, not a weakness.</li>
      </ul>
      <div className="section">
        <h3>How the world works</h3>
        <ul className="bullets sky world-rules">
          <li>
            <b>Shops have opening hours.</b> A closed door stays closed — check the Town tab in your journal.
          </li>
          <li>
            <b>Buses run on a timetable.</b> Route 12 goes to the city; Route 7 does not. Read the number before you board.
          </li>
          <li>
            <b>Your family has routines.</b> People are out at work or practice at certain times and gather for dinner.
          </li>
          <li>
            <b>Pocket money.</b> You get {formatMoney(money(ALLOWANCE_BASE))} each morning. Save some in the piggy bank for your goal.
          </li>
          <li>
            <b>Take your keys!</b> Without them you may be locked out when you come home.
          </li>
          <li>
            <b>Sleep to end the day.</b> Your bed starts tomorrow and shows a day summary.
          </li>
        </ul>
      </div>
    </Modal>
  );
}
