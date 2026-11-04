import { expect } from '@playwright/test';
import { test } from './fixtures.js';

// Selected only by the lifecycle verification command, never a skipped check.
test('intentional assertion failure verifies diagnostics and cleanup', async ({ page, shop }) => {
  await page.goto(shop);
  await expect(page.getByRole('heading', { name: 'Catalog', exact: true })).toBeVisible();
  expect('actual Compose response', 'Deliberate lifecycle probe').toBe('intentional failure');
});
