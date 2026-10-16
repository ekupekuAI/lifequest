import { store } from '../core/store';
import { GROCERY_SHELVES, KIOSK_SHELF, formatMoney, groceryPrice, itemName, type ShopProduct } from '../domain/items';
import { money, region } from '../domain/region';
import { useSnap } from './hooks';
import { Modal } from './Modal';
import { ItemIcon } from './art';
import { ShoppingChecklist } from './ShoppingList';
import { time12 } from './HUD';
import { OPENING_HOURS } from '../domain/world';

/** Shelf tag, styled by meaning: multi-buy deals, expiry discounts, or plain notes. */
function ProductTag({ p, inBasket }: { p: ShopProduct; inBasket: number }) {
  if (p.deal === '3for2') {
    const toFree = 3 - (inBasket % 3);
    return (
      <>
        <span className="p-deal">3 for 2</span>
        <span className="tiny muted" style={{ display: 'block' }}>
          {inBasket > 0 && toFree === 1 ? 'Add 1 more — it’s free!' : 'Pay for 2, get the 3rd free'}
        </span>
      </>
    );
  }
  if (!p.tag) return null;
  const expiry = /expire/i.test(p.tag);
  return <span className={`p-tag ${expiry ? 'p-expiry' : ''}`}>{expiry ? '⏳ ' : ''}{p.tag}</span>;
}

function Totals({ kiosk }: { kiosk: boolean }) {
  const { state } = useSnap();
  const run = state.run;
  const budgetLeft = run?.budget != null ? run.budget - run.spent : null;
  const total = kiosk ? 0 : store.basketTotal();
  const discount = kiosk ? 0 : store.basketDiscount();
  const limit = budgetLeft ?? state.wallet.balance;
  const over = !kiosk && total > limit;
  return (
    <div className={`boxed totals ${over ? 'over' : ''}`}>
      {!kiosk && (
        <>
          <span className="label">Basket total</span>
          <span className="big">{formatMoney(total)}</span>
          {discount > 0 && (
            <span className="small good offer-line" role="status">
              🏷 Offer applied: −{formatMoney(discount)}
            </span>
          )}
        </>
      )}
      <span className="small">
        {budgetLeft !== null ? (
          <>
            Budget left: <b className={budgetLeft - total < 0 ? 'bad' : 'good'}>{formatMoney(budgetLeft - total)}</b>
          </>
        ) : (
          <>Wallet: {formatMoney(state.wallet.balance)}</>
        )}
      </span>
      {budgetLeft !== null && <span className="tiny muted">Wallet: {formatMoney(state.wallet.balance)}</span>}
      {over && (
        <span className="small bad" role="alert">
          ⚠ Over by {formatMoney(total - limit)}
        </span>
      )}
    </div>
  );
}

function Sidebar({ kiosk }: { kiosk: boolean }) {
  const { state } = useSnap();
  return (
    <aside className="col">
      <Totals kiosk={kiosk} />
      {state.run && store.mission?.requiredItems?.length ? (
        <div className="section">
          <h3>Your list</h3>
          <div className="boxed">
            <ShoppingChecklist state={state} compact />
          </div>
        </div>
      ) : null}
    </aside>
  );
}

const findDeal = (shelfId: string, item: string) => GROCERY_SHELVES.find((s) => s.id === shelfId)?.products.find((p) => p.item === item)?.deal;

function KioskClosed({ onClose }: { onClose: () => void }) {
  const h = OPENING_HOURS.kiosk;
  return (
    <Modal
      title={region().words.kioskName}
      icon="🏪"
      size="sm"
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose} data-autofocus>
          OK
        </button>
      }
    >
      <div className="closed-sign" role="status">
        <span className="stamp">CLOSED</span>
        <p>
          The shutter is down. {h ? <>Open {time12(h.open)} – {time12(h.close)}.</> : null}
        </p>
        <p className="small muted">FreshMart stays open later — or plan to come back tomorrow morning.</p>
      </div>
    </Modal>
  );
}

function BasketMode() {
  const { state } = useSnap();
  const items = Object.entries(state.basket);
  const close = () => store.openModal(null);
  const back = () => {
    store.openModal(null);
    if (store.state.inQueue) store.checkoutInteract();
  };
  return (
    <Modal
      title="Your basket"
      icon="🧺"
      size="md"
      onClose={close}
      footer={
        <button className="btn btn-primary" onClick={back} data-autofocus>
          {state.inQueue ? 'Back to the counter ▶' : 'Done'}
        </button>
      }
    >
      <div className="shelf-grid">
        <div className="products">
          {items.length === 0 && <p className="muted">Your basket is empty.</p>}
          {items.map(([id, q]) => {
            const shelf = store.basketShelf(id);
            const price = store.priceOf(shelf, id);
            const canAdd = store.stockOf(shelf, id) > q;
            return (
              <div key={id} className="product">
                <span className="p-icon">
                  <ItemIcon id={id} size={32} />
                </span>
                <span className="grow">
                  <span className="p-name">{itemName(id)}</span>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {formatMoney(price)} each
                    {findDeal(shelf, id) && q >= 3 && <span className="good"> · {Math.floor(q / 3)} free (3 for 2)</span>}
                  </span>
                </span>
                <span className="p-price">{formatMoney(price * q)}</span>
                <span className="stepper">
                  <button className="icon-btn" onClick={() => store.removeFromBasket(id)} aria-label={`Remove one ${itemName(id)}`}>
                    −
                  </button>
                  <span className="q" aria-label="quantity">
                    {q}
                  </span>
                  <button className="icon-btn" onClick={() => store.addToBasket(shelf, id)} disabled={!canAdd} aria-label={`Add one ${itemName(id)}`}>
                    +
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        <Sidebar kiosk={false} />
      </div>
    </Modal>
  );
}

export default function ShelfPanel({ shelfId }: { shelfId: string }) {
  const { state } = useSnap();
  if (shelfId === 'basket') return <BasketMode />;
  const kiosk = shelfId === 'kiosk';
  if (kiosk && !store.isOpen('kiosk')) return <KioskClosed onClose={() => store.openModal(null)} />;
  const shelf = kiosk ? KIOSK_SHELF : GROCERY_SHELVES.find((s) => s.id === shelfId);
  const close = () => store.openModal(null);
  if (!shelf) {
    return (
      <Modal title="Shelf" onClose={close} size="sm">
        <p>Nothing here.</p>
      </Modal>
    );
  }
  return (
    <Modal
      title={shelf.label}
      icon={kiosk ? '🏪' : '🛒'}
      size="md"
      onClose={close}
      footer={
        <>
          <span className="small muted grow" style={{ alignSelf: 'center' }}>
            {kiosk ? 'Pay as you buy — no queue here.' : 'Pay at the checkout counter at the front.'}
          </span>
          <button className="btn btn-primary" onClick={close} data-autofocus>
            {kiosk ? 'Done' : 'Keep shopping'}
          </button>
        </>
      }
    >
      <div className="shelf-grid">
        <div className="products">
          {shelf.products.map((p) => {
            const stock = store.stockOf(shelf.id, p.item);
            const inBasket = state.basket[p.item] ?? 0;
            const soldOut = stock <= 0;
            const price = store.priceOf(shelf.id, p.item);
            const base = kiosk ? groceryPrice(p.item) : undefined;
            const cmp = base !== undefined ? money(base) : undefined;
            const cantAfford = kiosk && price > state.wallet.balance;
            return (
              <div key={p.item} className={`product ${soldOut ? 'soldout' : ''}`}>
                <span className="p-icon">
                  <ItemIcon id={p.item} size={32} />
                </span>
                <span className="grow">
                  <span className="p-name">{itemName(p.item)}</span>
                  <ProductTag p={p} inBasket={inBasket} />
                  {cmp !== undefined && (
                    <span className="p-cmp" style={{ display: 'block' }}>
                      FreshMart: {formatMoney(cmp)}
                    </span>
                  )}
                  {!soldOut && stock < 10 && <span className="tiny warn" style={{ display: 'block' }}>Only {stock - inBasket} left</span>}
                </span>
                <span className="p-price">{formatMoney(price)}</span>
                {soldOut ? (
                  <span className="stamp">SOLD OUT</span>
                ) : kiosk ? (
                  <button className="btn btn-sm btn-good" onClick={() => store.buyAtKiosk(p.item)} disabled={cantAfford} title={cantAfford ? 'Not enough money' : undefined}>
                    Buy
                  </button>
                ) : (
                  <span className="stepper">
                    {inBasket > 0 && (
                      <>
                        <button className="icon-btn" onClick={() => store.removeFromBasket(p.item)} aria-label={`Remove one ${itemName(p.item)}`}>
                          −
                        </button>
                        <span className="q">{inBasket}</span>
                      </>
                    )}
                    <button className="btn btn-sm btn-good" onClick={() => store.addToBasket(shelf.id, p.item)} disabled={stock <= inBasket} aria-label={`Add ${itemName(p.item)} to basket`}>
                      {inBasket > 0 ? '+' : 'Add'}
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <Sidebar kiosk={kiosk} />
      </div>
    </Modal>
  );
}
