import { test as base } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { buildApp as buildProducts } from '../../apps/products-api/src/app.js';
import { buildApp as buildOrders } from '../../apps/orders-api/src/app.js';
import { buildNbpMock } from '../../mocks/nbp/src/app.js';

// Every test gets independent, in-memory SQLite stores and ephemeral loopback
// listeners. No environment variables, developer volumes or live NBP defaults.
export const test = base.extend<{ apis: { products: string; orders: string } }>({
  apis: async ({}, use) => {
    const apps: FastifyInstance[] = [];
    async function listen(app: FastifyInstance) {
      apps.push(app);
      return app.listen({ host: '127.0.0.1', port: 0 });
    }
    try {
      const products = await listen(buildProducts());
      const nbp = await listen(buildNbpMock());
      const orders = await listen(buildOrders({ products: { baseUrl: products }, nbp: { baseUrl: nbp } }));
      await use({ products, orders });
    } finally {
      for (const app of apps.reverse()) await app.close();
    }
  },
});
