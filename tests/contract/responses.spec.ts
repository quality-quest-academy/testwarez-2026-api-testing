import { expect } from '@playwright/test';
import { offerBreakageCases, orderBreakageCases } from './data/response-cases.js';
import { test } from './fixtures.js';
import { responseValidator } from './response-validator.js';

test('Products response: valid offer and deliberate contract breakages', async ({ apis, request }) => {
  const response = await request.post(`${apis.products}/offers/resolve`, { data: { offerIds: ['offer-101'] } });
  expect(response.status()).toBe(200);
  const offers = await response.json() as Record<string, unknown>[];
  const validate = await responseValidator('products', '/offers/resolve', 'post', 200);
  expect(validate(offers)).toEqual([]);

  const firstOffer = offers[0];
  if (firstOffer === undefined) throw new Error('Expected Products to resolve offer-101');
  for (const { label, offer, expectedDiagnostics } of offerBreakageCases(firstOffer)) {
    await test.step(label, async () => {
      const diagnostics = validate([offer]);
      console.log(`${label}: ${diagnostics.join('\n')}`);
      for (const expected of expectedDiagnostics) expect(diagnostics.join('\n')).toContain(expected);
    });
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
  for (const { label, body, expectedDiagnostics } of orderBreakageCases(order)) {
    await test.step(label, async () => {
      const diagnostics = validate(body);
      console.log(`${label}: ${diagnostics.join('\n')}`);
      for (const expected of expectedDiagnostics) expect(diagnostics.join('\n')).toContain(expected);
    });
  }

  // Deliberately wrong arithmetic still satisfies the schema. Existing isolated
  // business tests, not this validator, must catch such an error.
  await test.step('schema-valid total can still be arithmetically wrong', async () => {
    expect(validate({ ...order, total: '0.00' })).toEqual([]);
  });
});

test('Orders response: real OFFER_CHANGED conflict conforms to the contract', async ({ apis, request }) => {
  const resolved = await request.post(`${apis.products}/offers/resolve`, { data: { offerIds: ['offer-101'] } });
  expect(resolved.status()).toBe(200);
  const [offer] = await resolved.json() as { id: string; price: string; version: number }[];
  if (offer === undefined) throw new Error('Expected Products to resolve offer-101');
  const items = [{ offerId: offer.id, quantity: 1, expectedUnitPrice: offer.price, expectedOfferVersion: offer.version }];

  // Change the real offer after accepting it, only in this test's private store.
  const updated = await request.patch(`${apis.products}/offers/${offer.id}`, { data: { price: '90.00' } });
  expect(updated.status()).toBe(200);
  const response = await request.post(`${apis.orders}/orders`, {
    headers: { 'Idempotency-Key': 'contract-offer-changed-2026' },
    data: { items },
  });
  expect(response.status()).toBe(409);
  const conflict = await response.json() as { code: string };
  expect(conflict.code).toBe('OFFER_CHANGED');
  const validate = await responseValidator('orders', '/orders', 'post', 409);
  expect(validate(conflict)).toEqual([]);
});
