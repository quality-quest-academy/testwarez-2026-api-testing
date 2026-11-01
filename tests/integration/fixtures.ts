import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { buildApp as buildProducts } from '../../apps/products-api/src/app.js';
import { openProductsDatabase } from '../../apps/products-api/src/database.js';
import { buildApp as buildOrders } from '../../apps/orders-api/src/app.js';
import { openOrdersDatabase, type OrdersDatabase } from '../../apps/orders-api/src/database.js';
import { buildNbpMock } from '../../mocks/nbp/src/app.js';

type Backend = {
  products: string;
  orders: string;
  database: OrdersDatabase;
  calls: { products: number; nbp: number };
};

// Test-scoped, not worker-scoped: even tests using the same offer IDs and key
// never share files, listeners or mutable state. Only the URLs cross services.
export const test = base.extend<{ backend: Backend }>({
  backend: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'testwarez-integration-'));
    const apps: FastifyInstance[] = [];
    const calls = { products: 0, nbp: 0 };
    async function listen(app: FastifyInstance) {
      apps.push(app);
      return app.listen({ host: '127.0.0.1', port: 0 });
    }
    try {
      // Opening a new Products file runs the service's deterministic seed;
      // opening a new Orders file creates empty orders/idempotency tables.
      const productsApp = buildProducts({ database: openProductsDatabase(join(directory, 'products.db')) });
      productsApp.addHook('onRequest', async (request) => {
        if (request.method === 'POST' && request.url === '/offers/resolve') calls.products++;
      });
      const products = await listen(productsApp);
      const nbpApp = buildNbpMock();
      nbpApp.addHook('onRequest', async (request) => {
        if (request.url === '/api/exchangerates/rates/a/eur/') calls.nbp++;
      });
      const nbp = await listen(nbpApp);
      const database = openOrdersDatabase(join(directory, 'orders.db'));
      const orders = await listen(buildOrders({
        database, products: { baseUrl: products }, nbp: { baseUrl: nbp },
      }));
      await use({ products, orders, database, calls });
    } finally {
      // Attempt every close even after a setup/assertion failure. App shutdown
      // owns database closure; remove only this test's private directory.
      const failures: unknown[] = [];
      for (const app of apps.reverse()) {
        try { await app.close(); } catch (error) { failures.push(error); }
      }
      await rm(directory, { recursive: true, force: true });
      if (failures.length > 0) throw new AggregateError(failures, 'Backend cleanup failed');
    }
  },
});
