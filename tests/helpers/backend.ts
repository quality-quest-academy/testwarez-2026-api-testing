import { join } from 'node:path';
import { buildApp as buildProducts } from '../../apps/products-api/src/app.js';
import { openProductsDatabase } from '../../apps/products-api/src/database.js';
import { buildApp as buildOrders } from '../../apps/orders-api/src/app.js';
import { openOrdersDatabase } from '../../apps/orders-api/src/database.js';
import { buildNbpMock } from '../../mocks/nbp/src/app.js';
import { listen, ownDatabase, type TestResources } from './resources.js';

// Real services communicate only by HTTP. Each caller supplies a private test
// directory; only the harness observes Orders' database and dependency counts.
export async function startBackend(resources: TestResources, directory: string) {
  const calls = { products: 0, nbp: 0 };
  const productsDatabase = ownDatabase(resources, openProductsDatabase(join(directory, 'products.db')));
  const productsApp = buildProducts({ database: productsDatabase });
  productsApp.addHook('onRequest', async (request) => {
    if (request.method === 'POST' && request.url === '/offers/resolve') calls.products++;
  });
  const products = await listen(resources, productsApp, 'Products API');
  const nbpApp = buildNbpMock();
  nbpApp.addHook('onRequest', async (request) => {
    if (request.url === '/api/exchangerates/rates/a/eur/') calls.nbp++;
  });
  const nbp = await listen(resources, nbpApp, 'NBP mock');
  const database = ownDatabase(resources, openOrdersDatabase(join(directory, 'orders.db')));
  const orders = await listen(resources, buildOrders({
    database, products: { baseUrl: products }, nbp: { baseUrl: nbp },
  }), 'Orders API');
  return { products, orders, nbp, database, calls };
}
