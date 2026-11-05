import { join } from 'node:path';
import Fastify, { type FastifyReply } from 'fastify';
import { test as base } from '@playwright/test';
import { buildApp } from '../../../apps/orders-api/src/app.js';
import { openOrdersDatabase } from '../../../apps/orders-api/src/database.js';
import { listen, ownDatabase, temporaryDirectory, withResources, type TestResources } from '../../helpers/resources.js';

type FailureMode = 'success' | 'unavailable' | 'invalid' | 'invalid-json' | 'disconnect' | 'timeout' | 'timeout-body';

function sendFailure(mode: FailureMode, reply: FastifyReply): boolean {
  switch (mode) {
    case 'success': return false;
    case 'unavailable': reply.status(503).send({ message: 'Unavailable' }); break;
    case 'invalid': reply.send({ unexpected: 'data' }); break;
    case 'invalid-json': reply.type('application/json').send('{'); break;
    case 'disconnect': reply.hijack(); reply.raw.destroy(); break;
    case 'timeout': reply.hijack(); break;
    case 'timeout-body':
      reply.hijack();
      reply.raw.writeHead(200, { 'content-type': 'application/json' });
      reply.raw.write('{'); // Client must abort unfinished body consumption.
      break;
  }
  return true;
}

async function startOrdersApi(resources: TestResources) {
  const directory = await temporaryDirectory(resources, 'testwarez-orders-api-');
  const filename = join(directory, 'orders.db');
  const state = {
    productsCalls: 0, nbpCalls: 0, requestedOfferIds: [] as string[],
    productsMode: 'success' as FailureMode, nbpMode: 'success' as FailureMode,
    productsNotFound: undefined as { code: string; offerIds: string[] } | undefined,
    mid: 4.3,
    offers: [
      { id: 'offer-101', productId: 'prod-001', productName: 'Demo keyboard', supplierId: 'supplier-alpha', supplierName: 'Alpha', price: '89.00', currency: 'EUR', stock: 8, version: 3 },
      { id: 'offer-205', productId: 'prod-002', productName: 'Demo mouse', supplierId: 'supplier-gamma', supplierName: 'Gamma', price: '35.00', currency: 'EUR', stock: 12, version: 2 },
    ],
  };
  const products = Fastify();
  // Register before route configuration or listening can throw.
  resources.defer('Products stub', () => products.close());
  products.post<{ Body: { offerIds: string[] } }>('/offers/resolve', (request, reply) => {
    state.productsCalls++;
    state.requestedOfferIds = request.body.offerIds;
    if (sendFailure(state.productsMode, reply)) return reply;
    if (state.productsNotFound !== undefined) return reply.status(404).send({ message: 'Invalid missing-offer response', ...state.productsNotFound });
    const missing = request.body.offerIds.filter((id) => !state.offers.some((offer) => offer.id === id));
    if (missing.length) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Requested offers do not exist', offerIds: missing });
    return request.body.offerIds.map((id) => state.offers.find((offer) => offer.id === id));
  });
  const productsUrl = await products.listen({ host: '127.0.0.1', port: 0 });
  const nbp = Fastify();
  resources.defer('NBP stub', () => nbp.close());
  nbp.get('/api/exchangerates/rates/a/eur/', (_request, reply) => {
    state.nbpCalls++;
    if (sendFailure(state.nbpMode, reply)) return reply;
    return { table: 'A', currency: 'euro', code: 'EUR', rates: [{ no: 'DEMO/2026', effectiveDate: '2026-10-21', mid: state.mid }] };
  });
  const nbpUrl = await nbp.listen({ host: '127.0.0.1', port: 0 });
  const database = ownDatabase(resources, openOrdersDatabase(filename));
  let app = buildApp({ database, products: { baseUrl: productsUrl, timeoutMs: 200 }, nbp: { baseUrl: nbpUrl, timeoutMs: 200 } });
  const address = await listen(resources, app, 'Orders API');
  return {
    address, state, database,
    async restart() {
      await app.close();
      const reopened = ownDatabase(resources, openOrdersDatabase(filename));
      const restarted = buildApp({
        database: reopened,
        products: { baseUrl: 'http://127.0.0.1:1' }, nbp: { baseUrl: 'http://127.0.0.1:1' },
      });
      app = restarted;
      return { address: await listen(resources, restarted, 'Restarted Orders API'), database: reopened };
    },
  };
}

export const test = base.extend<{ api: Awaited<ReturnType<typeof startOrdersApi>> }>({
  api: async ({}, use) => withResources(async (resources) => use(await startOrdersApi(resources))),
});
