import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { test } from './fixtures.js';
import { runSchemathesis } from './schemathesis.js';

for (const service of ['products', 'orders'] as const) {
  test(`Schemathesis generated checks: ${service}`, async ({ apis, request }, testInfo) => {
    let orderId = '';
    if (service === 'orders') {
      const response = await request.post(`${apis.orders}/orders`, {
        headers: { 'Idempotency-Key': 'contract-seed-order-2026' },
        data: { items: [{ offerId: 'offer-101', quantity: 1, expectedUnitPrice: '89.00', expectedOfferVersion: 3 }] },
      });
      expect(response.status()).toBe(201);
      orderId = (await response.json() as { id: string }).id;
    }
    const reports = testInfo.outputPath('schemathesis');
    await mkdir(reports, { recursive: true });
    const result = await runSchemathesis({ service, url: apis[service], orderId, reports });
    const log = join(reports, 'schemathesis.log');
    await writeFile(log, result.output);
    await testInfo.attach(`${service}-schemathesis.log`, { path: log, contentType: 'text/plain' });
    // Keep the console scannable; the attachment retains complete diagnostics.
    const summary = result.output.lastIndexOf('SUMMARY');
    console.log(summary < 0 ? result.output : result.output.slice(summary));
    expect(result.code, result.output).toBe(0);
  });
}
