import { expect } from '@playwright/test';
import { test } from './fixtures.js';
import { browserCheckout } from '../scenarios/browser-checkout.js';

test('catalog → cart → explicit conflict review → checkout → confirmation', async ({ page, request, shop, traffic }) => {
  await browserCheckout({ page, request, shop });
  expect(traffic).toContainEqual({ url: 'http://127.0.0.1:3003/api/exchangerates/rates/a/eur/', status: 200, method: 'GET' });
  expect(traffic).toContainEqual({ url: `${shop}/api/orders/orders`, status: 201, method: 'POST' });
});
