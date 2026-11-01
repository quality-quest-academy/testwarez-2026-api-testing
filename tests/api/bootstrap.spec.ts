import { test, expect } from '@playwright/test';
import { buildApp as buildOrders } from '../../apps/orders-api/src/app.js';

test('Orders skeleton boots independently without business routes', async ({ request }) => {
  const app = buildOrders();
  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const response = await request.get(`${address}/health`);
    expect(response.status()).toBe(404);
  } finally {
    await app.close();
  }
});
