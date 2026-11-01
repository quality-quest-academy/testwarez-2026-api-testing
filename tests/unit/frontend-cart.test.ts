import { describe, expect, it } from 'vitest';
import {
  acceptOffers, addOffer, beginCheckout, canAccept, changeQuantity, checkoutItems,
  emptyCart, indicativeTotal, removeItem, restoreCart, subtotal, type Offer,
} from '../../apps/frontend/src/cart.js';

const offer: Offer = {
  id: 'offer-101', productName: 'Keyboard', supplierName: 'Alpha',
  price: '89.00', currency: 'EUR', stock: 8, version: 3,
};

describe('browser cart state (no HTTP or browser)', () => {
  it('combines the same offer, supports quantities/removal, and submits only expectations', () => {
    let state = addOffer(addOffer(emptyCart(), offer), offer);
    state = addOffer(state, { ...offer, id: 'offer-205', price: '35.00' });
    expect(state.items).toHaveLength(2);
    expect(subtotal(state.items)).toBe('213.00');
    expect(indicativeTotal('213.00', '4.3000')).toBe('915.90');
    expect(checkoutItems(state.items)[0]).toEqual({
      offerId: offer.id, quantity: 2, expectedUnitPrice: '89.00', expectedOfferVersion: 3,
    });
    expect(checkoutItems(state.items)[0]).not.toHaveProperty('total');
    expect(changeQuantity(state, offer.id, 0)).toBe(state);
    expect(changeQuantity(state, offer.id, 1.5)).toBe(state);
    expect(changeQuantity(state, offer.id, 101)).toBe(state);
    expect(removeItem(state, offer.id).items).toHaveLength(1);
    expect(addOffer(emptyCart(), { ...offer, stock: 0 }).items).toEqual([]);
  });

  it('keeps accepted price/version until an explicit acceptance of refreshed offers', () => {
    const initial = addOffer(emptyCart(), offer);
    const review = { ...initial, review: true };
    const current = { ...offer, price: '90.00', version: 4 };
    expect(beginCheckout(review, 'attempt-1234')).toBe(review);
    expect(addOffer(review, current)).toBe(review);
    expect(review.items[0]?.expectedUnitPrice).toBe('89.00');
    expect(canAccept(review, [current])).toBe(true);
    const accepted = acceptOffers(review, [current]);
    expect(accepted.review).toBe(false);
    expect(accepted.attempt).toBeNull(); // Acceptance itself never submits.
    expect(checkoutItems(accepted.items)[0]).toMatchObject({ expectedUnitPrice: '90.00', expectedOfferVersion: 4 });
    expect(beginCheckout(accepted, 'new-attempt-1234').attempt?.items).toEqual(checkoutItems(accepted.items));
  });

  it('does not accept missing/insufficient offers, even after reload; quantity correction can unblock review', () => {
    const review = { ...changeQuantity(addOffer(emptyCart(), offer), offer.id, 2), review: true };
    expect(canAccept(review, [])).toBe(false);
    expect(acceptOffers(review, [])).toBe(review);
    const limited = [{ ...offer, stock: 1, version: 4 }];
    expect(canAccept(review, limited)).toBe(false);
    const restored = restoreCart(JSON.stringify(review));
    expect(restored.review).toBe(true);
    expect(canAccept(changeQuantity(restored, offer.id, 1), limited)).toBe(true);
    expect(removeItem(restored, offer.id)).toEqual(emptyCart());
  });

  it('retains an uncertain attempt/key through reload and blocks edits or implicit key rotation', () => {
    const state = beginCheckout(addOffer(emptyCart(), offer), 'checkout-1234');
    const restored = restoreCart(JSON.stringify(state));
    expect(restored).toEqual(state);
    expect(beginCheckout(restored, 'another-key')).toBe(restored);
    expect(addOffer(restored, offer)).toBe(restored);
    expect(changeQuantity(restored, offer.id, 2)).toBe(restored);
    expect(removeItem(restored, offer.id)).toBe(restored);
  });

  it('rejects corrupt storage and saved attempts whose payload no longer matches', () => {
    for (const raw of [null, 'bad json', '{}', '{"items":[null]}']) expect(restoreCart(raw)).toEqual(emptyCart());
    const state = beginCheckout(addOffer(emptyCart(), offer), 'checkout-1234');
    const changed = { ...state, items: [{ ...state.items[0]!, quantity: 2 }] };
    expect(restoreCart(JSON.stringify(changed))).toEqual(emptyCart());
    expect(restoreCart(JSON.stringify({ ...state, items: [...state.items, ...state.items] }))).toEqual(emptyCart());
  });

  it('uses decimal arithmetic, half-up rounding and sufficient precision for indicative display', () => {
    expect(indicativeTotal('0.01', '1.5000')).toBe('0.02');
    expect(indicativeTotal('999999999999999999999999999.99', '4.3000')).toBe('4299999999999999999999999999.96');
  });
});
