import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { expect, test as base } from '@playwright/test';
import { buildApp } from '../../apps/orders-api/src/app.js';
import { openOrdersDatabase, type Order } from '../../apps/orders-api/src/database.js';

const cart = {
  items: [
    { offerId: 'offer-101', quantity: 2, expectedUnitPrice: '89.00', expectedOfferVersion: 3 },
    { offerId: 'offer-205', quantity: 1, expectedUnitPrice: '35.00', expectedOfferVersion: 2 },
  ],
};
const headers = { 'Idempotency-Key': 'checkout-attempt-0001' };

async function startOrdersApi() {
  const directory = await mkdtemp(join(tmpdir(), 'testwarez-orders-api-'));
  const filename = join(directory, 'orders.db');
  const database = openOrdersDatabase(filename);
  const products = Fastify();
  const nbp = Fastify();
  const state = {
    productsCalls: 0,
    nbpCalls: 0,
    requestedOfferIds: [] as string[],
    mid: 4.3,
    offers: [
      { id: 'offer-101', productId: 'prod-001', productName: 'Demo keyboard', supplierId: 'supplier-alpha', supplierName: 'Alpha', price: '89.00', currency: 'EUR', stock: 8, version: 3 },
      { id: 'offer-205', productId: 'prod-002', productName: 'Demo mouse', supplierId: 'supplier-gamma', supplierName: 'Gamma', price: '35.00', currency: 'EUR', stock: 12, version: 2 },
    ],
  };
  products.post<{ Body: { offerIds: string[] } }>('/offers/resolve', (request) => {
    state.productsCalls++;
    state.requestedOfferIds = request.body.offerIds;
    return request.body.offerIds.map((id) => state.offers.find((offer) => offer.id === id));
  });
  nbp.get('/api/exchangerates/rates/a/eur/', () => {
    state.nbpCalls++;
    return { table: 'A', currency: 'euro', code: 'EUR', rates: [{ no: 'DEMO/2026', effectiveDate: '2026-10-21', mid: state.mid }] };
  });
  const app = buildApp({
    database,
    products: { baseUrl: await products.listen({ host: '127.0.0.1', port: 0 }) },
    nbp: { baseUrl: await nbp.listen({ host: '127.0.0.1', port: 0 }) },
  });
  return {
    app, state, database, filename,
    address: await app.listen({ host: '127.0.0.1', port: 0 }),
    async close() {
      await app.close();
      await products.close();
      await nbp.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

const test = base.extend<{ api: Awaited<ReturnType<typeof startOrdersApi>> }>({
  api: async ({}, use) => {
    const api = await startOrdersApi();
    try { await use(api); } finally { await api.close(); }
  },
});

test('creates a multi-item order with one batch lookup and one NBP rate', async ({ request, api }) => {
  const response = await request.post(`${api.address}/orders`, { headers, data: cart });
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
  expect(Number.isNaN(Date.parse(order.createdAt))).toBe(false);
  expect(response.headers().location).toBe(`/orders/${order.id}`);
  expect(api.state.requestedOfferIds).toEqual(['offer-101', 'offer-205']);
  expect(api.state.productsCalls).toBe(1);
  expect(api.state.nbpCalls).toBe(1);
  expect(api.database.connection.prepare('SELECT count(*) AS count FROM orders').get()).toEqual({ count: 1 });
  expect(api.state.offers.map((offer) => offer.stock)).toEqual([8, 12]);
});

test('history survives changed dependencies and reopening the private SQLite file', async ({ request, api }) => {
  const response = await request.post(`${api.address}/orders`, { headers, data: cart });
  expect(response.status()).toBe(201);
  const original: Order = await response.json();
  api.state.offers[0]!.price = '99.00';
  api.state.offers[0]!.productName = 'Renamed keyboard';
  api.state.offers[0]!.version++;
  api.state.mid = 5;
  const history = await request.get(`${api.address}${response.headers().location}`);
  expect(history.status()).toBe(200);
  expect(await history.json()).toEqual(original);
  expect(api.state.productsCalls).toBe(1);
  expect(api.state.nbpCalls).toBe(1);

  await api.app.close();
  const restarted = buildApp({
    database: openOrdersDatabase(api.filename),
    products: { baseUrl: 'http://127.0.0.1:1' }, nbp: { baseUrl: 'http://127.0.0.1:1' },
  });
  try {
    const address = await restarted.listen({ host: '127.0.0.1', port: 0 });
    const persisted = await request.get(`${address}/orders/${original.id}`);
    expect(persisted.status()).toBe(200);
    expect(await persisted.json()).toEqual(original);
  } finally { await restarted.close(); }
});

test('returns the documented 404 for unknown orders without dependency calls', async ({ request, api }) => {
  const response = await request.get(`${api.address}/orders/missing`);
  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({ code: 'NOT_FOUND', message: 'Order not found' });
  expect(api.state.productsCalls).toBe(0);
  expect(api.state.nbpCalls).toBe(0);
});

test('rounds the final total half-up, not each converted line', async ({ request, api }) => {
  api.state.offers.forEach((offer) => { offer.price = '0.01'; });
  api.state.mid = 1.25;
  const data = { items: cart.items.map((item) => ({ ...item, quantity: 1, expectedUnitPrice: '0.01' })) };
  const response = await request.post(`${api.address}/orders`, { headers, data });
  expect(response.status()).toBe(201);
  expect(await response.json()).toMatchObject({ subtotalEUR: '0.02', exchangeRate: '1.2500', total: '0.03' });
});

test('basic offer guards reject unsafe checkout before FX or persistence', async ({ request, api }) => {
  api.state.offers[0]!.price = '90.00';
  const stale = await request.post(`${api.address}/orders`, { headers, data: cart });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({
    code: 'OFFER_CHANGED',
    changes: [{ offerId: 'offer-101', expectedUnitPrice: '89.00', currentUnitPrice: '90.00' }],
  });
  api.state.offers[0]!.price = '89.00';
  api.state.offers[1]!.stock = 0;
  const unavailable = await request.post(`${api.address}/orders`, { headers, data: cart });
  expect(unavailable.status()).toBe(409);
  expect(await unavailable.json()).toMatchObject({ code: 'OFFER_UNAVAILABLE', offerIds: ['offer-205'] });
  expect(api.state.nbpCalls).toBe(0);
  expect(api.database.connection.prepare('SELECT count(*) AS count FROM orders').get()).toEqual({ count: 0 });
});

test('rejects invalid carts and keys before calling dependencies or writing orders', async ({ request, api }) => {
  const invalidBodies = [
    { items: [] },
    { items: Array.from({ length: 31 }, (_, i) => ({ ...cart.items[0], offerId: `offer-${i}` })) },
    { items: [cart.items[0], { ...cart.items[0], quantity: 1 }] },
    ...[0, 101, 1.5, '2'].map((quantity) => ({ items: [{ ...cart.items[0], quantity }] })),
    ...[89, '89.0', '-1.00'].map((expectedUnitPrice) => ({ items: [{ ...cart.items[0], expectedUnitPrice }] })),
    { items: [{ ...cart.items[0], expectedOfferVersion: 0 }] },
    { items: [{ ...cart.items[0], offerId: '' }] },
    { items: [{ ...cart.items[0], total: '0.01' }] },
    { items: cart.items, total: '0.01' },
  ];
  for (const data of invalidBodies) {
    const response = await request.post(`${api.address}/orders`, { headers, data });
    expect(response.status(), JSON.stringify(data)).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  }
  for (const key of [undefined, 'short', 'x'.repeat(129)]) {
    const response = await request.post(`${api.address}/orders`, {
      headers: key === undefined ? {} : { 'Idempotency-Key': key }, data: cart,
    });
    expect(response.status()).toBe(400);
  }
  expect(api.state.productsCalls).toBe(0);
  expect(api.state.nbpCalls).toBe(0);
  expect(api.database.connection.prepare('SELECT count(*) AS count FROM orders').get()).toEqual({ count: 0 });
});
