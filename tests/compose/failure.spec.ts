import { expect } from '@playwright/test';
import { test } from './fixtures.js';
import { ShopPage } from '../e2e/pages/shop-page.js';

// Selected only by the lifecycle verification command, never a skipped check.
test('intentional assertion failure verifies diagnostics and cleanup', async ({ page, shop }) => {
  const storefront = new ShopPage(page, shop);
  await storefront.open();
  await expect(storefront.catalogHeading).toBeVisible();
  expect('actual Compose response', 'Deliberate lifecycle probe').toBe('intentional failure');
});
