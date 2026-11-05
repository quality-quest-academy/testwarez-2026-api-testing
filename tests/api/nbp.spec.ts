import { expect } from '@playwright/test';
import { NbpClient, NbpClientError } from '../../apps/orders-api/src/nbp-client.js';
import { test } from './fixtures/nbp.js';

test('retrieves the deterministic last-published EUR/PLN rate from the HTTP mock', async ({ request, mock }) => {
  const response = await request.get(`${mock.address}/api/exchangerates/rates/a/eur/`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    table: 'A', currency: 'euro', code: 'EUR',
    rates: [{ no: 'DEMO/2026', effectiveDate: '2026-10-21', mid: 4.3 }],
  });

  const rate = await new NbpClient({ baseUrl: mock.address }).getLatestEurPlnRate();
  expect(rate).toEqual({ rate: '4.3000', effectiveDate: '2026-10-21' });
});

test('exposes a readiness endpoint for the composed mock service', async ({ request, mock }) => {
  const response = await request.get(`${mock.address}/health`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

test.describe('timeout response', () => {
  test.use({ mode: 'timeout', timeoutDelayMs: 100 });

  test('reports an NBP timeout from the controlled delayed mock response', async ({ mock }) => {
    await expect(new NbpClient({ baseUrl: mock.address, timeoutMs: 10 }).getLatestEurPlnRate())
      .rejects.toMatchObject({ name: 'NbpClientError', reason: 'TIMEOUT' } satisfies Partial<NbpClientError>);
  });
});

test.describe('unavailable response', () => {
  test.use({ mode: 'unavailable' });

  test('reports an unavailable NBP upstream from the controlled 503 response', async ({ mock }) => {
    await expect(new NbpClient({ baseUrl: mock.address }).getLatestEurPlnRate())
      .rejects.toMatchObject({ name: 'NbpClientError', reason: 'UNAVAILABLE' } satisfies Partial<NbpClientError>);
  });
});
