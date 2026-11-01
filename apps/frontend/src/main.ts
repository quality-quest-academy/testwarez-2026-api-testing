import './style.css';
import {
  acceptOffers, addOffer, beginCheckout, canAccept, changeQuantity, emptyCart,
  indicativeTotal, removeItem, restoreCart, subtotal,
  type CartState, type Product,
} from './cart.js';

type Order = {
  id: string; status: string; subtotalEUR: string; total: string;
  exchangeRate: string; exchangeRateDate: string;
  items: { offerId: string; productName: string; quantity: number; unitPrice: string; lineTotal: string }[];
};
const root = document.querySelector<HTMLDivElement>('#app')!;
const storageKey = 'testwarez-cart-v1';
let storageAvailable = true;
let cart = emptyCart();
try { cart = restoreCart(sessionStorage.getItem(storageKey)); } catch { storageAvailable = false; }
let products: Product[] = [];
let catalogReady = false;
let busy = false;
let message = cart.attempt ? 'A checkout may have reached Orders. Retry the same attempt before editing the cart.' : '';
let rate: { value: string; date: string } | null = null;
let fxMessage = 'Loading indicative exchange rate…';
let order: Order | null = null;
const escape = (value: string | number) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);
const disabled = (condition: boolean) => condition ? 'disabled' : '';
const offers = () => products.flatMap((product) => product.offers);

function save(next: CartState) {
  cart = next;
  try { sessionStorage.setItem(storageKey, JSON.stringify(cart)); } catch { storageAvailable = false; }
}

function render() {
  const locked = busy || cart.attempt !== null;
  root.innerHTML = `
    <header><p class="eyebrow">TestWarez 2026 / API testing lab</p><h1>Small cart. Real boundaries.</h1>
      <p>Choose a supplier offer. Orders checks availability and calculates the final price.</p></header>
    <main>
      <p role="status">${escape(message)}</p>
      ${!storageAvailable ? '<p role="alert">Session storage is unavailable. Do not reload during an uncertain checkout; retry in this tab.</p>' : ''}
      <div class="layout">
        <section aria-labelledby="catalog-title"><div class="section-heading"><h2 id="catalog-title">Catalog</h2>
          <button data-action="refresh" ${disabled(busy)}>Refresh catalog</button></div>
          ${!catalogReady ? '<p>Catalog is not loaded. Use Refresh catalog to retry.</p>' : ''}
          ${products.map((product) => `<article><h3>${escape(product.name)}</h3><p>${escape(product.description)}</p>
            ${product.offers.map((offer) => `<div class="offer" data-testid="${escape(offer.id)}">
              <div><strong>${escape(offer.supplierName)}</strong> · ${escape(offer.price)} EUR
                <small>${offer.stock ? `${escape(offer.stock)} available` : 'Unavailable'} · version ${escape(offer.version)}</small></div>
              <button data-action="add" data-id="${escape(offer.id)}" aria-label="Add ${escape(product.name)} from ${escape(offer.supplierName)}"
                ${disabled(locked || cart.review || offer.stock === 0 || cart.items.length >= 30 && !cart.items.some((item) => item.offerId === offer.id))}>Add to cart</button>
            </div>`).join('')}</article>`).join('')}
        </section>
        <section aria-labelledby="cart-title"><h2 id="cart-title">Your cart</h2>
          ${cart.items.length === 0 ? '<p>Your cart is empty.</p>' : ''}
          ${cart.items.map((item) => {
            const current = offers().find((offer) => offer.id === item.offerId);
            return `<article><h3>${escape(item.productName)} / ${escape(item.supplierName)}</h3>
              <p>Accepted: ${escape(item.expectedUnitPrice)} EUR · version ${escape(item.expectedOfferVersion)}</p>
              ${cart.review ? `<p class="notice">${!catalogReady ? 'Current offer could not be loaded.' : current
                ? `Current: ${escape(current.price)} EUR · version ${escape(current.version)} · ${escape(current.stock)} available`
                : 'Offer no longer available. Remove this item.'}</p>` : ''}
              <label>Quantity for ${escape(item.productName)} from ${escape(item.supplierName)}
                <input type="number" min="1" max="100" step="1" data-id="${escape(item.offerId)}" value="${item.quantity}" ${disabled(locked)} /></label>
              <button data-action="remove" data-id="${escape(item.offerId)}" ${disabled(locked)}>Remove ${escape(item.productName)} from ${escape(item.supplierName)}</button>
            </article>`;
          }).join('')}
          <p>Accepted subtotal: <strong>${escape(subtotal(cart.items))} EUR</strong></p>
          <p data-testid="indicative-total">${rate ? `Indicative total: ${escape(indicativeTotal(subtotal(cart.items), rate.value))} PLN` : 'Indicative PLN total unavailable'}</p>
          <small>${escape(fxMessage)}. Not a final quote; Orders obtains its own rate.</small>
          ${cart.review ? `<div class="notice"><p>Offers need review. Adjust quantities or remove unavailable items, then explicitly accept current offers. No order is retried automatically.</p>
            <button data-action="accept" ${disabled(busy || !catalogReady || !canAccept(cart, offers()))}>Accept current offers</button></div>` : ''}
          <button class="primary" data-action="checkout" ${disabled(busy || cart.review || cart.items.length === 0)}>${cart.attempt ? 'Retry same checkout' : 'Place order'}</button>
        </section>
      </div>
      ${order ? `<section aria-labelledby="confirmation-title" class="confirmation"><h2 id="confirmation-title">Order confirmed</h2>
        <p>Order ${escape(order.id)} · ${escape(order.status)}</p>
        <ul>${order.items.map((item) => `<li>${escape(item.productName)} × ${escape(item.quantity)} · ${escape(item.lineTotal)} EUR</li>`).join('')}</ul>
        <p>Final total from Orders: <strong>${escape(order.total)} PLN</strong></p>
        <p>Subtotal ${escape(order.subtotalEUR)} EUR · NBP ${escape(order.exchangeRate)} (${escape(order.exchangeRateDate)})</p></section>` : ''}
    </main><footer>Educational local demo · No payment or stock reservation</footer>`;
}

async function loadCatalog() {
  catalogReady = false;
  const response = await fetch('/api/products/products', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Catalog could not be loaded. Use Refresh catalog to retry.');
  products = await response.json() as Product[];
  catalogReady = true;
}

async function refreshCatalog() {
  busy = true;
  render();
  try { await loadCatalog(); }
  catch { message = 'Catalog could not be loaded. Use Refresh catalog to retry.'; }
  finally { busy = false; render(); }
}

async function loadRate() {
  try {
    // Direct cross-origin browser request, including in E2E (to the HTTP mock).
    const response = await fetch(import.meta.env.VITE_INDICATIVE_FX_URL, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('FX unavailable');
    const data = await response.json();
    const quote = data.rates?.[0];
    if (data.code !== 'EUR' || typeof quote?.mid !== 'number' || !Number.isFinite(quote.mid) || quote.mid <= 0
      || typeof quote.effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(quote.effectiveDate)) throw new Error('Invalid FX');
    rate = { value: String(quote.mid), date: quote.effectiveDate };
    fxMessage = `Indicative NBP EUR/PLN ${rate.value} (${rate.date})`;
  } catch { fxMessage = 'Indicative FX unavailable; checkout can still use Orders’ independent rate'; }
  render();
}

async function checkout() {
  if (busy || cart.review || cart.items.length === 0) return;
  save(beginCheckout(cart, crypto.randomUUID()));
  const attempt = cart.attempt!;
  busy = true;
  message = 'Submitting checkout…';
  render();
  try {
    const response = await fetch('/api/orders/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.key },
      body: JSON.stringify({ items: attempt.items }), signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    if (response.status === 201) {
      order = body as Order;
      save(emptyCart());
      message = 'Checkout completed. The confirmation shows the authoritative Orders snapshot.';
    } else if (response.status === 409) {
      // Refresh is not acceptance. Keep the old expectations until the user
      // presses Accept current offers, then separately presses Place order.
      save({ ...cart, attempt: null, review: true });
      message = `${body.code}: ${body.message}. Review current offers before placing another order.`;
      try { await loadCatalog(); } catch { message += ' Refresh failed; use Refresh catalog to retry.'; }
    } else if (response.status === 400) {
      save({ ...cart, attempt: null });
      message = 'Orders rejected the request. Check the cart before trying again.';
    } else {
      message = 'Checkout unavailable. Retry the same checkout; its key and payload are retained.';
    }
  } catch {
    // A lost response may hide a successful write. Never silently rotate the key.
    message = 'Checkout response was not received. Retry the same checkout before editing; it may already have succeeded.';
  } finally { busy = false; render(); }
}

root.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!button || button.disabled) return;
  const id = button.dataset.id!;
  switch (button.dataset.action) {
    case 'refresh': void refreshCatalog(); return;
    case 'add': {
      const offer = offers().find((candidate) => candidate.id === id);
      if (offer) save(addOffer(cart, offer));
      break;
    }
    case 'remove': save(removeItem(cart, id)); break;
    case 'accept':
      if (!catalogReady || !canAccept(cart, offers())) return;
      save(acceptOffers(cart, offers()));
      message = 'Current offers accepted. Press Place order to submit the revised cart.';
      break;
    case 'checkout': void checkout(); return;
  }
  render();
});
root.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.matches('input[data-id]')) {
    save(changeQuantity(cart, input.dataset.id!, input.valueAsNumber));
    render();
  }
});
render();
void refreshCatalog();
void loadRate();
