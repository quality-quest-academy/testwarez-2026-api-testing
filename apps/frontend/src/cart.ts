import { Decimal } from 'decimal.js';

export type Offer = {
  id: string; productName: string; supplierName: string;
  price: string; currency: 'EUR'; stock: number; version: number;
};
export type Product = { id: string; name: string; description: string; offers: Offer[] };
export type CartItem = {
  offerId: string; productName: string; supplierName: string; quantity: number;
  expectedUnitPrice: string; expectedOfferVersion: number;
};
export type CheckoutItem = Pick<CartItem, 'offerId' | 'quantity' | 'expectedUnitPrice' | 'expectedOfferVersion'>;
export type Attempt = { key: string; items: CheckoutItem[] };
export type CartState = { items: CartItem[]; review: boolean; attempt: Attempt | null };

export function checkoutItems(items: CartItem[]): CheckoutItem[] {
  return items.map(({ offerId, quantity, expectedUnitPrice, expectedOfferVersion }) => ({
    offerId, quantity, expectedUnitPrice, expectedOfferVersion,
  }));
}

export function addOffer(state: CartState, offer: Offer): CartState {
  if (state.attempt || state.review || offer.stock === 0) return state;
  const existing = state.items.find((item) => item.offerId === offer.id);
  if (existing) return changeQuantity(state, offer.id, Math.min(100, offer.stock, existing.quantity + 1));
  if (state.items.length === 30) return state;
  return { ...state, items: [...state.items, {
    offerId: offer.id, productName: offer.productName, supplierName: offer.supplierName,
    quantity: 1, expectedUnitPrice: offer.price, expectedOfferVersion: offer.version,
  }] };
}

export function changeQuantity(state: CartState, id: string, quantity: number): CartState {
  if (state.attempt || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return state;
  return { ...state, items: state.items.map((item) => item.offerId === id ? { ...item, quantity } : item) };
}

export function removeItem(state: CartState, id: string): CartState {
  if (state.attempt) return state;
  const items = state.items.filter((item) => item.offerId !== id);
  return { ...state, items, review: items.length > 0 && state.review };
}

export function canAccept(state: CartState, offers: Offer[]): boolean {
  return state.review && state.items.length > 0 && state.items.every((item) => {
    const offer = offers.find((candidate) => candidate.id === item.offerId);
    return offer && offer.stock >= item.quantity;
  });
}

export function acceptOffers(state: CartState, offers: Offer[]): CartState {
  if (!canAccept(state, offers)) return state;
  return { items: state.items.map((item) => {
    const offer = offers.find((candidate) => candidate.id === item.offerId)!;
    return { ...item, expectedUnitPrice: offer.price, expectedOfferVersion: offer.version };
  }), review: false, attempt: null };
}

export function beginCheckout(state: CartState, key: string): CartState {
  if (state.review || state.items.length === 0 || state.attempt) return state;
  return { ...state, attempt: { key, items: checkoutItems(state.items) } };
}

export function subtotal(items: CartItem[]): string {
  const precision = Math.max(28, ...items.map((item) => item.expectedUnitPrice.length + 8));
  const Exact = Decimal.clone({ precision });
  return items.reduce((sum, item) => sum.plus(new Exact(item.expectedUnitPrice).times(item.quantity)), new Exact(0)).toFixed(2);
}

export function indicativeTotal(eur: string, rate: string): string {
  const Exact = Decimal.clone({ precision: Math.max(28, eur.length + rate.length + 4) });
  return new Exact(eur).times(rate).toFixed(2, Decimal.ROUND_HALF_UP);
}

export function emptyCart(): CartState { return { items: [], review: false, attempt: null }; }

// Browser storage is untrusted display state, never the order's source of truth.
// Reject malformed or inconsistent saved attempts rather than changing their payload.
export function restoreCart(raw: string | null): CartState {
  try {
    const state = JSON.parse(raw ?? 'null') as CartState;
    if (!state || !Array.isArray(state.items) || state.items.length > 30 || typeof state.review !== 'boolean') return emptyCart();
    const ids = new Set<string>();
    for (const item of state.items) {
      if (!item || typeof item.offerId !== 'string' || !item.offerId || ids.has(item.offerId)
        || typeof item.productName !== 'string' || typeof item.supplierName !== 'string'
        || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100
        || typeof item.expectedUnitPrice !== 'string' || !/^(0|[1-9]\d*)\.\d{2}$/.test(item.expectedUnitPrice)
        || !Number.isInteger(item.expectedOfferVersion) || item.expectedOfferVersion < 1) return emptyCart();
      ids.add(item.offerId);
    }
    if (state.attempt !== null && (!state.attempt || state.review || state.items.length === 0
      || typeof state.attempt.key !== 'string' || state.attempt.key.length < 8 || state.attempt.key.length > 128
      || JSON.stringify(state.attempt.items) !== JSON.stringify(checkoutItems(state.items)))) return emptyCart();
    return state;
  } catch { return emptyCart(); }
}
