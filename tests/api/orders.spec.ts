import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyReply } from 'fastify';
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

type FailureMode = 'success' | 'unavailable' | 'invalid' | 'invalid-json' | 'disconnect' | 'timeout' | 'timeout-body';

function sendFailure(mode: FailureMode, reply: FastifyReply): boolean {
  switch (mode) {
    case 'success': return false;
    case 'unavailable': reply.status(503).send({ message: 'Unavailable' }); break;
    case 'invalid': reply.send({ unexpected: 'data' }); break;
    case 'invalid-json': reply.type('application/json').send('{'); break;
    case 'disconnect': reply.hijack(); reply.raw.destroy(); break;
    case 'timeout': reply.hijack(); break;
    case 'timeout-body':
      reply.hijack();
      reply.raw.writeHead(200, { 'content-type': 'application/json' });
      reply.raw.write('{'); // Never finish: the client must abort body consumption.
      break;
  }
  return true;
}

function expectStoredCounts(database: ReturnType<typeof openOrdersDatabase>, count: number) {
  expect(database.connection.prepare('SELECT count(*) AS count FROM orders').get()).toEqual({ count });
  expect(database.connection.prepare('SELECT count(*) AS count FROM idempotency_records').get()).toEqual({ count });
}

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
    productsMode: 'success' as FailureMode,
    nbpMode: 'success' as FailureMode,
    productsNotFound: undefined as { code: string; offerIds: string[] } | undefined,
    mid: 4.3,
    offers: [
      { id: 'offer-101', productId: 'prod-001', productName: 'Demo keyboard', supplierId: 'supplier-alpha', supplierName: 'Alpha', price: '89.00', currency: 'EUR', stock: 8, version: 3 },
      { id: 'offer-205', productId: 'prod-002', productName: 'Demo mouse', supplierId: 'supplier-gamma', supplierName: 'Gamma', price: '35.00', currency: 'EUR', stock: 12, version: 2 },
    ],
  };
  products.post<{ Body: { offerIds: string[] } }>('/offers/resolve', (request, reply) => {
    state.productsCalls++;
    state.requestedOfferIds = request.body.offerIds;
    if (sendFailure(state.productsMode, reply)) return reply;
    if (state.productsNotFound !== undefined) {
      return reply.status(404).send({ message: 'Invalid missing-offer response', ...state.productsNotFound });
    }
    const missing = request.body.offerIds.filter((id) => !state.offers.some((offer) => offer.id === id));
    if (missing.length > 0) {
      return reply.status(404).send({ code: 'NOT_FOUND', message: 'Requested offers do not exist', offerIds: missing });
    }
    return request.body.offerIds.map((id) => state.offers.find((offer) => offer.id === id));
  });
  nbp.get('/api/exchangerates/rates/a/eur/', (_request, reply) => {
    state.nbpCalls++;
    if (sendFailure(state.nbpMode, reply)) return reply;
    return { table: 'A', currency: 'euro', code: 'EUR', rates: [{ no: 'DEMO/2026', effectiveDate: '2026-10-21', mid: state.mid }] };
  });
  const app = buildApp({
    database,
    products: { baseUrl: await products.listen({ host: '127.0.0.1', port: 0 }), timeoutMs: 200 },
    nbp: { baseUrl: await nbp.listen({ host: '127.0.0.1', port: 0 }), timeoutMs: 200 },
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
  expectStoredCounts(api.database, 1);
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

for (const change of ['price', 'version', 'both'] as const) {
  test(`rejects stale ${change} with reconfirmation details and allows a corrected retry`, async ({ request, api }) => {
    // Keep the first item valid: a conflict on the second must reject the whole cart.
    if (change !== 'version') api.state.offers[1]!.price = '36.00';
    if (change !== 'price') api.state.offers[1]!.version = 3;
    const current = api.state.offers[1]!;
    const stale = await request.post(`${api.address}/orders`, { headers, data: cart });
    expect(stale.status()).toBe(409);
    expect(await stale.json()).toEqual({
      code: 'OFFER_CHANGED', message: 'Reconfirm current offer prices and versions',
      changes: [{
        offerId: 'offer-205', expectedUnitPrice: '35.00', expectedOfferVersion: 2,
        currentUnitPrice: current.price, currentOfferVersion: current.version,
      }],
    });
    expect(api.state.nbpCalls).toBe(0);
    expectStoredCounts(api.database, 0);

    const data = { items: cart.items.map((item) => item.offerId === current.id
      ? { ...item, expectedUnitPrice: current.price, expectedOfferVersion: current.version } : item) };
    const retry = await request.post(`${api.address}/orders`, { headers, data });
    expect(retry.status()).toBe(201);
    expectStoredCounts(api.database, 1);
  });
}

for (const unavailable of ['insufficient stock', 'zero stock', 'missing offer'] as const) {
  test(`rejects the whole cart for ${unavailable}, retaining no successful key`, async ({ request, api }) => {
    const data = structuredClone(cart);
    if (unavailable === 'insufficient stock') {
      data.items[1]!.quantity = 13;
    } else if (unavailable === 'zero stock') {
      api.state.offers[1]!.stock = 0;
    } else {
      data.items[1]!.offerId = 'offer-missing';
    }
    const response = await request.post(`${api.address}/orders`, { headers, data });
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'OFFER_UNAVAILABLE', offerIds: [data.items[1]!.offerId] });
    expect(api.state.productsCalls).toBe(1);
    expect(api.state.nbpCalls).toBe(0);
    expectStoredCounts(api.database, 0);
    api.state.offers[1]!.stock = 12;
    const retry = await request.post(`${api.address}/orders`, { headers, data: cart });
    expect(retry.status()).toBe(201);
    expectStoredCounts(api.database, 1);
  });
}

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
  expectStoredCounts(api.database, 0);
  const retry = await request.post(`${api.address}/orders`, { headers, data: cart });
  expect(retry.status()).toBe(201);
  expectStoredCounts(api.database, 1);
});

for (const dependency of ['products', 'nbp'] as const) {
  for (const mode of ['unavailable', 'invalid', 'invalid-json', 'disconnect', 'timeout', 'timeout-body'] as const) {
    test(`${dependency} ${mode} returns 503 without writes, then succeeds with the same key`, async ({ request, api }) => {
      api.state[`${dependency}Mode`] = mode;
      const response = await request.post(`${api.address}/orders`, { headers, data: cart });
      expect(response.status()).toBe(503);
      expect(await response.json()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', message: expect.any(String) });
      expect(api.state.productsCalls).toBe(1);
      expect(api.state.nbpCalls).toBe(dependency === 'products' ? 0 : 1);
      expectStoredCounts(api.database, 0);

      api.state[`${dependency}Mode`] = 'success';
      const retry = await request.post(`${api.address}/orders`, { headers, data: cart });
      expect(retry.status()).toBe(201);
      expectStoredCounts(api.database, 1);
    });
  }
}

test('replays the original 201 body and Location without checking changed or failed dependencies', async ({ request, api }) => {
  const original = await request.post(`${api.address}/orders`, { headers, data: cart });
  expect(original.status()).toBe(201);
  const originalBody = await original.text();
  api.state.offers[0]!.price = '99.00';
  api.state.offers[1]!.stock = 0;
  api.state.mid = 5;
  api.state.productsMode = 'unavailable';
  api.state.nbpMode = 'unavailable';
  // Object key order and JSON formatting are not part of payload identity.
  const reordered = { items: cart.items.map((item) => ({
    expectedOfferVersion: item.expectedOfferVersion, expectedUnitPrice: item.expectedUnitPrice,
    quantity: item.quantity, offerId: item.offerId,
  })) };
  for (const data of [cart, JSON.stringify(reordered, null, 2), cart]) {
    const replay = await request.post(`${api.address}/orders`, {
      headers: { ...headers, 'Content-Type': 'application/json' }, data,
    });
    expect(replay.status()).toBe(201);
    expect(replay.headers().location).toBe(original.headers().location);
    expect(await replay.text()).toBe(originalBody);
  }
  expect(api.state.productsCalls).toBe(1);
  expect(api.state.nbpCalls).toBe(1);
  expectStoredCounts(api.database, 1);
});

test('maps unusable Products 404 responses to dependency failure, not offer conflict', async ({ request, api }) => {
  for (const error of [
    { code: 'NOT_FOUND', offerIds: [] },
    { code: 'NOT_FOUND', offerIds: ['unrequested-offer'] },
    { code: 'WRONG_ERROR', offerIds: ['offer-101'] },
  ]) {
    api.state.productsNotFound = error;
    const response = await request.post(`${api.address}/orders`, { headers, data: cart });
    expect(response.status()).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    expectStoredCounts(api.database, 0);
  }
  expect(api.state.nbpCalls).toBe(0);
});

for (const field of ['offerId', 'quantity', 'expectedUnitPrice', 'expectedOfferVersion', 'item order'] as const) {
  test(`rejects reused key with changed ${field} before dependency calls`, async ({ request, api }) => {
    const original = await request.post(`${api.address}/orders`, { headers, data: cart });
    expect(original.status()).toBe(201);
    const data = structuredClone(cart);
    switch (field) {
      case 'offerId': data.items[0]!.offerId = 'offer-other'; break;
      case 'quantity': data.items[0]!.quantity++; break;
      case 'expectedUnitPrice': data.items[0]!.expectedUnitPrice = '90.00'; break;
      case 'expectedOfferVersion': data.items[0]!.expectedOfferVersion++; break;
      case 'item order': data.items.reverse(); break;
    }
    const response = await request.post(`${api.address}/orders`, { headers, data });
    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'Key was already used with a different payload' });
    const replay = await request.post(`${api.address}/orders`, { headers, data: cart });
    expect(replay.status()).toBe(201);
    expect(await replay.json()).toEqual(await original.json());
    expect(api.state.productsCalls).toBe(1);
    expect(api.state.nbpCalls).toBe(1);
    expectStoredCounts(api.database, 1);
  });
}

test('a different key creates a separate order with a fresh exchange rate', async ({ request, api }) => {
  const first = await request.post(`${api.address}/orders`, { headers, data: cart });
  expect(first.status()).toBe(201);
  api.state.mid = 5;
  const second = await request.post(`${api.address}/orders`, { headers: { 'Idempotency-Key': 'checkout-attempt-0002' }, data: cart });
  expect(second.status()).toBe(201);
  expect(second.headers().location).not.toBe(first.headers().location);
  expect(await second.json()).toMatchObject({ exchangeRate: '5.0000', total: '1065.00' });
  expect(api.state.productsCalls).toBe(2);
  expect(api.state.nbpCalls).toBe(2);
  expectStoredCounts(api.database, 2);
});

test('validates malformed retries before consulting a successful key', async ({ request, api }) => {
  const original = await request.post(`${api.address}/orders`, { headers, data: cart });
  expect(original.status()).toBe(201);
  for (const data of [{ items: [] }, { items: [cart.items[0], { ...cart.items[0], quantity: 1 }] }]) {
    const response = await request.post(`${api.address}/orders`, { headers, data });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  }
  expect(api.state.productsCalls).toBe(1);
  expect(api.state.nbpCalls).toBe(1);
  expectStoredCounts(api.database, 1);
});

test('successful-key replay and changed-payload rejection survive a restart with unreachable dependencies', async ({ request, api }) => {
  const original = await request.post(`${api.address}/orders`, { headers, data: cart });
  expect(original.status()).toBe(201);
  await api.app.close();
  const database = openOrdersDatabase(api.filename);
  const restarted = buildApp({
    database,
    products: { baseUrl: 'http://127.0.0.1:1' }, nbp: { baseUrl: 'http://127.0.0.1:1' },
  });
  try {
    const address = await restarted.listen({ host: '127.0.0.1', port: 0 });
    const replay = await request.post(`${address}/orders`, { headers, data: cart });
    expect(replay.status()).toBe(201);
    expect(replay.headers().location).toBe(original.headers().location);
    expect(await replay.text()).toBe(await original.text());
    const changed = await request.post(`${address}/orders`, { headers, data: { items: [cart.items[0]] } });
    expect(changed.status()).toBe(409);
    expect(await changed.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expectStoredCounts(database, 1);
  } finally { await restarted.close(); }
});
