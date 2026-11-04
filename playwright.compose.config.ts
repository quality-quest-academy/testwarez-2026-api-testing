import { defineConfig, devices } from '@playwright/test';

if (!process.env.COMPOSE_TEST_PROJECT || !process.env.COMPOSE_REPORT_DIR) {
  throw new Error('Compose configuration is required; use npm run test:compose:system');
}

export default defineConfig({
  testDir: './tests/compose',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  forbidOnly: true,
  outputDir: `${process.env.COMPOSE_REPORT_DIR}/results`,
  reporter: [['list'], ['junit', { outputFile: `${process.env.COMPOSE_REPORT_DIR}/junit.xml` }]],
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium' }],
});
