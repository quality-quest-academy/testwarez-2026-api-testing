import { test, expect } from '@playwright/test';
import { buildApp as buildProducts } from '../../apps/products-api/src/app.js';
import { buildApp as buildOrders } from '../../apps/orders-api/src/app.js';

for (const [name, buildApp] of [
  ['Products', buildProducts],
  ['Orders', buildOrders],
] as const) {
  test(`${name} skeleton boots independently without business routes`, async ({ request }) => {
    const app = buildApp();
    try {
      // Port 0 gives every test its own listener; never share mutable services.
      const address = await app.listen({ host: '127.0.0.1', port: 0 });
      const response = await request.get(`${address}/health`);
      expect(response.status()).toBe(404);
    } finally {
      await app.close();
    }
  });
}
