import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build, preview, type PreviewServer } from 'vite';
import { frontendConfig } from '../../apps/frontend/vite.config.js';
import { buildApp as buildProducts } from '../../apps/products-api/src/app.js';
import { openProductsDatabase } from '../../apps/products-api/src/database.js';
import { buildApp as buildOrders } from '../../apps/orders-api/src/app.js';
import { openOrdersDatabase } from '../../apps/orders-api/src/database.js';
import { buildNbpMock } from '../../mocks/nbp/src/app.js';

// Browser -> built UI -> real HTTP APIs -> independent temporary SQLite files.
// NBP is a real HTTP mock, not a page.route replacement of checkout behavior.
export const test = base.extend<{ shop: string }>({
  shop: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'testwarez-browser-'));
    const apps: FastifyInstance[] = [];
    let frontend: PreviewServer | undefined;
    async function listen(app: FastifyInstance) {
      apps.push(app);
      return app.listen({ host: '127.0.0.1', port: 0 });
    }
    try {
      const products = await listen(buildProducts({ database: openProductsDatabase(join(directory, 'products.db')) }));
      const nbp = await listen(buildNbpMock());
      const orders = await listen(buildOrders({
        database: openOrdersDatabase(join(directory, 'orders.db')),
        products: { baseUrl: products }, nbp: { baseUrl: nbp },
      }));
      const config = {
        ...frontendConfig({ products, orders, indicativeFx: `${nbp}/api/exchangerates/rates/a/eur/` }),
        configFile: false as const,
        build: { outDir: join(directory, 'frontend'), emptyOutDir: true },
      };
      // Build privately with the direct-browser mock URL, then serve those real
      // assets. No request routing or intercepted responses conceal CORS behavior.
      await build(config);
      frontend = await preview({ ...config,
        preview: { ...config.preview, host: '127.0.0.1', port: 0, strictPort: false },
      });
      const address = frontend.httpServer.address();
      if (!address || typeof address === 'string') throw new Error('Frontend did not bind a TCP port');
      await use(`http://127.0.0.1:${address.port}`);
    } finally {
      const failures: unknown[] = [];
      if (frontend) {
        try { await new Promise<void>((resolve, reject) => frontend!.httpServer.close((error) => error ? reject(error) : resolve())); }
        catch (error) { failures.push(error); }
      }
      for (const app of apps.reverse()) {
        try { await app.close(); } catch (error) { failures.push(error); }
      }
      await rm(directory, { recursive: true, force: true });
      if (failures.length) throw new AggregateError(failures, 'Browser fixture cleanup failed');
    }
  },
});
