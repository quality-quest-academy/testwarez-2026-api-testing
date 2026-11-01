import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/contract',
  fullyParallel: true,
  retries: 0,
  timeout: 120_000,
  reporter: 'list',
});
