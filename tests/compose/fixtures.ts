import { test as base, type Response } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { withResources } from '../helpers/resources.js';

type Traffic = { url: string; status: number; method: string }[];

// Deliberately no imports of app factories, databases or local fixtures.
// Only the orchestrator may supply this target; missing configuration is fatal.
export const test = base.extend<{ shop: string; products: string; orders: string; traffic: Traffic }>({
  shop: async ({}, use) => {
    if (!process.env.COMPOSE_TEST_PROJECT || process.env.COMPOSE_TEST_TARGET !== 'loopback-containers') {
      throw new Error('Run npm run test:compose:system; no local fallback is allowed');
    }
    await use('http://127.0.0.1:5173');
  },
  products: async ({ shop }, use) => { await use(`${shop}/api/products`); },
  orders: async ({ shop }, use) => { await use(`${shop}/api/orders`); },
  traffic: async ({ page }, use, testInfo) => withResources(async (resources) => {
    const traffic: Traffic = [];
    const observe = (response: Response) => {
      if (response.url().includes('/api/')) traffic.push({ url: response.url(), status: response.status(), method: response.request().method() });
    };
    page.on('response', observe);
    resources.defer('browser traffic observer', () => { page.off('response', observe); });
    resources.defer('browser HTTP evidence', async () => {
      const file = testInfo.outputPath('container-browser-http.json');
      await mkdir(testInfo.outputDir, { recursive: true });
      await writeFile(file, JSON.stringify(traffic, null, 2));
      await testInfo.attach('container-browser-http.json', { path: file, contentType: 'application/json' });
    });
    await use(traffic);
  }),
});
