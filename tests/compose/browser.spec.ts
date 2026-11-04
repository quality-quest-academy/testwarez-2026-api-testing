import { mkdir, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { test } from './fixtures.js';
import { browserCheckout } from '../scenarios/browser-checkout.js';

test('catalog → cart → explicit conflict review → checkout → confirmation', async ({ page, request, shop }, testInfo) => {
  const traffic: { url: string; status: number; method: string }[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/')) traffic.push({ url: response.url(), status: response.status(), method: response.request().method() });
  });
  try {
    await browserCheckout({ page, request, shop });
    expect(traffic).toContainEqual({ url: 'http://127.0.0.1:3003/api/exchangerates/rates/a/eur/', status: 200, method: 'GET' });
    expect(traffic).toContainEqual({ url: `${shop}/api/orders/orders`, status: 201, method: 'POST' });
  } finally {
    const file = testInfo.outputPath('container-browser-http.json');
    await mkdir(testInfo.outputDir, { recursive: true });
    await writeFile(file, JSON.stringify(traffic, null, 2));
    await testInfo.attach('container-browser-http.json', { path: file, contentType: 'application/json' });
  }
});
