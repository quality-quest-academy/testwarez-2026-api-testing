import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test as base } from 'vitest';
import { openProductsDatabase } from '../../../apps/products-api/src/database.js';
import { openOrdersDatabase } from '../../../apps/orders-api/src/database.js';
import { ownDatabase, temporaryDirectory, withResources, type TestResources } from '../../helpers/resources.js';

function databaseFixtures(resources: TestResources) {
  return {
    openProducts: (filename = ':memory:') => ownDatabase(resources, openProductsDatabase(filename)),
    openOrders: (filename = ':memory:') => ownDatabase(resources, openOrdersDatabase(filename)),
    async filename(prefix: string) {
      return join(await temporaryDirectory(resources, prefix), 'database.db');
    },
    openLegacy(filename: string) {
      const database = new DatabaseSync(filename);
      resources.defer('legacy SQLite database', () => { if (database.isOpen) database.close(); });
      return database;
    },
  };
}

export const it = base.extend<{ databases: ReturnType<typeof databaseFixtures> }>({
  databases: async ({}, use) => withResources(async (resources) => use(databaseFixtures(resources))),
});
