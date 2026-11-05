import { mkdir } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { test } from './fixtures.js';
import { runSchemathesis } from './schemathesis.js';
import { attachSchemathesisLog, createHistoryOrder } from './utils/generated.js';

for (const service of ['products', 'orders'] as const) {
  test(`Schemathesis generated checks: ${service}`, async ({ apis, request }, testInfo) => {
    const orderId = service === 'orders' ? await createHistoryOrder(request, apis.orders) : '';
    const reports = testInfo.outputPath('schemathesis');
    await mkdir(reports, { recursive: true });
    const result = await runSchemathesis({ service, url: apis[service], orderId, reports });
    await attachSchemathesisLog(service, reports, result.output, testInfo);
    expect(result.code, result.output).toBe(0);
  });
}
