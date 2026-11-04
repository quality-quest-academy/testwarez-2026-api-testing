import { test as base } from '@playwright/test';

// Deliberately no imports of app factories, databases or local fixtures.
// Only the orchestrator may supply this target; missing configuration is fatal.
export const test = base.extend<{ shop: string; products: string; orders: string }>({
  shop: async ({}, use) => {
    if (!process.env.COMPOSE_TEST_PROJECT || process.env.COMPOSE_TEST_TARGET !== 'loopback-containers') {
      throw new Error('Run npm run test:compose:system; no local fallback is allowed');
    }
    await use('http://127.0.0.1:5173');
  },
  products: async ({ shop }, use) => { await use(`${shop}/api/products`); },
  orders: async ({ shop }, use) => { await use(`${shop}/api/orders`); },
});
