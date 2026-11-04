import { join } from 'node:path';
import { test as base } from '@playwright/test';
import { build, preview } from 'vite';
import { frontendConfig } from '../../apps/frontend/vite.config.js';
import { startBackend } from '../helpers/backend.js';
import { temporaryDirectory, withResources } from '../helpers/resources.js';

// Browser -> privately built UI -> real APIs/private SQLite -> HTTP mock NBP.
export const test = base.extend<{ shop: string }>({
  shop: async ({}, use) => withResources(async (resources) => {
    const directory = await temporaryDirectory(resources, 'testwarez-browser-');
    const { products, orders, nbp } = await startBackend(resources, directory);
    const config = {
      ...frontendConfig({ products, orders, indicativeFx: `${nbp}/api/exchangerates/rates/a/eur/` }),
      configFile: false as const,
      build: { outDir: join(directory, 'frontend'), emptyOutDir: true },
    };
    // No interception hides checkout or direct-browser mock CORS behaviour.
    await build(config);
    const frontend = await preview({ ...config,
      preview: { ...config.preview, host: '127.0.0.1', port: 0, strictPort: false },
    });
    resources.defer('Vite preview', () => frontend.close());
    const address = frontend.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Frontend did not bind a TCP port');
    await use(`http://127.0.0.1:${address.port}`);
  }),
});
