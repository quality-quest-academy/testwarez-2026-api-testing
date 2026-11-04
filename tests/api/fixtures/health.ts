import { test as base } from '@playwright/test';
import { buildApp } from '../../../apps/orders-api/src/app.js';
import { openOrdersDatabase } from '../../../apps/orders-api/src/database.js';
import { listen, ownDatabase, withResources } from '../../helpers/resources.js';

export const test = base.extend<{ healthApi: { address: string; calls: { products: number; nbp: number } } }>({
  healthApi: async ({}, use) => withResources(async (resources) => {
    const calls = { products: 0, nbp: 0 };
    const database = ownDatabase(resources, openOrdersDatabase(':memory:'));
    const app = buildApp({
      database,
      products: { baseUrl: 'http://127.0.0.1:1', fetch: async () => { calls.products++; throw new Error('Health must not call Products'); } },
      nbp: { baseUrl: 'http://127.0.0.1:1', fetch: async () => { calls.nbp++; throw new Error('Health must not call NBP'); } },
    });
    await use({ address: await listen(resources, app, 'Orders health API'), calls });
  }),
});
