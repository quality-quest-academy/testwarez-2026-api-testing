import { join } from 'node:path';
import { test as base } from '@playwright/test';
import { buildApp } from '../../../apps/products-api/src/app.js';
import { openProductsDatabase } from '../../../apps/products-api/src/database.js';
import { listen, ownDatabase, temporaryDirectory, withResources } from '../../helpers/resources.js';

export const test = base.extend<{ api: { address: string } }>({
  api: async ({}, use) => withResources(async (resources) => {
    const directory = await temporaryDirectory(resources, 'testwarez-products-api-');
    const database = ownDatabase(resources, openProductsDatabase(join(directory, 'products.db')));
    const address = await listen(resources, buildApp({ database }), 'Products API');
    await use({ address });
  }),
});
