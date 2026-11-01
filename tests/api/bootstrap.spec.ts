import { test, expect } from '@playwright/test';
import { buildApp as buildOrders } from '../../apps/orders-api/src/app.js';

test('Orders health boots independently without calling dependencies', async ({ request }) => {
  const app = buildOrders();
  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const response = await request.get(`${address}/health`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  } finally {
    await app.close();
  }
});
