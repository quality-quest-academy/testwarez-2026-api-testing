import { expect, test } from '@playwright/test';
import { NbpClient, NbpClientError } from '../../apps/orders-api/src/nbp-client.js';
import { buildNbpMock, type NbpMockMode } from '../../mocks/nbp/src/app.js';

async function startNbpMock(mode: NbpMockMode, timeoutDelayMs?: number) {
  const app = buildNbpMock({ mode, ...(timeoutDelayMs === undefined ? {} : { timeoutDelayMs }) });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  return {
    address,
    close: () => app.close(),
  };
}

test('retrieves the deterministic last-published EUR/PLN rate from the HTTP mock', async ({ request }) => {
  const mock = await startNbpMock('success');
  try {
    const response = await request.get(`${mock.address}/api/exchangerates/rates/a/eur/`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      table: 'A',
      currency: 'euro',
      code: 'EUR',
      rates: [{ no: 'DEMO/2026', effectiveDate: '2026-10-21', mid: 4.3 }],
    });

    const rate = await new NbpClient({ baseUrl: mock.address }).getLatestEurPlnRate();
    expect(rate).toEqual({ rate: '4.3000', effectiveDate: '2026-10-21' });
  } finally {
    await mock.close();
  }
});

test('exposes a readiness endpoint for the composed mock service', async ({ request }) => {
  const mock = await startNbpMock('success');
  try {
    const response = await request.get(`${mock.address}/health`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  } finally {
    await mock.close();
  }
});

test('reports an NBP timeout from the controlled delayed mock response', async () => {
  const mock = await startNbpMock('timeout', 100);
  try {
    await expect(new NbpClient({ baseUrl: mock.address, timeoutMs: 10 }).getLatestEurPlnRate())
      .rejects.toMatchObject({ name: 'NbpClientError', reason: 'TIMEOUT' } satisfies Partial<NbpClientError>);
  } finally {
    await mock.close();
  }
});

test('reports an unavailable NBP upstream from the controlled 503 response', async () => {
  const mock = await startNbpMock('unavailable');
  try {
    await expect(new NbpClient({ baseUrl: mock.address }).getLatestEurPlnRate())
      .rejects.toMatchObject({ name: 'NbpClientError', reason: 'UNAVAILABLE' } satisfies Partial<NbpClientError>);
  } finally {
    await mock.close();
  }
});
