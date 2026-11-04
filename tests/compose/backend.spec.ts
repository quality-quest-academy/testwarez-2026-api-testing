import { expect } from '@playwright/test';
import { readCart } from '../scenarios/cart.js';
import { test } from './fixtures.js';

const headers = { 'Idempotency-Key': 'compose-checkout-0001' };

test('multi-item checkout', async ({ request, products, orders }) => {
  const cart = await readCart(request, products);
  expect(cart.items).toEqual([
    { offerId: 'offer-101', quantity: 2, expectedUnitPrice: '89.00', expectedOfferVersion: 3 },
    { offerId: 'offer-205', quantity: 1, expectedUnitPrice: '35.00', expectedOfferVersion: 2 },
  ]);
  const response = await request.post(`${orders}/orders`, { headers, data: cart });
  expect(response.status()).toBe(201);
  const order = await response.json();
  expect(order).toEqual({
    id: expect.any(String), status: 'CREATED', currency: 'PLN', createdAt: expect.any(String),
    subtotalEUR: '213.00', exchangeRate: '4.3000', exchangeRateDate: '2026-10-21', total: '915.91',
    items: [
      { offerId: 'offer-101', productName: 'Demo keyboard', quantity: 2, unitPrice: '89.00', currency: 'EUR', lineTotal: '178.00' },
      { offerId: 'offer-205', productName: 'Demo mouse', quantity: 1, unitPrice: '35.00', currency: 'EUR', lineTotal: '35.00' },
    ],
  });
  expect(response.headers().location).toBe(`/orders/${order.id}`);
  const history = await request.get(`${orders}${response.headers().location}`);
  expect(history.status()).toBe(200);
  expect(await history.json()).toEqual(order);
});

for (const change of ['price and version', 'version only'] as const) {
  test(`stale ${change} requires explicit reconfirmation`, async ({ request, products, orders }) => {
    const cart = await readCart(request, products);
    expect(cart.items[1]).toMatchObject({ expectedUnitPrice: '35.00', expectedOfferVersion: 2 });
    const price = change === 'version only' ? '35.00' : '36.00';
    const update = await request.patch(`${products}/offers/offer-205`, {
      data: change === 'version only' ? { stock: 11 } : { price },
    });
    expect(update.status()).toBe(200);
    expect(await update.json()).toMatchObject({ price, version: 3 });
    const rejected = await request.post(`${orders}/orders`, { headers, data: cart });
    expect(rejected.status()).toBe(409);
    expect(await rejected.json()).toEqual({
      code: 'OFFER_CHANGED', message: 'Reconfirm current offer prices and versions',
      changes: [{ offerId: 'offer-205', expectedUnitPrice: '35.00', expectedOfferVersion: 2,
        currentUnitPrice: price, currentOfferVersion: 3 }],
    });
    const reconfirmed = await readCart(request, products);
    const retry = await request.post(`${orders}/orders`, { headers, data: reconfirmed });
    expect(retry.status()).toBe(201);
    expect(await retry.json()).toMatchObject({
      subtotalEUR: change === 'version only' ? '213.00' : '214.00',
      total: change === 'version only' ? '915.90' : '920.20',
      exchangeRate: '4.3000', exchangeRateDate: '2026-10-21',
      items: [{ offerId: 'offer-101', unitPrice: '89.00' }, { offerId: 'offer-205', unitPrice: price }],
    });
  });
}
