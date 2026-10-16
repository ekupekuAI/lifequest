import { store, type Modal as ModalT } from '../core/store';
import { Modal } from './Modal';

export default function ConfirmModal({ modal }: { modal: Extract<ModalT, { type: 'confirm' }> }) {
  const close = () => store.openModal(null);
  const yes = () => {
    modal.onYes();
    // onYes may open another modal (e.g. results); only close if it didn't
    if (store.ui.modal === modal) store.openModal(null);
  };
  return (
    <Modal
      title="Are you sure?"
      icon="?"
      size="sm"
      onClose={close}
      footer={
        <>
          <button className="btn btn-ghost" onClick={close} data-autofocus>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={yes}>
            {modal.yes}
          </button>
        </>
      }
    >
      <p>{modal.text}</p>
    </Modal>
  );
}
