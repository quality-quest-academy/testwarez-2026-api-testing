import { expect } from '@playwright/test';
import { test } from './fixtures/health.js';

test('Orders health boots independently without calling dependencies', async ({ request, healthApi }) => {
  const response = await request.get(`${healthApi.address}/health`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
  expect(healthApi.calls).toEqual({ products: 0, nbp: 0 });
});
