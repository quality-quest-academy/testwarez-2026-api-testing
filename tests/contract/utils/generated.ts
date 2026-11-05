import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';

export async function createHistoryOrder(request: APIRequestContext, ordersUrl: string): Promise<string> {
  const response = await request.post(`${ordersUrl}/orders`, {
    headers: { 'Idempotency-Key': 'contract-seed-order-2026' },
    data: { items: [{ offerId: 'offer-101', quantity: 1, expectedUnitPrice: '89.00', expectedOfferVersion: 3 }] },
  });
  expect(response.status()).toBe(201);
  return (await response.json() as { id: string }).id;
}

export async function attachSchemathesisLog(service: string, reports: string, output: string, testInfo: TestInfo) {
  const log = join(reports, 'schemathesis.log');
  await writeFile(log, output);
  await testInfo.attach(`${service}-schemathesis.log`, { path: log, contentType: 'text/plain' });
  // Keep the console scannable; the attachment retains complete diagnostics.
  const summary = output.lastIndexOf('SUMMARY');
  console.log(summary < 0 ? output : output.slice(summary));
}
