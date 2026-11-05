import { expect } from '@playwright/test';
import { test } from './fixtures/products.js';

test('Products health reports readiness', async ({ request, api }) => {
  const health = await request.get(`${api.address}/health`);
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });
});

test('lists a product with multiple supplier offers including an unavailable offer', async ({ request, api }) => {
  const catalog = await request.get(`${api.address}/products`);
  expect(catalog.status()).toBe(200);
  const products = await catalog.json();
  const keyboard = products.find((product: { id: string }) => product.id === 'prod-001');
  expect(keyboard?.offers).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'offer-101', supplierName: 'Alpha', stock: 8 }),
    expect.objectContaining({ id: 'offer-102', supplierName: 'Beta', stock: 0 }),
  ]));
});

test('resolves offers in requested order', async ({ request, api }) => {
  const resolved = await request.post(`${api.address}/offers/resolve`, { data: { offerIds: ['offer-205', 'offer-101'] } });
  expect(resolved.status()).toBe(200);
  expect((await resolved.json()).map((offer: { id: string }) => offer.id)).toEqual(['offer-205', 'offer-101']);
});

test('reports a missing product', async ({ request, api }) => {
  const product = await request.get(`${api.address}/products/no-such-product`);
  expect(product.status()).toBe(404);
  expect(await product.json()).toEqual({ code: 'NOT_FOUND', message: 'Product not found' });
});

test('reports missing offers without returning a partial resolution', async ({ request, api }) => {
  const resolved = await request.post(`${api.address}/offers/resolve`, { data: { offerIds: ['offer-101', 'no-such-offer'] } });
  expect(resolved.status()).toBe(404);
  expect(await resolved.json()).toEqual({ code: 'NOT_FOUND', message: 'Requested offers do not exist', offerIds: ['no-such-offer'] });
});

test('rejects duplicate offer IDs', async ({ request, api }) => {
  const response = await request.post(`${api.address}/offers/resolve`, { data: { offerIds: ['offer-101', 'offer-101'] } });
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
});

for (const [description, body] of [
  ['null stock', { stock: null }],
  ['boolean true stock', { stock: true }],
  ['boolean false stock', { stock: false }],
  ['string stock matching the current value', { stock: '8' }],
  ['string stock changing the current value', { stock: '7' }],
  ['numeric integer price', { price: 90 }],
  ['numeric decimal price', { price: 89.25 }],
  ['null price', { price: null }],
  ['boolean price', { price: true }],
  ['valid price with invalid stock', { price: '90.00', stock: null }],
  ['invalid price with valid stock', { price: 89.25, stock: 7 }],
  ['unknown property with valid stock', { stock: 7, unexpected: true }],
] as const) {
  test(`rejects ${description} without changing the persisted offer or version`, async ({ request, api }) => {
    const before = await request.get(`${api.address}/products/prod-001`);
    expect(before.status()).toBe(200);
    const product = await before.json();

    const response = await request.patch(`${api.address}/offers/offer-101`, { data: body });

    expect.soft(response.status()).toBe(400);
    expect.soft(await response.json()).toEqual({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
    const after = await request.get(`${api.address}/products/prod-001`);
    expect(after.status()).toBe(200);
    expect.soft(await after.json()).toEqual(product);
    const catalog = await request.get(`${api.address}/products`);
    expect(catalog.status()).toBe(200);
    expect.soft(await catalog.json()).toEqual(expect.arrayContaining([product]));
  });
}

test('increments an offer version only for a real price or stock change', async ({ request, api }) => {
  const unchanged = await request.patch(`${api.address}/offers/offer-101`, { data: { price: '89.00', stock: 8 } });
  expect(unchanged.status()).toBe(200);
  expect(await unchanged.json()).toMatchObject({ id: 'offer-101', version: 3, price: '89.00', stock: 8 });

  const changed = await request.patch(`${api.address}/offers/offer-101`, { data: { price: '90.00', stock: 8 } });
  expect(changed.status()).toBe(200);
  expect(await changed.json()).toMatchObject({ id: 'offer-101', version: 4, price: '90.00', stock: 8 });

  const stockChanged = await request.patch(`${api.address}/offers/offer-101`, { data: { stock: 7 } });
  expect(stockChanged.status()).toBe(200);
  expect(await stockChanged.json()).toMatchObject({ id: 'offer-101', version: 5, stock: 7 });
});

for (const [method, path] of [['POST', '/offers/resolve'], ['PATCH', '/offers/offer-101']] as const) {
  test(`malformed JSON uses the documented validation error for ${method} ${path}`, async ({ request, api }) => {
    const response = await request.fetch(`${api.address}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, data: '{',
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ code: 'VALIDATION_ERROR', message: 'Invalid request' });
  });
}
