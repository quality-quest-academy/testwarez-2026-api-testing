import { expect } from '@playwright/test';
import { test } from './fixtures.js';

test('catalog → cart → explicit conflict review → checkout → confirmation', async ({ page, request, shop }) => {
  // Defense in depth: this flow must never contact the public FX provider.
  await page.route('https://api.nbp.pl/**', (route) => route.abort());
  await page.goto(shop);
  await expect(page.getByRole('heading', { name: 'Catalog', exact: true })).toBeVisible();
  await expect(page.getByTestId('offer-102').getByRole('button')).toBeDisabled();
  await page.getByRole('button', { name: 'Add Demo keyboard from Alpha', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Quantity for Demo keyboard from Alpha', exact: true }).fill('2');
  await page.getByRole('spinbutton', { name: 'Quantity for Demo keyboard from Alpha', exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Add Demo mouse from Gamma', exact: true }).click();
  await expect(page.getByTestId('indicative-total')).toHaveText('Indicative total: 915.90 PLN');
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Quantity for Demo keyboard from Alpha', exact: true })).toHaveValue('2');
  // Test-data arrangement only: change stock/version after the shopper accepted
  // the offer. API tests already prove conflict codes and transactional writes.
  const update = await request.patch(`${shop}/api/products/offers/offer-101`, { data: { stock: 7 } });
  expect(update.ok()).toBe(true);
  let submissions = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url() === `${shop}/api/orders/orders`) submissions++;
  });
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('OFFER_CHANGED');
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeDisabled();
  await expect(page.getByText('Accepted: 89.00 EUR · version 3', { exact: true })).toBeVisible();
  await expect(page.getByText('Current: 89.00 EUR · version 4 · 7 available', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Order confirmed', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Accept current offers', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Press Place order');
  expect(submissions).toBe(1); // Refresh and acceptance are not checkout retries.
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  const confirmation = page.getByRole('region', { name: 'Order confirmed', exact: true });
  await expect(confirmation).toContainText('Final total from Orders: 915.90 PLN');
  await expect(confirmation).toContainText('Demo keyboard × 2');
  await expect(confirmation).toContainText('Demo mouse × 1');
  expect(submissions).toBe(2);
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeDisabled();
});
