import { expect } from '@playwright/test';
import { test } from './fixtures.js';
import { responseValidator } from './response-validator.js';

test('Products response: valid offer and deliberate contract breakages', async ({ apis, request }) => {
  const response = await request.post(`${apis.products}/offers/resolve`, { data: { offerIds: ['offer-101'] } });
  expect(response.status()).toBe(200);
  const offers = await response.json() as Record<string, unknown>[];
  const validate = await responseValidator('products', '/offers/resolve', 'post', 200);
  expect(validate(offers)).toEqual([]);

  const missingVersion = { ...offers[0] };
  delete missingVersion.version;
  for (const [label, offer, expected] of [
    ['numeric price', { ...offers[0], price: 89 }, '/0/price must be string'],
    ['string stock', { ...offers[0], stock: '8' }, '/0/stock must be integer'],
    ['missing version', missingVersion, 'required property'],
    ['forbidden null', { ...offers[0], productName: null }, '/0/productName must be string'],
  ] as const) {
    const diagnostics = validate([offer]);
    console.log(`${label}: ${diagnostics.join('\n')}`);
    expect(diagnostics.join('\n')).toContain(expected);
    if (label === 'missing version') expect(diagnostics.join('\n')).toContain('version');
  }
});

test('Orders response: valid snapshot, numeric total and missing required field', async ({ apis, request }) => {
  const response = await request.post(`${apis.orders}/orders`, {
    headers: { 'Idempotency-Key': 'contract-example-2026' },
    data: { items: [{ offerId: 'offer-101', quantity: 2, expectedUnitPrice: '89.00', expectedOfferVersion: 3 }] },
  });
  expect(response.status()).toBe(201);
  expect(response.headers().location).toMatch(/^\/orders\/[^/]+$/);
  const order = await response.json() as Record<string, unknown>;
  const validate = await responseValidator('orders', '/orders', 'post', 201);
  expect(validate(order)).toEqual([]);
  const numericTotal = validate({ ...order, total: 765.4 });
  console.log(numericTotal.join('\n'));
  expect(numericTotal.join('\n')).toContain('/total must be string');
  const missingDate = { ...order };
  delete missingDate.exchangeRateDate;
  const diagnostics = validate(missingDate);
  console.log(diagnostics.join('\n'));
  expect(diagnostics.join('\n')).toContain('exchangeRateDate');
  expect(diagnostics.join('\n')).toContain('required property');

  // Deliberately wrong arithmetic still satisfies the schema. Existing isolated
  // business tests, not this validator, must catch such an error.
  expect(validate({ ...order, total: '0.00' })).toEqual([]);
});
