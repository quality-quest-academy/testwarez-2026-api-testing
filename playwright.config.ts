import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/api',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
});
