import { mkdir, rm } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { MatchersV3, PactV3 } from '@pact-foundation/pact';
import { ProductsClient } from '../../apps/orders-api/src/products-client.js';
import { pactDirectory, pactFile } from './paths.js';

test('Orders generates a pact using its real Products client', async () => {
  // Pact merges interactions into existing files; start this example fresh.
  await mkdir(pactDirectory, { recursive: true });
  await rm(pactFile, { force: true });

  const pact = new PactV3({
    consumer: 'Orders',
    provider: 'Products',
    dir: pactDirectory,
    host: '127.0.0.1',
    logLevel: 'warn',
  });

  pact
    .given('offer-101 exists')
    .uponReceiving('an Orders request to resolve one offer for checkout')
    .withRequest({
      method: 'POST',
      path: '/offers/resolve',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: { offerIds: ['offer-101'] },
    })
    .willRespondWith({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      // Only fields this consumer needs, not the entire Products/OpenAPI model.
      body: [{
        id: 'offer-101',
        productName: MatchersV3.regex('^.+$', 'Demo keyboard'),
        price: MatchersV3.regex('^(0|[1-9][0-9]*)\\.[0-9]{2}$', '89.00'),
        currency: 'EUR',
        stock: MatchersV3.integer(8),
        version: MatchersV3.integer(3),
      }],
    });

  await pact.executeTest(async (mock) => {
    const client = new ProductsClient({ baseUrl: mock.url });
    expect(await client.resolveOffers(['offer-101'])).toEqual([{
      id: 'offer-101', productName: 'Demo keyboard', price: '89.00',
      currency: 'EUR', stock: 8, version: 3,
    }]);
  });
});
