import { test as base } from '@playwright/test';
import { buildApp as buildProducts } from '../../apps/products-api/src/app.js';
import { openProductsDatabase } from '../../apps/products-api/src/database.js';
import { buildApp as buildOrders } from '../../apps/orders-api/src/app.js';
import { openOrdersDatabase } from '../../apps/orders-api/src/database.js';
import { buildNbpMock } from '../../mocks/nbp/src/app.js';
import { listen, ownDatabase, withResources } from '../helpers/resources.js';

// Independent in-memory stores and ephemeral loopback listeners for every test.
export const test = base.extend<{ apis: { products: string; orders: string } }>({
  apis: async ({}, use) => withResources(async (resources) => {
    const productsDatabase = ownDatabase(resources, openProductsDatabase(':memory:'));
    const products = await listen(resources, buildProducts({ database: productsDatabase }), 'Products contract API');
    const nbp = await listen(resources, buildNbpMock(), 'Contract NBP mock');
    const database = ownDatabase(resources, openOrdersDatabase(':memory:'));
    const orders = await listen(resources, buildOrders({ database, products: { baseUrl: products }, nbp: { baseUrl: nbp } }), 'Orders contract API');
    await use({ products, orders });
  }),
});
