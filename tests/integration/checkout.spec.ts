import { expect, type APIRequestContext } from '@playwright/test';
import type { CreateOrderItem } from '../../apps/orders-api/src/checkout.js';
import type { Order, OrdersDatabase } from '../../apps/orders-api/src/database.js';
import type { ProductWithOffers } from '../../apps/products-api/src/database.js';
import { test } from './fixtures.js';

// Reusing this key across tests is intentional: every test has its own database.
const headers = { 'Idempotency-Key': 'integration-checkout-0001' };

async function readCart(request: APIRequestContext, productsUrl: string) {
  const response = await request.get(`${productsUrl}/products`);
  expect(response.status()).toBe(200);
  const products: ProductWithOffers[] = await response.json();
  const offers = products.flatMap((product) => product.offers);
  // Simulate accepted expectations obtained from the public catalog, not SQL.
  const items: CreateOrderItem[] = ['offer-101', 'offer-205'].map((id, index) => {
    const offer = offers.find((candidate) => candidate.id === id);
    expect(offer, `Seeded offer ${id}`).toBeDefined();
    return {
      offerId: id, quantity: index === 0 ? 2 : 1,
      expectedUnitPrice: offer!.price, expectedOfferVersion: offer!.version,
    };
  });
  return { items };
}

// Test-only inspection of Orders' own store proves absence of partial writes.
// Neither running service is given access to the other's SQLite connection.
function expectStoredCounts(database: OrdersDatabase, count: number) {
  expect(database.connection.prepare('SELECT count(*) AS count FROM orders').get()).toEqual({ count });
  expect(database.connection.prepare('SELECT count(*) AS count FROM idempotency_records').get()).toEqual({ count });
}

test('catalog to multi-item checkout crosses both real APIs with deterministic NBP', async ({ request, backend }) => {
  expectStoredCounts(backend.database, 0);
  const cart = await readCart(request, backend.products);
  const response = await request.post(`${backend.orders}/orders`, { headers, data: cart });
  expect(response.status()).toBe(201);
  const order: Order = await response.json();
  expect(order).toEqual({
    id: expect.any(String), status: 'CREATED', currency: 'PLN', createdAt: expect.any(String),
    subtotalEUR: '213.00', exchangeRate: '4.3000', exchangeRateDate: '2026-10-21', total: '915.90',
    items: [
      { offerId: 'offer-101', productName: 'Demo keyboard', quantity: 2, unitPrice: '89.00', currency: 'EUR', lineTotal: '178.00' },
      { offerId: 'offer-205', productName: 'Demo mouse', quantity: 1, unitPrice: '35.00', currency: 'EUR', lineTotal: '35.00' },
    ],
  });
  expect(response.headers().location).toBe(`/orders/${order.id}`);
  expect(backend.calls).toEqual({ products: 1, nbp: 1 });
  expectStoredCounts(backend.database, 1);

  const history = await request.get(`${backend.orders}${response.headers().location}`);
  expect(history.status()).toBe(200);
  expect(await history.json()).toEqual(order);
  expect(backend.calls).toEqual({ products: 1, nbp: 1 });
});

for (const change of ['price and version', 'version only'] as const) {
  test(`rejects changed ${change} from Products until the cart is explicitly reconfirmed`, async ({ request, backend }) => {
    expectStoredCounts(backend.database, 0);
    const cart = await readCart(request, backend.products);
    expect(cart.items[1]).toMatchObject({ expectedUnitPrice: '35.00', expectedOfferVersion: 2 });

    // Change only the second offer through the real demo administration API.
    // A stock-only change keeps the price but must still invalidate the version.
    const update = await request.patch(`${backend.products}/offers/offer-205`, {
      data: change === 'version only' ? { stock: 11 } : { price: '36.00' },
    });
    expect(update.status()).toBe(200);
    const currentPrice = change === 'version only' ? '35.00' : '36.00';
    expect(await update.json()).toMatchObject({ id: 'offer-205', price: currentPrice, version: 3 });

    const rejected = await request.post(`${backend.orders}/orders`, { headers, data: cart });
    expect(rejected.status()).toBe(409);
    expect(await rejected.json()).toEqual({
      code: 'OFFER_CHANGED', message: 'Reconfirm current offer prices and versions',
      changes: [{
        offerId: 'offer-205', expectedUnitPrice: '35.00', expectedOfferVersion: 2,
        currentUnitPrice: currentPrice, currentOfferVersion: 3,
      }],
    });
    expect(backend.calls).toEqual({ products: 1, nbp: 0 });
    expectStoredCounts(backend.database, 0);

    // Re-fetch and explicitly accept current expectations. The failed attempt
    // retained no successful key, so this corrected cart can reuse it.
    const reconfirmed = await readCart(request, backend.products);
    const retry = await request.post(`${backend.orders}/orders`, { headers, data: reconfirmed });
    expect(retry.status()).toBe(201);
    expect(await retry.json()).toMatchObject({
      subtotalEUR: change === 'version only' ? '213.00' : '214.00',
      exchangeRate: '4.3000', exchangeRateDate: '2026-10-21',
      total: change === 'version only' ? '915.90' : '920.20',
      items: [
        { offerId: 'offer-101', unitPrice: '89.00', lineTotal: '178.00' },
        { offerId: 'offer-205', unitPrice: currentPrice, lineTotal: currentPrice },
      ],
    });
    expect(backend.calls).toEqual({ products: 2, nbp: 1 });
    expectStoredCounts(backend.database, 1);
  });
}
