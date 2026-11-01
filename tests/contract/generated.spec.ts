import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { test } from './fixtures.js';

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
    const args = [
      '--python', '3.12', '--from', 'schemathesis==4.32.7', 'schemathesis',
      '--config-file', `tests/contract/${service}.toml`,
      'run', `contracts/${service}.openapi.yaml`, '--url', apis[service],
      '--phases', 'examples,fuzzing', '--mode', 'all',
      '--workers', '1', '--seed', '2026', '--max-examples', '20',
      '--generation-database', 'none', '--request-timeout', '3',
      '--request-retries', '0', '--max-failures', '5',
      '--checks', 'not_a_server_error,status_code_conformance,content_type_conformance,response_headers_conformance,response_schema_conformance',
      '--report', 'junit,har', '--report-dir', reports, '--no-color',
    ];
    console.log(`uvx ${args.join(' ')}`);
    const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn('uvx', args, {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', CONTRACT_ORDER_ID: orderId },
      });
      let output = '';
      child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
      child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, output }));
      // Bound CLI wall time below Playwright's timeout, including tool startup.
      const timer = setTimeout(() => child.kill(), 100_000);
      child.on('close', () => clearTimeout(timer));
    });
    const log = join(reports, 'schemathesis.log');
    await writeFile(log, result.output);
    await testInfo.attach(`${service}-schemathesis.log`, { path: log, contentType: 'text/plain' });
    // Keep the console scannable; the attachment retains complete diagnostics.
    const summary = result.output.lastIndexOf('SUMMARY');
    console.log(summary < 0 ? result.output : result.output.slice(summary));
    expect(result.code, result.output).toBe(0);
  });
}
